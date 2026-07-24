import { useRef, useCallback, useState } from 'react';
import { ENGINE } from '../config/exercises';

/**
 * Formati preferiti in ordine, dal più efficiente al più compatibile.
 * Safari (desktop e iOS) non supporta WebM/VP9 in MediaRecorder: usando
 * MediaRecorder.isTypeSupported() scegliamo esplicitamente il primo formato
 * che il browser dichiara di supportare, invece di affidarci a un try/catch
 * "alla cieca" che su Safari fa comunque cadere sul default del browser
 * mentre il resto del codice continua a costruire un file .webm — con il
 * rischio concreto di scaricare un file con estensione sbagliata rispetto
 * al contenuto binario reale.
 */
const TIPI_PREFERITI = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4', // fallback per Safari/iOS
];

function scegliTipoSupportato() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return null;
    }
    return TIPI_PREFERITI.find((tipo) => MediaRecorder.isTypeSupported(tipo)) || null;
}

function estensioneDaTipo(tipo) {
    if (tipo && tipo.startsWith('video/mp4')) return 'mp4';
    return 'webm';
}

export function useVideoRecorder(canvasRef, setIsRecording) {
    const registratoreRef = useRef(null);
    const pezziVideoRef = useRef([]);
    const vuoleSalvareRef = useRef(true);
    const tipoScelroRef = useRef(null);

    // Video pronto per essere scaricato, in attesa di conferma dall'utente.
    // NB: niente più window.confirm(). Su Safari/iOS un dialog nativo chiamato
    // da un callback asincrono come onstop (fuori da un gesture context
    // "fresco") può essere silenziosamente bloccato e restituire false senza
    // mai apparire a schermo — con il rischio di perdere la registrazione
    // senza alcun avviso. Il banner di conferma viene invece renderizzato in
    // App.jsx come componente React normale, non bloccante.
    const [pendingRecording, setPendingRecording] = useState(null);

    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;

        const flusso = canvasRef.current.captureStream(30);
        const tipoSupportato = scegliTipoSupportato();
        tipoScelroRef.current = tipoSupportato;

        try {
            registratoreRef.current = tipoSupportato
                ? new MediaRecorder(flusso, { mimeType: tipoSupportato, videoBitsPerSecond: ENGINE.RECORDING_BITRATE })
                : new MediaRecorder(flusso, { videoBitsPerSecond: ENGINE.RECORDING_BITRATE });
        } catch {
            // Ultima spiaggia: nessuna opzione esplicita, il browser sceglie da sé
            // sia il formato che il bitrate.
            registratoreRef.current = new MediaRecorder(flusso);
            tipoScelroRef.current = null;
        }

        registratoreRef.current.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                pezziVideoRef.current.push(e.data);
            }
        };

        registratoreRef.current.onstop = () => {
            if (vuoleSalvareRef.current && pezziVideoRef.current.length > 0) {
                const tipoEffettivo = tipoScelroRef.current || registratoreRef.current?.mimeType || 'video/webm';
                const tipoPulito = tipoEffettivo.split(';')[0];
                const fileVideo = new Blob(pezziVideoRef.current, { type: tipoPulito });
                const estensione = estensioneDaTipo(tipoEffettivo);
                const nomeFile = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.${estensione}`;

                setPendingRecording({ blob: fileVideo, filename: nomeFile });
            }

            pezziVideoRef.current = [];
        };

        registratoreRef.current.start();
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    const stopRecording = useCallback((salvaVideo = true) => {
        if (registratoreRef.current && registratoreRef.current.state === "recording") {
            vuoleSalvareRef.current = salvaVideo;
            registratoreRef.current.stop();
            setIsRecording(false);
        }
    }, [setIsRecording]);

    const confermaDownload = useCallback(() => {
        setPendingRecording((corrente) => {
            if (!corrente) return null;

            const linkTemp = URL.createObjectURL(corrente.blob);
            const tagA = document.createElement('a');
            tagA.style.display = 'none';
            tagA.href = linkTemp;
            tagA.download = corrente.filename;

            document.body.appendChild(tagA);
            tagA.click();

            setTimeout(() => {
                document.body.removeChild(tagA);
                URL.revokeObjectURL(linkTemp);
            }, 100);

            return null;
        });
    }, []);

    const scartaRegistrazione = useCallback(() => {
        setPendingRecording(null);
    }, []);

    return { startRecording, stopRecording, pendingRecording, confermaDownload, scartaRegistrazione };
}
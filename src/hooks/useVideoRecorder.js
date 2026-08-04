import { useRef, useCallback, useState } from 'react';
import { ENGINE } from '../config/exercises';

// MODIFICA 1: VP8 e MP4 (H.264) prima di VP9 per sfruttare la codifica hardware su mobile
const TIPI_PREFERITI = [
    'video/webm;codecs=vp8',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
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
    const tipoSceltoRef = useRef(null);
    const riepilogoRef = useRef(null);

    const [pendingRecording, setPendingRecording] = useState(null);
    const pendingRecordingRef = useRef(null);

    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;

        // Mantiene il framerate del video esportato a 30 FPS fissi
        const flusso = canvasRef.current.captureStream(30);
        const tipoSupportato = scegliTipoSupportato();
        tipoSceltoRef.current = tipoSupportato;

        try {
            registratoreRef.current = tipoSupportato
                ? new MediaRecorder(flusso, { mimeType: tipoSupportato, videoBitsPerSecond: ENGINE.RECORDING_BITRATE })
                : new MediaRecorder(flusso, { videoBitsPerSecond: ENGINE.RECORDING_BITRATE });
        } catch {
            registratoreRef.current = new MediaRecorder(flusso);
            tipoSceltoRef.current = null;
        }

        registratoreRef.current.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                pezziVideoRef.current.push(e.data);
            }
        };

        registratoreRef.current.onstop = () => {
            if (vuoleSalvareRef.current && pezziVideoRef.current.length > 0) {
                const tipoEffettivo = tipoSceltoRef.current || registratoreRef.current?.mimeType || 'video/webm';
                const tipoPulito = tipoEffettivo.split(';')[0];
                const fileVideo = new Blob(pezziVideoRef.current, { type: tipoPulito });
                const estensione = estensioneDaTipo(tipoEffettivo);
                const nomeFile = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.${estensione}`;
                const registrazione = { blob: fileVideo, filename: nomeFile, riepilogo: riepilogoRef.current };
                pendingRecordingRef.current = registrazione;
                setPendingRecording(registrazione);
            }

            pezziVideoRef.current = [];
        };

        // MODIFICA 2: Rilascia un frammento di video ogni 1000 ms per evitare picchi di RAM
        registratoreRef.current.start(1000);
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    const stopRecording = useCallback((salvaVideo = true, riepilogo = null) => {
        if (registratoreRef.current && (registratoreRef.current.state === "recording" || registratoreRef.current.state === "paused")) {
            vuoleSalvareRef.current = salvaVideo;
            riepilogoRef.current = riepilogo;
            registratoreRef.current.stop();
            setIsRecording(false);
        }
    }, [setIsRecording]);

    const pausaRegistrazione = useCallback(() => {
        if (registratoreRef.current && registratoreRef.current.state === "recording") {
            registratoreRef.current.pause();
        }
    }, []);

    const riprendiRegistrazione = useCallback(() => {
        if (registratoreRef.current && registratoreRef.current.state === "paused") {
            registratoreRef.current.resume();
        }
    }, []);

    const confermaDownload = useCallback(() => {
        const corrente = pendingRecordingRef.current;
        if (!corrente) return;

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

        pendingRecordingRef.current = null;
        setPendingRecording(null);
    }, []);

    const scartaRegistrazione = useCallback(() => {
        pendingRecordingRef.current = null;
        setPendingRecording(null);
    }, []);

    return {
        startRecording,
        stopRecording,
        pendingRecording,
        confermaDownload,
        scartaRegistrazione,
        pausaRegistrazione,
        riprendiRegistrazione
    };
}
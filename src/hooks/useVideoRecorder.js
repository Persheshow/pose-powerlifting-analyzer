import { useRef, useCallback, useEffect, useState } from 'react';
import { ENGINE } from '../config/exercises';

const TIPI_PREFERITI = [
    // H.264/AVC is the most broadly hardware-accelerated format on mobile.
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4',
    'video/webm;codecs=vp8',
    'video/webm',
];

function scegliTipoSupportato() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return null;
    }
    return TIPI_PREFERITI.find((tipo) => MediaRecorder.isTypeSupported(tipo)) || null;
}

function extractVideoFormat(tipo) {
    if (tipo && tipo.startsWith('video/mp4')) return 'mp4';
    return 'webm';
}

function extractCleanMimeType(tipo) {
    return tipo?.split(';')[0] || 'video/webm';
}

export function useVideoRecorder(canvasRef, setIsRecording) {
    const registratoreRef = useRef(null);
    const sessioneRef = useRef(null);
    const montatoRef = useRef(true);

    const [pendingRecording, setPendingRecording] = useState(null);
    const pendingRecordingRef = useRef(null);

    const startRecording = useCallback(() => {
        if (!canvasRef.current) return false;
        if (sessioneRef.current || pendingRecordingRef.current) return false;

        const recordingFps = ENGINE.RECORDING_FPS || 30;
        const flusso = canvasRef.current.captureStream(recordingFps);
        const tipoSupportato = scegliTipoSupportato();
        let tipoUsato = tipoSupportato;
        let registratore;

        try {
            registratore = tipoSupportato
                ? new MediaRecorder(flusso, { mimeType: tipoSupportato, videoBitsPerSecond: ENGINE.RECORDING_BITRATE })
                : new MediaRecorder(flusso, { videoBitsPerSecond: ENGINE.RECORDING_BITRATE });
        } catch {
            try {
                registratore = new MediaRecorder(flusso);
                tipoUsato = null;
            } catch (error) {
                flusso.getTracks().forEach((track) => track.stop());
                console.error('Impossibile avviare la registrazione video:', error);
                return false;
            }
        }

        const sessione = {
            registratore,
            flusso,
            pezzi: [],
            salva: true,
            riepilogo: null,
            tipoRichiesto: tipoUsato,
        };
        registratoreRef.current = registratore;
        sessioneRef.current = sessione;

        registratore.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                sessione.pezzi.push(e.data);
            }
        };

        registratore.onstop = () => {
            if (sessione.salva && sessione.pezzi.length > 0 && montatoRef.current) {
                const tipoEffettivo = sessione.tipoRichiesto || registratore.mimeType || 'video/webm';
                const tipoPulito = extractCleanMimeType(tipoEffettivo);
                const fileVideo = new Blob(sessione.pezzi, { type: tipoPulito });
                const registrazione = { blob: fileVideo, mimeType: tipoPulito, riepilogo: sessione.riepilogo };
                pendingRecordingRef.current = registrazione;
                setPendingRecording(registrazione);
            }

            sessione.pezzi = [];
            sessione.flusso.getTracks().forEach((track) => track.stop());
            if (sessioneRef.current === sessione) {
                sessioneRef.current = null;
                registratoreRef.current = null;
            }
        };
        try {
            registratore.start(ENGINE.RECORDING_TIMESLICE_MS);
        } catch (error) {
            sessioneRef.current = null;
            registratoreRef.current = null;
            flusso.getTracks().forEach((track) => track.stop());
            console.error('Impossibile avviare la registrazione video:', error);
            return false;
        }
        setIsRecording(true);
        return true;
    }, [canvasRef, setIsRecording]);

    const stopRecording = useCallback((salvaVideo = true, riepilogo = null) => {
        const sessione = sessioneRef.current;
        if (sessione && (sessione.registratore.state === "recording" || sessione.registratore.state === "paused")) {
            sessione.salva = salvaVideo;
            sessione.riepilogo = riepilogo;
            if (sessione.registratore.state === "recording") {
                sessione.registratore.requestData();
            }
            sessione.registratore.stop();
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

        const estensione = extractVideoFormat(corrente.mimeType);
        const mimeType = corrente.mimeType || (estensione === 'mp4' ? 'video/mp4' : 'video/webm');
        const blobCondivisibile = new Blob([corrente.blob], { type: mimeType });
        const nomeFile = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.${estensione}`;
        const linkTemp = URL.createObjectURL(blobCondivisibile);
        const tagA = document.createElement('a');
        tagA.style.display = 'none';
        tagA.href = linkTemp;
        tagA.download = nomeFile;

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

    // A recorder may outlive the component while its final chunk is pending.
    useEffect(() => {
        montatoRef.current = true;
        return () => {
            montatoRef.current = false;
            const sessione = sessioneRef.current;
            if (sessione && sessione.registratore.state !== 'inactive') {
                sessione.salva = false;
                sessione.registratore.stop();
            }
            sessione?.flusso.getTracks().forEach((track) => track.stop());
        };
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

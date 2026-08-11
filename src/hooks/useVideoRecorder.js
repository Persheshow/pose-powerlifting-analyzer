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
    const pezziVideoRef = useRef([]);
    const vuoleSalvareRef = useRef(true);
    const tipoSceltoRef = useRef(null);
    const flussoRef = useRef(null);
    const riepilogoRef = useRef(null);

    const [pendingRecording, setPendingRecording] = useState(null);
    const pendingRecordingRef = useRef(null);

    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;
        if (registratoreRef.current && registratoreRef.current.state !== 'inactive') return;

        const recordingFps = ENGINE.RECORDING_FPS || 30;
        const flusso = canvasRef.current.captureStream(recordingFps);
        flussoRef.current = flusso;
        const tipoSupportato = scegliTipoSupportato();
        tipoSceltoRef.current = tipoSupportato;

        try {
            registratoreRef.current = tipoSupportato
                ? new MediaRecorder(flusso, { mimeType: tipoSupportato, videoBitsPerSecond: ENGINE.RECORDING_BITRATE })
                : new MediaRecorder(flusso, { videoBitsPerSecond: ENGINE.RECORDING_BITRATE });
        } catch {
            try {
                registratoreRef.current = new MediaRecorder(flusso);
                tipoSceltoRef.current = null;
            } catch (error) {
                flusso.getTracks().forEach((track) => track.stop());
                flussoRef.current = null;
                console.error('Impossibile avviare la registrazione video:', error);
                return;
            }
        }

        registratoreRef.current.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                pezziVideoRef.current.push(e.data);
            }
        };

        registratoreRef.current.onstop = () => {
            if (vuoleSalvareRef.current && pezziVideoRef.current.length > 0) {
                const tipoEffettivo = tipoSceltoRef.current || registratoreRef.current?.mimeType || 'video/webm';
                const tipoPulito = extractCleanMimeType(tipoEffettivo);
                const fileVideo = new Blob(pezziVideoRef.current, { type: tipoPulito });
                const registrazione = { blob: fileVideo, mimeType: tipoPulito, riepilogo: riepilogoRef.current };
                pendingRecordingRef.current = registrazione;
                setPendingRecording(registrazione);
            }

            pezziVideoRef.current = [];
            flussoRef.current?.getTracks().forEach((track) => track.stop());
            flussoRef.current = null;
        };
        registratoreRef.current.start(ENGINE.RECORDING_TIMESLICE_MS);
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    const stopRecording = useCallback((salvaVideo = true, riepilogo = null) => {
        if (registratoreRef.current && (registratoreRef.current.state === "recording" || registratoreRef.current.state === "paused")) {
            vuoleSalvareRef.current = salvaVideo;
            riepilogoRef.current = riepilogo;
            if (registratoreRef.current.state === "recording") {
                registratoreRef.current.requestData();
            }
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
    useEffect(() => () => {
        const registratore = registratoreRef.current;
        if (registratore && registratore.state !== 'inactive') {
            vuoleSalvareRef.current = false;
            registratore.stop();
        }
        flussoRef.current?.getTracks().forEach((track) => track.stop());
        flussoRef.current = null;
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

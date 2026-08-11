import { useRef, useCallback, useState } from 'react';
import { ENGINE } from '../config/exercises';

const TIPI_PREFERITI = [
    // H.264/AVC is the most broadly hardware-accelerated format on mobile.
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4',
    'video/webm;codecs=vp8',
    'video/webm',
];

/**
 * Determine the best supported video type for MediaRecorder.
 * @returns {string|null} - The supported type or null if none are supported.
 */
function scegliTipoSupportato() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return null;
    }
    return TIPI_PREFERITI.find((tipo) => MediaRecorder.isTypeSupported(tipo)) || null;
}

/**
 * Infer the file extension from a recorded video type.
 * @param {string|null} tipo - type reported by MediaRecorder.
 * @returns {string} - File extension to use for the downloaded file.
 */
function extractVideoFormat(tipo) {
    if (tipo && tipo.startsWith('video/mp4')) return 'mp4';
    return 'webm';
}

function extractCleanMimeType(tipo) {
    return tipo?.split(';')[0] || 'video/webm';
}

/**
 * Custom React hook that records a canvas stream and exposes recording controls.
 * @param {Object} canvasRef - React ref to the canvas element to record.
 * @param {Function} setIsRecording - Setter function to update recording state.
 * @returns {Object} - Recording control callbacks and pending recording data.
 */
export function useVideoRecorder(canvasRef, setIsRecording) {
    const registratoreRef = useRef(null);
    const pezziVideoRef = useRef([]);
    const vuoleSalvareRef = useRef(true);
    const tipoSceltoRef = useRef(null);
    const flussoRef = useRef(null);
    const riepilogoRef = useRef(null);

    const [pendingRecording, setPendingRecording] = useState(null);
    const pendingRecordingRef = useRef(null);

    /**
     * Start recording the canvas stream and begin collecting video chunks.
     */
    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;

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
        registratoreRef.current.start(ENGINE.RECORDING_TIMESLICE_MS || 1000);
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    /**
     * Stop the active recording and optionally keep the resulting video.
     * @param {boolean} salvaVideo - Whether to save the recorded file.
     * @param {Object|null} riepilogo - Optional summary metadata for the recording.
     */
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

    /**
     * Pause an in-progress recording.
     */
    const pausaRegistrazione = useCallback(() => {
        if (registratoreRef.current && registratoreRef.current.state === "recording") {
            registratoreRef.current.pause();
        }
    }, []);

    /**
     * Resume a paused recording session.
     */
    const riprendiRegistrazione = useCallback(() => {
        if (registratoreRef.current && registratoreRef.current.state === "paused") {
            registratoreRef.current.resume();
        }
    }, []);

    /**
     * Finalize and download the pending recording in its native format.
     */
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

    /**
     * Discard the pending recording without downloading it.
     */
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

import { useRef, useCallback, useState } from 'react';
import { ENGINE } from '../config/exercises';

const PREFERRED_MIME_TYPES = [
    'video/mp4',
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
];

/**
 * Determine the best supported video type for MediaRecorder.
 * @returns {string|null} - The supported type or null if none are supported.
 */
function getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return null;
    }
    return PREFERRED_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || null;
}

/**
 * Infer the file extension from a recorded video type.
 * @param {string|null} mimeType - Type reported by MediaRecorder.
 * @returns {string} - File extension to use for the downloaded file.
 */
function extractVideoFormat(mimeType) {
    if (mimeType && mimeType.startsWith('video/mp4')) return 'mp4';
    return 'webm';
}

function extractCleanMimeType(mimeType) {
    return mimeType?.split(';')[0] || 'video/webm';
}

/**
 * Custom React hook that records a canvas stream and exposes recording controls.
 * @param {Object} canvasRef - React ref to the canvas element to record.
 * @param {Function} setIsRecording - Setter function to update recording state.
 * @returns {Object} - Recording control callbacks and pending recording data.
 */
export function useVideoRecorder(canvasRef, setIsRecording) {
    const recorderRef = useRef(null);
    const videoChunksRef = useRef([]);
    const shouldSaveRef = useRef(true);
    const selectedMimeTypeRef = useRef(null);
    const streamRef = useRef(null);
    const summaryRef = useRef(null);

    const [pendingRecording, setPendingRecording] = useState(null);
    const pendingRecordingRef = useRef(null);

    /**
     * Start recording the canvas stream and begin collecting video chunks.
     */
    const startRecording = useCallback(() => {
        if (!canvasRef.current) return;

        const recordingFps = ENGINE.RECORDING_FPS || 30;
        const stream = canvasRef.current.captureStream(recordingFps);
        streamRef.current = stream;
        const supportedMimeType = getSupportedMimeType();
        selectedMimeTypeRef.current = supportedMimeType;

        try {
            recorderRef.current = supportedMimeType
                ? new MediaRecorder(stream, { mimeType: supportedMimeType, videoBitsPerSecond: ENGINE.RECORDING_BITRATE })
                : new MediaRecorder(stream, { videoBitsPerSecond: ENGINE.RECORDING_BITRATE });
        } catch {
            recorderRef.current = new MediaRecorder(stream);
            selectedMimeTypeRef.current = null;
        }

        recorderRef.current.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                videoChunksRef.current.push(event.data);
            }
        };

        recorderRef.current.onstop = () => {
            if (shouldSaveRef.current && videoChunksRef.current.length > 0) {
                const effectiveMimeType = selectedMimeTypeRef.current || recorderRef.current?.mimeType || 'video/webm';
                const cleanMimeType = extractCleanMimeType(effectiveMimeType);
                const videoBlob = new Blob(videoChunksRef.current, { type: cleanMimeType });
                const extension = extractVideoFormat(effectiveMimeType);
                const filename = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.${extension}`;
                const recording = { blob: videoBlob, filename, mimeType: cleanMimeType, summary: summaryRef.current };
                pendingRecordingRef.current = recording;
                setPendingRecording(recording);
            }

            videoChunksRef.current = [];
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
        recorderRef.current.start(ENGINE.RECORDING_TIMESLICE_MS || 1000);
        setIsRecording(true);
    }, [canvasRef, setIsRecording]);

    /**
     * Stop the active recording and optionally keep the resulting video.
     * @param {boolean} shouldSave - Whether to save the recorded file.
     * @param {Object|null} summary - Optional summary metadata for the recording.
     */
    const stopRecording = useCallback((shouldSave = true, summary = null) => {
        if (recorderRef.current && (recorderRef.current.state === "recording" || recorderRef.current.state === "paused")) {
            shouldSaveRef.current = shouldSave;
            summaryRef.current = summary;
            if (recorderRef.current.state === "recording") {
                recorderRef.current.requestData();
            }
            recorderRef.current.stop();
            setIsRecording(false);
        }
    }, [setIsRecording]);

    /**
     * Pause an in-progress recording.
     */
    const pauseRecording = useCallback(() => {
        if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.pause();
        }
    }, []);

    /**
     * Resume a paused recording session.
     */
    const resumeRecording = useCallback(() => {
        if (recorderRef.current && recorderRef.current.state === "paused") {
            recorderRef.current.resume();
        }
    }, []);

    /**
     * Finalize and download the pending recording in the chosen format.
     * @param {'mp4'|'webm'} selectedFormat - Desired format for the video download.
     */
    const confirmDownload = useCallback((selectedFormat) => {
        const recording = pendingRecordingRef.current;
        if (!recording) return;

        const effectiveFormat = extractVideoFormat(recording.mimeType);
        const extension = selectedFormat === effectiveFormat ? selectedFormat : effectiveFormat;
        const mimeType = recording.mimeType || (extension === 'mp4' ? 'video/mp4' : 'video/webm');
        const downloadableBlob = new Blob([recording.blob], { type: mimeType });
        const filename = `analisi_cinematica_${new Date().toISOString().slice(0, 10)}.${extension}`;
        const downloadUrl = URL.createObjectURL(downloadableBlob);
        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = downloadUrl;
        anchor.download = filename;

        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
            document.body.removeChild(anchor);
            URL.revokeObjectURL(downloadUrl);
        }, 100);

        pendingRecordingRef.current = null;
        setPendingRecording(null);
    }, []);

    /**
     * Discard the pending recording without downloading it.
     */
    const discardRecording = useCallback(() => {
        pendingRecordingRef.current = null;
        setPendingRecording(null);
    }, []);

    return {
        startRecording,
        stopRecording,
        pendingRecording,
        confirmDownload,
        discardRecording,
        pauseRecording,
        resumeRecording
    };
}

import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawHUD } from '../utils/canvasRenderer';
import { determinaLatoInquadrato, selectTrackedPose, smoothLandmarksCoordinates } from '../utils/poseUtils';
import { ENGINE } from '../config/exercises';

/**
 * Custom React hook that initializes MediaPipe pose tracking and updates exercise state.
 * @param {string} esercizio - Key of the exercise to track (e.g., 'SQUAT', 'DEADLIFT', 'OVERHEAD_PRESS').
 * @param {boolean} attivo - Whether the pose tracking is active.
 * @param {string} latoCamera - Camera facing mode ('user' for front camera, 'environment' for back camera).
 * @param {boolean} registrazioneAttiva - Whether recording is active (used to control inference and rendering).
 * @param {string|null} videoUrl - Optional URL of a video to use instead of the live camera feed.
 * @returns {Object} - Refs and state variables for video, canvas, loading status, tracking status, errors, rep counts, faults, angles, and a reset function.
 */
export function usePose(esercizio, attivo, latoCamera, registrazioneAttiva, videoUrl) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelloRef = useRef(null);
  const frameIdRef = useRef(null);
  const statoRepRef = useRef(createInitialState());
  const angoliPrecRef = useRef({ primary: null, secondary: null });
  const framePersiRef = useRef(0);
  const ultimoTempoVideoRef = useRef(-1);
  const smoothedLandmarksRef = useRef(null);
  const registrazioneRef = useRef(registrazioneAttiva);
  const ultimoPuntiRef = useRef(null);
  const ultimoLatoRef = useRef('LEFT');
  const latoBloccatoRef = useRef(null);
  const soggettoTracciatoRef = useRef(null);
  const ultimoBersaglioRef = useRef(false);
  const isProcessingRef = useRef(false);
  const ultimoAggiornamentoUI = useRef(0);
  const ultimoTimestampInferenza = useRef(0);
  const contatoreValideRef = useRef(0);
  const contatoreNonValideRef = useRef(0);
  const messaggioHudRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingLost, setIsTrackingLost] = useState(false);
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });

  // Reset the internal state and UI counters whenever the exercise, active status, camera side, or video URL changes.
  useEffect(() => {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    smoothedLandmarksRef.current = null;
    ultimoPuntiRef.current = null;
    latoBloccatoRef.current = null;
    soggettoTracciatoRef.current = null;
    ultimoBersaglioRef.current = false;
    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [esercizio, attivo, latoCamera, videoUrl]);

  // Update the recording reference whenever the recording status changes, and reset the state if recording starts.
  useEffect(() => {
    registrazioneRef.current = registrazioneAttiva;
    if (registrazioneAttiva) {
      reset();
      latoBloccatoRef.current = ultimoPuntiRef.current ? ultimoLatoRef.current : null;
    } else {
      latoBloccatoRef.current = null;
    }
  }, [registrazioneAttiva]);

  // Load the MediaPipe PoseLandmarker model asynchronously when the component mounts, and clean up on unmount.
  useEffect(() => {
    let componenteMontato = true;

    async function caricaModello() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/pose_landmarker_lite.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numPoses: 2,
          smoothLandmarks: true,
          minPoseDetectionConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
          minTrackingConfidence: 0.65
        });

        try {
          const dummyCanvas = document.createElement('canvas');
          dummyCanvas.width = 10;
          dummyCanvas.height = 10;
          landmarker.detectForVideo(dummyCanvas, performance.now());
        } catch (e) {
          console.warn("Warm-up non riuscito, ma modello caricato", e);
        }

        if (componenteMontato) {
          modelloRef.current = landmarker;
          setIsLoading(false);
        } else {
          landmarker.close();
        }
      } catch (err) {
        if (componenteMontato) setError('Errore caricamento modello: ' + err.message);
      }
    }
    caricaModello();
    return () => {
      componenteMontato = false;
      if (modelloRef.current) {
        modelloRef.current.close();
        modelloRef.current = null;
      }
    };
  }, []);

  // Start the camera or load the video when the component mounts or when the active status, camera side, or video URL changes.
  useEffect(() => {
    if (!attivo) return;
    const currentVideo = videoRef.current;

    if (videoUrl) {
      if (currentVideo) {
        currentVideo.srcObject = null;
        currentVideo.src = videoUrl;
        currentVideo.load();
        currentVideo.onloadeddata = () => {
          currentVideo.currentTime = 0.001;
        };
      }
      return () => {
        if (currentVideo) {
          currentVideo.pause();
          currentVideo.src = '';
        }
      };
    } else {
      async function avviaFotocamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: latoCamera,
              width: { ideal: ENGINE?.CAMERA_WIDTH_IDEAL || 640 },
              height: { ideal: ENGINE?.CAMERA_HEIGHT_IDEAL || 480 },
              frameRate: { ideal: ENGINE.RECORDING_FPS || 30, max: ENGINE.RECORDING_FPS || 30 }
            },
            audio: false,
          });
          if (currentVideo) {
            currentVideo.srcObject = stream;
            currentVideo.onloadedmetadata = () => currentVideo.play();
          }
        } catch (err) {
          setError('Impossibile accedere al sensore ottico: ' + err.message);
        }
      }
      avviaFotocamera();
      return () => {
        if (currentVideo?.srcObject) {
          currentVideo.srcObject.getTracks().forEach(t => t.stop());
          currentVideo.srcObject = null;
        }
      };
    }
  }, [attivo, latoCamera, videoUrl]);

  // Main loop
  useEffect(() => {
    if (!attivo) return;

    function registerMissingPose() {
      framePersiRef.current += 1;
      ultimoBersaglioRef.current = false;

      const trackingLostThreshold = ENGINE?.TRACKING_LOST_FRAMES || 15;
      if (framePersiRef.current === trackingLostThreshold + 1) {
        ultimoPuntiRef.current = null;
        smoothedLandmarksRef.current = null;
        soggettoTracciatoRef.current = null;
        angoliPrecRef.current = { primary: null, secondary: null };
        setAngles({ primary: null, secondary: null });
        setIsTrackingLost(true);
      }
    }

    function ciclo(timestamp) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = modelloRef.current;

      if (video && canvas && landmarker && video.readyState >= 2) {
        const isNewFrame = video.currentTime !== ultimoTempoVideoRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const specchiato = (!videoUrl && latoCamera === 'user');
        ctx.save();
        if (specchiato) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (
          isNewFrame &&
          !video.paused &&
          !isProcessingRef.current &&
          (timestamp - ultimoTimestampInferenza.current >= (ENGINE?.INTERVALLO_INFERENZA_MS || 33))
        ) {
          isProcessingRef.current = true;
          ultimoTimestampInferenza.current = timestamp;
          ultimoTempoVideoRef.current = video.currentTime;

          try {
            // MediaPipe VIDEO mode requires monotonically increasing timestamps.
            const now = performance.now();
            const risultati = landmarker.detectForVideo(video, now);

            const posaPrecedente = registrazioneRef.current ? soggettoTracciatoRef.current : null;
            const puntiGrezzi = selectTrackedPose(risultati.landmarks, posaPrecedente);

            if (puntiGrezzi) {
              framePersiRef.current = 0;
              setIsTrackingLost(false);
              soggettoTracciatoRef.current = puntiGrezzi;

              // Stabilize landmark coordinates with an exponential moving average.
              const puntiStabilizzati = smoothLandmarksCoordinates(
                puntiGrezzi,
                smoothedLandmarksRef.current,
                0.5 // smoothing factor
              );
              smoothedLandmarksRef.current = puntiStabilizzati;
              ultimoPuntiRef.current = puntiStabilizzati;

              const latoStimato = determinaLatoInquadrato(puntiStabilizzati);
              const latoRilevato = registrazioneRef.current
                ? (latoBloccatoRef.current ?? latoStimato)
                : latoStimato;
              if (registrazioneRef.current && !latoBloccatoRef.current) {
                latoBloccatoRef.current = latoRilevato;
              }
              ultimoLatoRef.current = latoRilevato;

              // Each exercise validates its own required landmarks and occlusion fallbacks.
              const esito = processFrame(esercizio, statoRepRef.current, puntiStabilizzati, latoRilevato);

              // Keep the displayed angles responsive while the user adjusts position.
              if (timestamp - ultimoAggiornamentoUI.current > 100) {
                if (Math.abs((esito.primaryAngle ?? 0) - (angoliPrecRef.current.primary ?? 0)) > 1) {
                  setAngles({ primary: esito.primaryAngle, secondary: esito.secondaryAngle });
                  angoliPrecRef.current = { primary: esito.primaryAngle, secondary: esito.secondaryAngle };
                  ultimoAggiornamentoUI.current = timestamp;
                }
              }

              // Advance the repetition state only while an analysis is active.
              if (registrazioneRef.current) {
                statoRepRef.current = esito.state;
                ultimoBersaglioRef.current = esito.isTarget;

                if (esito.event?.type === 'VALID_REP' || esito.event?.type === 'NO_REP') {
                  const isValida = esito.event.type === 'VALID_REP';
                  if (isValida) {
                    contatoreValideRef.current += 1;
                    setValidReps(contatoreValideRef.current);
                    setFaults([]);
                    messaggioHudRef.current = { type: 'VALID', text: '✓ RIPETIZIONE VALIDA', expires: performance.now() + (ENGINE?.HUD_VALID_MS || 2000) };
                  } else {
                    contatoreNonValideRef.current += 1;
                    setNoReps(contatoreNonValideRef.current);
                    setFaults(esito.event.faults);
                    messaggioHudRef.current = { type: 'INVALID', text: `NO REP: ${esito.event.faults.join(' - ')}`, expires: performance.now() + (ENGINE?.HUD_INVALID_MS || 3000) };
                  }
                }
              }
            } else {
              registerMissingPose();
            }
          } catch (err) {
            console.error("Errore durante l'inferenza MediaPipe:", err);
          } finally {
            isProcessingRef.current = false;
          }
        }

        const erroreLampeggiante = messaggioHudRef.current && performance.now() < messaggioHudRef.current.expires && messaggioHudRef.current.type === 'INVALID';

        // Keep drawing the latest available skeleton between inference frames.
        if (ultimoPuntiRef.current) {
          ctx.save();
          if (specchiato) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          drawSkeleton(ctx, ultimoPuntiRef.current, canvas.width, canvas.height, ultimoBersaglioRef.current, ultimoLatoRef.current, esercizio, erroreLampeggiante);
          ctx.restore();
        }

        drawHUD(
          ctx,
          canvas.width,
          canvas.height,
          contatoreValideRef.current,
          messaggioHudRef.current,
          isTrackingLost,
          angoliPrecRef.current.primary
        );
      }
      frameIdRef.current = requestAnimationFrame(ciclo);
    }

    frameIdRef.current = requestAnimationFrame(ciclo);
    return () => { if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current); };
  }, [esercizio, attivo, latoCamera, videoUrl, isTrackingLost]);

  /**
   * Reset the current pose tracking logical state (without clearing visual skeleton).
   */
  function reset() {
    statoRepRef.current = createInitialState();
    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;
    ultimoBersaglioRef.current = false;

    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    // Preserve the latest landmarks so the skeleton remains visible when recording starts.
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, error, validReps, noReps, faults, angles, reset };
}

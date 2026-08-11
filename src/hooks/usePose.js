import { useCallback, useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawHUD } from '../utils/canvasRenderer';
import { determinaLatoInquadrato, selectTrackedPose, smoothLandmarksCoordinates } from '../utils/poseUtils';
import { ENGINE } from '../config/exercises';

async function createPoseLandmarker() {
  // A new instance also creates a new MediaPipe temporal tracker. This is
  // required when replaying a file so results cannot inherit the previous run.
  const vision = await FilesetResolver.forVisionTasks('/wasm');
  return PoseLandmarker.createFromOptions(vision, {
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
}

/**
 * Custom React hook that initializes MediaPipe pose tracking and updates exercise state.
 * @param {string} esercizio - Key of the exercise to track (e.g., 'SQUAT', 'DEADLIFT', 'OVERHEAD_PRESS').
 * @param {boolean} attivo - Whether the pose tracking is active.
 * @param {string} latoCamera - Camera facing mode ('user' for front camera, 'environment' for back camera).
 * @param {boolean} registrazioneAttiva - Whether recording is active (used to control inference and rendering).
 * @param {string|null} videoUrl - Optional URL of a video to use instead of the live camera feed.
 * @returns {Object} - Video/canvas refs, model status, rep counts, and reset control.
 */
export function usePose(esercizio, attivo, latoCamera, registrazioneAttiva, videoUrl) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelloRef = useRef(null);
  const modelGenerationRef = useRef(0);
  const componenteMontatoRef = useRef(false);
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

  // Restore every stateful layer involved in an analysis, including filters
  // and subject continuity. Resetting only the counters is not sufficient.
  const resetTrackingState = useCallback(() => {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    ultimoTempoVideoRef.current = -1;
    smoothedLandmarksRef.current = null;
    ultimoPuntiRef.current = null;
    ultimoLatoRef.current = 'LEFT';
    latoBloccatoRef.current = null;
    soggettoTracciatoRef.current = null;
    ultimoBersaglioRef.current = false;
    isProcessingRef.current = false;
    ultimoAggiornamentoUI.current = 0;
    ultimoTimestampInferenza.current = 0;
    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;
    setValidReps(0);
    setNoReps(0);
    setIsTrackingLost(false);
  }, []);

  // Build the replacement before closing the active instance. The generation
  // token prevents a slower, obsolete async creation from becoming active.
  const replacePoseLandmarker = useCallback(async () => {
    const generation = ++modelGenerationRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const nuovoModello = await createPoseLandmarker();
      if (!componenteMontatoRef.current || generation !== modelGenerationRef.current) {
        nuovoModello.close();
        return false;
      }

      const vecchioModello = modelloRef.current;
      modelloRef.current = nuovoModello;
      vecchioModello?.close();
      setIsLoading(false);
      return true;
    } catch (err) {
      if (componenteMontatoRef.current && generation === modelGenerationRef.current) {
        setError('Errore caricamento modello: ' + err.message);
        setIsLoading(false);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    resetTrackingState();
  }, [esercizio, attivo, latoCamera, videoUrl, resetTrackingState]);

  useEffect(() => {
    let annullato = false;

    if (!registrazioneAttiva) {
      registrazioneRef.current = false;
      latoBloccatoRef.current = null;
      return;
    }

    if (!videoUrl) {
      // Live capture keeps the current landmarker and only starts a fresh FSM.
      resetTrackingState();
      registrazioneRef.current = true;
      return;
    }

    registrazioneRef.current = false;
    const video = videoRef.current;
    // Do not let the file advance while its fresh tracker is being created.
    video?.pause();
    if (video && video.readyState >= 1) video.currentTime = 0.001;
    resetTrackingState();

    async function startFreshVideoAnalysis() {
      const modelloPronto = await replacePoseLandmarker();
      if (annullato || !modelloPronto) return;
      // Clear once more after async initialization so no frame rendered while
      // loading can contaminate the new analysis.
      resetTrackingState();
      registrazioneRef.current = true;
      await videoRef.current?.play();
    }

    startFreshVideoAnalysis().catch((err) => {
      if (!annullato) setError('Errore avvio analisi video: ' + err.message);
    });

    return () => { annullato = true; };
  }, [registrazioneAttiva, videoUrl, replacePoseLandmarker, resetTrackingState]);

  useEffect(() => {
    componenteMontatoRef.current = true;
    replacePoseLandmarker();
    return () => {
      componenteMontatoRef.current = false;
      modelGenerationRef.current += 1;
      if (modelloRef.current) {
        modelloRef.current.close();
        modelloRef.current = null;
      }
    };
  }, [replacePoseLandmarker]);

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
      // getUserMedia may resolve after a camera switch or component cleanup.
      let annullato = false;
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
          if (annullato) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          if (currentVideo) {
            currentVideo.srcObject = stream;
            currentVideo.onloadedmetadata = () => {
              currentVideo.play().catch((err) => {
                if (!annullato) setError('Errore avvio fotocamera: ' + err.message);
              });
            };
          } else {
            stream.getTracks().forEach(t => t.stop());
          }
        } catch (err) {
          if (!annullato) setError('Impossibile accedere al sensore ottico: ' + err.message);
        }
      }
      avviaFotocamera();
      return () => {
        annullato = true;
        if (currentVideo?.srcObject) {
          currentVideo.srcObject.getTracks().forEach(t => t.stop());
          currentVideo.srcObject = null;
        }
      };
    }
  }, [attivo, latoCamera, videoUrl]);

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
            // All FSM durations for a file are measured on the media timeline,
            // so browser/GPU speed cannot alter grace periods or cooldowns.
            // Live capture instead uses the browser's monotonic real-time clock.
            const analysisTimestampMs = videoUrl
              ? video.currentTime * 1000
              : performance.now();
            const risultati = landmarker.detectForVideo(video, analysisTimestampMs);

            const posaPrecedente = registrazioneRef.current ? soggettoTracciatoRef.current : null;
            const puntiGrezzi = selectTrackedPose(risultati.landmarks, posaPrecedente);

            if (puntiGrezzi) {
              framePersiRef.current = 0;
              setIsTrackingLost(false);
              soggettoTracciatoRef.current = puntiGrezzi;

              const puntiStabilizzati = smoothLandmarksCoordinates(
                puntiGrezzi,
                smoothedLandmarksRef.current,
                0.5
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
              const esito = processFrame(
                esercizio,
                statoRepRef.current,
                puntiStabilizzati,
                latoRilevato,
                analysisTimestampMs
              );

              if (timestamp - ultimoAggiornamentoUI.current > 100) {
                if (Math.abs((esito.primaryAngle ?? 0) - (angoliPrecRef.current.primary ?? 0)) > 1) {
                  angoliPrecRef.current = { primary: esito.primaryAngle, secondary: esito.secondaryAngle };
                  ultimoAggiornamentoUI.current = timestamp;
                }
              }

              if (registrazioneRef.current) {
                statoRepRef.current = esito.state;
                ultimoBersaglioRef.current = esito.isTarget;

                if (esito.event?.type === 'VALID_REP' || esito.event?.type === 'NO_REP') {
                  const isValida = esito.event.type === 'VALID_REP';
                  if (isValida) {
                    contatoreValideRef.current += 1;
                    setValidReps(contatoreValideRef.current);
                    messaggioHudRef.current = { type: 'VALID', text: '✓ RIPETIZIONE VALIDA', expires: performance.now() + (ENGINE?.HUD_VALID_MS || 2000) };
                  } else {
                    contatoreNonValideRef.current += 1;
                    setNoReps(contatoreNonValideRef.current);
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

        // Inference is throttled, so reuse the last pose on intermediate frames.
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
    resetTrackingState();

    // A replay must not inherit MediaPipe's temporal tracker from the previous pass.
    if (videoUrl && registrazioneRef.current) {
      const video = videoRef.current;
      registrazioneRef.current = false;
      video?.pause();
      if (video && video.readyState >= 1) video.currentTime = 0.001;

      replacePoseLandmarker().then((modelloPronto) => {
        if (!modelloPronto) return;
        resetTrackingState();
        registrazioneRef.current = true;
        videoRef.current?.play().catch((err) => {
          setError('Errore riavvio analisi video: ' + err.message);
        });
      });
    }
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, error, validReps, noReps, reset };
}

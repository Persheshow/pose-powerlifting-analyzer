import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawHUD } from '../utils/canvasRenderer';
import { selectTrackedPose, selectTrackedSide, smoothLandmarksCoordinates } from '../utils/poseUtils';
import { ESERCIZI, ENGINE } from '../config/exercises';

/**
 * Custom React hook that initializes MediaPipe pose tracking and updates exercise state.
 * @param {string} esercizio - Key of the exercise to track (e.g., 'SQUAT', 'DEADLIFT', 'OVERHEAD_PRESS').
 * @param {boolean} attivo - Whether the pose tracking is active.
 * @param {string} latoCamera - Camera facing mode ('user' for front camera, 'environment' for back camera).
 * @param {boolean} registrazioneAttiva - Whether recording is active (used to control inference and rendering).
 * @param {string|null} videoUrl - Optional URL of a video to use instead of the live camera feed.
 * @param {number} targetReps - Valid-repetition target; zero disables automatic completion.
 * @returns {Object} - Refs and state variables for video, canvas, loading status, tracking status, errors, rep counts, faults, angles, and a reset function.
 */
export function usePose(esercizio, attivo, latoCamera, registrazioneAttiva, videoUrl, targetReps = 0) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelloRef = useRef(null);
  const frameIdRef = useRef(null);
  const statoRepRef = useRef(createInitialState());
  const primoCaricamentoRef = useRef(true);
  const angoliPrecRef = useRef({ primary: null, secondary: null });
  const framePersiRef = useRef(0);
  const ultimoTempoVideoRef = useRef(-1);
  const smoothedLandmarksRef = useRef(null);
  const drawLandmarksRef = useRef(null);
  const registrazioneRef = useRef(registrazioneAttiva);
  const ultimoPuntiRef = useRef(null);
  const ultimoLatoRef = useRef(null);
  const ultimoBersaglioRef = useRef(false);
  const isProcessingRef = useRef(false);
  const ultimoAggiornamentoUI = useRef(0);
  const ultimoTimestampInferenza = useRef(0);
  const contatoreValideRef = useRef(0);
  const contatoreNonValideRef = useRef(0);
  const messaggioHudRef = useRef(null);
  const visibilitaStabileRef = useRef({});
  const trackingPersoRef = useRef(false);
  const trackedPoseCenterRef = useRef(null);
  const targetRepsRef = useRef(targetReps);
  const targetRaggiuntoRef = useRef(false);
  const posaValidaRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isTrackingLost, setIsTrackingLost] = useState(false);
  const [error, setError] = useState(null);
  const [validReps, setValidReps] = useState(0);
  const [noReps, setNoReps] = useState(0);
  const [faults, setFaults] = useState([]);
  const [angles, setAngles] = useState({ primary: null, secondary: null });

  useEffect(() => {
    targetRepsRef.current = targetReps;
  }, [targetReps]);

  // Reset the internal state and UI counters whenever the exercise, active status, camera side, or video URL changes.
  useEffect(() => {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    smoothedLandmarksRef.current = null;
    drawLandmarksRef.current = null;
    ultimoPuntiRef.current = null;
    ultimoLatoRef.current = null;
    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;
    visibilitaStabileRef.current = {};
    trackingPersoRef.current = false;
    trackedPoseCenterRef.current = null;
    targetRaggiuntoRef.current = false;
    posaValidaRef.current = false;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [esercizio, attivo, latoCamera, videoUrl]);

  // Update the recording reference whenever the recording status changes, and reset the state if recording starts.
  useEffect(() => {
    registrazioneRef.current = registrazioneAttiva;
    if (registrazioneAttiva) reset();
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
          primoCaricamentoRef.current = false;
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
              frameRate: { ideal: 30, max: 60 }
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
            // Use performance.now() to keep the timestamp monotonic for MediaPipe.
            const now = performance.now();
            const risultati = landmarker.detectForVideo(video, now);

            const posaSelezionata = selectTrackedPose(risultati.landmarks, trackedPoseCenterRef.current);

            if (posaSelezionata) {
              framePersiRef.current = 0;
              trackingPersoRef.current = false;
              setIsTrackingLost(false);
              trackedPoseCenterRef.current = posaSelezionata.center;

              const puntiGrezzi = posaSelezionata.landmarks;

              // The validation stream uses a responsive EMA; drawing receives
              // an additional EMA below so visual smoothing cannot affect reps.
              const puntiStabilizzati = smoothLandmarksCoordinates(
                puntiGrezzi,
                smoothedLandmarksRef.current,
                0.35,
                ENGINE.LANDMARK_FREEZE_VISIBILITY,
                ESERCIZI[esercizio].tracking?.landmarkFreezeMaxFrames ?? ENGINE.LANDMARK_FREEZE_MAX_FRAMES
              );
              smoothedLandmarksRef.current = puntiStabilizzati;
              const puntiDisegno = smoothLandmarksCoordinates(
                puntiStabilizzati,
                drawLandmarksRef.current,
                ENGINE.DRAW_SMOOTHING_ALPHA ?? 0.2,
                0,
                0
              );
              drawLandmarksRef.current = puntiDisegno;
              ultimoPuntiRef.current = puntiDisegno;

              const latoSquatBloccato = esercizio === 'SQUAT' &&
                ultimoLatoRef.current &&
                statoRepRef.current.movementState !== 'STANDING';
              const latoRilevato = latoSquatBloccato
                ? ultimoLatoRef.current
                : selectTrackedSide(
                    puntiStabilizzati,
                    ultimoLatoRef.current,
                    ESERCIZI[esercizio].requiredLandmarks
                  );
              ultimoLatoRef.current = latoRilevato;

              // Check only the landmarks required by the exercise validation logic.
              // Hysteresis prevents flickering when plates make visibility oscillate around the threshold.
              const indiciNodiCritici = ESERCIZI[esercizio].requiredLandmarks?.[latoRilevato]
                ?? Object.values(ESERCIZI[esercizio].landmarks[latoRilevato]).filter(Number.isFinite);
              const isInquadraturaValida = indiciNodiCritici.every(indice => {
                const p = puntiStabilizzati[indice];
                const chiaveVisibilita = `${esercizio}:${latoRilevato}:${indice}`;
                const eraVisibile = visibilitaStabileRef.current[chiaveVisibilita] === true;
                const sogliaIngresso = ENGINE.VISIBILITY_THRESHOLD;
                const sogliaUscita = ENGINE.VISIBILITY_EXIT_THRESHOLD ?? ENGINE.VISIBILITY_THRESHOLD;
                const confidenzaValidazione = p?.validationVisibility ?? p?.visibility;
                const visibile = eraVisibile
                  ? confidenzaValidazione >= sogliaUscita
                  : confidenzaValidazione >= sogliaIngresso;

                visibilitaStabileRef.current[chiaveVisibilita] = visibile;

                return p &&
                  visibile &&
                  p.x >= -0.03 && p.x <= 1.03 &&
                  p.y >= -0.03 && p.y <= 1.03;
              });

              if (!isInquadraturaValida) {
                // If the critical landmarks are not all visible or not all within the frame, display a warning message on the HUD and skip the repetition processing for this frame.
                ultimoBersaglioRef.current = false;
                messaggioHudRef.current = {
                  type: 'INVALID',
                  text: 'ARTICOLAZIONI NON VISIBILI O FUORI CAMPO',
                  expires: performance.now() + 500
                };
              } else {
                posaValidaRef.current = true;
                // Process the repetition logic only if all critical landmarks are visible and within the frame
                const esito = processFrame(esercizio, statoRepRef.current, puntiStabilizzati, latoRilevato);

                // Always update the displayed angles so the user can adjust positioning.
                if (timestamp - ultimoAggiornamentoUI.current > 100) {
                  if (Math.abs((esito.primaryAngle ?? 0) - (angoliPrecRef.current.primary ?? 0)) > 1) {
                    setAngles({ primary: esito.primaryAngle, secondary: esito.secondaryAngle });
                    angoliPrecRef.current = { primary: esito.primaryAngle, secondary: esito.secondaryAngle };
                    ultimoAggiornamentoUI.current = timestamp;
                  }
                }

                // Advance the FSM and count repetitions only while recording is active.
                if (registrazioneRef.current) {
                  statoRepRef.current = esito.state;
                  ultimoBersaglioRef.current = esito.isTarget;

                  if (!targetRaggiuntoRef.current && (esito.event?.type === 'VALID_REP' || esito.event?.type === 'NO_REP')) {
                    const isValida = esito.event.type === 'VALID_REP';
                    if (isValida) {
                      contatoreValideRef.current += 1;
                      setValidReps(contatoreValideRef.current);
                      setFaults([]);
                      messaggioHudRef.current = { type: 'VALID', text: 'RIPETIZIONE VALIDA', expires: performance.now() + (ENGINE?.HUD_VALID_MS || 2000) };
                      if (targetRepsRef.current > 0 && contatoreValideRef.current >= targetRepsRef.current) {
                        targetRaggiuntoRef.current = true;
                      }
                    } else {
                      contatoreNonValideRef.current += 1;
                      setNoReps(contatoreNonValideRef.current);
                      setFaults(esito.event.faults);
                      messaggioHudRef.current = { type: 'INVALID', text: `NO REP: ${esito.event.faults.join(' - ')}`, expires: performance.now() + (ENGINE?.HUD_INVALID_MS || 3000) };
                    }
                  }
                }
              }
            } else {
              ultimoBersaglioRef.current = false;
              framePersiRef.current++;
              if (framePersiRef.current > (ENGINE?.TRACKING_LOST_FRAMES || 15)) {
                trackingPersoRef.current = true;
                posaValidaRef.current = false;
                ultimoPuntiRef.current = null;
                smoothedLandmarksRef.current = null;
                drawLandmarksRef.current = null;
                ultimoLatoRef.current = null;
                trackedPoseCenterRef.current = null;
                visibilitaStabileRef.current = {};
                setIsTrackingLost(true);
              }
            }
          } catch (err) {
            console.error("Errore durante l'inferenza MediaPipe:", err);
          } finally {
            isProcessingRef.current = false;
          }
        }

        const erroreLampeggiante = messaggioHudRef.current && performance.now() < messaggioHudRef.current.expires && messaggioHudRef.current.type === 'INVALID';

        // Reuse the most recent valid visual landmarks between inference updates.
        if (
          ultimoPuntiRef.current &&
          posaValidaRef.current &&
          framePersiRef.current <= (ENGINE.SKELETON_STALE_FRAMES ?? 4)
        ) {
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
          trackingPersoRef.current,
          angoliPrecRef.current.primary
        );
      }
      frameIdRef.current = requestAnimationFrame(ciclo);
    }

    frameIdRef.current = requestAnimationFrame(ciclo);
    return () => { if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current); };
  }, [esercizio, attivo, latoCamera, videoUrl]);

  /**
   * Reset the current pose tracking logical state (without clearing visual skeleton).
   */
  function reset() {
    statoRepRef.current = createInitialState();
    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;
    visibilitaStabileRef.current = {};
    trackingPersoRef.current = false;
    ultimoBersaglioRef.current = false;
    targetRaggiuntoRef.current = false;

    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    // Keep the last landmarks so the skeleton does not disappear when recording starts.
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, error, validReps, noReps, faults, angles, reset };
}

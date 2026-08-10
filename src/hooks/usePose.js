import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawHUD } from '../utils/canvasRenderer';
import { determinaLatoInquadrato, smoothLandmarksCoordinates } from '../utils/poseUtils';
import { ESERCIZI, ENGINE } from '../config/exercises';

export function usePose(esercizio, attivo, latoCamera, registrazioneAttiva, videoUrl) {
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
  const registrazioneRef = useRef(registrazioneAttiva);
  const ultimoPuntiRef = useRef(null);
  const ultimoLatoRef = useRef('LEFT');
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

  useEffect(() => {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    smoothedLandmarksRef.current = null;
    ultimoPuntiRef.current = null;
    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;
    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }, [esercizio, attivo, latoCamera, videoUrl]);

  useEffect(() => {
    registrazioneRef.current = registrazioneAttiva;
    if (registrazioneAttiva) reset();
  }, [registrazioneAttiva]);

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
          numPoses: 1,
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
            // Usa performance.now() per garantire sempre l'aumento temporale a MediaPipe
            const now = performance.now();
            const risultati = landmarker.detectForVideo(video, now);

            if (risultati.landmarks?.length > 0) {
              framePersiRef.current = 0;
              setIsTrackingLost(false);

              const puntiGrezzi = risultati.landmarks[0];
              const puntiStabilizzati = smoothLandmarksCoordinates(
                puntiGrezzi,
                smoothedLandmarksRef.current,
                0.5 
              );
              smoothedLandmarksRef.current = puntiStabilizzati;
              ultimoPuntiRef.current = puntiStabilizzati;

              const latoRilevato = determinaLatoInquadrato(puntiStabilizzati);
              ultimoLatoRef.current = latoRilevato;

              const esito = processFrame(esercizio, statoRepRef.current, puntiStabilizzati, latoRilevato);

              // 1. Aggiorna sempre gli angoli a schermo (permette all'utente di centrarsi)
              if (timestamp - ultimoAggiornamentoUI.current > 100) {
                if (Math.abs((esito.primaryAngle ?? 0) - (angoliPrecRef.current.primary ?? 0)) > 1) {
                  setAngles({ primary: esito.primaryAngle, secondary: esito.secondaryAngle });
                  angoliPrecRef.current = { primary: esito.primaryAngle, secondary: esito.secondaryAngle };
                  ultimoAggiornamentoUI.current = timestamp;
                }
              }

              // 2. Avanza di stato e salva le ripetizioni SOLO se stiamo registrando
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
              framePersiRef.current++;
              if (framePersiRef.current > (ENGINE?.TRACKING_LOST_FRAMES || 15)) {
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

        // Disegna lo scheletro continuamente
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
  }, [esercizio, attivo, latoCamera, videoUrl]);

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
    // Non cancelliamo l'ultimoPuntiRef qui, per mantenere l'estetica visiva intatta durante lo scatto del REC
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, error, validReps, noReps, faults, angles, reset };
}

import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { processFrame, createInitialState } from '../logic/repLogic';
import { drawSkeleton, drawSquatOverlays, drawHUD } from '../utils/canvasRenderer';
import { determinaLatoInquadrato } from '../utils/poseUtils';
import { ESERCIZI, ENGINE } from '../config/exercises';

export function usePose(esercizio, attivo, latoCamera, registrazioneAttiva, logCallback, videoUrl) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const modelloRef = useRef(null);
  const frameIdRef = useRef(null);
  const statoRepRef = useRef(createInitialState());
  const primoCaricamentoRef = useRef(true);
  const angoliPrecRef = useRef({ primary: null, secondary: null });
  const framePersiRef = useRef(0);
  const ultimoTempoVideoRef = useRef(-1);
  const ginocchioYSmoothRef = useRef(null);
  const registrazioneRef = useRef(registrazioneAttiva);
  // Cache per renderizzare lo scheletro anche a video in pausa
  const ultimoPuntiRef = useRef(null);
  const ultimoLatoRef = useRef('LEFT');
  const ultimoBersaglioRef = useRef(false);

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
    ginocchioYSmoothRef.current = null;
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
          baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (componenteMontato) modelloRef.current = landmarker;
        else landmarker.close();
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
    const elVideo = videoRef.current;

    if (videoUrl) {
      if (elVideo) {
        elVideo.srcObject = null;
        elVideo.src = videoUrl;
        elVideo.load();

        // Forza il caricamento del primo frame visivo appena i dati sono pronti (Placeholder)
        elVideo.onloadeddata = () => {
          elVideo.currentTime = 0.001;
        };
      }
      return () => {
        if (elVideo) {
          elVideo.pause();
          elVideo.src = '';
        }
      };
    }
    else {
      async function avviaFotocamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: latoCamera,
              width: { ideal: ENGINE.CAMERA_WIDTH_IDEAL },
              height: { ideal: ENGINE.CAMERA_HEIGHT_IDEAL },
            },
            audio: false,
          });
          if (elVideo) {
            elVideo.srcObject = stream;
            elVideo.onloadedmetadata = () => elVideo.play();
          }
        } catch (err) {
          setError('Impossibile accedere al sensore ottico: ' + err.message);
        }
      }
      avviaFotocamera();
      return () => {
        if (elVideo?.srcObject) {
          elVideo.srcObject.getTracks().forEach(t => t.stop());
          elVideo.srcObject = null;
        }
      };
    }
  }, [attivo, latoCamera, videoUrl]);

  useEffect(() => {
    if (!attivo) return;

    function ciclo() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = modelloRef.current;

      if (video && canvas && landmarker && video.readyState >= 2) {
        const isNewFrame = video.currentTime !== ultimoTempoVideoRef.current;

        const ctx = canvas.getContext('2d');
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
        // Disegna sempre il frame, così funge da placeholder o mantiene il frame a video in pausa
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (primoCaricamentoRef.current) {
          setIsLoading(false); primoCaricamentoRef.current = false;
        }

        if (!registrazioneRef.current) {
          drawHUD(ctx, canvas.width, canvas.height, contatoreValideRef.current, null, false, null);
          frameIdRef.current = requestAnimationFrame(ciclo);
          return;
        }

        // Esegue MediaPipe SOLO se il frame video è andato avanti
        if (isNewFrame && !video.paused) {
          ultimoTempoVideoRef.current = video.currentTime;

          const risultati = landmarker.detectForVideo(video, performance.now());

          if (risultati.landmarks?.length > 0) {
            framePersiRef.current = 0;
            setIsTrackingLost(prev => prev ? false : prev);

            const punti = risultati.landmarks[0];
            ultimoPuntiRef.current = punti;
            const latoRilevato = determinaLatoInquadrato(punti);
            ultimoLatoRef.current = latoRilevato;

            const esito = processFrame(esercizio, statoRepRef.current, punti, latoRilevato);
            statoRepRef.current = esito.state;
            const { event, primaryAngle, secondaryAngle } = esito;
            ultimoBersaglioRef.current = esito.isTarget;

            if (Math.abs((primaryAngle ?? 0) - (angoliPrecRef.current.primary ?? 0)) > 1 || Math.abs((secondaryAngle ?? 0) - (angoliPrecRef.current.secondary ?? 0)) > 1) {
              setAngles({ primary: primaryAngle, secondary: secondaryAngle });
              angoliPrecRef.current = { primary: primaryAngle, secondary: secondaryAngle };
            }

            if (event?.type === 'VALID_REP' || event?.type === 'NO_REP') {
              const isValida = event.type === 'VALID_REP';

              if (isValida) {
                contatoreValideRef.current += 1;
                setValidReps(contatoreValideRef.current);
                setFaults([]);
                messaggioHudRef.current = { type: 'VALID', text: '✓ RIPETIZIONE VALIDA', expires: performance.now() + ENGINE.HUD_VALID_MS };
              }
              else {
                contatoreNonValideRef.current += 1;
                setNoReps(contatoreNonValideRef.current);
                setFaults(event.faults);
                messaggioHudRef.current = { type: 'INVALID', text: `NO REP: ${event.faults.join(' - ')}`, expires: performance.now() + ENGINE.HUD_INVALID_MS };
              }

              const adesso = new Date();
              if (logCallback) {
                logCallback({
                  timestamp: adesso.toISOString(),
                  time: adesso.toLocaleTimeString('it-IT', { hour12: false }),
                  ex: esercizio,
                  side: latoRilevato,
                  esito: event.type,
                  primaryAngle: primaryAngle === null ? '' : Math.round(primaryAngle),
                  finalState: statoRepRef.current.movementState,
                  errori: event.faults?.length ? event.faults.join(' - ') : 'Nessuno',
                });
              }
            }
          } else {
            framePersiRef.current++;
            if (framePersiRef.current > ENGINE.TRACKING_LOST_FRAMES) {
              setIsTrackingLost(prev => !prev ? true : prev);
            }
          }
        }

        const erroreLampeggiante = messaggioHudRef.current && performance.now() < messaggioHudRef.current.expires && messaggioHudRef.current.type === 'INVALID';

        // Usa la cache per stampare lo scheletro anche se il video è in pausa.
        // Lo scheletro viene disegnato con lo stesso specchiamento applicato al
        // video (vedi 'specchiato' più sopra): i landmark di MediaPipe sono
        // sempre nel sistema di coordinate "grezzo" del video originale, quindi
        // vanno disegnati nella stessa trasformazione usata per il frame video,
        // altrimenti risultano visivamente disallineati/specchiati rispetto al
        // corpo mostrato a schermo con fotocamera frontale.
        if (ultimoPuntiRef.current) {
          ctx.save();
          if (specchiato) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          drawSkeleton(ctx, ultimoPuntiRef.current, canvas.width, canvas.height, ultimoBersaglioRef.current, ultimoLatoRef.current, esercizio, erroreLampeggiante);
          if (esercizio === 'SQUAT') {
            const puntoGinocchio = ultimoPuntiRef.current[ESERCIZI.SQUAT.landmarks[ultimoLatoRef.current].knee];
            drawSquatOverlays(ctx, canvas.width, canvas.height, puntoGinocchio, ultimoBersaglioRef.current, ginocchioYSmoothRef);
          }
          ctx.restore();
        }

        drawHUD(
          ctx,
          canvas.width,
          canvas.height,
          contatoreValideRef.current,
          messaggioHudRef.current,
          framePersiRef.current > ENGINE.TRACKING_LOST_FRAMES,
          statoRepRef.current.lastAngle
        );
      }
      frameIdRef.current = requestAnimationFrame(ciclo);
    }

    frameIdRef.current = requestAnimationFrame(ciclo);
    return () => { if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current); };
  }, [esercizio, attivo, latoCamera, videoUrl, logCallback]);

  function reset() {
    statoRepRef.current = createInitialState();
    angoliPrecRef.current = { primary: null, secondary: null };
    framePersiRef.current = 0;
    ginocchioYSmoothRef.current = null;
    ultimoPuntiRef.current = null;

    contatoreValideRef.current = 0;
    contatoreNonValideRef.current = 0;
    messaggioHudRef.current = null;

    setValidReps(0);
    setNoReps(0);
    setFaults([]);
    setAngles({ primary: null, secondary: null });
    setIsTrackingLost(false);
  }

  return { videoRef, canvasRef, isLoading, isTrackingLost, error, validReps, noReps, faults, angles, reset };
}
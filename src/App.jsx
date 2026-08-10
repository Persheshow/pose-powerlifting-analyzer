import { useState, useEffect } from 'react';
import { usePose } from './hooks/usePose';
import { useVideoRecorder } from './hooks/useVideoRecorder';
import logoUnifi from './assets/logo_unifi.png';
import { SpeedInsights } from '@vercel/speed-insights/react';

const NOMI_ESERCIZI = {
  SQUAT: 'Squat',
  DEADLIFT: 'Stacco da terra',
  OVERHEAD_PRESS: 'Pressa militare',
};

const INFO_ESERCIZI = {
  SQUAT: {
    titolo: 'Esecuzione Squat',
    videoSrc: '/assets/SquatDemo.mp4',
    fonteVideo: 'JET Coaching TV',
    linkVideo: 'https://www.youtube.com/watch?v=daDK0huWvfc',
    descrizione: 'La validità dell\'alzata richiede che l\'anca scenda al di sotto del parallelo. La risalita deve essere completata con la piena estensione di anche e ginocchia.'
  },
  DEADLIFT: {
    titolo: 'Esecuzione Stacco da terra',
    videoSrc: '/assets/DeadliftDemo.mp4',
    fonteVideo: ' BodyFix Method - Get Your Life Back: Move Pain Free',
    linkVideo: 'https://www.youtube.com/watch?v=GKtFw2Egc3Y',
    descrizione: 'L\'alzata è valida al raggiungimento della completa estensione di anche e ginocchia. È causa di invalidazione la discesa del bilanciere durante la fase di tirata.'
  },
  OVERHEAD_PRESS: {
    titolo: 'Esecuzione Pressa Militare',
    videoSrc: '/assets/OverheadPressDemo.mp4',
    fonteVideo: 'Brian DeBaets',
    linkVideo: 'https://www.youtube.com/watch?v=bV21SQgC364',
    descrizione: 'Il movimento è validato dalla completa estensione del gomito. La discesa del bilanciere durante la fase di spinta è causa di invalidazione dell\'alzata.'
  }
};

/**
 * Check whether the application is running on a mobile device.
 * @returns {boolean} - True if the user agent belongs to a mobile device.
 */
const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

/**
 * Main application component that renders UI, handles exercise selection, and integrates
 * pose tracking with recording controls.
 */
export default function App() {
  const [esercizioScelto, setEsercizioScelto] = useState('SQUAT');
  const [allenamentoAvviato, setAllenamentoAvviato] = useState(false);
  const [cameraLato, setCameraLato] = useState(isMobileDevice() ? 'environment' : 'user');
  const [cameraDoppia, setCameraDoppia] = useState(false);
  const [staRegistrando, setStaRegistrando] = useState(false);
  const [infoModaleAperto, setInfoModaleAperto] = useState(false);
  const [modalitaAcquisizione, setModalitaAcquisizione] = useState('live');
  const [fileCaricato, setFileCaricato] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [durataContoAllaRovescia, setDurataContoAllaRovescia] = useState(3);
  const [contoAllaRovescia, setContoAllaRovescia] = useState(null);
  const [inPausa, setInPausa] = useState(false);
  const [videoTerminato, setVideoTerminato] = useState(false);
  const [targetReps, setTargetReps] = useState(5);

  /**
   * Handle the selected video file and set it as the source for analysis.
   * @param {Event} e - Change event from the file input.
   */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileCaricato(file);
      setVideoUrl(URL.createObjectURL(file));
    }
  };

  // Use the custom usePose hook to manage pose detection and repetition counting.
  const {
    videoRef,
    canvasRef,
    isLoading: caricamentoModello,
    error: erroreModello,
    validReps: ripetizioniValide,
    noReps: ripetizioniNonValide,
    reset: resetConteggio,
  } = usePose(esercizioScelto, allenamentoAvviato, cameraLato, staRegistrando, modalitaAcquisizione === 'file' ? videoUrl : null);

  // Video recording controls using the custom useVideoRecorder hook.
  const {
    startRecording: avviaRegistrazione,
    stopRecording: fermaRegistrazione,
    pendingRecording,
    confermaDownload,
    scartaRegistrazione,
    pausaRegistrazione,
    riprendiRegistrazione,
  } = useVideoRecorder(canvasRef, setStaRegistrando);

  const Beep = () => {
    try {
      const CtxAudio = window.AudioContext || window.webkitAudioContext;
      if (!CtxAudio) return;

      const ctx = new CtxAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.warn("Esecuzione del flusso audio interrotta", e);
    }
  };

  // Play a beep sound whenever a valid repetition is detected.
  useEffect(() => {
    if (ripetizioniValide > 0) Beep();
  }, [ripetizioniValide]);

  // Automatically stop recording when the target number of valid repetitions is reached.
  useEffect(() => {
    if (staRegistrando && targetReps > 0 && ripetizioniValide >= targetReps) {

      const timerId = setTimeout(() => {
        fermaRegistrazione(true, { valide: ripetizioniValide, nonValide: ripetizioniNonValide });
        if (modalitaAcquisizione === 'file' && videoRef.current) {
          videoRef.current.pause();
        }
        setVideoTerminato(true);
        setInPausa(false);
      }, 2000); // 2-second delay before stopping recording

      return () => clearTimeout(timerId);
    }
  }, [ripetizioniValide, targetReps, staRegistrando, fermaRegistrazione, modalitaAcquisizione, ripetizioniNonValide, videoRef]);

  // Detect the number of available video input devices and enable dual-camera UI if possible.
  useEffect(() => {
    async function trovaFotocamere() {
      if (isMobileDevice()) {
        setCameraDoppia(true);
        return;
      }
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const dispositivi = await navigator.mediaDevices.enumerateDevices();
        const cams = dispositivi.filter(d => d.kind === 'videoinput');
        setCameraDoppia(cams.length > 1);
      } catch (err) {
        console.error("Errore nell'inizializzazione della fotocamera:", err);
      }
    }
    trovaFotocamere();
  }, []);

  // Countdown effect to manage the countdown timer before starting the recording.
  useEffect(() => {
    if (contoAllaRovescia === null) return;

    if (contoAllaRovescia > 0) {
      const timerId = setTimeout(() => {
        setContoAllaRovescia(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timerId);
    } else {
      avviaRegistrazione();
      setContoAllaRovescia(null);
    }
  }, [contoAllaRovescia, avviaRegistrazione]);

  // main application render
  return (
    <div className="min-h-screen bg-white text-[#002f6c] flex flex-col items-center p-4 font-sans selection:bg-[#002f6c] selection:text-white relative">

      {infoModaleAperto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#002f6c]/80 p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#002f6c] w-full max-w-md flex flex-col rounded-none shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#002f6c] p-4">
              <h2 className="text-sm font-bold uppercase tracking-widest">{INFO_ESERCIZI[esercizioScelto].titolo}</h2>
              <button onClick={() => setInfoModaleAperto(false)} className="text-[#002f6c] hover:bg-[#002f6c] hover:text-white px-2 py-1 border border-transparent hover:border-[#002f6c] transition-none cursor-pointer">✕</button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="w-full bg-gray-100 border border-[#002f6c] aspect-video relative flex items-center justify-center overflow-hidden">
                <span className="absolute text-xs uppercase tracking-widest text-gray-400 z-0">Video non disponibile</span>
                <video src={INFO_ESERCIZI[esercizioScelto].videoSrc} autoPlay loop muted playsInline controls={false} className="w-full h-full object-cover relative z-10 pointer-events-none" />
              </div>
              <div className="flex justify-end -mt-2">
                <a href={INFO_ESERCIZI[esercizioScelto].linkVideo} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#002f6c] underline uppercase tracking-widest hover:opacity-70">© Fonte: {INFO_ESERCIZI[esercizioScelto].fonteVideo}</a>
              </div>
              <p className="text-sm leading-relaxed text-justify border-t border-gray-200 pt-3">{INFO_ESERCIZI[esercizioScelto].descrizione}</p>
            </div>
          </div>
        </div>
      )}

      <header className="w-full max-w-xl text-center flex flex-col items-center my-8">
        <img src={logoUnifi} alt="Logo Università degli Studi di Firenze" className="w-48 h-auto object-contain mb-8" />
        <h1 className="text-2xl uppercase tracking-widest leading-tight">
          Analisi cinematica per il riconoscimento di ripetizioni valide di esercizi di powerlifting
        </h1>
      </header>

      {!allenamentoAvviato ? (
        <div className="w-full max-w-xl flex flex-col gap-6">
          <div className="bg-white border border-[#002f6c] rounded-none p-6 flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-widest mb-1">0. Istruzioni</h3>
              <ul className="text-xs md:text-sm text-gray-700 space-y-2 list-none">
                <li>
                  <span className="text-xs tracking-widest mb-1 font-bold">i)</span> Inquadrare con un'angolazione sagittale, evitando i 90° se si utilizzano dischi che potrebbero coprire le articolazioni, e mantenendo una distanza di circa 2-3 metri dall'atleta, in modo che l'intero corpo sia visibile e centrato nel frame.
                </li>
                <li>
                  <span className="text-xs tracking-widest mb-1 font-bold">ii)</span> Assicurarsi che solo l'atleta sia presente nel video ed evitare il passaggio di altre persone.
                </li>
                <li>
                  <span className="text-xs tracking-widest mb-1 font-bold">iii)</span> Non registrare in posti direttamente soleggiati, in controluce e/o con ombre marcate, e davanti a superfici specchianti, per evitare errori di tracciamento.
                </li>
                <li>
                  <span className="text-xs tracking-widest mb-1 font-bold">iv)</span> Eseguire i movimenti in modo controllato. Ripetizioni troppo veloci potrebbero non essere registrate correttamente.
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-end mb-1">
                <h3 className="text-xs uppercase tracking-widest">1. Esercizio</h3>
                <button onClick={() => setInfoModaleAperto(true)} className="w-6 h-6 rounded-full border border-[#002f6c] flex items-center justify-center text-xs font-bold hover:bg-[#002f6c] hover:text-white transition-none cursor-pointer">?</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {Object.entries(NOMI_ESERCIZI).map(([chiave, etichetta]) => (
                  <button key={chiave} onClick={() => setEsercizioScelto(chiave)} className={`py-3 px-4 rounded-none text-sm border transition-none cursor-pointer ${esercizioScelto === chiave ? 'bg-[#002f6c] text-white border-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>{etichetta}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#002f6c] pt-6">
              <h3 className="text-xs uppercase tracking-widest mb-1">2. Target Ripetizioni</h3>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="N. Ripetizioni"
                    value={targetReps > 0 ? targetReps : ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setTargetReps(isNaN(val) || val <= 0 ? 0 : val);
                    }}
                    className="w-full py-3 px-4 bg-white border border-[#002f6c] text-[#002f6c] text-sm rounded-none focus:outline-none focus:ring-1 focus:ring-[#002f6c]"
                  />
                  {targetReps > 0 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest text-gray-400 pointer-events-none">
                      Rep
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setTargetReps(0)}
                  className={`flex-1 py-3 px-4 rounded-none text-sm uppercase tracking-widest border transition-none cursor-pointer ${targetReps === 0
                    ? 'bg-[#002f6c] text-white border-[#002f6c]'
                    : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'
                    }`}
                >
                  Nessun Target
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#002f6c] pt-6">
              <h3 className="text-xs uppercase tracking-widest mb-1">3. Modalità Acquisizione</h3>
              <div className="flex gap-2">
                <button onClick={() => setModalitaAcquisizione('live')} className={`flex-1 py-3 rounded-none text-sm border transition-none cursor-pointer ${modalitaAcquisizione === 'live' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Fotocamera</button>
                <button onClick={() => setModalitaAcquisizione('file')} className={`flex-1 py-3 rounded-none text-sm border transition-none cursor-pointer ${modalitaAcquisizione === 'file' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Carica Video</button>
              </div>
            </div>

            {modalitaAcquisizione === 'live' && cameraDoppia && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">4. Seleziona Fotocamera</h3>
                <div className="flex gap-2">
                  <button onClick={() => setCameraLato('environment')} className={`flex-1 py-3 rounded-none text-sm border transition-none cursor-pointer ${cameraLato === 'environment' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Posteriore</button>
                  <button onClick={() => setCameraLato('user')} className={`flex-1 py-3 rounded-none text-sm border transition-none cursor-pointer ${cameraLato === 'user' ? 'bg-[#002f6c] text-white' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}>Anteriore</button>
                </div>
              </div>
            )}

            {modalitaAcquisizione === 'live' && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">
                  {cameraDoppia ? '5. Timer di Avvio' : '4. Timer di Avvio'}
                </h3>
                <select
                  value={durataContoAllaRovescia}
                  onChange={(e) => setDurataContoAllaRovescia(Number(e.target.value))}
                  className="w-full py-3 px-4 bg-white border border-[#002f6c] text-[#002f6c] text-sm rounded-none focus:outline-none focus:ring-1 focus:ring-[#002f6c] cursor-pointer"
                >
                  {[0, 3, 5, 10, 30].map((s) => (
                    <option key={s} value={s}>
                      {s === 0 ? 'Avvio immediato (0s)' : `${s} secondi`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {modalitaAcquisizione === 'file' && (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs uppercase tracking-widest mb-1">4. Seleziona File (.mp4, .webm)</h3>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-[#002f6c] border-dashed bg-gray-50 hover:bg-gray-100 transition-none p-4 text-center cursor-pointer">
                  <span className="text-sm text-[#002f6c] truncate w-full">
                    {fileCaricato ? fileCaricato.name : 'Clicca qui per selezionare un file'}
                  </span>
                  <input type="file" className="hidden" accept="video/mp4,video/webm,video/quicktime" onChange={handleFileChange} />
                </label>
              </div>
            )}

          </div>

          <button
            onClick={() => setAllenamentoAvviato(true)}
            disabled={modalitaAcquisizione === 'file' && !videoUrl}
            className={`w-full py-4 border rounded-none text-lg uppercase tracking-widest transition-none ${modalitaAcquisizione === 'file' && !videoUrl ? 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed' : 'bg-[#002f6c] text-white border-[#002f6c] hover:bg-white hover:text-[#002f6c] cursor-pointer'}`}
          >
            Inizia
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col items-center">

          <main className="w-full relative bg-white rounded-none overflow-hidden border border-[#002f6c]">
            {caricamentoModello && !erroreModello && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                <div className="w-8 h-8 border-4 border-[#002f6c] border-t-transparent rounded-none animate-spin" />
                <p className="text-xs text-[#002f6c] mt-4 uppercase tracking-widest">Inizializzazione Modello...</p>
              </div>
            )}

            {erroreModello && <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-sm z-30 border-4 border-[#002f6c] uppercase">{erroreModello}</div>}

            <video
              ref={videoRef}
              className="hidden"
              playsInline
              muted
              onEnded={() => {
                if (modalitaAcquisizione === 'file') setVideoTerminato(true);
              }}
            />
            <canvas ref={canvasRef} className="w-full h-auto block" />

            {contoAllaRovescia !== null && contoAllaRovescia > 0 && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center backdrop-blur-sm">
                <span className="text-white text-6xl font-light tracking-widest">{contoAllaRovescia}</span>
              </div>
            )}

            {modalitaAcquisizione === 'live' && cameraDoppia && !caricamentoModello && !erroreModello && !staRegistrando && contoAllaRovescia === null && (
              <button onClick={() => setCameraLato(prev => prev === 'user' ? 'environment' : 'user')} className="absolute bottom-4 right-4 bg-white border border-[#002f6c] text-[#002f6c] p-3 rounded-none z-30 transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
            )}
          </main>

          {!caricamentoModello && !erroreModello && (
            <div className="w-full mt-4 flex flex-col gap-2">
              {contoAllaRovescia !== null ? (
                <button disabled className="w-full py-4 text-sm font-bold tracking-widest rounded-none border border-gray-300 bg-gray-200 text-gray-400 cursor-not-allowed">
                  PREPARAZIONE...
                </button>
              ) : staRegistrando ? (
                videoTerminato ? (
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = 0;
                          videoRef.current.play();
                        }
                        resetConteggio();
                        setVideoTerminato(false);
                        if (inPausa) setInPausa(false);
                      }}
                      className="flex-1 py-4 text-sm font-bold tracking-widest rounded-none border border-[#002f6c] bg-white text-[#002f6c] transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer"
                    >
                      RIAVVIA VIDEO
                    </button>
                    <button
                      onClick={() => {
                        fermaRegistrazione(true, { valide: ripetizioniValide, nonValide: ripetizioniNonValide });
                        setVideoTerminato(false);
                      }}
                      className="flex-1 py-4 text-sm font-bold tracking-widest rounded-none border border-red-600 bg-red-600 text-white transition-none hover:bg-white hover:text-red-600 cursor-pointer"
                    >
                      TERMINA
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => {
                        if (inPausa) {
                          if (videoRef.current) videoRef.current.play();
                          riprendiRegistrazione();
                          setInPausa(false);
                        } else {
                          if (videoRef.current) videoRef.current.pause();
                          pausaRegistrazione();
                          setInPausa(true);
                        }
                      }}
                      className={`flex-1 py-4 text-sm font-bold tracking-widest rounded-none border transition-none cursor-pointer ${inPausa ? 'bg-[#002f6c] text-white border-[#002f6c] hover:bg-white hover:text-[#002f6c]' : 'bg-white text-[#002f6c] border-[#002f6c] hover:bg-[#002f6c] hover:text-white'}`}
                    >
                      {inPausa ? 'RIPRENDI' : 'PAUSA'}
                    </button>
                    <button
                      onClick={() => {
                        fermaRegistrazione(true, { valide: ripetizioniValide, nonValide: ripetizioniNonValide });
                        if (modalitaAcquisizione === 'file' && videoRef.current) videoRef.current.pause();
                        setInPausa(false);
                      }}
                      className="flex-1 py-4 text-sm font-bold tracking-widest rounded-none border border-red-600 bg-red-600 text-white transition-none animate-pulse hover:bg-white hover:text-red-600 cursor-pointer"
                    >
                      TERMINA
                    </button>
                  </div>
                )
              ) : (
                <button
                  onClick={() => {
                    if (modalitaAcquisizione === 'live') {
                      if (durataContoAllaRovescia === 0) {
                        avviaRegistrazione();
                      } else {
                        setContoAllaRovescia(durataContoAllaRovescia);
                      }
                    } else {
                      avviaRegistrazione();
                      if (videoRef.current) videoRef.current.play();
                    }
                  }}
                  className="w-full py-4 text-sm font-bold tracking-widest rounded-none border border-[#002f6c] bg-white text-[#002f6c] transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer"
                >
                  {modalitaAcquisizione === 'file' ? 'AVVIA ANALISI' : 'INIZIA ESERCIZIO'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {allenamentoAvviato && (
        <footer className="w-full max-w-xl mt-6 mb-8 flex flex-col gap-4">
          <button
            onClick={() => {
              if (staRegistrando) fermaRegistrazione(false);
              setAllenamentoAvviato(false);
              setContoAllaRovescia(null);
              setInPausa(false);
              setVideoTerminato(false);
            }}
            className="w-full py-4 bg-white border border-[#002f6c] rounded-none text-sm uppercase tracking-widest transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer"
          >
            Indietro
          </button>
        </footer>
      )}

      <footer className="w-full max-w-xl mt-auto pt-12 pb-6 flex flex-col items-center gap-1.5 text-[#002f6c] text-center">
        <div className="w-16 h-[1px] bg-[#002f6c] mb-4 opacity-50"></div>
        <p className="text-[15px] uppercase tracking-wider">Corso di Laurea in Informatica</p>
        <p className="text-[15px] uppercase tracking-wider opacity-70">A.A. 2025/2026</p>
      </footer>

      {pendingRecording && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t-2 border-[#002f6c] p-4 shadow-2xl animate-fade-in">
          <div className="w-full max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">

            <div className="flex flex-col gap-0.5 text-center sm:text-left">
              <p className="text-xs uppercase tracking-widest font-bold text-[#002f6c]">
                {targetReps > 0 && pendingRecording.riepilogo?.valide >= targetReps
                  ? '★ TARGET RAGGIUNTO · REGISTRAZIONE PRONTA'
                  : 'Registrazione pronta'}
              </p>
              {pendingRecording.riepilogo && (
                <p className="text-[10px] uppercase tracking-wider text-gray-600">
                  {pendingRecording.riepilogo.valide} valide &middot; {pendingRecording.riepilogo.nonValide} non valide
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  scartaRegistrazione();
                  resetConteggio();
                }}
                className="px-3 py-2 text-xs uppercase tracking-widest border border-[#002f6c] text-[#002f6c] rounded-none transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer"
              >
                Ignora
              </button>

              <button
                onClick={() => {
                  confermaDownload('mp4');
                  resetConteggio();
                }}
                className="px-3 py-2 text-xs uppercase tracking-widest border border-[#002f6c] bg-gray-100 text-[#002f6c] rounded-none transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer"
              >
                Scarica .MP4
              </button>

              <button
                onClick={() => {
                  confermaDownload('webm');
                  resetConteggio();
                }}
                className="px-3 py-2 text-xs uppercase tracking-widest border border-[#002f6c] bg-gray-100 text-[#002f6c] rounded-none transition-none hover:bg-[#002f6c] hover:text-white cursor-pointer"
                title="Formato WebM nativo"
              >
                .WEBM
              </button>
            </div>

          </div>
        </div>
      )}

      <SpeedInsights />
    </div>
  );
}
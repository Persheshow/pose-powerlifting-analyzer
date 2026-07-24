/**
 * @file exercises.js
 * @description File di configurazione globale. Ogni soglia numerica usata dal
 * motore di validazione (repLogic.js) deve vivere qui: questo rende visibile
 * "a colpo d'occhio" il criterio biomeccanico usato per ciascuna alzata, senza
 * dover leggere l'implementazione della FSM.
 */

export const ESERCIZI = {
  SQUAT: {
    thresholds: {
      bottomKnee: 85, topKnee: 160, minAttemptKnee: 140,
      minRepDurationMs: 1000, cooldownMs: 800,
    },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  DEADLIFT: {
    thresholds: {
      erectKnee: 165, erectHip: 165,
      cooldownMs: 1500,
    },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  OVERHEAD_PRESS: {
    thresholds: {
      topElbow: 160, bottomElbow: 140, minAttemptElbow: 130,
      minRepDurationMs: 800, cooldownMs: 800,
    },
    landmarks: {
      LEFT: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
    }
  }
};

export const SKELETON_COLORS = {
  target: '#ffffff',
  active: '#ffffff',
  warning: '#6c0000',
  error: '#ffffff',
};

export const SMOOTHING = {
  alpha: 0.35,
  beta: 0.65,
};

/**
 * Parametri del motore di tracking/validazione, indipendenti dal singolo esercizio.
 * Prima erano letteral-sparsi (magic numbers) in usePose.js e repLogic.js.
 */
export const ENGINE = {
  // Soglia minima di "visibility" (confidenza MediaPipe) sotto la quale un
  // landmark è considerato non affidabile ai fini della validazione.
  VISIBILITY_THRESHOLD: 0.15,
  // Soglia di visibility (più permissiva) sotto la quale un landmark non viene
  // comunque disegnato sullo scheletro overlay.
  DRAW_VISIBILITY_THRESHOLD: 0.2,
  // Finestra di "grazia" dopo l'avvio dell'esercizio/reset, durante la quale non
  // si valutano transizioni di stato (evita falsi trigger sul primo frame utile).
  SETUP_GRACE_MS: 1000,
  // Tempo di occlusione continuativa (landmark chiave non visibili) dopo il quale
  // lo stato del movimento in corso viene resettato a STANDING.
  OCCLUSION_RESET_MS: 1000,
  // Tempo di inattività (nessuna transizione di fase) dopo il quale la sessione
  // in corso viene abbandonata e riportata a STANDING.
  SESSION_TIMEOUT_MS: 5000,
  // Variazione minima (in gradi) tra il campione più vecchio e quello attuale nel
  // buffer storico angoli per riconoscere l'inizio della fase di risalita.
  ASCENT_MIN_DELTA_DEG: 3.0,
  // Lunghezza del buffer storico angoli usato per rilevare l'inversione di fase.
  ASCENT_HISTORY_LEN: 5,
  // Numero di frame consecutivi senza landmark validi dopo cui la UI segnala
  // "corpo non rilevato".
  TRACKING_LOST_FRAMES: 30,
  // Finestra temporale entro cui si contano ripetizioni consecutive troppo veloci.
  FAST_REP_WINDOW_MS: 5000,
  // Numero di ripetizioni troppo veloci in finestra oltre il quale scatta l'avviso.
  FAST_REP_TRIGGER_COUNT: 3,
  // Durata di visualizzazione del banner HUD "RIPETIZIONE VALIDA" / "NO REP".
  HUD_VALID_MS: 2000,
  HUD_INVALID_MS: 2000,
  // Durata del watermark "RALLENTA L'ESECUZIONE" impresso nel video esportato.
  WATERMARK_MS: 2500,
  CAMERA_WIDTH_IDEAL: 1280,
  CAMERA_HEIGHT_IDEAL: 720,
  // Bitrate video richiesto a MediaRecorder per l'esportazione. Senza questo
  // valore esplicito il browser applica un default spesso conservativo per
  // gli stream generati da canvas, con visibili artefatti di compressione.
  RECORDING_BITRATE: 8_000_000, // 8 Mbps
};
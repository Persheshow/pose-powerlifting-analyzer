import { ESERCIZI, SMOOTHING, ENGINE } from '../config/exercises.js';

/**
 * Smooth the current angle.
 * @param {number|null} prev - The previous smoothed angle.
 * @param {number} current - The current raw angle measurement.
 * @returns {number} - The updated smoothed angle.
 */
export function smoothAngle(prev, current) {
  if (prev === null) return current;
  return (current * SMOOTHING.alpha) + (prev * SMOOTHING.beta);
}

/**
 * Calculate the angle in degrees formed by the vectors BA and BC.
 * @param {Object} a - First point of the angle.
 * @param {Object} b - Vertex point of the angle.
 * @param {Object} c - Third point of the angle.
 * @returns {number} - Angle between vectors BA and BC in degrees.
 */
export function calculateAngle(a, b, c) {
  const vettoreBA = { x: a.x - b.x, y: a.y - b.y };
  const vettoreBC = { x: c.x - b.x, y: c.y - b.y };

  const prodottoScalare = (vettoreBA.x * vettoreBC.x) + (vettoreBA.y * vettoreBC.y);
  const lunghezzaBA = Math.sqrt(vettoreBA.x * vettoreBA.x + vettoreBA.y * vettoreBA.y);
  const lunghezzaBC = Math.sqrt(vettoreBC.x * vettoreBC.x + vettoreBC.y * vettoreBC.y);

  if (lunghezzaBA === 0 || lunghezzaBC === 0) return 0;

  let cosAngolo = prodottoScalare / (lunghezzaBA * lunghezzaBC);
  cosAngolo = Math.max(-1.0, Math.min(1.0, cosAngolo));

  return (Math.acos(cosAngolo) * 180.0) / Math.PI;
}

/**
 * Create the default state object used to track exercise execution and metrics.
 * @returns {Object} - Initial state for a new exercise session.
 */
export function createInitialState() {
  return {
    movementState: 'STANDING',
    smoothedPrimary: null,
    smoothedSecondary: null,
    lastAngle: 180,
    lastAngleHistory: [],
    lastActiveTime: Date.now(),
    startTime: Date.now(),
    occludedSince: null,
    metrics: {
      faults: new Set(),
      startX: null,
      maxAscentAngle: 0,
      lockedAtStart: false,
      deepEnough: false,
      minWristY: 1.0,
      startKneeAngle: null,
      cooldownUntil: 0,
      repStartTime: 0,
      lowestKneeAngle: 180,
      lowestElbowAngle: 180,
      lowestHipAngle: 180,
      fastRepCount: 0,
      lastFastRepTime: 0,
      targetReached: false,
    },
  };
}

/**
 * Handle rapid repetition detection and emit a warning event when the threshold is exceeded.
 * @param {Object} m - Metric object tracking fast rep counts.
 * @param {number} adesso - Current timestamp.
 * @param {string} messaggio - Message to dispatch if repeated too fast.
 */
function gestisciOverlayVeloce(m, adesso, messaggio) {
  if (adesso - (m.lastFastRepTime || 0) > ENGINE.FAST_REP_WINDOW_MS) {
    m.fastRepCount = 0;
  }

  m.fastRepCount = (m.fastRepCount || 0) + 1;
  m.lastFastRepTime = adesso;

  if (m.fastRepCount >= ENGINE.FAST_REP_TRIGGER_COUNT) {
    window.dispatchEvent(new CustomEvent('execution_error', { detail: messaggio }));
    m.fastRepCount = 0;
  }
}

/**
 * Helper function to get the shoulder landmark, handling occlusion and mirroring.
 * @param {Array} lm - The array of landmarks.
 * @param {number} idxPrincipale - The index of the main shoulder landmark.
 * @param {Object} anca - The hip landmark.
 * @returns {Object} - The shoulder landmark or a default value.
 */
function getShoulderLandmark(lm, idxPrincipale, anca) {
  const idxOpposto = idxPrincipale === 11 ? 12 : 11;
  const principale = lm[idxPrincipale];
  const opposto = lm[idxOpposto];
  if (principale && principale.visibility > ENGINE.VISIBILITY_THRESHOLD) return principale;
  if (opposto && opposto.visibility > ENGINE.VISIBILITY_THRESHOLD) return { ...opposto, x: 1 - opposto.x };
  return { x: anca.x, y: anca.y - 0.25, visibility: ENGINE.VISIBILITY_THRESHOLD };
}


/**
 * Helper function to get the elbow landmark, handling occlusion and mirroring.
 * @param {Array} lm - The array of landmarks.
 * @param {number} idxPrincipale - The index of the main elbow landmark.
 * @param {Object} spalla - The shoulder landmark.
 * @param {Object} polso - The wrist landmark.
 * @returns {Object} - The elbow landmark or a default value.
 */
function getElbowLandmark(lm, idxPrincipale, spalla, polso) {
  const idxOpposto = idxPrincipale === 13 ? 14 : 13;
  const principale = lm[idxPrincipale];
  const opposto = lm[idxOpposto];
  if (principale && principale.visibility > ENGINE.VISIBILITY_THRESHOLD) return principale;
  if (opposto && opposto.visibility > ENGINE.VISIBILITY_THRESHOLD) return { ...opposto, x: 1 - opposto.x };
  if (spalla && polso) {
    return { x: (spalla.x + polso.x) / 2, y: (spalla.y + polso.y) / 2, visibility: ENGINE.VISIBILITY_THRESHOLD };
  }
  return principale;
}

/**
 * Helper function to check if the session has timed out due to inactivity.
 * @param {Object} stato - The current state of the exercise.
 */
function checkTimeout(stato) {
  const adesso = Date.now();
  if (stato.movementState === 'STANDING') {
    stato.lastActiveTime = adesso;
    return;
  }
  if (adesso - stato.lastActiveTime > ENGINE.SESSION_TIMEOUT_MS) {
    stato.movementState = 'STANDING';
    stato.metrics.deepEnough = false;
    stato.metrics.targetReached = false;
    stato.metrics.faults = new Set();
    stato.metrics.lowestKneeAngle = 180;
    stato.metrics.lowestElbowAngle = 180;
    stato.metrics.lowestHipAngle = 180;
    stato.lastAngleHistory = [];
    stato.lastActiveTime = adesso;
  }
}

/**
 * Helper function to check if the current angle indicates an ascent phase.
 * @param {Object} stato - The current state of the exercise.
 * @param {number} angoloAttuale - The current angle being evaluated.
 * @returns {boolean} - True if the current angle indicates an ascent phase, false otherwise.
 */
function checkAscent(stato, angoloAttuale) {
  stato.lastAngleHistory.push(angoloAttuale);
  if (stato.lastAngleHistory.length > ENGINE.ASCENT_HISTORY_LEN) {
    stato.lastAngleHistory.shift();
  }
  if (stato.lastAngleHistory.length < 3) return false;

  const angoloPiuVecchio = stato.lastAngleHistory[0];
  return angoloAttuale > angoloPiuVecchio + ENGINE.ASCENT_MIN_DELTA_DEG;
}

/**
 * Helper function to handle occlusion of landmarks.
 * @param {Object} stato - The current state of the exercise.
 * @returns {Object} - An object indicating if the landmarks are occluded and if a reset is needed.
 */
function handleOcclusion(stato) {
  if (!stato.occludedSince) {
    stato.occludedSince = Date.now();
    return { occluded: true, shouldReset: false };
  }
  if (Date.now() - stato.occludedSince > ENGINE.OCCLUSION_RESET_MS && stato.movementState !== 'STANDING') {
    return { occluded: true, shouldReset: true };
  }
  return { occluded: true, shouldReset: false };
}

/**
 * Helper function to check visibility and occlusion of required landmarks.
 * @param {Object} stato - The current state of the exercise.
 * @param {Array} lm - The array of landmarks.
 * @param {Array} indiciRichiesti - The indices of required landmarks to check.
 * @returns {Object} - An object indicating if the landmarks are visible and not occluded, and the resulting state if not.
 */
function verificaVisibilitaEOcclusione(stato, lm, indiciRichiesti) {
  const visibile = indiciRichiesti.every((i) => lm[i]?.visibility > ENGINE.VISIBILITY_THRESHOLD);

  if (!visibile) {
    const { shouldReset } = handleOcclusion(stato);
    const statoRisultante = shouldReset ? createInitialState() : stato;
    return {
      ok: false,
      result: { state: statoRisultante, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false },
    };
  }

  stato.occludedSince = null;
  checkTimeout(stato);
  return { ok: true };
}

/**
 * Process one frame of squat tracking and update exercise state.
 * @param {Object} stato - Current state of the squat session.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} lato - Side of the body used for landmark selection.
 * @returns {Object} - Updated state, event, angles, and target flag.
 */
export function processSquat(stato, landmarks, lato) {
  const cfg = ESERCIZI.SQUAT.thresholds;
  const { hip, knee, ankle } = ESERCIZI.SQUAT.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();
  const guardia = verificaVisibilitaEOcclusione(stato, lm, [hip, knee, ankle]);
  if (!guardia.ok) return guardia.result;

  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ginocchioGrezzo);
  const angoloGinocchio = stato.smoothedPrimary;
  const m = stato.metrics;
  let evento = null;

  if (adesso - stato.startTime < ENGINE.SETUP_GRACE_MS) {
    stato.lastAngle = angoloGinocchio;
    return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloGinocchio;
    return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: m.deepEnough };
  }

  m.lowestKneeAngle = Math.min(m.lowestKneeAngle ?? 180, angoloGinocchio);

  const controllaProfondita = () => {
    if (angoloGinocchio <= cfg.bottomKnee) m.deepEnough = true;
  };

  if (stato.movementState === 'STANDING') {
    if (angoloGinocchio < cfg.topKnee - 20) {
      stato.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.lowestKneeAngle = angoloGinocchio;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    controllaProfondita();
    if (checkAscent(stato, angoloGinocchio)) stato.movementState = 'ASCENDING';
  }
  else if (stato.movementState === 'ASCENDING') {
    controllaProfondita();

    if (angoloGinocchio > cfg.topKnee) {
      const durataRep = adesso - m.repStartTime;

      if (m.lowestKneeAngle > cfg.minAttemptKnee) {
        stato.movementState = 'STANDING';
        m.deepEnough = false;
        m.lowestKneeAngle = 180;
        stato.lastAngleHistory = [];
        return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
      }

      if (durataRep < cfg.minRepDurationMs) {
        gestisciOverlayVeloce(m, adesso, 'ESECUZIONI TROPPO VELOCI');
        evento = { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };
        stato.movementState = 'STANDING';
        m.deepEnough = false;
        m.lowestKneeAngle = 180;
        stato.lastAngleHistory = [];
        m.cooldownUntil = adesso + cfg.cooldownMs;
        return { state: stato, event: evento, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
      }

      m.fastRepCount = 0;

      evento = m.deepEnough
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };

      stato.movementState = 'STANDING';
      m.deepEnough = false;
      m.lowestKneeAngle = 180;
      stato.lastAngleHistory = [];
      m.cooldownUntil = adesso + cfg.cooldownMs;
    }
  }

  stato.lastAngle = angoloGinocchio;
  return { state: stato, event: evento, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: m.deepEnough };
}

/**
 * Process one frame of deadlift tracking and update exercise state.
 * @param {Object} stato - Current state of the deadlift session.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} lato - Side of the body used for landmark selection.
 * @returns {Object} - Updated state, event, angles, and target flag.
 */
export function processDeadlift(stato, landmarks, lato) {
  const cfg = ESERCIZI.DEADLIFT.thresholds;
  const { shoulder: idxSpalla, hip, knee, ankle } = ESERCIZI.DEADLIFT.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();
  const guardia = verificaVisibilitaEOcclusione(stato, lm, [hip, knee]);
  if (!guardia.ok) return guardia.result;

  const spallaLm = getShoulderLandmark(lm, idxSpalla, lm[hip]);
  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const ancaGrezza = calculateAngle(spallaLm, lm[hip], lm[knee]);

  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ancaGrezza);
  stato.smoothedSecondary = smoothAngle(stato.smoothedSecondary, ginocchioGrezzo);

  const angoloAnca = stato.smoothedPrimary;
  const angoloGinocchio = stato.smoothedSecondary;
  const m = stato.metrics;

  const lockoutGinocchio = (cfg.erectKnee || 165) - 25; // circa 140°
  const lockoutAnca = (cfg.erectHip || 165) - 20; // circa 145°

  const eretto = angoloGinocchio > lockoutGinocchio && angoloAnca > lockoutAnca;

  let evento = null;

  if (adesso - stato.startTime < ENGINE.SETUP_GRACE_MS) {
    stato.lastAngle = angoloAnca;
    return { state: stato, event: null, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: m.targetReached || eretto };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloAnca;
    return { state: stato, event: null, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: m.targetReached || eretto };
  }

  if (stato.movementState === 'STANDING') {
    if (!eretto && angoloAnca < lockoutAnca - 15) {
      stato.movementState = 'SETUP';
      stato.lastAngleHistory = [];
      m.repStartTime = adesso;
      m.targetReached = false;
    }
  }
  else if (stato.movementState === 'SETUP') {
    if (checkAscent(stato, angoloAnca)) {
      stato.movementState = 'LIFTING';
      m.repStartTime = adesso;
    }
  }
  else if (stato.movementState === 'LIFTING') {
    if (eretto) {
      evento = { type: 'VALID_REP', faults: [] };
      m.targetReached = true;

      stato.movementState = 'STANDING';
      m.repStartTime = null;
      m.cooldownUntil = adesso + cfg.cooldownMs;
    }
  }

  stato.lastAngle = angoloAnca;
  return { state: stato, event: evento, primaryAngle: angoloAnca, secondaryAngle: angoloGinocchio, isTarget: m.targetReached || eretto };
}

/**
 * Process one frame of overhead press tracking and update exercise state.
 * @param {Object} stato - Current state of the overhead press session.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} lato - Side of the body used for landmark selection.
 * @returns {Object} - Updated state, event, angles, and target flag.
 */
export function processOverheadPress(stato, landmarks, lato) {
  const cfg = ESERCIZI.OVERHEAD_PRESS.thresholds;
  const { shoulder: idxSpalla, elbow: idxGomito, wrist, hip, knee, ankle } = ESERCIZI.OVERHEAD_PRESS.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();
  const guardia = verificaVisibilitaEOcclusione(stato, lm, [idxSpalla, hip, knee, ankle]);
  if (!guardia.ok) return guardia.result;

  const gomitoLm = getElbowLandmark(lm, idxGomito, lm[idxSpalla], lm[wrist]);
  const gomitoGrezzo = calculateAngle(lm[idxSpalla], gomitoLm, lm[wrist]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, gomitoGrezzo);
  const angoloGomito = stato.smoothedPrimary;
  const verticale = { x: lm[idxSpalla].x, y: lm[idxSpalla].y - 0.1 };
  const troncoGrezzo = calculateAngle(verticale, lm[idxSpalla], lm[hip]);
  stato.smoothedSecondary = smoothAngle(stato.smoothedSecondary, troncoGrezzo);
  const angoloTronco = stato.smoothedSecondary;
  const m = stato.metrics;
  let evento = null;

  if (adesso - stato.startTime < ENGINE.SETUP_GRACE_MS) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: m.targetReached || angoloGomito > cfg.topElbow };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: m.targetReached || angoloGomito > cfg.topElbow };
  }

  m.lowestElbowAngle = Math.min(m.lowestElbowAngle ?? 180, angoloGomito);

  if (stato.movementState === 'STANDING') {
    if (angoloGomito < cfg.bottomElbow) {
      stato.movementState = 'DESCENDING';
      m.lowestElbowAngle = angoloGomito;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
      m.targetReached = false;
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    if (checkAscent(stato, angoloGomito)) {
      stato.movementState = 'ASCENDING';
    }
  }
  else if (stato.movementState === 'ASCENDING') {
    if (angoloGomito > cfg.topElbow) {
      const durataRep = adesso - m.repStartTime;

      if (durataRep < cfg.minRepDurationMs) {
        gestisciOverlayVeloce(m, adesso, 'ESECUZIONI TROPPO VELOCI');
        evento = { type: 'NO_REP', faults: ['Spinta troppo veloce'] };
        stato.movementState = 'STANDING';
        m.lowestElbowAngle = 180;
        stato.lastAngleHistory = [];
        stato.lastAngle = angoloGomito;
        m.cooldownUntil = adesso + cfg.cooldownMs;
        m.targetReached = false;
        return { state: stato, event: evento, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
      }

      m.fastRepCount = 0;

      if (m.lowestElbowAngle > cfg.minAttemptElbow) {
        stato.movementState = 'STANDING';
        m.lowestElbowAngle = 180;
        stato.lastAngleHistory = [];
        stato.lastAngle = angoloGomito;
        return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
      }

      evento = { type: 'VALID_REP', faults: [] };

      stato.movementState = 'STANDING';
      m.lowestElbowAngle = 180;
      stato.lastAngleHistory = [];
      m.cooldownUntil = adesso + cfg.cooldownMs;
      m.targetReached = true;
    }
  }

  stato.lastAngle = angoloGomito;
  return { state: stato, event: evento, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: m.targetReached || angoloGomito > cfg.topElbow };
}

/**
 * Route a frame update to the correct exercise processing function.
 * @param {string} esercizio - The selected exercise name.
 * @param {Object} stato - Current exercise state.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} lato - Side of the body to evaluate.
 * @returns {Object} - Updated state, event, and angle values.
 */
export function processFrame(esercizio, stato, landmarks, lato) {
  if (esercizio === 'SQUAT') return processSquat(stato, landmarks, lato);
  if (esercizio === 'DEADLIFT') return processDeadlift(stato, landmarks, lato);
  if (esercizio === 'OVERHEAD_PRESS') return processOverheadPress(stato, landmarks, lato);
  return { state: stato, event: null };
}
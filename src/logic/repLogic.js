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
export function createInitialState(timestampMs = null) {
  // The clock is injected by usePose: media time for files, monotonic time for
  // live capture. Null delays initialization until the first processed frame.
  const initialTime = Number.isFinite(timestampMs) ? timestampMs : null;
  return {
    movementState: 'STANDING',
    smoothedPrimary: null,
    smoothedSecondary: null,
    lastAngle: 180,
    lastAngleHistory: [],
    lastActiveTime: initialTime,
    startTime: initialTime,
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
      targetReached: false,
      squatSetActive: false,
      // Squat trajectory metrics reject setup and walk-away motion around the rack.
      squatStandingGeometry: null,
      squatStartGeometry: null,
      squatMaxHipDescent: 0,
      squatMaxAnkleTravel: 0,
      // Press trajectory metrics confirm that elbow lockout follows a real wrist ascent.
      pressLowestWristElevation: null,
      pressLockoutCandidateSince: null,
    },
  };
}

/**
 * Returns normalized reference points used to distinguish a squat from rack motion.
 */
function getSquatGeometry(landmarks, hipIndex, ankleIndex) {
  const hip = landmarks[hipIndex];
  const ankle = landmarks[ankleIndex];
  if (!hip || !ankle ||
    [hip, ankle].some(point => point.visibility <= ENGINE.VISIBILITY_THRESHOLD)) return null;

  const legLength = Math.hypot(hip.x - ankle.x, hip.y - ankle.y);
  if (legLength <= 0.08) return null;

  return {
    hip: { x: hip.x, y: hip.y },
    ankle: { x: ankle.x, y: ankle.y },
    legLength,
  };
}

/**
 * Updates the largest hip descent and ankle displacement observed in the attempt.
 */
function updateSquatTrajectory(metrics, geometry) {
  const start = metrics.squatStartGeometry;
  if (!start || !geometry) return;

  const hipDescent = (geometry.hip.y - start.hip.y) / start.legLength;
  const ankleTravel = Math.hypot(
    geometry.ankle.x - start.ankle.x,
    geometry.ankle.y - start.ankle.y
  ) / start.legLength;

  metrics.squatMaxHipDescent = Math.max(metrics.squatMaxHipDescent, hipDescent);
  metrics.squatMaxAnkleTravel = Math.max(metrics.squatMaxAnkleTravel, ankleTravel);
}

/**
 * Clears the current squat attempt without changing the completed repetition count.
 */
function resetSquatAttempt(stato) {
  stato.movementState = 'STANDING';
  stato.lastAngleHistory = [];
  stato.metrics.deepEnough = false;
  stato.metrics.lowestKneeAngle = 180;
  stato.metrics.squatStartGeometry = null;
  stato.metrics.squatMaxHipDescent = 0;
  stato.metrics.squatMaxAnkleTravel = 0;
}

/**
 * Returns wrist position relative to torso length for press trajectory validation.
 */
function getPressWristGeometry(landmarks, shoulderIndex, wristIndex, hipIndex) {
  const shoulder = landmarks[shoulderIndex];
  const wrist = landmarks[wristIndex];
  const hip = landmarks[hipIndex];
  if (!shoulder || !wrist || !hip ||
    hip.visibility <= ENGINE.VISIBILITY_THRESHOLD) return null;

  const torsoLength = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  if (torsoLength <= 0.05) return null;

  return {
    elevation: (shoulder.y - wrist.y) / torsoLength,
    horizontalOffset: Math.abs(wrist.x - shoulder.x) / torsoLength,
  };
}

/**
 * Clears the current press attempt without changing the completed repetition count.
 */
function resetPressAttempt(stato) {
  stato.movementState = 'STANDING';
  stato.lastAngleHistory = [];
  stato.metrics.lowestElbowAngle = 180;
  stato.metrics.pressLowestWristElevation = null;
  stato.metrics.pressLockoutCandidateSince = null;
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
 * Checks whether the three landmarks of the selected arm are reliable enough
 * for overhead press analysis.
 * @param {Array} landmarks - The array of MediaPipe landmarks.
 * @param {'LEFT'|'RIGHT'} side - Side locked by the camera tracker.
 * @returns {boolean} - True when shoulder, elbow, and wrist are usable.
 */
function isSelectedArmVisible(landmarks, side) {
  const { shoulder, elbow, wrist } = ESERCIZI.OVERHEAD_PRESS.landmarks[side];
  return [shoulder, elbow, wrist].every((index) => {
    const point = landmarks[index];
    return point &&
      point.visibility > ENGINE.VISIBILITY_THRESHOLD &&
      point.x >= 0 && point.x <= 1 &&
      point.y >= 0 && point.y <= 1;
  });
}

/**
 * Helper function to check if the session has timed out due to inactivity.
 * @param {Object} stato - The current state of the exercise.
 */
function checkTimeout(stato, adesso) {
  // Never read wall-clock time here: every temporal FSM decision must use the
  // same clock supplied with the current frame.
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
    stato.metrics.squatSetActive = false;
    stato.metrics.squatStandingGeometry = null;
    stato.metrics.squatStartGeometry = null;
    stato.metrics.squatMaxHipDescent = 0;
    stato.metrics.squatMaxAnkleTravel = 0;
    stato.metrics.pressLowestWristElevation = null;
    stato.metrics.pressLockoutCandidateSince = null;
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
function handleOcclusion(stato, adesso) {
  // Occlusion duration follows the analysis timeline, not processing latency.
  if (stato.occludedSince === null) {
    stato.occludedSince = adesso;
    return { occluded: true, shouldReset: false };
  }
  if (adesso - stato.occludedSince > ENGINE.OCCLUSION_RESET_MS && stato.movementState !== 'STANDING') {
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
function verificaVisibilitaEOcclusione(stato, lm, indiciRichiesti, adesso) {
  const visibile = indiciRichiesti.every((i) => lm[i]?.visibility > ENGINE.VISIBILITY_THRESHOLD);

  if (!visibile) {
    const { shouldReset } = handleOcclusion(stato, adesso);
    const statoRisultante = shouldReset ? createInitialState(adesso) : stato;
    return {
      ok: false,
      result: { state: statoRisultante, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false },
    };
  }

  stato.occludedSince = null;
  checkTimeout(stato, adesso);
  return { ok: true };
}

/**
 * Process one frame of squat tracking and update exercise state.
 * @param {Object} stato - Current state of the squat session.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} lato - Side of the body used for landmark selection.
 * @returns {Object} - Updated state, event, angles, and target flag.
 */
export function processSquat(stato, landmarks, lato, timestampMs = performance.now()) {
  const cfg = ESERCIZI.SQUAT.thresholds;
  const { hip, knee, ankle } = ESERCIZI.SQUAT.landmarks[lato];
  const lm = landmarks;
  const adesso = timestampMs;
  if (stato.startTime === null) stato.startTime = adesso;
  if (stato.lastActiveTime === null) stato.lastActiveTime = adesso;
  const guardia = verificaVisibilitaEOcclusione(stato, lm, [hip, knee, ankle], adesso);
  if (!guardia.ok) return guardia.result;

  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ginocchioGrezzo);
  const angoloGinocchio = stato.smoothedPrimary;
  const m = stato.metrics;
  const geometriaSquat = getSquatGeometry(lm, hip, ankle);
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
    // Keep the latest standing pose as the trajectory baseline for this attempt.
    if (geometriaSquat && angoloGinocchio >= cfg.topKnee - 5) {
      m.squatStandingGeometry = geometriaSquat;
    }
    if (geometriaSquat && angoloGinocchio < cfg.topKnee - 20) {
      stato.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.lowestKneeAngle = angoloGinocchio;
      m.squatStartGeometry = m.squatStandingGeometry ?? geometriaSquat;
      m.squatMaxHipDescent = 0;
      m.squatMaxAnkleTravel = 0;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    updateSquatTrajectory(m, geometriaSquat);
    controllaProfondita();
    if (checkAscent(stato, angoloGinocchio)) stato.movementState = 'ASCENDING';
  }
  else if (stato.movementState === 'ASCENDING') {
    updateSquatTrajectory(m, geometriaSquat);
    controllaProfondita();

    if (angoloGinocchio > cfg.topKnee) {
      // A stable setup starts the set; later deep reps remain valid despite small foot shifts.
      const appoggioStabile = m.squatMaxAnkleTravel <= cfg.maxAnkleTravelLeg;
      const discesaConfermata = m.squatMaxHipDescent >= cfg.minHipDescentLeg;
      const ripetizioneProfondaInSerie = m.squatSetActive && m.deepEnough;
      const traiettoriaSquatValida = ripetizioneProfondaInSerie ||
        (appoggioStabile && (m.squatSetActive || discesaConfermata));

      if (!traiettoriaSquatValida) {
        if (!appoggioStabile) m.squatSetActive = false;
        resetSquatAttempt(stato);
        stato.lastAngle = angoloGinocchio;
        return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
      }

      if (m.lowestKneeAngle > cfg.minAttemptKnee) {
        resetSquatAttempt(stato);
        return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
      }

      evento = m.deepEnough
        ? { type: 'VALID_REP', faults: [] }
        : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };

      m.squatSetActive = true;
      resetSquatAttempt(stato);
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
export function processDeadlift(stato, landmarks, lato, timestampMs = performance.now()) {
  const cfg = ESERCIZI.DEADLIFT.thresholds;
  const { shoulder: idxSpalla, hip, knee, ankle } = ESERCIZI.DEADLIFT.landmarks[lato];
  const lm = landmarks;
  const adesso = timestampMs;
  if (stato.startTime === null) stato.startTime = adesso;
  if (stato.lastActiveTime === null) stato.lastActiveTime = adesso;
  const guardia = verificaVisibilitaEOcclusione(stato, lm, [hip, knee], adesso);
  if (!guardia.ok) return guardia.result;

  const spallaLm = getShoulderLandmark(lm, idxSpalla, lm[hip]);
  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  const ancaGrezza = calculateAngle(spallaLm, lm[hip], lm[knee]);

  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ancaGrezza);
  stato.smoothedSecondary = smoothAngle(stato.smoothedSecondary, ginocchioGrezzo);

  const angoloAnca = stato.smoothedPrimary;
  const angoloGinocchio = stato.smoothedSecondary;
  const m = stato.metrics;

  const lockoutGinocchio = (cfg.erectKnee || 165) - 25;
  const lockoutAnca = (cfg.erectHip || 165) - 20;

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
export function processOverheadPress(stato, landmarks, lato, timestampMs = performance.now()) {
  const cfg = ESERCIZI.OVERHEAD_PRESS.thresholds;
  const lm = landmarks;
  const adesso = timestampMs;
  if (stato.startTime === null) stato.startTime = adesso;
  if (stato.lastActiveTime === null) stato.lastActiveTime = adesso;
  const m = stato.metrics;

  if (!isSelectedArmVisible(lm, lato)) {
    const { shouldReset } = handleOcclusion(stato, adesso);
    const statoRisultante = shouldReset ? createInitialState(adesso) : stato;
    return {
      state: statoRisultante,
      event: null,
      primaryAngle: null,
      secondaryAngle: null,
      isTarget: false,
    };
  }

  const { shoulder: idxSpalla, elbow: idxGomito, wrist, hip } = ESERCIZI.OVERHEAD_PRESS.landmarks[lato];
  const guardia = verificaVisibilitaEOcclusione(stato, lm, [idxSpalla, idxGomito, wrist], adesso);
  if (!guardia.ok) return guardia.result;

  const gomitoGrezzo = calculateAngle(lm[idxSpalla], lm[idxGomito], lm[wrist]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, gomitoGrezzo);
  const angoloGomito = stato.smoothedPrimary;
  const anca = lm[hip];
  if (anca?.visibility > ENGINE.VISIBILITY_THRESHOLD) {
    const verticale = { x: lm[idxSpalla].x, y: lm[idxSpalla].y - 0.1 };
    const troncoGrezzo = calculateAngle(verticale, lm[idxSpalla], anca);
    stato.smoothedSecondary = smoothAngle(stato.smoothedSecondary, troncoGrezzo);
  }
  const angoloTronco = stato.smoothedSecondary;
  const geometriaPolso = getPressWristGeometry(lm, idxSpalla, wrist, hip);
  let evento = null;

  if (adesso - stato.startTime < ENGINE.SETUP_GRACE_MS) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: angoloGomito > cfg.topElbow };
  }

  if (adesso < m.cooldownUntil) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: angoloGomito > cfg.topElbow };
  }

  m.lowestElbowAngle = Math.min(m.lowestElbowAngle ?? 180, angoloGomito);

  if (stato.movementState === 'STANDING') {
    if (angoloGomito < cfg.bottomElbow) {
      stato.movementState = 'DESCENDING';
      m.lowestElbowAngle = angoloGomito;
      m.pressLowestWristElevation = geometriaPolso?.elevation ?? null;
      m.pressLockoutCandidateSince = null;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
      m.targetReached = false;
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    if (geometriaPolso) {
      m.pressLowestWristElevation = Math.min(
        m.pressLowestWristElevation ?? geometriaPolso.elevation,
        geometriaPolso.elevation
      );
    }
    if (checkAscent(stato, angoloGomito)) {
      stato.movementState = 'ASCENDING';
    }
  }
  else if (stato.movementState === 'ASCENDING') {
    if (geometriaPolso) {
      m.pressLowestWristElevation = Math.min(
        m.pressLowestWristElevation ?? geometriaPolso.elevation,
        geometriaPolso.elevation
      );
    }
    if (m.pressLockoutCandidateSince !== null && angoloGomito < cfg.bottomElbow - 10) {
      // The arm descended again before wrist trajectory confirmed the lockout.
      resetPressAttempt(stato);
      stato.lastAngle = angoloGomito;
      return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
    }

    if (angoloGomito > cfg.topElbow) {

      if (m.lowestElbowAngle > cfg.minAttemptElbow) {
        resetPressAttempt(stato);
        stato.lastAngle = angoloGomito;
        return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
      }

      const escursionePolso = geometriaPolso && m.pressLowestWristElevation !== null
        ? geometriaPolso.elevation - m.pressLowestWristElevation
        : 0;
      const lockoutPolsoValido = geometriaPolso &&
        escursionePolso >= cfg.minWristTravelTorso &&
        geometriaPolso.elevation >= cfg.minLockoutWristElevationTorso &&
        geometriaPolso.horizontalOffset <= cfg.maxLockoutWristHorizontalOffsetTorso;

      if (!lockoutPolsoValido) {
        // Hold the elbow lockout briefly while waiting for the wrist to reach its valid position.
        if (m.pressLockoutCandidateSince === null) m.pressLockoutCandidateSince = adesso;
        if (adesso - m.pressLockoutCandidateSince >= cfg.lockoutConfirmationMs) {
          resetPressAttempt(stato);
          stato.lastAngle = angoloGomito;
          return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
        }
      } else {
        evento = { type: 'VALID_REP', faults: [] };

        resetPressAttempt(stato);
        m.cooldownUntil = adesso + cfg.cooldownMs;
        m.targetReached = true;
      }
    }
  }

  stato.lastAngle = angoloGomito;
  return { state: stato, event: evento, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: angoloGomito > cfg.topElbow };
}

/**
 * Route a frame update to the correct exercise processing function.
 * @param {string} esercizio - The selected exercise name.
 * @param {Object} stato - Current exercise state.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} lato - Side of the body to evaluate.
 * @returns {Object} - Updated state, event, and angle values.
 */
export function processFrame(esercizio, stato, landmarks, lato, timestampMs = performance.now()) {
  if (esercizio === 'SQUAT') return processSquat(stato, landmarks, lato, timestampMs);
  if (esercizio === 'DEADLIFT') return processDeadlift(stato, landmarks, lato, timestampMs);
  if (esercizio === 'OVERHEAD_PRESS') return processOverheadPress(stato, landmarks, lato, timestampMs);
  return { state: stato, event: null };
}

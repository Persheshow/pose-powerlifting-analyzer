import { ESERCIZI, SMOOTHING, ENGINE } from '../config/exercises.js';

const VISIBILITY_EXIT_THRESHOLD = ENGINE.VISIBILITY_EXIT_THRESHOLD ?? ENGINE.VISIBILITY_THRESHOLD;

function getValidationVisibility(landmark) {
  return landmark?.validationVisibility ?? landmark?.visibility ?? 0;
}

function hasCountingVisibility(landmarks, indices) {
  const threshold = ENGINE.COUNT_VISIBILITY_THRESHOLD ?? ENGINE.VISIBILITY_THRESHOLD;
  return indices.every((index) => {
    const landmark = landmarks[index];
    return landmark && !landmark.frozen && (landmark.visibility ?? 0) >= threshold;
  });
}

/**
 * Smooth the current angle and rate-limit physically unlikely jumps.
 * @param {number|null} previousAngle - The previous smoothed angle.
 * @param {number} currentAngle - The current raw angle measurement.
 * @returns {number} - The updated smoothed angle.
 */
export function smoothAngle(previousAngle, currentAngle) {
  if (previousAngle === null) return currentAngle;

  const maxStep = ENGINE.MAX_ANGLE_STEP_DEG ?? 30;
  const angleDelta = Math.abs(currentAngle - previousAngle);

  // Large jumps can happen after temporary landmark occlusion. Clamping lets
  // the signal recover gradually instead of freezing forever at the old angle.
  if (angleDelta > maxStep) {
    return previousAngle + Math.sign(currentAngle - previousAngle) * maxStep;
  }

  return (currentAngle * SMOOTHING.alpha) + (previousAngle * SMOOTHING.beta);
}

/**
 * Calculate the angle in degrees formed by the vectors BA and BC.
 * @param {Object} pointA - First point of the angle.
 * @param {Object} vertex - Vertex point of the angle.
 * @param {Object} pointC - Third point of the angle.
 * @returns {number} - Angle between vectors BA and BC in degrees.
 */
export function calculateAngle(pointA, vertex, pointC) {
  const vectorBA = { x: pointA.x - vertex.x, y: pointA.y - vertex.y };
  const vectorBC = { x: pointC.x - vertex.x, y: pointC.y - vertex.y };

  const dotProduct = (vectorBA.x * vectorBC.x) + (vectorBA.y * vectorBC.y);
  const lengthBA = Math.sqrt(vectorBA.x * vectorBA.x + vectorBA.y * vectorBA.y);
  const lengthBC = Math.sqrt(vectorBC.x * vectorBC.x + vectorBC.y * vectorBC.y);

  if (lengthBA === 0 || lengthBC === 0) return 0;

  let angleCosine = dotProduct / (lengthBA * lengthBC);
  angleCosine = Math.max(-1.0, Math.min(1.0, angleCosine));

  return (Math.acos(angleCosine) * 180.0) / Math.PI;
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
      deepEnough: false,
      cooldownUntil: 0,
      repStartTime: 0,
      lowestKneeAngle: 180,
      lowestElbowAngle: 180,
      targetReached: false,
      bottomFrames: 0,
      lockoutFrames: 0,
      bottomWristY: null,
      lockoutWristY: null,
      squatArmed: false,
      squatReadyFrames: 0,
      squatReadyHip: null,
      squatReadyAngleMin: null,
      squatReadyAngleMax: null,
      squatTopFrames: 0,
      squatAttemptStartHip: null,
      squatAttemptTranslation: 0,
      squatLowestHipY: null,
      squatLegLength: null,
    },
  };
}

/**
 * Helper function to get the shoulder landmark, handling occlusion and mirroring.
 * @param {Array} landmarks - The array of landmarks.
 * @param {number} primaryIndex - The index of the main shoulder landmark.
 * @param {Object} hipLandmark - The hip landmark.
 * @returns {Object} - The shoulder landmark or a default value.
 */
function getShoulderLandmark(landmarks, primaryIndex, hipLandmark) {
  const oppositeIndex = primaryIndex === 11 ? 12 : 11;
  const primaryLandmark = landmarks[primaryIndex];
  const oppositeLandmark = landmarks[oppositeIndex];
  if (primaryLandmark && getValidationVisibility(primaryLandmark) >= VISIBILITY_EXIT_THRESHOLD) return primaryLandmark;
  if (oppositeLandmark && getValidationVisibility(oppositeLandmark) >= VISIBILITY_EXIT_THRESHOLD) {
    return { ...oppositeLandmark, x: 1 - oppositeLandmark.x };
  }
  return { x: hipLandmark.x, y: hipLandmark.y - 0.25, visibility: ENGINE.VISIBILITY_THRESHOLD };
}


/**
 * Helper function to get the elbow landmark, handling occlusion and mirroring.
 * @param {Array} landmarks - The array of landmarks.
 * @param {number} primaryIndex - The index of the main elbow landmark.
 * @param {Object} shoulderLandmark - The shoulder landmark.
 * @param {Object} wristLandmark - The wrist landmark.
 * @returns {Object} - The elbow landmark or a default value.
 */
function getElbowLandmark(landmarks, primaryIndex, shoulderLandmark, wristLandmark) {
  const oppositeIndex = primaryIndex === 13 ? 14 : 13;
  const primaryLandmark = landmarks[primaryIndex];
  const oppositeLandmark = landmarks[oppositeIndex];
  if (primaryLandmark && getValidationVisibility(primaryLandmark) >= VISIBILITY_EXIT_THRESHOLD) return primaryLandmark;
  if (oppositeLandmark && getValidationVisibility(oppositeLandmark) >= VISIBILITY_EXIT_THRESHOLD) {
    return { ...oppositeLandmark, x: 1 - oppositeLandmark.x };
  }
  if (shoulderLandmark && wristLandmark) {
    return {
      x: (shoulderLandmark.x + wristLandmark.x) / 2,
      y: (shoulderLandmark.y + wristLandmark.y) / 2,
      visibility: ENGINE.VISIBILITY_THRESHOLD,
    };
  }
  return primaryLandmark;
}

/**
 * Helper function to check if the session has timed out due to inactivity.
 * @param {Object} state - The current state of the exercise.
 */
function checkTimeout(state) {
  const now = Date.now();
  if (state.movementState === 'STANDING') {
    state.lastActiveTime = now;
    return;
  }
  if (now - state.lastActiveTime > ENGINE.SESSION_TIMEOUT_MS) {
    state.movementState = 'STANDING';
    state.metrics.deepEnough = false;
    state.metrics.targetReached = false;
    state.metrics.lowestKneeAngle = 180;
    state.metrics.lowestElbowAngle = 180;
    state.metrics.bottomFrames = 0;
    state.metrics.lockoutFrames = 0;
    state.metrics.bottomWristY = null;
    state.metrics.lockoutWristY = null;
    state.metrics.squatTopFrames = 0;
    state.metrics.squatAttemptStartHip = null;
    state.metrics.squatAttemptTranslation = 0;
    state.metrics.squatLowestHipY = null;
    state.metrics.squatLegLength = null;
    state.lastAngleHistory = [];
    state.lastActiveTime = now;
  }
}

/**
 * Helper function to check if the current angle indicates an ascent phase.
 * @param {Object} state - The current state of the exercise.
 * @param {number} currentAngle - The current angle being evaluated.
 * @returns {boolean} - True if the current angle indicates an ascent phase, false otherwise.
 */
function checkAscent(state, currentAngle) {
  state.lastAngleHistory.push(currentAngle);
  if (state.lastAngleHistory.length > ENGINE.ASCENT_HISTORY_LEN) {
    state.lastAngleHistory.shift();
  }
  if (state.lastAngleHistory.length < 3) return false;

  const oldestAngle = state.lastAngleHistory[0];
  return currentAngle > oldestAngle + ENGINE.ASCENT_MIN_DELTA_DEG;
}

/**
 * Helper function to handle occlusion of landmarks.
 * @param {Object} state - The current state of the exercise.
 * @returns {Object} - An object indicating if the landmarks are occluded and if a reset is needed.
 */
function handleOcclusion(state) {
  if (!state.occludedSince) {
    state.occludedSince = Date.now();
    return { occluded: true, shouldReset: false };
  }
  if (Date.now() - state.occludedSince > ENGINE.OCCLUSION_RESET_MS && state.movementState !== 'STANDING') {
    return { occluded: true, shouldReset: true };
  }
  return { occluded: true, shouldReset: false };
}

/**
 * Helper function to check visibility and occlusion of required landmarks.
 * @param {Object} state - The current state of the exercise.
 * @param {Array} landmarks - The array of landmarks.
 * @param {Array} requiredIndices - The indices of required landmarks to check.
 * @returns {Object} - An object indicating if the landmarks are visible and not occluded, and the resulting state if not.
 */
function validateLandmarkVisibility(state, landmarks, requiredIndices) {
  const areVisible = requiredIndices.every(
    (index) => getValidationVisibility(landmarks[index]) >= VISIBILITY_EXIT_THRESHOLD
  );

  if (!areVisible) {
    const { shouldReset } = handleOcclusion(state);
    const resultingState = shouldReset ? createInitialState() : state;
    return {
      ok: false,
      result: { state: resultingState, event: null, primaryAngle: null, secondaryAngle: null, isTarget: false },
    };
  }

  state.occludedSince = null;
  checkTimeout(state);
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
  const guardia = validateLandmarkVisibility(stato, lm, [hip, knee, ankle]);
  if (!guardia.ok) return guardia.result;

  const ginocchioGrezzo = calculateAngle(lm[hip], lm[knee], lm[ankle]);
  stato.smoothedPrimary = smoothAngle(stato.smoothedPrimary, ginocchioGrezzo);
  const angoloGinocchio = stato.smoothedPrimary;
  const m = stato.metrics;
  let evento = null;

  // Arm squat validation only after a stable standing setup. This keeps
  // walk-in and unrack movements outside the repetition state machine.
  if (!m.squatArmed) {
    if (angoloGinocchio < cfg.topKnee) {
      m.squatReadyFrames = 0;
      m.squatReadyHip = null;
      m.squatReadyAngleMin = null;
      m.squatReadyAngleMax = null;
    } else if (!m.squatReadyHip) {
      m.squatReadyFrames = 1;
      m.squatReadyHip = { x: lm[hip].x, y: lm[hip].y };
      m.squatReadyAngleMin = angoloGinocchio;
      m.squatReadyAngleMax = angoloGinocchio;
    } else {
      const hipDisplacement = Math.hypot(
        lm[hip].x - m.squatReadyHip.x,
        lm[hip].y - m.squatReadyHip.y
      );
      const angleMin = Math.min(m.squatReadyAngleMin, angoloGinocchio);
      const angleMax = Math.max(m.squatReadyAngleMax, angoloGinocchio);
      const stableStanding = hipDisplacement <= cfg.readyMaxHipDisplacement &&
        angleMax - angleMin <= cfg.readyMaxAngleRange;

      if (stableStanding) {
        m.squatReadyFrames += 1;
        m.squatReadyAngleMin = angleMin;
        m.squatReadyAngleMax = angleMax;
      } else {
        m.squatReadyFrames = 1;
        m.squatReadyHip = { x: lm[hip].x, y: lm[hip].y };
        m.squatReadyAngleMin = angoloGinocchio;
        m.squatReadyAngleMax = angoloGinocchio;
      }
    }

    m.squatArmed = m.squatReadyFrames >= cfg.readyHoldFrames;
    stato.movementState = 'STANDING';
    stato.lastAngle = angoloGinocchio;
    return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
  }

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

  // Track whole-body translation separately from vertical squat travel so a
  // walkout can be discarded without weakening shallow-squat validation.
  if (stato.movementState !== 'STANDING' && m.squatAttemptStartHip) {
    const translation = Math.hypot(
      lm[hip].x - m.squatAttemptStartHip.x,
      (lm[hip].z ?? 0) - m.squatAttemptStartHip.z
    );
    m.squatAttemptTranslation = Math.max(m.squatAttemptTranslation, translation);
    m.squatLowestHipY = Math.max(m.squatLowestHipY ?? lm[hip].y, lm[hip].y);
  }

  if (stato.movementState === 'STANDING') {
    if (angoloGinocchio < cfg.topKnee - 20) {
      stato.movementState = 'DESCENDING';
      m.deepEnough = false;
      m.lowestKneeAngle = angoloGinocchio;
      m.repStartTime = adesso;
      m.squatTopFrames = 0;
      m.squatAttemptStartHip = { x: lm[hip].x, y: lm[hip].y, z: lm[hip].z ?? 0 };
      m.squatAttemptTranslation = 0;
      m.squatLowestHipY = lm[hip].y;
      m.squatLegLength = Math.hypot(lm[hip].x - lm[ankle].x, lm[hip].y - lm[ankle].y);
      stato.lastAngleHistory = [];
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    controllaProfondita();
    if (checkAscent(stato, angoloGinocchio)) stato.movementState = 'ASCENDING';
  }
  else if (stato.movementState === 'ASCENDING') {
    controllaProfondita();
    // Knee extension alone can spike while the athlete is still in the hole;
    // hip ascent provides an independent, body-scale-normalized lockout check.
    const hipAscent = (m.squatLowestHipY ?? lm[hip].y) - lm[hip].y;
    const requiredHipAscent = (m.squatLegLength ?? 0) * (cfg.minHipAscentLegRatio ?? 0.12);
    const standingLockout = angoloGinocchio > cfg.topKnee && hipAscent >= requiredHipAscent;
    m.squatTopFrames = standingLockout ? m.squatTopFrames + 1 : 0;

    if (m.squatTopFrames >= (cfg.topHoldFrames ?? 1)) {

      const wasPreparation = !m.deepEnough &&
        m.squatAttemptTranslation >= (cfg.preparationTranslation ?? Number.POSITIVE_INFINITY);

      if (m.lowestKneeAngle > cfg.minAttemptKnee || wasPreparation) {
        stato.movementState = 'STANDING';
        m.deepEnough = false;
        m.lowestKneeAngle = 180;
        m.squatTopFrames = 0;
        m.squatAttemptStartHip = null;
        m.squatAttemptTranslation = 0;
        m.squatLowestHipY = null;
        m.squatLegLength = null;
        if (wasPreparation) {
          m.squatArmed = false;
          m.squatReadyFrames = 0;
          m.squatReadyHip = null;
          m.squatReadyAngleMin = null;
          m.squatReadyAngleMax = null;
        }
        stato.lastAngleHistory = [];
        return { state: stato, event: null, primaryAngle: angoloGinocchio, secondaryAngle: stato.smoothedSecondary, isTarget: false };
      }

      if (hasCountingVisibility(lm, [hip, knee, ankle])) {
        evento = m.deepEnough
          ? { type: 'VALID_REP', faults: [] }
          : { type: 'NO_REP', faults: ['Mancato superamento del parallelo'] };
      }

      stato.movementState = 'STANDING';
      m.deepEnough = false;
      m.lowestKneeAngle = 180;
      m.squatTopFrames = 0;
      m.squatAttemptStartHip = null;
      m.squatAttemptTranslation = 0;
      m.squatLowestHipY = null;
      m.squatLegLength = null;
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
  const guardia = validateLandmarkVisibility(stato, lm, [hip, knee, ankle]);
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
    if (eretto && hasCountingVisibility(lm, [hip, knee, ankle])) {
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
  const { shoulder: idxSpalla, elbow: idxGomito, wrist, hip } = ESERCIZI.OVERHEAD_PRESS.landmarks[lato];
  const lm = landmarks;
  const adesso = Date.now();
  const guardia = validateLandmarkVisibility(stato, lm, [idxSpalla, idxGomito, wrist]);
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

  // A press can only progress through its state machine while the arm used to
  // validate it is directly tracked. Estimated or frozen joints may keep the
  // overlay stable, but they must never carry an attempt toward a rep.
  const armIsVisibleForCounting = hasCountingVisibility(lm, [idxSpalla, idxGomito, wrist]);
  if (!armIsVisibleForCounting) {
    // Hidden joints pause the state machine and clear a partially observed
    // transition. Already observed lockout frames are preserved but cannot be
    // incremented until the arm is directly tracked again.
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: false };
  }
  const polsoSopraSpalla = lm[wrist].y < lm[idxSpalla].y - (cfg.wristAboveShoulderMargin ?? 0.06);
  const wristMovedUp = (m.bottomWristY ?? lm[wrist].y) - lm[wrist].y >= (cfg.minWristTravelY ?? 0);
  const lockoutFisico = polsoSopraSpalla && wristMovedUp && angoloGomito > cfg.topElbow;
  const mostraLockout = () => polsoSopraSpalla && angoloGomito > cfg.topElbow &&
    (stato.movementState === 'ASCENDING' || stato.movementState === 'LOCKED_OUT');

  if (adesso - stato.startTime < ENGINE.SETUP_GRACE_MS) {
    stato.lastAngle = angoloGomito;
    return { state: stato, event: null, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: mostraLockout() };
  }

  m.lowestElbowAngle = Math.min(m.lowestElbowAngle ?? 180, angoloGomito);

  if (stato.movementState === 'STANDING') {
    if (angoloGomito < cfg.bottomElbow) {
      stato.movementState = 'DESCENDING';
      m.lowestElbowAngle = angoloGomito;
      m.repStartTime = adesso;
      stato.lastAngleHistory = [];
      m.targetReached = false;
      m.bottomFrames = angoloGomito <= cfg.minAttemptElbow ? 1 : 0;
      m.lockoutFrames = 0;
      m.bottomWristY = lm[wrist].y;
    }
  }
  else if (stato.movementState === 'DESCENDING') {
    m.bottomWristY = Math.max(m.bottomWristY ?? lm[wrist].y, lm[wrist].y);

    if (angoloGomito <= cfg.minAttemptElbow) {
      m.bottomFrames = (m.bottomFrames ?? 0) + 1;
    }

    if ((m.bottomFrames ?? 0) >= (cfg.bottomHoldFrames ?? 1)) {
      // A directly observed lockout can close the ascent even when plates hid
      // the intermediate reversal frames. The bottom and wrist travel still
      // have to have been observed before this shortcut is allowed.
      if (lockoutFisico) {
        stato.movementState = 'ASCENDING';
        m.lockoutFrames = 1;
      } else if (checkAscent(stato, angoloGomito)) {
        stato.movementState = 'ASCENDING';
        m.lockoutFrames = 0;
      }
    }
  }
  else if (stato.movementState === 'ASCENDING') {
    m.lockoutFrames = lockoutFisico ? (m.lockoutFrames ?? 0) + 1 : 0;

    if ((m.lockoutFrames ?? 0) >= (cfg.lockoutHoldFrames ?? 1) && adesso >= m.cooldownUntil) {
      evento = { type: 'VALID_REP', faults: [] };

      stato.movementState = 'LOCKED_OUT';
      m.lowestElbowAngle = 180;
      m.bottomFrames = 0;
      m.lockoutFrames = 0;
      m.bottomWristY = null;
      m.lockoutWristY = lm[wrist].y;
      stato.lastAngleHistory = [];
      m.cooldownUntil = adesso + cfg.cooldownMs;
      m.targetReached = true;
    }
  }
  else if (stato.movementState === 'LOCKED_OUT') {
    const wristLoweredFromLockout = lm[wrist].y - (m.lockoutWristY ?? lm[wrist].y) >=
      (cfg.rearmWristDropY ?? 0.025);

    // Rearm while the descending arm is still visible, before plates can hide
    // the elbow and wrist at the bottom of the following repetition.
    if (angoloGomito < cfg.bottomElbow && wristLoweredFromLockout) {
      stato.movementState = 'DESCENDING';
      m.targetReached = false;
      m.lowestElbowAngle = angoloGomito;
      m.repStartTime = adesso;
      m.bottomFrames = angoloGomito <= cfg.minAttemptElbow ? 1 : 0;
      m.lockoutFrames = 0;
      m.bottomWristY = lm[wrist].y;
      m.lockoutWristY = null;
      stato.lastAngleHistory = [];
    }
  }

  stato.lastAngle = angoloGomito;
  return { state: stato, event: evento, primaryAngle: angoloGomito, secondaryAngle: angoloTronco, isTarget: mostraLockout() };
}

/**
 * Route a frame update to the correct exercise processing function.
 * @param {string} exercise - The selected exercise name.
 * @param {Object} state - Current exercise state.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {'LEFT'|'RIGHT'} side - Side of the body to evaluate.
 * @returns {Object} - Updated state, event, and angle values.
 */
export function processFrame(exercise, state, landmarks, side) {
  if (exercise === 'SQUAT') return processSquat(state, landmarks, side);
  if (exercise === 'DEADLIFT') return processDeadlift(state, landmarks, side);
  if (exercise === 'OVERHEAD_PRESS') return processOverheadPress(state, landmarks, side);
  return { state, event: null };
}

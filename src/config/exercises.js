/**
 * @file exercises.js
 * @description Global configuration file. Every numeric threshold used by the
 * validation engine (repLogic.js) lives here: this makes the biomechanical
 * criteria for each lift visible at a glance without reading the FSM
 * implementation.
 */

export const ESERCIZI = {
  SQUAT: {
    thresholds: {
      bottomKnee: 85, topKnee: 160, minAttemptKnee: 140,
      readyHoldFrames: 15,
      readyMaxAngleRange: 5,
      readyMaxHipDisplacement: 0.015,
      topHoldFrames: 3,
      minHipAscentLegRatio: 0.12,
      preparationTranslation: 0.05,
      cooldownMs: 800,
    },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    },
    requiredLandmarks: {
      LEFT: [23, 25, 27],
      RIGHT: [24, 26, 28]
    },
    tracking: {
      landmarkFreezeMaxFrames: 4
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
    },
    requiredLandmarks: {
      LEFT: [23, 25, 27],
      RIGHT: [24, 26, 28]
    },
    tracking: {
      landmarkFreezeMaxFrames: 8
    }
  },
  OVERHEAD_PRESS: {
    thresholds: {
      topElbow: 145, bottomElbow: 140, minAttemptElbow: 130,
      wristAboveShoulderMargin: 0.06,
      bottomHoldFrames: 1,
      lockoutHoldFrames: 1,
      minWristTravelY: 0.08,
      rearmWristDropY: 0.025,
      cooldownMs: 1200,
    },
    landmarks: {
      LEFT: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
    },
    requiredLandmarks: {
      LEFT: [11, 13, 15],
      RIGHT: [12, 14, 16]
    },
    tracking: {
      landmarkFreezeMaxFrames: 45
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
 * Parameters for the tracking/validation engine, independent of the specific exercise.
 */
export const ENGINE = {
  // Minimum MediaPipe visibility confidence required for a landmark to enter
  // the usable validation state.
  VISIBILITY_THRESHOLD: 0.7,
  // Hysteresis lower rail: once a landmark is usable, it remains usable until
  // visibility drops below this value. This avoids flickering around 0.7 when
  // plates partially occlude joints.
  VISIBILITY_EXIT_THRESHOLD: 0.45,
  // Visibility threshold (more permissive) below which a landmark is not
  // drawn on the skeleton overlay.
  DRAW_VISIBILITY_THRESHOLD: 0.45,
  // Additional EMA used only by the canvas overlay. Rep validation continues
  // to use the less delayed landmark stream above.
  DRAW_SMOOTHING_ALPHA: 0.2,
  // Landmark coordinates are frozen below this confidence to avoid drawing or
  // validating biased MediaPipe estimates produced during partial occlusion.
  LANDMARK_FREEZE_VISIBILITY: 0.45,
  // Raw MediaPipe visibility required to emit a repetition event. This does
  // not use frozen validation confidence: hidden joints cannot count reps.
  COUNT_VISIBILITY_THRESHOLD: 0.7,
  // Maximum number of consecutive frames a landmark can keep its previous
  // coordinates. After this limit, the current estimate is allowed through so
  // the angle cannot remain stuck during a real movement.
  LANDMARK_FREEZE_MAX_FRAMES: 4,
  // Grace window after exercise start/reset during which state transitions
  // are not evaluated (prevents false triggers on the first usable frame).
  SETUP_GRACE_MS: 300,
  // Continuous occlusion time (key landmarks not visible) after which the
  // current movement state is reset to STANDING.
  OCCLUSION_RESET_MS: 1000,
  // Inactivity time (no phase transition) after which the current session
  // is abandoned and returned to STANDING.
  SESSION_TIMEOUT_MS: 5000,
  // Minimum change (in degrees) between the oldest sample and the current one
  // in the historical angle buffer to recognize the start of the ascent phase.
  ASCENT_MIN_DELTA_DEG: 3.0,
  // Length of the historical angle buffer used to detect phase inversion.
  ASCENT_HISTORY_LEN: 5,
  // Maximum accepted angle change per processed frame. Larger jumps are
  // rate-limited instead of being fully rejected, so the angle can recover
  // after occlusion without remaining frozen at the previous value.
  MAX_ANGLE_STEP_DEG: 30,
  // Number of consecutive frames without valid landmarks after which the UI
  // reports "body not detected".
  TRACKING_LOST_FRAMES: 30,
  // Keep the last valid skeleton briefly across isolated missed detections,
  // then hide it instead of drawing stale landmarks over the background.
  SKELETON_STALE_FRAMES: 4,
  // Time window within which consecutive too-fast repetitions are counted.
  FAST_REP_WINDOW_MS: 5000,
  // Number of too-fast repetitions within the window that triggers the warning.
  FAST_REP_TRIGGER_COUNT: 3,
  // Duration of display for the HUD banner "VALID REP" / "NO REP".
  HUD_VALID_MS: 2000,
  HUD_INVALID_MS: 2000,
  // Duration of the "SLOW DOWN" watermark stamped on the exported video.
  WATERMARK_MS: 2500,
  CAMERA_WIDTH_IDEAL: 1280,
  CAMERA_HEIGHT_IDEAL: 720,
  // Video bitrate requested to MediaRecorder for exporting.
  RECORDING_BITRATE: 8_000_000, // 8 Mbps
  // Frame rate requested from the canvas stream used by MediaRecorder.
  RECORDING_FPS: 30,
  // Periodic MediaRecorder chunks reduce timestamp gaps in exported files.
  RECORDING_TIMESLICE_MS: 1000,
  // Keep recording after the target is reached so the final repetition and
  // the recorder's trailing chunk are fully included in the exported video.
  TARGET_RECORDING_TAIL_MS: 4000,
  // Inference interval for pose detection (1000 ms / 33 ms = 30.3 FPS).
  INTERVALLO_INFERENZA_MS: 33,
};

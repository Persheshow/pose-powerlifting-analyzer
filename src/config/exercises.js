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
      cooldownMs: 800,
    },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    },
    requiredLandmarks: {
      LEFT: [23, 25, 27],
      RIGHT: [24, 26, 28]
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
    }
  },
  OVERHEAD_PRESS: {
    thresholds: {
      topElbow: 145, topElbowOccluded: 125, bottomElbow: 140, minAttemptElbow: 130,
      wristAboveShoulderMargin: 0.06,
      cooldownMs: 650,
    },
    landmarks: {
      LEFT: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 }
    },
    requiredLandmarks: {
      LEFT: [11, 15, 23, 25, 27],
      RIGHT: [12, 16, 24, 26, 28]
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
  // Minimum "visibility" threshold (MediaPipe confidence) below which a
  // landmark can enter the "usable" state for validation purposes.
  VISIBILITY_THRESHOLD: 0.7,
  // Hysteresis lower rail: once a landmark is usable, it remains usable until
  // visibility drops below this value. This avoids flickering around 0.7 when
  // plates partially occlude joints.
  VISIBILITY_EXIT_THRESHOLD: 0.45,
  // Visibility threshold (more permissive) below which a landmark is not
  // drawn on the skeleton overlay.
  DRAW_VISIBILITY_THRESHOLD: 0.45,
  // Landmark coordinates are frozen below this confidence to avoid drawing or
  // validating biased MediaPipe estimates produced during partial occlusion.
  LANDMARK_FREEZE_VISIBILITY: 0.45,
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
  // Number of consecutive frames without valid landmarks after which the UI
  // reports "body not detected".
  TRACKING_LOST_FRAMES: 30,
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
  // Inference interval for pose detection (1000 ms / 33 ms = 30.3 FPS).
  INTERVALLO_INFERENZA_MS: 33,
};

export const ESERCIZI = {
  SQUAT: {
    thresholds: {
      bottomKnee: 85, topKnee: 160, minAttemptKnee: 140,
      cooldownMs: 800,
    },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  DEADLIFT: {
    thresholds: {
      erectHip: 165,
      cooldownMs: 1500,
    },
    landmarks: {
      LEFT: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
      RIGHT: { shoulder: 12, hip: 24, knee: 26, ankle: 28 }
    }
  },
  OVERHEAD_PRESS: {
    thresholds: {
      topElbow: 145, bottomElbow: 140, minAttemptElbow: 130,
      cooldownMs: 800,
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
};

export const SMOOTHING = {
  alpha: 0.35,
  beta: 0.65,
};

export const ENGINE = {
  // Minimum "visibility" threshold (MediaPipe confidence) below which a
  // landmark is considered unreliable for validation purposes.
  VISIBILITY_THRESHOLD: 0.15,
  // Visibility threshold (more permissive) below which a landmark is not
  // drawn on the skeleton overlay.
  DRAW_VISIBILITY_THRESHOLD: 0.2,
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
  // Duration of display for the HUD banner "VALID REP" / "NO REP".
  HUD_VALID_MS: 2000,
  HUD_INVALID_MS: 2000,
  // Duration of the "SLOW DOWN" watermark stamped on the exported video.
  WATERMARK_MS: 2500,
  CAMERA_WIDTH_IDEAL: 1280,
  CAMERA_HEIGHT_IDEAL: 720,
  // Keep capture and canvas recording at a stable, mobile-friendly frame rate.
  RECORDING_FPS: 30,
  RECORDING_TIMESLICE_MS: 1000,
  // Video bitrate requested to MediaRecorder for exporting.
  RECORDING_BITRATE: 4_000_000, // 4 Mbps
  // Inference interval for pose detection (1000 ms / 33 ms = 30.3 FPS).
  INTERVALLO_INFERENZA_MS: 33,
};

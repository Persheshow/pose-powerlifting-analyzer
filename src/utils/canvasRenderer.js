import { ESERCIZI, SKELETON_COLORS, ENGINE } from '../config/exercises';

let watermarkMessage = null;
let watermarkExpiresAt = 0;

if (typeof window !== 'undefined') {
    window.addEventListener('execution_error', (event) => {
        watermarkMessage = event.detail;
        watermarkExpiresAt = Date.now() + ENGINE.WATERMARK_MS;
    });
}

/**
 * Draw the exercise skeleton overlay on the canvas.
 * @param {CanvasRenderingContext2D} context - Drawing context for the canvas.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {number} width - Width of the canvas.
 * @param {number} height - Height of the canvas.
 * @param {boolean} isTargetReached - Whether the target state is currently reached.
 * @param {'LEFT'|'RIGHT'} side - Side to use for landmark connections.
 * @param {string} exercise - Exercise key used to select landmark configuration.
 * @param {boolean} hasError - Whether should render an error highlight.
 */
export function drawSkeleton(context, landmarks, width, height, isTargetReached, side, exercise, hasError) {
    let skeletonColor = SKELETON_COLORS.active;
    if (hasError) skeletonColor = SKELETON_COLORS.warning;
    else if (isTargetReached) skeletonColor = SKELETON_COLORS.target;

    context.lineWidth = 2;
    context.strokeStyle = skeletonColor;

    const landmarkConfig = ESERCIZI[exercise]?.landmarks[side];
    if (!landmarkConfig) return;
    const drawThreshold = ENGINE.DRAW_VISIBILITY_THRESHOLD ?? 0.45;

    const bodyConnections = [
        [landmarkConfig.shoulder, landmarkConfig.hip],
        [landmarkConfig.hip, landmarkConfig.knee],
        [landmarkConfig.knee, landmarkConfig.ankle],
    ];
    const armConnections = (exercise === 'OVERHEAD_PRESS' || exercise === 'DEADLIFT') && landmarkConfig.elbow
        ? [[landmarkConfig.shoulder, landmarkConfig.elbow], [landmarkConfig.elbow, landmarkConfig.wrist]]
        : [];

    [...bodyConnections, ...armConnections].forEach(([startIndex, endIndex]) => {
        if (startIndex === undefined || endIndex === undefined) return;
        const startPoint = landmarks[startIndex];
        const endPoint = landmarks[endIndex];
        if (startPoint && endPoint && startPoint.visibility > drawThreshold && endPoint.visibility > drawThreshold) {
            context.beginPath();
            context.moveTo(startPoint.x * width, startPoint.y * height);
            context.lineTo(endPoint.x * width, endPoint.y * height);
            context.stroke();
        }
    });

    const highlightedJointIndex = exercise === 'OVERHEAD_PRESS'
        ? landmarkConfig.elbow
        : landmarkConfig.hip;

    const highlightedJoint = landmarks[highlightedJointIndex];

    if (highlightedJoint && highlightedJoint.visibility > drawThreshold) {
        context.beginPath();
        // The joint marker changes color according to the FSM validation state.
        context.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        context.arc(highlightedJoint.x * width, highlightedJoint.y * height, 6, 0, 2 * Math.PI);
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = '#ffffff';
        context.stroke();
    }
}


/**
 * Draw the heads-up display (HUD) overlay with repetition count and status messages.
 * @param {CanvasRenderingContext2D} context - Drawing context for the canvas.
 * @param {number} width - Width of the canvas.
 * @param {number} height - Height of the canvas.
 * @param {number} validReps - Number of valid repetitions counted.
 * @param {Object|null} hudMessage - Optional HUD message to display.
 * @param {boolean} isTrackingLost - Whether the pose tracking is currently lost.
 * @param {number|null} currentAngle - Current primary angle to display.
 */
export function drawHUD(context, width, height, validReps, hudMessage, isTrackingLost, currentAngle) {
    context.save();
    context.fillStyle = "rgba(0, 47, 108, 0.75)";
    context.fillRect(0, 0, width, 50);
    context.fillStyle = "#ffffff";
    context.font = "bold 24px sans-serif";
    context.textAlign = "left";
    context.fillText(`VALIDE: ${validReps}`, 20, 34);
    context.textAlign = "right";
    context.fillText(`ANGOLO: ${currentAngle ? Math.round(currentAngle) + '°' : '--'}`, width - 20, 34);
    context.textAlign = "center";
    const now = performance.now();

    if (isTrackingLost) {
        context.fillStyle = "rgba(239, 68, 68, 0.9)";
        context.fillRect(0, 50, width, 40);
        context.fillStyle = "#ffffff";
        context.font = "bold 18px sans-serif";
        context.fillText("CORPO NON RILEVATO", width / 2, 76);
    }
    else if (hudMessage && now < hudMessage.expires) {
        if (hudMessage.type === 'VALID') {
            context.fillStyle = "rgba(0, 255, 136, 0.9)";
            context.fillRect(0, 50, width, 40);
            context.fillStyle = "#002f6c";
            context.font = "bold 18px sans-serif";
            context.fillText(hudMessage.text, width / 2, 76);
        } else {
            context.fillStyle = "rgba(239, 68, 68, 0.9)";
            context.fillRect(0, 50, width, 40);
            context.fillStyle = "#ffffff";
            context.font = "bold 18px sans-serif";
            context.fillText(hudMessage.text.toUpperCase(), width / 2, 76);
        }
    }

    if (Date.now() < watermarkExpiresAt && watermarkMessage) {
        context.fillStyle = 'rgba(220, 38, 38, 0.85)';
        context.fillRect(0, height / 2 - 60, width, 120);
        context.strokeStyle = 'white';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(0, height / 2 - 60);
        context.lineTo(width, height / 2 - 60);
        context.moveTo(0, height / 2 + 60);
        context.lineTo(width, height / 2 + 60);
        context.stroke();
        context.fillStyle = 'white';
        context.font = 'bold 28px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(watermarkMessage, width / 2, height / 2 - 10);
        context.font = 'bold 12px sans-serif';
        context.fillText("RALLENTA L'ESECUZIONE", width / 2, height / 2 + 30);
    }

    context.restore();
}

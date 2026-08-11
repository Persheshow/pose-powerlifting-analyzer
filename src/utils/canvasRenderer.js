import { ESERCIZI, SKELETON_COLORS, ENGINE } from '../config/exercises';

let watermarkMessaggio = null;
let watermarkScadenza = 0;

if (typeof window !== 'undefined') {
    window.addEventListener('execution_error', (e) => {
        watermarkMessaggio = e.detail;
        watermarkScadenza = Date.now() + ENGINE.WATERMARK_MS;
    });
}

/**
 * Draw the exercise skeleton overlay on the canvas.
 * @param {CanvasRenderingContext2D} ctx - Drawing context for the canvas.
 * @param {Array} landmarks - Pose landmarks detected by MediaPipe.
 * @param {number} w - Width of the canvas.
 * @param {number} h - Height of the canvas.
 * @param {boolean} isTargetReached - Whether the target state is currently reached.
 * @param {'LEFT'|'RIGHT'} side - Side to use for landmark connections.
 * @param {string} ex - Exercise key used to select landmark configuration.
 * @param {boolean} hasError - Whether should render an error highlight.
 */
export function drawSkeleton(ctx, landmarks, w, h, isTargetReached, side, ex, hasError) {
    let colore = SKELETON_COLORS.active;
    if (hasError) colore = SKELETON_COLORS.warning;
    else if (isTargetReached) colore = SKELETON_COLORS.target;

    ctx.lineWidth = 2;
    ctx.strokeStyle = colore;

    const cfgPunti = ESERCIZI[ex]?.landmarks[side];
    if (!cfgPunti) return;

    const collegamentiBase = [[cfgPunti.shoulder, cfgPunti.hip], [cfgPunti.hip, cfgPunti.knee], [cfgPunti.knee, cfgPunti.ankle]];
    const collegamentiBraccio = (ex === 'OVERHEAD_PRESS' || ex === 'DEADLIFT') && cfgPunti.elbow
        ? [[cfgPunti.shoulder, cfgPunti.elbow], [cfgPunti.elbow, cfgPunti.wrist]] : [];

    [...collegamentiBase, ...collegamentiBraccio].forEach(([inizio, fine]) => {
        if (inizio === undefined || fine === undefined) return;
        const p1 = landmarks[inizio], p2 = landmarks[fine];
        if (p1 && p2 && p1.visibility > ENGINE.DRAW_VISIBILITY_THRESHOLD && p2.visibility > ENGINE.DRAW_VISIBILITY_THRESHOLD) {
            ctx.beginPath();
            ctx.moveTo(p1.x * w, p1.y * h);
            ctx.lineTo(p2.x * w, p2.y * h);
            ctx.stroke();
        }
    });

    let indicePuntoSnodo = cfgPunti.hip;
    if (ex === 'OVERHEAD_PRESS') {
        indicePuntoSnodo = cfgPunti.elbow;
    }

    const puntoEvidenziato = landmarks[indicePuntoSnodo];

    if (puntoEvidenziato && puntoEvidenziato.visibility > ENGINE.DRAW_VISIBILITY_THRESHOLD) {
        ctx.beginPath();
        ctx.fillStyle = isTargetReached ? '#00ff88' : '#ef4444';
        ctx.arc(puntoEvidenziato.x * w, puntoEvidenziato.y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }
}


/**
 * Draw the heads-up display (HUD) overlay with repetition count and status messages.
 * @param {CanvasRenderingContext2D} ctx - Drawing context for the canvas.
 * @param {number} w - Width of the canvas.
 * @param {number} h - Height of the canvas.
 * @param {number} validReps - Number of valid repetitions counted.
 * @param {Object|null} hudMessage - Optional HUD message to display.
 * @param {boolean} isTrackingLost - Whether the pose tracking is currently lost.
 * @param {number|null} currentAngle - Current primary angle to display.
 */
export function drawHUD(ctx, w, h, validReps, hudMessage, isTrackingLost, currentAngle) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 47, 108, 0.75)";
    ctx.fillRect(0, 0, w, 50);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`VALIDE: ${validReps}`, 20, 34);
    ctx.textAlign = "right";
    ctx.fillText(`ANGOLO: ${currentAngle ? Math.round(currentAngle) + '°' : '--'}`, w - 20, 34);
    ctx.textAlign = "center";
    const adesso = performance.now();

    if (isTrackingLost) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fillRect(0, 50, w, 40);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("CORPO NON RILEVATO", w / 2, 76);
    }
    else if (hudMessage && adesso < hudMessage.expires) {
        if (hudMessage.type === 'VALID') {
            ctx.fillStyle = "rgba(0, 255, 136, 0.9)";
            ctx.fillRect(0, 50, w, 40);
            ctx.fillStyle = "#002f6c";
            ctx.font = "bold 18px sans-serif";
            ctx.fillText(hudMessage.text, w / 2, 76);
        } else {
            ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
            ctx.fillRect(0, 50, w, 40);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 18px sans-serif";
            ctx.fillText(hudMessage.text.toUpperCase(), w / 2, 76);
        }
    }

    if (Date.now() < watermarkScadenza && watermarkMessaggio) {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
        ctx.fillRect(0, h / 2 - 60, w, 120);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h / 2 - 60);
        ctx.lineTo(w, h / 2 - 60);
        ctx.moveTo(0, h / 2 + 60);
        ctx.lineTo(w, h / 2 + 60);
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkMessaggio, w / 2, h / 2 - 10);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText("RALLENTA L'ESECUZIONE", w / 2, h / 2 + 30);
    }

    ctx.restore();
}

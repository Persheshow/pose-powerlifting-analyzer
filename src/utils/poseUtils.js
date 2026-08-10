/**
 * @file poseUtils.js
 * @description Pure helper functions for MediaPipe landmarks and spatial filtering.
 */

/**
 * Determines which side of the body (left/right) is better framed by the
 * camera, combining two independent signals returned by MediaPipe:
 * - `visibility`: model confidence about the presence of the landmark;
 * - `z`: relative depth (smaller values = closer to the camera).
 *
 * A side is considered "framed" if it has significantly greater visibility
 * (margin of 0.2) AND smaller depth (closer) than the other side.
 * In case of conflicting or not sharp enough signals, it falls back to the
 * visibility criterion alone.
 *
 * @param {Array<{visibility:number, z:number}>} landmarks - 33 MediaPipe pose landmarks.
 * @param {'LEFT'|'RIGHT'|null} [previousSide=null] - Previously selected side.
 * @param {{LEFT:number[],RIGHT:number[]}|null} [requiredLandmarks=null] - Exercise-specific landmarks used to compare sides.
 * @returns {'LEFT'|'RIGHT'}
 */
export function selectTrackedSide(landmarks, previousSide = null, requiredLandmarks = null) {
    const leftIndices = requiredLandmarks?.LEFT ?? [11, 23, 25];
    const rightIndices = requiredLandmarks?.RIGHT ?? [12, 24, 26];
    const sumLandmarkProperty = (indices, property) => indices.reduce(
        (total, index) => total + (landmarks[index]?.[property] ?? 0),
        0
    );
    const leftVisibility = sumLandmarkProperty(leftIndices, 'visibility');
    const rightVisibility = sumLandmarkProperty(rightIndices, 'visibility');
    const leftDepth = sumLandmarkProperty(leftIndices, 'z');
    const rightDepth = sumLandmarkProperty(rightIndices, 'z');

    let candidate;
    if (leftVisibility > rightVisibility + 0.2 && leftDepth < rightDepth) candidate = 'LEFT';
    else if (rightVisibility > leftVisibility + 0.2 && rightDepth < leftDepth) candidate = 'RIGHT';
    else candidate = leftVisibility >= rightVisibility ? 'LEFT' : 'RIGHT';

    if (!previousSide || candidate === previousSide) return candidate;

    // Keep the current side unless the opposite side has a clear visibility
    // advantage. This prevents frame-by-frame side changes in frontal views.
    const previousVisibility = previousSide === 'LEFT' ? leftVisibility : rightVisibility;
    const candidateVisibility = candidate === 'LEFT' ? leftVisibility : rightVisibility;
    return candidateVisibility >= previousVisibility + 0.3 ? candidate : previousSide;
}

/**
 * Select the pose that best matches the person already being tracked.
 * The first pose is chosen by visible body area; later frames use centroid
 * continuity and reject large jumps to another person.
 * @param {Array<Array<Object>>} poses - Pose candidates returned by MediaPipe.
 * @param {{x:number,y:number}|null} previousCenter - Previous tracked centroid.
 * @param {number} [maxCenterDistance=0.25] - Maximum accepted centroid jump.
 * @returns {{landmarks:Array<Object>,center:{x:number,y:number}}|null}
 */
export function selectTrackedPose(poses, previousCenter = null, maxCenterDistance = 0.25) {
    const candidates = (poses ?? []).map((landmarks) => {
        const visibleTorsoLandmarks = [11, 12, 23, 24]
            .map((index) => landmarks[index])
            .filter((point) => point && (point.visibility ?? 0) >= 0.4);
        if (visibleTorsoLandmarks.length < 2) return null;

        const center = {
            x: visibleTorsoLandmarks.reduce((sum, point) => sum + point.x, 0) / visibleTorsoLandmarks.length,
            y: visibleTorsoLandmarks.reduce((sum, point) => sum + point.y, 0) / visibleTorsoLandmarks.length,
        };
        const visible = landmarks.filter((point) => point && (point.visibility ?? 0) >= 0.4);
        const xs = visible.map((point) => point.x);
        const ys = visible.map((point) => point.y);
        const area = visible.length > 1
            ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
            : 0;
        return { landmarks, center, area };
    }).filter(Boolean);

    if (candidates.length === 0) return null;
    if (!previousCenter) {
        candidates.sort((a, b) => b.area - a.area);
        return candidates[0];
    }

    candidates.forEach((candidate) => {
        candidate.distance = Math.hypot(
            candidate.center.x - previousCenter.x,
            candidate.center.y - previousCenter.y
        );
    });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].distance <= maxCenterDistance ? candidates[0] : null;
}

/**
 * Applies an Exponential Moving Average (EMA) low-pass filter to the x, y, and z
 * coordinates of each landmark to eliminate jitter.
 *
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>} currentLandmarks - Raw landmarks from current frame.
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>|null} prevLandmarks - Smoothed landmarks from previous frame.
 * @param {number} [alpha=0.5] - Smoothing factor.
 * @param {number} [freezeVisibility=0.55] - Confidence below which the last stable coordinate is kept.
 * @param {number} [maxFrozenFrames=4] - Maximum consecutive frames that can reuse the previous coordinates.
 * @returns {Array<{x:number, y:number, z?:number, visibility?:number, validationVisibility?:number, frozen?:boolean, frozenFrames?:number}>} - Smoothed landmarks.
 */
export function smoothLandmarksCoordinates(currentLandmarks, prevLandmarks, alpha = 0.5, freezeVisibility = 0.55, maxFrozenFrames = 4) {
    if (!prevLandmarks || prevLandmarks.length !== currentLandmarks.length) {
        return currentLandmarks.map((currentLandmark) => ({
            ...currentLandmark,
            validationVisibility: currentLandmark?.visibility ?? 1,
            frozen: false,
            frozenFrames: 0,
        }));
    }

    const beta = 1 - alpha;

    return currentLandmarks.map((currentLandmark, index) => {
        const previousLandmark = prevLandmarks[index];

        if (!currentLandmark || !previousLandmark) {
            return currentLandmark;
        }

        const frozenFrames = previousLandmark.frozenFrames ?? 0;
        if (currentLandmark.visibility !== undefined && currentLandmark.visibility < freezeVisibility && frozenFrames < maxFrozenFrames) {
            return {
                ...previousLandmark,
                visibility: currentLandmark.visibility,
                validationVisibility: freezeVisibility,
                frozen: true,
                frozenFrames: frozenFrames + 1,
            };
        }

        return {
            ...currentLandmark,
            x: currentLandmark.x * alpha + previousLandmark.x * beta,
            y: currentLandmark.y * alpha + previousLandmark.y * beta,
            z: currentLandmark.z !== undefined && previousLandmark.z !== undefined
                ? currentLandmark.z * alpha + previousLandmark.z * beta
                : currentLandmark.z,
            validationVisibility: currentLandmark.visibility ?? 1,
            frozen: false,
            frozenFrames: 0,
        };
    });
}

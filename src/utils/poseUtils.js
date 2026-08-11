const SUBJECT_ANCHOR_INDICES = [11, 12, 23, 24, 25, 26, 27, 28];
const MAX_SUBJECT_FRAME_DISTANCE = 0.18;

function calculatePoseArea(landmarks) {
    const anchors = SUBJECT_ANCHOR_INDICES
        .map(index => landmarks[index])
        .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));

    if (anchors.length === 0) return 0;

    const xs = anchors.map(point => point.x);
    const ys = anchors.map(point => point.y);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

function calculatePoseDistance(currentPose, previousPose) {
    const distances = SUBJECT_ANCHOR_INDICES.flatMap(index => {
        const current = currentPose[index];
        const previous = previousPose[index];
        if (!current || !previous) return [];
        if (![current.x, current.y, previous.x, previous.y].every(Number.isFinite)) return [];
        return [Math.hypot(current.x - previous.x, current.y - previous.y)];
    });

    if (distances.length === 0) return Number.POSITIVE_INFINITY;
    return distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
}

/**
 * Selects the largest pose on initial acquisition, then preserves subject
 * identity by choosing the candidate closest to the previously tracked pose.
 * @param {Array<Array>} candidates - Pose candidates returned by MediaPipe.
 * @param {Array|null} previousPose - Previously selected raw pose landmarks.
 * @returns {Array|null} - Selected pose landmarks, or null after an abrupt subject switch.
 */
export function selectTrackedPose(candidates, previousPose = null) {
    if (!candidates?.length) return null;

    if (!previousPose) {
        return candidates.reduce((largest, candidate) =>
            calculatePoseArea(candidate) > calculatePoseArea(largest) ? candidate : largest
        );
    }

    let closestPose = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach(candidate => {
        const distance = calculatePoseDistance(candidate, previousPose);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPose = candidate;
        }
    });

    return closestDistance <= MAX_SUBJECT_FRAME_DISTANCE ? closestPose : null;
}

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
 * @returns {'LEFT'|'RIGHT'}
 */
export function determinaLatoInquadrato(landmarks) {
    const visSx = landmarks[11].visibility + landmarks[23].visibility + landmarks[25].visibility;
    const visDx = landmarks[12].visibility + landmarks[24].visibility + landmarks[26].visibility;
    const zSx = landmarks[11].z + landmarks[23].z + landmarks[25].z;
    const zDx = landmarks[12].z + landmarks[24].z + landmarks[26].z;

    if (visSx > visDx + 0.2 && zSx < zDx) return 'LEFT';
    if (visDx > visSx + 0.2 && zDx < zSx) return 'RIGHT';
    return visSx >= visDx ? 'LEFT' : 'RIGHT';
}

/**
 * Applies a confidence-aware adaptive EMA to landmark coordinates.
 * Small displacements are damped, while deliberate fast movements receive a
 * higher alpha and therefore remain responsive. Low-confidence landmarks keep
 * their last stable position instead of injecting occlusion jitter; their
 * current visibility value is deliberately preserved for exercise validation.
 *
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>} currentLandmarks - Raw landmarks from current frame.
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>|null} prevLandmarks - Smoothed landmarks from previous frame.
 * @param {number} [alpha=0.5] - Base smoothing factor (kept for API compatibility).
 * @returns {Array<{x:number, y:number, z?:number, visibility?:number}>} - Smoothed landmarks.
 */
export function smoothLandmarksCoordinates(currentLandmarks, prevLandmarks, alpha = 0.5) {
    if (!prevLandmarks || prevLandmarks.length !== currentLandmarks.length) {
        return currentLandmarks;
    }

    return currentLandmarks.map((curr, idx) => {
        const prev = prevLandmarks[idx];

        if (!curr || !prev) {
            return curr;
        }

        const coordinatesAreValid = [curr.x, curr.y, prev.x, prev.y].every(Number.isFinite);
        if (!coordinatesAreValid) return curr;

        const displacement = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const motion = Math.min(1, Math.max(0, (displacement - 0.002) / 0.05));
        const minAlpha = Math.min(alpha, 0.22);
        const maxAlpha = Math.max(alpha, 0.82);
        let adaptiveAlpha = minAlpha + (maxAlpha - minAlpha) * motion;

        const visibility = Number.isFinite(curr.visibility) ? curr.visibility : 1;
        if (visibility < 0.5) {
            // Occluded joints are the noisiest. Keep them visually anchored,
            // but do not alter confidence: each exercise still decides whether
            // that landmark is usable.
            const confidenceScale = Math.max(0.08, visibility / 0.5);
            adaptiveAlpha = Math.min(adaptiveAlpha * confidenceScale, 0.16);
            if (displacement > 0) {
                adaptiveAlpha = Math.min(adaptiveAlpha, 0.006 / displacement);
            }
        }

        const beta = 1 - adaptiveAlpha;

        return {
            ...curr,
            x: curr.x * adaptiveAlpha + prev.x * beta,
            y: curr.y * adaptiveAlpha + prev.y * beta,
            z: Number.isFinite(curr.z) && Number.isFinite(prev.z)
                ? curr.z * adaptiveAlpha + prev.z * beta
                : curr.z,
        };
    });
}

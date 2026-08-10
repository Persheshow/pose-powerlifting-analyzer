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
 * Applies an Exponential Moving Average (EMA) low-pass filter to the x, y, and z
 * coordinates of each landmark to eliminate jitter.
 *
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>} currentLandmarks - Raw landmarks from current frame.
 * @param {Array<{x:number, y:number, z?:number, visibility?:number}>|null} prevLandmarks - Smoothed landmarks from previous frame.
 * @param {number} [alpha=0.5] - Smoothing factor
 * @returns {Array<{x:number, y:number, z?:number, visibility?:number}>} - Smoothed landmarks.
 */
export function smoothLandmarksCoordinates(currentLandmarks, prevLandmarks, alpha = 0.5) {
    if (!prevLandmarks || prevLandmarks.length !== currentLandmarks.length) {
        return currentLandmarks;
    }

    const beta = 1 - alpha;

    return currentLandmarks.map((curr, idx) => {
        const prev = prevLandmarks[idx];

        if (!curr || !prev || (curr.visibility !== undefined && curr.visibility < 0.5)) {
            return curr;
        }

        return {
            ...curr,
            x: curr.x * alpha + prev.x * beta,
            y: curr.y * alpha + prev.y * beta,
            z: curr.z !== undefined && prev.z !== undefined ? curr.z * alpha + prev.z * beta : curr.z,
        };
    });
}
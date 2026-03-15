// Visual overtake spreading — renderer-agnostic logic
// When cars are near each other, the one ahead shifts left, the one behind shifts right.
// Sides are locked while either car is still offset, so cars never cross mid-encounter.

const OVERTAKE_PROXIMITY = 160; // pixel distance to trigger spread
const OVERTAKE_OFFSET = 50;     // max lateral offset in pixels
const OFFSET_LERP = 0.12;       // smoothing factor per frame
const OVERTAKE_TRACK_WINDOW = 180; // keep crossings from triggering false spreads

const visualOffsets = new Map(); // peerId → current smoothed offset

/**
 * Compute target lateral offsets from a map of base positions.
 * @param {Map<string, {x, y, distance, speed}>} basePositions
 * @param {number} trackLength
 * @returns {Map<string, number>} target offsets per peerId
 */
export function computeOvertakeOffsets(basePositions, trackLength) {
  const targets = new Map();
  const entries = [...basePositions.entries()];
  for (const [id] of entries) targets.set(id, 0);

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, posA] = entries[i];
      const [idB, posB] = entries[j];
      const dx = posA.x - posB.x;
      const dy = posA.y - posB.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rawTrackGap = trackLength > 0 ? Math.abs(posA.distance - posB.distance) % trackLength : Infinity;
      const trackGap = trackLength > 0 ? Math.min(rawTrackGap, trackLength - rawTrackGap) : Infinity;
      if (dist >= OVERTAKE_PROXIMITY) continue;
      if (trackGap > OVERTAKE_TRACK_WINDOW) continue;

      const proximity = 1 - dist / OVERTAKE_PROXIMITY;
      const totalSpread = OVERTAKE_OFFSET * 2 * proximity;

      // Determine ahead/behind by track distance
      const aIsAhead = posA.distance > posB.distance;
      const aheadSpeed = aIsAhead ? posA.speed : posB.speed;
      const behindSpeed = aIsAhead ? posB.speed : posA.speed;

      // Determine sides: use existing visual offsets if either car is still
      // offset (locks sides for the encounter), otherwise ahead goes left.
      const offA = visualOffsets.get(idA) || 0;
      const offB = visualOffsets.get(idB) || 0;
      let leftId, rightId;
      if (Math.abs(offA) > 0.5 || Math.abs(offB) > 0.5) {
        // Already mid-encounter — keep whichever car is more left
        leftId = offA <= offB ? idA : idB;
        rightId = offA <= offB ? idB : idA;
      } else {
        // Fresh encounter — ahead car goes left
        leftId = aIsAhead ? idA : idB;
        rightId = aIsAhead ? idB : idA;
      }

      // Weight by speed — faster car takes more of the offset
      const leftSpeed = leftId === (aIsAhead ? idA : idB) ? aheadSpeed : behindSpeed;
      const rightSpeed = leftId === (aIsAhead ? idA : idB) ? behindSpeed : aheadSpeed;
      const speedSum = leftSpeed + rightSpeed;
      const leftFraction = speedSum > 0 ? leftSpeed / speedSum : 0.5;

      targets.set(leftId, targets.get(leftId) - totalSpread * leftFraction);
      targets.set(rightId, targets.get(rightId) + totalSpread * (1 - leftFraction));
    }
  }

  return targets;
}

/**
 * Smooth visual offsets toward targets. Call once per frame.
 * @param {Map<string, number>} targets
 * @returns {Map<string, number>} smoothed offsets
 */
export function smoothVisualOffsets(targets) {
  for (const [id, target] of targets) {
    const current = visualOffsets.get(id) || 0;
    visualOffsets.set(id, current + (target - current) * OFFSET_LERP);
  }

  // Decay offsets for cars no longer in targets
  for (const id of visualOffsets.keys()) {
    if (!targets.has(id)) {
      const current = visualOffsets.get(id);
      if (Math.abs(current) < 0.5) {
        visualOffsets.delete(id);
      } else {
        visualOffsets.set(id, current * (1 - OFFSET_LERP));
      }
    }
  }

  return visualOffsets;
}

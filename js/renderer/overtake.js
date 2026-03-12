// Visual overtake spreading — renderer-agnostic logic
// When cars are near each other, the one ahead shifts left, the one behind shifts right.

const OVERTAKE_PROXIMITY = 50;  // pixel distance to trigger spread
const OVERTAKE_OFFSET = 30;     // max lateral offset in pixels
const OFFSET_LERP = 0.12;       // smoothing factor per frame

const visualOffsets = new Map(); // peerId → current smoothed offset

/**
 * Compute target lateral offsets from a map of base positions.
 * Offset is weighted by speed — a faster car moves left more,
 * a slower/stationary car barely moves.
 * @param {Map<string, {x, y, distance, speed}>} basePositions
 * @returns {Map<string, number>} target offsets per peerId
 */
export function computeOvertakeOffsets(basePositions) {
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
      if (dist >= OVERTAKE_PROXIMITY) continue;

      const proximity = 1 - dist / OVERTAKE_PROXIMITY;
      const totalSpread = OVERTAKE_OFFSET * 2 * proximity;

      // Determine ahead/behind
      const [aheadId, behindId, aheadSpeed, behindSpeed] =
        posA.distance > posB.distance
          ? [idA, idB, posA.speed, posB.speed]
          : [idB, idA, posB.speed, posA.speed];

      // Weight by speed — faster car takes more of the offset
      const speedSum = aheadSpeed + behindSpeed;
      const aheadFraction = speedSum > 0 ? aheadSpeed / speedSum : 0.5;
      const behindFraction = 1 - aheadFraction;

      targets.set(aheadId, targets.get(aheadId) - totalSpread * aheadFraction);
      targets.set(behindId, targets.get(behindId) + totalSpread * behindFraction);
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

  // Clean up offsets for cars no longer in targets
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

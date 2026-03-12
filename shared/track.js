// Segment type library
export const SEGMENT_TYPES = {
  LONG_STRAIGHT:   { type: 'straight', length: 400 },
  SHORT_STRAIGHT:  { type: 'straight', length: 200 },
  MEDIUM_STRAIGHT: { type: 'straight', length: 300 },

  GENTLE_RIGHT:  { type: 'curve', angle: 45,   radius: 200, maxSpeed: 85 },
  MEDIUM_RIGHT:  { type: 'curve', angle: 90,   radius: 150, maxSpeed: 60 },
  SHARP_RIGHT:   { type: 'curve', angle: 90,   radius: 100, maxSpeed: 40 },
  HAIRPIN_RIGHT: { type: 'curve', angle: 180,  radius: 80,  maxSpeed: 25 },
  WIDE_HAIRPIN_RIGHT: { type: 'curve', angle: 180, radius: 100, maxSpeed: 30 },

  GENTLE_LEFT:   { type: 'curve', angle: -45,  radius: 200, maxSpeed: 85 },
  MEDIUM_LEFT:   { type: 'curve', angle: -90,  radius: 150, maxSpeed: 60 },
  SHARP_LEFT:    { type: 'curve', angle: -90,  radius: 100, maxSpeed: 40 },
  HAIRPIN_LEFT:  { type: 'curve', angle: -180, radius: 80,  maxSpeed: 25 },
  WIDE_HAIRPIN_LEFT: { type: 'curve', angle: -180, radius: 100, maxSpeed: 30 },
};

// Track definitions
// Closure verified with scripts/check-track.js
export const TRACKS = {
  starter: {
    name: 'Grand Circuit',
    laps: 2,
    segments: [
      // ── Start/finish straight (heading right) ── 400 — top speed zone
      SEGMENT_TYPES.LONG_STRAIGHT,

      // ── Turn 1: Medium sweeper (maxSpeed 60) ──
      SEGMENT_TYPES.MEDIUM_RIGHT,         // +90° r=150 → heading down

      // ── Short straight before chicane ── 200
      SEGMENT_TYPES.SHORT_STRAIGHT,

      // ── Turn 2: Chicane entry (maxSpeed 40) — hard braking! ──
      SEGMENT_TYPES.SHARP_LEFT,           // -90° r=100 → heading right

      // ── Chicane connector ── 200
      SEGMENT_TYPES.SHORT_STRAIGHT,

      // ── Turn 3: Chicane exit (maxSpeed 40) ──
      SEGMENT_TYPES.SHARP_RIGHT,          // +90° r=100 → heading down

      // ── Recovery straight ── 400
      SEGMENT_TYPES.LONG_STRAIGHT,

      // ── Turn 4: Sharp left (maxSpeed 40) — direction change! ──
      SEGMENT_TYPES.SHARP_LEFT,           // -90° r=100 → heading right

      // ── Connector to hairpin ── 300
      SEGMENT_TYPES.MEDIUM_STRAIGHT,

      // ── Turn 5: HAIRPIN (maxSpeed 30) — major braking zone! ──
      SEGMENT_TYPES.WIDE_HAIRPIN_RIGHT,   // +180° r=100 → heading left

      // ── Back straight (heading left) ── 1400 — top speed zone
      SEGMENT_TYPES.LONG_STRAIGHT,
      SEGMENT_TYPES.LONG_STRAIGHT,
      SEGMENT_TYPES.LONG_STRAIGHT,
      SEGMENT_TYPES.SHORT_STRAIGHT,

      // ── Turn 6: Sharp corner (maxSpeed 40) ──
      SEGMENT_TYPES.SHARP_RIGHT,          // +90° r=100 → heading up

      // ── Left side (heading up) ── 1000
      SEGMENT_TYPES.LONG_STRAIGHT,
      SEGMENT_TYPES.LONG_STRAIGHT,
      SEGMENT_TYPES.SHORT_STRAIGHT,

      // ── Turn 7: Medium sweeper back to start (maxSpeed 60) ──
      SEGMENT_TYPES.MEDIUM_RIGHT,         // +90° r=150 → heading right
    ],
  },
};

/**
 * Build geometry for a track — computes start position/angle for each segment
 * Returns array of { ...segment, startX, startY, startAngle, endX, endY, endAngle, arcLength }
 */
export function buildTrackGeometry(segments) {
  const geo = [];
  let x = 0, y = 0, angle = 0; // angle in radians, 0 = right

  for (const seg of segments) {
    if (seg.type === 'straight') {
      const endX = x + Math.cos(angle) * seg.length;
      const endY = y + Math.sin(angle) * seg.length;
      geo.push({
        ...seg,
        startX: x, startY: y, startAngle: angle,
        endX, endY, endAngle: angle,
        arcLength: seg.length,
      });
      x = endX;
      y = endY;
    } else {
      // Curve
      const angleRad = (seg.angle * Math.PI) / 180;
      const r = seg.radius;
      const sign = Math.sign(seg.angle); // +1 right, -1 left

      // Center of the turning circle
      const perpAngle = angle + (sign * Math.PI) / 2;
      const cx = x + Math.cos(perpAngle) * r;
      const cy = y + Math.sin(perpAngle) * r;

      // End position
      const endAngle = angle + angleRad;
      const endPerpAngle = endAngle + (sign * Math.PI) / 2;
      const endX = cx - Math.cos(endPerpAngle) * r;
      const endY = cy - Math.sin(endPerpAngle) * r;

      const arcLen = Math.abs(angleRad) * r;

      geo.push({
        ...seg,
        startX: x, startY: y, startAngle: angle,
        endX, endY, endAngle,
        cx, cy,
        arcLength: arcLen,
      });

      x = endX;
      y = endY;
      angle = endAngle;
    }
  }

  return geo;
}

/**
 * Get total track length
 */
export function getTrackLength(geometry) {
  return geometry.reduce((sum, seg) => sum + seg.arcLength, 0);
}

/**
 * Get position on track given segment index, progress within segment, and lane offset
 * laneOffset: 0 = center, positive = right, negative = left
 * Returns { x, y, angle }
 */
export function getPositionOnTrack(geometry, segIndex, progress, laneOffset = 0) {
  const seg = geometry[segIndex % geometry.length];

  if (seg.type === 'straight') {
    const dist = progress * seg.arcLength;
    const nx = -Math.sin(seg.startAngle); // normal (perpendicular)
    const ny = Math.cos(seg.startAngle);
    return {
      x: seg.startX + Math.cos(seg.startAngle) * dist + nx * laneOffset,
      y: seg.startY + Math.sin(seg.startAngle) * dist + ny * laneOffset,
      angle: seg.startAngle,
    };
  } else {
    // Curve
    const angleRad = (seg.angle * Math.PI) / 180;
    const sign = Math.sign(seg.angle);
    const currentAngle = seg.startAngle + angleRad * progress;

    // Adjusted radius based on lane offset
    const effectiveR = seg.radius - sign * laneOffset;

    const perpAngle = currentAngle + (sign * Math.PI) / 2;
    return {
      x: seg.cx - Math.cos(perpAngle) * effectiveR,
      y: seg.cy - Math.sin(perpAngle) * effectiveR,
      angle: currentAngle,
    };
  }
}

/**
 * Get the effective max speed at a point within a curve segment.
 * Speed limit is lowest at the apex (progress=0.5) and highest at entry/exit.
 * Uses sine curve: effectiveMax = baseMax + bonus * (1 - sin(progress * π))
 * Bonus is capped so it never exceeds MAX_SPEED.
 */
export function getEffectiveMaxSpeed(seg, progress, maxSpeed) {
  if (seg.type !== 'curve' || !seg.maxSpeed) return maxSpeed;
  const base = seg.maxSpeed;
  const bonus = Math.min(base * 0.5, maxSpeed - base);
  const edgeFactor = 1 - Math.sin(progress * Math.PI);
  return base + bonus * edgeFactor;
}

/**
 * Convert a distance along the track to { segIndex, progress }
 */
export function distanceToSegment(geometry, distance) {
  let remaining = distance;
  for (let i = 0; i < geometry.length; i++) {
    if (remaining <= geometry[i].arcLength) {
      return { segIndex: i, progress: remaining / geometry[i].arcLength };
    }
    remaining -= geometry[i].arcLength;
  }
  // Past end — wrap
  return { segIndex: geometry.length - 1, progress: 1 };
}
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

function straight(length, extra = {}) {
  return { type: 'straight', length, ...extra };
}

function curve(angle, radius, maxSpeed, extra = {}) {
  return { type: 'curve', angle, radius, maxSpeed, ...extra };
}

// Track definitions
// Closure verified with scripts/check-track.js
export const TRACKS = {
  starter: {
    name: 'Starter Circuit',
    laps: 2,
    segments: [
      // 1: Start/finish straight (heading right)
      straight(1917),
      // 2: Turn 1a — gentle entry
      curve(45, 400, 60),
      // 3: Turn 1 link
      straight(100),
      // 4: Turn 1b — tighten exit
      curve(45, 350, 55),
      // 5: Right side (heading down)
      straight(700),
      // 6: Turn 2 — wide
      curve(90, 350, 50),
      // 7-11: Bottom straight (heading left)
      straight(400),
      straight(400),
      straight(400),
      straight(400),
      straight(400),
      // 10: Turn 3a — asymmetric sweep entry
      curve(60, 350, 55),
      // 11: Turn 3b — asymmetric sweep exit
      curve(30, 300, 60),
      // 14: Left side (heading up)
      straight(840),
      // 13: Turn 4 — wide sweep back to start
      curve(90, 320, 50),
    ],
  },

  silverstone: {
    name: 'Silverstone Sprint',
    laps: 2,
    seed: 3,
    segments: [
      straight(1178),
      curve(-63.2, 336, 54),  // left sweeper into infield
      straight(301),
      curve(68.7, 280, 48),   // tight right back out
      straight(549),
      curve(30.1, 351, 55),
      straight(703),
      curve(118.1, 283, 48),  // big right hairpin
      straight(740),
      curve(11.9, 479, 65),
      straight(324),
      curve(-36.7, 352, 55),  // left kink
      straight(644),
      curve(61.9, 348, 55),
      straight(730),
      curve(53.7, 374, 57),
      straight(946),
      curve(115.5, 276, 48),  // tight final corner
    ],
  },

  monza: {
    name: 'Monza Classico',
    laps: 2,
    seed: 1001,
    segments: [
      straight(1126),
      curve(35.7, 362, 56),
      straight(1123),
      curve(116.6, 286, 49),  // tight right
      straight(1244),
      curve(61.2, 287, 49),
      straight(468),
      curve(-23.8, 421, 62),  // left notch
      straight(1314),
      curve(133.8, 260, 46),  // hairpin
      straight(1181),
      curve(36.5, 313, 51),
    ],
  },

  suzuka: {
    name: 'Suzuka Sweep',
    laps: 2,
    seed: 200,
    segments: [
      straight(1429),
      curve(18.5, 445, 65),   // gentle kink
      straight(2199),
      curve(41.2, 347, 55),
      straight(907),
      curve(104.1, 254, 45),  // tight right
      straight(1047),
      curve(17.6, 493, 65),
      straight(2095),
      curve(33.6, 442, 64),
      straight(1296),
      curve(68.9, 317, 52),
      straight(918),
      curve(76, 315, 51),
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

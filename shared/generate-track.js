// Procedural track generator — shared module (browser + Node)
// Generates closed racing circuits with no self-intersection.

import { buildTrackGeometry, getPositionOnTrack, getTrackLength } from './track.js';
import { TRACK_WIDTH } from './constants.js';

// --- Seeded RNG (mulberry32) ---
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(rng, min, max) {
  return min + rng() * (max - min);
}

// --- Geometry helpers ---
function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Map radius to maxSpeed — tuned for meaningful braking (50-65 range for most curves)
function radiusToMaxSpeed(radius) {
  if (radius >= 450) return 65;
  if (radius >= 350) return 55 + ((radius - 350) / 100) * 10;
  if (radius >= 300) return 50 + ((radius - 300) / 50) * 5;
  if (radius >= 200) return 40 + ((radius - 200) / 100) * 10;
  return 25 + ((radius - 80) / 120) * 15;
}

// --- Waypoint generation (19:10 aspect ratio, ellipse or rectangle base) ---
function generateWaypoints(rng, numPoints) {
  const halfW = randFloat(rng, 1800, 2600);
  const halfH = halfW * (10 / 19) * randFloat(rng, 0.85, 1.15);
  const waypoints = [];

  const useRect = rng() < 0.5;

  for (let i = 0; i < numPoints; i++) {
    const baseAngle = (i / numPoints) * 2 * Math.PI;
    const angleJitter = (rng() - 0.5) * (2 * Math.PI / numPoints) * 0.3;
    const angle = baseAngle + angleJitter;

    const isConcave = rng() < 0.4;
    const rScale = isConcave
      ? randFloat(rng, 0.25, 0.50)
      : randFloat(rng, 0.75, 1.15);

    let x, y;
    if (useRect) {
      const t = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      const absCos = Math.abs(cos);
      const absSin = Math.abs(sin);
      if (absCos * halfH > absSin * halfW) {
        const s = Math.sign(cos);
        x = s * halfW;
        y = sin / absCos * halfW;
      } else {
        const s = Math.sign(sin);
        x = cos / absSin * halfH;
        y = s * halfH;
      }
      x *= rScale;
      y *= rScale;
    } else {
      x = Math.cos(angle) * halfW * rScale;
      y = Math.sin(angle) * halfH * rScale;
    }

    waypoints.push({ x, y });
  }

  const cx = waypoints.reduce((s, p) => s + p.x, 0) / numPoints;
  const cy = waypoints.reduce((s, p) => s + p.y, 0) / numPoints;
  waypoints.sort((a, b) => {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });

  return waypoints;
}

// --- Convert waypoints to track segments ---
function waypointsToSegments(waypoints, rng) {
  const N = waypoints.length;

  const headings = [];
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    headings.push(Math.atan2(
      waypoints[next].y - waypoints[i].y,
      waypoints[next].x - waypoints[i].x
    ));
  }

  const turns = [];
  for (let i = 0; i < N; i++) {
    const prev = (i - 1 + N) % N;
    turns.push(normalizeAngle(headings[i] - headings[prev]));
  }

  const radii = [];
  for (let i = 0; i < N; i++) {
    const absTurnDeg = Math.abs(turns[i]) * 180 / Math.PI;
    const isLeftTurn = turns[i] < 0;

    let minR, maxR;
    if (absTurnDeg < 8) {
      radii.push(0);
      continue;
    } else if (absTurnDeg < 35) {
      minR = 350; maxR = 500;
    } else if (absTurnDeg < 60) {
      minR = 280; maxR = 400;
    } else if (absTurnDeg < 90) {
      minR = isLeftTurn ? 220 : 280;
      maxR = 380;
    } else if (absTurnDeg < 120) {
      minR = isLeftTurn ? 180 : 250;
      maxR = 320;
    } else {
      minR = 180; maxR = 280;
    }
    radii.push(randFloat(rng, minR, maxR));
  }

  const tangentLens = [];
  for (let i = 0; i < N; i++) {
    tangentLens.push(radii[i] > 0 ? radii[i] * Math.tan(Math.abs(turns[i]) / 2) : 0);
  }

  const edgeLens = [];
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    edgeLens.push(dist(waypoints[i], waypoints[next]));
  }

  const straightLens = [];
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const sLen = edgeLens[i] - tangentLens[i] - tangentLens[next];
    if (sLen < 100) return null;
    straightLens.push(sLen);
  }

  const segments = [];
  let pendingStraight = 0;

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    pendingStraight += straightLens[i];

    if (radii[next] > 0) {
      segments.push({ type: 'straight', length: Math.round(pendingStraight) });
      pendingStraight = 0;

      const angleDeg = turns[next] * 180 / Math.PI;
      const maxSpeed = radiusToMaxSpeed(radii[next]);
      segments.push({
        type: 'curve',
        angle: Math.round(angleDeg * 10) / 10,
        radius: Math.round(radii[next]),
        maxSpeed: Math.round(maxSpeed),
      });
    }
  }

  if (pendingStraight > 0 && segments.length > 0 && segments[0].type === 'straight') {
    segments[0].length += Math.round(pendingStraight);
  }

  const curveCount = segments.filter(s => s.type === 'curve').length;
  if (curveCount < 3) return null;

  // Fix closure
  const testGeo = buildTrackGeometry(segments);
  const last = testGeo[testGeo.length - 1];
  const headingError = Math.abs(normalizeAngle(last.endAngle));
  if (headingError < 0.01 && segments[0].type === 'straight') {
    segments[0].length = Math.round(segments[0].length - last.endX);
    if (segments[0].length < 100) return null;
  }

  return insertChicanes(segments, rng);
}

// --- Chicane insertion ---
function insertChicanes(segments, rng) {
  const result = [];
  let chicanesAdded = 0;

  for (const seg of segments) {
    if (seg.type === 'straight' && seg.length > 800 && chicanesAdded < 2 && rng() < 0.4) {
      const chicaneAngle = randFloat(rng, 12, 25);
      const chicaneRadius = randInt(rng, 350, 450);
      const chicaneMaxSpeed = radiusToMaxSpeed(chicaneRadius);
      const chicaneArc = (chicaneAngle * Math.PI / 180) * chicaneRadius;
      const remainingStraight = seg.length - chicaneArc * 2;

      if (remainingStraight > 300) {
        const seg1Len = Math.round(remainingStraight * (0.3 + rng() * 0.2));
        const seg2Len = Math.round(remainingStraight * 0.15);
        const seg3Len = Math.round(remainingStraight - seg1Len - seg2Len);
        const sign = rng() < 0.5 ? -1 : 1;

        result.push({ type: 'straight', length: seg1Len });
        result.push({ type: 'curve', angle: Math.round(chicaneAngle * sign * 10) / 10, radius: chicaneRadius, maxSpeed: Math.round(chicaneMaxSpeed) });
        result.push({ type: 'straight', length: seg2Len });
        result.push({ type: 'curve', angle: Math.round(-chicaneAngle * sign * 10) / 10, radius: chicaneRadius, maxSpeed: Math.round(chicaneMaxSpeed) });
        result.push({ type: 'straight', length: seg3Len });
        chicanesAdded++;
        continue;
      }
    }
    result.push(seg);
  }

  return result;
}

// --- Validation checks ---
function checkSelfIntersection(geometry) {
  const totalLength = getTrackLength(geometry);
  const sampleInterval = TRACK_WIDTH * 0.8;
  const minTrackDist = TRACK_WIDTH * 2.5;

  const samples = [];
  let cumDist = 0;

  for (let si = 0; si < geometry.length; si++) {
    const seg = geometry[si];
    const segSamples = Math.max(2, Math.ceil(seg.arcLength / sampleInterval));

    for (let j = 0; j < segSamples; j++) {
      const progress = j / segSamples;
      const pos = getPositionOnTrack(geometry, si, progress, 0);
      samples.push({ x: pos.x, y: pos.y, trackDist: cumDist + progress * seg.arcLength });
    }
    cumDist += seg.arcLength;
  }

  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const arcDist = Math.min(
        Math.abs(samples[j].trackDist - samples[i].trackDist),
        totalLength - Math.abs(samples[j].trackDist - samples[i].trackDist)
      );
      if (arcDist < minTrackDist) continue;

      const spatialDist = Math.sqrt(
        (samples[i].x - samples[j].x) ** 2 + (samples[i].y - samples[j].y) ** 2
      );
      if (spatialDist < TRACK_WIDTH * 1.1) return true;
    }
  }

  return false;
}

function checkSpaceUtilization(geometry) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of geometry) {
    for (const [x, y] of [[seg.startX, seg.startY], [seg.endX, seg.endY]]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const ratio = width / height;
  return ratio > 1.4 && ratio < 2.4 && width > 2000 && height > 1000;
}

function checkCurveQuality(segments) {
  const curves = segments.filter(s => s.type === 'curve');
  const sharpCount = curves.filter(c => c.radius < 250).length;
  const avgMaxSpeed = curves.reduce((s, c) => s + c.maxSpeed, 0) / curves.length;
  const leftTurns = curves.filter(c => c.angle < 0).length;
  return sharpCount <= 3 && avgMaxSpeed >= 45 && avgMaxSpeed <= 65 && leftTurns >= 1;
}

// --- Single attempt ---
function tryGenerate(seed) {
  const rng = mulberry32(seed);
  const numPoints = randInt(rng, 7, 12);

  const waypoints = generateWaypoints(rng, numPoints);
  const segments = waypointsToSegments(waypoints, rng);
  if (!segments) return null;

  const geometry = buildTrackGeometry(segments);

  const last = geometry[geometry.length - 1];
  const gap = Math.sqrt(last.endX ** 2 + last.endY ** 2);
  const angleDiff = Math.abs(normalizeAngle(last.endAngle)) * 180 / Math.PI;
  if (gap > 5 || angleDiff > 1) return null;

  if (checkSelfIntersection(geometry)) return null;
  if (!checkSpaceUtilization(geometry)) return null;
  if (!checkCurveQuality(segments)) return null;

  return { segments, seed };
}

/**
 * Generate a random track. Tries seeds starting from `startSeed` until one passes all checks.
 * Returns { name, laps, segments, seed }.
 */
export function generateRandomTrack(startSeed, maxAttempts = 500) {
  let seed = startSeed ?? Math.floor(Math.random() * 1000000);

  for (let i = 0; i < maxAttempts; i++) {
    const result = tryGenerate(seed + i);
    if (result) {
      return {
        name: `Circuit #${result.seed}`,
        laps: 2,
        segments: result.segments,
        seed: result.seed,
      };
    }
  }

  // Fallback — should rarely happen
  return null;
}

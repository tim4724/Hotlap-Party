import { TRACK_WIDTH, CAR_RADIUS, MAX_SPEED, OFF_TRACK_DURATION_MS, DRIFT_PHASE_MS } from '../../shared/constants.js';
import { getPositionOnTrack, getEffectiveMaxSpeed, getTrackLength } from '../../shared/track.js';
import { computeOvertakeOffsets, smoothVisualOffsets } from './overtake.js';

let app = null;
let trackContainer = null;
let carContainer = null;
let cars = new Map();
let currentGeometry = null;
let currentTrackLength = 0;

export async function initRenderer(canvas) {
  if (app) return;
  app = new PIXI.Application();
  await app.init({
    canvas,
    resizeTo: window,
    background: 0x1a1a1a,
    antialias: true,
  });

  trackContainer = new PIXI.Container();
  carContainer = new PIXI.Container();

  app.stage.addChild(trackContainer);
  app.stage.addChild(carContainer);
}

export function resize() {
  if (!app || !currentGeometry) return;
  fitToScreen();
}

export function drawTrack(geometry) {
  currentGeometry = geometry;
  currentTrackLength = getTrackLength(geometry);
  trackContainer.removeChildren();

  for (const seg of geometry) {
    if (seg.type === 'straight') {
      drawStraight(seg);
    } else {
      drawCurve(seg);
    }
  }

  fitToScreen();
}

function fitToScreen() {
  const bounds = getTrackBounds(currentGeometry);
  const padX = Math.max(28, app.screen.width * 0.025);
  const padY = Math.max(32, app.screen.height * 0.045);
  const scaleX = (app.screen.width - padX * 2) / bounds.width;
  const scaleY = (app.screen.height - padY * 2) / bounds.height;
  const scale = Math.min(scaleX, scaleY);

  trackContainer.scale.set(scale);
  trackContainer.x = app.screen.width / 2 - (bounds.cx * scale);
  trackContainer.y = app.screen.height / 2 - (bounds.cy * scale);
  carContainer.scale.set(scale);
  carContainer.x = trackContainer.x;
  carContainer.y = trackContainer.y;
}

// --- Track drawing ---

function drawStraight(seg) {
  const hw = TRACK_WIDTH / 2;
  const nx = -Math.sin(seg.startAngle);
  const ny = Math.cos(seg.startAngle);

  const g = new PIXI.Graphics();
  g.poly([
    seg.startX + nx * hw, seg.startY + ny * hw,
    seg.startX - nx * hw, seg.startY - ny * hw,
    seg.endX - nx * hw, seg.endY - ny * hw,
    seg.endX + nx * hw, seg.endY + ny * hw,
  ]);
  g.fill({ color: hslToHex(120, 60, 28) });
  trackContainer.addChild(g);

  // Center line (dashed)
  const cl = new PIXI.Graphics();
  const dx = Math.cos(seg.startAngle);
  const dy = Math.sin(seg.startAngle);
  let along = 0;
  while (along < seg.arcLength) {
    const end = Math.min(along + 15, seg.arcLength);
    cl.moveTo(seg.startX + dx * along, seg.startY + dy * along);
    cl.lineTo(seg.startX + dx * end, seg.startY + dy * end);
    along += 30;
  }
  cl.stroke({ color: 0x555555, width: 1 });
  trackContainer.addChild(cl);

}

function drawCurve(seg) {
  const hw = TRACK_WIDTH / 2;
  const sign = Math.sign(seg.angle);
  const angleRad = (seg.angle * Math.PI) / 180;
  const strips = Math.max(12, Math.abs(seg.angle) / 4);

  const innerR = seg.radius - hw;
  const outerR = seg.radius + hw;

  // Gradient strips — color varies by effective max speed
  for (let i = 0; i < strips; i++) {
    const t0 = i / strips;
    const t1 = (i + 1) / strips;
    const tMid = (t0 + t1) / 2;

    const effectiveMax = getEffectiveMaxSpeed(seg, tMid, MAX_SPEED);
    const hue = 120 * Math.min(effectiveMax / MAX_SPEED, 1);
    const color = hslToHex(hue, 60, 28);

    const a0 = seg.startAngle + angleRad * t0;
    const a1 = seg.startAngle + angleRad * t1;
    const p0 = a0 + (sign * Math.PI) / 2;
    const p1 = a1 + (sign * Math.PI) / 2;

    const g = new PIXI.Graphics();
    g.poly([
      seg.cx - Math.cos(p0) * innerR, seg.cy - Math.sin(p0) * innerR,
      seg.cx - Math.cos(p1) * innerR, seg.cy - Math.sin(p1) * innerR,
      seg.cx - Math.cos(p1) * outerR, seg.cy - Math.sin(p1) * outerR,
      seg.cx - Math.cos(p0) * outerR, seg.cy - Math.sin(p0) * outerR,
    ]);
    g.fill({ color });
    trackContainer.addChild(g);
  }

  // Edge lines
  const edgeSteps = Math.max(16, Math.abs(seg.angle) / 2);
  const edgeG = new PIXI.Graphics();
  const apexHue = 120 * Math.min(seg.maxSpeed / MAX_SPEED, 1);
  const edgeColor = hslToHex(apexHue, 50, 20);

  for (let edge = 0; edge < 2; edge++) {
    const r = edge === 0 ? innerR : outerR;
    const a0 = seg.startAngle + (sign * Math.PI) / 2;
    edgeG.moveTo(seg.cx - Math.cos(a0) * r, seg.cy - Math.sin(a0) * r);
    for (let i = 1; i <= edgeSteps; i++) {
      const a = seg.startAngle + angleRad * (i / edgeSteps) + (sign * Math.PI) / 2;
      edgeG.lineTo(seg.cx - Math.cos(a) * r, seg.cy - Math.sin(a) * r);
    }
  }
  edgeG.stroke({ color: edgeColor, width: 2 });
  trackContainer.addChild(edgeG);

  // Center line
  const cl = new PIXI.Graphics();
  cl.moveTo(
    seg.cx - Math.cos(seg.startAngle + (sign * Math.PI) / 2) * seg.radius,
    seg.cy - Math.sin(seg.startAngle + (sign * Math.PI) / 2) * seg.radius
  );
  for (let i = 1; i <= edgeSteps; i++) {
    const t = i / edgeSteps;
    const a = seg.startAngle + angleRad * t;
    const perpA = a + (sign * Math.PI) / 2;
    cl.lineTo(
      seg.cx - Math.cos(perpA) * seg.radius,
      seg.cy - Math.sin(perpA) * seg.radius
    );
  }
  cl.stroke({ color: 0x555555, width: 1 });
  trackContainer.addChild(cl);
}

// --- Car rendering ---

// Car dimensions (centered at 0,0, pointing right)
const CAR_LENGTH = 112;
const CAR_WIDTH = 48;

function createCarGraphic(color) {
  const container = new PIXI.Container();
  const hexColor = cssColorToHex(color);
  const dark = darkenColor(hexColor, 0.3);
  const darker = darkenColor(hexColor, 0.5);
  const light = lightenColor(hexColor, 0.3);

  // Rear wheels (wide slicks, behind body)
  for (const side of [-1, 1]) {
    const wheel = new PIXI.Graphics();
    wheel.roundRect(-40, side * 22 - 6, 22, 12, 2);
    wheel.fill({ color: 0x111111 });
    wheel.stroke({ color: 0x333333, width: 0.5 });
    container.addChild(wheel);
  }

  // Front wheels (narrower)
  for (const side of [-1, 1]) {
    const wheel = new PIXI.Graphics();
    wheel.roundRect(30, side * 18 - 4, 16, 8, 2);
    wheel.fill({ color: 0x111111 });
    wheel.stroke({ color: 0x333333, width: 0.5 });
    container.addChild(wheel);
  }

  // Front wing
  const fwing = new PIXI.Graphics();
  fwing.roundRect(42, -22, 6, 44, 1);
  fwing.fill({ color: dark });
  container.addChild(fwing);

  // Front wing endplates
  for (const side of [-1, 1]) {
    const fp = new PIXI.Graphics();
    fp.rect(40, side * 20 - 2, 10, 4);
    fp.fill({ color: darker });
    container.addChild(fp);
  }

  // Suspension arms (front)
  for (const side of [-1, 1]) {
    const arm = new PIXI.Graphics();
    arm.moveTo(28, side * 12);
    arm.lineTo(38, side * 18);
    arm.stroke({ color: 0x555555, width: 1.5 });
    container.addChild(arm);
  }

  // Suspension arms (rear)
  for (const side of [-1, 1]) {
    const arm = new PIXI.Graphics();
    arm.moveTo(-22, side * 14);
    arm.lineTo(-34, side * 22);
    arm.stroke({ color: 0x555555, width: 1.5 });
    container.addChild(arm);
  }

  // Main body — narrow F1-style monocoque
  const body = new PIXI.Graphics();
  body.poly([
    50, -6,     // nose tip
    52,  0,     // nose point
    50,  6,
    34,  14,    // front of sidepods
    -18, 16,    // widest point
    -44, 12,    // rear taper
    -48,  6,    // rear end
    -48, -6,
    -44, -12,
    -18, -16,
    34, -14,
  ]);
  body.fill({ color: hexColor });
  body.stroke({ color: dark, width: 1 });
  container.addChild(body);

  // Engine cover spine (center line detail)
  const spine = new PIXI.Graphics();
  spine.poly([
    -14, -3,
    -42, -2,
    -42,  2,
    -14,  3,
  ]);
  spine.fill({ color: dark });
  container.addChild(spine);

  // Side pods with air intake shape
  for (const side of [-1, 1]) {
    const pod = new PIXI.Graphics();
    pod.poly([
      10, side * 14,
      20, side * 12,
      22, side * 8,
      -14, side * 10,
      -18, side * 14,
    ]);
    pod.fill({ color: dark });
    container.addChild(pod);

    // Air intake opening
    const intake = new PIXI.Graphics();
    intake.poly([
      12, side * 13,
      18, side * 11,
      16, side * 9,
      10, side * 11,
    ]);
    intake.fill({ color: darker });
    container.addChild(intake);
  }

  // Cockpit opening
  const cockpit = new PIXI.Graphics();
  cockpit.poly([
    20, -8,
    26, -4,
    26,  4,
    20,  8,
    0,   9,
    -6,  6,
    -6, -6,
    0,  -9,
  ]);
  cockpit.fill({ color: 0x1a1a1a });
  container.addChild(cockpit);

  // Halo device
  const halo = new PIXI.Graphics();
  halo.poly([
    22, -5,
    24, -3,
    24,  3,
    22,  5,
    8,   6,
    6,   5,
    6,  -5,
    8,  -6,
  ]);
  halo.stroke({ color: 0x888888, width: 1.5 });
  container.addChild(halo);

  // Driver helmet
  const helmet = new PIXI.Graphics();
  helmet.circle(8, 0, 4.5);
  helmet.fill({ color: light });
  helmet.stroke({ color: 0xaaaaaa, width: 1 });
  container.addChild(helmet);

  // Nose stripe
  const stripe = new PIXI.Graphics();
  stripe.poly([
    48, -2,
    50,  0,
    48,  2,
    34,  2,
    34, -2,
  ]);
  stripe.fill({ color: light });
  container.addChild(stripe);

  // Rear wing (tall, wide)
  const wing = new PIXI.Graphics();
  wing.roundRect(-52, -28, 6, 56, 1);
  wing.fill({ color: hexColor });
  wing.stroke({ color: dark, width: 1 });
  container.addChild(wing);

  // Wing endplates
  for (const side of [-1, 1]) {
    const plate = new PIXI.Graphics();
    plate.poly([
      -54, side * 26,
      -44, side * 26,
      -44, side * 22,
      -54, side * 24,
    ]);
    plate.fill({ color: darker });
    container.addChild(plate);
  }

  // DRS flap detail on rear wing
  const drs = new PIXI.Graphics();
  drs.roundRect(-56, -24, 3, 48, 0.5);
  drs.fill({ color: darker });
  container.addChild(drs);

  return container;
}

export function updateCars(playerStates, geometry) {
  const now = performance.now();

  // Compute base positions for all active cars
  const basePositions = new Map();
  for (const [peerId, ps] of playerStates) {
    if (ps.offTrack || ps.finished) continue;
    const pos = getPositionOnTrack(geometry, ps.segIndex, ps.progress, ps.laneOffset || 0);
    basePositions.set(peerId, { x: pos.x, y: pos.y, angle: pos.angle, distance: ps.distance, speed: ps.speed });
  }

  // Compute and smooth overtake offsets
  const targets = computeOvertakeOffsets(basePositions, currentTrackLength);
  const smoothed = smoothVisualOffsets(targets);

  // Render all cars
  for (const [peerId, ps] of playerStates) {
    let car = cars.get(peerId);
    if (!car) {
      car = createCarGraphic(ps.color);
      carContainer.addChild(car);
      cars.set(peerId, car);
    }

    if (ps.offTrack) {
      const elapsed = now - ps.offTrackStart;

      if (elapsed < DRIFT_PHASE_MS) {
        const t = easeOutQuad(elapsed / DRIFT_PHASE_MS);
        const driftScale = Math.min(ps.offTrackSpeed / MAX_SPEED, 1);
        const forwardDist = TRACK_WIDTH * 2.5 * t * driftScale;
        const lateralDist = TRACK_WIDTH * 1.0 * t * driftScale;
        const fwdAngle = ps.offTrackAngle;
        const latAngle = fwdAngle + ps.offTrackDirection * (Math.PI / 2);

        car.x = ps.offTrackX + Math.cos(fwdAngle) * forwardDist + Math.cos(latAngle) * lateralDist;
        car.y = ps.offTrackY + Math.sin(fwdAngle) * forwardDist + Math.sin(latAngle) * lateralDist;
        // Spin during drift
        car.rotation = ps.offTrackAngle + (t * Math.PI * 2 * ps.offTrackDirection);
        car.alpha = 1.0;
      } else {
        const blinkElapsed = elapsed - DRIFT_PHASE_MS;
        const blinkCycle = Math.sin(blinkElapsed / 80 * Math.PI);
        car.alpha = 0.2 + Math.abs(blinkCycle) * 0.6;
        const pos = getPositionOnTrack(geometry, ps.offTrackSegIndex, ps.offTrackProgress, 0);
        car.x = pos.x;
        car.y = pos.y;
        car.rotation = pos.angle;
      }
    } else {
      const offset = (ps.laneOffset || 0) + (smoothed.get(peerId) || 0);
      const pos = getPositionOnTrack(geometry, ps.segIndex, ps.progress, offset);
      car.x = pos.x;
      car.y = pos.y;
      car.rotation = pos.angle;
      car.alpha = 1.0;
    }
  }
}

// --- HUD (DOM-based, renderer-agnostic but lives here for now) ---

export function updateHUD(playerStates, totalLaps) {
  const hud = document.getElementById('hud');
  const sorted = [...playerStates.values()].sort((a, b) => b.distance - a.distance);
  hud.innerHTML = sorted.map(ps => `
    <div class="hud-player">
      <span class="hud-dot" style="background:${ps.color}"></span>
      ${ps.name} — Lap ${totalLaps ? `${ps.lap}/${totalLaps}` : ps.lap}${ps.offTrack ? ' OFF TRACK' : ''}${ps.finished ? ` P${ps.place}` : ''}
    </div>
  `).join('');
}

// --- Helpers ---

function easeOutQuad(t) {
  return t * (2 - t);
}

function getTrackBounds(geometry) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  function expand(x, y) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  for (const seg of geometry) {
    const hw = TRACK_WIDTH / 2;

    if (seg.type === 'straight') {
      const nx = -Math.sin(seg.startAngle) * hw;
      const ny = Math.cos(seg.startAngle) * hw;
      expand(seg.startX + nx, seg.startY + ny);
      expand(seg.startX - nx, seg.startY - ny);
      expand(seg.endX + nx, seg.endY + ny);
      expand(seg.endX - nx, seg.endY - ny);
    } else if (seg.cx !== undefined) {
      // Tight curve bounds: check endpoints and axis crossings within the arc
      const sign = Math.sign(seg.angle);
      const angleRad = (seg.angle * Math.PI) / 180;
      const outerR = seg.radius + hw;
      const innerR = seg.radius - hw;

      // Start and end perpendicular angles
      const pStart = seg.startAngle + (sign * Math.PI) / 2;
      const pEnd = seg.endAngle + (sign * Math.PI) / 2;

      // Expand by start/end points at both inner and outer radii
      for (const r of [innerR, outerR]) {
        expand(seg.cx - Math.cos(pStart) * r, seg.cy - Math.sin(pStart) * r);
        expand(seg.cx - Math.cos(pEnd) * r, seg.cy - Math.sin(pEnd) * r);
      }

      // Check axis-aligned extremes (0, π/2, π, 3π/2) that fall within the arc
      // The perpendicular angle sweeps from pStart to pStart + angleRad
      for (let axis = 0; axis < 4; axis++) {
        const axisAngle = (axis * Math.PI) / 2;
        // Normalize the sweep check
        let delta = axisAngle - pStart;
        // Normalize delta into the sweep direction
        if (sign > 0) {
          delta = ((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (delta <= Math.abs(angleRad)) {
            expand(seg.cx - Math.cos(axisAngle) * outerR, seg.cy - Math.sin(axisAngle) * outerR);
            expand(seg.cx - Math.cos(axisAngle) * innerR, seg.cy - Math.sin(axisAngle) * innerR);
          }
        } else {
          delta = ((-delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (delta <= Math.abs(angleRad)) {
            expand(seg.cx - Math.cos(axisAngle) * outerR, seg.cy - Math.sin(axisAngle) * outerR);
            expand(seg.cx - Math.cos(axisAngle) * innerR, seg.cy - Math.sin(axisAngle) * innerR);
          }
        }
      }
    }
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

function darkenColor(hex, amount) {
  const r = Math.round(((hex >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((hex >> 8) & 0xff) * (1 - amount));
  const b = Math.round((hex & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

function lightenColor(hex, amount) {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((hex >> 8) & 0xff) + (255 - ((hex >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((hex & 0xff) + (255 - (hex & 0xff)) * amount));
  return (r << 16) | (g << 8) | b;
}

function cssColorToHex(cssColor) {
  if (cssColor.startsWith('#')) {
    return parseInt(cssColor.slice(1), 16);
  }
  const el = document.createElement('div');
  el.style.color = cssColor;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  const match = computed.match(/(\d+)/g);
  if (match) {
    const [r, g, b] = match.map(Number);
    return (r << 16) | (g << 8) | b;
  }
  return 0x888888;
}

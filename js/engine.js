import { MAX_SPEED, SPEED_TO_DISTANCE, TRACK_WIDTH, OFF_TRACK_DURATION_MS, GRACE_PERIOD_MS, INPUT_TIMEOUT_MS, STATE_BROADCAST_INTERVAL, DRIFT_RATE, DRIFT_RECOVERY, DRIFT_CRASH_MARGIN, CAR_RADIUS, ACCEL_RATE, DECEL_RATE } from '../shared/constants.js';
import { TRACKS, buildTrackGeometry, getTrackLength, distanceToSegment, getPositionOnTrack, getEffectiveMaxSpeed } from '../shared/track.js';
import { playerState as stateMsg, gameOver } from '../shared/protocol.js';
import { sendTo, broadcast } from './connection.js';

let geometry = null;
let trackLength = 0;
let totalLaps = 3;
let playerStates = new Map(); // peerId → state
let tick = 0;
let running = false;
let paused = false;
let pauseStartTime = 0;
let totalPausedTime = 0;
let rafId = null;
let onUpdate = null;
let onRaceFinish = null;
let finishedCount = 0;
let raceStartTime = 0;
let devMode = false;

export function initEngine(players, track, callbacks) {
  geometry = buildTrackGeometry(track.segments);
  trackLength = getTrackLength(geometry);
  totalLaps = track.laps;
  devMode = !!callbacks.devMode;
  onUpdate = callbacks.onUpdate;
  onRaceFinish = callbacks.onRaceFinish;
  finishedCount = 0;
  raceStartTime = performance.now();
  totalPausedTime = 0;
  paused = false;

  playerStates.clear();
  for (const [peerId, p] of players) {
    playerStates.set(peerId, {
      peerId,
      name: p.name,
      color: p.color,
      index: p.index,
      speed: 0,
      throttle: 0,
      distance: 0,
      segIndex: 0,
      progress: 0,
      lap: 1,
      lastInputTime: 0,
      // Lateral drift (car slides toward edge when too fast in curves)
      laneOffset: 0, // will be pulled toward target lane each frame
      // Off-track state (triggered when drift reaches track edge)
      offTrack: false,
      offTrackStart: 0,
      offTrackSegIndex: 0,
      offTrackProgress: 0,
      offTrackDirection: 0,
      offTrackX: 0,
      offTrackY: 0,
      offTrackAngle: 0,
      offTrackSpeed: 0,
      graceUntil: 0,
      // Finish state
      finished: false,
      finishTime: 0,
      place: 0,
    });
  }

  tick = 0;
}

export function startEngine() {
  running = true;
  rafId = requestAnimationFrame(loop);
}

export function stopEngine() {
  running = false;
  paused = false;
  if (rafId) cancelAnimationFrame(rafId);
}

export function pauseEngine() {
  if (!running || paused) return;
  paused = true;
  pauseStartTime = performance.now();
}

export function resumeEngine() {
  if (!paused) return;
  totalPausedTime += performance.now() - pauseStartTime;
  paused = false;
}

export function isPaused() { return paused; }

export function handleInput(peerId, throttle) {
  const ps = playerStates.get(peerId);
  if (!ps) return;
  ps.throttle = throttle;
  ps.lastInputTime = performance.now();
}

export function getGeometry() { return geometry; }
export function getTrackLen() { return trackLength; }
export function getTotalLaps() { return totalLaps; }
export function getPlayerStates() { return playerStates; }

function loop(timestamp) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  if (paused) return;
  tick++;

  const now = performance.now();

  for (const [peerId, ps] of playerStates) {
    if (ps.finished) continue;

    // Off-track recovery
    if (ps.offTrack) {
      if (now >= ps.offTrackStart + OFF_TRACK_DURATION_MS) {
        ps.offTrack = false;
        ps.speed = 0;
        ps.laneOffset = 0;
        ps.graceUntil = now + GRACE_PERIOD_MS;
        // Reset position to where crash happened
        const crashSeg = geometry[ps.offTrackSegIndex];
        let resetDist = 0;
        for (let i = 0; i < ps.offTrackSegIndex; i++) {
          resetDist += geometry[i].arcLength;
        }
        resetDist += ps.offTrackProgress * crashSeg.arcLength;
        ps.distance = Math.floor(ps.distance / trackLength) * trackLength + resetDist;
        ps.segIndex = ps.offTrackSegIndex;
        ps.progress = ps.offTrackProgress;
      } else {
        continue;
      }
    }

    if (peerId === 'bot') {
      // Bot: drive at just under the effective max speed for current position
      const seg = geometry[ps.segIndex];
      const effMax = getEffectiveMaxSpeed(seg, ps.progress, MAX_SPEED);
      // Look ahead to next segment to brake early
      const nextSeg = geometry[(ps.segIndex + 1) % geometry.length];
      const nextMax = getEffectiveMaxSpeed(nextSeg, 0, MAX_SPEED);
      const brakeTarget = ps.progress > 0.7 ? Math.min(effMax, nextMax) : effMax;
      // Drive at 90% of safe speed for margin
      ps.speed = brakeTarget * 0.9;
    } else {
      // Input timeout — if no recent input, treat as releasing
      const inputActive = (now - ps.lastInputTime) < INPUT_TIMEOUT_MS;
      const targetThrottle = inputActive ? ps.throttle : 0;

      if (peerId === 'local') {
        // Dev slider: instant speed for testing
        ps.speed = targetThrottle * MAX_SPEED;
      } else {
        // Controller: accel/decel — hold button to speed up, release to slow down
        if (targetThrottle > 0) {
          ps.speed += ACCEL_RATE;
        } else {
          ps.speed -= DECEL_RATE;
        }
      }
    }
    ps.speed = Math.max(0, Math.min(MAX_SPEED, ps.speed));

    // Advance position
    ps.distance += ps.speed * SPEED_TO_DISTANCE;

    // Lap tracking
    const totalTrackDist = ps.distance;
    const lapDistance = totalTrackDist % trackLength;
    const currentLap = Math.floor(totalTrackDist / trackLength) + 1;

    if (!devMode && currentLap > totalLaps && !ps.finished) {
      ps.finished = true;
      finishedCount++;
      ps.place = finishedCount;
      ps.finishTime = now - raceStartTime - totalPausedTime;
      sendTo(peerId, gameOver(ps.place, ps.finishTime));

      const allFinished = [...playerStates.values()].every(p => p.finished);
      if (allFinished) {
        onRaceFinish?.();
      }
      continue;
    }

    ps.lap = devMode ? currentLap : Math.min(currentLap, totalLaps);
    const segResult = distanceToSegment(geometry, lapDistance);
    ps.segIndex = segResult.segIndex;
    ps.progress = segResult.progress;

    // Lateral drift physics
    const seg = geometry[ps.segIndex];
    const effectiveMax = getEffectiveMaxSpeed(seg, ps.progress, MAX_SPEED);

    if (seg.type === 'curve' && seg.maxSpeed && ps.speed > effectiveMax && now > ps.graceUntil) {
      // Drifting outward — excess speed pushes car toward edge
      const excess = ps.speed - effectiveMax;
      const driftDir = -Math.sign(seg.angle); // outward from curve
      ps.laneOffset += driftDir * excess * DRIFT_RATE;
    } else if (ps.laneOffset !== 0) {
      // Recovering toward center
      const sign = Math.sign(ps.laneOffset);
      const recovery = Math.min(Math.abs(ps.laneOffset), DRIFT_RECOVERY);
      ps.laneOffset -= sign * recovery;
      if (Math.abs(ps.laneOffset) < 0.1) ps.laneOffset = 0;
    }

    // Crash check — drifted to track edge
    const crashEdge = TRACK_WIDTH / 2 - CAR_RADIUS - DRIFT_CRASH_MARGIN;
    if (Math.abs(ps.laneOffset) >= crashEdge) {
      const crashPos = getPositionOnTrack(geometry, ps.segIndex, ps.progress, ps.laneOffset);
      ps.offTrack = true;
      ps.offTrackStart = now;
      ps.offTrackSegIndex = ps.segIndex;
      ps.offTrackProgress = ps.progress;
      ps.offTrackDirection = Math.sign(ps.laneOffset);
      ps.offTrackX = crashPos.x;
      ps.offTrackY = crashPos.y;
      ps.offTrackAngle = crashPos.angle;
      ps.offTrackSpeed = ps.speed;
      ps.speed = 0;
      ps.laneOffset = 0;
    }
  }

  // Broadcast state to controllers at reduced rate (skip local players)
  if (tick % STATE_BROADCAST_INTERVAL === 0) {
    for (const [peerId, ps] of playerStates) {
      if (peerId === 'local' || peerId === 'bot') continue;
      const currentSeg = geometry[ps.segIndex];
      const nextSeg = geometry[(ps.segIndex + 1) % geometry.length];
      let effectiveMaxSpeed = getEffectiveMaxSpeed(currentSeg, ps.progress, MAX_SPEED);
      if (nextSeg?.maxSpeed && ps.progress > 0.7) {
        const nextEffective = getEffectiveMaxSpeed(nextSeg, 0, MAX_SPEED);
        effectiveMaxSpeed = Math.min(effectiveMaxSpeed, nextEffective);
      }
      sendTo(peerId, stateMsg({
        speed: Math.round(ps.speed),
        maxSpeed: effectiveMaxSpeed,
        lap: ps.lap,
        totalLaps,
        position: getPosition(ps),
        crashed: ps.offTrack,
      }));
    }
  }

  onUpdate?.(playerStates, geometry);
}

function getPosition(ps) {
  const sorted = [...playerStates.values()]
    .filter(p => !p.finished)
    .sort((a, b) => b.distance - a.distance);
  return sorted.indexOf(ps) + 1;
}

// Player colors
export const PLAYER_COLORS = [
  '#e74c3c', // red
  '#3498db', // blue
  '#2ecc71', // green
  '#f39c12', // orange
];

// Physics
export const MAX_SPEED = 100;
export const SPEED_TO_DISTANCE = 0.125; // distance units per speed unit per tick (0.5x speed)
export const OFF_TRACK_DURATION_MS = 2000;
export const DRIFT_PHASE_MS = 600; // how long the drift-outward animation lasts
export const GRACE_PERIOD_MS = 300; // brief immunity after recovery

// Timing
export const INPUT_TIMEOUT_MS = 200;
export const STATE_BROADCAST_INTERVAL = 3; // every 3rd tick = 20fps
export const CONTROLLER_SEND_INTERVAL = 100; // ms between input sends

// Track rendering
export const TRACK_WIDTH = 200;
export const CAR_RADIUS = 12;

// Acceleration/deceleration (controller players only, dev slider is instant)
export const ACCEL_RATE = 0.85;   // speed increase per tick when button held (~2s to max)
export const DECEL_RATE = 1.2;    // speed decrease per tick when button released (~1.4s to zero)

// Lateral drift physics
export const DRIFT_RATE = 0.06;      // lateral drift per excess speed per tick
export const DRIFT_RECOVERY = 0.8;   // lateral recovery per tick when under limit
export const DRIFT_CRASH_MARGIN = 5; // pixels inside track edge before crash

// Speed-to-hue: 0 → green (120), MAX_SPEED → red (0)
// Maps speed value to HSL hue on the green-to-red gradient
export function speedToHue(speed) {
  return 120 * (1 - Math.min(speed / MAX_SPEED, 1));
}

// Speed-to-color for general use (e.g. curve coloring)
export function speedToColor(speed) {
  const hue = speedToHue(speed);
  return `hsl(${hue}, 80%, 45%)`;
}

// For controller background gradient (fixed, not relative to curve)
export function speedToAbsoluteColor(ratio) {
  const hue = 120 * (1 - Math.min(ratio, 1));
  return `hsl(${hue}, 80%, 45%)`;
}

// Quick script to test track closure
// Run: node scripts/check-track.js

import { SEGMENT_TYPES, buildTrackGeometry, getTrackLength } from '../shared/track.js';
const S = SEGMENT_TYPES;

// Closure math (all axis-aligned):
// Angles: +90 -90 +90 -90 +180 +90 +90 = 360° ✓
// x: 400+150+0+100+200+100+0+100+300+0-400-400-400-200-100+0+0+0+150 = 0 ✓
// y: 0+150+200+100+0+100+400+100+0+200+0+0+0+0-100-400-400-200-150 = 0 ✓
const segments = [
  S.LONG_STRAIGHT,            // 400 right
  S.MEDIUM_RIGHT,             // +90° → down
  S.SHORT_STRAIGHT,           // 200 down
  S.SHARP_LEFT,               // -90° → right (chicane entry)
  S.SHORT_STRAIGHT,           // 200 right
  S.SHARP_RIGHT,              // +90° → down (chicane exit)
  S.LONG_STRAIGHT,            // 400 down
  S.SHARP_LEFT,               // -90° → right
  S.MEDIUM_STRAIGHT,          // 300 right
  S.WIDE_HAIRPIN_RIGHT,       // +180° → left (HAIRPIN!)
  S.LONG_STRAIGHT,            // 400 left
  S.LONG_STRAIGHT,            // 400 left
  S.LONG_STRAIGHT,            // 400 left
  S.SHORT_STRAIGHT,           // 200 left
  S.SHARP_RIGHT,              // +90° → up
  S.LONG_STRAIGHT,            // 400 up
  S.LONG_STRAIGHT,            // 400 up
  S.SHORT_STRAIGHT,           // 200 up
  S.MEDIUM_RIGHT,             // +90° → right
];

// Angle check
let totalAngle = 0;
for (const seg of segments) {
  if (seg.type === 'curve') totalAngle += seg.angle;
}
console.log(`Total angle: ${totalAngle}° (need 360°)`);

const geo = buildTrackGeometry(segments);
const last = geo[geo.length - 1];
const endAngleDeg = (last.endAngle * 180 / Math.PI) % 360;

console.log(`End position: (${last.endX.toFixed(1)}, ${last.endY.toFixed(1)})`);
console.log(`End angle: ${endAngleDeg.toFixed(1)}°`);
console.log(`Gap from origin: ${Math.sqrt(last.endX**2 + last.endY**2).toFixed(1)} units`);
console.log(`Track length: ${getTrackLength(geo).toFixed(0)} units`);
console.log(`Segments: ${geo.length}`);

// Per-segment positions
console.log('\nSegment breakdown:');
for (let i = 0; i < geo.length; i++) {
  const s = geo[i];
  const label = s.type === 'straight' ? `straight(${s.arcLength})` : `curve(${s.angle}°, r=${s.radius})`;
  const heading = (s.endAngle * 180 / Math.PI).toFixed(0);
  console.log(`  ${i}: ${label.padEnd(22)} → end(${s.endX.toFixed(0)}, ${s.endY.toFixed(0)}) heading ${heading}°`);
}

// Quick script to test track closure
// Run: node scripts/check-track.js

import { TRACKS, buildTrackGeometry, getTrackLength } from '../shared/track.js';

const trackName = process.argv[2] || 'starter';
if (!TRACKS[trackName]) {
  console.log(`Unknown track: ${trackName}. Available: ${Object.keys(TRACKS).join(', ')}`);
  process.exit(1);
}
const track = TRACKS[trackName];
const segments = track.segments;

// Angle check
let totalAngle = 0;
for (const seg of segments) {
  if (seg.type === 'curve') totalAngle += seg.angle;
}
console.log(`Track: ${track.name}`);
console.log(`Total angle: ${totalAngle}° (need 360°)`);

const geo = buildTrackGeometry(segments);
const last = geo[geo.length - 1];
const endAngleDeg = (last.endAngle * 180 / Math.PI) % 360;

console.log(`End position: (${last.endX.toFixed(1)}, ${last.endY.toFixed(1)})`);
console.log(`End angle: ${endAngleDeg.toFixed(1)}°`);
console.log(`Gap from origin: ${Math.sqrt(last.endX**2 + last.endY**2).toFixed(1)} units`);
console.log(`Track length: ${getTrackLength(geo).toFixed(0)} units`);
console.log(`Segments: ${geo.length}`);

// Bounding box
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const s of geo) {
  for (const [x, y] of [[s.startX, s.startY], [s.endX, s.endY]]) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
}
const width = maxX - minX;
const height = maxY - minY;
console.log(`Bounding box: ${width.toFixed(0)} × ${height.toFixed(0)} (ratio ${(width / height).toFixed(2)}:1)`);

// Per-segment positions
console.log('\nSegment breakdown:');
for (let i = 0; i < geo.length; i++) {
  const s = geo[i];
  const label = s.type === 'straight'
    ? `straight(${s.arcLength}${s.feature ? `, ${s.feature}` : ''})`
    : `curve(${s.angle}°, r=${s.radius})`;
  const heading = (s.endAngle * 180 / Math.PI).toFixed(0);
  console.log(`  ${i}: ${label.padEnd(28)} → end(${s.endX.toFixed(0)}, ${s.endY.toFixed(0)}) heading ${heading}°`);
}

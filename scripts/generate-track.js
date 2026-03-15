// CLI wrapper for procedural track generator
// Usage: node scripts/generate-track.js [--seed N] [--name "Track Name"] [--preview output.svg]

import { generateRandomTrack } from '../shared/generate-track.js';
import { buildTrackGeometry, getTrackLength } from '../shared/track.js';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const args = process.argv.slice(2);
let seed = null;
let trackName = null;
let previewFile = null;
let maxAttempts = 1000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = parseInt(args[++i]);
  else if (args[i] === '--name') trackName = args[++i];
  else if (args[i] === '--preview') previewFile = args[++i];
  else if (args[i] === '--attempts') maxAttempts = parseInt(args[++i]);
}

if (seed === null) seed = Math.floor(Math.random() * 1000000);

console.error(`Generating track (starting seed: ${seed}, max attempts: ${maxAttempts})...`);

const result = generateRandomTrack(seed, maxAttempts);

if (!result) {
  console.error(`Failed to generate valid track after ${maxAttempts} attempts`);
  process.exit(1);
}

if (trackName) result.name = trackName;

// Compute stats for display
const geometry = buildTrackGeometry(result.segments);
const last = geometry[geometry.length - 1];
const gap = Math.sqrt(last.endX ** 2 + last.endY ** 2);
const curves = result.segments.filter(s => s.type === 'curve');

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const seg of geometry) {
  for (const [x, y] of [[seg.startX, seg.startY], [seg.endX, seg.endY]]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}

console.error(`Success (seed: ${result.seed})`);
console.error(`Stats:`, JSON.stringify({
  seed: result.seed,
  numSegments: result.segments.length,
  trackLength: Math.round(getTrackLength(geometry)),
  closure: { gap: gap.toFixed(1) },
  space: { width: Math.round(maxX - minX), height: Math.round(maxY - minY), ratio: ((maxX - minX) / (maxY - minY)).toFixed(2) },
  curves: {
    numCurves: curves.length,
    sharpCount: curves.filter(c => c.radius < 250).length,
    avgMaxSpeed: +(curves.reduce((s, c) => s + c.maxSpeed, 0) / curves.length).toFixed(1),
    leftTurns: curves.filter(c => c.angle < 0).length,
  },
}, null, 2));

const json = JSON.stringify(result, null, 2);
process.stdout.write(json + '\n');

if (previewFile) {
  writeFileSync('/tmp/_generated_track.json', json);
  try {
    execSync(`node scripts/preview-track.js --file "${previewFile}" < /tmp/_generated_track.json`, {
      cwd: new URL('..', import.meta.url).pathname,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    console.error(`Preview written to ${previewFile}`);
  } catch (e) {
    console.error(`Failed to generate preview: ${e.message}`);
  }
}

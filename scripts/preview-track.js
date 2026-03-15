// Generate SVG preview of a track
// Usage: node scripts/preview-track.js [trackName] [--file output.svg]
// If no trackName given and stdin has JSON, reads generated track from stdin

import { TRACKS, buildTrackGeometry, getPositionOnTrack } from '../shared/track.js';
import { TRACK_WIDTH, speedToColor } from '../shared/constants.js';
import { readFileSync, writeFileSync } from 'fs';

// Parse args
const args = process.argv.slice(2);
let outputFile = null;
let trackName = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' || args[i] === '-o') {
    outputFile = args[++i];
  } else {
    trackName = args[i];
  }
}

// Get segments
let segments;
let name;

if (trackName && TRACKS[trackName]) {
  segments = TRACKS[trackName].segments;
  name = TRACKS[trackName].name;
} else if (!process.stdin.isTTY) {
  // Read JSON from stdin
  const input = readFileSync('/dev/stdin', 'utf8');
  const data = JSON.parse(input);
  segments = data.segments || data;
  name = data.name || 'Generated Track';
} else {
  // Default to starter
  trackName = trackName || 'starter';
  if (!TRACKS[trackName]) {
    console.error(`Unknown track: ${trackName}. Available: ${Object.keys(TRACKS).join(', ')}`);
    process.exit(1);
  }
  segments = TRACKS[trackName].segments;
  name = TRACKS[trackName].name;
}

const geometry = buildTrackGeometry(segments);

// Sample points along road edges
const SAMPLES_PER_UNIT = 0.05; // 1 sample per 20 units
const halfWidth = TRACK_WIDTH / 2;

// Collect all edge points and center points for bounding box
let allPoints = [];
let centerLine = [];
let leftEdge = [];
let rightEdge = [];

// Per-segment colored sections
const segmentPaths = [];

for (let si = 0; si < geometry.length; si++) {
  const seg = geometry[si];
  const numSamples = Math.max(4, Math.ceil(seg.arcLength * SAMPLES_PER_UNIT));
  const segLeft = [];
  const segRight = [];
  const segCenter = [];

  for (let j = 0; j <= numSamples; j++) {
    const progress = j / numSamples;
    const center = getPositionOnTrack(geometry, si, progress, 0);
    const left = getPositionOnTrack(geometry, si, progress, -halfWidth);
    const right = getPositionOnTrack(geometry, si, progress, halfWidth);

    segCenter.push(center);
    segLeft.push(left);
    segRight.push(right);
    allPoints.push(left, right);
  }

  centerLine.push(...segCenter);
  leftEdge.push(...segLeft);
  rightEdge.push(...segRight);

  segmentPaths.push({
    seg,
    left: segLeft,
    right: segRight,
    center: segCenter,
  });
}

// Compute bounding box
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const p of allPoints) {
  minX = Math.min(minX, p.x);
  maxX = Math.max(maxX, p.x);
  minY = Math.min(minY, p.y);
  maxY = Math.max(maxY, p.y);
}

const padding = 100;
minX -= padding;
minY -= padding;
maxX += padding;
maxY += padding;
const svgWidth = maxX - minX;
const svgHeight = maxY - minY;

// Build SVG
const svgParts = [];

svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${svgWidth} ${svgHeight}" width="${Math.min(1200, svgWidth)}">`);
svgParts.push(`<rect x="${minX}" y="${minY}" width="${svgWidth}" height="${svgHeight}" fill="#1a1a2e"/>`);

// Draw road surface per segment (colored by type)
for (const sp of segmentPaths) {
  const { seg, left, right } = sp;

  // Build polygon: left edge forward, right edge backward
  const points = [];
  for (const p of left) points.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  for (let i = right.length - 1; i >= 0; i--) points.push(`${right[i].x.toFixed(1)},${right[i].y.toFixed(1)}`);

  let fillColor;
  if (seg.type === 'straight') {
    fillColor = '#333';
  } else {
    fillColor = speedToColor(seg.maxSpeed);
  }

  svgParts.push(`<polygon points="${points.join(' ')}" fill="${fillColor}" fill-opacity="0.5" stroke="none"/>`);
}

// Draw road edges
function pathFromPoints(pts) {
  return 'M ' + pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
}

svgParts.push(`<path d="${pathFromPoints(leftEdge)}" fill="none" stroke="white" stroke-width="2"/>`);
svgParts.push(`<path d="${pathFromPoints(rightEdge)}" fill="none" stroke="white" stroke-width="2"/>`);

// Draw center line (dashed)
svgParts.push(`<path d="${pathFromPoints(centerLine)}" fill="none" stroke="#666" stroke-width="1" stroke-dasharray="10,10"/>`);

// Mark start/finish
const startPos = getPositionOnTrack(geometry, 0, 0, 0);
const startLeft = getPositionOnTrack(geometry, 0, 0, -halfWidth);
const startRight = getPositionOnTrack(geometry, 0, 0, halfWidth);
svgParts.push(`<line x1="${startLeft.x.toFixed(1)}" y1="${startLeft.y.toFixed(1)}" x2="${startRight.x.toFixed(1)}" y2="${startRight.y.toFixed(1)}" stroke="#e74c3c" stroke-width="4"/>`);
svgParts.push(`<circle cx="${startPos.x.toFixed(1)}" cy="${startPos.y.toFixed(1)}" r="8" fill="#e74c3c"/>`);
svgParts.push(`<text x="${startPos.x.toFixed(1)}" y="${(startPos.y - 15).toFixed(1)}" fill="white" font-size="16" text-anchor="middle" font-family="sans-serif">START</text>`);

// Label segments with index
for (let i = 0; i < geometry.length; i++) {
  const seg = geometry[i];
  const mid = getPositionOnTrack(geometry, i, 0.5, 0);
  const label = seg.type === 'straight'
    ? `${i}: S${Math.round(seg.arcLength)}`
    : `${i}: r${seg.radius} ${seg.angle}°`;
  svgParts.push(`<text x="${mid.x.toFixed(1)}" y="${mid.y.toFixed(1)}" fill="yellow" font-size="11" text-anchor="middle" font-family="monospace">${label}</text>`);
}

// Title
svgParts.push(`<text x="${minX + 20}" y="${minY + 30}" fill="white" font-size="20" font-family="sans-serif">${name}</text>`);

svgParts.push('</svg>');

const svg = svgParts.join('\n');

if (outputFile) {
  writeFileSync(outputFile, svg);
  console.error(`Wrote ${outputFile}`);
} else {
  process.stdout.write(svg);
}

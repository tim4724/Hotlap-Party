// Synthesized racing audio — engine sounds, crash effects, spatial panning
// Uses Web Audio API with oscillators (no sample files needed)

import { MAX_SPEED } from '../../shared/constants.js';

let ctx = null;
let masterGain = null;
let engineSources = new Map();
let screenWidth = window.innerWidth;
let resumed = false;

// Engine tuning — modeled after high-rev V10/V8 whine
const IDLE_FREQ = 45;
const REDLINE_FREQ = 580;
const ENGINE_VOLUME = 0.035;

export function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  masterGain = ctx.createGain();
  masterGain.gain.value = 1.0;
  masterGain.connect(ctx.destination);

  const resume = () => {
    if (!resumed && ctx.state === 'suspended') {
      ctx.resume();
      resumed = true;
    }
  };
  window.addEventListener('click', resume, { once: true });
  window.addEventListener('touchstart', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

export function suspendAudio() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
    resumed = true;
  }
}

export function updateAudio(playerStates) {
  if (!ctx || ctx.state === 'suspended') return;
  screenWidth = window.innerWidth;
  const now = ctx.currentTime;

  for (const [peerId, ps] of playerStates) {
    if (ps.finished) {
      removeEngine(peerId);
      continue;
    }

    let src = engineSources.get(peerId);
    if (!src) {
      src = createEngineSound();
      engineSources.set(peerId, src);
    }

    // Stereo pan
    const screenX = ps._screenX;
    const pan = screenX !== undefined
      ? Math.max(-1, Math.min(1, (screenX / screenWidth) * 2 - 1))
      : 0;
    src.panner.pan.setTargetAtTime(pan, now, 0.05);

    if (ps.offTrack) {
      // Engine drops to rough idle off track
      src.out.gain.setTargetAtTime(ENGINE_VOLUME * 0.08, now, 0.2);
      setEngineFreq(src, IDLE_FREQ * 0.6, now, 0.15);
      src.filter.frequency.setTargetAtTime(300, now, 0.15);
    } else {
      const r = Math.min(ps.speed / MAX_SPEED, 1);
      // Narrower frequency range — subtle pitch rise, not a full octave sweep
      const freq = IDLE_FREQ + (REDLINE_FREQ - IDLE_FREQ) * 0.3 * r;

      // Volume barely changes — always sounds like a running engine
      const vol = ENGINE_VOLUME * (0.7 + 0.3 * r);

      setEngineFreq(src, freq, now, 0.015);

      // Filter stays mostly open — slight brightening at speed
      const filterFreq = 1500 + 1500 * r;
      src.filter.frequency.setTargetAtTime(filterFreq, now, 0.015);

      src.out.gain.setTargetAtTime(vol, now, 0.015);
    }
  }

  for (const id of engineSources.keys()) {
    if (!playerStates.has(id)) removeEngine(id);
  }
}

export function playCrashSound(screenX) {
  if (!ctx || ctx.state === 'suspended') return;
  const now = ctx.currentTime;

  const panner = ctx.createStereoPanner();
  const pan = screenX !== undefined ? (screenX / screenWidth) * 2 - 1 : 0;
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(masterGain);

  // Big burst of noise — the whole crash in one shaped hit
  const len = 0.35;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    // Hard attack, fast decay — just a big smash
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Low-pass to keep it beefy, not tinny
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;
  lp.Q.value = 1;

  const g = ctx.createGain();
  g.gain.value = 0.45;

  src.connect(lp); lp.connect(g); g.connect(panner);
  src.start(now);

  // Sub thump for weight
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(100, now);
  thump.frequency.exponentialRampToValueAtTime(30, now + 0.1);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.5, now);
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  thump.connect(tg); tg.connect(panner);
  thump.start(now); thump.stop(now + 0.2);
}

// --- Engine internals ---

function setEngineFreq(src, freq, now, tc) {
  src.fundamental.frequency.setTargetAtTime(freq, now, tc);
  src.harmonic2.frequency.setTargetAtTime(freq * 2.005, now, tc);
  src.harmonic3.frequency.setTargetAtTime(freq * 3.01, now, tc);
  src.harmonic4.frequency.setTargetAtTime(freq * 4.98, now, tc);
  src.subOsc.frequency.setTargetAtTime(freq * 0.5, now, tc);
}

function createEngineSound() {
  // Fundamental — sawtooth for raw harmonic-rich engine tone
  const fundamental = ctx.createOscillator();
  fundamental.type = 'sawtooth';
  fundamental.frequency.value = IDLE_FREQ;

  // 2nd harmonic — slightly detuned for chorus/growl
  const harmonic2 = ctx.createOscillator();
  harmonic2.type = 'sawtooth';
  harmonic2.frequency.value = IDLE_FREQ * 2.005;

  // 3rd harmonic — adds the "scream" at high RPM
  const harmonic3 = ctx.createOscillator();
  harmonic3.type = 'sawtooth';
  harmonic3.frequency.value = IDLE_FREQ * 3.01;

  // 5th harmonic — very faint upper shimmer
  const harmonic4 = ctx.createOscillator();
  harmonic4.type = 'triangle';
  harmonic4.frequency.value = IDLE_FREQ * 4.98;

  // Sub-bass rumble
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = IDLE_FREQ * 0.5;

  // Individual gains
  const fGain = ctx.createGain(); fGain.gain.value = 0.4;
  const h2Gain = ctx.createGain(); h2Gain.gain.value = 0.25;
  const h3Gain = ctx.createGain(); h3Gain.gain.value = 0.08;
  const h4Gain = ctx.createGain(); h4Gain.gain.value = 0.03;
  const subGain = ctx.createGain(); subGain.gain.value = 0.3;

  // Mix bus
  const mix = ctx.createGain();
  mix.gain.value = 1;

  fundamental.connect(fGain); fGain.connect(mix);
  harmonic2.connect(h2Gain); h2Gain.connect(mix);
  harmonic3.connect(h3Gain); h3Gain.connect(mix);
  harmonic4.connect(h4Gain); h4Gain.connect(mix);
  subOsc.connect(subGain); subGain.connect(mix);

  // Resonant low-pass — key to the muffled-to-screaming character
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  filter.Q.value = 4;

  // Soft saturation for that overdriven exhaust character
  const shaper = ctx.createWaveShaper();
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n / 2)) - 1;
    // Soft clip with asymmetry for even harmonics
    curve[i] = Math.tanh(x * 2.5) * 0.8 + Math.tanh(x * x * x * 4) * 0.2;
  }
  shaper.curve = curve;
  shaper.oversample = '2x';

  // Output gain
  const out = ctx.createGain();
  out.gain.value = 0;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  mix.connect(filter);
  filter.connect(shaper);
  shaper.connect(out);
  out.connect(panner);
  panner.connect(masterGain);

  fundamental.start();
  harmonic2.start();
  harmonic3.start();
  harmonic4.start();
  subOsc.start();

  return {
    fundamental, harmonic2, harmonic3, harmonic4, subOsc,
    fGain, h2Gain, h3Gain, h4Gain, subGain,
    filter, shaper, out, panner,
  };
}

function removeEngine(peerId) {
  const src = engineSources.get(peerId);
  if (!src) return;
  src.out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  setTimeout(() => {
    for (const o of [src.fundamental, src.harmonic2, src.harmonic3, src.harmonic4, src.subOsc]) {
      o.stop(); o.disconnect();
    }
    for (const n of [src.fGain, src.h2Gain, src.h3Gain, src.h4Gain, src.subGain,
                      src.filter, src.shaper, src.out, src.panner]) {
      n.disconnect();
    }
  }, 400);
  engineSources.delete(peerId);
}

function makeNoiseBuf(duration) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

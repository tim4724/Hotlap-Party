import { MSG, ROOM_STATE } from '../shared/protocol.js';
import { PLAYER_COLORS, MAX_SPEED } from '../shared/constants.js';
import { getEffectiveMaxSpeed } from '../shared/track.js';
import { connect, broadcast, sendTo } from './connection.js';
import { initLobby, addPeer, handleHello, removePeer, getPlayers, isHost, showConnectionInfo, preloadQR, resetForNewGame } from './lobby.js';
import { initEngine, startEngine, stopEngine, pauseEngine, resumeEngine, isPaused, handleInput, getGeometry, getTotalLaps, getPlayerStates } from './engine.js';
import { initRenderer, drawTrack, updateCars, updateHUD } from './renderer.js';
import { showResults } from './results.js';

// --- Screens ---

const SCREEN = { WELCOME: 'welcome', LOBBY: 'lobby', GAME: 'game' };

const screenEls = {
  welcome: document.getElementById('welcome-screen'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen'),
};

let currentScreen = SCREEN.WELCOME;
let roomState = ROOM_STATE.LOBBY;
let localPlayerId = null;
let currentLocalThrottle = 0;
let sliderActive = false;

function showScreen(name) {
  currentScreen = name;
  for (const [k, el] of Object.entries(screenEls)) {
    el.classList.toggle('hidden', k !== name);
  }
  // Show fullscreen toggle on all screens except welcome
  document.getElementById('fullscreen-btn').classList.toggle('hidden', name === SCREEN.WELCOME);
  // Reset overlays when leaving game
  if (name !== SCREEN.GAME) {
    document.getElementById('countdown-overlay').classList.add('hidden');
    document.getElementById('results-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
  }
}

// --- Browser History ---

window.addEventListener('popstate', (e) => {
  const target = e.state?.screen;

  if (currentScreen === SCREEN.LOBBY) {
    // Back from lobby → welcome
    resetToWelcome();
  } else if (currentScreen === SCREEN.GAME) {
    // Back from game (any sub-state) → lobby
    returnToLobby();
  } else if (currentScreen === SCREEN.WELCOME && target === SCREEN.LOBBY) {
    // Block forward to lobby
    history.back();
  }
});

// --- Init ---

async function init() {
  initLobby({
    onStartRace: startMultiplayerRace,
    onSoloRace: startSoloRace,
    getGameState: () => ({ roomState, paused: isPaused() }),
  });
  showScreen(SCREEN.WELCOME);

  // Pre-create room on welcome screen
  connectInBackground();

  // Welcome → Lobby (enter fullscreen)
  document.getElementById('new-game-btn').addEventListener('click', () => {
    enterFullscreen();
    showScreen(SCREEN.LOBBY);
    history.pushState({ screen: SCREEN.LOBBY }, '');
    showConnectionInfo();
  });

  // Fullscreen toggle
  const fsBtn = document.getElementById('fullscreen-btn');
  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '⛶' : '⛶';
    fsBtn.classList.toggle('is-fullscreen', !!document.fullscreenElement);
  });

  // Pause buttons (display-side)
  document.getElementById('pause-btn').addEventListener('click', () => pauseGame());
  document.getElementById('pause-continue-btn').addEventListener('click', () => resumeGame());
  document.getElementById('pause-newgame-btn').addEventListener('click', () => returnToLobby());

  // Results buttons
  document.getElementById('race-again-btn').addEventListener('click', () => playAgain());
  document.getElementById('new-game-results-btn').addEventListener('click', () => returnToLobby());
}

function resetToWelcome() {
  stopEngine();
  hideDevSlider();
  roomState = ROOM_STATE.LOBBY;
  showScreen(SCREEN.WELCOME);
}

async function connectInBackground() {
  try {
    const roomCode = await connect({
      onMsg: handleMessage,
      onJoin: (peerId) => addPeer(peerId),
      onLeave: (peerId) => {
        removePeer(peerId);
        if ((roomState === ROOM_STATE.PLAYING || roomState === ROOM_STATE.COUNTDOWN) &&
            getPlayers().size === 0 && localPlayerId === null) {
          stopEngine();
          hideDevSlider();
          roomState = ROOM_STATE.LOBBY;
          showScreen(SCREEN.LOBBY);
        }
      },
    });
    console.log(`Room created: ${roomCode}`);
    preloadQR();
  } catch (err) {
    console.log('WebSocket unavailable — solo mode only');
  }
}

function handleMessage(fromPeerId, data) {
  switch (data.type) {
    case MSG.HELLO:
      handleHello(fromPeerId, data.name);
      break;
    case MSG.INPUT:
      handleInput(fromPeerId, data.throttle);
      break;
    case MSG.START_GAME:
      if (isHost(fromPeerId) && roomState === ROOM_STATE.LOBBY) startMultiplayerRace();
      break;
    case MSG.PAUSE_GAME:
      if (isHost(fromPeerId)) pauseGame();
      break;
    case MSG.RESUME_GAME:
      if (isHost(fromPeerId)) resumeGame();
      break;
    case MSG.PLAY_AGAIN:
      if (isHost(fromPeerId) && roomState === ROOM_STATE.RESULTS) playAgain();
      break;
    case MSG.RETURN_TO_LOBBY:
      if (isHost(fromPeerId)) returnToLobby();
      break;
  }
}

// --- Solo Mode ---

async function startSoloRace() {
  localPlayerId = 'local';
  const localPlayers = new Map();
  localPlayers.set(localPlayerId, {
    name: 'Player 1',
    color: PLAYER_COLORS[0],
    index: 0,
  });

  await startRaceWithPlayers(localPlayers, true);
  initDevSlider();
}

// --- Multiplayer Mode ---

async function startMultiplayerRace() {
  localPlayerId = null;
  const players = getPlayers();
  if (players.size === 0) return;
  await startRaceWithPlayers(players);
}

// --- Play Again ---

async function playAgain() {
  if (roomState !== ROOM_STATE.RESULTS) return;
  document.getElementById('results-overlay').classList.add('hidden');
  const players = getPlayers();
  if (players.size === 0) {
    returnToLobby();
    return;
  }
  await startRaceWithPlayers(players);
}

// --- Pause ---

function pauseGame() {
  if (roomState !== ROOM_STATE.PLAYING && roomState !== ROOM_STATE.COUNTDOWN) return;
  if (isPaused()) return;
  pauseEngine();
  broadcast({ type: MSG.GAME_PAUSED });
  document.getElementById('pause-overlay').classList.remove('hidden');
}

function resumeGame() {
  if (!isPaused()) return;
  resumeEngine();
  broadcast({ type: MSG.GAME_RESUMED });
  document.getElementById('pause-overlay').classList.add('hidden');
}

// --- Return to Lobby ---

function returnToLobby() {
  stopEngine();
  hideDevSlider();
  roomState = ROOM_STATE.LOBBY;
  broadcast({ type: MSG.RETURN_TO_LOBBY, playerCount: getPlayers().size });
  resetForNewGame();
  showScreen(SCREEN.LOBBY);
}

// --- Shared Race Flow ---

async function startRaceWithPlayers(players, skipCountdown = false) {
  const canvas = document.getElementById('race-canvas');
  await initRenderer(canvas);

  initEngine(players, 'starter', {
    onUpdate: (states, geo) => {
      if (localPlayerId) {
        handleInput(localPlayerId, currentLocalThrottle);
        updateSliderLimit(states, geo);
      }
      updateCars(states, geo);
      updateHUD(states, getTotalLaps());
    },
    onRaceFinish: () => {
      stopEngine();
      roomState = ROOM_STATE.RESULTS;
      showResults(getPlayerStates(), document.getElementById('results-list'));
      document.getElementById('results-overlay').classList.remove('hidden');
      hideDevSlider();
    },
  });

  drawTrack(getGeometry());

  if (skipCountdown) {
    roomState = ROOM_STATE.PLAYING;
    history.pushState({ screen: SCREEN.GAME }, '');
    showScreen(SCREEN.GAME);
    startEngine();
  } else {
    roomState = ROOM_STATE.COUNTDOWN;
    history.pushState({ screen: SCREEN.GAME }, '');
    showScreen(SCREEN.GAME);

    const countdownOverlay = document.getElementById('countdown-overlay');
    const countdownText = document.getElementById('countdown-text');
    countdownOverlay.classList.remove('hidden');

    for (let i = 3; i >= 1; i--) {
      countdownText.textContent = i;
      broadcast({ type: MSG.COUNTDOWN, value: i });
      await sleep(1000);
    }
    countdownText.textContent = 'GO!';
    broadcast({ type: MSG.GAME_START });
    await sleep(500);

    countdownOverlay.classList.add('hidden');
    roomState = ROOM_STATE.PLAYING;
    startEngine();
  }
}

// --- Dev Slider ---

function initDevSlider() {
  const slider = document.getElementById('dev-slider');
  slider.classList.remove('hidden');

  const track = document.getElementById('slider-track');

  track.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sliderActive = true;
    updateSliderFromY(e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!sliderActive) return;
    e.preventDefault();
    updateSliderFromY(e.clientY);
  });
  window.addEventListener('mouseup', () => {
    sliderActive = false;
  });

  track.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sliderActive = true;
    updateSliderFromY(e.touches[0].clientY);
  }, { passive: false });
  track.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (sliderActive) updateSliderFromY(e.touches[0].clientY);
  }, { passive: false });
  track.addEventListener('touchend', () => {
    sliderActive = false;
  });
}

function updateSliderFromY(clientY) {
  const track = document.getElementById('slider-track');
  const rect = track.getBoundingClientRect();
  const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

  currentLocalThrottle = pct;
  handleInput(localPlayerId, currentLocalThrottle);

  const thumb = document.getElementById('slider-thumb');
  thumb.style.bottom = `${pct * 100}%`;

  const valueEl = document.getElementById('slider-value');
  valueEl.textContent = Math.round(pct * MAX_SPEED);
}

function updateSliderLimit(states, geo) {
  const ps = states.get(localPlayerId);
  if (!ps) return;

  const currentSeg = geo[ps.segIndex];
  const nextSeg = geo[(ps.segIndex + 1) % geo.length];

  let maxSpeed = getEffectiveMaxSpeed(currentSeg, ps.progress, MAX_SPEED);
  if (nextSeg?.maxSpeed && ps.progress > 0.7) {
    const nextEffective = getEffectiveMaxSpeed(nextSeg, 0, MAX_SPEED);
    maxSpeed = Math.min(maxSpeed, nextEffective);
  }

  const limitEl = document.getElementById('slider-limit');
  if (maxSpeed < MAX_SPEED) {
    limitEl.classList.remove('hidden');
    limitEl.style.bottom = `${(maxSpeed / MAX_SPEED) * 100}%`;
    const hue = 120 * (maxSpeed / MAX_SPEED);
    limitEl.style.borderColor = `hsl(${hue}, 80%, 55%)`;
  } else {
    limitEl.classList.add('hidden');
  }
}

function hideDevSlider() {
  document.getElementById('dev-slider').classList.add('hidden');
  localPlayerId = null;
  currentLocalThrottle = 0;
}

// --- Fullscreen ---

function enterFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

init();

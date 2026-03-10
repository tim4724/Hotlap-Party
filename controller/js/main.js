import { MSG } from '../../shared/protocol.js';
import { connect, send, disconnect } from './connection.js';
import { initSpeedometer, updateState } from './speedometer.js';

const screens = {
  join: document.getElementById('join-screen'),
  lobby: document.getElementById('lobby-screen'),
  racing: document.getElementById('racing-screen'),
  finish: document.getElementById('finish-screen'),
};

let playerColor = '#fff';
let playerName = '';
let isHost = false;
let playerCount = 0;
let currentScreen = 'join';

function showScreen(name) {
  currentScreen = name;
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('hidden', k !== name);
  }
}

// --- Browser History ---

window.addEventListener('popstate', () => {
  if (currentScreen === 'lobby') {
    // Back from lobby → join screen, disconnect
    disconnect();
    joinBtn.disabled = false;
    joinBtn.textContent = 'JOIN';
    nameInput.disabled = false;
    connectingMsg.classList.add('hidden');
    showScreen('join');
  } else if (currentScreen === 'racing') {
    // Block back during racing
    history.pushState({ screen: 'racing' }, '');
  } else if (currentScreen === 'finish') {
    // Block back from finish
    history.pushState({ screen: 'finish' }, '');
  }
});

// --- Name Input & Join ---

const STORAGE_KEY = 'hotlap_player_name';
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const connectingMsg = document.getElementById('connecting-msg');

// Load saved name
const savedName = localStorage.getItem(STORAGE_KEY) || '';
nameInput.value = savedName;

function submitName() {
  const name = nameInput.value.trim();
  playerName = name; // may be empty — display will assign default
  if (name) localStorage.setItem(STORAGE_KEY, name);

  joinBtn.disabled = true;
  joinBtn.textContent = 'CONNECTING...';
  nameInput.disabled = true;
  connectingMsg.classList.remove('hidden');

  initConnection();
}

joinBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitName();
});

// --- Connection ---

async function initConnection() {
  const roomCode = location.pathname.slice(1);
  if (!roomCode) {
    connectingMsg.textContent = 'No room code in URL.';
    return;
  }

  try {
    await connect(roomCode, {
      onMsg: handleMessage,
      onOpen: () => {
        // Send HELLO with name (like Tetris pattern)
        send({ type: MSG.HELLO, name: playerName || null });
      },
    });
  } catch (err) {
    console.error('Connection failed:', err);
    connectingMsg.textContent = 'Connection failed. Reload to retry.';
    joinBtn.disabled = false;
    joinBtn.textContent = 'JOIN';
    nameInput.disabled = false;
  }
}

// --- Message Handling ---

function handleMessage(data) {
  switch (data.type) {
    case MSG.WELCOME:
      onWelcome(data);
      break;

    case MSG.LOBBY_UPDATE:
      playerCount = data.playerCount || playerCount;
      if (typeof data.isHost === 'boolean') isHost = data.isHost;
      updateLobbyUI();
      break;

    case MSG.COUNTDOWN:
    case MSG.GAME_START:
      showScreen('racing');
      initSpeedometer();
      document.getElementById('pause-btn').classList.toggle('hidden', !isHost);
      break;

    case MSG.PLAYER_STATE:
      updateState(data);
      break;

    case MSG.GAME_OVER:
      showFinishScreen(data.place, data.time);
      break;

    case MSG.GAME_PAUSED:
      onGamePaused();
      break;

    case MSG.GAME_RESUMED:
      onGameResumed();
      break;

    case MSG.GAME_END:
      // Could show detailed results — for now stay on finish screen
      break;

    case MSG.RETURN_TO_LOBBY:
      playerCount = data.playerCount || playerCount;
      showLobbyUI();
      break;

    case MSG.ERROR:
      onError(data);
      break;
  }
}

function onWelcome(data) {
  playerColor = data.color;
  playerName = data.playerName || playerName || 'Player';
  isHost = !!data.isHost;
  playerCount = data.playerCount || 1;

  // Set up color elements
  document.getElementById('player-color-dot').style.background = data.color;
  document.getElementById('gas-button').style.setProperty('--player-color', data.color);

  if (data.roomState === 'playing' || data.roomState === 'countdown') {
    showScreen('racing');
    initSpeedometer();
    document.getElementById('pause-btn').classList.toggle('hidden', !isHost);
    if (data.paused) {
      onGamePaused();
    }
    return;
  }

  if (data.roomState === 'results') {
    showFinishScreen(null, null);
    return;
  }

  showLobbyUI();
}

function onError(data) {
  if (data.code === 'HOST_DISCONNECTED') {
    // Return to join screen
    joinBtn.disabled = false;
    joinBtn.textContent = 'JOIN';
    nameInput.disabled = false;
    connectingMsg.textContent = 'Host disconnected';
    connectingMsg.classList.remove('hidden');
    showScreen('join');
    return;
  }
  connectingMsg.textContent = data.message || 'Error occurred';
  connectingMsg.classList.remove('hidden');
  showScreen('join');
}

// --- Lobby UI ---

function showLobbyUI() {
  document.getElementById('player-name-display').textContent = playerName;
  document.getElementById('player-color-dot').style.background = playerColor;
  updateLobbyUI();
  showScreen('lobby');
  history.pushState({ screen: 'lobby' }, '');
}

function updateLobbyUI() {
  const startBtn = document.getElementById('start-btn');
  const lobbyStatus = document.getElementById('lobby-status');

  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.textContent = `START RACE (${playerCount})`;
    lobbyStatus.classList.add('hidden');
  } else {
    startBtn.classList.add('hidden');
    lobbyStatus.classList.remove('hidden');
    lobbyStatus.textContent = 'Waiting for host to start...';
  }
}

// --- Start button (host only) ---

document.getElementById('start-btn').addEventListener('click', () => {
  if (!isHost) return;
  send({ type: MSG.START_GAME });
});

// --- Finish Screen ---

function showFinishScreen(place, time) {
  const placeEl = document.getElementById('finish-place');
  const timeEl = document.getElementById('finish-time');
  const buttonsEl = document.getElementById('finish-buttons');
  const statusEl = document.getElementById('finish-status');

  if (place != null) {
    placeEl.textContent = getPlaceText(place);
    timeEl.textContent = time ? formatTime(time) : '';
  } else {
    placeEl.textContent = '';
    timeEl.textContent = '';
  }

  if (isHost) {
    buttonsEl.classList.remove('hidden');
    statusEl.classList.add('hidden');
  } else {
    buttonsEl.classList.add('hidden');
    statusEl.classList.remove('hidden');
  }

  showScreen('finish');
}

// --- Finish screen buttons (host only) ---

document.getElementById('play-again-btn').addEventListener('click', () => {
  if (!isHost) return;
  send({ type: MSG.PLAY_AGAIN });
});

document.getElementById('finish-new-game-btn').addEventListener('click', () => {
  if (!isHost) return;
  send({ type: MSG.RETURN_TO_LOBBY });
});

// --- Pause ---

function onGamePaused() {
  document.getElementById('racing-screen').classList.add('paused');
  document.getElementById('pause-overlay').classList.remove('hidden');
  document.getElementById('pause-btn').classList.add('hidden');
  if (isHost) {
    document.getElementById('pause-buttons').classList.remove('hidden');
    document.getElementById('pause-status').classList.add('hidden');
  } else {
    document.getElementById('pause-buttons').classList.add('hidden');
    document.getElementById('pause-status').classList.remove('hidden');
  }
}

function onGameResumed() {
  document.getElementById('racing-screen').classList.remove('paused');
  document.getElementById('pause-overlay').classList.add('hidden');
  if (isHost) {
    document.getElementById('pause-btn').classList.remove('hidden');
  }
}

document.getElementById('pause-btn').addEventListener('click', () => {
  if (!isHost) return;
  send({ type: MSG.PAUSE_GAME });
});

document.getElementById('pause-continue-btn').addEventListener('click', () => {
  if (!isHost) return;
  send({ type: MSG.RESUME_GAME });
});

document.getElementById('pause-newgame-btn').addEventListener('click', () => {
  if (!isHost) return;
  send({ type: MSG.RETURN_TO_LOBBY });
});

// --- Helpers ---

function getPlaceText(place) {
  const suffix = ['st', 'nd', 'rd'][place - 1] || 'th';
  return `${place}${suffix}`;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const frac = Math.floor((ms % 1000) / 10);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}

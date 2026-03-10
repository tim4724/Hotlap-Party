import { PLAYER_COLORS } from '../shared/constants.js';
import { ROOM_STATE, welcome, lobbyUpdate } from '../shared/protocol.js';
import { sendTo, broadcast, getRoomCode } from './connection.js';

const players = new Map(); // peerId → { name, color, index }
let hostId = null;
let onStartRace = null;
let onSoloRace = null;
let getGameState = null;

export function initLobby(callbacks) {
  onStartRace = callbacks.onStartRace;
  onSoloRace = callbacks.onSoloRace;
  getGameState = callbacks.getGameState;

  document.getElementById('start-btn').addEventListener('click', () => {
    if (players.size > 0) onStartRace?.();
  });

  document.getElementById('solo-btn').addEventListener('click', () => {
    onSoloRace?.();
  });
}

export function preloadQR() {
  generateQR();
}

export function showConnectionInfo() {
  const container = document.getElementById('qr-container');
  container.classList.remove('hidden');
}

// Find the smallest available player slot (0–3)
function nextAvailableSlot() {
  const used = [...players.values()].map(p => p.index);
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    if (!used.includes(i)) return i;
  }
  return -1;
}

// Sanitize player name: default to "P1"–"P4" if empty
function sanitizePlayerName(name, slotIndex) {
  if (!name || /^P[1-4]$/i.test(name)) return 'P' + (slotIndex + 1);
  return name.trim().slice(0, 12);
}

// Called when relay reports a new peer connection
export function addPeer(peerId) {
  if (players.has(peerId)) return;
  const index = nextAvailableSlot();
  if (index < 0) return;
  const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
  const isHost = hostId === null;
  if (isHost) hostId = peerId;

  players.set(peerId, {
    name: 'P' + (index + 1),
    color,
    index,
  });
  renderPlayerList();
  updateStartButton();
}

// Called when controller sends HELLO with its name
export function handleHello(peerId, name) {
  const p = players.get(peerId);
  if (!p) {
    // peer_joined didn't fire yet — create player now
    addPeer(peerId);
    return handleHello(peerId, name);
  }

  const sanitized = sanitizePlayerName(name, p.index);
  p.name = sanitized;
  renderPlayerList();

  // Send WELCOME with full state
  const state = getGameState?.() || {};
  sendTo(peerId, welcome({
    playerName: sanitized,
    color: p.color,
    playerIndex: p.index,
    isHost: peerId === hostId,
    playerCount: players.size,
    roomState: state.roomState || ROOM_STATE.LOBBY,
    paused: state.paused || false,
  }));

  broadcastLobbyUpdate();
  updateStartButton();
}

export function removePeer(peerId) {
  if (!players.has(peerId)) return;

  if (peerId === hostId) {
    // Host disconnected — kick everyone back to lobby
    hostId = null;
    broadcast({ type: 'error', code: 'HOST_DISCONNECTED', message: 'Host disconnected' });
    players.clear();
    renderPlayerList();
    updateStartButton();
  } else {
    players.delete(peerId);
    renderPlayerList();
    updateStartButton();
    broadcastLobbyUpdate();
  }
}

export function getPlayers() {
  return players;
}

export function getHostId() {
  return hostId;
}

export function isHost(peerId) {
  return peerId === hostId;
}

// Reset lobby for a new game (keep players, re-enable start)
export function resetForNewGame() {
  updateStartButton();
  renderPlayerList();
}

function broadcastLobbyUpdate() {
  for (const [peerId] of players) {
    sendTo(peerId, lobbyUpdate({
      playerCount: players.size,
      isHost: peerId === hostId,
    }));
  }
}

function renderPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  for (const [, p] of players) {
    const tag = document.createElement('div');
    tag.className = 'player-tag';
    tag.style.background = p.color;
    tag.textContent = p.name;
    list.appendChild(tag);
  }
}

function updateStartButton() {
  document.getElementById('start-btn').disabled = players.size === 0;
}

function generateQR() {
  const code = getRoomCode();
  if (!code) return;

  const ip = window.__LAN_IP__ || location.hostname;
  const port = window.__PORT__ || location.port;
  const url = `http://${ip}:${port}/${code}`;

  document.getElementById('room-code').textContent = url;

  const container = document.getElementById('qr-container');

  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();

  const size = 200;
  const cellSize = size / qr.getModuleCount();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  const count = qr.getModuleCount();
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillStyle = '#000';
        ctx.fillRect(col * cellSize, row * cellSize, cellSize + 0.5, cellSize + 0.5);
      }
    }
  }
  container.innerHTML = '';
  container.appendChild(canvas);
  // Keep hidden until lobby is shown
  container.classList.add('hidden');
}

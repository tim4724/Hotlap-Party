const WS_URL = 'wss://party-sockets.duckdns.org';
const CLIENT_ID = 'display';

let ws = null;
let roomCode = null;
let onMessage = null;
let onPlayerJoin = null;
let onPlayerLeave = null;

export function connect({ onMsg, onJoin, onLeave }) {
  onMessage = onMsg;
  onPlayerJoin = onJoin;
  onPlayerLeave = onLeave;

  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'create', clientId: CLIENT_ID, maxClients: 5 }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'created') {
        roomCode = data.room;
        resolve(roomCode);
        return;
      }

      if (data.type === 'peer_joined') {
        onPlayerJoin?.(data.clientId);
        return;
      }

      if (data.type === 'peer_left') {
        onPlayerLeave?.(data.clientId);
        return;
      }

      if (data.type === 'message') {
        onMessage?.(data.from, data.data);
        return;
      }

      if (data.type === 'error') {
        console.error('WS error:', data.message);
      }
    };

    ws.onerror = () => reject(new Error('WebSocket connection failed'));
    ws.onclose = () => console.log('Display: WebSocket closed');
  });
}

export function sendTo(peerId, msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'send', to: peerId, data: msg }));
  }
}

export function broadcast(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'send', data: msg }));
  }
}

export function getRoomCode() {
  return roomCode;
}

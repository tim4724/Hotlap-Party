const WS_URL = 'wss://party-sockets.duckdns.org';

let ws = null;
let clientId = null;
let onMessage = null;

export function connect(roomCode, { onMsg, onOpen }) {
  onMessage = onMsg;
  // Generate a unique client ID for this controller
  clientId = 'player_' + Math.random().toString(36).slice(2, 8);

  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', clientId, room: roomCode }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'joined') {
        onOpen?.();
        resolve();
        return;
      }

      if (data.type === 'message') {
        onMessage?.(data.data);
        return;
      }

      if (data.type === 'error') {
        console.error('WS error:', data.message);
        reject(new Error(data.message));
      }
    };

    ws.onerror = () => reject(new Error('WebSocket connection failed'));
    ws.onclose = () => console.log('Controller: WebSocket closed');
  });
}

export function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'send', data: msg }));
  }
}

export function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function getClientId() {
  return clientId;
}

# Hotlap Party

A multiplayer racing party game. One screen (TV/PC) displays the track, phones connect as controllers.

## How It Works

- Display shows a QR code — players scan to join on their phones
- Host (first player) starts the race
- Cars drift off track if you go too fast through curves
- First to finish all laps wins

## Setup

```bash
npm install
node server.js
```

Open `http://localhost:3000` on the display. Players join by scanning the QR code.

## Tech

- Vanilla JS with ES6 modules
- [Pixi.js](https://pixijs.com/) for rendering
- [Party Sockets](https://github.com/nicholaschuayunzhi/party-sockets) WebSocket relay for multiplayer

# Party Game Lobby System

A reusable screen flow and lobby management pattern for phone-controlled party games using a WebSocket relay.

## Architecture

```
┌─────────────┐     WebSocket Relay     ┌──────────────┐
│   Display    │◄──────────────────────►│  Controller   │
│  (TV/PC)     │   wss://relay-server   │  (Phone)      │
└─────────────┘                         └──────────────┘
```

- **Display**: runs on a TV or computer, renders the game, owns all game state
- **Controller**: runs on a phone, sends player input, receives state updates
- **Relay**: [Party Sockets](https://github.com/nicholaschuayunzhi/party-sockets) — a stateless WebSocket server that routes messages between display and controllers in a room

## Screen Flow

### Display Screens

```
WELCOME ──► LOBBY ──► GAME (Countdown → Playing → Results)
   ▲          ▲                          │
   │          └──── NEW GAME / back ─────┘
   └──────── back ───┘
```

| Screen | Purpose | Transitions |
|--------|---------|-------------|
| **Welcome** | Title + "NEW GAME" button. Room pre-created, QR pre-loaded. | → Lobby |
| **Lobby** | QR code, player list, START button | → Game, ← Welcome (back) |
| **Game** | Countdown overlay → active gameplay → results overlay. Pause overlay available during countdown/playing. | → Lobby (back / NEW GAME) |

The Game screen uses sub-states managed by `ROOM_STATE`: `countdown`, `playing`, `results`. Overlays show/hide within the same screen.

### Controller Screens

```
JOIN ──► LOBBY ──► PLAYING ──► FINISH
  ▲        │                     │
  └─ back ─┘     └─── RETURN ───┘
```

| Screen | Purpose | Transitions |
|--------|---------|-------------|
| **Join** | Name input + JOIN button | → Lobby (on WELCOME message) |
| **Lobby** | Player color/name, START (host) or "Waiting..." | → Playing (on COUNTDOWN/GAME_START), ← Join (back, disconnects) |
| **Playing** | Game-specific input. Pause button (host only). | → Finish (on GAME_OVER) |
| **Finish** | Results + PLAY AGAIN / NEW GAME (host only) | → Lobby (on RETURN_TO_LOBBY) |

## Player Management

### Host System

The **first controller to join** a room becomes the **host**. The host is the only controller that can:
- Start a game (START button)
- Pause / resume the game (pause button)
- Trigger play again (PLAY AGAIN button)
- Return to lobby (NEW GAME button)

The display can also trigger these actions directly via its own buttons.

### Player Indices

Player indices are **stable** — they don't shift when someone leaves.

```js
// Find smallest available slot, not just increment a counter
function nextAvailableSlot() {
  const used = [...players.values()].map(p => p.index);
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!used.includes(i)) return i;
  }
  return -1;
}
```

Example: P1 joins (slot 0), P2 joins (slot 1), P1 leaves, P3 joins → P3 gets slot 0 (not slot 2).

### Default Names

If a player joins without entering a name, they get a default based on their slot: `P1`, `P2`, `P3`, `P4`.

```js
function sanitizePlayerName(name, slotIndex) {
  if (!name || /^P[1-4]$/i.test(name)) return 'P' + (slotIndex + 1);
  return name.trim().slice(0, 12);
}
```

### Host Disconnect

When the host disconnects:
1. Display broadcasts `ERROR` with code `HOST_DISCONNECTED`
2. All players are cleared from the lobby
3. Controllers return to their join screen
4. New players joining become the new host

### Name Persistence

Controller stores the player name in `localStorage` so it persists across sessions:

```js
const STORAGE_KEY = 'mygame_player_name';
const savedName = localStorage.getItem(STORAGE_KEY) || '';
nameInput.value = savedName;
// On join:
if (name) localStorage.setItem(STORAGE_KEY, name);
```

## Protocol Messages

### Controller → Display

| Message | When | Payload |
|---------|------|---------|
| `hello` | After joining room | `{ name: string \| null }` |
| `input` | During gameplay | Game-specific input data |
| `start_game` | Host clicks START | `{}` |
| `pause_game` | Host clicks pause | `{}` |
| `resume_game` | Host clicks continue | `{}` |
| `play_again` | Host clicks PLAY AGAIN | `{}` |
| `return_to_lobby` | Host clicks NEW GAME | `{}` |

### Display → Specific Controller

| Message | When | Payload |
|---------|------|---------|
| `welcome` | After HELLO received | `{ playerName, color, playerIndex, isHost, playerCount, roomState, paused }` |
| `lobby_update` | Player joins/leaves | `{ playerCount, isHost }` |
| `player_state` | During gameplay (throttled) | Game-specific state |
| `game_over` | Individual player finishes | Game-specific result (e.g. `{ place, time }`) |

### Display → All Controllers (broadcast)

| Message | When | Payload |
|---------|------|---------|
| `countdown` | During countdown | `{ value: 3\|2\|1 }` |
| `game_start` | Game begins | `{}` |
| `game_paused` | Game paused | `{}` |
| `game_resumed` | Game resumed | `{}` |
| `game_end` | All players finished | Game-specific results (e.g. `{ rankings }`) |
| `return_to_lobby` | Returning to lobby | `{ playerCount }` |
| `error` | Error occurred | `{ code, message }` |

Note: `return_to_lobby` flows in both directions — controller sends it to request returning, display broadcasts it to notify all controllers.

## Pause System

### Who can pause?
Only the **host** (first controller to join). The display also has a pause button.

### When can pause?
During `countdown` or `playing` room states. Not available in lobby or results.

### What happens on pause?
1. Host sends `pause_game` → Display receives → validates host
2. Display pauses game engine, broadcasts `game_paused` to all controllers
3. Display shows pause overlay with CONTINUE / NEW GAME buttons
4. All controllers show pause overlay; host sees buttons, others see "Waiting for host..."
5. Controller game input is disabled (CSS `pointer-events: none`)
6. Paused time is excluded from finish times

### What happens on resume?
1. Host sends `resume_game` (or clicks CONTINUE on display)
2. Display resumes engine, broadcasts `game_resumed`
3. Overlays hidden, input re-enabled

### Late joiner during pause
The `welcome` message includes `paused: true`, so the controller immediately shows the pause overlay.

## Browser History

Display manages `history.pushState` for back/forward navigation:

```
Welcome → [pushState] → Lobby → [pushState] → Game
```

| Current Screen | Back Button |
|---------------|-------------|
| Lobby | → Welcome |
| Game (any sub-state) | → Lobby (stops engine) |
| Welcome | default browser behavior |

Controller also manages history:

| Current Screen | Back Button |
|---------------|-------------|
| Lobby | → Join (disconnects from room) |
| Playing | blocked |
| Finish | blocked |

## Fullscreen

Clicking "NEW GAME" on the Welcome screen enters fullscreen mode via the Fullscreen API. A toggle button (bottom-right corner) is visible on all screens except Welcome, allowing the user to enter/exit fullscreen at any time.

## Connection Flow

### Display Startup

1. Show Welcome screen
2. Connect to relay, create room → get room code (background)
3. Pre-generate QR code (hidden)
4. User clicks NEW GAME → enter fullscreen, show Lobby with QR code instantly
5. Wait for controllers to join

### Controller Startup

1. Extract room code from URL path (`/<ROOM_CODE>`)
2. Show Join screen with saved name pre-filled
3. User clicks JOIN → connect to relay, join room
4. On joined: send `hello` with name
5. Receive `welcome` → show Lobby screen (or Playing if game in progress)

### Reconnection

Controllers can reconnect by reloading the page. The relay treats them as a new peer, but the display's `hello` handler updates existing player data if the peer was already registered.

## Optional Features

### Mute (not yet implemented)

Audio mute toggle on both display and controller. The display mute button controls background music and sound effects. The controller mute button controls vibration feedback. Mute state can be persisted in `localStorage`.

## Adapting to a New Game

To reuse this system for a different party game:

1. **Keep unchanged**: protocol message types, lobby management, screen flow, host system, browser history, pause system, fullscreen
2. **Replace**: game-specific `input` message payload, `player_state` broadcast content, `game_over`/`game_end` results format
3. **Replace**: display Game screen rendering, controller Playing screen input UI
4. **Customize**: player colors, max players, countdown duration, localStorage key, game-specific overlays

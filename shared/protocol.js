// Message types — aligned with Tetris Party conventions
export const MSG = {
  // Controller → Display
  HELLO: 'hello',
  INPUT: 'input',
  START_GAME: 'start_game',
  PAUSE_GAME: 'pause_game',
  RESUME_GAME: 'resume_game',
  PLAY_AGAIN: 'play_again',
  RETURN_TO_LOBBY: 'return_to_lobby',

  // Display → Specific Controller
  WELCOME: 'welcome',
  LOBBY_UPDATE: 'lobby_update',
  GAME_OVER: 'game_over',       // individual player finished
  PLAYER_STATE: 'player_state', // per-player state during game

  // Display → All Controllers (broadcast)
  COUNTDOWN: 'countdown',
  GAME_START: 'game_start',
  GAME_PAUSED: 'game_paused',
  GAME_RESUMED: 'game_resumed',
  GAME_END: 'game_end',         // all finished, full results
  ERROR: 'error',
};

// Room states
export const ROOM_STATE = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESULTS: 'results',
};

// Message factories
export function hello(name) {
  return { type: MSG.HELLO, name };
}

export function input(throttle) {
  return { type: MSG.INPUT, throttle };
}

export function welcome({ playerName, color, playerIndex, isHost, playerCount, roomState, paused }) {
  return { type: MSG.WELCOME, playerName, color, playerIndex, isHost, playerCount, roomState, paused };
}

export function lobbyUpdate({ playerCount, isHost }) {
  return { type: MSG.LOBBY_UPDATE, playerCount, isHost };
}

export function countdown(value) {
  return { type: MSG.COUNTDOWN, value };
}

export function playerState(data) {
  return { type: MSG.PLAYER_STATE, ...data };
}

export function gameStart() {
  return { type: MSG.GAME_START };
}

export function gameOver(place, time) {
  return { type: MSG.GAME_OVER, place, time };
}

export function gameEnd(rankings) {
  return { type: MSG.GAME_END, rankings };
}

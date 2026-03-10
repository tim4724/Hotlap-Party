import { input as inputMsg } from '../../shared/protocol.js';
import { CONTROLLER_SEND_INTERVAL } from '../../shared/constants.js';
import { send } from './connection.js';

let pressing = false;
let sendInterval = null;

export function initSpeedometer() {
  const btn = document.getElementById('gas-button');

  // Touch handlers (primary for phones)
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    pressing = true;
    btn.classList.add('active');
    startSending();
  }, { passive: false });
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    pressing = false;
    btn.classList.remove('active');
  }, { passive: false });
  btn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    pressing = false;
    btn.classList.remove('active');
  }, { passive: false });

  // Mouse fallback for desktop testing
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    pressing = true;
    btn.classList.add('active');
    startSending();
  });
  window.addEventListener('mouseup', () => {
    pressing = false;
    btn.classList.remove('active');
  });
}

function startSending() {
  if (sendInterval) return;
  send(inputMsg(1));
  sendInterval = setInterval(() => {
    send(inputMsg(pressing ? 1 : 0));
  }, CONTROLLER_SEND_INTERVAL);
}

export function updateState(state) {
  const lapEl = document.getElementById('lap-display');
  lapEl.textContent = `Lap ${state.lap}/${state.totalLaps}`;

  const crash = document.getElementById('crash-overlay');
  crash.classList.toggle('hidden', !state.crashed);
}

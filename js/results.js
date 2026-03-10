import { gameEnd as gameEndMsg } from '../shared/protocol.js';
import { broadcast } from './connection.js';

export function showResults(playerStates, container) {
  const rankings = [...playerStates.values()]
    .sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) return a.place - b.place;
      return b.distance - a.distance;
    })
    .map((ps, i) => ({
      name: ps.name,
      color: ps.color,
      place: ps.place || i + 1,
      time: ps.finishTime,
    }));

  // Broadcast to controllers
  broadcast(gameEndMsg(rankings));

  // Render on display
  const list = container || document.getElementById('results-list');
  list.innerHTML = rankings.map(r => `
    <div class="result-row">
      <span class="result-place">${r.place}.</span>
      <span class="hud-dot" style="background:${r.color}"></span>
      <span class="result-name">${r.name}</span>
      <span class="result-time">${r.time ? formatTime(r.time) : 'DNF'}</span>
    </div>
  `).join('');
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const frac = Math.floor((ms % 1000) / 10);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}

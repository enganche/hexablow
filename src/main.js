import './style.css';
import levels from './levels.json';
import { Game } from './game.js';
import { AudioManager, vibrate } from './audio.js';
import { loadSettings, saveSettings, loadLevelIndex, saveLevelIndex } from './settings.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const audio = new AudioManager(() => settings);
let levelIndex = loadLevelIndex(levels.length);

// ---- HUD ----
const heartsEl = $('hearts');
const HEART_SVG =
  '<svg class="heart" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2.1 0 3.6 1.1 4.5 2.6h3C14.4 6.1 15.9 5 18 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"/></svg>';

function renderHearts(left, animate) {
  heartsEl.innerHTML = HEART_SVG.repeat(3);
  [...heartsEl.children].forEach((h, i) => {
    const lost = i >= left;
    h.classList.toggle('lost', lost);
    if (animate && i === left) {
      h.classList.add('pop');
      setTimeout(() => h.classList.remove('pop'), 220);
    }
  });
}

// ---- Result card ----
const result = $('result');
function showResult({ title, text, button, onClick }) {
  $('result-title').textContent = title;
  $('result-text').textContent = text;
  const btn = $('result-btn');
  btn.textContent = button;
  btn.onclick = () => {
    result.classList.add('hidden');
    audio.tap();
    onClick();
  };
  result.classList.remove('hidden');
}

// ---- Game ----
const game = new Game($('game'), {
  getSettings: () => settings,
  onHearts: (left, lostOne) => renderHearts(left, lostOne),
  onPlace: (count) => {
    audio.place(count);
    vibrate(settings, 12);
  },
  onMistake: () => {
    audio.wrong();
    vibrate(settings, 60);
  },
  onWin: () => {
    audio.win();
    vibrate(settings, [20, 40, 20]);
    const last = levelIndex === levels.length - 1;
    showResult({
      title: last ? 'All levels complete!' : 'Level complete!',
      text: last ? `You finished all ${levels.length} levels.` : `Nice work on ${levels[levelIndex].name}.`,
      button: last ? 'Play again' : 'Next level',
      onClick: () => startLevel(last ? 0 : levelIndex + 1),
    });
  },
  onFail: () => {
    showResult({
      title: 'Out of hearts',
      text: 'Give it another try.',
      button: 'Retry',
      onClick: () => startLevel(levelIndex),
    });
  },
});

function startLevel(i) {
  levelIndex = i;
  saveLevelIndex(i);
  $('level-name').textContent = levels[i].name;
  game.loadLevel(levels[i]);
}

// ---- Settings ----
const panel = $('settings');
const note = $('settings-note');
const inputs = [...document.querySelectorAll('input[data-setting]')];
inputs.forEach((inp) => (inp.checked = !!settings[inp.dataset.setting]));

$('settings-btn').addEventListener('click', () => {
  audio.unlock();
  audio.tap();
  note.textContent = '';
  panel.classList.remove('hidden');
});
$('settings-close').addEventListener('click', () => {
  audio.tap();
  panel.classList.add('hidden');
});
panel.addEventListener('click', (e) => {
  if (e.target === panel) panel.classList.add('hidden');
});

inputs.forEach((inp) =>
  inp.addEventListener('change', async () => {
    const name = inp.dataset.setting;
    settings[name] = inp.checked;
    note.textContent = '';

    if (name === 'notifications' && inp.checked) {
      if (!('Notification' in window)) {
        note.textContent = 'Notifications are not supported on this device.';
        settings.notifications = inp.checked = false;
      } else if (Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          note.textContent = 'Notifications are blocked in your browser settings.';
          settings.notifications = inp.checked = false;
        }
      } else if (Notification.permission === 'denied') {
        note.textContent = 'Notifications are blocked in your browser settings.';
        settings.notifications = inp.checked = false;
      }
    }

    saveSettings(settings);
    if (name === 'music') audio.syncMusic();
    if (name === 'hints') game.refreshHints();
    audio.tap();
    if (name === 'vibration') vibrate(settings, 20);
  })
);

// Browsers only allow audio after a gesture.
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

// debug handle (handy for testing)
window.__hexablow = { game, levels, startLevel };

startLevel(levelIndex);

// Local player identity, independent of gameplay saves.
const KEY = 'gardendoku.profile.v1';
import { coinsOf, spend } from './progress.js';
const prices = [0, 0, 0, 50, 50, 50, 100, 100, 100];
const avatars = [ ['🐱', 'Cat'], ['🐮', 'Cow'], ['🦊', 'Fox'], ['🐥', 'Chick'], ['🐷', 'Pig'], ['🐑', 'Sheep'], ['🐰', 'Rabbit'], ['🐝', 'Bee'], ['🦆', 'Duck'] ];

// Small garden scenes stay crisp at both thumbnail and portrait sizes.
const avatarPalettes = [
  ['#7edbed', '#def8fa', '#8cc66b'], ['#a6dcee', '#f1fcff', '#91c96b'],
  ['#f3bd88', '#fff0cb', '#b3c96c'], ['#f4d77f', '#fff8d5', '#b0d777'],
  ['#eebbd6', '#fff0f5', '#a8cd8c'], ['#c9c1ed', '#f5f1ff', '#9dc8a3'],
  ['#bcb8ed', '#eeecff', '#a9cda0'], ['#a6dce0', '#effcdd', '#a3cd64'],
  ['#86cde9', '#e1f7ff', '#73bbba'],
];
function avatarArt(i) {
  const [sky, light, hill] = avatarPalettes[i];
  return `<span class="avatar-scene" aria-hidden="true"><svg class="avatar-landscape" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="${sky}" d="M0 0h100v100H0z"/><circle cx="51" cy="44" r="36" fill="${light}" opacity=".48"/><circle cx="80" cy="19" r="11" fill="#fff3b4"/><path d="M-4 25h31m42 14h35" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".6"/><path d="M0 74Q25 55 53 73T100 65v35H0Z" fill="${hill}"/><path d="M0 87Q37 69 100 85v15H0Z" fill="${hill}"/><path d="M0 87Q37 69 100 85v15H0Z" fill="#386d55" opacity=".16"/><ellipse cx="51" cy="84" rx="25" ry="5" fill="#315f58" opacity=".18"/><g fill="${light}"><path d="m16 45 1.5 4.5L22 51l-4.5 1.5L16 57l-1.5-4.5L10 51l4.5-1.5Z"/><path d="m84 52 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></g><g stroke="#4f8b56" stroke-width="1.8" stroke-linecap="round"><path d="M11 91v-9m-3 4 3 3 4-5M88 89V76m-4 5 4 4 4-5"/></g><g fill="#fff8d7"><circle cx="11" cy="80" r="3.5"/><circle cx="88" cy="75" r="4"/></g><g fill="#eeb459"><circle cx="11" cy="80" r="1.5"/><circle cx="88" cy="75" r="1.7"/></g></svg><span class="avatar-character">${avatars[i][0]}</span></span>`;
}

export function initProfile(progress, audio, onCoinsChange = () => {}) {
  const home = document.getElementById('home');
  const trigger = document.createElement('button');
  trigger.className = 'h-gear profile-trigger';
  trigger.setAttribute('aria-label', 'Open profile');
  home.append(trigger);
  const nav = document.createElement('nav');
  nav.className = 'home-nav';
  nav.setAttribute('aria-label', 'Main menu');
  const shop = document.getElementById('home-shop');
  const album = document.getElementById('home-album');
  for (const [button, label] of [[shop, 'Shop'], [album, 'Album']]) {
    button.className = 'home-nav-item';
    button.insertAdjacentHTML('beforeend', `<span>${label}</span>`);
  }
  const current = document.createElement('div');
  current.className = 'home-nav-item current';
  current.setAttribute('aria-current', 'page');
  current.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 23 24 6l19 17-4 4-3-3v18H12V24l-3 3Z" fill="#a7d96e" stroke="#47783d" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 42V28h9v14" fill="#fff6cd" stroke="#47783d" stroke-width="2"/></svg><span>Home</span>';
  nav.append(shop, current, album);
  home.append(nav);
  let saved;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* unavailable storage */ }
  const uid = typeof saved?.uid === 'string' && /^[a-z0-9-]{8,50}$/i.test(saved.uid) ? saved.uid : crypto.randomUUID();
  const player = { uid, name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0,20) : `Gardener_${uid.slice(0,5)}`, avatar: Number.isInteger(saved?.avatar) && avatars[saved.avatar] ? saved.avatar : 0, owned: [...new Set((Array.isArray(saved?.owned) ? saved.owned : []).filter((i) => Number.isInteger(i) && avatars[i]))] };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(player)); return true; } catch { return false; } };
  persist();
  const modal = document.createElement('div');
  modal.className = 'modal hidden profile-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'profile-title');
  modal.innerHTML = `<div class="profile-card"><h2 id="profile-title">PROFILE</h2><button class="profile-close" aria-label="Close profile">×</button><div class="profile-info"><div class="profile-portrait" aria-hidden="true"></div><div class="profile-details"><div class="profile-name-form"><span>Nickname</span><div class="profile-name-row"><strong class="profile-name-value"></strong><button type="button" class="profile-edit" aria-label="Edit nickname"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button></div></div><div class="profile-uid"><span></span><button type="button" aria-label="Copy player ID">⧉</button></div></div></div><div class="profile-grid" aria-label="Choose avatar"></div><p class="profile-status" role="status"></p><button class="profile-use">USED</button></div>`;
  document.getElementById('stage').append(modal);
  const nameValue = modal.querySelector('.profile-name-value');
  const edit = modal.querySelector('.profile-edit');
  const rename = document.createElement('div');
  rename.className = 'modal hidden profile-modal rename-modal';
  rename.setAttribute('role', 'dialog');
  rename.setAttribute('aria-modal', 'true');
  rename.setAttribute('aria-labelledby', 'rename-title');
  rename.innerHTML = '<form class="profile-card rename-card" novalidate><h2 id="rename-title">CHANGE NAME</h2><button type="button" class="profile-close" aria-label="Cancel name change">×</button><div class="rename-body"><label for="profile-name">Enter a nickname</label><p id="rename-help">Use 1–20 characters.</p><input id="profile-name" maxlength="20" autocomplete="off" spellcheck="false" aria-describedby="rename-help rename-error"><p id="rename-error" role="alert"></p></div><button type="submit" class="profile-use rename-save">Save</button></form>';
  document.getElementById('stage').append(rename);
  const name = rename.querySelector('input');
  const error = rename.querySelector('#rename-error');
  const closeRename = () => { rename.classList.add('hidden'); modal.inert = false; edit.focus(); };
  edit.onclick = () => {
    audio.tap(); name.value = player.name; error.textContent = ''; name.removeAttribute('aria-invalid');
    modal.inert = true; rename.classList.remove('hidden'); name.focus(); name.select();
  };
  rename.querySelector('.profile-close').onclick = closeRename;
  rename.onclick = (e) => { if (e.target === rename) closeRename(); };
  rename.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRename(); }
    if (e.key === 'Tab') {
      const first = rename.querySelector('.profile-close'), last = rename.querySelector('.rename-save');
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  const status = modal.querySelector('.profile-status');
  const use = modal.querySelector('.profile-use');
  let selected = player.avatar;
  const unlocked = (i) => prices[i] === 0 || player.owned.includes(i);
  const refreshTrigger = () => { trigger.innerHTML = avatarArt(player.avatar); };
  const render = () => {
    modal.querySelector('.profile-portrait').innerHTML = avatarArt(selected);
    const grid = modal.querySelector('.profile-grid');
    grid.replaceChildren();
    avatars.forEach(([icon, label], i) => {
      const locked = !unlocked(i);
      const b = document.createElement('button');
      b.className = `profile-avatar${i === selected ? ' selected' : ''}${locked ? ' locked' : ''}`;
      b.setAttribute('aria-label', `${label}${locked ? `, ${prices[i]} gold to unlock` : ''}`);
      b.setAttribute('aria-pressed', String(i === selected));
      b.innerHTML = `${avatarArt(i)}${locked ? `<small class="price"><i class="coin"></i>${prices[i]}</small>` : i === player.avatar ? '<small class="check">✓</small>' : ''}`;
      b.onclick = () => {
        audio.tap();
        selected = i; status.textContent = ''; render(); grid.children[i].focus();
      };
      grid.append(b);
    });
    if (!unlocked(selected)) {
      use.disabled = coinsOf(progress) < prices[selected];
      use.innerHTML = `BUY <i class="coin"></i>${prices[selected]}`;
    } else {
      use.disabled = selected === player.avatar;
      use.textContent = selected === player.avatar ? 'USED' : 'USE';
    }
  };
  const close = () => { modal.classList.add('hidden'); home.inert = false; trigger.focus(); };
  trigger.onclick = () => {
    audio.unlock(); audio.tap();
    if (!unlocked(player.avatar)) { player.avatar = 0; persist(); refreshTrigger(); }
    selected = player.avatar; nameValue.textContent = player.name; status.textContent = '';
    modal.querySelector('.profile-uid span').textContent = `UID: ${uid.slice(0,13)}…`;
    render(); modal.classList.remove('hidden'); home.inert = true; modal.querySelector('.profile-close').focus();
  };
  modal.querySelector('.profile-close').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  rename.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const value = name.value.trim();
    if (!value) { error.textContent = 'Please enter a nickname.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
    player.name = value; nameValue.textContent = value;
    status.textContent = persist() ? 'Nickname saved!' : 'Changed for this session. Storage is unavailable.';
    closeRename();
  };
  modal.querySelector('.profile-uid button').onclick = async () => {
    try { await navigator.clipboard.writeText(uid); status.textContent = 'Player ID copied!'; }
    catch { status.textContent = `Player ID: ${uid}`; }
  };
  use.onclick = () => {
    if (!unlocked(selected)) {
      if (!spend(progress, prices[selected])) { status.textContent = 'Not enough gold.'; return; }
      player.owned.push(selected); onCoinsChange();
    }
    player.avatar = selected; const stored = persist(); refreshTrigger(); render();
    status.textContent = stored ? 'Avatar updated!' : 'Changed for this session. Storage is unavailable.';
  };
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button:not(:disabled), input')];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  refreshTrigger();
}

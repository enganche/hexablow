// Local player identity, independent of gameplay saves.
const KEY = 'gardendoku.profile.v1';
import { coinsOf, spend } from './progress.js';
import avatar_cat from './assets/avatars/cat.webp';
import avatar_cow from './assets/avatars/cow.webp';
import avatar_fox from './assets/avatars/fox.webp';
import avatar_chick from './assets/avatars/chick.webp';
import avatar_pig from './assets/avatars/pig.webp';
import avatar_sheep from './assets/avatars/sheep.webp';
import avatar_rabbit from './assets/avatars/rabbit.webp';
import avatar_bee from './assets/avatars/bee.webp';
import avatar_duck from './assets/avatars/duck.webp';
const avatarImages = [avatar_cat, avatar_cow, avatar_fox, avatar_chick, avatar_pig, avatar_sheep, avatar_rabbit, avatar_bee, avatar_duck];
const prices = [0, 0, 0, 50, 50, 50, 100, 100, 100];
const avatars = [ ['🐱', 'Cat'], ['🐮', 'Cow'], ['🦊', 'Fox'], ['🐥', 'Chick'], ['🐷', 'Pig'], ['🐑', 'Sheep'], ['🐰', 'Rabbit'], ['🐝', 'Bee'], ['🦆', 'Duck'] ];

// Each avatar image already contains its own garden scene.
function avatarArt(i) {
  return `<span class="avatar-scene" aria-hidden="true"><img class="avatar-character" src="${avatarImages[i]}" alt="" draggable="false"></span>`;
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
  const current = document.createElement('button');
  current.id = 'home-tab';
  current.type = 'button';
  current.className = 'home-nav-item current';
  current.setAttribute('aria-current', 'page');
  current.innerHTML = '<img src="/src/assets/nav-home.webp" alt="" aria-hidden="true"><span>Home</span>';
  nav.append(shop, current, album);
  document.getElementById('stage').append(nav);
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
  const close = () => { modal.classList.add('hidden'); home.inert = false; nav.inert = false; trigger.focus(); };
  trigger.onclick = () => {
    audio.unlock(); audio.tap();
    if (!unlocked(player.avatar)) { player.avatar = 0; persist(); refreshTrigger(); }
    selected = player.avatar; nameValue.textContent = player.name; status.textContent = '';
    modal.querySelector('.profile-uid span').textContent = `UID: ${uid.slice(0,13)}…`;
    render(); modal.classList.remove('hidden'); home.inert = true; nav.inert = true; modal.querySelector('.profile-close').focus();
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

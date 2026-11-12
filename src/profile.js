// Local player identity, independent of gameplay saves.
const KEY = 'gardendoku.profile.v1';
const milestones = [0, 1, 3, 5, 7, 9, 11, 13, 15];
const avatars = [ ['🐱', 'Cat'], ['🐮', 'Cow'], ['🦊', 'Fox'], ['🐥', 'Chick'], ['🐷', 'Pig'], ['🐑', 'Sheep'], ['🐰', 'Rabbit'], ['🐝', 'Bee'], ['🦆', 'Duck'] ];

export function initProfile(progress, audio) {
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
  const player = { uid, name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0,20) : `Gardener_${uid.slice(0,5)}`, avatar: Number.isInteger(saved?.avatar) && avatars[saved.avatar] ? saved.avatar : 0 };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(player)); return true; } catch { return false; } };
  persist();
  const modal = document.createElement('div');
  modal.className = 'modal hidden profile-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'profile-title');
  modal.innerHTML = `<div class="profile-card"><h2 id="profile-title">PROFILE</h2><button class="profile-close" aria-label="Close profile">×</button><div class="profile-info"><div class="profile-portrait" aria-hidden="true"></div><div class="profile-details"><form class="profile-name-form"><label for="profile-name">Nickname</label><div class="profile-name-row"><input id="profile-name" maxlength="20" required autocomplete="off" spellcheck="false"><button type="submit" aria-label="Save nickname">✓</button></div></form><div class="profile-uid"><span></span><button type="button" aria-label="Copy player ID">⧉</button></div></div></div><div class="profile-grid" aria-label="Choose avatar"></div><p class="profile-status" role="status"></p><button class="profile-use">USED</button></div>`;
  document.getElementById('stage').append(modal);
  const name = modal.querySelector('input');
  const status = modal.querySelector('.profile-status');
  const use = modal.querySelector('.profile-use');
  let selected = player.avatar;
  const unlocked = (i) => Object.keys(progress.stars).length >= milestones[i];
  const refreshTrigger = () => { trigger.textContent = avatars[player.avatar][0]; };
  const render = () => {
    modal.querySelector('.profile-portrait').textContent = avatars[selected][0];
    const grid = modal.querySelector('.profile-grid');
    grid.replaceChildren();
    avatars.forEach(([icon, label], i) => {
      const locked = !unlocked(i);
      const b = document.createElement('button');
      b.className = `profile-avatar${i === selected ? ' selected' : ''}${locked ? ' locked' : ''}`;
      b.setAttribute('aria-label', `${label}${locked ? `, complete ${milestones[i]} levels to unlock` : ''}`);
      b.setAttribute('aria-pressed', String(i === selected));
      b.setAttribute('aria-disabled', String(locked));
      b.innerHTML = `<span aria-hidden="true">${icon}</span><small>${locked ? '🔒' : i === player.avatar ? '✓' : ''}</small>`;
      b.onclick = () => {
        audio.tap();
        if (locked) { status.textContent = `Complete ${milestones[i]} levels to unlock ${label}.`; return; }
        selected = i; status.textContent = ''; render(); grid.children[i].focus();
      };
      grid.append(b);
    });
    use.disabled = selected === player.avatar || !unlocked(selected);
    use.textContent = selected === player.avatar ? 'USED' : 'USE';
  };
  const close = () => { modal.classList.add('hidden'); home.inert = false; trigger.focus(); };
  trigger.onclick = () => {
    audio.unlock(); audio.tap();
    if (!unlocked(player.avatar)) { player.avatar = 0; persist(); refreshTrigger(); }
    selected = player.avatar; name.value = player.name; status.textContent = '';
    modal.querySelector('.profile-uid span').textContent = `UID: ${uid.slice(0,13)}…`;
    render(); modal.classList.remove('hidden'); home.inert = true; modal.querySelector('.profile-close').focus();
  };
  modal.querySelector('.profile-close').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
  modal.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const value = name.value.trim();
    if (!value) { status.textContent = 'Please enter a nickname.'; name.focus(); return; }
    player.name = value; name.value = value;
    status.textContent = persist() ? 'Nickname saved!' : 'Changed for this session. Storage is unavailable.';
  };
  modal.querySelector('.profile-uid button').onclick = async () => {
    try { await navigator.clipboard.writeText(uid); status.textContent = 'Player ID copied!'; }
    catch { status.textContent = `Player ID: ${uid}`; }
  };
  use.onclick = () => {
    if (!unlocked(selected)) return;
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

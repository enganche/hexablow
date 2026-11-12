const STORE_KEY = 'hexablow.settings.v1';
const LEVEL_KEY = 'hexablow.level.v1';

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  vibration: true,
  notifications: false,
  hints: true, // auto-hint when the player is stuck (on by default)
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // hints used to be an opt-in highlight (default off): switch everyone to the new default-on auto hint once
      if (!saved.hintsV2) { saved.hints = true; saved.hintsV2 = true; }
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadLevelIndex(max) {
  try {
    const n = parseInt(localStorage.getItem(LEVEL_KEY) ?? '0', 10);
    if (Number.isFinite(n) && n >= 0 && n < max) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

/** True once any level has ever been opened (false on the very first launch). */
export function hasOpenedLevel() {
  try {
    return localStorage.getItem(LEVEL_KEY) !== null;
  } catch {
    return true; // storage unavailable: don't force-open every launch
  }
}

export function saveLevelIndex(i) {
  try {
    localStorage.setItem(LEVEL_KEY, String(i));
  } catch {
    /* ignore */
  }
}

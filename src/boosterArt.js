import reveal from './assets/boosters/reveal.webp';
import find from './assets/boosters/find.webp';
import picker from './assets/boosters/picker.webp';

// Image icons wrapped in an <svg> so the existing svg-based sizing rules keep working everywhere.
const wrap = (href) => `<svg viewBox="0 0 64 64" aria-hidden="true"><image href="${href}" x="3" y="3" width="58" height="58" preserveAspectRatio="xMidYMid meet"/></svg>`;

export const boosterArt = {
  reveal: wrap(reveal),
  find: wrap(find),
  picker: wrap(picker),
};

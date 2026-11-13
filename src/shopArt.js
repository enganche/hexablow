import coinImg from './assets/coin.png';
import starterImg from './assets/starter-pack.png';
import bundleSprout from './assets/bundle-sprout.png';
import bundleBasket from './assets/bundle-basket.png';
import bundleBarrow from './assets/bundle-barrow.png';
import goldJackpot from './assets/gold-jackpot.png';
import gold30 from './assets/gold-30.png';
import gold100 from './assets/gold-100.png';
import gold280 from './assets/gold-280.png';
import gold750 from './assets/gold-750.png';
import gold1700 from './assets/gold-1700.png';
import gold3800 from './assets/gold-3800.png';
import chest7 from './assets/chest-7.png';
import chest14 from './assets/chest-14.png';
import chest21 from './assets/chest-21.png';
import chest28 from './assets/chest-28.png';
const pic = (href) => `<svg viewBox="0 0 96 80" aria-hidden="true"><image href="${href}" x="8" y="0" width="80" height="80"/></svg>`;
// Garden-themed illustrations for the shop (outlined SVG, same visual language as boosterArt).
const svg = (body) => `<svg viewBox="0 0 96 80" aria-hidden="true" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const shadow = (rx = 32, cy = 72) => `<ellipse cx="48" cy="${cy}" rx="${rx}" ry="5" fill="#30236b" opacity=".16" stroke="none"/>`;
const coin = (x, y, r = 9) => `<image href="${coinImg}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}"/>`;
const sparkle = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="m0-7 1.8 5.2L7 0l-5.2 1.8L0 7l-1.8-5.2L-7 0l5.2-1.8Z" fill="#fffbb9" stroke="none"/>`;
const sprout = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0v-12" stroke="#3f8a3a"/><path d="M0-10q-9-1-10-9 9-1 10 9Z" fill="#7fd04e" stroke="#3f8a3a"/><path d="M0-12q8-1 9-8-8-1-9 8Z" fill="#a6e56a" stroke="#3f8a3a"/></g>`;
const flower = (x, y, c, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0v10" stroke="#3f8a3a"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-6" rx="4.4" ry="6" fill="${c}" stroke="#8a4a63" transform="rotate(${a})"/>`).join('')}<circle r="3.6" fill="#ffd54a" stroke="#a8641c"/></g>`;
const chest = (body, lid, edge, latch) => `${shadow(38, 73)}<path d="M12 44h72v28H12Z" fill="${body}" stroke="${edge}"/><path d="M12 44 10 34h76l-2 10Z" fill="${lid}" stroke="${edge}"/><path d="M12 54h72" stroke="${edge}" fill="none"/><rect x="40" y="48" width="16" height="12" rx="2" fill="${latch}" stroke="#7a4a12"/>`;

export const shopArt = {
  bundleSprout: svg(`<image href="${bundleSprout}" x="8" y="0" width="80" height="80"/>`),
  bundleBasket: svg(`<image href="${bundleBasket}" x="8" y="0" width="80" height="80"/>`),
  bundleBarrow: svg(`<image href="${bundleBarrow}" x="8" y="0" width="80" height="80"/>`),
  starter: svg(`<image href="${starterImg}" x="8" y="0" width="80" height="80"/>`),
  noads: svg(`${shadow(34, 70)}<path d="M22 62h52l-5 8q-1 2-5 2H32q-4 0-5-2Z" fill="#e58a4f" stroke="#8a4a1f"/><ellipse cx="48" cy="48" rx="28" ry="10" fill="#7a4b27" stroke="#4a2c14"/>${sprout(48, 48, 2.6)}${flower(24, 40, '#ff9ec4', .9)}${flower(72, 40, '#b88af0', .9)}${sparkle(80, 14, 1.2)}${sparkle(14, 18, .9)}`),
  crate: svg(`${shadow(36, 73)}<path d="M12 40h72v32H12Z" fill="#d79a52" stroke="#7d4a1f"/><path d="M12 40h72v8H12Zm0 12h72M12 60h72" fill="#efba6e" stroke="#7d4a1f"/><path d="M12 40 8 30h80l-4 10Z" fill="#b97a3a" stroke="#7d4a1f"/>${coin(30, 28, 11)}${coin(52, 24, 11)}${coin(70, 29, 10)}${sprout(40, 22, 1.3)}${flower(62, 14, '#ff9ec4', .9)}${sparkle(14, 14, 1.2)}${sparkle(84, 44, .9)}`),
  pouch: svg(`${shadow(30)}<path d="M26 32q-8 14-6 28 2 12 28 12t28-12q2-14-6-28Z" fill="#c7925b" stroke="#7d4a1f"/><path d="M30 36q-5 12-3 22" fill="none" stroke="#e5b983" stroke-width="3"/><path d="M28 32q20 8 40 0l-3-10q-17 6-34 0Z" fill="#a8743f" stroke="#7d4a1f"/><circle cx="48" cy="27" r="4" fill="#ff7d77" stroke="#a63a3a"/>${sprout(38, 22, 1.2)}${sprout(60, 20, 1.1)}${coin(48, 56, 10)}${coin(34, 62, 8)}${sparkle(82, 22)}${sparkle(12, 40, .8)}`),
  basket: svg(`${shadow(32)}${flower(28, 26, '#ff7fb2', 1.2)}${flower(48, 18, '#ffcf4a', 1.3)}${flower(68, 26, '#b88af0', 1.2)}${flower(38, 32, '#7fd8ef', 1)}${flower(58, 33, '#ff9a6a', 1)}<path d="M14 42h68l-6 28q-2 4-8 4H28q-6 0-8-4Z" fill="#d79a52" stroke="#7d4a1f"/><path d="M17 52h62M20 62h56M32 42l2 32M48 42v32M64 42l-2 32" fill="none" stroke="#a8693a" stroke-width="2"/>${coin(48, 58, 9)}${sparkle(86, 20)}${sparkle(10, 30, .9)}`),
  barrow: svg(`${shadow(38, 74)}<path d="M12 38h60l-8 26q-2 4-8 4H30q-6 0-8-4Z" fill="#e0614e" stroke="#7a2a22"/><path d="M20 46h46" stroke="#f58b78" stroke-width="3"/><path d="M72 38l16-8M72 42l16-6" stroke="#7d4a1f" stroke-width="3" fill="none"/><circle cx="40" cy="66" r="9" fill="#5a6470" stroke="#2c3138"/><circle cx="40" cy="66" r="3.4" fill="#cfd6df" stroke="none"/><circle cx="24" cy="30" r="9" fill="#ff8a3d" stroke="#99430f"/><circle cx="42" cy="26" r="9" fill="#ffd54a" stroke="#a8761c"/><circle cx="58" cy="31" r="8" fill="#e8465a" stroke="#8b1e30"/><path d="M24 22q4-5 8-3M42 18q4-4 8-2" fill="none" stroke="#3f8a3a"/>${coin(30, 40, 7)}${coin(52, 40, 7)}${sparkle(82, 14, 1.2)}${sparkle(8, 20, .8)}`),
  coin1: pic(gold100),
  coin2: pic(gold280),
  coin3: pic(gold750),
  coin4: pic(gold1700),
  coin5: pic(gold3800),
  jackpot: svg(`<image href="${goldJackpot}" x="8" y="0" width="80" height="80"/>`),
  claim: pic(gold30),
  chest7: pic(chest7),
  chest14: pic(chest14),
  chest21: pic(chest21),
  chest28: pic(chest28),
};

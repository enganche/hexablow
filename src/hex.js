// Pointy-top hex grid helpers using axial coordinates (q, r).
// Pixel space here is "screen style": x right, y DOWN.

export const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const SQRT3 = Math.sqrt(3);

export const key = (q, r) => `${q},${r}`;

export function neighbors(q, r) {
  return DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

export function areAdjacent(a, b) {
  return hexDistance(a, b) === 1;
}

export function hexDistance(a, b) {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Center of a hex of circumradius R. */
export function axialToPixel(q, r, R = 1) {
  return { x: SQRT3 * R * (q + r / 2), y: 1.5 * R * r };
}

/** Axial coords of the hex containing pixel (x, y). Returns [q, r]. */
export function pixelToAxial(x, y, R = 1) {
  const qf = ((SQRT3 / 3) * x - y / 3) / R;
  const rf = ((2 / 3) * y) / R;
  return cubeRound(qf, rf);
}

function cubeRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  let s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q + 0, r + 0]; // + 0 normalises -0
}

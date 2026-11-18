// Pixel-art backdrops for the hero, drawn on a small canvas and scaled up crisply.
// 'auto' follows the app theme: day scene in light mode, night scene in dark mode.
export const SCENES = [
  ['auto', 'Auto (day / night)'], ['day', 'Day park'], ['night', 'Night sky'], ['sunset', 'Sunset'],
  ['city', 'City night'], ['gym', 'Gym'], ['beach', 'Beach'],
];
export const resolveScene = (k, theme) => (!k || k === 'auto') ? (theme === 'light' ? 'day' : 'night') : k;

const W = 120, H = 78, GROUND = 58;   // logical pixels; ground line where the hero stands
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const bands = (x, cols, y0, y1) => { const n = cols.length, hh = (y1 - y0) / n; cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, Math.round(y0 + i * hh), W, Math.ceil(hh) + 1); }); };
const rect = (x, c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
function disc(x, c, cx, cy, r) { x.fillStyle = c; for (let yy = -r; yy <= r; yy++) { const w = Math.round(Math.sqrt(r * r - yy * yy)); x.fillRect(cx - w, cy + yy, w * 2 + 1, 1); } }
function cloud(x, a, b, s) { rect(x, '#ffffff', a + 2 * s, b, 6 * s, 2 * s); rect(x, '#ffffff', a, b + 2 * s, 12 * s, 2 * s); rect(x, '#dfeaf2', a, b + 4 * s, 12 * s, 1); }
function hills(x, c, base, amp, seed) { const r = rng(seed); x.fillStyle = c; let hgt = amp; for (let i = 0; i < W; i += 2) { hgt += (r() - .5) * 2; hgt = Math.max(2, Math.min(amp * 1.6, hgt)); x.fillRect(i, base - hgt, 2, hgt); } }
function ground(x, top, mid, dark) { rect(x, top, 0, GROUND, W, 2); rect(x, mid, 0, GROUND + 2, W, H - GROUND - 2); const r = rng(7); x.fillStyle = dark; for (let i = 0; i < 26; i++) x.fillRect(Math.floor(r() * W), GROUND + 4 + Math.floor(r() * (H - GROUND - 6)), 2, 1); }

const DRAW = {
  day(x) {
    bands(x, ['#5fb4f2', '#73c2f6', '#8fd0f8', '#aadcf9'], 0, GROUND);
    disc(x, '#fff3b0', 98, 14, 7); disc(x, '#ffcd75', 98, 14, 5);
    cloud(x, 12, 10, 1); cloud(x, 54, 18, 1); cloud(x, 80, 6, 1);
    hills(x, '#5fbf7a', GROUND, 8, 3); hills(x, '#38b764', GROUND, 4, 9);
    ground(x, '#a7f070', '#38b764', '#2a8a4c');
  },
  night(x) {
    bands(x, ['#14152a', '#1a1c2c', '#202650', '#29366f'], 0, GROUND);
    const r = rng(42); for (let i = 0; i < 40; i++) { x.fillStyle = r() > .8 ? '#ffcd75' : '#f4f4f4'; x.fillRect(Math.floor(r() * W), Math.floor(r() * (GROUND - 14)), 1, 1); }
    disc(x, '#f4f4f4', 98, 14, 6); disc(x, '#202650', 101, 12, 5);
    hills(x, '#1f2a4a', GROUND, 7, 5);
    ground(x, '#38b764', '#1e5a3a', '#174a30');
  },
  sunset(x) {
    bands(x, ['#5d275d', '#7a2f5c', '#b13e53', '#d9604f', '#ef7d57', '#ffb26b'], 0, GROUND);
    disc(x, '#ffcd75', 60, GROUND - 4, 11); rect(x, '#ffb26b', 0, GROUND - 4, W, 1);
    hills(x, '#3b2a4a', GROUND, 9, 11); hills(x, '#2a1f3a', GROUND, 4, 4);
    ground(x, '#7a4a52', '#3b2a46', '#2a1f3a');
  },
  city(x) {
    bands(x, ['#14152a', '#1a1c2c', '#262b44', '#333c57'], 0, GROUND);
    const r = rng(77);
    for (let i = 0; i < 18; i++) { x.fillStyle = '#f4f4f4'; x.fillRect(Math.floor(r() * W), Math.floor(r() * 18), 1, 1); }
    let a = 0;
    while (a < W) {
      const bw = 8 + Math.floor(r() * 12), bh = 14 + Math.floor(r() * 30), c = r() > .5 ? '#262b44' : '#333c57';
      rect(x, c, a, GROUND - bh, bw, bh);
      for (let yy = GROUND - bh + 3; yy < GROUND - 3; yy += 4) for (let xx = a + 2; xx < a + bw - 2; xx += 3) if (r() > .55) rect(x, r() > .3 ? '#ffcd75' : '#73eff7', xx, yy, 1, 2);
      a += bw + 1;
    }
    rect(x, '#566c86', 0, GROUND, W, 2); rect(x, '#29303f', 0, GROUND + 2, W, H - GROUND - 2);
    for (let i = 4; i < W; i += 16) rect(x, '#ffcd75', i, GROUND + 10, 8, 1);
  },
  gym(x) {
    bands(x, ['#3c4560', '#46506e', '#566c86'], 0, GROUND);
    rect(x, '#ef7d57', 0, 30, W, 3); rect(x, '#b13e53', 0, 33, W, 1);
    for (let i = 6; i < W; i += 38) { rect(x, '#1a1c2c', i - 1, 4, 30, 24); rect(x, '#9fb4c7', i, 5, 28, 22); rect(x, '#c8d6e5', i + 2, 7, 6, 18); }
    // dumbbell rack
    rect(x, '#1a1c2c', 8, GROUND - 14, 30, 2); rect(x, '#1a1c2c', 10, GROUND - 12, 2, 12); rect(x, '#1a1c2c', 34, GROUND - 12, 2, 12);
    for (let i = 0; i < 4; i++) { const xx = 12 + i * 6; rect(x, '#333c57', xx, GROUND - 18, 4, 4); rect(x, '#94b0c2', xx + 1, GROUND - 17, 2, 2); }
    // barbell on the right
    rect(x, '#94b0c2', 78, GROUND - 6, 34, 1); rect(x, '#1a1c2c', 80, GROUND - 11, 4, 11); rect(x, '#1a1c2c', 106, GROUND - 11, 4, 11);
    rect(x, '#8b5a3c', 0, GROUND, W, H - GROUND); x.fillStyle = '#6e4630'; for (let yy = GROUND + 4; yy < H; yy += 5) x.fillRect(0, yy, W, 1);
    for (let i = 0; i < W; i += 20) rect(x, '#6e4630', i + ((i / 20) % 2) * 10, GROUND, 1, H - GROUND);
  },
  beach(x) {
    bands(x, ['#73c2f6', '#8fd0f8', '#b8e4fa'], 0, GROUND - 14);
    disc(x, '#fff3b0', 22, 14, 6);
    cloud(x, 60, 8, 1); cloud(x, 90, 16, 1);
    bands(x, ['#257179', '#3b5dc9', '#41a6f6'], GROUND - 14, GROUND);
    const r = rng(5); for (let i = 0; i < 14; i++) rect(x, '#f4f4f4', Math.floor(r() * W), GROUND - 13 + Math.floor(r() * 12), 3, 1);
    rect(x, '#f4f4f4', 0, GROUND - 1, W, 1);
    rect(x, '#ffe1a8', 0, GROUND, W, 2); rect(x, '#f0c98a', 0, GROUND + 2, W, H - GROUND - 2);
    for (let i = 0; i < 20; i++) rect(x, '#d9ae6a', Math.floor(r() * W), GROUND + 4 + Math.floor(r() * 14), 1, 1);
  },
};

/** A canvas with the backdrop drawn at logical size; CSS scales it up with pixelated rendering. */
export function sceneCanvas(kind, theme) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H; c.className = 'px bgc';
  const x = c.getContext('2d');
  (DRAW[resolveScene(kind, theme)] || DRAW.night)(x);
  return c;
}

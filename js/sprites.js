// Pixel art. Semua sprite digambar sendiri: tiap huruf = satu piksel, '.' = transparan.
// Sprite simetris ditulis setengah (kiri) lalu dicerminkan.

export const PAL = {
  k: '#1a1c2c', w: '#f4f4f4', g: '#94b0c2', G: '#566c86', d: '#333c57',
  r: '#b13e53', o: '#ef7d57', y: '#ffcd75', l: '#a7f070', L: '#38b764', t: '#257179',
  b: '#29366f', B: '#3b5dc9', c: '#41a6f6', C: '#73eff7', p: '#5d275d',
};

const mirror = rows => rows.map(r => r + [...r].reverse().join(''));

// ---------- monster 16x16 ----------
const SLIME = mirror([
  '........', '........', '........', '........',
  '......kk', '.....kcc', '....kccc', '...kcccc',
  '..kccccc', '..kcwecc', '.kcccccc', '.kccckmm',
  'kccccccc', 'kdcccccc', 'kddddddd', '.kkkkkkk',
]);
const GHOST = mirror([
  '........', '.....kkk', '....kccc', '...kcccc',
  '..kccccc', '..kcwecc', '..kccccc', '.kcccccc',
  '.kcccckm', '.kcccccc', 'kccccccc', '.kcccccc',
  '.kcccccc', '.kcccccc', '.kckkckc', '..k..k..',
]);
const BEAST = mirror([
  '..k.....', '..kk....', '...kkkkk', '..kccccc',
  '.kcccccc', '.kcwwecc', '.kcwwecc', '.kcccccc',
  '.kccmmmm', '.kcmwmwm', '..kccccc', '...kkccc',
  '..kccccc', '.kcccccc', '.kcdkkdc', '..kk..kk',
]);

export const BOSSES = [
  { name: 'Snack Slime', shape: SLIME, c: PAL.l, d: PAL.L },
  { name: 'Promo Ghost', shape: GHOST, c: PAL.g, d: PAL.G },
  { name: 'Checkout Dragon', shape: BEAST, c: PAL.o, d: PAL.r },
  { name: 'King Paylater', shape: SLIME, c: PAL.c, d: PAL.B, crown: true },
  { name: 'Discount Demon', shape: BEAST, c: '#8b5fbf', d: PAL.p },
  { name: 'Shipping-Fee Ghost', shape: GHOST, c: PAL.y, d: PAL.o },
];

// ---------- mobil 24x10 (sedan generik) ----------
const CAR = [
  '......kkkkkkkkkk........',
  '.....kgggkgggggggk......',
  '....kggggkgggggggggk....',
  '.kkkccccccccccccccckkkk.',
  'kcccccccccccccccccccccyk',
  'kcccccccccccccccccccccck',
  'kccckkkkcccccccckkkkccck',
  '...kwwwk........kwwwk...',
  '...kwkwk........kwkwk...',
  '....kkk..........kkk....',
];

// ---------- ikon 8x8 ----------
export const ICONS = {
  heart: ['.rr..rr.', 'rorrrrrr', 'rorrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...', '........'],
  coin: ['..kkkk..', '.kyyyyk.', 'kyywyyok', 'kywyyyok', 'kyyyyyok', 'kyyyyook', '.kooook.', '..kkkk..'],
  star: ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yyyyyy.', 'yy....yy', '........'],
  sword: ['......gw', '.....gwg', '....gwg.', '.y.gwg..', '..ywg...', '..oy....', '.o..y...', 'o.......'],
  chest: ['.kkkkkk.', 'kooooook', 'kooooook', 'kkkyykkk', 'kooyyook', 'kooooook', 'kooooook', 'kkkkkkkk'],
  shield: ['kkkkkkkk', 'kBBBccck', 'kBBBccck', 'kBBBccck', 'kcccBBBk', '.kccBBk.', '..kcBk..', '...kk...'],
  skull: ['.wwwwww.', 'wwwwwwww', 'wkkwwkkw', 'wkkwwkkw', 'wwwkkwww', '.wwwwww.', '.wkwkwk.', '........'],
  bolt: ['....yy..', '...yy...', '..yy....', '.yyyyyy.', '....yy..', '...yy...', '..yy....', '.y......'],
  check: ['........', '.......l', '......ll', 'l....ll.', 'll..ll..', '.llll...', '..ll....', '........'],
  box: ['kkkkkkkk', 'k......k', 'k......k', 'k......k', 'k......k', 'k......k', 'k......k', 'kkkkkkkk'],
  dumbbell: ['........', 'kk....kk', 'kgk..kgk', 'kgwwwwgk', 'kgGGGGgk', 'kgk..kgk', 'kk....kk', '........'],
  gear: ['...gg...', '.gggggg.', '.gg..gg.', 'gg....gg', 'gg....gg', '.gg..gg.', '.gggggg.', '...gg...'],
};

// ---------- renderer ----------
function drawRows(ctx, rows, pal, ox = 0, oy = 0, s = 1, from = 0, to = rows.length) {
  for (let y = from; y < to; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch] || PAL[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + x * s, oy + y * s, s, s);
    }
  }
}

function canvas(w, h, scale, cls) {
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  c.className = 'px ' + (cls || '');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function bossCanvas(idx, scale = 5, defeated = false) {
  const b = BOSSES[idx % BOSSES.length];
  const [c, ctx] = canvas(16, 16, scale, 'boss');
  const pal = { c: defeated ? PAL.G : b.c, d: defeated ? PAL.d : b.d, w: PAL.w, e: defeated ? PAL.G : PAL.k, m: PAL.k };
  let f = 0;
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    const squash = !defeated && f ? 1 : 0;
    drawRows(ctx, b.shape, pal, 0, squash * scale, scale, 0, 15);
    drawRows(ctx, b.shape, pal, 0, 0, scale, 15, 16);
    if (b.crown && !defeated) [[5, 2], [7, 1], [8, 1], [10, 2], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3]].forEach(([x, y]) => { ctx.fillStyle = PAL.y; ctx.fillRect(x * scale, (y + squash) * scale, scale, scale); });
    if (defeated) { ctx.fillStyle = PAL.r; [[4, 5], [5, 6], [6, 5], [9, 5], [10, 6], [11, 5]].forEach(([x, y]) => ctx.fillRect(x * scale, y * scale, scale, scale)); }
  };
  draw();
  if (!defeated) c._timer = setInterval(() => { if (!c.isConnected) return clearInterval(c._timer); f ^= 1; draw(); }, 700);
  return c;
}

/** Mobil dirakit sesuai progres (0..1): bagian yang belum terbiayai tampil sebagai garis cetak biru. */
export function carCanvas(pct, scale = 5) {
  const [c, ctx] = canvas(24, 10, scale, 'car');
  const cut = Math.round(Math.max(0, Math.min(1, pct)) * 24);
  const full = { c: PAL.r, g: PAL.C, y: PAL.y, w: PAL.g, k: PAL.k };
  const ghost = { c: PAL.b, g: PAL.b, y: PAL.b, w: PAL.b, k: PAL.G };
  CAR.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = (x < cut ? full : ghost)[ch] || PAL.k;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c;
}

export function iconCanvas(name, scale = 2, cls = '') {
  const rows = ICONS[name] || ICONS.box;
  const [c, ctx] = canvas(8, 8, scale, 'ico ' + cls);
  drawRows(ctx, rows, {}, 0, 0, scale);
  return c;
}

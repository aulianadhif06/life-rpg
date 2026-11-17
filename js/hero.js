// Layered, customizable hero (32×48 px). All art is original and drawn here as pixel masks.
// Masks are written as the LEFT half (16 px) and mirrored, so the character is symmetric.
// Mask letters: a = base colour, b = shade, c = highlight, k = dark line, w = white, s/S = skin / skin shade.

const W = 32, H = 48;
const mirror = rows => rows.map(r => { if (r.length !== 16) throw new Error('mask row must be 16: ' + r); return r + [...r].reverse().join(''); });
const at = (rows, start) => ({ rows: mirror(rows), start });

// ---------- colour helpers ----------
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
/** base → {a, b (shade, hue-shifted cooler), c (highlight), k (deep line)} */
export function ramp(hex) {
  const [h, s, l] = hexToHsl(hex);
  return { a: hex, b: hsl(h - 12, s * 1.05, l * 0.72), c: hsl(h + 8, s * 0.95, Math.min(0.92, l * 1.18 + 0.04)), k: hsl(h - 20, s * 0.9, l * 0.38) };
}
const OUTLINE = '#1a1c2c';

// ---------- options ----------
export const SKINS = ['#f6d5bb', '#ebbb96', '#d6a072', '#b67d52', '#8d5a3b', '#5f3b28'];
export const HAIR_COLORS = ['#2b2433', '#4a2f27', '#7a4a2a', '#d9b25f', '#b8322e', '#e58fb0', '#3b5dc9', '#6b3e8f', '#c7cfd8', '#38b764'];
export const EYE_COLORS = ['#6b3e2a', '#1a1c2c', '#41a6f6', '#38b764', '#e0a030', '#b13e53', '#8b5fbf'];
export const CLOTH_COLORS = ['#3b5dc9', '#29366f', '#257179', '#38b764', '#b13e53', '#ef7d57', '#ffcd75', '#8b5fbf', '#f4f4f4', '#94b0c2', '#333c57', '#1f1f28', '#7a4a2a', '#c99a2e'];

// ---------- body ----------
const BODY = at([
  '................', '................', '................', '................', '................',
  '...........SSSSS', '.........Sssssss', '........Ssssssss', '........ssssssss', '........ssssssss',
  '.......sssssssss', '.......sssssssss', '.......sssssssss', '........ssssssss', '........ssssssss',
  '.........sssssss', '.........Sssssss', '..........Ssssss', '...........SSsss', '..............ss',
  '.............Sss', '..........ssssss', '.........sssssss', '........ssssssss', '........ss.sssss',
  '........ss.sssss', '........ss.sssss', '........ss.sssss', '........ss.sssss', '........ss.sssss',
  '........ss.sssss', '........ss.sssss', '........ss.sssss', '........ss.sssss', '........ss.sssss',
  '........Ss.sssss', '........ss.sssss', '........SS.ssss.', '...........ssss.', '...........ssss.',
  '...........ssss.', '...........ssss.', '...........ssss.', '...........ssss.', '...........ssss.',
  '...........ssss.', '...........ssss.', '...........SSSS.',
], 0);

// face details (drawn over skin): eyes rows 11-13 at cols 10-11, brows row 10, mouth row 16
export const EYE_STYLES = {
  round: { 10: '..........kk....', 11: '..........kk....', 12: '..........iw....', 13: '..........iI....' },
  sharp: { 10: '.........kkk....', 12: '..........ik....', 13: '..........kI....' },
  soft: { 10: '..........kk....', 12: '..........ii....', 13: '..........kk....' },
  happy: { 10: '..........kk....', 12: '...........k....', 13: '..........k.....' },
};
const MOUTH = { 16: '...............m' };

// ---------- hair: back (behind head/body) and front (over face) ----------
export const HAIR_STYLES = {
  messy: {
    front: at(['..........a.....', '........aaa..aa.', '.......aaaaaaaaa', '......aaaaaaaaaa', '......abaaaacaaa', '......abaaacaaaa',
      '.......abaa.aaab', '.......ab..a..ab', '.......ab.......', '.......a........', '.......a........'], 2),
  },
  long: {
    back: at(['......aaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa',
      '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....bbaaaaaaaaa', '......bbaaaaaaaa', '......bbbaaaaaaa',
      '.......bbaaaaaaa', '.......bbbaaaaaa', '.......bbbbaaaaa', '........bbbbaaaa', '........b.bbbbaa', '...........b.bbb'], 4),
    front: at(['.........aaaaaaa', '.......aaaaaaaaa', '......aaaaaaaaaa', '......aaaaaacaaa', '......abaaacaaaa', '......abaaaaaaab',
      '......ab.aa.aaab', '......ab...a..ab', '......ab........', '......ab........', '......ab........', '......ab........', '......ab........',
      '......ab........', '.......b........'], 3),
  },
  spiky: {
    front: at(['.........a....a.', '......a..aa..aa.', '......aa.aaaaaaa', '.......aaaaaaaaa', '.....aaaaaaaaaaa', '......aaaaaacaaa', '.......abaacaaaa',
      '.......ab.aa.aab', '.......ab..a...b', '.......a........'], 1),
  },
  bob: {
    back: at(['......aaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....aaaaaaaaaaa',
      '.....aaaaaaaaaaa', '.....aaaaaaaaaaa', '.....bbaaaaaaaaa', '.....bbbaaaaaaaa', '......bbb.......'], 4),
    front: at(['.........aaaaaaa', '.......aaaaaaaaa', '......aaaaaaaaaa', '......aaaaacaaaa', '......abaacaaaaa', '......abaaaaaaaa',
      '......abaaaaaaab', '......ab........', '......ab........', '......ab........', '......ab........', '......ab........', '......bb........'], 3),
  },
  bun: {
    front: at(['.............aaa', '............aaca', '............aaaa', '.........aaaaaaa', '.......aaaaaaaaa', '......aaaaaaaaaa', '......abaaaacaaa',
      '......abaaacaaaa', '.......ab.aaaaab', '.......ab...a..b', '.......a........', '.......a........'], 0),
  },
  buzz: {
    front: at(['.........aaaaaaa', '........aaaaaaaa', '........aaaaaaaa', '........aa......'], 4),
  },
};

// ---------- clothes ----------
export const TOPS = {
  tee: at(['..........aaaa..', '.........aaaaaa.', '........baaaaaaa', '........bb.aaaaa', '........bb.aaaaa', '........bb.baaaa', '...........baaaa',
    '...........baaaa', '...........baaaa', '...........baaaa', '...........baaaa', '...........baaaa', '...........baaaa', '...........bbbbb'], 21),
  tank: at(['..........aa....', '..........aaa...', '...........aaaa.', '...........baaaa', '...........baaaa', '...........baaaa', '...........baaaa',
    '...........baaaa', '...........baaaa', '...........baaaa', '...........baaaa', '...........baaaa', '...........bbbbb'], 21),
  shirt: at(['..........aaawww', '.........aaaaawk', '........baaaaaak', '........bb.aaaak', '........bb.aacak', '........bb.baack', '........bb.baack', '........bb.baaak',
    '........bb.baaak', '........bb.baaak', '........bb.baaak', '........bb.baaak', '........bb.baaak', '........kk.bbbbk', '................'], 21),
  vest: at(['..........wwww..', '.........wwwww..', '........wwaaaaw.', '........ww.aaaaw', '........ww.aaaaw', '........ww.baaaw', '........ww.baaaa',
    '........ww.baaaa', '........ww.baaaa', '........ww.baaaa', '........ww.baaaa', '........ww.baaaa', '........ww.baaaa', '........ww.bbbbb'], 21),
  hoodie: at(['.........bbbb...', '........baaaab..', '........baaaaak.', '........bb.aaaaw', '........bb.aaaaw', '........bb.aaaaw', '........bb.aaaaa', '........bb.aaaaa',
    '........bb.abbbb', '........bb.ab...', '........bb.abbbb', '........bb.aaaaa', '........bb.aaaaa', '........kk.bbbbb'], 20),
};
export const BOTTOMS = {
  pants: at(['...........kkkkk', '...........aaaaa', '...........aaaaa', '...........baaa.', '...........baaa.', '...........baaa.', '...........baaa.',
    '...........baaa.', '...........baaa.', '...........baaa.', '...........baac.', '...........bbbb.'], 34),
  shorts: at(['...........kkkkk', '...........aaaaa', '...........aaaaa', '...........baaa.', '...........bbbb.'], 34),
  skirt: at(['...........kkkkk', '...........aaaaa', '..........aaaaaa', '..........baaaaa', '.........baaaaca', '.........baaaaca', '........bbbbbbbb'], 34),
  baggy: at(['...........kkkkk', '...........aaaaa', '..........aaaaaa', '..........baaaa.', '..........baaaa.', '.........baaaaa.', '.........baaaaa.',
    '.........baaaaa.', '.........baaaac.', '.........baaaac.', '..........bbbb..'], 34),
};
export const SHOES = {
  sneakers: at(['...........aaaa.', '..........aaaaa.', '..........wwwww.'], 45),
  boots: at(['...........bbbb.', '...........aaaa.', '...........aaaa.', '...........aaac.', '...........aaaa.', '..........aaaaa.', '..........kkkkk.'], 41),
};
export const OUTERS = {
  none: null,
  coat: at(['.........aaa....', '........aaaab...', '.......aaaaab...', '.......aaa.aab..', '.......aaa.aab..', '.......aaa.aab..', '.......aaa.aab..', '.......baa.aab..',
    '.......baa.aab..', '.......baa.aab..', '.......baa.aab..', '.......bbb.aab..', '.......sss.aab..', '..........aaab..', '.........aaaab..', '.........aaaab..',
    '.........aaaab..', '........baaaab..', '........bbbbbb..'], 21),
  jacket: at(['.........aaa....', '........aaaab...', '.......aaaaab...', '.......aaa.aab..', '.......aaa.aab..', '.......aaa.aab..', '.......aaa.aab..', '.......baa.aab..',
    '.......baa.aab..', '.......baa.aab..', '.......baa.aab..', '.......baa.bbb..', '.......kkk......'], 21),
};
const CAPE = at(['..........aaaaaa', '.........aaaaaaa', '........aaaaaaaa', '.......aaaaaaaaa', '.......aaaaaaaaa', '......aaaaaaaaaa', '......aaaaaaaaaa', '......baaaaaaaaa',
  '......baaaaaaaaa', '......baaaaaaaaa', '.....baaaaaaaaaa', '.....baaaaaaaaaa', '.....bbaaaaaaaaa', '.....bbbaaaaaaaa', '......bbbbaaaaaa', '........bbbbbbbb'], 21);
export const ACCESSORIES = {
  none: null,
  headband: { layer: at(['......aaaaaaaaaa', '.......bbbbbbbbb'], 6), color: '#b13e53' },
  glasses: { layer: at(['.........kkkk...', '.........k..kkkk', '.........kkkk...'], 11), color: '#1a1c2c' },
  scarf: { layer: at(['..........aaaaaa', '.........aaaaaaa', '..........bbb...', '..........aab...', '..........aab...'], 19), color: '#b13e53' },
  crown: { layer: at(['..........a..a..', '..........aa.aa.', '..........aaaaaa', '..........bbbbbb'], 0), color: '#ffcd75' },
};

// ---------- shop / unlocks ----------
// lvl = free from that level; gold = price in gold. Anything not listed is free.
export const UNLOCKS = {
  'top:hoodie': { lvl: 3 }, 'top:vest': { gold: 80 }, 'bottom:baggy': { gold: 60 }, 'shoes:boots': { gold: 60 },
  'outer:jacket': { lvl: 5 }, 'outer:coat': { lvl: 10 }, 'outer:cape': { lvl: 15 },
  'acc:headband': { gold: 50 }, 'acc:glasses': { gold: 70 }, 'acc:scarf': { gold: 90 }, 'acc:crown': { lvl: 20 },
  'hair:bun': { gold: 40 }, 'hair:spiky': { gold: 40 },
};
OUTERS.cape = 'cape';

export const DEFAULT_LOOK = {
  skin: 2, hair: 'messy', hairColor: 1, eyes: 'round', eyeColor: 0,
  top: 'tee', topColor: 0, bottom: 'pants', bottomColor: 10, shoes: 'sneakers', shoesColor: 11,
  outer: 'none', outerColor: 4, acc: 'none',
};
export const lookOf = cfg => ({ ...DEFAULT_LOOK, ...((cfg && cfg.look) || {}) });

// ---------- compose ----------
function paintMask(grid, layer, pal) {
  if (!layer) return;
  layer.rows.forEach((row, i) => {
    const y = layer.start + i;
    if (y < 0 || y >= H) return;
    for (let x = 0; x < W; x++) { const ch = row[x]; if (ch !== '.' && ch !== ' ' && pal[ch]) grid[y][x] = pal[ch]; }
  });
}
function paintPartial(grid, rowsByY, pal) {
  Object.entries(rowsByY).forEach(([y, half]) => {
    const row = half + [...half].reverse().join('');
    for (let x = 0; x < W; x++) { const ch = row[x]; if (ch !== '.' && pal[ch]) grid[+y][x] = pal[ch]; }
  });
}

/** Build the 32×48 colour grid for a look + status. */
export function composeHero(look, status = 'ok') {
  const L = { ...DEFAULT_LOOK, ...look };
  const grid = Array.from({ length: H }, () => Array(W).fill(null));
  let skin = SKINS[L.skin] || SKINS[2];
  if (status === 'sick' || status === 'ko') skin = '#a9b98a';
  const sk = ramp(skin);
  const hair = ramp(HAIR_COLORS[L.hairColor] || HAIR_COLORS[1]);
  const cloth = i => ramp(CLOTH_COLORS[i] || CLOTH_COLORS[0]);
  const white = { w: '#f4f4f4', k: OUTLINE };
  const hs = HAIR_STYLES[L.hair] || HAIR_STYLES.messy;

  if (L.outer === 'cape') { const c = cloth(L.outerColor); paintMask(grid, CAPE, c); }
  paintMask(grid, hs.back, hair);
  paintMask(grid, BODY, { s: sk.a, S: sk.b });
  const eye = ramp(EYE_COLORS[L.eyeColor] || EYE_COLORS[0]);
  paintPartial(grid, EYE_STYLES[L.eyes] || EYE_STYLES.round, { k: OUTLINE, i: eye.a, I: eye.k, w: '#f4f4f4' });
  paintPartial(grid, MOUTH, { m: status === 'ok' ? sk.k : '#6b3e3e' });
  paintMask(grid, BOTTOMS[L.bottom] || BOTTOMS.pants, { ...cloth(L.bottomColor), k: OUTLINE });
  paintMask(grid, SHOES[L.shoes] || SHOES.sneakers, { ...cloth(L.shoesColor), w: '#f4f4f4', k: OUTLINE });
  const top = cloth(L.topColor);
  paintMask(grid, TOPS[L.top] || TOPS.tee, { ...top, w: L.top === 'vest' ? '#f4f4f4' : L.top === 'hoodie' ? top.c : '#f4f4f4', k: top.k });
  if (L.outer === 'coat' || L.outer === 'jacket') { const c = cloth(L.outerColor); paintMask(grid, OUTERS[L.outer], { ...c, s: sk.a, k: c.k }); }
  paintMask(grid, hs.front, hair);
  // brows in hair colour
  paintPartial(grid, { 9: '..........bb....' }, { b: hair.k });
  const acc = ACCESSORIES[L.acc];
  if (acc) paintMask(grid, acc.layer, { ...ramp(acc.color), k: OUTLINE });
  if (status === 'tired') paintPartial(grid, { 7: '....c...........', 8: '....c...........' }, { c: '#73eff7' });

  // automatic 1-px outline around the silhouette
  const out = grid.map(r => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy] && grid[y + dy][x + dx]);
    if (n) out[y][x] = OUTLINE;
  }
  return out;
}

/** Draw a composed grid. frame 1 = idle bob (upper body down 1 px). */
export function paintGrid(ctx, grid, s, ox = 0, oy = 0, frame = 0) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.fillRect(ox + x * s, oy + (y + (frame && y < 40 ? 1 : 0)) * s, s, s);
  }
}
export const HERO_W = W, HERO_H = H;

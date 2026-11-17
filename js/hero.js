// Character renderer for the ChatGPT-made hero sheet (assets/hero).
// The atlas holds 48×96 layers: 8 heads (hairstyles), 8 tops, 5 bottoms and 3 face patches (happy, tired, closed eyes).
// mask.png marks skin (red) and hair (green) so skin tone and hair colour are swapped at runtime by brightness.
import { HERO } from './hero-data.js';

const W = HERO.w, H = HERO.h;
export const SKIN_TONES = HERO.skinTones.map((_, i) => 'tone' + (i + 1));
export const HAIR_COLORS = ['natural', ...Object.keys(HERO.hairColors)];
export const HAIRS = HERO.hairs, TOPS = HERO.tops, BOTTOMS = HERO.bottoms;
export const DEFAULT_AVATAR = { hair: 'messy', hairColor: 'natural', skin: 'tone1', top: 'tee', bottom: 'joggers' };
export const avatarOf = cfg => {
  const a = { ...DEFAULT_AVATAR, ...((cfg && cfg.avatar) || {}) };
  if (!HAIRS.includes(a.hair)) a.hair = DEFAULT_AVATAR.hair;          // older LPC saves
  if (!TOPS.includes(a.top)) a.top = DEFAULT_AVATAR.top;
  if (!BOTTOMS.includes(a.bottom)) a.bottom = DEFAULT_AVATAR.bottom;
  if (!SKIN_TONES.includes(a.skin)) a.skin = DEFAULT_AVATAR.skin;
  if (!HAIR_COLORS.includes(a.hairColor)) a.hairColor = 'natural';
  return a;
};
export const swatch = (kind, key) => kind === 'skin'
  ? HERO.skinTones[SKIN_TONES.indexOf(key)][12]
  : key === 'natural' ? '#3a2422' : HERO.hairColors[key][12];

let sheet = null;
function loadSheet() {
  if (sheet) return sheet;
  const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('missing ' + src)); im.src = src; });
  const pixels = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height); };
  sheet = Promise.all([load('assets/hero/atlas.png'), load('assets/hero/mask.png')]).then(([a, m]) => ({ a: pixels(a), m: pixels(m) }));
  return sheet;
}

const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const bucket = (cuts, l) => { let i = 0; while (i < cuts.length && l > cuts[i]) i++; return i; };
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Compose the avatar into a 48×96 canvas. status: ok | happy | tired | sick | ko */
export async function composeAvatar(av, status = 'ok') {
  av = avatarOf({ avatar: av });
  const { a, m } = await loadSheet();
  const out = new ImageData(W, H), o = out.data;
  const cls = new Uint8Array(W * H);           // 1 skin, 2 hair
  const tileIndex = [HERO.hairs.length + HERO.tops.length + BOTTOMS.indexOf(av.bottom), HERO.hairs.length + TOPS.indexOf(av.top), HAIRS.indexOf(av.hair)];
  const blit = (t, onlyFace) => {
    const tx = (t % HERO.cols) * W, ty = Math.floor(t / HERO.cols) * H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = ((ty + y) * a.width + tx + x) * 4;
      if (!a.data[s + 3]) continue;
      const p = y * W + x;
      if (onlyFace && (cls[p] === 2 || !o[p * 4 + 3])) continue;   // face patches never paint over hair or outside the head
      o[p * 4] = a.data[s]; o[p * 4 + 1] = a.data[s + 1]; o[p * 4 + 2] = a.data[s + 2]; o[p * 4 + 3] = 255;
      cls[p] = m.data[s + 1] ? 2 : m.data[s] ? 1 : 0;
    }
  };
  tileIndex.forEach(t => blit(t, false));
  const face = { happy: 'happy', tired: 'tired', sick: 'tired', ko: 'ko' }[status];
  if (face) blit(HERO.hairs.length + TOPS.length + BOTTOMS.length + HERO.patches.indexOf(face), true);

  const tone = HERO.skinTones[SKIN_TONES.indexOf(av.skin)].map(hex);
  const hairRamp = av.hairColor !== 'natural' ? HERO.hairColors[av.hairColor].map(hex) : null;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (!o[i + 3]) continue;
    const l = lum(o[i], o[i + 1], o[i + 2]);
    let c = null;
    if (cls[p] === 1) c = tone[bucket(HERO.skinCuts, l)];
    else if (cls[p] === 2 && hairRamp) c = hairRamp[bucket(HERO.hairCuts, l)];
    if (c) { o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; }
    if (status === 'sick' && cls[p] === 1) { const g = lum(o[i], o[i + 1], o[i + 2]); o[i] = g * 0.82; o[i + 1] = g * 0.95 + 8; o[i + 2] = g * 0.68; }
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

// Little effects drawn next to the head, in sprite pixels.
function fx(ctx, status, f, s) {
  const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * s, y * s, w * s, h * s); };
  if (status === 'happy') {
    const star = (x, y, col) => { px(x, y - 2, 1, 5, col); px(x - 2, y, 5, 1, col); };
    if (f) { star(5, 30, '#f5c542'); star(43, 22, '#f5c542'); } else { star(6, 18, '#f5c542'); star(42, 34, '#f5c542'); }
  } else if (status === 'tired') {
    const y = f ? 33 : 31; px(41, y, 2, 1, '#7cc4f2'); px(40, y + 1, 4, 2, '#4f9fe0'); px(41, y + 3, 2, 1, '#2f78bf');
  } else if (status === 'sick') {
    const col = '#7da04a', y = f ? 14 : 13;
    px(41, y, 3, 1, col); px(44, y + 1, 1, 2, col); px(41, y + 3, 3, 1, col); px(40, y + 1, 1, 1, col); px(42, y + 2, 1, 1, col);
  }
}

/** Animated character canvas (idle breathing + status effect). scale = screen pixels per sprite pixel. */
export function avatarCanvas(av, status = 'ok', scale = 3) {
  const ko = status === 'ko';
  const c = document.createElement('canvas');
  c.width = (ko ? H : W) * scale; c.height = (ko ? W + 12 : H) * scale;
  c.className = 'px hero' + (ko ? ' ko' : '');
  const ctx = c.getContext('2d');
  composeAvatar(av, status).then(spr => {
    let f = 0;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      if (ko) {
        // lying on the floor, head to the left
        ctx.save(); ctx.translate(0, c.height); ctx.rotate(-Math.PI / 2);
        ctx.drawImage(spr, 0, 0, W * scale, H * scale);
        ctx.restore();
        ctx.fillStyle = '#6b7fd7'; ctx.font = (6 * scale) + 'px Silkscreen, monospace';
        ctx.fillText('z', (30 + f) * scale, (10 - f) * scale); ctx.fillText('z', (37 + f) * scale, (5 - f) * scale);
        return;
      }
      // breathing: upper body (above the hips) dips 1px on the second frame
      const hip = 62;
      ctx.drawImage(spr, 0, hip, W, H - hip, 0, hip * scale, W * scale, (H - hip) * scale);
      ctx.drawImage(spr, 0, 0, W, hip, 0, f * scale, W * scale, hip * scale);
      fx(ctx, status, f, scale);
    };
    draw();
    c._timer = setInterval(() => { if (!c.isConnected) return clearInterval(c._timer); f ^= 1; draw(); }, status === 'happy' ? 380 : 700);
  });
  return c;
}

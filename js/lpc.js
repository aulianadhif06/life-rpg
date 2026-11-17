// Character renderer built on LPC sprite layers (see CREDITS.md).
// Each layer image is a 128×64 strip: 2 idle frames facing the viewer. Colours are swapped at runtime
// from the layer's source palette to the chosen palette (same approach as the LPC generator).
import { LPC_ITEMS, LPC_PALETTES } from './lpc-data.js';

export const FRAME = 64;
const BASE = 'assets/lpc/';
const imgCache = new Map();
const layerCache = new Map();

function loadImage(name) {
  if (!imgCache.has(name)) imgCache.set(name, new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('missing sprite ' + name));
    im.src = BASE + name + '.png';
  }));
  return imgCache.get(name);
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Build a colour map {source rgb -> target rgb} for the given materials and chosen palette keys. */
function colorMap(mats, choice) {
  const map = [];
  mats.forEach(mat => {
    if (!mat || !LPC_PALETTES[mat]) return;
    const P = LPC_PALETTES[mat], want = choice[mat];
    if (!want || want === P.base || !P.colors[want]) return;
    const from = P.colors[P.base], to = P.colors[want];
    from.forEach((c, i) => { if (to[i]) map.push([hex(c), hex(to[i])]); });
  });
  return map;
}

async function recolored(name, mats, choice) {
  const map = colorMap(mats, choice);
  const key = name + '|' + JSON.stringify(map);
  if (layerCache.has(key)) return layerCache.get(key);
  const p = loadImage(name).then(im => {
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    if (map.length) {
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) {
        if (!a[i + 3]) continue;
        for (const [f, t] of map) {
          if (Math.abs(a[i] - f[0]) <= 1 && Math.abs(a[i + 1] - f[1]) <= 1 && Math.abs(a[i + 2] - f[2]) <= 1) { a[i] = t[0]; a[i + 1] = t[1]; a[i + 2] = t[2]; break; }
        }
      }
      x.putImageData(d, 0, 0);
    }
    return c;
  });
  layerCache.set(key, p);
  return p;
}

// ---------- options shown in the wardrobe ----------
export const SKIN_TONES = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'];
export const HAIR_COLORS = Object.keys(LPC_PALETTES.hair.colors);
export const EYE_COLORS = Object.keys(LPC_PALETTES.eye.colors);
export const CLOTH_COLORS = Object.keys(LPC_PALETTES.cloth.colors);
export const swatch = (mat, key) => { const c = LPC_PALETTES[mat].colors[key]; return c ? c[Math.min(c.length - 1, Math.floor(c.length * 0.6))] : '#888'; };
export const ITEMS = LPC_ITEMS;

export const DEFAULT_AVATAR = {
  body: 'male', skin: 'amber', eyes: 'brown', brows: 'thin',
  hair: 'messy', hairColor: 'dark_brown', beard: 'none',
  top: 'tshirt', topColor: 'blue', legs: 'pants', legsColor: 'charcoal', feet: 'sneakers', feetColor: 'black',
  cape: 'none', capeColor: 'red', neck: 'none', neckColor: 'red',
};
export const avatarOf = cfg => ({ ...DEFAULT_AVATAR, ...((cfg && cfg.avatar) || {}) });

const FACE_BY_STATUS = { ok: 'neutral', tired: 'neutral', sick: 'sad', ko: 'closed', happy: 'happy' };

/** Resolve an avatar to an ordered list of layers [{name, mats, z}]. */
function layersFor(av, status) {
  const b = av.body === 'female' ? 'female' : 'male';
  const choice = { body: av.skin, hair: av.hairColor, eye: av.eyes, cloth: null };
  const out = [];
  const add = (slot, name, clothColor) => {
    const it = ITEMS[slot] && ITEMS[slot][name];
    if (!it) return;
    it.layers.forEach(L => { const p = L.paths[b]; if (p) out.push({ name: p, z: L.z, mats: it.mats, choice: { ...choice, cloth: clothColor } }); });
  };
  add('body', 'body');
  add('head', b);
  add('face', FACE_BY_STATUS[status] || 'neutral');
  add('brows', av.brows);
  if (av.beard !== 'none' && b === 'male') add('beard', av.beard);
  add('hair', av.hair);
  add('legs', av.legs, av.legsColor);
  add('feet', av.feet, av.feetColor);
  add('top', av.top, av.topColor);
  if (av.cape !== 'none') add('cape', av.cape, av.capeColor);
  if (av.neck !== 'none') add('neck', av.neck, av.neckColor);
  return out.sort((a, b2) => a.z - b2.z);
}

/** Compose the avatar into one 128×64 strip (2 frames). */
export async function composeAvatar(av, status = 'ok') {
  const layers = layersFor({ ...DEFAULT_AVATAR, ...av }, status);
  const imgs = await Promise.all(layers.map(L => recolored(L.name, L.mats, L.choice).catch(() => null)));
  const c = document.createElement('canvas');
  c.width = FRAME * 2; c.height = FRAME;
  const x = c.getContext('2d');
  imgs.forEach(im => { if (im) x.drawImage(im, 0, 0); });
  if (status === 'sick' || status === 'ko') {
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3]) { const g = (a[i] + a[i + 1] + a[i + 2]) / 3; a[i] = g * 0.85; a[i + 1] = g * 1.0; a[i + 2] = g * 0.8; }
    x.putImageData(d, 0, 0);
  }
  return c;
}

/** Animated character canvas. Crops the 64×64 frame to the figure (x 16–48, y 4–64). */
export function avatarCanvas(av, status = 'ok', scale = 4) {
  const CX = 14, CY = 2, CW = 36, CH = 62;
  const c = document.createElement('canvas');
  c.width = CW * scale; c.height = CH * scale;
  c.className = 'px hero';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  composeAvatar(av, status).then(strip => {
    let f = 0;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      if (status === 'ko') {
        ctx.save(); ctx.translate(c.width / 2, c.height * 0.72); ctx.rotate(Math.PI / 2); ctx.translate(-c.width / 2, -c.height * 0.72);
      }
      ctx.drawImage(strip, f * FRAME + CX, CY, CW, CH, 0, 0, CW * scale, CH * scale);
      if (status === 'ko') ctx.restore();
    };
    draw();
    c._timer = setInterval(() => { if (!c.isConnected) return clearInterval(c._timer); f ^= 1; draw(); }, 700);
  });
  return c;
}

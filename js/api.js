import { API_URL } from './config.js';
import { lockState, lockKeys, sealJSON } from './lock.js';

const KEY = 'lrpg.key', CACHE = 'lrpg.cache', CACHE_ENC = 'lrpg.cache.enc';
let memKey = '', memCache = null;

// When the Face ID lock encrypts storage, the key and the data copy only exist in memory after unlocking.
export const auth = {
  get key() {
    if (memKey) return memKey;
    if (lockState().enc) return '';
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  },
  set(k) {
    memKey = k;
    if (lockState().enc) { sealJSON('lrpg.key.enc', k); return; }
    try { localStorage.setItem(KEY, k); } catch (e) { /* storage unavailable */ }
  },
  /** Load key + cache decrypted by the lock (called right after a successful unlock). */
  unlocked(k, cache) { memKey = k || ''; memCache = cache || null; },
  forget() { memKey = ''; memCache = null; },
  clear() {
    memKey = ''; memCache = null;
    try { [KEY, CACHE, CACHE_ENC, 'lrpg.key.enc'].forEach(x => localStorage.removeItem(x)); } catch (e) { /* ignore */ }
  },
};

export function cached() {
  if (memCache) return memCache;
  if (lockState().enc) return null;
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { return null; }
}
function remember(d) {
  memCache = d;
  if (lockState().enc) { if (lockKeys()) sealJSON(CACHE_ENC, d); return; }
  try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch (e) { /* full: skip */ }
}

/** Call a backend action. Every write action returns the latest data. */
export async function api(action, ...args) {
  if (!API_URL) throw new Error('The app is not configured yet.');
  const key = auth.key;
  if (!key) throw new Error('Not signed in.');
  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ key, action, args }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  } catch (e) { throw new Error('Can\'t reach the server. Check your connection.'); }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Unexpected server response (' + res.status + ').'); }
  if (!j.ok) { const err = new Error(j.error || 'Something went wrong.'); err.auth = /kunci/i.test(j.error || ''); throw err; }
  if (j.data && j.data.txns && j.data.cycle) remember(j.data);
  return j.data;
}

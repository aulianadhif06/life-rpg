import { API_URL } from './config.js';

const KEY = 'lrpg.key', CACHE = 'lrpg.cache';

export const auth = {
  get key() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
  set(k) { try { localStorage.setItem(KEY, k); } catch (e) { /* storage tidak tersedia */ } },
  clear() { try { localStorage.removeItem(KEY); localStorage.removeItem(CACHE); } catch (e) { /* abaikan */ } },
};

export function cached() {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { return null; }
}
function remember(d) {
  try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch (e) { /* penuh: lewati */ }
}

/** Panggil aksi backend. Semua aksi tulis mengembalikan data terbaru. */
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

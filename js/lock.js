// Face ID / Touch ID lock built on a passkey (WebAuthn) that lives only on this device.
// If the browser supports the passkey "PRF" extension, the passkey also produces a secret that encrypts
// the access key and the offline data copy (AES-GCM), so they can't be read from storage without Face ID.
// Without PRF the lock still asks for Face ID, but storage itself stays readable.

const LS = 'lrpg.lock';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

let aes = null;          // AES key in memory while unlocked
export const RELOCK_MS = 3 * 60 * 1000;

export function lockState() {
  try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; }
}
export const lockOn = () => !!lockState().cred;
export const lockKeys = () => aes;

export async function lockSupported() {
  try {
    return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { return false; }
}

const uvOk = cred => {
  const ad = new Uint8Array(cred.response.authenticatorData || []);
  return ad.length > 32 && (ad[32] & 0x04) !== 0;           // "user verified" flag
};

async function assert(st) {
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: rand(32), timeout: 60000, userVerification: 'required', rpId: location.hostname,
    allowCredentials: [{ type: 'public-key', id: unb64(st.cred), transports: ['internal', 'hybrid'] }],
    extensions: st.salt ? { prf: { eval: { first: unb64(st.salt) } } } : {},
  } });
  if (!cred || !uvOk(cred)) throw new Error('Face ID was not confirmed.');
  const r = cred.getClientExtensionResults && cred.getClientExtensionResults();
  const first = r && r.prf && r.prf.results && r.prf.results.first;
  return first ? crypto.subtle.importKey('raw', new Uint8Array(first).slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']) : null;
}

export async function sealJSON(name, value) {
  if (!aes) return;
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(value)));
  try { localStorage.setItem(name, JSON.stringify({ iv: b64(iv), ct: b64(ct) })); } catch (e) { /* full */ }
}
async function openJSON(name) {
  const raw = localStorage.getItem(name);
  if (!raw || !aes) return null;
  const { iv, ct } = JSON.parse(raw);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, aes, unb64(ct))));
}

/** Turn the lock on. Returns {enc} — whether storage is now encrypted. Two Face ID prompts: create + first unlock. */
export async function enableLock(currentKey, currentCache) {
  const salt = rand(32);
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32), timeout: 60000,
    rp: { name: 'Life RPG', id: location.hostname },
    user: { id: rand(16), name: 'Life RPG owner', displayName: 'Life RPG' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    extensions: { prf: {} },
  } });
  if (!cred) throw new Error('Face ID setup was cancelled.');
  const st = { cred: b64(cred.rawId), salt: b64(salt) };
  aes = await assert(st);                                    // confirms it works and fetches the PRF secret
  st.enc = !!aes;
  if (!st.enc) delete st.salt;
  localStorage.setItem(LS, JSON.stringify(st));
  if (st.enc) {
    await sealJSON('lrpg.key.enc', currentKey);
    if (currentCache) await sealJSON('lrpg.cache.enc', currentCache);
    localStorage.removeItem('lrpg.key'); localStorage.removeItem('lrpg.cache');
  }
  return { enc: st.enc };
}

/** Ask for Face ID. Returns {key, cache} decrypted (or nulls when storage isn't encrypted). */
export async function unlock() {
  const st = lockState();
  const k = await assert(st);
  if (st.enc) {
    if (!k) throw new Error('This device couldn\'t open the encrypted data.');
    aes = k;
    return { key: await openJSON('lrpg.key.enc'), cache: await openJSON('lrpg.cache.enc').catch(() => null) };
  }
  return { key: null, cache: null };
}

/** Turn the lock off (must be unlocked). Writes the key + cache back in plain storage. */
export function disableLock(currentKey, currentCache) {
  try {
    localStorage.removeItem(LS); localStorage.removeItem('lrpg.key.enc'); localStorage.removeItem('lrpg.cache.enc');
    if (currentKey) localStorage.setItem('lrpg.key', currentKey);
    if (currentCache) localStorage.setItem('lrpg.cache', JSON.stringify(currentCache));
  } catch (e) { /* ignore */ }
  aes = null;
}
export function wipeLock() { try { localStorage.removeItem(LS); } catch (e) { /* ignore */ } aes = null; }
export function relock() { aes = null; }


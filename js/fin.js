// Hitungan keuangan di sisi app. Aturan sama dengan backend Apps Script.

export const FIXED_CATS = ['Tempat tinggal', 'Tagihan & pulsa', 'Biaya & bunga bank'];
export const EXP_CATS = ['Makan & minum', 'Tempat tinggal', 'Transport', 'Tagihan & pulsa', 'Belanja harian', 'Belanja online', 'Hiburan & nongkrong', 'Kesehatan', 'Keluarga & sosial', 'Biaya & bunga bank', 'Mobil – BBM', 'Mobil – servis & part', 'Mobil – pajak & admin', 'Mobil – modif', 'Lainnya'];
export const INC_CATS = ['Gaji', 'THR & bonus', 'Sampingan', 'Cashback & refund', 'Hasil investasi', 'Lainnya'];
export const KIND_LABEL = { harian: 'Dompet harian', tabungan: 'Tabungan', investasi: 'Investasi', kredit: 'Kartu kredit' };

export const isLiving = c => !/^(Mobil|Hadiah)/.test(String(c || ''));
export const isFixed = c => FIXED_CATS.includes(c);
/** Pengeluaran "bebas" (bukan biaya tetap, bukan mobil): yang dinilai di game harian. */
export const isFree = c => isLiving(c) && !isFixed(c);

// ---------- tanggal (string YYYY-MM-DD, aman dari zona waktu) ----------
const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (s, k) => new Date(utc(s) + k * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const dow = s => new Date(utc(s)).getUTCDay();
export function todayLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export const addMonthKey = (k, n) => { let [y, m] = k.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const shortDate = s => Number(s.slice(8)) + ' ' + MON[Number(s.slice(5, 7)) - 1];
export const cycleName = k => MONTHS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4);

// ---------- uang ----------
const nf = new Intl.NumberFormat('id-ID');
export const rp = n => (n < 0 ? '-' : '') + 'Rp' + nf.format(Math.round(Math.abs(n || 0)));
export function rpShort(n) {
  const a = Math.abs(n || 0), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',') + 'M';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',').replace(',0', '') + 'jt';
  if (a >= 1e3) return s + Math.round(a / 1e3) + 'rb';
  return s + Math.round(a);
}
/** "25rb", "1,5jt", "250.000", "250000" → angka. */
export function parseAmount(v) {
  let s = String(v || '').toLowerCase().replace(/rp/g, '').replace(/\s/g, '');
  if (!s) return NaN;
  let mul = 1;
  if (/(jt|juta)$/.test(s)) { mul = 1e6; s = s.replace(/(jt|juta)$/, ''); }
  else if (/(rb|ribu|k)$/.test(s)) { mul = 1e3; s = s.replace(/(rb|ribu|k)$/, ''); }
  if (mul > 1) s = s.replace(',', '.');
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(s) * mul;
  return isFinite(n) ? Math.round(n) : NaN;
}

// ---------- siklus ----------
export function cycleOf(date, starts) {
  const keys = Object.keys(starts).sort();
  let c = null;
  for (const k of keys) { if (starts[k] <= date) c = k; else break; }
  return c || date.slice(0, 7);
}
export function cycleEnd(key, starts) {
  const n = starts[addMonthKey(key, 1)];
  return n ? addDays(n, -1) : null;
}

// ---------- saldo ----------
export function balances(accounts, txns) {
  const bal = {};
  accounts.forEach(a => bal[a.id] = Number(a.opening) || 0);
  txns.forEach(t => {
    const v = Number(t.amount) || 0;
    if (t.type === 'in' && t.account in bal) bal[t.account] += v;
    else if (t.type === 'out' && t.account in bal) bal[t.account] -= v;
    else if (t.type === 'tf') { if (t.account in bal) bal[t.account] -= v; if (t.toAccount in bal) bal[t.toAccount] += v; }
  });
  return bal;
}
export function worth(a, bal, txns) {
  if (a.kind === 'investasi' && Number(a.currentValue) > 0 && a.valueDate) {
    let s = Number(a.currentValue);
    txns.forEach(t => {
      if (t.date <= a.valueDate) return;
      if (t.type === 'in' && t.account === a.id) s += t.amount;
      else if (t.type === 'out' && t.account === a.id) s -= t.amount;
      else if (t.type === 'tf') { if (t.account === a.id) s -= t.amount; if (t.toAccount === a.id) s += t.amount; }
    });
    return s;
  }
  return bal[a.id] || 0;
}
export function netWorth(accounts, bal, txns) {
  let assets = 0, debt = 0;
  accounts.forEach(a => { const w = worth(a, bal, txns); if (a.kind === 'kredit') debt += Math.max(0, -w); else assets += w; });
  return { assets, debt, nw: assets - debt };
}
export function goalProgress(g, accounts, bal, txns) {
  let cur = 0;
  g.sources.forEach(x => { const a = accounts.find(a => a.id === x.acct); if (a) cur += Math.max(0, worth(a, bal, txns)) * x.pct / 100; });
  return Math.round(cur);
}

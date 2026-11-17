import { api, auth, cached } from './api.js';
import { compute, RULES } from './game.js';
import { heroCanvas, bossCanvas, carCanvas, iconCanvas } from './sprites.js';
import {
  EXP_CATS, INC_CATS, KIND_LABEL, isFree, rp, rpShort, parseAmount, todayLocal, addDays, daysBetween, dow, shortDate,
  cycleName, MONTHS, DAYS, balances, worth, netWorth, goalProgress,
} from './fin.js';

// ---------- util DOM ----------
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const [t, ...cls] = tag.split('.');
  const e = document.createElement(t || 'div');
  if (cls.length) e.className = cls.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const bar = (pct, cls = '') => h('div.bar.' + (cls || 'x'), null, h('i', { style: 'width:' + Math.max(0, Math.min(100, pct * 100)).toFixed(1) + '%' }));
const panel = (title, right, ...kids) => h('section.panel', null, title ? h('h2', null, title, right ? h('span.right', null, right) : null) : null, ...kids);

function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div.toast', { role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function floatText(text, color, i = 0) {
  const f = h('div.float', { style: `left:${30 + (i % 3) * 22}%;top:${160 + i * 8}px;color:${color}` }, text);
  document.body.append(f);
  setTimeout(() => f.remove(), 1500);
}

// ---------- state ----------
const S = { data: null, g: null, view: 'home', calMonth: null, calSel: null, busy: false, txSel: null };
const VIEWS = [['home', 'Markas', 'sword'], ['jurnal', 'Jurnal', 'star'], ['add', '', ''], ['arena', 'Budget', 'shield'], ['harta', 'Harta', 'chest']];
const LAST = 'lrpg.last';

const today = () => todayLocal();
function gameCfg() {
  try { return JSON.parse((S.data && S.data.settings && S.data.settings.game) || '{}') || {}; } catch (e) { return {}; }
}
const accounts = () => S.data.accounts;
const acct = id => accounts().find(a => a.id === id);

function recompute(announce) {
  const before = S.g;
  S.g = compute(S.data, gameCfg(), today());
  if (!announce || !before) return;
  const g = S.g;
  const fx = [];
  if (g.xp > before.xp) fx.push(['+' + (g.xp - before.xp) + ' XP', '#73eff7']);
  if (g.gold > before.gold) fx.push(['+' + (g.gold - before.gold) + ' G', '#ffcd75']);
  if (g.hp !== before.hp) fx.push([(g.hp > before.hp ? '+' : '') + (g.hp - before.hp) + ' HP', g.hp > before.hp ? '#a7f070' : '#ff7a8a']);
  fx.forEach(([t, c], i) => setTimeout(() => floatText(t, c, i), i * 180));
  if (g.hp < before.hp) document.querySelector('.hud')?.classList.add('shake');
}
function checkLevelUp() {
  let last = null;
  try { last = JSON.parse(localStorage.getItem(LAST) || 'null'); } catch (e) { /* abaikan */ }
  const g = S.g;
  try { localStorage.setItem(LAST, JSON.stringify({ level: g.level, hp: g.hp })); } catch (e) { /* abaikan */ }
  if (last && g.level > last.level) showLevelUp(g.level);
  else if (last && last.hp > 0 && g.hp === 0) toast('Hero pingsan. Catat & tahan belanja ' + RULES.reviveDays + ' hari untuk bangkit.', 5000);
}

async function act(fn, okMsg) {
  if (S.busy) return;
  S.busy = true; document.body.classList.add('busy');
  try {
    const d = await fn();
    if (d && d.txns) { S.data = d; recompute(true); render(); checkLevelUp(); }
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    if (e.auth) { auth.clear(); renderPair('Kunci tidak valid lagi. Hubungkan ulang.'); }
    else toast('⚠ ' + e.message, 4500);
    return false;
  } finally { S.busy = false; document.body.classList.remove('busy'); }
}

async function saveGame(patch) {
  const cfg = { ...gameCfg(), ...patch };
  return act(() => api('saveSettings', { game: JSON.stringify(cfg) }));
}

// ---------- boot ----------
async function boot() {
  const m = location.hash.match(/[#&]k=([a-f0-9]{20,})/i);
  if (m) { auth.set(m[1]); history.replaceState(null, '', location.pathname); }
  if (!auth.key) return renderPair();
  const c = cached();
  if (c) { S.data = c; recompute(false); render(); }
  else document.body.replaceChildren(h('div.pair', null, heroCanvas(1, 'ok', 8), h('h1', null, 'LIFE RPG'), h('p.muted', null, 'Memuat dunia…')));
  await refresh(!!c);
}
async function refresh(quiet) {
  const ok = await act(async () => {
    const d = await api('getData');
    if (!quiet || !S.data) { S.data = d; recompute(false); render(); } else { S.data = d; recompute(true); render(); }
    return null;
  });
  if (!ok) return;
  if (!gameCfg().start) await saveGame({ start: today(), name: gameCfg().name || 'Hero' });
  checkLevelUp();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.data && auth.key) refresh(true); });

function renderPair(msg) {
  const inp = h('input.in', { placeholder: 'Tempel kunci di sini', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const err = h('div.err', null, msg || '');
  const go = async () => {
    const k = inp.value.trim().replace(/^.*#k=/, '');
    if (!/^[a-f0-9]{20,}$/i.test(k)) { err.textContent = 'Format kunci tidak cocok.'; return; }
    auth.set(k); err.textContent = '';
    try { S.data = await api('getData'); recompute(false); render(); if (!gameCfg().start) await saveGame({ start: today(), name: 'Hero' }); checkLevelUp(); }
    catch (e) { auth.clear(); err.textContent = e.message; }
  };
  document.body.replaceChildren(h('div.pair', null,
    heroCanvas(1, 'ok', 8), h('h1', null, 'LIFE RPG'),
    h('p.muted', null, 'Keuangan & kesehatan lo, jadi petualangan.'),
    h('p.small', null, 'Ambil kunci di app Financial Planner lama → Pengaturan → Life RPG → Tampilkan kunci.'),
    inp, err, h('div.btns', null, h('button.btn.gold.block', { onclick: go }, 'MULAI'))));
}

// ---------- render utama ----------
function render() {
  if (!S.data || !S.g) return;
  const y = window.scrollY;
  const views = { home: viewHome, jurnal: viewJurnal, arena: viewArena, harta: viewHarta };
  document.body.replaceChildren(hud(), h('main', null, views[S.view]()), nav());
  window.scrollTo(0, y);
}
function go(v) { if (v === 'add') return openAdd(); S.view = v; window.scrollTo(0, 0); render(); }

function hud() {
  const g = S.g;
  return h('header.hud', null,
    h('div', null, h('div.lv', null, 'Lv ' + g.level), h('div.tiny.muted', null, g.title)),
    h('div.bars', null,
      h('div', null, h('div.lab', null, h('span', null, 'HP'), h('span.num', null, g.hp + '/' + g.hpMax)), bar(g.hp / g.hpMax, 'hp seg')),
      h('div', null, h('div.lab', null, h('span', null, 'XP'), h('span.num', null, g.xpIn + '/' + g.xpNeed)), bar(g.xpIn / g.xpNeed, 'xp seg thin'))),
    h('div.row', null,
      h('div.gold', null, iconCanvas('coin', 2), h('span.num', null, g.gold)),
      h('button.gear', { onclick: openSettings, 'aria-label': 'Pengaturan' }, iconCanvas('gear', 3))));
}
function nav() {
  return h('nav.nav', null, VIEWS.map(([id, label, ico]) => id === 'add'
    ? h('button.add', { onclick: () => openAdd(), 'aria-label': 'Catat transaksi' }, h('span.plus', null, '+'), h('span', null, 'Catat'))
    : h('button' + (S.view === id ? '.on' : ''), { onclick: () => go(id) }, iconCanvas(ico, 3), label)));
}

// ---------- MARKAS ----------
const STATUS_TXT = { ok: 'Sehat', tired: 'Lelah', sick: 'Sakit', ko: 'Pingsan' };
function missedDays() {
  const g = S.g, t = today(), out = [];
  const logged = new Set(S.data.txns.map(x => x.date));
  (S.data.journal || []).forEach(j => { if (j.kind === 'checkin') logged.add(j.date); });
  for (let i = 1; i <= 3; i++) { const d = addDays(t, -i); if (d >= g.start && !logged.has(d)) out.push(d); }
  return out;
}
function speech() {
  const g = S.g, miss = missedDays();
  if (g.status === 'ko') return 'Gue pingsan… butuh ' + (RULES.reviveDays - g.koGood) + ' hari bagus lagi (tercatat & di bawah jatah) buat bangun.';
  if (miss.length) return 'Ada ' + miss.length + ' hari belum tercatat. Isi atau check-in sebelum hilang dari jangkauan!';
  if (!g.today.logged) return 'Belum ada catatan hari ini. Catat, atau check-in kalau memang nggak ada transaksi.';
  if (g.today.allowance != null) {
    const left = g.today.allowance - g.today.free;
    return left >= 0 ? 'Jatah aman hari ini masih ' + rpShort(left) + '. Tahan, boss lagi lengah!' : 'Jatah hari ini lewat ' + rpShort(-left) + '. Besok kita balas.';
  }
  return 'Atur budget di tab Budget biar boss bisa diserang.';
}
function viewHome() {
  const g = S.g, cfg = gameCfg(), t = g.today;
  const stage = h('div.stage', null, h('div.stars'), heroCanvas(g.level, g.status, 7));
  const scene = h('section.panel.scene', null, stage,
    h('div.hero-name', null, cfg.name || 'Hero', h('span.status-chip.' + g.status, null, STATUS_TXT[g.status])),
    h('div.small.muted', null, 'Lv ' + g.level + ' · ' + g.title + ' · Streak ' + g.streak + ' hari'),
    h('div.bubble', null, speech()));

  const todayP = panel('Hari ini', shortDate(t.date),
    t.allowance != null ? [
      h('div.kv', null, h('span', null, 'Belanja bebas'), h('b.num', null, rp(t.free) + ' / ' + rp(Math.round(t.allowance)))),
      bar(t.allowance ? t.free / t.allowance : (t.free ? 1 : 0), t.free > t.allowance ? 'bad' : t.free > t.allowance * .8 ? 'warn' : ''),
    ] : h('div.small.muted', null, 'Budget siklus ini belum diatur.'),
    h('div.btns', null,
      h('button.btn.gold', { onclick: () => openAdd() }, '+ Catat'),
      !t.logged ? h('button.btn.ghost', { onclick: () => checkin(t.date) }, 'Check-in: tanpa transaksi') : null));

  const miss = missedDays();
  const missP = miss.length ? panel('Hari bolong', null,
    h('p.small.muted', null, 'Hari tanpa catatan bikin HP turun ' + (-RULES.missed.hp) + '. Kalau memang nggak ada transaksi, check-in aja.'),
    h('div.list', null, miss.map(d => h('div.item', null, h('div.grow', null, h('div.t1', null, DAYS[dow(d)] + ', ' + shortDate(d))),
      h('button.btn.sm.ghost', { onclick: () => openAdd({ date: d }) }, 'Catat'),
      h('button.btn.sm', { onclick: () => checkin(d) }, 'Check-in'))))) : null;

  const questP = panel('Quest harian', 'reset tiap tengah malam',
    t.quests.map(q => h('div.quest' + (q.done ? '.done' : ''), null,
      h('div.tick', null, q.done ? iconCanvas('check', 2) : iconCanvas(q.icon, 2)),
      h('div.grow', null, h('div.q-name', null, q.name), h('div.small.muted', null, q.desc + (q.eod ? ' · dinilai akhir hari' : ''))),
      h('div.q-rew', null, '+' + q.xp + ' XP', h('br'), '+' + q.gold + ' G'))));

  const b = g.boss;
  const bossP = panel('Boss siklus', cycleName(b.key),
    h('div.boss-wrap', null, h('div.boss', null, bossCanvas(b.idx, 5)),
      h('div.grow', null,
        h('div.t1', { style: 'font-weight:700;font-size:18px' }, b.name),
        h('div.kv', null, h('span', null, 'HP boss'), h('b.num', null, Math.max(0, b.max - b.hits) + '/' + b.max)),
        bar((b.max - b.hits) / b.max, 'boss seg'),
        h('div.kv', null, h('span', null, 'Hari'), h('b.num', null, b.day + '/' + b.len + (b.end ? ' · s.d. ' + shortDate(b.end) : ''))))),
    h('p.small.muted', null, 'Tiap hari tercatat & belanja bebas ≤ jatah = 1 serangan (hari tanpa jajan = critical, 2 serangan). Kalahkan boss sebelum siklus habis dan tutup siklus di bawah budget untuk +' + RULES.boss.xp + ' XP & +' + RULES.boss.gold + ' G.' + (b.partial ? ' Siklus pertama dihitung sejak game dimulai.' : '')));

  const logP = panel('Catatan petualangan', null,
    g.events.length ? h('div', null, g.events.slice(0, 10).map(e => h('div.ev', null, h('span.d', null, shortDate(e.date)), h('span', null, e.text),
      h('span.fx', null, e.xp ? h('span.cyan', null, '+' + e.xp + 'XP ') : null, e.gold ? h('span.gold', null, '+' + e.gold + 'G ') : null,
        e.hp ? h('span' + (e.hp > 0 ? '.green' : '.red'), null, (e.hp > 0 ? '+' : '') + e.hp + 'HP') : null)))) : h('div.empty', null, 'Petualangan baru dimulai.'));

  return h('div', null, scene, todayP, missP, questP, bossP, logP);
}
function checkin(date) {
  return act(() => api('logAdd', [{ date, kind: 'checkin', data: { note: 'tanpa transaksi' } }]), 'Check-in ' + shortDate(date) + ' tersimpan');
}

// ---------- CATAT ----------
function modal(title, body, onClose) {
  const ov = h('div.ov', { onclick: e => { if (e.target === ov) close(); } });
  const close = () => { ov.remove(); onClose && onClose(); };
  ov.append(h('div.sheet', { role: 'dialog', 'aria-label': title }, h('h3', null, title, h('button.x', { onclick: close, 'aria-label': 'Tutup' }, '✕')), body(close)));
  document.body.append(ov);
  return close;
}
function acctOptions(sel, filter) {
  return accounts().filter(filter || (() => true)).map(a => h('option', { value: a.id, selected: a.id === sel }, a.name + (a.kind === 'kredit' ? ' (kartu)' : '')));
}
function openAdd(pre = {}) {
  let type = pre.type || 'out', cat = pre.category || '';
  const harian = accounts().filter(a => a.kind === 'harian');
  const last = (() => { try { return localStorage.getItem('lrpg.acct'); } catch (e) { return null; } })();
  const defAcct = (last && acct(last)) ? last : (harian[0] || accounts()[0]).id;
  modal('Catat transaksi', close => {
    const amt = h('input.in.big', { inputmode: 'decimal', placeholder: '0', autocomplete: 'off', value: pre.amount || '' });
    const hint = h('div.small.muted', { style: 'text-align:right;min-height:18px' });
    amt.addEventListener('input', () => { const n = parseAmount(amt.value); hint.textContent = isFinite(n) && n > 0 ? rp(n) : ''; });
    const tabs = h('div.tabs');
    const catBox = h('div.chips'), catWrap = h('div', null, h('label.f', null, 'Kategori'), catBox);
    const from = h('select.in', null, acctOptions(defAcct));
    const to = h('select.in', null, acctOptions(null));
    const toWrap = h('div', null, h('label.f', null, 'Ke akun'), to);
    const date = h('input.in', { type: 'date', value: pre.date || today(), max: today() });
    const note = h('input.in', { placeholder: 'mis. makan siang, grab', maxlength: 120 });
    const err = h('div.err');
    const fromLabel = h('label.f', null, 'Dari akun');
    const paint = () => {
      tabs.replaceChildren(...[['out', 'Keluar'], ['in', 'Masuk'], ['tf', 'Pindah']].map(([k, l]) => h('button' + (type === k ? '.on' : ''), { type: 'button', onclick: () => { type = k; cat = ''; paint(); } }, l)));
      const cats = type === 'in' ? INC_CATS : EXP_CATS;
      catBox.replaceChildren(...cats.map(c => h('button' + (cat === c ? '.on' : ''), { type: 'button', onclick: () => { cat = c; paint(); } }, c)));
      catWrap.hidden = type === 'tf'; toWrap.hidden = type !== 'tf';
      fromLabel.textContent = type === 'in' ? 'Masuk ke akun' : type === 'tf' ? 'Dari akun' : 'Bayar pakai';
    };
    paint();
    const save = h('button.btn.gold.block', { type: 'button', onclick: async () => {
      const n = parseAmount(amt.value);
      if (!(n > 0)) { err.textContent = 'Isi jumlahnya dulu.'; amt.focus(); return; }
      if (type !== 'tf' && !cat) { err.textContent = 'Pilih kategori.'; return; }
      if (type === 'tf' && to.value === from.value) { err.textContent = 'Akun tujuan harus beda.'; return; }
      if (!date.value || date.value > today()) { err.textContent = 'Tanggal tidak valid.'; return; }
      try { localStorage.setItem('lrpg.acct', from.value); } catch (e) { /* abaikan */ }
      save.disabled = true; err.textContent = '';
      const ok = await act(() => api('addTxns', [{ type, amount: n, account: from.value, toAccount: type === 'tf' ? to.value : '', category: type === 'tf' ? '' : cat, date: date.value, note: note.value.trim(), src: 'rpg' }]), 'Tersimpan: ' + rp(n));
      save.disabled = false;
      if (ok) close();
    } }, 'SIMPAN');
    setTimeout(() => amt.focus(), 50);
    return h('div', null, tabs, h('label.f', null, 'Jumlah (bisa ketik 25rb / 1,5jt)'), amt, hint, catWrap, fromLabel, from, toWrap,
      h('div.grid2', null, h('div', null, h('label.f', null, 'Tanggal'), date), h('div', null, h('label.f', null, 'Catatan'), note)), err, h('div.btns', null, save));
  });
}

// ---------- JURNAL ----------
function viewJurnal() {
  const t = today();
  const mk = S.calMonth || t.slice(0, 7);
  S.calSel = S.calSel || t;
  const [Y, M] = mk.split('-').map(Number);
  const first = mk + '-01', nDays = new Date(Y, M, 0).getDate();
  const byDay = {};
  S.data.txns.forEach(x => { if (x.date.startsWith(mk)) (byDay[x.date] = byDay[x.date] || []).push(x); });
  const checks = {};
  (S.data.journal || []).forEach(j => { if (j.kind === 'checkin') checks[j.date] = j; });
  const cells = DAYS.map((d, i) => h('div.h', null, DAYS[(i + 1) % 7]));
  const lead = (dow(first) + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(h('div.c.out'));
  let mOut = 0, mIn = 0;
  for (let i = 1; i <= nDays; i++) {
    const d = mk + '-' + String(i).padStart(2, '0');
    const list = byDay[d] || [];
    const out = list.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);
    const inc = list.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
    mOut += out; mIn += inc;
    const logged = list.length || checks[d];
    const cls = ['c', d === t ? 'today' : '', d === S.calSel ? 'sel' : '', d > t ? 'out' : logged ? 'good' : (d >= S.g.start && d < t ? 'miss' : '')].filter(Boolean).join('.');
    cells.push(h('button.' + cls, { onclick: d > t ? null : () => { S.calSel = d; render(); } }, h('span', null, i),
      out ? h('span.v', null, '-' + rpShort(out)) : inc ? h('span.v.in', null, '+' + rpShort(inc)) : checks[d] ? h('span.v.in', null, '✓') : null));
  }
  const prevM = () => { const p = new Date(Y, M - 2, 1); S.calMonth = p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0'); render(); };
  const nextM = () => { const p = new Date(Y, M, 1); S.calMonth = p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0'); render(); };
  const calP = panel(MONTHS[M - 1] + ' ' + Y, null,
    h('div.row.between', { style: 'margin-bottom:10px' }, h('button.btn.sm.ghost', { onclick: prevM }, '◀'),
      h('div.small.num', null, h('span.red', null, '-' + rpShort(mOut)), '  ', h('span.green', null, '+' + rpShort(mIn))),
      h('button.btn.sm.ghost', { onclick: nextM, disabled: mk >= t.slice(0, 7) }, '▶')),
    h('div.cal', null, cells),
    h('div.legend', null, h('span', { style: '--c:#23403a' }, 'tercatat'), h('span', { style: '--c:#3d2a3a' }, 'bolong'), h('span', { style: '--c:#ffcd75' }, 'hari ini')));

  const sel = S.calSel, list = S.data.txns.filter(x => x.date === sel).sort((a, b) => b.createdAt - a.createdAt);
  const ck = checks[sel];
  const dayP = panel(DAYS[dow(sel)] + ', ' + shortDate(sel), null,
    list.length || ck ? h('div.list', null,
      ck ? h('div.item', null, iconCanvas('check', 2), h('div.grow', null, h('div.t1', null, 'Check-in'), h('div.t2', null, 'Tidak ada transaksi')),
        h('button.btn.sm.ghost', { onclick: () => act(() => api('logDelete', ck.id), 'Check-in dihapus') }, 'Hapus')) : null,
      list.map(x => txItem(x))) : h('div.empty', null, 'Belum ada catatan.'),
    sel <= t ? h('div.btns', null, h('button.btn.gold.sm', { onclick: () => openAdd({ date: sel }) }, '+ Catat di tanggal ini'),
      !list.length && !ck ? h('button.btn.sm.ghost', { onclick: () => checkin(sel) }, 'Check-in') : null) : null);
  return h('div', null, calP, dayP);
}
function txItem(x) {
  const a = acct(x.account), b = x.toAccount ? acct(x.toAccount) : null;
  const sign = x.type === 'in' ? '+' : x.type === 'out' ? '-' : '';
  const title = x.type === 'tf' ? 'Pindah dana' : x.category;
  const sub = [x.note, x.type === 'tf' ? (a ? a.name : '?') + ' → ' + (b ? b.name : '?') : a ? a.name : ''].filter(Boolean).join(' · ');
  const open = S.txSel === x.id;
  return h('div.item', { onclick: () => { S.txSel = open ? null : x.id; render(); }, style: 'cursor:pointer' },
    h('div.dot', { style: 'background:' + (x.type === 'in' ? '#a7f070' : x.type === 'tf' ? '#41a6f6' : isFree(x.category) ? '#ef7d57' : '#94b0c2') }),
    h('div.grow', null, h('div.t1', null, title), h('div.t2', null, sub || '—')),
    open ? h('button.btn.sm.red', { onclick: e => { e.stopPropagation(); act(() => api('deleteTxn', x.id), 'Transaksi dihapus'); S.txSel = null; } }, 'Hapus')
      : h('div.amt' + (x.type === 'in' ? '.green' : ''), null, sign + rp(x.amount)));
}

// ---------- BUDGET / ARENA ----------
const ST_CLS = { over: 'bad', bahaya: 'bad', waspada: 'warn', aman: '' };
const ST_TXT = { over: 'TEMBUS', bahaya: 'BAHAYA', waspada: 'WASPADA', aman: 'AMAN' };
function viewArena() {
  const B = S.data.budget, a = B.advisor, g = S.g, cur = S.data.cycle.cur;
  const out = [];
  if (B.closePending) out.push(closeCard(B.closePending));
  if (!a || !a.ready) {
    out.push(panel('Budget ' + cycleName(cur), null, h('p.muted', null, 'Budget siklus ini belum diatur. Boss tidak bisa diserang tanpa budget.'),
      h('div.btns', null, h('button.btn.gold', { onclick: openBudget }, 'Atur budget'))));
    return h('div', null, out);
  }
  const elapsed = a.day / a.days;
  out.push(panel('Siklus ' + cycleName(cur), shortDate(a.start) + ' – ' + shortDate(a.end),
    h('div.kv', null, h('span', null, 'Terpakai'), h('b.num', null, rp(a.used) + ' / ' + rp(a.budget))),
    h('div.bar' + (a.used > a.budget ? '.bad' : a.used / a.budget > elapsed + .05 ? '.warn' : ''), null,
      h('i', { style: 'width:' + Math.min(100, a.used / Math.max(1, a.budget) * 100) + '%' }), h('span.mark', { style: 'left:' + (elapsed * 100) + '%' })),
    h('div.kv', null, h('span.muted', null, 'Hari ' + a.day + '/' + a.days + ' (garis putih = posisi hari ini)'), h('span.muted', null, 'sisa ' + a.daysLeft + ' hari')),
    h('div.kv', null, h('span', null, 'Jatah aman per hari'), h('b.num.gold', null, rp(a.perDay))),
    h('div.btns', null, h('button.btn.sm.ghost', { onclick: openBudget }, 'Atur budget'))));

  out.push(panel('Kategori', null, h('div.list', null, a.items.map(i => h('div.item', { style: 'display:block' },
    h('div.row.between', null, h('span.t1', null, i.cat), h('span.small' + (i.status === 'aman' ? '.green' : '.red'), null, ST_TXT[i.status])),
    h('div.kv', null, h('span.muted', null, rp(i.used) + ' / ' + rp(i.budget) + (i.cut ? ' (dipotong ' + rpShort(i.cut) + ')' : '')),
      h('span.muted', null, i.fixed ? 'tetap' : i.status === 'over' ? 'lewat ' + rpShort(i.used - i.budget) : rpShort(i.perDay) + '/hari')),
    bar(i.budget ? i.used / i.budget : 1, ST_CLS[i.status] + ' thin')))),
  a.unbudgeted.length ? h('div.small.muted', { style: 'margin-top:8px' }, 'Tanpa budget: ' + a.unbudgeted.map(u => u.cat + ' ' + rpShort(u.used)).join(', ')) : null));

  if (a.actions.length) out.push(panel('Saran', null, a.actions.slice(0, 4).map(x => h('p.small', { style: 'margin:0 0 8px' }, '▸ ' + x.text))));

  const ch = g.challenges;
  out.push(panel('Tantangan', 'hadiah ' + Math.round((gameCfg().share ?? RULES.challenge.share) * 100) + '% dari yang dihemat',
    h('p.small.muted', null, 'Ambil tantangan di ' + RULES.challenge.acceptDays + ' hari pertama siklus. Berhasil = +' + RULES.challenge.xp + ' XP, +' + RULES.challenge.gold + ' G, dan sebagian uang yang dihemat masuk Dana hadiah (boleh dipakai bebas).'),
    ch.accepted.map(c => h('div.quest', null, h('div.tick', null, iconCanvas('sword', 2)),
      h('div.grow', null, h('div.q-name', null, c.cat + ' ≤ ' + rp(c.limit)), bar(c.used / c.limit, c.used > c.limit ? 'bad thin' : 'thin'),
        h('div.small.muted', null, 'Terpakai ' + rp(c.used) + (c.used > c.limit ? ' · gagal' : ' · sisa ' + rp(c.limit - c.used)))))),
    ch.offers.map(o => h('div.quest', null, h('div.tick', null, iconCanvas('bolt', 2)),
      h('div.grow', null, h('div.q-name', null, o.cat + ' ≤ ' + rp(o.limit)), h('div.small.muted', null, 'Budget ' + rp(o.budget) + '. Hemat ' + rp(o.budget - o.limit) + '.')),
      h('button.btn.sm.gold', { onclick: () => act(() => api('logAdd', [{ date: today(), kind: 'challenge', data: { cycle: g.boss.key, cat: o.cat, limit: o.limit } }]), 'Tantangan diterima!') }, 'Terima'))),
    !ch.accepted.length && !ch.offers.length ? h('div.empty', null, ch.partial ? 'Tantangan pertama dibuka di awal siklus berikutnya (siklus ini sudah berjalan waktu game dimulai).' : ch.open ? 'Belum ada usulan.' : 'Pendaftaran tantangan siklus ini sudah tutup. Tunggu siklus berikutnya.') : null));
  return h('div', null, out);
}
function closeCard(p) {
  const to = h('select.in', null, acctOptions(null, a => a.kind === 'tabungan' || a.kind === 'investasi'));
  const from = h('select.in', null, acctOptions(null, a => a.kind === 'harian'));
  const left = Math.max(0, p.leftover);
  return panel('Tutup siklus ' + cycleName(p.cycle), null,
    h('div.kv', null, h('span', null, 'Terpakai'), h('b.num', null, rp(p.used) + ' / ' + rp(p.budget))),
    h('div.kv', null, h('span', null, p.leftover >= 0 ? 'Sisa' : 'Lewat'), h('b.num' + (p.leftover >= 0 ? '.green' : '.red'), null, rp(Math.abs(p.leftover)))),
    p.over.length ? h('p.small.muted', null, 'Kategori tembus (budget siklus ini dipotong): ' + p.over.map(o => o.cat + ' ' + rpShort(o.over)).join(', ')) : null,
    left > 0 ? h('div', null, h('label.f', null, 'Tabung sisa dari'), from, h('label.f', null, 'ke'), to) : null,
    h('div.btns', null,
      left > 0 ? h('button.btn.green', { onclick: () => act(() => api('closeCycle', p.cycle, { action: 'save', amount: left, from: from.value, to: to.value }), 'Sisa ditabung!') }, 'Tabung ' + rpShort(left)) : null,
      h('button.btn.ghost', { onclick: () => act(() => api('closeCycle', p.cycle, { action: 'skip' }), 'Siklus ditutup') }, left > 0 ? 'Lewati' : 'Tutup siklus')));
}
function openBudget() {
  const B = S.data.budget, cur = S.data.cycle.cur, p = B.plan[cur];
  const base = {};
  if (p) Object.entries(p.lines).forEach(([c, l]) => base[c] = l.base);
  if (!p && B.suggestion && B.suggestion.ready) B.suggestion.lines.forEach(l => base[l.cat] = l.suggested);
  modal('Budget ' + cycleName(cur), close => {
    const cap = h('input.in', { inputmode: 'decimal', value: B.cap ? String(B.cap) : '' });
    const rows = EXP_CATS.filter(c => !/^Mobil/.test(c)).map(c => {
      const i = h('input.in', { inputmode: 'decimal', placeholder: '—', value: base[c] ? String(base[c]) : '' });
      return [c, i];
    });
    const total = h('div.kv');
    const upd = () => { const s = rows.reduce((a, [, i]) => a + (parseAmount(i.value) || 0), 0); const c = parseAmount(cap.value) || 0; total.replaceChildren(h('span', null, 'Total'), h('b.num' + (c && s > c ? '.red' : ''), null, rp(s) + (c ? ' / target ' + rp(c) : ''))); };
    [cap, ...rows.map(r => r[1])].forEach(i => i.addEventListener('input', upd)); upd();
    const err = h('div.err');
    const save = h('button.btn.gold.block', { onclick: async () => {
      const lines = rows.map(([c, i]) => ({ cat: c, amount: parseAmount(i.value) || 0 })).filter(l => l.amount > 0);
      if (!lines.length) { err.textContent = 'Isi minimal satu kategori.'; return; }
      if (await act(() => api('saveBudget', cur, lines, parseAmount(cap.value) || 0), 'Budget tersimpan')) close();
    } }, 'SIMPAN BUDGET');
    return h('div', null, h('p.small.muted', null, 'Kosongkan kategori yang tidak dibatasi. Potongan dari kategori yang tembus siklus lalu dihitung otomatis.'),
      h('label.f', null, 'Target total (opsional)'), cap,
      rows.map(([c, i]) => h('div', null, h('label.f', null, c + (p && p.lines[c] && p.lines[c].cut ? ' · dipotong ' + rpShort(p.lines[c].cut) : '')), i)),
      h('div', { style: 'margin-top:12px' }, total), err, h('div.btns', null, save));
  });
}

// ---------- HARTA ----------
function viewHarta() {
  const d = S.data, bal = balances(d.accounts, d.txns), nw = netWorth(d.accounts, bal, d.txns), g = S.g;
  const out = [];
  out.push(panel('Kekayaan bersih', null, h('div.big-num.num', null, rp(nw.nw)),
    h('div.kv', null, h('span.muted', null, 'Aset'), h('span.num', null, rp(nw.assets))),
    h('div.kv', null, h('span.muted', null, 'Utang kartu'), h('span.num.red', null, rp(nw.debt)))));
  out.push(panel('Dana hadiah', null,
    h('div.row', null, iconCanvas('chest', 4), h('div.grow', null, h('div.big-num.num.gold', null, rp(g.fund)),
      h('div.small.muted', null, 'Uang hasil tantangan. Boleh dipakai bebas tanpa merusak budget.'))),
    g.fund > 0 ? h('div.btns', null, h('button.btn.gold', { onclick: openUseFund }, 'Pakai')) : null));
  const goals = (d.goals || []).filter(x => x.show);
  if (goals.length) out.push(panel('Garasi & target', null, goals.map(x => {
    const cur = goalProgress(x, d.accounts, bal, d.txns), pct = x.target ? cur / x.target : 0;
    const monthsLeft = x.targetDate ? Math.max(1, Math.ceil(daysBetween(today(), x.targetDate) / 30.4)) : null;
    const need = monthsLeft ? Math.max(0, Math.ceil((x.target - cur) / monthsLeft / 10000) * 10000) : null;
    return h('div', { style: 'margin-bottom:14px' },
      h('div.row.between', null, h('b', null, x.name), h('span.small.num', null, Math.round(pct * 100) + '%')),
      /mobil|car|ferio|civic/i.test(x.name) ? h('div.goal-car', null, carCanvas(pct, 8)) : null,
      bar(pct, 'seg'),
      h('div.kv', null, h('span.muted', null, rp(cur) + ' / ' + rp(x.target)), h('span.muted', null, x.targetDate ? 's.d. ' + shortDate(x.targetDate) + ' ' + x.targetDate.slice(0, 4) : '')),
      need != null ? h('div.small.muted', null, 'Perlu ±' + rp(need) + '/bulan supaya tepat waktu.') : null);
  })));
  const groups = ['harian', 'tabungan', 'investasi', 'kredit'];
  out.push(panel('Inventori akun', null, groups.map(k => {
    const list = d.accounts.filter(a => a.kind === k);
    if (!list.length) return null;
    return h('div', null, h('div.tiny.muted', { style: 'margin-top:8px' }, KIND_LABEL[k].toUpperCase()),
      h('div.list', null, list.map(a => {
        const w = worth(a, bal, d.txns);
        return h('div.item', null, h('div.grow', null, h('div.t1', null, a.name),
          a.kind === 'kredit' && a.limit ? h('div.t2', null, 'Terpakai ' + Math.round(Math.max(0, -w) / a.limit * 100) + '% dari limit ' + rpShort(a.limit)) : null,
          a.kind === 'investasi' && a.valueDate ? h('div.t2', null, 'Nilai per ' + shortDate(a.valueDate)) : null),
        h('div.amt.num' + (w < 0 ? '.red' : ''), null, rp(w)));
      })));
  })));
  return h('div', null, out);
}
function openUseFund() {
  const g = S.g;
  modal('Pakai dana hadiah', close => {
    const amt = h('input.in.big', { inputmode: 'decimal', placeholder: '0' });
    const from = h('select.in', null, acctOptions(null, a => a.kind === 'harian' || a.kind === 'kredit'));
    const note = h('input.in', { placeholder: 'mis. makan enak', maxlength: 80 });
    const err = h('div.err');
    return h('div', null, h('p.small.muted', null, 'Tersedia ' + rp(g.fund) + '. Dicatat sebagai kategori "Hadiah", tidak dihitung ke budget bebas.'),
      h('label.f', null, 'Jumlah'), amt, h('label.f', null, 'Bayar pakai'), from, h('label.f', null, 'Untuk apa'), note, err,
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => {
        const n = parseAmount(amt.value);
        if (!(n > 0)) { err.textContent = 'Isi jumlah.'; return; }
        if (n > g.fund) { err.textContent = 'Melebihi dana hadiah.'; return; }
        const ok = await act(async () => {
          await api('addTxns', [{ type: 'out', amount: n, account: from.value, category: 'Hadiah', note: note.value.trim() || 'Dana hadiah', date: today(), src: 'reward' }]);
          return api('logAdd', [{ date: today(), kind: 'reward_use', data: { amount: n, note: note.value.trim() } }]);
        }, 'Selamat menikmati hadiahnya!');
        if (ok) close();
      } }, 'PAKAI')));
  });
}

// ---------- pengaturan & level up ----------
function openSettings() {
  const cfg = gameCfg();
  modal('Pengaturan', close => {
    const name = h('input.in', { value: cfg.name || 'Hero', maxlength: 20 });
    const share = h('input.in', { inputmode: 'numeric', value: String(Math.round((cfg.share ?? RULES.challenge.share) * 100)) });
    return h('div', null,
      h('label.f', null, 'Nama hero'), name,
      h('label.f', null, 'Porsi dana hadiah dari uang yang dihemat (%)'), share,
      h('div.btns', null, h('button.btn.gold', { onclick: async () => {
        const s = Math.max(0, Math.min(50, Number(share.value) || 0)) / 100;
        if (await saveGame({ name: name.value.trim() || 'Hero', share: s })) close();
      } }, 'Simpan')),
      h('p.small.muted', { style: 'margin-top:18px' }, 'Petualangan dimulai ' + shortDate(S.g.start) + ' ' + S.g.start.slice(0, 4) + '. Data tersimpan di Google Sheet lo; app ini hanya menyimpan salinan di HP ini.'),
      h('div.btns', null,
        h('button.btn.ghost', { onclick: () => { close(); refresh(true); } }, 'Muat ulang data'),
        h('button.btn.red', { onclick: () => { if (confirm('Putuskan app ini dari data lo? Perlu kunci lagi untuk masuk.')) { auth.clear(); location.reload(); } } }, 'Putuskan')));
  });
}
function showLevelUp(lvl) {
  modal('', close => h('div.lvlup', null, h('div.big', null, 'LEVEL UP!'), h('div', { style: 'display:flex;justify-content:center;margin:14px 0' }, heroCanvas(lvl, 'ok', 8)),
    h('p', null, 'Sekarang Lv ' + lvl + ' · ' + S.g.title),
    [5, 10, 15, 20].includes(lvl) ? h('p.gold', null, 'Perlengkapan baru terbuka!') : null,
    h('button.btn.gold', { onclick: close }, 'MANTAP')));
}

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__lrpg = { S, render, recompute };
boot();

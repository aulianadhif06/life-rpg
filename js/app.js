import { api, auth, cached } from './api.js';
import { CONNECT_URL } from './config.js';
import { compute, RULES } from './game.js';
import { bossCanvas, carCanvas, iconCanvas } from './sprites.js';
import { EX, WEEKDAYS, SPLIT_TXT, recommend, schedOn, sessionOn, prTable, lastFor, volume, setCount, weekStart, wdOf, fmtRest } from './train.js';
import { avatarCanvas, avatarOf, DEFAULT_AVATAR, HAIRS, TOPS, BOTTOMS, SKIN_TONES, HAIR_COLORS, swatch } from './hero.js';
import {
  EXP_CATS, INC_CATS, KIND_LABEL, isFree, rp, rpShort, parseAmount, todayLocal, addDays, daysBetween, dow, shortDate,
  cycleName, MONTHS, DAYS, balances, worth, netWorth, goalProgress, catLabel,
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
const VIEWS = [['home', 'Home', 'sword'], ['jurnal', 'Journal', 'star'], ['add', '', ''], ['train', 'Train', 'dumbbell'], ['arena', 'Budget', 'shield'], ['harta', 'Vault', 'chest']];
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
  else if (last && last.hp > 0 && g.hp === 0) toast('Your hero is knocked out. Log and stay within budget for ' + RULES.reviveDays + ' days to revive.', 5000);
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
    if (e.auth) { auth.clear(); renderPair('Your session has ended. Please sign in again.'); }
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
  else document.body.replaceChildren(h('div.pair', null, avatarCanvas(DEFAULT_AVATAR, 'ok', 3), h('h1', null, 'LIFE RPG'), h('p.muted', null, 'Loading your world…')));
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
  const inp = h('input.in', { placeholder: 'Paste access key', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const err = h('div.err', null, msg || '');
  const useKey = async () => {
    const k = inp.value.trim().replace(/^.*#k=/, '');
    if (!/^[a-f0-9]{20,}$/i.test(k)) { err.textContent = 'That key doesn\'t look right.'; return; }
    auth.set(k); err.textContent = '';
    try { S.data = await api('getData'); recompute(false); render(); if (!gameCfg().start) await saveGame({ start: today(), name: 'Hero' }); checkLevelUp(); }
    catch (e) { auth.clear(); err.textContent = e.message; }
  };
  document.body.replaceChildren(h('div.pair', null,
    avatarCanvas(DEFAULT_AVATAR, 'ok', 3), h('h1', null, 'LIFE RPG'),
    h('p.muted', null, 'Your money and health, played as an adventure.'),
    h('div.btns', null, h('button.btn.gold.block', { onclick: () => { location.href = CONNECT_URL; } }, 'CONTINUE WITH GOOGLE')),
    err,
    h('p.small.muted', { style: 'margin-top:18px' }, 'You\'ll confirm with the Google account that owns your Financial Planner sheet, then come straight back here.'),
    h('details', { style: 'margin-top:22px;text-align:left' }, h('summary.small.muted', null, 'Use an access key instead'),
      h('div', { style: 'margin-top:10px' }, inp, h('div.btns', null, h('button.btn.ghost.block', { onclick: useKey }, 'Connect'))))));
}

// ---------- render utama ----------
function render() {
  if (!S.data || !S.g) return;
  const y = window.scrollY;
  const views = { home: viewHome, jurnal: viewJurnal, train: viewTrain, arena: viewArena, harta: viewHarta };
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
      h('div.gold', { title: 'Gold' }, iconCanvas('coin', 2), h('span.num', null, goldLeft())),
      h('button.gear', { onclick: openSettings, 'aria-label': 'Settings' }, iconCanvas('gear', 3))));
}
function nav() {
  return h('nav.nav', null, VIEWS.map(([id, label, ico]) => id === 'add'
    ? h('button.add', { onclick: () => openAdd(), 'aria-label': 'Add transaction' }, h('span.plus', null, '+'), h('span', null, 'Add'))
    : h('button' + (S.view === id ? '.on' : ''), { onclick: () => go(id) }, iconCanvas(ico, 3), label)));
}
const dayLabel = d => DAYS[dow(d)] + ', ' + shortDate(d);

// ---------- HOME ----------
const STATUS_TXT = { ok: 'Healthy', tired: 'Tired', sick: 'Sick', ko: 'Knocked out' };
function missedDays() {
  const g = S.g, t = today(), out = [];
  const logged = new Set(S.data.txns.map(x => x.date));
  (S.data.journal || []).forEach(j => { if (j.kind === 'checkin') logged.add(j.date); });
  for (let i = 1; i <= 3; i++) { const d = addDays(t, -i); if (d >= g.start && !logged.has(d)) out.push(d); }
  return out;
}
function speech() {
  const g = S.g, miss = missedDays();
  if (g.status === 'ko') return 'I\'m down… ' + (RULES.reviveDays - g.koGood) + ' more good days (logged and within the limit) and I\'m back.';
  if (miss.length) return miss.length + (miss.length > 1 ? ' days are' : ' day is') + ' missing from your log. Fill them in or check in before they slip away.';
  if (!g.today.logged) return 'Nothing logged yet today. Add your spending, or check in if there\'s nothing to add.';
  if (g.today.allowance != null) {
    const left = g.today.allowance - g.today.free;
    return left >= 0 ? rpShort(left) + ' of today\'s safe limit left. Hold the line and the boss takes a hit tonight.' : 'Today is ' + rpShort(-left) + ' over the safe limit. We\'ll win tomorrow.';
  }
  return 'Set a budget in the Budget tab so we can fight this month\'s boss.';
}
function viewHome() {
  const g = S.g, cfg = gameCfg(), t = g.today;
  const scene = h('section.panel.scene', null, h('div.stage', null, h('div.stars'), avatarCanvas(avatarOf(cfg), g.status, 2), h('button.btn.sm.ghost.edit', { onclick: openWardrobe }, 'Customize')),
    h('div.hero-name', null, cfg.name || 'Hero', h('span.status-chip.' + g.status, null, STATUS_TXT[g.status])),
    h('div.small.muted', null, 'Lv ' + g.level + ' · ' + g.title + ' · ' + g.streak + '-day streak'),
    h('div.bubble', null, speech()));

  const todayP = panel('Today', shortDate(t.date),
    t.allowance != null ? [
      h('div.kv', null, h('span', null, 'Flexible spending'), h('b.num', null, rp(t.free) + ' / ' + rp(Math.round(t.allowance)))),
      bar(t.allowance ? t.free / t.allowance : (t.free ? 1 : 0), t.free > t.allowance ? 'bad' : t.free > t.allowance * .8 ? 'warn' : ''),
      h('div.small.muted', null, 'Safe limit = what\'s left of this cycle\'s flexible budget, split over the remaining days.'),
    ] : h('div.small.muted', null, 'No budget set for this cycle yet.'),
    h('div.btns', null,
      h('button.btn.gold', { onclick: () => openAdd() }, '+ Add transaction'),
      !t.logged ? h('button.btn.ghost', { onclick: () => checkin(t.date) }, 'Nothing to log today') : null));

  const miss = missedDays();
  const missP = miss.length ? panel('Missing days', null,
    h('p.small.muted', null, 'Each day without a log costs ' + (-RULES.missed.hp) + ' HP. If you really spent nothing, just check in.'),
    h('div.list', null, miss.map(d => h('div.item', null, h('div.grow', null, h('div.t1', null, dayLabel(d))),
      h('button.btn.sm.ghost', { onclick: () => openAdd({ date: d }) }, 'Add'),
      h('button.btn.sm', { onclick: () => checkin(d) }, 'Nothing spent'))))) : null;

  const questP = panel('Daily quests', 'resets at midnight',
    t.quests.map(q => h('div.quest' + (q.done ? '.done' : ''), null,
      h('div.tick', null, q.done ? iconCanvas('check', 2) : iconCanvas(q.icon, 2)),
      h('div.grow', null, h('div.q-name', null, q.name), h('div.small.muted', null, q.desc + (q.eod ? ' · scored at end of day' : ''))),
      h('div.q-rew', null, '+' + q.xp + ' XP', h('br'), '+' + q.gold + ' G'))));

  const b = g.boss;
  const bossP = panel('Cycle boss', cycleName(b.key),
    h('div.boss-wrap', null, h('div.boss', null, bossCanvas(b.idx, 5)),
      h('div.grow', null,
        h('div.t1', { style: 'font-weight:700;font-size:18px' }, b.name),
        h('div.kv', null, h('span', null, 'Boss HP'), h('b.num', null, Math.max(0, b.max - b.hits) + '/' + b.max)),
        bar((b.max - b.hits) / b.max, 'boss seg'),
        h('div.kv', null, h('span', null, 'Day'), h('b.num', null, b.day + '/' + b.len + (b.end ? ' · ends ' + shortDate(b.end) : ''))))),
    h('p.small.muted', null, 'Every logged day within the safe limit is 1 hit; a no-spend day is a critical hit (2). Beat the boss before payday and close the cycle under budget to earn +' + RULES.boss.xp + ' XP and +' + RULES.boss.gold + ' G.' + (b.partial ? ' Your first cycle counts from the day you started playing.' : '')));

  const logP = panel('Adventure log', null,
    g.events.length ? h('div', null, g.events.slice(0, 10).map(e => h('div.ev', null, h('span.d', null, shortDate(e.date)), h('span', null, e.text),
      h('span.fx', null, e.xp ? h('span.cyan', null, '+' + e.xp + 'XP ') : null, e.gold ? h('span.gold', null, '+' + e.gold + 'G ') : null,
        e.hp ? h('span' + (e.hp > 0 ? '.green' : '.red'), null, (e.hp > 0 ? '+' : '') + e.hp + 'HP') : null)))) : h('div.empty', null, 'Your adventure starts today.'));

  const tr = trainCfg();
  let gymP = null;
  if (tr && tr.plan) {
    const sess = sessionOn(tr, t.date), done = workouts().some(w => w.date === t.date), late = (g.gym.pending || []).filter(p => p.date < t.date);
    if (late.length && !done) gymP = panel('Gym', 'make-up day', h('p.small', null, 'You missed ' + late[0].name + '. Do it today or lose ' + (-RULES.gym.missed) + ' HP at midnight.'), h('div.btns', null, h('button.btn.gold', { onclick: () => go('train') }, 'Go to training')));
    else if (sess && !done && !restOn(t.date)) gymP = panel('Gym', 'today', h('div.row', null, iconCanvas('dumbbell', 3), h('div.grow', null, h('div.t1', null, sess.name), h('div.small.muted', null, 'Scheduled for today. +' + RULES.gym.xp + ' XP when you finish.'))),
      h('div.btns', null, h('button.btn.gold', { onclick: () => openWorkout(loadDraft() ? { resume: true } : { dayId: sess.id }) }, loadDraft() ? 'Resume workout' : 'Start workout')));
  }
  return h('div', null, scene, todayP, gymP, missP, questP, bossP, logP);
}
function checkin(date) {
  return act(() => api('logAdd', [{ date, kind: 'checkin', data: { note: 'no transactions' } }]), 'Checked in for ' + shortDate(date));
}

// ---------- ADD ----------
function modal(title, body, onClose) {
  const ov = h('div.ov', { onclick: e => { if (e.target === ov) close(); } });
  const close = () => { ov.remove(); onClose && onClose(); };
  ov.append(h('div.sheet', { role: 'dialog', 'aria-label': title || 'Dialog' }, h('h3', null, title, h('button.x', { onclick: close, 'aria-label': 'Close' }, '✕')), body(close)));
  document.body.append(ov);
  return close;
}
function acctOptions(sel, filter) {
  return accounts().filter(filter || (() => true)).map(a => h('option', { value: a.id, selected: a.id === sel }, a.name + (a.kind === 'kredit' ? ' (card)' : '')));
}
function openAdd(pre = {}) {
  let type = pre.type || 'out', cat = pre.category || '';
  const harian = accounts().filter(a => a.kind === 'harian');
  const last = (() => { try { return localStorage.getItem('lrpg.acct'); } catch (e) { return null; } })();
  const defAcct = (last && acct(last)) ? last : (harian[0] || accounts()[0]).id;
  modal('Add transaction', close => {
    const amt = h('input.in.big', { inputmode: 'decimal', placeholder: '0', autocomplete: 'off', value: pre.amount || '', 'aria-label': 'Amount' });
    const hint = h('div.small.muted', { style: 'text-align:right;min-height:18px' });
    amt.addEventListener('input', () => { const n = parseAmount(amt.value); hint.textContent = isFinite(n) && n > 0 ? rp(n) : ''; });
    const tabs = h('div.tabs');
    const catBox = h('div.chips'), catWrap = h('div', null, h('label.f', null, 'Category'), catBox);
    const from = h('select.in', null, acctOptions(defAcct));
    const to = h('select.in', null, acctOptions(null));
    const toWrap = h('div', null, h('label.f', null, 'To account'), to);
    const date = h('input.in', { type: 'date', value: pre.date || today(), max: today() });
    const note = h('input.in', { placeholder: 'e.g. lunch, Grab', maxlength: 120 });
    const err = h('div.err');
    const fromLabel = h('label.f', null, 'Paid from');
    const paint = () => {
      tabs.replaceChildren(...[['out', 'Expense'], ['in', 'Income'], ['tf', 'Transfer']].map(([k, l]) => h('button' + (type === k ? '.on' : ''), { type: 'button', onclick: () => { type = k; cat = ''; paint(); } }, l)));
      const cats = type === 'in' ? INC_CATS : EXP_CATS;
      catBox.replaceChildren(...cats.map(c => h('button' + (cat === c ? '.on' : ''), { type: 'button', onclick: () => { cat = c; paint(); } }, catLabel(c))));
      catWrap.hidden = type === 'tf'; toWrap.hidden = type !== 'tf';
      fromLabel.textContent = type === 'in' ? 'Received in' : type === 'tf' ? 'From account' : 'Paid from';
    };
    paint();
    const save = h('button.btn.gold.block', { type: 'button', onclick: async () => {
      const n = parseAmount(amt.value);
      if (!(n > 0)) { err.textContent = 'Enter an amount first.'; amt.focus(); return; }
      if (type !== 'tf' && !cat) { err.textContent = 'Pick a category.'; return; }
      if (type === 'tf' && to.value === from.value) { err.textContent = 'Choose a different destination account.'; return; }
      if (!date.value || date.value > today()) { err.textContent = 'That date isn\'t valid.'; return; }
      try { localStorage.setItem('lrpg.acct', from.value); } catch (e) { /* ignore */ }
      save.disabled = true; err.textContent = '';
      const ok = await act(() => api('addTxns', [{ type, amount: n, account: from.value, toAccount: type === 'tf' ? to.value : '', category: type === 'tf' ? '' : cat, date: date.value, note: note.value.trim(), src: 'rpg' }]), 'Saved ' + rp(n));
      save.disabled = false;
      if (ok) close();
    } }, 'SAVE');
    setTimeout(() => amt.focus(), 50);
    return h('div', null, tabs, h('label.f', null, 'Amount (you can type 25k or 1.5m)'), amt, hint, catWrap, fromLabel, from, toWrap,
      h('div.grid2', null, h('div', null, h('label.f', null, 'Date'), date), h('div', null, h('label.f', null, 'Note'), note)), err, h('div.btns', null, save));
  });
}

// ---------- JOURNAL ----------
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
    cells.push(h('button.' + cls, { onclick: d > t ? null : () => { S.calSel = d; render(); }, 'aria-label': dayLabel(d) }, h('span', null, i),
      out ? h('span.v', null, '-' + rpShort(out)) : inc ? h('span.v.in', null, '+' + rpShort(inc)) : checks[d] ? h('span.v.in', null, '✓') : null));
  }
  const setMonth = p => { S.calMonth = p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0'); render(); };
  const calP = panel(MONTHS[M - 1] + ' ' + Y, null,
    h('div.row.between', { style: 'margin-bottom:10px' }, h('button.btn.sm.ghost', { onclick: () => setMonth(new Date(Y, M - 2, 1)), 'aria-label': 'Previous month' }, '◀'),
      h('div.small.num', null, h('span.red', null, '-' + rpShort(mOut)), '  ', h('span.green', null, '+' + rpShort(mIn))),
      h('button.btn.sm.ghost', { onclick: () => setMonth(new Date(Y, M, 1)), disabled: mk >= t.slice(0, 7), 'aria-label': 'Next month' }, '▶')),
    h('div.cal', null, cells),
    h('div.legend', null, h('span', { style: '--c:#23403a' }, 'logged'), h('span', { style: '--c:#3d2a3a' }, 'missing'), h('span', { style: '--c:#ffcd75' }, 'today')));

  const sel = S.calSel, list = S.data.txns.filter(x => x.date === sel).sort((a, b) => b.createdAt - a.createdAt);
  const ck = checks[sel];
  const dayP = panel(dayLabel(sel), null,
    list.length || ck ? h('div.list', null,
      ck ? h('div.item', null, iconCanvas('check', 2), h('div.grow', null, h('div.t1', null, 'Checked in'), h('div.t2', null, 'Nothing spent')),
        h('button.btn.sm.ghost', { onclick: () => act(() => api('logDelete', ck.id), 'Check-in removed') }, 'Remove')) : null,
      list.map(x => txItem(x))) : h('div.empty', null, 'Nothing logged.'),
    sel <= t ? h('div.btns', null, h('button.btn.gold.sm', { onclick: () => openAdd({ date: sel }) }, '+ Add for this day'),
      !list.length && !ck ? h('button.btn.sm.ghost', { onclick: () => checkin(sel) }, 'Nothing spent') : null) : null,
    list.length ? h('p.tiny.muted', { style: 'margin-top:10px' }, 'Tap a transaction to delete it.') : null);
  return h('div', null, calP, dayP);
}
function txItem(x) {
  const a = acct(x.account), b = x.toAccount ? acct(x.toAccount) : null;
  const sign = x.type === 'in' ? '+' : x.type === 'out' ? '-' : '';
  const title = x.type === 'tf' ? 'Transfer' : catLabel(x.category);
  const sub = [x.note, x.type === 'tf' ? (a ? a.name : '?') + ' → ' + (b ? b.name : '?') : a ? a.name : ''].filter(Boolean).join(' · ');
  const open = S.txSel === x.id;
  return h('div.item', { onclick: () => { S.txSel = open ? null : x.id; render(); }, style: 'cursor:pointer' },
    h('div.dot', { style: 'background:' + (x.type === 'in' ? '#a7f070' : x.type === 'tf' ? '#41a6f6' : isFree(x.category) ? '#ef7d57' : '#94b0c2') }),
    h('div.grow', null, h('div.t1', null, title), h('div.t2', null, sub || '—')),
    open ? h('button.btn.sm.red', { onclick: e => { e.stopPropagation(); S.txSel = null; act(() => api('deleteTxn', x.id), 'Transaction deleted'); } }, 'Delete')
      : h('div.amt' + (x.type === 'in' ? '.green' : ''), null, sign + rp(x.amount)));
}

// ---------- BUDGET ----------
const ST_CLS = { over: 'bad', bahaya: 'bad', waspada: 'warn', aman: '' };
const ST_TXT = { over: 'OVER', bahaya: 'AT RISK', waspada: 'WATCH', aman: 'ON TRACK' };
function advice(a) {
  const out = [];
  a.items.forEach(i => {
    const c = catLabel(i.cat);
    if (i.status === 'over') out.push(c + ' is ' + rp(i.used - i.budget) + ' over. Under your rules, next cycle\'s ' + c + ' budget is cut by that amount unless you change it.');
    else if (i.status === 'bahaya' || i.status === 'waspada') out.push(c + ' is ' + Math.round(i.pct * 100) + '% used with ' + Math.round(a.day / a.days * 100) + '% of the cycle gone' + (i.runout ? '; at this pace it runs out around ' + shortDate(i.runout) : '') + '. Keep it under ' + rp(i.perDay) + ' a day.');
  });
  if (a.unbudgeted.length) out.push(rp(a.unbudgeted.reduce((s, u) => s + u.used, 0)) + ' went to categories with no budget (' + a.unbudgeted.map(u => catLabel(u.cat)).join(', ') + '). That comes out of what you could save.');
  return out;
}
function viewArena() {
  const B = S.data.budget, a = B.advisor, g = S.g, cur = S.data.cycle.cur;
  const out = [];
  if (B.closePending) out.push(closeCard(B.closePending));
  if (!a || !a.ready) {
    out.push(panel('Budget · ' + cycleName(cur), null, h('p.muted', null, 'No budget for this cycle yet. The boss can\'t be hit without one.'),
      h('div.btns', null, h('button.btn.gold', { onclick: openBudget }, 'Set budget'))));
    return h('div', null, out);
  }
  const elapsed = a.day / a.days;
  out.push(panel(cycleName(cur) + ' cycle', shortDate(a.start) + ' – ' + shortDate(a.end),
    h('div.kv', null, h('span', null, 'Spent'), h('b.num', null, rp(a.used) + ' / ' + rp(a.budget))),
    h('div.bar' + (a.used > a.budget ? '.bad' : a.used / a.budget > elapsed + .05 ? '.warn' : ''), null,
      h('i', { style: 'width:' + Math.min(100, a.used / Math.max(1, a.budget) * 100) + '%' }), h('span.mark', { style: 'left:' + (elapsed * 100) + '%' })),
    h('div.kv', null, h('span.muted', null, 'Day ' + a.day + ' of ' + a.days + ' (white line = today)'), h('span.muted', null, a.daysLeft + ' days left')),
    h('div.kv', null, h('span', null, 'Safe to spend per day'), h('b.num.gold', null, rp(a.perDay))),
    h('div.btns', null, h('button.btn.sm.ghost', { onclick: openBudget }, 'Edit budget'))));

  out.push(panel('Categories', null, h('div.list', null, a.items.map(i => h('div.item', { style: 'display:block' },
    h('div.row.between', null, h('span.t1', null, catLabel(i.cat)), h('span.small' + (i.status === 'aman' ? '.green' : '.red'), null, ST_TXT[i.status])),
    h('div.kv', null, h('span.muted', null, rp(i.used) + ' / ' + rp(i.budget) + (i.cut ? ' (cut ' + rpShort(i.cut) + ')' : '')),
      h('span.muted', null, i.fixed ? 'fixed' : i.status === 'over' ? rpShort(i.used - i.budget) + ' over' : rpShort(i.perDay) + '/day')),
    bar(i.budget ? i.used / i.budget : 1, ST_CLS[i.status] + ' thin')))),
  a.unbudgeted.length ? h('div.small.muted', { style: 'margin-top:8px' }, 'No budget set: ' + a.unbudgeted.map(u => catLabel(u.cat) + ' ' + rpShort(u.used)).join(', ')) : null));

  const tips = advice(a);
  if (tips.length) out.push(panel('Advisor', null, tips.slice(0, 4).map(x => h('p.small', { style: 'margin:0 0 8px' }, '▸ ' + x))));

  const ch = g.challenges, share = Math.round((gameCfg().share ?? RULES.challenge.share) * 100);
  out.push(panel('Challenges', share + '% of savings as reward',
    h('p.small.muted', null, 'Accept a challenge in the first ' + RULES.challenge.acceptDays + ' days of a cycle. Win it for +' + RULES.challenge.xp + ' XP, +' + RULES.challenge.gold + ' G, and ' + share + '% of the money you saved goes into your reward fund to spend guilt-free.'),
    ch.accepted.map(c => h('div.quest', null, h('div.tick', null, iconCanvas('sword', 2)),
      h('div.grow', null, h('div.q-name', null, catLabel(c.cat) + ' ≤ ' + rp(c.limit)), bar(c.used / c.limit, c.used > c.limit ? 'bad thin' : 'thin'),
        h('div.small.muted', null, 'Spent ' + rp(c.used) + (c.used > c.limit ? ' · failed' : ' · ' + rp(c.limit - c.used) + ' left'))))),
    ch.offers.map(o => h('div.quest', null, h('div.tick', null, iconCanvas('bolt', 2)),
      h('div.grow', null, h('div.q-name', null, catLabel(o.cat) + ' ≤ ' + rp(o.limit)), h('div.small.muted', null, 'Budget ' + rp(o.budget) + ' · save ' + rp(o.budget - o.limit))),
      h('button.btn.sm.gold', { onclick: () => act(() => api('logAdd', [{ date: today(), kind: 'challenge', data: { cycle: g.boss.key, cat: o.cat, limit: o.limit } }]), 'Challenge accepted!') }, 'Accept'))),
    !ch.accepted.length && !ch.offers.length ? h('div.empty', null, ch.partial ? 'Challenges open at the start of next cycle. This one was already running when you started playing.' : ch.open ? 'No challenges to offer right now.' : 'Sign-ups for this cycle are closed. New challenges arrive next payday.') : null));
  return h('div', null, out);
}
function closeCard(p) {
  const to = h('select.in', null, acctOptions(null, a => a.kind === 'tabungan' || a.kind === 'investasi'));
  const from = h('select.in', null, acctOptions(null, a => a.kind === 'harian'));
  const left = Math.max(0, p.leftover);
  return panel('Close the ' + cycleName(p.cycle) + ' cycle', null,
    h('div.kv', null, h('span', null, 'Spent'), h('b.num', null, rp(p.used) + ' / ' + rp(p.budget))),
    h('div.kv', null, h('span', null, p.leftover >= 0 ? 'Left over' : 'Over by'), h('b.num' + (p.leftover >= 0 ? '.green' : '.red'), null, rp(Math.abs(p.leftover)))),
    p.over.length ? h('p.small.muted', null, 'Over budget (cut from this cycle): ' + p.over.map(o => catLabel(o.cat) + ' ' + rpShort(o.over)).join(', ')) : null,
    left > 0 ? h('div', null, h('label.f', null, 'Move leftover from'), from, h('label.f', null, 'into'), to) : null,
    h('div.btns', null,
      left > 0 ? h('button.btn.green', { onclick: () => act(() => api('closeCycle', p.cycle, { action: 'save', amount: left, from: from.value, to: to.value }), 'Leftover saved!') }, 'Save ' + rpShort(left)) : null,
      h('button.btn.ghost', { onclick: () => act(() => api('closeCycle', p.cycle, { action: 'skip' }), 'Cycle closed') }, left > 0 ? 'Skip' : 'Close cycle')));
}
function openBudget() {
  const B = S.data.budget, cur = S.data.cycle.cur, p = B.plan[cur];
  const base = {};
  if (p) Object.entries(p.lines).forEach(([c, l]) => base[c] = l.base);
  if (!p && B.suggestion && B.suggestion.ready) B.suggestion.lines.forEach(l => base[l.cat] = l.suggested);
  modal('Budget · ' + cycleName(cur), close => {
    const cap = h('input.in', { inputmode: 'decimal', value: B.cap ? String(B.cap) : '' });
    const rows = EXP_CATS.filter(c => !/^Mobil/.test(c)).map(c => [c, h('input.in', { inputmode: 'decimal', placeholder: '—', value: base[c] ? String(base[c]) : '', 'aria-label': catLabel(c) })]);
    const total = h('div.kv');
    const upd = () => { const s = rows.reduce((a, [, i]) => a + (parseAmount(i.value) || 0), 0); const c = parseAmount(cap.value) || 0; total.replaceChildren(h('span', null, 'Total'), h('b.num' + (c && s > c ? '.red' : ''), null, rp(s) + (c ? ' / target ' + rp(c) : ''))); };
    [cap, ...rows.map(r => r[1])].forEach(i => i.addEventListener('input', upd)); upd();
    const err = h('div.err');
    const save = h('button.btn.gold.block', { onclick: async () => {
      const lines = rows.map(([c, i]) => ({ cat: c, amount: parseAmount(i.value) || 0 })).filter(l => l.amount > 0);
      if (!lines.length) { err.textContent = 'Fill in at least one category.'; return; }
      if (await act(() => api('saveBudget', cur, lines, parseAmount(cap.value) || 0), 'Budget saved')) close();
    } }, 'SAVE BUDGET');
    return h('div', null, h('p.small.muted', null, 'Leave a category empty to keep it unlimited. Cuts from last cycle\'s overspending are applied automatically.'),
      h('label.f', null, 'Overall target (optional)'), cap,
      rows.map(([c, i]) => h('div', null, h('label.f', null, catLabel(c) + (p && p.lines[c] && p.lines[c].cut ? ' · cut ' + rpShort(p.lines[c].cut) : '')), i)),
      h('div', { style: 'margin-top:12px' }, total), err, h('div.btns', null, save));
  });
}

// ---------- VAULT ----------
function viewHarta() {
  const d = S.data, bal = balances(d.accounts, d.txns), nw = netWorth(d.accounts, bal, d.txns), g = S.g;
  const out = [];
  out.push(panel('Net worth', null, h('div.big-num.num', null, rp(nw.nw)),
    h('div.kv', null, h('span.muted', null, 'Assets'), h('span.num', null, rp(nw.assets))),
    h('div.kv', null, h('span.muted', null, 'Card debt'), h('span.num.red', null, rp(nw.debt)))));
  out.push(panel('Reward fund', null,
    h('div.row', null, iconCanvas('chest', 4), h('div.grow', null, h('div.big-num.num.gold', null, rp(g.fund)),
      h('div.small.muted', null, 'Earned from challenges. Spend it on anything; it doesn\'t touch your budget.'))),
    g.fund > 0 ? h('div.btns', null, h('button.btn.gold', { onclick: openUseFund }, 'Spend')) : null));
  const goals = (d.goals || []).filter(x => x.show);
  if (goals.length) out.push(panel('Garage & goals', null, goals.map(x => {
    const cur = goalProgress(x, d.accounts, bal, d.txns), pct = x.target ? cur / x.target : 0;
    const monthsLeft = x.targetDate ? Math.max(1, Math.ceil(daysBetween(today(), x.targetDate) / 30.4)) : null;
    const need = monthsLeft ? Math.max(0, Math.ceil((x.target - cur) / monthsLeft / 10000) * 10000) : null;
    return h('div', { style: 'margin-bottom:14px' },
      h('div.row.between', null, h('b', null, x.name), h('span.small.num', null, Math.round(pct * 100) + '%')),
      /mobil|car|ferio|civic/i.test(x.name) ? h('div.goal-car', null, carCanvas(pct, 8)) : null,
      bar(pct, 'seg'),
      h('div.kv', null, h('span.muted', null, rp(cur) + ' / ' + rp(x.target)), h('span.muted', null, x.targetDate ? 'by ' + shortDate(x.targetDate) + ' ' + x.targetDate.slice(0, 4) : '')),
      need != null ? h('div.small.muted', null, 'About ' + rp(need) + ' a month keeps you on schedule.') : null);
  })));
  out.push(panel('Accounts', null, ['harian', 'tabungan', 'investasi', 'kredit'].map(k => {
    const list = d.accounts.filter(a => a.kind === k);
    if (!list.length) return null;
    return h('div', null, h('div.tiny.muted', { style: 'margin-top:8px' }, KIND_LABEL[k].toUpperCase()),
      h('div.list', null, list.map(a => {
        const w = worth(a, bal, d.txns);
        return h('div.item', null, h('div.grow', null, h('div.t1', null, a.name),
          a.kind === 'kredit' && a.limit ? h('div.t2', null, Math.round(Math.max(0, -w) / a.limit * 100) + '% of ' + rpShort(a.limit) + ' limit used') : null,
          a.kind === 'investasi' && a.valueDate ? h('div.t2', null, 'Value as of ' + shortDate(a.valueDate)) : null),
        h('div.amt.num' + (w < 0 ? '.red' : ''), null, rp(w)));
      })));
  })));
  return h('div', null, out);
}
function openUseFund() {
  const g = S.g;
  modal('Spend reward fund', close => {
    const amt = h('input.in.big', { inputmode: 'decimal', placeholder: '0', 'aria-label': 'Amount' });
    const from = h('select.in', null, acctOptions(null, a => a.kind === 'harian' || a.kind === 'kredit'));
    const note = h('input.in', { placeholder: 'e.g. a nice dinner', maxlength: 80 });
    const err = h('div.err');
    return h('div', null, h('p.small.muted', null, rp(g.fund) + ' available. Logged under the "Reward" category, so it doesn\'t count against your flexible budget.'),
      h('label.f', null, 'Amount'), amt, h('label.f', null, 'Paid from'), from, h('label.f', null, 'What for'), note, err,
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => {
        const n = parseAmount(amt.value);
        if (!(n > 0)) { err.textContent = 'Enter an amount.'; return; }
        if (n > g.fund) { err.textContent = 'That\'s more than your reward fund.'; return; }
        const ok = await act(async () => {
          await api('addTxns', [{ type: 'out', amount: n, account: from.value, category: 'Hadiah', note: note.value.trim() || 'Reward fund', date: today(), src: 'reward' }]);
          return api('logAdd', [{ date: today(), kind: 'reward_use', data: { amount: n, note: note.value.trim() } }]);
        }, 'Enjoy your reward!');
        if (ok) close();
      } }, 'SPEND')));
  });
}

// ---------- settings & level up ----------
function openSettings() {
  const cfg = gameCfg();
  modal('Settings', close => {
    const name = h('input.in', { value: cfg.name || 'Hero', maxlength: 20 });
    const share = h('input.in', { inputmode: 'numeric', value: String(Math.round((cfg.share ?? RULES.challenge.share) * 100)) });
    return h('div', null,
      h('label.f', null, 'Hero name'), name,
      h('label.f', null, 'Share of challenge savings that goes to your reward fund (%)'), share,
      h('div.btns', null, h('button.btn.gold', { onclick: async () => {
        const s = Math.max(0, Math.min(50, Number(share.value) || 0)) / 100;
        if (await saveGame({ name: name.value.trim() || 'Hero', share: s })) close();
      } }, 'Save')),
      h('p.small.muted', { style: 'margin-top:18px' }, h('a', { href: 'https://github.com/aulianadhif06/life-rpg/blob/main/CREDITS.md', target: '_blank', rel: 'noopener', style: 'color:inherit' }, 'Art credits')),
      h('p.small.muted', null, 'Adventure started ' + shortDate(S.g.start) + ' ' + S.g.start.slice(0, 4) + '. Your data lives in your Google Sheet; this device only keeps a copy.'),
      h('div.btns', null,
        h('button.btn.ghost', { onclick: () => { close(); refresh(true); } }, 'Refresh data'),
        h('button.btn.red', { onclick: () => { if (confirm('Sign out on this device?')) { auth.clear(); location.reload(); } } }, 'Sign out')));
  });
}
function showLevelUp(lvl) {
  modal('', close => h('div.lvlup', null, h('div.big', null, 'LEVEL UP!'), h('div', { style: 'display:flex;justify-content:center;margin:14px 0' }, avatarCanvas(avatarOf(gameCfg()), 'happy', 3)),
    h('p', null, 'You\'re now Lv ' + lvl + ' · ' + S.g.title),
    unlockedAt(lvl).length ? h('p.gold', null, 'Unlocked: ' + unlockedAt(lvl).join(', ')) : null,
    h('button.btn.gold', { onclick: close }, 'NICE')));
}

// ---------- wardrobe ----------
// Gold spent on clothes is tracked in the game settings. (spent2/owned2: the earlier hand-drawn wardrobe is retired and refunded.)
const goldLeft = () => Math.max(0, S.g.gold - (Number(gameCfg().spent2) || 0));
const UNLOCKS = { 'top:stringer': { lvl: 3 }, 'hair:knot': { lvl: 5 }, 'top:coat': { lvl: 8 }, 'top:vest': { gold: 40 }, 'top:track': { gold: 50 }, 'top:hoodie': { gold: 30 }, 'bottom:chinos': { gold: 30 } };
const KIND_NAME = { top: 'top', bottom: 'bottom', hair: 'hair' };
const pretty = k => k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const ITEM_NAMES = { messy: 'Messy', side: 'Side part', buzz: 'Buzz cut', long: 'Long', pony: 'Ponytail', curly: 'Curly', bob: 'Bob', knot: 'Top knot',
  tee: 'T-shirt', tank: 'Tank top', hoodie: 'Hoodie', shirt: 'Button-up', vest: 'Sweater vest', coat: 'Long coat', track: 'Track jacket', stringer: 'Gym stringer',
  joggers: 'Joggers', jeans: 'Jeans', shorts: 'Shorts', chinos: 'Chinos & boots', skirt: 'Skirt', natural: 'Natural' };
function unlockedAt(lvl) {
  return Object.entries(UNLOCKS).filter(([, u]) => u.lvl === lvl).map(([k]) => (ITEM_NAMES[k.split(':')[1]] || k) + ' (' + KIND_NAME[k.split(':')[0]] + ')');
}
function openWardrobe() {
  const cfg = gameCfg(), lvl = S.g.level;
  const draft = { ...avatarOf(cfg) };
  const owned = new Set(cfg.owned2 || []), buying = new Set();
  const lockOf = key => {
    const u = UNLOCKS[key];
    if (!u || owned.has(key) || buying.has(key)) return null;
    if (u.lvl) return lvl >= u.lvl ? null : { text: 'Lv ' + u.lvl };
    return { text: u.gold + 'G', gold: u.gold };
  };
  modal('Customize hero', close => {
    const prev = h('div.wardrobe-prev');
    const body = h('div');
    const cost = () => [...buying].reduce((s, k) => s + UNLOCKS[k].gold, 0);
    const saveBtn = h('button.btn.gold.block');
    const err = h('div.err');
    let tab = 'look';
    const tabs = h('div.tabs');
    const paint = () => {
      prev.replaceChildren(avatarCanvas(draft, 'ok', 2.5));
      tabs.replaceChildren(...[['look', 'Look'], ['clothes', 'Clothes']].map(([k, l]) => h('button' + (tab === k ? '.on' : ''), { type: 'button', onclick: () => { tab = k; paint(); } }, l)));
      body.replaceChildren(...sections());
      const c = cost();
      saveBtn.textContent = c ? 'Buy & save · ' + c + 'G' : 'Save look';
      err.textContent = c > goldLeft() ? 'Not enough gold (' + goldLeft() + 'G available).' : '';
    };
    const chips = (field, names, slot) => h('div.chips', null, names.map(k => {
      const key = slot + ':' + k, lock = lockOf(key), on = draft[field] === k;
      return h('button' + (on ? '.on' : '') + (lock ? '.locked' : ''), { type: 'button', onclick: () => {
        if (lock && !lock.gold) { toast('Unlocks at ' + lock.text); return; }
        [...buying].forEach(b => { if (b.startsWith(slot + ':') && b !== key) buying.delete(b); });
        if (lock && lock.gold) buying.add(key);
        draft[field] = k; paint();
      } }, ITEM_NAMES[k] || pretty(k), lock ? h('span.lock', null, ' · ' + lock.text) : null);
    }));
    const swatches = (field, kind, keys) => h('div.swatches', null, keys.map(k => h('button' + (draft[field] === k ? '.on' : ''), {
      type: 'button', style: 'background:' + swatch(kind, k), title: ITEM_NAMES[k] || pretty(k), 'aria-label': ITEM_NAMES[k] || pretty(k), onclick: () => { draft[field] = k; paint(); } })));
    const sec = (title, ...kids) => h('div.wsec', null, h('div.wlab', null, title), ...kids);
    const sections = () => tab === 'look' ? [
      sec('Skin tone', swatches('skin', 'skin', SKIN_TONES)),
      sec('Hairstyle', chips('hair', HAIRS, 'hair')),
      sec('Hair colour', swatches('hairColor', 'hair', HAIR_COLORS)),
    ] : [
      sec('Top', chips('top', TOPS, 'top')),
      sec('Bottom', chips('bottom', BOTTOMS, 'bottom')),
    ];
    saveBtn.onclick = async () => {
      const c = cost();
      if (c > goldLeft()) return;
      const spent2 = (Number(cfg.spent2) || 0) + c;
      if (await saveGame({ avatar: draft, owned2: [...owned, ...buying], spent2 })) { close(); toast(c ? 'Bought and saved' : 'Look saved'); }
    };
    paint();
    return h('div', null, prev, tabs, body, err, h('div.btns', null, saveBtn,
      h('button.btn.ghost', { type: 'button', onclick: () => { Object.assign(draft, DEFAULT_AVATAR); buying.clear(); paint(); } }, 'Reset')),
      h('p.small.muted', null, goldLeft() + 'G available. Some items unlock with levels; others cost gold from quests, streaks and bosses.'));
  });
}

// ---------- TRAIN ----------
const trainCfg = () => gameCfg().train || null;
const workouts = () => (S.data.journal || []).filter(j => j.kind === 'workout')
  .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);
const restOn = d => (S.data.journal || []).find(j => j.kind === 'rest' && j.date === d);
const WO_KEY = 'lrpg.wo';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(WO_KEY) || 'null'); } catch (e) { return null; } };
const saveDraft = d => { try { d ? localStorage.setItem(WO_KEY, JSON.stringify(d)) : localStorage.removeItem(WO_KEY); } catch (e) { /* ignore */ } };
const kgTxt = kg => (kg > 0 ? (Math.round(kg * 100) / 100) + ' kg' : 'BW');
const setsTxt = sets => sets.map(([kg, r]) => (kg > 0 ? (Math.round(kg * 100) / 100) + '×' : '') + r).join(' · ');
const planDay = (tr, id) => tr && tr.plan && tr.plan.days.find(d => d.id === id);

function nextSession(tr, from) {
  for (let i = 1; i <= 7; i++) { const d = addDays(from, i), s = sessionOn(tr, d); if (s) return { date: d, ...s }; }
  return null;
}
function weekCells(tr) {
  const t = today(), ws = weekStart(t), ws2 = workouts();
  const byDay = {}; ws2.forEach(w => { (byDay[w.date] = byDay[w.date] || []).push(w); });
  return WEEKDAYS.map((wd, i) => {
    const d = addDays(ws, i), s = sessionOn(tr, d), done = byDay[d], rest = restOn(d);
    let st = 'up';
    if (done) st = 'done';
    else if (!s) st = 'off';
    else if (rest) st = 'rest';
    else if (d < t) { const nx = addDays(d, 1); st = byDay[nx] ? 'done' : nx >= t ? 'late' : 'miss'; }
    return h('div.wk.' + st + (d === t ? '.today' : ''), null, h('b', null, wd), h('span', null, done ? '✓' : s ? s.id : '·'));
  });
}

function viewTrain() {
  const tr = trainCfg(), t = today(), g = S.g;
  if (!tr || !tr.plan) {
    return h('div', null, panel('Training', null,
      h('p', null, 'Set up your gym routine. Answer a few questions and get a recommended plan, or enter the plan you already follow.'),
      h('div.list', null,
        h('div.item', null, iconCanvas('dumbbell', 3), h('div.grow', null, h('div.t1', null, 'Log every set'), h('div.t2', null, 'Weights and reps are filled in from last time, with a rest timer between sets.'))),
        h('div.item', null, iconCanvas('star', 3), h('div.grow', null, h('div.t1', null, 'Earn XP for showing up'), h('div.t2', null, '+' + RULES.gym.xp + ' XP, +' + RULES.gym.gold + ' G and +' + RULES.gym.hp + ' HP per workout; +' + RULES.gym.prXp + ' XP for every personal record.'))),
        h('div.item', null, iconCanvas('heart', 3), h('div.grow', null, h('div.t1', null, 'Skipping costs HP'), h('div.t2', null, 'A scheduled session you miss costs ' + (-RULES.gym.missed) + ' HP. You get one extra day to make it up.')))),
      h('div.btns', null, h('button.btn.gold.block', { onclick: openTrainSetup }, 'Set up training'))));
  }
  const ws = workouts(), draft = loadDraft();
  const sess = sessionOn(tr, t), doneToday = ws.filter(w => w.date === t);
  const makeup = (g.gym.pending || []).filter(p => p.date < t);
  const startBtn = (id, label) => h('button.btn.gold', { onclick: () => openWorkout({ dayId: id }) }, label);
  const todayKids = [];
  if (draft) todayKids.push(h('div.callout', null, h('b', null, 'Workout in progress: ' + draft.name), h('div.small.muted', null, 'Started ' + shortDate(draft.date) + '. Your sets are saved on this phone.')),
    h('div.btns', null, h('button.btn.gold', { onclick: () => openWorkout({ resume: true }) }, 'Resume workout')));
  else {
    makeup.forEach(p => {
      const d = planDay(tr, sessionOn(tr, p.date).id);
      todayKids.push(h('div.callout.warn', null, h('b', null, 'You missed ' + p.name + ' (' + WEEKDAYS[wdOf(p.date)] + ').'),
        h('div.small', null, 'Do it today to keep your HP. At midnight it costs ' + (-RULES.gym.missed) + ' HP.')),
      h('div.btns', null, startBtn(d ? d.id : null, 'Start ' + p.name)));
    });
    if (doneToday.length) todayKids.push(h('div.callout.good', null, h('b', null, 'Done today: ' + doneToday.map(w => w.data.name).join(', ')),
      h('div.small.muted', null, doneToday.map(w => setCount(w) + ' sets · ' + Math.round(volume(w)).toLocaleString('en-US') + ' kg lifted' + (w.data.min ? ' · ' + w.data.min + ' min' : '')).join(' / '))));
    else if (sess && restOn(t)) todayKids.push(h('div.callout', null, h('b', null, 'Rest day taken (' + restOn(t).data.reason + ')'), h('div.small.muted', null, sess.name + ' is excused today. No HP lost.')),
      h('div.btns', null, h('button.btn.sm.ghost', { onclick: () => act(() => api('logDelete', restOn(t).id), 'Rest day removed') }, 'Undo rest day')));
    else if (sess) {
      const d = planDay(tr, sess.id);
      todayKids.push(h('div.big-num', null, sess.name), h('div.small.muted', null, d ? d.ex.length + ' exercises · ' + d.ex.reduce((s, x) => s + Number(x.sets || 0), 0) + ' sets · about ' + (tr.setup && tr.setup.minutes || 60) + ' min' : ''),
        h('div.btns', null, startBtn(sess.id, 'Start workout'), h('button.btn.ghost', { onclick: () => openRestDay(t) }, 'Can\'t train today')));
    } else {
      const n = nextSession(tr, t);
      todayKids.push(h('div.big-num', null, 'Rest day'), h('div.small.muted', null, n ? 'Next: ' + n.name + ' on ' + DAYS[dow(n.date)] + ', ' + shortDate(n.date) + '.' : 'No sessions scheduled.'));
    }
    todayKids.push(h('div.btns', null,
      h('button.btn.sm.ghost', { onclick: () => pickDayThen(id => openWorkout({ dayId: id })) }, 'Other workout'),
      h('button.btn.sm.ghost', { onclick: () => pickDayThen(id => openWorkout({ dayId: id, past: true })) }, 'Log a past workout')));
  }
  const todayP = panel('Today', shortDate(t), todayKids);
  const wk = g.gym.week;
  const weekP = panel('This week', wk.sched ? wk.done + '/' + wk.sched + ' done' : '', h('div.week', null, weekCells(tr)),
    h('p.small.muted', null, 'Clear every scheduled session this week for +' + RULES.gym.weekXp + ' XP and +' + RULES.gym.weekGold + ' G.'));

  const sched = schedOn(tr, t) || {};
  const planP = panel('Your plan', tr.plan.source === 'rec' ? 'recommended' : 'custom',
    h('div.t1', { style: 'margin-bottom:6px' }, tr.plan.name),
    tr.plan.days.map(d => {
      const on = WEEKDAYS.filter((_, i) => sched[i] === d.id);
      return h('details.pday', null, h('summary', null, h('b', null, d.id + ' · ' + d.name), h('span.small.muted', null, on.length ? on.join(', ') : 'not scheduled')),
        h('div.list', null, d.ex.map(x => h('div.item', null, h('div.grow', null, h('div', null, x.name), h('div.t2', null, x.sets + ' × ' + x.reps + (EX[x.id] && EX[x.id].secs ? ' s' : '') + ' · rest ' + fmtRest(x.rest)))))));
    }),
    h('div.btns', null, h('button.btn.sm', { onclick: () => openPlanEditor(tr.plan, sched) }, 'Edit plan'), h('button.btn.sm.ghost', { onclick: openTrainSetup }, 'New plan')));

  const best = Object.entries(prTable(ws)).sort((a, b) => (a[1].date < b[1].date ? 1 : -1)).slice(0, 8);
  const prP = panel('Personal records', null, best.length ? h('div.list', null, best.map(([n, p]) => h('div.item', null, h('div.grow', null, h('div.t1', null, n), h('div.t2', null, shortDate(p.date))),
    h('div.amt', null, p.bw ? p.reps + ' reps' : kgTxt(p.kg) + ' × ' + p.reps), !p.bw ? h('div.small.muted', { style: 'width:70px;text-align:right' }, '≈' + Math.round(p.v) + ' 1RM') : null)))
    : h('div.empty', null, 'Records show up after your second session of an exercise.'));

  const histP = panel('History', ws.length ? ws.length + (ws.length === 1 ? ' workout' : ' workouts') : '', ws.length ? h('div.list', null, ws.slice(-10).reverse().map(w => h('button.item.plain', { onclick: () => openWorkoutDetail(w) },
    iconCanvas('dumbbell', 2), h('div.grow', null, h('div.t1', null, w.data.name), h('div.t2', null, DAYS[dow(w.date)] + ', ' + shortDate(w.date) + ' · ' + setCount(w) + ' sets' + (w.data.min ? ' · ' + w.data.min + ' min' : ''))),
    h('div.amt', null, Math.round(volume(w)).toLocaleString('en-US') + ' kg')))) : h('div.empty', null, 'No workouts logged yet.'));

  return h('div', null, todayP, weekP, planP, prP, histP);
}

function pickDayThen(fn) {
  const tr = trainCfg();
  modal('Which workout?', close => h('div.list', null, tr.plan.days.map(d => h('button.item.plain', { onclick: () => { close(); fn(d.id); } },
    h('div.grow', null, h('div.t1', null, d.id + ' · ' + d.name), h('div.t2', null, d.ex.map(x => x.name).slice(0, 4).join(', ') + (d.ex.length > 4 ? '…' : ''))))),
  h('button.item.plain', { onclick: () => { close(); fn(null); } }, h('div.grow', null, h('div.t1', null, 'Empty workout'), h('div.t2', null, 'Add exercises as you go')))));
}

function openRestDay(date) {
  modal('Take a rest day', close => {
    let reason = 'sick';
    const chips = h('div.chips');
    const paint = () => chips.replaceChildren(...[['sick', 'Sick'], ['injured', 'Injured'], ['travel', 'Travelling'], ['other', 'Other']].map(([k, l]) => h('button' + (reason === k ? '.on' : ''), { type: 'button', onclick: () => { reason = k; paint(); } }, l)));
    paint();
    return h('div', null, h('p.small', null, 'Today\'s session is excused: no HP lost, no XP earned. Use it when you genuinely can\'t train.'), chips,
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => { if (await act(() => api('logAdd', [{ date, kind: 'rest', data: { reason } }]), 'Rest day saved')) close(); } }, 'Save rest day')));
  });
}

// ----- setup -----
function openTrainSetup() {
  const old = (trainCfg() && trainCfg().setup) || {};
  const st = { goal: old.goal || 'muscle', level: old.level || 'beginner', days: old.days || [0, 2, 4], minutes: old.minutes || 60, equip: old.equip || 'gym' };
  modal('Training setup', close => {
    const body = h('div');
    const one = (field, opts) => h('div.chips', null, opts.map(([k, l]) => h('button' + (st[field] === k ? '.on' : ''), { type: 'button', onclick: () => { st[field] = k; paint(); } }, l)));
    const err = h('div.err');
    const paint = () => body.replaceChildren(
      h('label.f', null, 'Main goal'), one('goal', [['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['fitness', 'General fitness']]),
      h('label.f', null, 'Training experience'), one('level', [['beginner', 'Under 1 year'], ['intermediate', '1–3 years'], ['advanced', '3+ years']]),
      h('label.f', null, 'Training days (' + st.days.length + ' a week)'),
      h('div.chips', null, WEEKDAYS.map((w, i) => h('button' + (st.days.includes(i) ? '.on' : ''), { type: 'button', onclick: () => {
        st.days = st.days.includes(i) ? st.days.filter(x => x !== i) : [...st.days, i].sort((a, b) => a - b); paint(); } }, w))),
      h('label.f', null, 'Time per session'), one('minutes', [[45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min']]),
      h('label.f', null, 'Equipment'), one('equip', [['gym', 'Full gym'], ['db', 'Dumbbells only'], ['bw', 'Bodyweight only']]),
      st.days.length ? h('p.small.muted', null, 'Recommended for ' + st.days.length + ' days: ' + SPLIT_TXT[Math.min(6, st.days.length)] + '.') : null);
    paint();
    const ok = () => { if (!st.days.length) { err.textContent = 'Pick at least one training day.'; return false; } if (st.days.length > 6) { err.textContent = 'Keep at least one rest day a week.'; return false; } err.textContent = ''; return true; };
    return h('div', null, body, err, h('div.btns', null,
      h('button.btn.gold.block', { onclick: () => { if (!ok()) return; close(); previewPlan(buildRec(st), st); } }, 'Recommend a plan'),
      h('button.btn.ghost.block', { onclick: () => { if (!ok()) return; close(); openPlanEditor(blankPlan(st), null, st); } }, 'I\'ll enter my own plan')));
  });
}
function buildRec(st) {
  const p = recommend(st);
  p.days.forEach(d => d.ex.forEach(x => {
    const e = EX[x.id];
    if (st.goal === 'strength' && e && e.k === 'c' && !e.secs && e.e !== 'b') { x.reps = '4-6'; x.rest = Math.max(x.rest, 180); x.sets = Math.max(x.sets, 4); }
    if (st.goal === 'fitness') { x.sets = Math.min(x.sets, 3); x.rest = Math.min(x.rest, 90); }
  }));
  return p;
}
function blankPlan(st) {
  const days = st.days.map((wd, i) => ({ id: 'ABCDEF'[i], name: 'Day ' + (i + 1), ex: [] }));
  const sched = {}; st.days.forEach((wd, i) => { sched[wd] = days[i].id; });
  return { name: 'My plan', source: 'custom', days, sched };
}
function previewPlan(p, st) {
  modal('Your recommended plan', close => h('div', null,
    h('p.small', null, p.name.replace('Recommended · ', 'A ') + '. Compound lifts first, then isolation work. Add weight once every set reaches the top of the rep range (the logger tells you when).'),
    p.days.map(d => h('div.pday-prev', null, h('div.t1', null, d.id + ' · ' + d.name + '  ', h('span.small.muted', null, WEEKDAYS.filter((_, i) => p.sched[i] === d.id).join(', '))),
      h('div.small.muted', null, d.ex.map(x => x.name + ' ' + x.sets + '×' + x.reps).join(' · ')))),
    h('div.btns', null,
      h('button.btn.gold.block', { onclick: async () => { if (await savePlan(p, p.sched, st)) close(); } }, 'Use this plan'),
      h('button.btn.ghost.block', { onclick: () => { close(); openPlanEditor(p, p.sched, st); } }, 'Change it first'))));
}
async function savePlan(plan, sched, setup) {
  const tr = trainCfg() || {};
  const t = today();
  const hist = (tr.sched || []).filter(s => s.from < t);
  hist.push({ from: t, map: sched });
  const clean = { name: plan.name, source: plan.source, days: plan.days.map(d => ({ id: d.id, name: d.name, ex: d.ex.map(x => ({ id: x.id || '', name: x.name, sets: Number(x.sets) || 3, reps: String(x.reps || '8-12'), rest: Number(x.rest) || 90 })) })) };
  return saveGame({ train: { ...tr, setup: setup || tr.setup || null, plan: clean, sched: hist } }).then(ok => { if (ok) toast('Plan saved'); return ok; });
}

// ----- plan editor -----
function openPlanEditor(plan0, sched0, setup) {
  const plan = JSON.parse(JSON.stringify(plan0));
  const sched = { ...(sched0 || plan0.sched || {}) };
  modal('Edit plan', close => {
    const body = h('div'), err = h('div.err');
    const nextId = () => 'ABCDEFGH'.split('').find(c => !plan.days.some(d => d.id === c));
    const paint = () => body.replaceChildren(
      h('label.f', null, 'Plan name'), h('input.in', { value: plan.name, maxlength: 60, oninput: e => { plan.name = e.target.value; } }),
      ...plan.days.map((d, di) => h('div.pedit', null,
        h('div.row', null, h('b.badge', null, d.id), h('input.in.grow', { value: d.name, maxlength: 30, 'aria-label': 'Day name', oninput: e => { d.name = e.target.value; } }),
          h('button.btn.sm.ghost', { type: 'button', 'aria-label': 'Remove day', onclick: () => { if (d.ex.length && !confirm('Remove ' + d.name + '?')) return; plan.days.splice(di, 1); Object.keys(sched).forEach(k => { if (sched[k] === d.id) delete sched[k]; }); paint(); } }, '✕')),
        d.ex.map((x, xi) => h('div.exrow', null,
          h('div.grow', null, h('div.small', null, x.name),
            h('div.exnums', null,
              h('input.in.sm', { inputmode: 'numeric', value: x.sets, 'aria-label': 'Sets', oninput: e => { x.sets = e.target.value; } }), h('span', null, 'sets ×'),
              h('input.in.sm.w', { value: x.reps, 'aria-label': 'Reps', oninput: e => { x.reps = e.target.value; } }), h('span', null, 'reps'),
              h('select.in.sm.w', { 'aria-label': 'Rest', onchange: e => { x.rest = Number(e.target.value); } }, [45, 60, 90, 120, 150, 180, 240].map(s => h('option', { value: s, selected: Number(x.rest) === s }, fmtRest(s) + ' rest'))))),
          h('div.exbtns', null,
            h('button', { type: 'button', 'aria-label': 'Move up', disabled: xi === 0, onclick: () => { d.ex.splice(xi - 1, 0, d.ex.splice(xi, 1)[0]); paint(); } }, '▲'),
            h('button', { type: 'button', 'aria-label': 'Move down', disabled: xi === d.ex.length - 1, onclick: () => { d.ex.splice(xi + 1, 0, d.ex.splice(xi, 1)[0]); paint(); } }, '▼'),
            h('button', { type: 'button', 'aria-label': 'Remove exercise', onclick: () => { d.ex.splice(xi, 1); paint(); } }, '✕')))),
        h('button.btn.sm.ghost', { type: 'button', style: 'margin-top:8px', onclick: () => pickExercise(x => { d.ex.push(x); paint(); }) }, '+ Add exercise'))),
      plan.days.length < 7 ? h('div.btns', null, h('button.btn.sm', { type: 'button', onclick: () => { const id = nextId(); plan.days.push({ id, name: 'Day ' + (plan.days.length + 1), ex: [] }); paint(); } }, '+ Add day')) : null,
      h('label.f', null, 'Weekly schedule'),
      h('div.sched', null, WEEKDAYS.map((w, i) => h('label.srow', null, h('span', null, w),
        h('select.in.sm', { onchange: e => { if (e.target.value) sched[i] = e.target.value; else delete sched[i]; } },
          h('option', { value: '' }, 'Rest'), plan.days.map(d => h('option', { value: d.id, selected: sched[i] === d.id }, d.id + ' · ' + d.name)))))));
    paint();
    const save = h('button.btn.gold.block', { onclick: async () => {
      plan.days.forEach(d => { d.name = d.name.trim() || 'Day ' + d.id; });
      if (!plan.days.length || plan.days.every(d => !d.ex.length)) { err.textContent = 'Add at least one exercise.'; return; }
      Object.keys(sched).forEach(k => { if (!plan.days.some(d => d.id === sched[k])) delete sched[k]; });
      if (!Object.keys(sched).length) { err.textContent = 'Schedule at least one day.'; return; }
      plan.name = plan.name.trim() || 'My plan';
      if (plan0.source === 'rec' && JSON.stringify(plan.days) !== JSON.stringify(plan0.days)) plan.source = 'custom';
      if (await savePlan(plan, sched, setup)) close();
    } }, 'Save plan');
    return h('div', null, body, err, h('div.btns', null, save),
      h('p.small.muted', null, 'Schedule changes apply from today. Past days keep the schedule they had.'));
  });
}
function pickExercise(onPick) {
  modal('Add exercise', close => {
    const q = h('input.in', { placeholder: 'Search or type a new exercise', autocomplete: 'off' });
    const list = h('div');
    const paint = () => {
      const s = q.value.trim().toLowerCase();
      const groups = {};
      Object.entries(EX).forEach(([id, x]) => { if (!s || x.name.toLowerCase().includes(s) || x.m.toLowerCase().includes(s)) (groups[x.m] = groups[x.m] || []).push([id, x]); });
      const custom = s && !Object.values(EX).some(x => x.name.toLowerCase() === s)
        ? h('button.item.plain', { onclick: () => { close(); onPick({ id: '', name: q.value.trim().slice(0, 40), sets: 3, reps: '8-12', rest: 90 }); } }, h('div.grow', null, h('div.t1', null, '+ Add "' + q.value.trim() + '"'), h('div.t2', null, 'Your own exercise'))) : null;
      list.replaceChildren(h('div.list', null, custom, Object.entries(groups).map(([m, xs]) => [h('div.glab', null, m),
        xs.map(([id, x]) => h('button.item.plain', { onclick: () => { close(); onPick({ id, name: x.name, sets: x.k === 'c' ? 3 : 3, reps: x.reps, rest: x.rest }); } },
          h('div.grow', null, h('div', null, x.name), h('div.t2', null, { g: 'Gym', d: 'Dumbbells', b: 'Bodyweight' }[x.e] + ' · ' + x.reps + (x.secs ? ' s' : ' reps'))))) ])));
    };
    q.addEventListener('input', paint); paint();
    setTimeout(() => q.focus(), 50);
    return h('div', null, q, list);
  });
}

// ----- workout logger -----
let restTimer = null;
function beep() {
  try { const A = window.AudioContext || window.webkitAudioContext; const a = new A(), o = a.createOscillator(), gn = a.createGain();
    o.frequency.value = 880; o.connect(gn); gn.connect(a.destination); gn.gain.setValueAtTime(.2, a.currentTime); gn.gain.exponentialRampToValueAtTime(.001, a.currentTime + .5); o.start(); o.stop(a.currentTime + .5); } catch (e) { /* no sound */ }
}
function newDraft(dayId, past) {
  const tr = trainCfg(), d = planDay(tr, dayId), ws = workouts();
  return {
    date: today(), dayId: d ? d.id : '', name: d ? d.name : 'Workout', started: Date.now(), past: !!past,
    ex: (d ? d.ex : []).map(x => draftEx(x, ws)),
  };
}
function draftEx(x, ws) {
  const e = EX[x.id], last = lastFor(ws, x.name, x.reps, e && e.step);
  const kg = last && last.tip && last.tip.kg ? last.tip.kg : last ? last.kg : '';
  return { id: x.id || '', n: x.name, reps: x.reps, rest: Number(x.rest) || 90, s: Array.from({ length: Number(x.sets) || 3 }, () => [kg > 0 ? kg : '', '', 0]) };
}
function openWorkout(opt) {
  let wo = opt.resume ? loadDraft() : null;
  if (!wo) { wo = newDraft(opt.dayId, opt.past); saveDraft(wo); }
  const ws = workouts();
  const ov = h('div.ov.full');
  const close = () => { clearInterval(tick); ov.remove(); render(); };
  const store = () => saveDraft(wo);
  const clock = h('span.num');
  const timerBar = h('div.restbar', { hidden: true });
  const startRest = secs => {
    restTimer = { end: Date.now() + secs * 1000, total: secs };
    paintTimer();
  };
  const paintTimer = () => {
    if (!restTimer) { timerBar.hidden = true; return; }
    const left = Math.max(0, Math.round((restTimer.end - Date.now()) / 1000));
    timerBar.hidden = false;
    timerBar.replaceChildren(h('div.grow', null, h('div.tiny.muted', null, 'REST'), h('div.big-num', null, fmtRest(left))),
      h('button.btn.sm.ghost', { onclick: () => { restTimer.end -= 15000; paintTimer(); } }, '−15'),
      h('button.btn.sm.ghost', { onclick: () => { restTimer.end += 15000; paintTimer(); } }, '+15'),
      h('button.btn.sm', { onclick: () => { restTimer = null; paintTimer(); } }, 'Skip'),
      h('i.fill', { style: 'width:' + (100 * left / restTimer.total).toFixed(1) + '%' }));
    if (left === 0) { restTimer = null; beep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ } toast('Rest done. Next set!'); timerBar.hidden = true; }
  };
  const tick = setInterval(() => {
    if (!ov.isConnected) return clearInterval(tick);
    const m = Math.floor((Date.now() - wo.started) / 60000);
    clock.textContent = wo.past ? '' : m + ' min';
    if (restTimer) paintTimer();
  }, 500);
  const list = h('div');
  const paint = () => list.replaceChildren(...wo.ex.map((x, xi) => {
    const e = EX[x.id], last = lastFor(ws, x.n, x.reps, e && e.step), bw = e && e.e === 'b';
    return h('section.excard', null,
      h('div.row', null, h('div.grow', null, h('div.t1', null, x.n), h('div.small.muted', null, x.s.length + ' × ' + x.reps + (e && e.secs ? ' s' : '') + ' · rest ' + fmtRest(x.rest))),
        h('button.icon', { 'aria-label': 'Remove exercise', onclick: () => { if (x.s.some(s => s[2]) && !confirm('Remove ' + x.n + '?')) return; wo.ex.splice(xi, 1); store(); paint(); } }, '✕')),
      last ? h('div.small.last', null, 'Last time (' + shortDate(last.date) + '): ' + setsTxt(last.sets)) : h('div.small.last', null, 'First time: pick a weight you can lift for ' + x.reps + ' with 1–2 reps to spare.'),
      last && last.tip ? h('div.small.tip', null, last.tip.text + (last.tip.kg ? kgTxt(last.tip.kg) + '.' : '')) : null,
      h('div.sets', null, h('div.sh', null, h('span', null, 'Set'), h('span', null, bw ? '+kg' : 'kg'), h('span', null, e && e.secs ? 'sec' : 'reps'), h('span')),
        x.s.map((s, si) => h('div.set' + (s[2] ? '.done' : ''), null,
          h('span.n', null, si + 1),
          h('input.in.sm', { inputmode: 'decimal', value: s[0], placeholder: bw ? 'BW' : 'kg', 'aria-label': 'Weight set ' + (si + 1), oninput: ev => { s[0] = ev.target.value; store(); } }),
          h('input.in.sm', { inputmode: 'numeric', value: s[1], placeholder: String(x.reps).split('-').pop(), 'aria-label': 'Reps set ' + (si + 1), oninput: ev => { s[1] = ev.target.value; store(); } }),
          h('button.tickbtn', { 'aria-label': 'Set done', onclick: () => {
            if (!s[2] && !(Number(s[1]) > 0)) { s[1] = String(x.reps).split('-').pop(); }
            s[2] = s[2] ? 0 : 1;
            if (s[2]) { const nx = x.s[si + 1]; if (nx && nx[0] === '' && s[0] !== '') nx[0] = s[0]; if (!wo.past) startRest(x.rest); }
            store(); paint();
          } }, s[2] ? '✓' : '')))),
      h('div.btns', null, h('button.btn.sm.ghost', { onclick: () => { const p = x.s[x.s.length - 1]; x.s.push([p ? p[0] : '', '', 0]); store(); paint(); } }, '+ Set'),
        x.s.length > 1 ? h('button.btn.sm.ghost', { onclick: () => { x.s.pop(); store(); paint(); } }, '− Set') : null));
  }), h('div.btns', null, h('button.btn.ghost.block', { onclick: () => pickExercise(x => { wo.ex.push(draftEx(x, ws)); store(); paint(); }) }, '+ Add exercise')));
  paint();
  const date = h('input.in.sm', { type: 'date', value: wo.date, max: today(), onchange: e => { wo.date = e.target.value; store(); } });
  const mins = h('input.in.sm', { inputmode: 'numeric', placeholder: 'min', value: wo.min || '', oninput: e => { wo.min = e.target.value; store(); } });
  const finish = async () => {
    const ex = wo.ex.map(x => ({ n: x.n, s: x.s.filter(s => (s[2] || Number(s[1]) > 0) && Number(s[1]) > 0).map(s => [Math.max(0, Number(String(s[0]).replace(',', '.')) || 0), Math.round(Number(s[1]))]) })).filter(x => x.s.length);
    if (!ex.length) { toast('Log at least one set first.'); return; }
    if (!wo.date || wo.date > today()) { toast('That date isn\'t valid.'); return; }
    const min = wo.past ? (Number(wo.min) || 0) : Math.max(1, Math.round((Date.now() - wo.started) / 60000));
    const data = { day: wo.dayId, name: wo.name, ex, min: Math.min(min, 600) };
    if (await act(() => api('logAdd', [{ date: wo.date, kind: 'workout', data }]), 'Workout saved: ' + ex.reduce((s, x) => s + x.s.length, 0) + ' sets')) {
      saveDraft(null); restTimer = null; close();
    }
  };
  ov.append(h('div.sheet.full', { role: 'dialog', 'aria-label': 'Workout' },
    h('div.wohead', null, h('div.grow', null, h('h3', { style: 'margin:0' }, wo.name), h('div.small.muted', null, wo.past ? 'Logging a past workout' : 'In progress · ', clock)),
      h('button.btn.sm.ghost', { onclick: () => { saveDraft(wo); close(); } }, 'Minimise')),
    wo.past ? h('div.grid2', null, h('div', null, h('label.f', null, 'Date'), date), h('div', null, h('label.f', null, 'Duration (min)'), mins)) : null,
    list,
    h('div.btns', null, h('button.btn.gold.block', { onclick: finish }, 'Finish workout'),
      h('button.btn.red.block', { onclick: () => { if (confirm('Discard this workout? Logged sets will be lost.')) { saveDraft(null); restTimer = null; close(); } } }, 'Discard')),
    timerBar));
  document.body.append(ov);
}
function openWorkoutDetail(w) {
  modal(w.data.name, close => h('div', null,
    h('div.small.muted', null, DAYS[dow(w.date)] + ', ' + shortDate(w.date) + (w.data.min ? ' · ' + w.data.min + ' min' : '') + ' · ' + setCount(w) + ' sets · ' + Math.round(volume(w)).toLocaleString('en-US') + ' kg'),
    h('div.list', null, (w.data.ex || []).map(x => h('div.item', null, h('div.grow', null, h('div.t1', null, x.n), h('div.t2', null, setsTxt(x.s)))))),
    h('div.btns', null, h('button.btn.red', { onclick: async () => { if (!confirm('Delete this workout?')) return; if (await act(() => api('logDelete', w.id), 'Workout deleted')) close(); } }, 'Delete workout'))));
}

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__lrpg = { S, render, recompute };
boot();

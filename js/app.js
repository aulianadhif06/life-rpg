import { api, auth, cached } from './api.js';
import { CONNECT_URL } from './config.js';
import { lockOn, lockState, lockSupported, enableLock, unlock, disableLock, wipeLock, relock, RELOCK_MS } from './lock.js';
import { compute, RULES } from './game.js';
import { bossCanvas, carCanvas, iconCanvas } from './sprites.js';
import { kindOf, energyDay, EX, WEEKDAYS, SPLIT_TXT, SPORTS, EFFORT, FOODS, ACTIVITY, GOALS, sportKcal, isSport, targets, weightAvg, latestWeight, sessionsOn, schedIds, recommend, schedOn, sessionOn, prTable, lastFor, volume, setCount, weekStart, wdOf, fmtRest } from './train.js';
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
const S = { locked: false, data: null, g: null, view: 'home', calMonth: null, calSel: null, busy: false, txSel: null };
const VIEWS = [['home', 'Home', 'sword'], ['jurnal', 'Journal', 'star'], ['train', 'Health', 'dumbbell'], ['arena', 'Budget', 'shield'], ['harta', 'Vault', 'chest']];
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

let actQueue = Promise.resolve();
function act(fn, okMsg) {
  const run = actQueue.then(() => actNow(fn, okMsg));
  actQueue = run.catch(() => {});
  return run;
}
async function actNow(fn, okMsg) {
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

/** Show the change immediately, save in the background; on failure undo it and offer a retry. */
function optimistic(apply, fn, okMsg, retry) {
  const undo = apply();
  S.pending = (S.pending || 0) + 1;
  recompute(true); render(); if (okMsg) toast(okMsg);
  act(fn).then(ok => {
    S.pending--;
    if (!ok) { undo(); recompute(false); render(); if (retry) toast('⚠ Not saved. Tap Add to try again.', 5000); }
  });
}
const tmpId = () => 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
function addTxnsFast(list, okMsg) {
  const rows = list.map((x, i) => ({ id: tmpId(), toAccount: '', note: '', ...x, createdAt: Date.now() + i }));
  optimistic(() => { S.data.txns.push(...rows); return () => { S.data.txns = S.data.txns.filter(t => !rows.includes(t)); }; },
    () => api('addTxns', list), okMsg, true);
}
function logAddFast(list, okMsg) {
  const rows = list.map((x, i) => ({ id: tmpId(), ...x, createdAt: Date.now() + i }));
  S.data.journal = S.data.journal || [];
  optimistic(() => { S.data.journal.push(...rows); return () => { S.data.journal = S.data.journal.filter(t => !rows.includes(t)); }; },
    () => api('logAdd', list), okMsg, true);
}
async function saveGame(patch) {
  const cfg = { ...gameCfg(), ...patch };
  return act(() => api('saveSettings', { game: JSON.stringify(cfg) }));
}

// ---------- boot ----------
async function boot() {
  const m = location.hash.match(/[#&]k=([a-f0-9]{20,})/i);
  if (m) history.replaceState(null, '', location.pathname);
  const pending = m ? m[1] : null;
  if (lockOn()) return renderLock(pending);
  if (pending) auth.set(pending);
  start();
}
async function start() {
  S.locked = false;
  if (!auth.key) return renderPair();
  const c = cached();
  if (c) { S.data = c; recompute(false); render(); }
  else document.body.replaceChildren(h('div.pair', null, avatarCanvas(DEFAULT_AVATAR, 'ok', 3), h('h1', null, 'LIFE RPG'), h('p.muted', null, 'Loading your world…')));
  await refresh(!!c);
}
function renderLock(pending) {
  S.locked = true;
  document.querySelectorAll('.ov').forEach(o => o.remove());
  const err = h('div.err');
  const go = async () => {
    err.textContent = '';
    try {
      const r = await unlock();
      if (lockState().enc) auth.unlocked(r.key, r.cache);
      if (pending) auth.set(pending);
      start();
    } catch (e) { err.textContent = e && e.name === 'NotAllowedError' ? 'Face ID was cancelled. Tap to try again.' : (e.message || 'Couldn\'t unlock.'); }
  };
  const cfg = (() => { try { return { avatar: JSON.parse((cached() || {}).settings.game).avatar }; } catch (e) { return {}; } })();
  document.body.replaceChildren(h('div.pair', null,
    avatarCanvas(avatarOf(cfg), 'ok', 3), h('h1', null, 'LIFE RPG'), h('p.muted', null, 'Locked. Your data stays hidden until you confirm it\'s you.'),
    h('div.btns', null, h('button.btn.gold.block', { onclick: go }, 'UNLOCK WITH FACE ID')), err,
    h('details', { style: 'margin-top:26px;text-align:left' }, h('summary.small.muted', null, 'Can\'t use Face ID?'),
      h('p.small.muted', null, 'Sign in again with your Google account. This removes the lock and the saved copy on this device; your data in Google Sheets is not affected.'),
      h('div.btns', null, h('button.btn.ghost.block', { onclick: () => { auth.clear(); wipeLock(); S.locked = false; renderPair(); } }, 'Sign in with Google again')))));
}
let lastHidden = 0;
function relockNow() {
  relock(); if (lockState().enc) auth.forget();
  S.data = null; S.g = null;
  renderLock(null);
}
let refreshing = null;
async function refresh(quiet) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const d = await api('getData');
      if (S.pending) return false;                 // a save is in flight; its own result will update the screen
      const first = !S.data; S.data = d; recompute(quiet && !first); render();
      return true;
    } catch (e) {
      if (e.auth) { auth.clear(); renderPair('Your session has ended. Please sign in again.'); }
      else if (!quiet) toast('⚠ ' + e.message, 4500);
      return false;
    } finally { refreshing = null; }
  })();
  const ok = await refreshing;
  if (!ok) return;
  if (!gameCfg().start) await saveGame({ start: today(), name: gameCfg().name || 'Hero' });
  checkLevelUp();
  syncGarmin(false);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { lastHidden = Date.now(); return; }
  if (S.locked) return;
  if (lockOn() && lastHidden && Date.now() - lastHidden > RELOCK_MS) return relockNow();
  if (S.data && auth.key) refresh(true);
});

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
function appRoot() {
  let r = document.getElementById('app');
  if (!r || r.parentNode !== document.body) { document.body.querySelectorAll(':scope > .pair').forEach(x => x.remove()); r = h('div', { id: 'app' }); document.body.prepend(r); }
  return r;
}
function render() {
  if (S.locked || !S.data || !S.g) return;
  const y = window.scrollY;
  const views = { home: viewHome, jurnal: viewJurnal, train: viewHealth, arena: viewArena, harta: viewHarta };
  appRoot().replaceChildren(hud(), h('main', null, views[S.view]()), ...nav());
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
  return [h('button.fab', { onclick: () => openAdd(), 'aria-label': 'Add transaction', title: 'Add transaction' }, '+'),
    h('nav.nav', null, VIEWS.map(([id, label, ico]) => h('button' + (S.view === id ? '.on' : ''), { onclick: () => go(id) }, iconCanvas(ico, 3), label)))];
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
    const doneK = workouts().filter(w => w.date === t.date).map(kindOf);
    const todo = (restOn(t.date) ? [] : sessionsOn(tr, t.date)).filter(x => { let k = doneK.indexOf(x.type); if (k < 0) k = doneK.indexOf('any'); if (k >= 0) { doneK.splice(k, 1); return false; } return true; });
    const late = (g.gym.pending || []).filter(p => p.date < t.date);
    if (late.length) gymP = panel('Training', 'make-up day', h('p.small', null, 'You missed ' + late.map(x => x.name).join(', ') + '. Do it today or lose ' + (-RULES.gym.missed) + ' HP at midnight.'), h('div.btns', null, h('button.btn.gold', { onclick: () => { S.hTab = 'train'; go('train'); } }, 'Go to training')));
    else if (todo.length) gymP = panel('Training', 'today', todo.map(x => h('div.row', { style: 'margin-bottom:8px' }, iconCanvas(x.type === 'sport' ? 'bolt' : 'dumbbell', 3), h('div.grow', null, h('div.t1', null, x.name), h('div.small.muted', null, '+' + RULES.gym.xp + ' XP when you finish.')),
      x.type === 'sport' ? h('button.btn.sm.gold', { onclick: () => openActivity({ sport: x.sport, min: x.min, name: x.name }) }, 'Log')
        : h('button.btn.sm.gold', { onclick: () => openWorkout(loadDraft() ? { resume: true } : { dayId: x.id }) }, loadDraft() ? 'Resume' : 'Start'))));
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
      close();
      addTxnsFast([{ type, amount: n, account: from.value, toAccount: type === 'tf' ? to.value : '', category: type === 'tf' ? '' : cat, date: date.value, note: note.value.trim(), src: 'rpg' }], 'Saved ' + rp(n));
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
      lockBox(), garminBox(close),
      h('p.small.muted', { style: 'margin-top:18px' }, h('a', { href: 'https://github.com/aulianadhif06/life-rpg/blob/main/CREDITS.md', target: '_blank', rel: 'noopener', style: 'color:inherit' }, 'Art credits')),
      h('p.small.muted', null, 'Adventure started ' + shortDate(S.g.start) + ' ' + S.g.start.slice(0, 4) + '. Your data lives in your Google Sheet; this device only keeps a copy.'),
      h('div.btns', null,
        h('button.btn.ghost', { onclick: () => { close(); refresh(true); } }, 'Refresh data'),
        h('button.btn.red', { onclick: () => { if (confirm('Sign out on this device?')) { auth.clear(); wipeLock(); location.reload(); } } }, 'Sign out')));
  });
}
const GARMIN_KEY_URL = 'https://connect.garmin.com/app/settings/personalApiToken';
function garminBox(closeSettings) {
  const gm = S.data.garmin;
  const box = h('div.wsec', { style: 'margin-top:18px' }, h('div.wlab', null, 'Garmin'));
  if (!gm) return box.append(h('p.small.muted', null, 'Garmin sync needs the latest Google script update.')), box;
  if (!gm.keySet) {
    box.append(h('p.small.muted', null, 'Not connected. Pull runs, padel and other activities plus steps, sleep and Body Battery from your watch:'),
      h('ol.small.muted.steps', null,
        h('li', null, 'Open ', h('a', { href: GARMIN_KEY_URL, target: '_blank', rel: 'noopener', style: 'color:var(--c)' }, 'Garmin Connect → Personal API Key'), ', sign in, tap Create Key, choose 1 year, and copy the key.'),
        h('li', null, 'In your Apps Script project: Project Settings → Script Properties → add GARMIN_API_KEY and paste the key.'),
        h('li', null, 'Come back here and tap Sync now.')),
      h('div.btns', null, h('button.btn.sm', { onclick: () => { closeSettings(); syncGarmin(true, 30); } }, 'Sync now')));
  } else {
    box.append(h('p.small.muted', null, gm.error ? '⚠ Last sync failed: ' + gm.error : gm.last ? 'Connected. Last sync ' + new Date(gm.last).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '. Syncs automatically when you open the app (at most hourly).' : 'Key saved. Tap Sync now for the first sync.'),
      h('div.btns', null, h('button.btn.sm', { onclick: () => { closeSettings(); syncGarmin(true, gm.last ? 7 : 30); } }, 'Sync now')));
  }
  return box;
}
let garminBusy = false;
async function syncGarmin(manual, days = 7) {
  const gm = S.data && S.data.garmin;
  if (garminBusy || !gm || (!gm.keySet && !manual)) return;
  if (!manual && gm.last && Date.now() - new Date(gm.last).getTime() < 3600e3) return;
  if (!manual && gm.error && /menolak|GARMIN_API_KEY/.test(gm.error)) return;
  garminBusy = true;
  try {
    const before = workouts().length;
    const d = await api('garminSync', days);
    if (d && d.txns) { S.data = d; recompute(true); render(); }
    const added = workouts().length - before;
    if (manual || added) toast(added ? 'Garmin: ' + added + ' new activit' + (added === 1 ? 'y' : 'ies') : 'Garmin is up to date');
  } catch (e) {
    if (manual) toast('⚠ Garmin: ' + (/tidak dikenal/.test(e.message) ? 'needs the latest Google script update.' : e.message), 6000);
  } finally { garminBusy = false; }
}
function lockBox() {
  const box = h('div.wsec', { style: 'margin-top:18px' });
  const paint = async () => {
    const on = lockOn(), st = lockState(), ok = await lockSupported();
    box.replaceChildren(h('div.wlab', null, 'Face ID lock'),
      h('p.small.muted', null, on
        ? (st.enc ? 'On. The app asks for Face ID when it opens or after ' + Math.round(RELOCK_MS / 60000) + ' minutes in the background, and your key and data on this phone are encrypted.'
          : 'On. The app asks for Face ID, but this browser can\'t encrypt the saved data, so the lock mainly stops casual access.')
        : ok ? 'Ask for Face ID (or your passcode) every time the app opens.' : 'This browser doesn\'t offer Face ID or Touch ID for web apps.'),
      h('div.btns', null, on
        ? h('button.btn.ghost', { onclick: async () => { if (!confirm('Turn off the Face ID lock on this device?')) return; disableLock(auth.key, cached()); toast('Face ID lock is off'); paint(); } }, 'Turn off')
        : ok ? h('button.btn', { onclick: async () => {
          try { const r = await enableLock(auth.key, cached()); toast(r.enc ? 'Face ID lock is on. Data encrypted.' : 'Face ID lock is on'); }
          catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Face ID setup was cancelled' : '⚠ ' + (e.message || 'Couldn\'t set up Face ID'), 4000); }
          paint();
        } }, 'Turn on Face ID lock') : null));
  };
  paint();
  return box;
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

// ---------- HEALTH (training · food · body) ----------
const trainCfg = () => gameCfg().train || null;
const bodyCfg = () => gameCfg().body || null;
const J = kind => (S.data.journal || []).filter(j => j.kind === kind);
const workouts = () => J('workout').sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);
const gymWorkouts = () => workouts().filter(w => !isSport(w));
const restOn = d => (S.data.journal || []).find(j => j.kind === 'rest' && j.date === d);
const WO_KEY = 'lrpg.wo';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(WO_KEY) || 'null'); } catch (e) { return null; } };
const saveDraft = d => { try { d ? localStorage.setItem(WO_KEY, JSON.stringify(d)) : localStorage.removeItem(WO_KEY); } catch (e) { /* ignore */ } };
const kgTxt = kg => (kg > 0 ? (Math.round(kg * 100) / 100) + ' kg' : 'BW');
const setsTxt = sets => sets.map(([kg, r]) => (kg > 0 ? (Math.round(kg * 100) / 100) + '×' : '') + r).join(' · ');
const planDay = (tr, id) => tr && tr.plan && tr.plan.days.find(d => d.id === id);
const sportName = k => (SPORTS[k] || SPORTS.other).name;
const bodyWeight = () => weightAvg(S.data.journal, today()) || latestWeight(S.data.journal, today()) || Number((bodyCfg() || {}).weight) || 70;
const wDesc = w => isSport(w)
  ? (w.data.min ? w.data.min + ' min' : '') + (w.data.km ? ' · ' + w.data.km + ' km' : '') + (w.data.kcal ? ' · ' + w.data.kcal + ' kcal' : '') + (w.data.src === 'garmin' ? ' · Garmin' : '')
  : setCount(w) + ' sets' + (w.data.min ? ' · ' + w.data.min + ' min' : '');
const dayDesc = d => d.type === 'sport' ? sportName(d.sport) + (d.min ? ' · ' + d.min + ' min' : '') : d.ex.length + ' exercises';

function nextSession(tr, from) {
  for (let i = 1; i <= 7; i++) { const d = addDays(from, i), s = sessionsOn(tr, d)[0]; if (s) return { date: d, ...s }; }
  return null;
}
function weekCells(tr) {
  const t = today(), ws = weekStart(t), all = workouts();
  const byDay = {}; all.forEach(w => { (byDay[w.date] = byDay[w.date] || []).push(w); });
  return WEEKDAYS.map((wd, i) => {
    const d = addDays(ws, i), ss = sessionsOn(tr, d), done = byDay[d], rest = restOn(d);
    let st = 'up';
    if (done && done.length >= ss.length) st = 'done';
    else if (!ss.length) st = done ? 'done' : 'off';
    else if (rest) st = 'rest';
    else if (d < t) { const nx = addDays(d, 1); st = byDay[nx] ? 'done' : nx >= t ? 'late' : 'miss'; }
    return h('div.wk.' + st + (d === t ? '.today' : ''), null, h('b', null, wd), h('span', null, done && st === 'done' ? '✓' : ss.length ? ss.map(s => s.id).join('') : '·'));
  });
}

function viewHealth() {
  const tab = S.hTab || 'train';
  const tabs = h('div.tabs.htabs', null, [['train', 'Training'], ['food', 'Food'], ['body', 'Body']].map(([k, l]) =>
    h('button' + (tab === k ? '.on' : ''), { onclick: () => { S.hTab = k; render(); } }, l)));
  return h('div', null, h('div.hbar', null, tabs), tab === 'food' ? viewFood() : tab === 'body' ? viewBody() : viewTrain());
}

function viewTrain() {
  const tr = trainCfg(), t = today(), g = S.g;
  if (!tr || !tr.plan) {
    return h('div', null, panel('Training', null,
      h('p', null, 'Set up your routine: gym days plus the sports you play (running, padel, basketball, football…). Get a recommended gym plan or enter your own.'),
      h('div.list', null,
        h('div.item', null, iconCanvas('dumbbell', 3), h('div.grow', null, h('div.t1', null, 'Log every set'), h('div.t2', null, 'Weights and reps are filled in from last time, with a rest timer between sets.'))),
        h('div.item', null, iconCanvas('bolt', 3), h('div.grow', null, h('div.t1', null, 'Sports count too'), h('div.t2', null, 'Schedule a run or padel like any session; log the time, distance and effort, or let Garmin sync it.'))),
        h('div.item', null, iconCanvas('heart', 3), h('div.grow', null, h('div.t1', null, 'Show up, earn XP; skip, lose HP'), h('div.t2', null, '+' + RULES.gym.xp + ' XP, +' + RULES.gym.gold + ' G, +' + RULES.gym.hp + ' HP per session. A missed session costs ' + (-RULES.gym.missed) + ' HP after one make-up day.')))),
      h('div.btns', null, h('button.btn.gold.block', { onclick: openTrainSetup }, 'Set up training'),
        h('button.btn.ghost.block', { onclick: () => openActivity({}) }, 'Just log an activity'))),
      workouts().length ? panel('History', null, h('div.list', null, workouts().slice(-12).reverse().map(w => h('button.item.plain', { onclick: () => openWorkoutDetail(w) },
        iconCanvas(isSport(w) ? 'bolt' : 'dumbbell', 2), h('div.grow', null, h('div.t1', null, w.data.name), h('div.t2', null, DAYS[dow(w.date)] + ', ' + shortDate(w.date) + ' · ' + wDesc(w))))))) : null);
  }
  const ws = workouts(), draft = loadDraft();
  const sessions = restOn(t) ? [] : sessionsOn(tr, t), doneToday = ws.filter(w => w.date === t);
  const makeup = (g.gym.pending || []).filter(p => p.date < t);
  const doneKinds = doneToday.map(kindOf);
  const todo = sessions.filter(s => { let i = doneKinds.indexOf(s.type); if (i < 0) i = doneKinds.indexOf('any'); if (i >= 0) { doneKinds.splice(i, 1); return false; } return true; });
  const startFor = s => s.type === 'sport'
    ? h('button.btn.gold', { onclick: () => openActivity({ sport: s.sport, min: s.min, name: s.name }) }, 'Log ' + s.name)
    : h('button.btn.gold', { onclick: () => openWorkout({ dayId: s.id }) }, 'Start ' + s.name);
  const kids = [];
  if (draft) kids.push(h('div.callout', null, h('b', null, 'Workout in progress: ' + draft.name), h('div.small.muted', null, 'Started ' + shortDate(draft.date) + '. Your sets are saved on this phone.')),
    h('div.btns', null, h('button.btn.gold', { onclick: () => openWorkout({ resume: true }) }, 'Resume workout')));
  makeup.forEach(p => {
    const s = sessionsOn(tr, p.date).find(x => x.name === p.name) || { name: p.name, type: p.type || 'gym' };
    kids.push(h('div.callout.warn', null, h('b', null, 'You missed ' + p.name + ' (' + WEEKDAYS[wdOf(p.date)] + ').'), h('div.small', null, 'Do it today to keep your HP. At midnight it costs ' + (-RULES.gym.missed) + ' HP.')),
      draft ? null : h('div.btns', null, startFor(s)));
  });
  if (doneToday.length) kids.push(h('div.callout.good', null, h('b', null, 'Done today: ' + doneToday.map(w => w.data.name).join(', ')), h('div.small.muted', null, doneToday.map(wDesc).join(' / '))));
  if (restOn(t)) kids.push(h('div.callout', null, h('b', null, 'Rest day taken (' + restOn(t).data.reason + ')'), h('div.small.muted', null, 'Today\'s sessions are excused. No HP lost.')),
    h('div.btns', null, h('button.btn.sm.ghost', { onclick: () => act(() => api('logDelete', restOn(t).id), 'Rest day removed') }, 'Undo rest day')));
  todo.forEach(s => {
    const d = planDay(tr, s.id);
    kids.push(h('div.big-num', { style: 'margin-top:8px' }, s.name), h('div.small.muted', null, s.type === 'sport' ? sportName(s.sport) + (s.min ? ' · target ' + s.min + ' min' : '')
      : d ? d.ex.length + ' exercises · ' + d.ex.reduce((x, e) => x + Number(e.sets || 0), 0) + ' sets · about ' + (tr.setup && tr.setup.minutes || 60) + ' min' : ''),
    draft && s.type !== 'sport' ? null : h('div.btns', null, startFor(s)));
  });
  if (todo.length && !restOn(t)) kids.push(h('div.btns', null, h('button.btn.sm.ghost', { onclick: () => openRestDay(t) }, 'Can\'t train today')));
  if (!sessions.length && !restOn(t) && !doneToday.length) {
    const n = nextSession(tr, t);
    kids.push(h('div.big-num', null, 'Rest day'), h('div.small.muted', null, n ? 'Next: ' + n.name + ' on ' + DAYS[dow(n.date)] + ', ' + shortDate(n.date) + '.' : 'No sessions scheduled.'));
  }
  kids.push(h('div.btns', null,
    h('button.btn.sm.ghost', { onclick: () => openActivity({}) }, 'Log activity'),
    h('button.btn.sm.ghost', { onclick: () => pickDayThen(id => openWorkout({ dayId: id })) }, 'Gym workout'),
    h('button.btn.sm.ghost', { onclick: () => pickDayThen(id => openWorkout({ dayId: id, past: true })) }, 'Past gym workout')));
  const todayP = panel('Today', shortDate(t), kids);
  const wk = g.gym.week;
  const weekP = panel('This week', wk.sched ? wk.done + '/' + wk.sched + ' done' : '', h('div.week', null, weekCells(tr)),
    h('p.small.muted', null, 'Clear every scheduled session this week for +' + RULES.gym.weekXp + ' XP and +' + RULES.gym.weekGold + ' G.'));

  const sched = schedOn(tr, t) || {};
  const planP = panel('Your plan', tr.plan.source === 'rec' ? 'recommended' : 'custom',
    h('div.t1', { style: 'margin-bottom:6px' }, tr.plan.name),
    tr.plan.days.map(d => {
      const on = WEEKDAYS.filter((_, i) => schedIds(sched, i).includes(d.id));
      return h('details.pday', null, h('summary', null, h('b', null, d.id + ' · ' + d.name), h('span.small.muted', null, on.length ? on.join(', ') : 'not scheduled')),
        d.type === 'sport' ? h('div.small.muted', { style: 'padding:6px 0' }, dayDesc(d))
          : h('div.list', null, d.ex.map(x => h('div.item', null, h('div.grow', null, h('div', null, x.name), h('div.t2', null, x.sets + ' × ' + x.reps + (EX[x.id] && EX[x.id].secs ? ' s' : '') + ' · rest ' + fmtRest(x.rest)))))));
    }),
    h('div.btns', null, h('button.btn.sm', { onclick: () => openPlanEditor(tr.plan, sched) }, 'Edit plan'), h('button.btn.sm.ghost', { onclick: openTrainSetup }, 'New plan')));

  const best = Object.entries(prTable(gymWorkouts())).sort((a, b) => (a[1].date < b[1].date ? 1 : -1)).slice(0, 8);
  const prP = panel('Personal records', null, best.length ? h('div.list', null, best.map(([n, p]) => h('div.item', null, h('div.grow', null, h('div.t1', null, n), h('div.t2', null, shortDate(p.date))),
    h('div.amt', null, p.bw ? p.reps + ' reps' : kgTxt(p.kg) + ' × ' + p.reps), !p.bw ? h('div.small.muted', { style: 'width:70px;text-align:right' }, '≈' + Math.round(p.v) + ' 1RM') : null)))
    : h('div.empty', null, 'Records show up after your second session of an exercise.'));

  const histP = panel('History', ws.length ? ws.length + (ws.length === 1 ? ' session' : ' sessions') : '', ws.length ? h('div.list', null, ws.slice(-12).reverse().map(w => h('button.item.plain', { onclick: () => openWorkoutDetail(w) },
    iconCanvas(isSport(w) ? 'bolt' : 'dumbbell', 2), h('div.grow', null, h('div.t1', null, w.data.name), h('div.t2', null, DAYS[dow(w.date)] + ', ' + shortDate(w.date) + ' · ' + wDesc(w))),
    isSport(w) ? null : h('div.amt', null, Math.round(volume(w)).toLocaleString('en-US') + ' kg')))) : h('div.empty', null, 'Nothing logged yet.'));

  return h('div', null, todayP, weekP, planP, prP, histP);
}

function pickDayThen(fn) {
  const tr = trainCfg();
  const days = tr && tr.plan ? tr.plan.days.filter(d => d.type !== 'sport') : [];
  modal('Which workout?', close => h('div.list', null, days.map(d => h('button.item.plain', { onclick: () => { close(); fn(d.id); } },
    h('div.grow', null, h('div.t1', null, d.id + ' · ' + d.name), h('div.t2', null, d.ex.map(x => x.name).slice(0, 4).join(', ') + (d.ex.length > 4 ? '…' : ''))))),
  h('button.item.plain', { onclick: () => { close(); fn(null); } }, h('div.grow', null, h('div.t1', null, 'Empty workout'), h('div.t2', null, 'Add exercises as you go')))));
}

function openActivity(pre) {
  modal('Log activity', close => {
    let sport = pre.sport || 'run', effort = 'moderate';
    const body = h('div'), err = h('div.err');
    const date = h('input.in', { type: 'date', value: today(), max: today() });
    const min = h('input.in', { inputmode: 'numeric', placeholder: 'e.g. 60', value: pre.min || '' });
    const km = h('input.in', { inputmode: 'decimal', placeholder: 'optional' });
    const note = h('input.in', { maxlength: 80, placeholder: 'optional' });
    const est = h('div.small.muted');
    const upd = () => { const m = Number(min.value) || 0; est.textContent = m ? 'About ' + sportKcal(sport, m, bodyWeight(), effort) + ' kcal burned (estimate).' : ''; };
    [min].forEach(i => i.addEventListener('input', upd));
    const paint = () => {
      body.replaceChildren(
        h('label.f', null, 'Activity'), h('div.chips', null, Object.entries(SPORTS).map(([k, x]) => h('button' + (sport === k ? '.on' : ''), { type: 'button', onclick: () => { sport = k; paint(); } }, x.name))),
        h('div.grid2', null, h('div', null, h('label.f', null, 'Duration (min)'), min), SPORTS[sport].dist ? h('div', null, h('label.f', null, 'Distance (km)'), km) : h('div', null, h('label.f', null, 'Date'), date)),
        SPORTS[sport].dist ? h('div', null, h('label.f', null, 'Date'), date) : null,
        h('label.f', null, 'Effort'), h('div.chips', null, EFFORT.map(([k, l]) => h('button' + (effort === k ? '.on' : ''), { type: 'button', onclick: () => { effort = k; paint(); } }, l))),
        h('label.f', null, 'Note'), note, est);
      upd();
    };
    paint();
    return h('div', null, body, err, h('div.btns', null, h('button.btn.gold.block', { onclick: async () => {
      const m = Math.round(Number(min.value) || 0);
      if (!(m > 0 && m <= 600)) { err.textContent = 'Enter how many minutes.'; return; }
      if (!date.value || date.value > today()) { err.textContent = 'That date isn\'t valid.'; return; }
      const k = SPORTS[sport].dist ? Math.round((Number(String(km.value).replace(',', '.')) || 0) * 100) / 100 : 0;
      const data = { type: 'sport', sport, name: pre.name && pre.sport === sport ? pre.name : SPORTS[sport].name, min: m, km: k || undefined, effort, kcal: sportKcal(sport, m, bodyWeight(), effort), note: note.value.trim() || undefined, src: 'manual' };
      close(); logAddFast([{ date: date.value, kind: 'workout', data }], 'Saved: ' + data.name + ' ' + m + ' min');
    } }, 'Save activity')));
  });
}

function openRestDay(date) {
  modal('Take a rest day', close => {
    let reason = 'sick';
    const chips = h('div.chips');
    const paint = () => chips.replaceChildren(...[['sick', 'Sick'], ['injured', 'Injured'], ['travel', 'Travelling'], ['other', 'Other']].map(([k, l]) => h('button' + (reason === k ? '.on' : ''), { type: 'button', onclick: () => { reason = k; paint(); } }, l)));
    paint();
    return h('div', null, h('p.small', null, 'Today\'s sessions are excused: no HP lost, no XP earned. Use it when you genuinely can\'t train.'), chips,
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => { if (await act(() => api('logAdd', [{ date, kind: 'rest', data: { reason } }]), 'Rest day saved')) close(); } }, 'Save rest day')));
  });
}

// ----- food -----
const mealsOn = d => J('meal').filter(m => m.date === d).sort((a, b) => a.createdAt - b.createdAt);
const MEAL_SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']];
const slotNow = () => { const hr = new Date().getHours(); return hr < 10 ? 'breakfast' : hr < 15 ? 'lunch' : hr < 18 ? 'snack' : 'dinner'; };
function viewFood() {
  const body = bodyCfg(), t = today();
  const d = S.foodDay && S.foodDay <= t ? S.foodDay : t;
  const tg = targets(body, weightAvg(S.data.journal, d));
  const meals = mealsOn(d);
  const sum = meals.reduce((s, m) => ({ kcal: s.kcal + (Number(m.data.kcal) || 0), p: s.p + (Number(m.data.p) || 0) }), { kcal: 0, p: 0 });
  const burned = workouts().filter(w => w.date === d && isSport(w)).reduce((s, w) => s + (Number(w.data.kcal) || 0), 0);
  const nav = h('div.row.between', { style: 'margin-bottom:10px' },
    h('button.btn.sm.ghost', { onclick: () => { S.foodDay = addDays(d, -1); render(); }, 'aria-label': 'Previous day' }, '◀'),
    h('b', null, d === t ? 'Today' : dayLabel(d)),
    h('button.btn.sm.ghost', { disabled: d >= t, onclick: () => { S.foodDay = addDays(d, 1); render(); }, 'aria-label': 'Next day' }, '▶'));
  const en = energyDay(S.data.journal, body, d, t);
  const sumP = panel('Calories', en ? (en.src === 'garmin' ? 'in vs out · Garmin' : 'in vs out · estimate') : '', nav,
    en && tg ? [
      h('div.kv', null, h('span', null, 'Eaten'), h('b.num', null, en.food.toLocaleString('en-US') + ' / ' + en.target.toLocaleString('en-US') + ' kcal')),
      bar(en.food / Math.max(1, en.target), en.food > en.target + RULES.calories.band ? 'warn' : ''),
      h('div.energy', null,
        h('div', null, h('span', null, 'Resting' + (en.src === 'garmin' ? (en.partial ? ' (full day, Garmin)' : ' (Garmin)') : ' (BMR estimate)')), h('b.num', null, en.rest.toLocaleString('en-US'))),
        h('div', null, h('span', null, 'Active' + (en.garminAct ? ' · Garmin ' + en.garminAct : '') + (en.manualAct ? ' · logged ' + en.manualAct : '') + (en.extra ? ' · added ' + en.extra : '')), h('b.num', null, '+' + en.active.toLocaleString('en-US'))),
        h('div', null, h('span', null, 'Burned (out)'), h('b.num', null, en.out.toLocaleString('en-US'))),
        h('div', null, h('span', null, (GOALS.find(x => x[0] === body.goal) || GOALS[0])[1]), h('b.num', null, (en.goal >= 0 ? '+' : '') + en.goal)),
        h('div', null, h('span', null, 'Left to eat'), h('b.num', null, Math.max(0, en.target - en.food).toLocaleString('en-US'))),
        h('div.tot', null, h('span', null, 'Balance so far'), h('b.num' + (Math.abs(en.net - en.goal) <= RULES.calories.band ? '.green' : ''), null, (en.net >= 0 ? '+' : '') + en.net.toLocaleString('en-US')))),
      h('div.kv', { style: 'margin-top:10px' }, h('span', null, 'Protein'), h('b.num', null, Math.round(sum.p) + ' / ' + tg.protein + ' g')), bar(sum.p / tg.protein, 'xp'),
      h('div.small.muted', { style: 'margin-top:6px' }, (en.partial ? 'Today\'s target grows as you move (it includes the active calories burned so far). ' : '') +
        'Land within ' + RULES.calories.band + ' kcal of your target for +' + RULES.calories.xp + ' XP; hit protein for +' + RULES.protein.xp + ' XP.'),
      weekBalance(body, t),
    ] : h('div.callout', null, h('b', null, 'Add your body stats first'), h('div.small', null, 'Height, age and weight set your protein target and the resting-calorie estimate on days without Garmin.'),
      h('div.btns', null, h('button.btn.sm', { onclick: openBodySetup }, 'Add body stats'))),
    h('div.btns', null, h('button.btn.gold', { onclick: () => openMeal({ date: d }) }, '+ Add meal'), photoButton(d),
      h('button.btn.sm.ghost', { onclick: () => openExtraActive(d) }, '+ Active kcal')));
  const listP = panel('Meals', meals.length ? meals.length + '' : '', meals.length ? MEAL_SLOTS.map(([k, l]) => {
    const xs = meals.filter(m => (m.data.slot || 'snack') === k);
    return xs.length ? [h('div.glab', null, l), h('div.list', null, xs.map(m => h('div.item', null, h('div.grow', null, h('div.t1', null, m.data.name), h('div.t2', null, Math.round(m.data.kcal || 0) + ' kcal · ' + Math.round(m.data.p || 0) + ' g protein' + (m.data.src === 'photo' ? ' · from photo' : ''))),
      h('button.btn.sm.ghost', { onclick: () => act(() => api('logDelete', m.id), 'Removed') }, '✕'))))] : null;
  }) : h('div.empty', null, 'No meals logged for this day.'));
  return h('div', null, sumP, listP);
}
function resizeImage(file, max = 1024) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8).split(',')[1]); };
    im.onerror = () => rej(new Error('Couldn\'t read that photo.'));
    im.src = url;
  });
}
const FOOD_PROMPT = ['You estimate nutrition from a meal photo for a fitness app used in Indonesia.',
  'Identify each food on the plate with a realistic portion size, then estimate calories and protein. Use typical Indonesian recipes and portions where relevant (e.g. nasi putih 1 piring ≈ 200 g ≈ 260 kcal).',
  'If the photo is not food, return an empty items list. Be conservative and do not invent hidden items.',
  'Reply ONLY with JSON, no other text: {"items":[{"name":"short name in the language usually used for it","portion":"e.g. 1 piring / 150 g","kcal":number,"protein_g":number}],"confidence":"low|medium|high","note":"one short sentence about what is uncertain"}'].join('\n');
async function readFoodPhoto(f, date) {
  document.body.classList.add('busy');
  const t = toast('Reading your meal…', 30000);
  try {
    const img = await resizeImage(f);
    const r = S.data.foodAi ? await api('foodScan', { prompt: FOOD_PROMPT, image: img }) : await api('scanDocument', { prompt: FOOD_PROMPT, images: [img] });
    const items = (r && r.items || []).filter(x => x && x.name && (Number(x.kcal) > 0 || Number(x.protein_g) > 0));
    if (!items.length) { toast('No food found in that photo. Try again or add it by hand.', 4500); return; }
    openMeal({ date, photo: { items, confidence: r.confidence || 'medium', note: r.note || '' } });
  } catch (e) { toast('⚠ Photo not read: ' + e.message, 6000); }
  finally { document.body.classList.remove('busy'); document.querySelectorAll('.toast').forEach(x => { if (/Reading your meal/.test(x.textContent)) x.remove(); }); }
}
function weekBalance(body, t) {
  const days = [];
  for (let i = 7; i >= 1; i--) { const dd = addDays(t, -i); const e = energyDay(S.data.journal, body, dd, t); if (e && e.food > 0) days.push(e); }
  if (days.length < 3) return h('div.small.muted', { style: 'margin-top:6px' }, 'Log food for a few days to see your weekly balance.');
  const avg = k => Math.round(days.reduce((s, e) => s + e[k], 0) / days.length);
  const net = avg('net'), perWeek = Math.round(net * 7 / 7700 * 100) / 100;
  return h('div.callout', { style: 'margin-top:10px' }, h('b', null, 'Last ' + days.length + ' logged days: ' + avg('food').toLocaleString('en-US') + ' in, ' + avg('out').toLocaleString('en-US') + ' out'),
    h('div.small', null, 'Average balance ' + (net >= 0 ? '+' : '') + net + ' kcal/day, roughly ' + (perWeek >= 0 ? '+' : '') + perWeek + ' kg a week if it held.'),
    h('div.small.muted', null, 'Food and watch numbers are estimates. Your 7-day weight average is the real judge: adjust the target if it moves faster or slower than planned.'));
}
function openExtraActive(date) {
  modal('Add active calories', close => {
    const v = h('input.in.big', { inputmode: 'numeric', placeholder: '0' });
    const note = h('input.in', { maxlength: 60, placeholder: 'e.g. padel without watch' });
    const err = h('div.err');
    return h('div', null, h('p.small.muted', null, 'For movement your watch didn\'t record. Activities you log in Training are already counted, so don\'t add them twice.'),
      h('label.f', null, 'Active calories'), v, h('label.f', null, 'Note'), note, err,
      h('div.btns', null, h('button.btn.gold.block', { onclick: () => {
        const k = Math.round(Number(v.value) || 0);
        if (!(k > 0 && k < 5000)) { err.textContent = 'Enter calories between 1 and 5,000.'; return; }
        close(); logAddFast([{ date, kind: 'energy', data: { active: k, note: note.value.trim() || undefined } }], '+' + k + ' active kcal');
      } }, 'Add')));
  });
}
function photoButton(date) {
  // A real <label> around the file input: iPhone only opens the camera reliably from a direct tap on the input.
  const inp = h('input', { type: 'file', accept: 'image/*', class: 'file-hidden', 'aria-label': 'Take or choose a meal photo' });
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.value = ''; if (f) readFoodPhoto(f, date); });
  if (!(S.data.foodAi || S.data.scanEnabled)) return h('button.btn.ghost', { onclick: () => toast('Photo logging needs an AI key in Script Properties.', 4000) }, 'Snap a photo');
  return h('label.btn.ghost.filebtn', null, 'Snap a photo', inp);
}
function openMeal(pre) {
  modal(pre.photo ? 'Meal from photo' : 'Add meal', close => {
    let slot = slotNow();
    const name = h('input.in', { placeholder: 'e.g. nasi + ayam bakar', maxlength: 60 });
    const kcal = h('input.in', { inputmode: 'numeric', placeholder: 'kcal' });
    const p = h('input.in', { inputmode: 'decimal', placeholder: 'grams' });
    const ph = pre.photo;
    if (ph) {
      name.value = ph.items.map(x => x.name).join(' + ').slice(0, 60);
      kcal.value = Math.round(ph.items.reduce((s, x) => s + (Number(x.kcal) || 0), 0));
      p.value = Math.round(ph.items.reduce((s, x) => s + (Number(x.protein_g) || 0), 0));
    }
    const qty = h('input.in', { inputmode: 'decimal', value: '1' });
    const err = h('div.err'), slots = h('div.chips'), picks = h('div');
    const q = h('input.in', { placeholder: 'Search common foods or your past meals' });
    const recent = [];
    J('meal').slice().sort((a, b) => b.createdAt - a.createdAt).forEach(m => { if (!recent.some(r => r[0] === m.data.name)) recent.push([m.data.name, m.data.kcal, m.data.p]); });
    const fill = f => { name.value = f[0]; kcal.value = Math.round(f[1]); p.value = Math.round(f[2] * 10) / 10; qty.value = '1'; };
    const paintSlots = () => slots.replaceChildren(...MEAL_SLOTS.map(([k, l]) => h('button' + (slot === k ? '.on' : ''), { type: 'button', onclick: () => { slot = k; paintSlots(); } }, l)));
    const paintPicks = () => {
      const s = q.value.trim().toLowerCase();
      const list = [...recent.slice(0, 30).map(r => [...r, 'recent']), ...FOODS.map(f => [...f, ''])].filter(f => !s || f[0].toLowerCase().includes(s)).slice(0, s ? 12 : 8);
      picks.replaceChildren(h('div.picks', null, list.map(f => h('button', { type: 'button', onclick: () => fill(f) }, h('span', null, f[0]), h('span.small.muted', null, Math.round(f[1]) + ' kcal · ' + Math.round(f[2]) + ' g' + (f[3] ? ' · ' + f[3] : ''))))));
    };
    q.addEventListener('input', paintPicks);
    paintSlots(); paintPicks();
    return h('div', null, slots,
      ph ? h('div.callout', { style: 'margin-top:10px' }, h('b', null, 'Estimated by ' + (S.data.foodAi === 'claude' ? 'Claude' : 'AI') + ' from your photo (' + ph.confidence + ' confidence)'),
        h('div.small', null, ph.items.map(x => x.name + (x.portion ? ' (' + x.portion + ')' : '') + ': ' + Math.round(x.kcal || 0) + ' kcal, ' + Math.round(x.protein_g || 0) + ' g').join(' · ')),
        ph.note ? h('div.small.muted', null, ph.note) : null, h('div.small.muted', null, 'Check the numbers and fix anything that looks off before saving.'))
        : [h('label.f', null, 'Quick pick'), q, picks],
      h('label.f', null, 'Food'), name,
      h('div.grid3', null, h('div', null, h('label.f', null, 'Calories'), kcal), h('div', null, h('label.f', null, 'Protein (g)'), p), h('div', null, h('label.f', null, 'Portions'), qty)),
      ph ? null : h('p.small.muted', null, 'Values from the list are typical portions, so treat them as estimates.'), err,
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => {
        const n = name.value.trim(), k = Number(kcal.value) || 0, pr = Number(String(p.value).replace(',', '.')) || 0, x = Number(String(qty.value).replace(',', '.')) || 1;
        if (!n) { err.textContent = 'Name the food.'; return; }
        if (!(k > 0 || pr > 0)) { err.textContent = 'Add calories or protein.'; return; }
        const data = { name: n + (x !== 1 ? ' ×' + x : ''), kcal: Math.round(k * x), p: Math.round(pr * x * 10) / 10, slot, src: ph ? 'photo' : 'manual' };
        close(); logAddFast([{ date: pre.date || today(), kind: 'meal', data }], 'Added ' + data.name);
      } }, 'Add meal')));
  });
}

// ----- body -----
function viewBody() {
  const body = bodyCfg(), t = today();
  const ws = J('weight').sort((a, b) => a.date < b.date ? -1 : 1);
  const avg = weightAvg(S.data.journal, t), prevAvg = weightAvg(S.data.journal, addDays(t, -7));
  const tg = targets(body, avg);
  const statsP = panel('Body', null, body ? [
    h('div.grid3.stats', null,
      h('div', null, h('div.tiny.muted', null, '7-DAY AVG'), h('div.big-num', null, avg ? avg + ' kg' : '–')),
      h('div', null, h('div.tiny.muted', null, 'VS LAST WEEK'), h('div.big-num' + (avg && prevAvg ? (avg >= prevAvg ? '.green' : '.red') : ''), null, avg && prevAvg ? (avg - prevAvg >= 0 ? '+' : '') + (Math.round((avg - prevAvg) * 10) / 10) + ' kg' : '–')),
      h('div', null, h('div.tiny.muted', null, 'WAIST'), h('div.big-num', null, (ws.filter(w => w.data.waist).pop() || { data: {} }).data.waist ? ws.filter(w => w.data.waist).pop().data.waist + ' cm' : '–'))),
    tg ? h('p.small.muted', null, 'Daily target: ' + tg.kcal.toLocaleString('en-US') + ' kcal, ' + tg.protein + ' g protein (' + (GOALS.find(x => x[0] === body.goal) || GOALS[0])[1].toLowerCase() + '). For lean gain, a common target is about +0.5–1% of body weight a month on the 7-day average.') : null,
    weightChart(ws),
    h('div.btns', null, h('button.btn.gold', { onclick: openWeigh }, '+ Log weight'), h('button.btn.ghost', { onclick: openBodySetup }, 'Edit body stats')),
  ] : [h('p', null, 'Add your height, age, sex and weight. The app turns them into daily protein and calorie targets for lean muscle gain, and tracks your weight as a 7-day average so daily water swings don\'t fool you.'),
    h('div.btns', null, h('button.btn.gold.block', { onclick: openBodySetup }, 'Add body stats'))]);
  const listP = ws.length ? panel('Weigh-ins', ws.length + '', h('div.list', null, ws.slice(-8).reverse().map(w => h('div.item', null, h('div.grow', null, h('div.t1', null, w.data.kg + ' kg' + (w.data.waist ? ' · waist ' + w.data.waist + ' cm' : '')), h('div.t2', null, dayLabel(w.date))),
    h('button.btn.sm.ghost', { onclick: () => act(() => api('logDelete', w.id), 'Removed') }, '✕'))))) : null;
  const days = J('daily').sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 7);
  const gP = days.length ? panel('From Garmin', 'last 7 days', h('div.list', null, days.map(x => h('div.item', null, h('div.grow', null, h('div.t1', null, dayLabel(x.date)),
    h('div.t2', null, [x.data.steps != null ? Number(x.data.steps).toLocaleString('en-US') + ' steps' : '', x.data.sleepMin ? 'sleep ' + Math.floor(x.data.sleepMin / 60) + 'h ' + (x.data.sleepMin % 60) + 'm' + (x.data.sleepScore ? ' (' + x.data.sleepScore + ')' : '') : '',
      x.data.bbHigh != null ? 'Body Battery ' + (x.data.bbLow != null ? x.data.bbLow + '–' : '') + x.data.bbHigh : '', x.data.rhr ? 'resting HR ' + x.data.rhr : ''].filter(Boolean).join(' · '))))))) : null;
  return h('div', null, statsP, gP, listP);
}
function weightChart(ws) {
  const pts = ws.slice(-60);
  if (pts.length < 2) return h('div.small.muted', { style: 'margin:8px 0' }, 'Weigh in a few mornings a week (after the toilet, before eating) to see your trend.');
  const W = 320, H = 110, c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2; c.style.cssText = 'width:100%;height:' + H + 'px;display:block;margin:10px 0';
  const x = c.getContext('2d'); x.scale(2, 2);
  const ks = pts.map(p => Number(p.data.kg)), lo = Math.min(...ks) - 0.5, hi = Math.max(...ks) + 0.5;
  const d0 = pts[0].date, span = Math.max(1, daysBetween(d0, pts[pts.length - 1].date));
  const X = d => 8 + (W - 16) * daysBetween(d0, d) / span, Y = k => 8 + (H - 16) * (1 - (k - lo) / (hi - lo));
  x.fillStyle = '#94b0c2'; pts.forEach(p => x.fillRect(Math.round(X(p.date)) - 2, Math.round(Y(p.data.kg)) - 2, 4, 4));
  x.strokeStyle = '#ffcd75'; x.lineWidth = 3; x.beginPath();
  pts.forEach((p, i) => { const a = weightAvg(S.data.journal, p.date); const px = X(p.date), py = Y(a); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
  x.fillStyle = '#94b0c2'; x.font = '11px system-ui'; x.fillText(hi.toFixed(1), 2, 12); x.fillText(lo.toFixed(1), 2, H - 2);
  return h('div', null, c, h('div.legend', null, h('span', { style: '--c:#94b0c2' }, 'weigh-in'), h('span', { style: '--c:#ffcd75' }, '7-day average')));
}
function openWeigh() {
  modal('Log weight', close => {
    const kg = h('input.in.big', { inputmode: 'decimal', placeholder: '0.0', value: latestWeight(S.data.journal, today()) || '' });
    const waist = h('input.in', { inputmode: 'decimal', placeholder: 'optional' });
    const date = h('input.in', { type: 'date', value: today(), max: today() });
    const err = h('div.err');
    return h('div', null, h('label.f', null, 'Weight (kg)'), kg, h('div.grid2', null, h('div', null, h('label.f', null, 'Waist at navel (cm)'), waist), h('div', null, h('label.f', null, 'Date'), date)), err,
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => {
        const k = Number(String(kg.value).replace(',', '.')), w = Number(String(waist.value).replace(',', '.')) || 0;
        if (!(k > 25 && k < 300)) { err.textContent = 'Enter your weight in kg.'; return; }
        close(); logAddFast([{ date: date.value || today(), kind: 'weight', data: { kg: Math.round(k * 10) / 10, waist: w ? Math.round(w * 10) / 10 : undefined } }], 'Weight saved');
      } }, 'Save')));
  });
}
function openBodySetup() {
  const b = { sex: 'male', age: '', height: '', weight: '', activity: 'moderate', goal: 'gain', ...(bodyCfg() || {}) };
  modal('Body stats', close => {
    const body = h('div'), err = h('div.err');
    const one = (field, opts) => h('div.chips', null, opts.map(([k, l]) => h('button' + (b[field] === k ? '.on' : ''), { type: 'button', onclick: () => { b[field] = k; paint(); } }, l)));
    const num = (field, ph) => h('input.in', { inputmode: 'decimal', placeholder: ph, value: b[field] || '', oninput: e => { b[field] = e.target.value; } });
    const paint = () => body.replaceChildren(
      h('label.f', null, 'Sex (for the calorie formula)'), one('sex', [['male', 'Male'], ['female', 'Female']]),
      h('div.grid3', null, h('div', null, h('label.f', null, 'Age'), num('age', 'years')), h('div', null, h('label.f', null, 'Height'), num('height', 'cm')), h('div', null, h('label.f', null, 'Weight'), num('weight', 'kg'))),
      h('label.f', null, 'Activity level'), one('activity', ACTIVITY.map(a => [a[0], a[1]])),
      h('label.f', null, 'Goal'), one('goal', GOALS.map(g => [g[0], g[1]])));
    paint();
    return h('div', null, body, err, h('p.small.muted', null, 'Calories use the Mifflin-St Jeor formula × your activity level, plus a small surplus for lean gain. Protein is 1.8 g per kg (2.0 when cutting). These are starting points: adjust after 2–3 weeks of weigh-ins.'),
      h('div.btns', null, h('button.btn.gold.block', { onclick: async () => {
        const age = Number(b.age), hgt = Number(b.height), w = Number(String(b.weight).replace(',', '.'));
        if (!(age >= 14 && age <= 90) || !(hgt >= 120 && hgt <= 230) || !(w > 25 && w < 300)) { err.textContent = 'Check age, height and weight.'; return; }
        const clean = { sex: b.sex, age, height: hgt, weight: Math.round(w * 10) / 10, activity: b.activity, goal: b.goal };
        const ok = await saveGame({ body: clean });
        if (ok && !J('weight').length) await act(() => api('logAdd', [{ date: today(), kind: 'weight', data: { kg: clean.weight } }]));
        if (ok) { toast('Body stats saved'); close(); }
      } }, 'Save')));
  });
}

// ----- setup -----
function openTrainSetup() {
  const old = (trainCfg() && trainCfg().setup) || {};
  const st = { goal: old.goal || 'muscle', level: old.level || 'beginner', days: old.days || [0, 2, 4], minutes: old.minutes || 60, equip: old.equip || 'gym', sports: { ...(old.sports || {}) } };
  modal('Training setup', close => {
    const body = h('div');
    const one = (field, opts) => h('div.chips', null, opts.map(([k, l]) => h('button' + (st[field] === k ? '.on' : ''), { type: 'button', onclick: () => { st[field] = k; paint(); } }, l)));
    const err = h('div.err');
    const dayChips = (arr, set) => h('div.chips', null, WEEKDAYS.map((w, i) => h('button' + (arr.includes(i) ? '.on' : ''), { type: 'button', onclick: () => {
      set(arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i].sort((a, b) => a - b)); paint(); } }, w)));
    const paint = () => body.replaceChildren(
      h('label.f', null, 'Main goal'), one('goal', [['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['fitness', 'General fitness']]),
      h('label.f', null, 'Gym experience'), one('level', [['beginner', 'Under 1 year'], ['intermediate', '1–3 years'], ['advanced', '3+ years']]),
      h('label.f', null, 'Gym days (' + st.days.length + ' a week)'), dayChips(st.days, v => { st.days = v; }),
      h('label.f', null, 'Time per gym session'), one('minutes', [[45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min']]),
      h('label.f', null, 'Equipment'), one('equip', [['gym', 'Full gym'], ['db', 'Dumbbells only'], ['bw', 'Bodyweight only']]),
      h('label.f', null, 'Sports you play'),
      h('div.chips', null, Object.entries(SPORTS).filter(([k]) => k !== 'other').map(([k, x]) => h('button' + (st.sports[k] ? '.on' : ''), { type: 'button', onclick: () => {
        if (st.sports[k]) delete st.sports[k]; else st.sports[k] = []; paint(); } }, x.name))),
      ...Object.keys(st.sports).map(k => h('div.sportdays', null, h('div.small', null, SPORTS[k].name + ': which days? (none = whenever you play)'), dayChips(st.sports[k], v => { st.sports[k] = v; }))),
      st.days.length ? h('p.small.muted', null, 'Recommended for ' + st.days.length + ' gym days: ' + SPLIT_TXT[Math.min(6, st.days.length)] + '.') : null);
    paint();
    const ok = () => {
      const sportCount = Object.values(st.sports).reduce((s, a) => s + a.length, 0);
      if (!st.days.length && !Object.keys(st.sports).length) { err.textContent = 'Pick at least one gym day or sport.'; return false; }
      if (st.days.length > 6) { err.textContent = 'Keep at least one rest day a week.'; return false; }
      if (st.days.length + sportCount > 10) { err.textContent = 'That\'s a lot of sessions. Plan fewer so you can recover.'; return false; }
      err.textContent = ''; return true;
    };
    return h('div', null, body, err, h('div.btns', null,
      h('button.btn.gold.block', { onclick: () => { if (!ok()) return; close(); previewPlan(buildRec(st), st); } }, 'Recommend a plan'),
      h('button.btn.ghost.block', { onclick: () => { if (!ok()) return; close(); openPlanEditor(blankPlan(st), null, st); } }, 'I\'ll enter my own plan')));
  });
}
const addSportDays = (p, st) => {
  const free = () => 'ABCDEFGHIJKLMNOP'.split('').find(c => !p.days.some(d => d.id === c));
  Object.entries(st.sports || {}).forEach(([k, days]) => {
    const id = free();
    p.days.push({ id, name: SPORTS[k].name, type: 'sport', sport: k, min: k === 'run' ? 30 : 60, ex: [] });
    days.forEach(wd => { p.sched[wd] = [...schedIds(p.sched, wd), id]; });
  });
  return p;
};
function buildRec(st) {
  const p = st.days.length ? recommend(st) : { name: 'Sports plan', source: 'rec', days: [], sched: {} };
  Object.keys(p.sched).forEach(k => { p.sched[k] = schedIds(p.sched, k); });
  p.days.forEach(d => d.ex.forEach(x => {
    const e = EX[x.id];
    if (st.goal === 'strength' && e && e.k === 'c' && !e.secs && e.e !== 'b') { x.reps = '4-6'; x.rest = Math.max(x.rest, 180); x.sets = Math.max(x.sets, 4); }
    if (st.goal === 'fitness') { x.sets = Math.min(x.sets, 3); x.rest = Math.min(x.rest, 90); }
  }));
  const sp = Object.keys(st.sports || {}).map(k => SPORTS[k].name.toLowerCase());
  if (sp.length) p.name += ' + ' + sp.join(', ');
  return addSportDays(p, st);
}
function blankPlan(st) {
  const days = st.days.map((wd, i) => ({ id: 'ABCDEF'[i], name: 'Day ' + (i + 1), type: 'gym', ex: [] }));
  const sched = {}; st.days.forEach((wd, i) => { sched[wd] = [days[i].id]; });
  return addSportDays({ name: 'My plan', source: 'custom', days, sched }, st);
}
function previewPlan(p, st) {
  const legs = p.days.filter(d => d.type === 'sport' && /run|football|futsal|basketball/.test(d.sport)).length;
  modal('Your recommended plan', close => h('div', null,
    h('p.small', null, p.name.replace('Recommended · ', 'A ') + '. Compound lifts first, then isolation work. Add weight once every set reaches the top of the rep range (the logger tells you when).'),
    legs && st.days.length ? h('p.small.muted', null, 'Tip: running and field sports load your legs too. Keep hard leg days away from the day before a match or long run.') : null,
    p.days.map(d => h('div.pday-prev', null, h('div.t1', null, d.id + ' · ' + d.name + '  ', h('span.small.muted', null, WEEKDAYS.filter((_, i) => schedIds(p.sched, i).includes(d.id)).join(', ') || 'whenever you play')),
      h('div.small.muted', null, d.type === 'sport' ? dayDesc(d) : d.ex.map(x => x.name + ' ' + x.sets + '×' + x.reps).join(' · ')))),
    h('div.btns', null,
      h('button.btn.gold.block', { onclick: async () => { if (await savePlan(p, p.sched, st)) close(); } }, 'Use this plan'),
      h('button.btn.ghost.block', { onclick: () => { close(); openPlanEditor(p, p.sched, st); } }, 'Change it first'))));
}
async function savePlan(plan, sched, setup) {
  const tr = trainCfg() || {};
  const t = today();
  const hist = (tr.sched || []).filter(s => s.from < t);
  const map = {}; Object.keys(sched).forEach(k => { const ids = schedIds(sched, k); if (ids.length) map[k] = ids; });
  hist.push({ from: t, map });
  const clean = { name: plan.name, source: plan.source, days: plan.days.map(d => d.type === 'sport'
    ? { id: d.id, name: d.name, type: 'sport', sport: d.sport, min: Number(d.min) || 0, ex: [] }
    : { id: d.id, name: d.name, type: 'gym', ex: d.ex.map(x => ({ id: x.id || '', name: x.name, sets: Number(x.sets) || 3, reps: String(x.reps || '8-12'), rest: Number(x.rest) || 90 })) }) };
  return saveGame({ train: { ...tr, setup: setup || tr.setup || null, plan: clean, sched: hist } }).then(ok => { if (ok) toast('Plan saved'); return ok; });
}

// ----- plan editor -----
function openPlanEditor(plan0, sched0, setup) {
  const plan = JSON.parse(JSON.stringify(plan0));
  plan.days.forEach(d => { d.type = d.type || 'gym'; d.ex = d.ex || []; });
  const src = sched0 || plan0.sched || {};
  const sched = {}; WEEKDAYS.forEach((_, i) => { sched[i] = schedIds(src, i).slice(); });
  modal('Edit plan', close => {
    const body = h('div'), err = h('div.err');
    const nextId = () => 'ABCDEFGHIJKLMNOP'.split('').find(c => !plan.days.some(d => d.id === c));
    const removeDay = (d, di) => { plan.days.splice(di, 1); Object.keys(sched).forEach(k => { sched[k] = sched[k].filter(x => x !== d.id); }); paint(); };
    const gymBody = d => [
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
      h('button.btn.sm.ghost', { type: 'button', style: 'margin-top:8px', onclick: () => pickExercise(x => { d.ex.push(x); paint(); }) }, '+ Add exercise')];
    const sportBody = d => h('div.grid2', { style: 'margin-top:8px' },
      h('div', null, h('label.f', null, 'Sport'), h('select.in', { onchange: e => { const old = SPORTS[d.sport] && SPORTS[d.sport].name; d.sport = e.target.value; if (!d.name || d.name === old) d.name = SPORTS[d.sport].name; paint(); } },
        Object.entries(SPORTS).map(([k, x]) => h('option', { value: k, selected: d.sport === k }, x.name)))),
      h('div', null, h('label.f', null, 'Target (min)'), h('input.in', { inputmode: 'numeric', value: d.min || '', oninput: e => { d.min = e.target.value; } })));
    const paint = () => body.replaceChildren(
      h('label.f', null, 'Plan name'), h('input.in', { value: plan.name, maxlength: 60, oninput: e => { plan.name = e.target.value; } }),
      ...plan.days.map((d, di) => h('div.pedit' + (d.type === 'sport' ? '.sport' : ''), null,
        h('div.row', null, h('b.badge', null, d.id), h('input.in.grow', { value: d.name, maxlength: 30, 'aria-label': 'Day name', oninput: e => { d.name = e.target.value; } }),
          h('button.btn.sm.ghost', { type: 'button', 'aria-label': 'Remove day', onclick: () => { if (d.ex.length && !confirm('Remove ' + d.name + '?')) return; removeDay(d, di); } }, '✕')),
        d.type === 'sport' ? sportBody(d) : gymBody(d))),
      plan.days.length < 12 ? h('div.btns', null,
        h('button.btn.sm', { type: 'button', onclick: () => { const id = nextId(); plan.days.push({ id, name: 'Gym ' + id, type: 'gym', ex: [] }); paint(); } }, '+ Gym day'),
        h('button.btn.sm', { type: 'button', onclick: () => { const id = nextId(); plan.days.push({ id, name: 'Run', type: 'sport', sport: 'run', min: 30, ex: [] }); paint(); } }, '+ Sport day')) : null,
      h('label.f', null, 'Weekly schedule (tap to add a session to a day; a day can have more than one)'),
      h('div.sched', null, WEEKDAYS.map((w, i) => h('div.srow', null, h('span', null, w),
        h('div.chips', null, plan.days.map(d => h('button' + (sched[i].includes(d.id) ? '.on' : ''), { type: 'button', onclick: () => {
          sched[i] = sched[i].includes(d.id) ? sched[i].filter(x => x !== d.id) : [...sched[i], d.id]; paint(); } }, d.id + ' ' + d.name.slice(0, 10))))))));
    paint();
    const save = h('button.btn.gold.block', { onclick: async () => {
      plan.days.forEach(d => { d.name = d.name.trim() || 'Day ' + d.id; });
      if (!plan.days.length || plan.days.every(d => d.type !== 'sport' && !d.ex.length)) { err.textContent = 'Add at least one exercise or sport.'; return; }
      const empty = plan.days.find(d => d.type !== 'sport' && !d.ex.length);
      if (empty) { err.textContent = empty.name + ' has no exercises. Add some or remove the day.'; return; }
      Object.keys(sched).forEach(k => { sched[k] = sched[k].filter(id => plan.days.some(d => d.id === id)); });
      if (!Object.values(sched).some(a => a.length)) { err.textContent = 'Schedule at least one day.'; return; }
      plan.name = plan.name.trim() || 'My plan';
      if (plan0.source === 'rec' && JSON.stringify(plan.days) !== JSON.stringify(plan0.days)) plan.source = 'custom';
      if (await savePlan(plan, sched, setup)) close();
    } }, 'Save plan');
    return h('div', null, body, err, h('div.btns', null, save),
      h('p.small.muted', null, 'Schedule changes apply from today. Past days keep the schedule they had. Unscheduled sports still count as bonus sessions when you log them.'));
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
  const tr = trainCfg(), d = planDay(tr, dayId), ws = gymWorkouts();
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
  const ws = gymWorkouts();
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
    h('div.small.muted', null, DAYS[dow(w.date)] + ', ' + shortDate(w.date) + ' · ' + wDesc(w) + (isSport(w) ? '' : ' · ' + Math.round(volume(w)).toLocaleString('en-US') + ' kg')),
    w.data.src === 'garmin' ? h('div.wsec', null, h('div.wlab', null, 'What was this session?'),
      h('div.chips', null, [['gym', 'Gym'], ['padel', 'Padel'], ['basketball', 'Basketball'], ['football', 'Football'], ['futsal', 'Futsal'], ['run', 'Run'], ['hiit', 'HIIT / cardio'], ['other', 'Other']].map(([k, l]) => {
        const on = k === 'gym' ? w.data.as === 'gym' : w.data.as === 'sport' && w.data.sport === k;
        return h('button' + (on ? '.on' : ''), { type: 'button', onclick: async () => {
          const data = { ...w.data, as: k === 'gym' ? 'gym' : 'sport', sport: k === 'gym' ? w.data.sport : k, name: k === 'gym' ? 'Gym (Garmin)' : SPORTS[k].name };
          if (await act(() => api('logUpdate', { id: w.id, date: w.date, kind: 'workout', data }), 'Saved as ' + l)) close();
        } }, l);
      })), h('p.small.muted', null, 'Your watch recorded this as ' + (w.data.gtype || 'an activity').replace(/_/g, ' ') + '. Until you pick, an untagged HIIT session counts for whatever was scheduled that day.')) : null,
    isSport(w) ? h('div.list', null,
      h('div.item', null, h('div.grow', null, h('div.t1', null, sportName(w.data.sport)), h('div.t2', null, [w.data.effort ? 'Effort: ' + w.data.effort : '', w.data.hr ? 'Avg HR ' + w.data.hr : '', w.data.note || ''].filter(Boolean).join(' · ')))))
      : h('div.list', null, (w.data.ex || []).map(x => h('div.item', null, h('div.grow', null, h('div.t1', null, x.n), h('div.t2', null, setsTxt(x.s)))))),
    h('div.btns', null, h('button.btn.red', { onclick: async () => { if (!confirm('Delete this session?')) return; if (await act(() => api('logDelete', w.id), 'Deleted')) close(); } }, 'Delete'))));
}

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    // check for a new version whenever the app comes back to the front
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // A new version took over: reload once, but never in the middle of something (open sheet, workout, typing).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const reloadWhenIdle = () => { if (document.querySelector('.ov') || S.busy || S.pending) return setTimeout(reloadWhenIdle, 3000); location.reload(); };
    reloadWhenIdle();
  });
}
window.__lrpg = { S, render, recompute };
boot();

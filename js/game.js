// Mesin game. Semua angka dihitung ulang dari data (transaksi, budget, jurnal), jadi tidak ada
// state yang bisa "nyasar": edit transaksi lama → HP/XP ikut menyesuaikan.
import { isFree, catLabel, addDays, daysBetween, cycleOf, cycleEnd, addMonthKey } from './fin.js';
import { BOSSES } from './sprites.js';
import { sessionsOn, prsIn, wdOf, isSport, kindOf, targets, weightAvg, energyDay, weekStart } from './train.js';

export const RULES = {
  hpMax: 100,
  log: { xp: 10, gold: 3 },          // hari ada catatan / check-in
  pace: { xp: 10, gold: 5, hp: 6 },  // hari tutup di bawah jalur budget
  offPace: { hp: -4 },               // tercatat tapi di atas jalur
  missed: { hp: -12 },               // hari tanpa catatan & tanpa check-in
  over: { hp: -15 },                 // kategori tembus budget (sekali per kategori per siklus)
  streak: { every: 7, xp: 50, gold: 50 },
  boss: { ratio: 0.6, xp: 250, gold: 120, escapeHp: -10 },
  challenge: { xp: 200, gold: 100, acceptDays: 7, share: 0.2 },
  ch: {
    maxActive: 3,
    cut: { tiers: { easy: { f: 0.9, xp: 150, gold: 75 }, normal: { f: 0.8, xp: 200, gold: 100 }, hard: { f: 0.7, xp: 300, gold: 150, hp: -15 } } },
    nospend3: { days: 7, need: 3, xp: 80, gold: 40 },
    homecook: { days: 7, perDay: 50000, xp: 100, gold: 50 },
    backupShown: true,
    cartfreeze: { days: 14, xp: 120, gold: 60 },
    payfirst: { days: 2, xp: 100, gold: 50 },
    fitfrugal: { days: 7, need: 5, xp: 150, gold: 80 },
  },
  protein: { xp: 15, gold: 5 },
  calories: { xp: 15, gold: 5, band: 250 },
  gym: { xp: 25, gold: 10, hp: 5, prXp: 15, prMax: 3, missed: -8, weekXp: 60, weekGold: 30 },
  reviveDays: 3, reviveHp: 40, sick: 30, tired: 60,
};

/** Categories the 'lighter week' challenge may pick: specific, cuttable spending only. */
const CAT_WEEK = ['Makan & minum', 'Transport', 'Belanja harian', 'Belanja online', 'Hiburan & nongkrong'];
const rpK = n => 'Rp' + Math.round(n / 1000) + 'K';
/** Rolling challenges. name/desc are shown in the app; test/val read one day's record. */
export const CH_DEFS = {
  // money
  nospend3: { group: 'money', days: 7, kind: 'count', need: 3, xp: 80, gold: 40, icon: 'shield', name: () => 'No-spend trio', desc: () => '3 days with zero flexible spending within 7 days (log or check in on those days).', test: (d, x) => x.R(d).logged && x.R(d).free === 0 },
  homecook: { group: 'money', days: 7, kind: 'cap', cap: 350000, share: true, xp: 100, gold: 50, icon: 'heart', name: () => 'Home cook week', desc: () => 'Food & drinks ≤ Rp350K over 7 days (about Rp50K a day). Saving vs your usual week goes to the reward fund.', val: (d, x) => x.R(d).food },
  cartfreeze: { group: 'money', days: 14, kind: 'clean', xp: 120, gold: 60, icon: 'chest', name: () => 'Cart freeze', desc: () => 'Rp0 on online shopping for 14 days. One purchase ends it.', test: (d, x) => x.R(d).online === 0 },
  logall: { group: 'money', days: 7, kind: 'count', need: 7, xp: 70, gold: 30, icon: 'star', name: () => 'Perfect bookkeeper', desc: () => 'Log spending (or check in) on all 7 days.', test: (d, x) => x.R(d).logged },
  under5: { group: 'money', days: 7, kind: 'count', need: 5, xp: 90, gold: 45, icon: 'sword', name: () => 'Hold the line', desc: () => 'Stay within the daily safe limit on 5 of 7 days.', test: (d, x) => x.R(d).under },
  lean4: { group: 'money', days: 7, kind: 'count', need: 4, xp: 80, gold: 40, icon: 'coin', name: () => 'Lean days', desc: () => '4 days in a week with flexible spending of Rp75K or less.', test: (d, x) => x.R(d).logged && x.R(d).free <= 75000 },
  save3: { group: 'money', days: 7, kind: 'count', need: 3, xp: 90, gold: 45, icon: 'coin', name: () => 'Drip saver', desc: () => 'Move money into savings or investments on 3 different days this week.', test: (d, x) => x.R(d).save > 0 },
  small: { group: 'money', days: 7, kind: 'clean', xp: 70, gold: 35, icon: 'chest', name: () => 'No big buys', desc: () => 'No single flexible purchase above Rp100K for 7 days.', test: (d, x) => x.R(d).maxFree <= 100000 },
  nocard: { group: 'money', days: 7, kind: 'clean', xp: 80, gold: 40, icon: 'shield', name: () => 'Card on ice', desc: () => 'No spending on the credit card for 7 days.', test: (d, x) => x.R(d).credit === 0 },
  weekend: { group: 'money', days: 7, kind: 'count', need: 2, weekdaysOnly: true, xp: 80, gold: 40, icon: 'star', name: () => 'Quiet weekend', desc: () => 'Zero flexible spending on both Saturday and Sunday (log or check in).', test: (d, x) => [6, 0].includes(new Date(d + 'T00:00:00').getDay()) && x.R(d).logged && x.R(d).free === 0 },
  catweek: { group: 'money', days: 7, kind: 'cap', xp: 90, gold: 45, icon: 'sword', name: c => 'Lighter ' + (c.cat ? catLabel(c.cat) : 'category') + ' week', desc: c => (c.cat ? catLabel(c.cat) : 'One category') + ' ≤ ' + rpK(c.cap || 0) + ' for 7 days (20% under its usual weekly share).', val: (d, x) => (x.R(d).cats[x.cat] || 0) },
  // training & body
  fitfrugal: { group: 'health', days: 7, kind: 'special', need: 5, needs: 'train', xp: 150, gold: 80, icon: 'dumbbell', name: () => 'Fit & frugal', desc: () => 'Every scheduled training session done, and within the safe limit on 5 of 7 days.' },
  ironweek: { group: 'health', days: 7, kind: 'special', needs: 'train', xp: 120, gold: 60, icon: 'dumbbell', name: () => 'Iron week', desc: () => 'Do every scheduled session for 7 days (rest days you log as sick or injured are excused).' },
  move2: { group: 'health', days: 7, kind: 'sum', need: 2, xp: 70, gold: 35, icon: 'bolt', name: () => 'Get moving', desc: () => 'Log 2 sports or cardio sessions (run, padel, football…) in 7 days.', val: (d, x) => x.sport(d) },
  protein5: { group: 'health', days: 7, kind: 'count', need: 5, needs: 'body', xp: 90, gold: 45, icon: 'heart', name: () => 'Protein week', desc: () => 'Hit your protein target on 5 of 7 days.', test: (d, x) => x.proteinHit(d) },
  calorie4: { group: 'health', days: 7, kind: 'count', need: 4, needs: 'body', xp: 90, gold: 45, icon: 'heart', name: () => 'On target', desc: () => 'Land within 250 kcal of your calorie target on 4 of 7 days.', test: (d, x) => x.calHit(d) },
  foodlog6: { group: 'health', days: 7, kind: 'count', need: 6, xp: 70, gold: 30, icon: 'star', name: () => 'Food diary', desc: () => 'Log at least 2 meals on 6 of 7 days.', test: (d, x) => x.jOn('meal', d).length >= 2 },
  weigh4: { group: 'health', days: 7, kind: 'count', need: 4, xp: 60, gold: 25, icon: 'star', name: () => 'Weigh-in habit', desc: () => 'Log your weight on 4 mornings this week.', test: (d, x) => x.jOn('weight', d).length > 0 },
  steps5: { group: 'health', days: 7, kind: 'count', need: 5, needs: 'garmin', xp: 80, gold: 40, icon: 'bolt', name: () => '8K steps', desc: () => '8,000+ steps on 5 of 7 days (from Garmin).', test: (d, x) => (x.dailyOf(d).steps || 0) >= 8000 },
  sleep5: { group: 'health', days: 7, kind: 'count', need: 5, needs: 'garmin', xp: 80, gold: 40, icon: 'heart', name: () => 'Sleep well', desc: () => '7+ hours of sleep on 5 of 7 nights (from Garmin).', test: (d, x) => (x.dailyOf(d).sleepMin || 0) >= 420 },
  // payday
  payfirst: { group: 'money', days: 2, kind: 'special', cycle: true, xp: 100, gold: 50, icon: 'coin', name: () => 'Pay yourself first', desc: c => 'Move ' + (c && c.pct ? c.pct + '% of your salary' : 'part of your salary') + ' into savings or investments within 2 days of payday.' },
};

export const QUESTS = {
  jatah: { name: 'Stay in budget', desc: 'Spend no more than today\'s safe limit', xp: 20, gold: 10, icon: 'sword', eod: true },
  nospend: { name: 'No-spend day', desc: 'Zero flexible spending today', xp: 30, gold: 15, icon: 'shield', eod: true },
  food: { name: 'Lean eats', desc: 'Food & drinks ≤ Rp50K', xp: 20, gold: 10, icon: 'heart', eod: true },
  noonline: { name: 'Hold the cart', desc: 'No online shopping', xp: 15, gold: 5, icon: 'chest', eod: true },
  log2: { name: 'Bookkeeper', desc: 'Log 2+ transactions (or check in)', xp: 15, gold: 5, icon: 'star' },
  save: { name: 'Feed the piggy bank', desc: 'Move money into savings or investments', xp: 25, gold: 15, icon: 'coin' },
};
const QUEST_POOL = Object.keys(QUESTS);

export const TITLES = [[1, 'Rookie'], [3, 'Bookkeeper'], [5, 'Adventurer'], [8, 'Wallet Warden'], [10, 'Frugal Knight'], [15, 'Treasure Keeper'], [20, 'Tycoon'], [30, 'Legend']];
export const xpNeed = lvl => 80 + 40 * lvl;
export const titleOf = lvl => TITLES.filter(t => lvl >= t[0]).pop()[1];

function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function questsFor(date) {
  let h = hash('q' + date);
  const pool = QUEST_POOL.slice(), out = [];
  while (out.length < 3) { const i = h % pool.length; out.push(pool.splice(i, 1)[0]); h = hash(h + date); }
  return out;
}
export const bossIndex = key => hash('boss' + key) % BOSSES.length;

/** Ringkasan per hari dari data mentah. */
function indexDays(data) {
  const days = {};
  const saveIds = new Set(data.accounts.filter(a => a.kind === 'tabungan' || a.kind === 'investasi').map(a => a.id));
  const creditIds = new Set(data.accounts.filter(a => a.kind === 'kredit').map(a => a.id));
  const D = d => days[d] || (days[d] = { n: 0, free: 0, food: 0, online: 0, save: 0, checkin: false, cats: {}, maxFree: 0, credit: 0 });
  data.txns.forEach(t => {
    const x = D(t.date); x.n++;
    if (t.type === 'out' && creditIds.has(t.account)) x.credit += t.amount;
    if (t.type === 'out' && isFree(t.category)) x.maxFree = Math.max(x.maxFree, t.amount);
    if (t.type === 'out') {
      x.cats[t.category] = (x.cats[t.category] || 0) + t.amount;
      if (isFree(t.category)) x.free += t.amount;
      if (t.category === 'Makan & minum') x.food += t.amount;
      if (t.category === 'Belanja online') x.online += t.amount;
    } else if (t.type === 'tf' && saveIds.has(t.toAccount) && !saveIds.has(t.account)) x.save += t.amount;
  });
  (data.journal || []).forEach(j => { if (j.kind === 'checkin') D(j.date).checkin = true; });
  return days;
}

function cycleBudget(plan, key) {
  const p = plan && plan[key];
  if (!p) return null;
  let free = 0; const lines = {};
  Object.entries(p.lines).forEach(([c, l]) => { lines[c] = l.eff; if (isFree(c)) free += l.eff; });
  return { free, lines };
}

export function questDone(id, day, allowance) {
  const d = day || { n: 0, free: 0, food: 0, online: 0, save: 0, checkin: false };
  switch (id) {
    case 'jatah': return allowance != null && (d.n > 0 || d.checkin) && d.free <= allowance;
    case 'nospend': return (d.n > 0 || d.checkin) && d.free === 0;
    case 'food': return (d.n > 0 || d.checkin) && d.food <= 50000;
    case 'noonline': return (d.n > 0 || d.checkin) && d.online === 0;
    case 'log2': return d.n >= 2 || d.checkin;
    case 'save': return d.save > 0;
  }
  return false;
}

/**
 * Hitung seluruh state pemain dari tanggal mulai sampai hari ini.
 * data: hasil getData() (+ journal), game: {start, share}
 */
export function compute(data, game, today) {
  const starts = data.cycle.starts, plan = data.budget.plan;
  const days = indexDays(data);
  const start = game.start || today;
  const share = game.share != null ? game.share : RULES.challenge.share;
  const S = { xp: 0, gold: 0, hp: RULES.hpMax, streak: 0, best: 0, fund: 0, events: [], koGood: 0, ko: false };
  // challenges: old entries (no type) were category cuts at the normal tier
  const challenges = (data.journal || []).filter(j => j.kind === 'challenge').map(j => ({ ...j, data: { type: 'cut', tier: 'normal', ...j.data } }));
  const chRes = {};          // id → { result: 'win' | 'lose', date, fund }
  const rec = {};            // per-day record used by challenges
  const missDates = new Set();
  const rewardUses = (data.journal || []).filter(j => j.kind === 'reward_use');

  const gain = (date, text, xp = 0, gold = 0, hp = 0, kind = 'info') => {
    if (S.ko && (xp > 0 || gold > 0)) { xp = 0; gold = 0; }
    if (!S.ko && S.hp < RULES.sick && gold > 0) gold = Math.floor(gold / 2);
    S.xp += xp; S.gold += gold;
    const before = S.hp;
    S.hp = Math.max(0, Math.min(RULES.hpMax, S.hp + hp));
    if (S.hp === 0 && before > 0) { S.ko = true; S.koGood = 0; S.events.push({ date, text: 'Knocked out! ' + RULES.reviveDays + ' good days in a row to get back up.', kind: 'ko' }); }
    if (xp || gold || hp) S.events.push({ date, text, xp, gold, hp: S.hp - before, kind });
  };

  const cyc = {}; // per siklus: hits, maxHits, free used, over flags
  const C = key => {
    if (cyc[key]) return cyc[key];
    const st0 = starts[key], end = cycleEnd(key, starts);
    const full = st0 && end ? daysBetween(st0, end) + 1 : 30;
    // Game dimulai di tengah siklus: siklus dihitung dari tanggal mulai, budget dipotong proporsional.
    const st = st0 && st0 < start ? start : st0;
    const len = st && end ? Math.max(1, daysBetween(st, end) + 1) : full;
    let budget = cycleBudget(plan, key);
    if (budget && len < full) {
      const f = len / full;
      budget = { free: Math.round(budget.free * f), lines: Object.fromEntries(Object.entries(budget.lines).map(([c, v]) => [c, Math.round(v * f)])), partial: true };
    }
    return (cyc[key] = { key, start: st, end, len, hits: 0, maxHits: Math.max(1, Math.ceil(len * RULES.boss.ratio)), free: 0, used: {}, overHit: {}, budget });
  };

  const endCycle = (c, date) => {
    if (c.done) return; c.done = true;
    const b = c.budget;
    const freeOk = !b || c.free <= b.free;
    const name = BOSSES[bossIndex(c.key)].name;
    if (c.hits >= c.maxHits && freeOk) { c.result = 'win'; gain(date, name + ' defeated! Cycle closed under budget.', RULES.boss.xp, RULES.boss.gold, 0, 'boss'); }
    else { c.result = 'lose'; gain(date, name + ' escaped. ' + (freeOk ? 'Not enough hits (' + c.hits + '/' + c.maxHits + ').' : 'Flexible budget was exceeded.'), 0, 0, RULES.boss.escapeHp, 'boss'); }
    challenges.filter(ch => ch.data.type === 'cut' && ch.data.cycle === c.key).forEach(ch => {
      const used = c.used[ch.data.cat] || 0, lim = ch.data.limit, T = RULES.ch.cut.tiers[ch.data.tier] || RULES.ch.cut.tiers.normal;
      if (used <= lim) {
        const saved = Math.max(0, (b && b.lines[ch.data.cat] != null ? b.lines[ch.data.cat] : lim) - used);
        const fund = Math.round(saved * share / 1000) * 1000;
        S.fund += fund; chRes[ch.id] = { result: 'win', date, fund };
        gain(date, 'Challenge won: ' + catLabel(ch.data.cat) + ' ≤ ' + Math.round(lim / 1000) + 'K (' + ch.data.tier + '). Reward fund +Rp' + fund.toLocaleString('id-ID'), T.xp, T.gold, 0, 'challenge');
      } else {
        chRes[ch.id] = { result: 'lose', date };
        if (T.hp) gain(date, 'Hard challenge lost: ' + catLabel(ch.data.cat) + ' (spent Rp' + used.toLocaleString('id-ID') + ').', 0, 0, T.hp, 'challenge');
        else S.events.push({ date, text: 'Challenge missed: ' + catLabel(ch.data.cat) + ' (spent Rp' + used.toLocaleString('id-ID') + ').', kind: 'challenge' });
      }
    });
  };

  const span = (a, b) => { const out = []; for (let x = a; x <= b; x = addDays(x, 1)) out.push(x); return out; };
  const R = x => rec[x] || { free: 0, food: 0, online: 0, save: 0, logged: false, under: false, maxFree: 0, credit: 0, cats: {} };
  const J = data.journal || [];
  const jOn = (kind, d) => J.filter(j => j.kind === kind && j.date === d);
  const dailyOf = d => ((J.find(j => j.kind === 'daily' && j.date === d) || {}).data) || {};
  const proteinHit = d => { const tg = game.body && targets(game.body, weightAvg(J, d)); const p = jOn('meal', d).reduce((s, j) => s + (Number(j.data.p) || 0), 0); return !!tg && p >= tg.protein; };
  const calHit = d => { if (jOn('meal', d).length < 2) return false; const e = energyDay(J, game.body, d, null); return !!e && Math.abs(e.net - e.goal) <= RULES.calories.band; };
  // kind: count (need days passing test; wins early) · sum (need total) · cap (sum ≤ cap; fails early) · clean (test must hold every day; fails early)
  const DEF = CH_DEFS;
  /** Progress of a rolling challenge using days up to `upto` (inclusive). */
  function chProgress(ch, upto) {
    const c = ch.data, D = DEF[c.type], last = upto < c.end ? upto : c.end, ds = c.start <= last ? span(c.start, last) : [];
    if (!D) return {};
    const ctx = { R, jOn, dailyOf, proteinHit, calHit, missDates, cat: c.cat, sport: d => (wByDay[d] || []).filter(w => isSport(w)).length };
    if (c.type === 'fitfrugal') return { val: ds.filter(x => R(x).under).length, need: D.need, miss: ds.filter(x => missDates.has(x)).length };
    if (c.type === 'ironweek') return { val: ds.reduce((s, x) => s + (wByDay[x] || []).length, 0), need: 1, miss: ds.filter(x => missDates.has(x)).length };
    if (c.type === 'payfirst') return { val: ds.reduce((s, x) => s + R(x).save, 0), need: c.amount || 0 };
    if (D.kind === 'count') return { val: ds.filter(x => D.test(x, ctx)).length, need: D.need };
    if (D.kind === 'sum') return { val: ds.reduce((s, x) => s + D.val(x, ctx), 0), need: D.need };
    if (D.kind === 'cap') return { val: ds.reduce((s, x) => s + D.val(x, ctx), 0), cap: c.cap || D.cap };
    if (D.kind === 'clean') { const bad = ds.filter(x => !D.test(x, ctx)); return { val: bad.length, bad: bad[0] || null }; }
    return {};
  }
  function evalChallenge(ch, d) {
    const c = ch.data, D = DEF[c.type];
    if (!D) return;
    const over = d > c.end, p = chProgress(ch, addDays(d, -1)), name = D.name(c);
    const win = (fund = 0) => { S.fund += fund; chRes[ch.id] = { result: 'win', date: d, fund }; gain(d, 'Challenge won: ' + name + (fund ? '. Reward fund +Rp' + fund.toLocaleString('id-ID') : ''), D.xp, D.gold, 0, 'challenge'); };
    const lose = why => { chRes[ch.id] = { result: 'lose', date: d }; S.events.push({ date: d, text: 'Challenge missed: ' + name + (why ? ' (' + why + ')' : ''), kind: 'challenge' }); };
    if (c.type === 'fitfrugal' || c.type === 'ironweek') { if (over) { if (p.val >= p.need && !p.miss) win(); else lose(p.miss ? p.miss + ' missed session' + (p.miss > 1 ? 's' : '') : p.val + '/' + p.need); } return; }
    if (c.type === 'payfirst') { if (p.need && p.val >= p.need) win(); else if (over) lose('Rp' + p.val.toLocaleString('id-ID') + ' of Rp' + (p.need || 0).toLocaleString('id-ID')); return; }
    if (D.kind === 'count' || D.kind === 'sum') { if (p.val >= p.need) win(); else if (over) lose(p.val + '/' + p.need); return; }
    if (D.kind === 'cap') {
      const now = chProgress(ch, d);
      if (now.val > now.cap) lose('Rp' + now.val.toLocaleString('id-ID') + ' of Rp' + now.cap.toLocaleString('id-ID'));
      else if (over) win(D.share ? Math.round(Math.max(0, (c.base || 0) - p.val) * share / 1000) * 1000 : 0);
      return;
    }
    if (D.kind === 'clean') { const now = chProgress(ch, d); if (now.val > 0) lose('broken on ' + now.bad); else if (over) win(); }
  }

  // Prolog: hari-hari yang sudah tercatat sebelum game dimulai jadi XP awal (tanpa efek HP).
  const pro = Object.keys(days).filter(d => d < start && (days[d].n > 0 || days[d].checkin)).length;
  if (pro) gain(addDays(start, -1), 'Prologue: ' + pro + ' days logged before the adventure began.', pro * 5, pro * 2, 0, 'prologue');

  // Training: workouts by day (in the order they were logged) and excused rest days.
  const train = game.train && game.train.plan ? game.train : null;
  const wByDay = {}, restDays = new Set(), allW = [], mealDays = {};
  (data.journal || []).forEach(j => {
    if (j.kind === 'workout') (wByDay[j.date] = wByDay[j.date] || []).push(j);
    if (j.kind === 'rest') restDays.add(j.date);
  });
  Object.values(wByDay).forEach(l => l.sort((a, b) => a.createdAt - b.createdAt));
  (data.journal || []).filter(j => j.kind === 'workout' && j.date < start).sort((a, b) => a.date < b.date ? -1 : 1).forEach(w => allW.push(w));
  let pending = [], wk = { sched: 0, done: 0, miss: 0 };

  let prevKey = null;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const key = cycleOf(d, starts), c = C(key);
    if (prevKey && prevKey !== key) endCycle(C(prevKey), d);
    prevKey = key;
    const day = days[d], closed = d < today;
    const logged = !!day && (day.n > 0 || day.checkin);
    const dayIdx = c.start ? daysBetween(c.start, d) + 1 : 1;
    // jatah hari ini = sisa budget bebas dibagi sisa hari (termasuk hari ini); kalau sudah habis, jatah 0
    const allowance = c.budget ? Math.max(0, (c.budget.free - c.free) / Math.max(1, c.len - dayIdx + 1)) : null;
    if (day) {
      c.free += day.free;
      Object.entries(day.cats).forEach(([cat, v]) => {
        c.used[cat] = (c.used[cat] || 0) + v;
        const lim = c.budget && c.budget.lines[cat];
        if (lim != null && lim > 0 && !c.overHit[cat] && c.used[cat] > lim) { c.overHit[cat] = d; gain(d, catLabel(cat) + ' went over budget. The boss strikes!', 0, 0, RULES.over.hp, 'over'); }
      });
    }
    const under = allowance == null || (day ? day.free : 0) <= allowance + 500;
    rec[d] = { free: day ? day.free : 0, food: day ? day.food : 0, online: day ? day.online : 0, save: day ? day.save : 0, logged, under: logged && under,
      maxFree: day ? day.maxFree : 0, credit: day ? day.credit : 0, cats: day ? day.cats : {} };

    if (logged) gain(d, 'Logged the day', RULES.log.xp, RULES.log.gold, 0, 'log');
    // quest yang tidak bisa batal dibayar langsung; sisanya di akhir hari
    questsFor(d).forEach(q => {
      const Q = QUESTS[q];
      if ((closed || !Q.eod) && questDone(q, day, allowance)) gain(d, 'Quest complete: ' + Q.name, Q.xp, Q.gold, 0, 'quest');
    });

    {
      if (train && !restDays.has(d)) sessionsOn(train, d).forEach(sess => { pending.push({ date: d, name: sess.name, type: sess.type }); wk.sched++; });
      (wByDay[d] || []).forEach(w => {
        const kind = kindOf(w);
        const pi = pending.findIndex(x => kind === 'any' || (x.type || 'gym') === kind);
        const p = pi >= 0 ? pending.splice(pi, 1)[0] : null;
        const name = w.data.name || (p && p.name) || 'Workout';
        gain(d, (p ? 'Workout done: ' : 'Bonus workout: ') + name, RULES.gym.xp, RULES.gym.gold, S.ko ? 0 : RULES.gym.hp, 'gym');
        prsIn(w, allW).slice(0, RULES.gym.prMax).forEach(pr => gain(d, 'New PR: ' + pr.n + (pr.kg ? ' ' + pr.kg + ' kg × ' + pr.reps : ' ' + pr.reps + ' reps'), RULES.gym.prXp, 0, 0, 'pr'));
        allW.push(w); wk.done++;
      });
      if (closed) {
        pending.filter(x => x.date < d).forEach(x => { missDates.add(x.date); gain(d, 'Skipped ' + x.name + ' (' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][wdOf(x.date)] + '). HP lost.', 0, 0, RULES.gym.missed, 'gymmiss'); wk.miss++; });
        pending = pending.filter(x => x.date >= d);
        if (wdOf(d) === 6) {
          if (wk.sched > 0 && !wk.miss && wk.done >= wk.sched) gain(d, 'Gym week cleared: every session done.', RULES.gym.weekXp, RULES.gym.weekGold, 0, 'gymweek');
          wk = { sched: 0, done: 0, miss: 0 };
        }
      }
    }
    challenges.forEach(ch => { if (ch.data.type !== 'cut' && !chRes[ch.id] && ch.data.start <= d) evalChallenge(ch, d); });
    if (closed && game.body && mealDays[d]) {
      const tg = targets(game.body, weightAvg(data.journal, d));
      if (tg && mealDays[d].p >= tg.protein) gain(d, 'Protein goal hit (' + Math.round(mealDays[d].p) + ' g)', RULES.protein.xp, RULES.protein.gold, 0, 'protein');
      const en = mealDays[d].n >= 2 ? energyDay(data.journal, game.body, d, null) : null;
      if (en && Math.abs(en.net - en.goal) <= RULES.calories.band) gain(d, 'Calorie target hit (' + en.food.toLocaleString('en-US') + ' in / ' + en.out.toLocaleString('en-US') + ' out)', RULES.calories.xp, RULES.calories.gold, 0, 'calories');
    }
    if (!closed) continue;

    if (!logged) { gain(d, 'Missed a day of logging. HP stolen.', 0, 0, RULES.missed.hp, 'miss'); S.streak = 0; S.koGood = 0; continue; }
    S.streak++; S.best = Math.max(S.best, S.streak);
    if (S.streak % RULES.streak.every === 0) gain(d, S.streak + '-day streak!', RULES.streak.xp, RULES.streak.gold, 0, 'streak');
    if (under) {
      c.hits += 1 + (day.free === 0 ? 1 : 0);
      gain(d, day.free === 0 ? 'Critical hit! A no-spend day.' : 'Hit the boss: spent within the safe limit.', RULES.pace.xp, RULES.pace.gold, RULES.pace.hp, 'hit');
      if (S.ko && ++S.koGood >= RULES.reviveDays) { S.ko = false; S.hp = RULES.reviveHp; S.events.push({ date: d, text: 'Back on your feet! HP ' + RULES.reviveHp + '.', kind: 'revive' }); }
    } else { gain(d, 'Spent over the daily safe limit.', 0, 0, RULES.offPace.hp, 'offpace'); S.koGood = 0; }
  }

  // goal milestones (recorded by the app when a goal first reaches 25/50/75/100%)
  Object.entries(game.goalsMeta || {}).forEach(([, m]) => (m.ms || []).forEach(x => {
    if (x.date >= start && x.date <= today) gain(x.date, 'Goal milestone: ' + (m.name || 'goal') + ' reached ' + x.pct + '%', x.pct === 100 ? 150 : 40, x.pct === 100 ? 75 : 15, 0, 'goal');
  }));

  // level dari total XP
  let lvl = 1, rest = S.xp;
  while (rest >= xpNeed(lvl)) { rest -= xpNeed(lvl); lvl++; }
  const spentFund = rewardUses.reduce((s, r) => s + (Number(r.data.amount) || 0), 0);
  const status = S.ko ? 'ko' : S.hp < RULES.sick ? 'sick' : S.hp < RULES.tired ? 'tired' : 'ok';

  const curKey = cycleOf(today, starts), cur = C(curKey);
  const todayDay = days[today];
  const dayIdx = cur.start ? daysBetween(cur.start, today) + 1 : 1;
  const spentBefore = cur.free - (todayDay ? todayDay.free : 0);
  const allowance = cur.budget ? Math.max(0, (cur.budget.free - spentBefore) / Math.max(1, cur.len - dayIdx + 1)) : null;

  // challenges: active ones with live progress, and what can be accepted today
  const active = challenges.filter(ch => !chRes[ch.id] && (ch.data.type === 'cut' ? ch.data.cycle === curKey : true)).map(ch => {
    const c = ch.data;
    if (c.type === 'cut') return { id: ch.id, ...c, used: cur.used[c.cat] || 0, end: cur.end, daysLeft: cur.end ? daysBetween(today, cur.end) + 1 : null };
    return { id: ch.id, ...c, progress: chProgress(ch, today), daysLeft: daysBetween(today, c.end) + 1 };
  });
  const recent = challenges.filter(ch => chRes[ch.id]).sort((a, b) => chRes[a.id].date < chRes[b.id].date ? 1 : -1).slice(0, 6).map(ch => ({ ...ch.data, ...chRes[ch.id] }));
  // Offers are drawn at random but stay fixed for the period (same week / same cycle), so they don't reshuffle on reload.
  const pickRandom = (list, n, seed) => { const a = list.slice(); let h = hash(seed); const out = []; while (a.length && out.length < n) { out.push(a.splice(h % a.length, 1)[0]); h = hash(h + seed); } return out; };
  const offers = [];
  const room = active.length < RULES.ch.maxActive;
  const cutOpen = !!cur.budget && !cur.budget.partial && dayIdx <= RULES.challenge.acceptDays;
  if (room && cutOpen) {
    const prevSpend = {}, pk = addMonthKey(curKey, -1);
    data.txns.forEach(t => { if (t.type === 'out' && cycleOf(t.date, starts) === pk) prevSpend[t.category] = (prevSpend[t.category] || 0) + t.amount; });
    const cats = Object.entries(cur.budget.lines).filter(([cat, v]) => isFree(cat) && v > 0).map(([cat]) => cat).sort();
    pickRandom(cats, 2, 'cut' + curKey).filter(cat => !active.some(a => a.type === 'cut' && a.cat === cat))
      .forEach(cat => { const v = cur.budget.lines[cat]; offers.push({ type: 'cut', cat, budget: v, base: Math.min(v, prevSpend[cat] || v), cycle: curKey }); });
  }
  const backups = [];
  if (room) {
    const wk0 = weekStart(today);
    const hasGarmin = J.some(j => j.kind === 'daily' && j.date >= addDays(today, -7));
    const eligible = Object.keys(CH_DEFS).filter(t => {
      const D = CH_DEFS[t];
      if (D.cycle) return false;
      if (D.needs === 'train' && !train) return false;
      if (D.needs === 'body' && !game.body) return false;
      if (D.needs === 'garmin' && !hasGarmin) return false;
      if (D.weekdaysOnly && wdOf(today) >= 5) return false;
      if (t === 'catweek' && !(cur.budget && Object.keys(cur.budget.lines).some(c => CAT_WEEK.includes(c) && cur.budget.lines[c] > 0))) return false;
      return true;
    }).sort();
    const taken = new Set(challenges.filter(ch => ch.data.type !== 'cut' && ch.data.start >= wk0).map(ch => ch.data.type));
    const open = eligible.filter(t => !taken.has(t) && !active.some(a => a.type === t));
    const featured = pickRandom(eligible, 3, 'week' + wk0);
    const mk = t => {
      const o = { type: t, until: addDays(wk0, 6) };
      if (t === 'catweek') {
        const cats = Object.entries(cur.budget.lines).filter(([c, v]) => CAT_WEEK.includes(c) && v > 0).map(([c]) => c).sort();
        o.cat = pickRandom(cats, 1, 'catweek' + wk0)[0]; o.cap = Math.max(20000, Math.floor(cur.budget.lines[o.cat] / 4.3 * 0.8 / 5000) * 5000);
      }
      return o;
    };
    featured.filter(t => open.includes(t)).forEach(t => offers.push(mk(t)));
    open.filter(t => !featured.includes(t)).forEach(t => backups.push(mk(t)));
    if (!active.some(a => a.type === 'payfirst') && !cur.budget?.partial && cur.start && dayIdx <= RULES.ch.payfirst.days) offers.push({ type: 'payfirst', cycleStart: cur.start });
  }

  return {
    level: lvl, xp: S.xp, xpIn: rest, xpNeed: xpNeed(lvl), title: titleOf(lvl),
    hp: S.hp, hpMax: RULES.hpMax, gold: S.gold, status, streak: S.streak, best: S.best,
    koGood: S.koGood, fund: Math.max(0, S.fund - spentFund), fundEarned: S.fund,
    events: S.events.slice().reverse(), start,
    today: {
      date: today, logged: !!todayDay && (todayDay.n > 0 || todayDay.checkin), free: todayDay ? todayDay.free : 0, allowance,
      quests: questsFor(today).map(q => ({ id: q, ...QUESTS[q], done: questDone(q, todayDay, allowance) })),
    },
    boss: {
      key: curKey, idx: bossIndex(curKey), name: BOSSES[bossIndex(curKey)].name, hits: cur.hits, max: cur.maxHits,
      start: cur.start, end: cur.end, day: dayIdx, len: cur.len, free: cur.free, freeBudget: cur.budget ? cur.budget.free : null,
      paceOk: cur.budget ? cur.free <= cur.budget.free * dayIdx / cur.len : true, partial: !!(cur.budget && cur.budget.partial),
    },
    challenges: { active, offers, backups, recent, room, cutOpen, partial: !!(cur.budget && cur.budget.partial) },
    lastCycles: Object.values(cyc).filter(c => c.done).map(c => ({ key: c.key, result: c.result, hits: c.hits, max: c.maxHits })),
    prevKey: addMonthKey(curKey, -1),
    gym: { pending: pending.slice(), week: wk },
  };
}

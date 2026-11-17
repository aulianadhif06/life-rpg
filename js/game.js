// Mesin game. Semua angka dihitung ulang dari data (transaksi, budget, jurnal), jadi tidak ada
// state yang bisa "nyasar": edit transaksi lama → HP/XP ikut menyesuaikan.
import { isFree, catLabel, addDays, daysBetween, cycleOf, cycleEnd, addMonthKey } from './fin.js';
import { BOSSES } from './sprites.js';
import { sessionsOn, prsIn, wdOf, isSport, kindOf, targets, weightAvg } from './train.js';

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
  protein: { xp: 15, gold: 5 },
  gym: { xp: 25, gold: 10, hp: 5, prXp: 15, prMax: 3, missed: -8, weekXp: 60, weekGold: 30 },
  reviveDays: 3, reviveHp: 40, sick: 30, tired: 60,
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
  const D = d => days[d] || (days[d] = { n: 0, free: 0, food: 0, online: 0, save: 0, checkin: false, cats: {} });
  data.txns.forEach(t => {
    const x = D(t.date); x.n++;
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
  const challenges = (data.journal || []).filter(j => j.kind === 'challenge');
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
    challenges.filter(ch => ch.data.cycle === c.key).forEach(ch => {
      const used = c.used[ch.data.cat] || 0, lim = ch.data.limit;
      if (used <= lim) {
        const saved = Math.max(0, (b && b.lines[ch.data.cat] != null ? b.lines[ch.data.cat] : lim) - used);
        const fund = Math.round(saved * share / 1000) * 1000;
        S.fund += fund;
        gain(date, 'Challenge won: ' + catLabel(ch.data.cat) + ' ≤ ' + Math.round(lim / 1000) + 'K. Reward fund +Rp' + fund.toLocaleString('id-ID'), RULES.challenge.xp, RULES.challenge.gold, 0, 'challenge');
      } else S.events.push({ date, text: 'Challenge missed: ' + catLabel(ch.data.cat) + ' (spent Rp' + used.toLocaleString('id-ID') + ').', kind: 'challenge' });
    });
  };

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
        pending.filter(x => x.date < d).forEach(x => { gain(d, 'Skipped ' + x.name + ' (' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][wdOf(x.date)] + '). HP lost.', 0, 0, RULES.gym.missed, 'gymmiss'); wk.miss++; });
        pending = pending.filter(x => x.date >= d);
        if (wdOf(d) === 6) {
          if (wk.sched > 0 && !wk.miss && wk.done >= wk.sched) gain(d, 'Gym week cleared: every session done.', RULES.gym.weekXp, RULES.gym.weekGold, 0, 'gymweek');
          wk = { sched: 0, done: 0, miss: 0 };
        }
      }
    }
    if (closed && game.body && mealDays[d]) {
      const tg = targets(game.body, weightAvg(data.journal, d));
      if (tg && mealDays[d].p >= tg.protein) gain(d, 'Protein goal hit (' + Math.round(mealDays[d].p) + ' g)', RULES.protein.xp, RULES.protein.gold, 0, 'protein');
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

  // tantangan: usulan untuk siklus ini
  const accepted = challenges.filter(ch => ch.data.cycle === curKey);
  let offers = [];
  const chOpen = !!cur.budget && !cur.budget.partial && dayIdx <= RULES.challenge.acceptDays;
  if (chOpen) {
    const prevSpend = {}, pk = addMonthKey(curKey, -1);
    data.txns.forEach(t => { if (t.type === 'out' && cycleOf(t.date, starts) === pk) prevSpend[t.category] = (prevSpend[t.category] || 0) + t.amount; });
    offers = Object.entries(cur.budget.lines).filter(([c, v]) => isFree(c) && v > 0 && !accepted.some(a => a.data.cat === c))
      .map(([c, v]) => {
        const base = Math.min(v, prevSpend[c] || v);
        return { cat: c, budget: v, limit: Math.max(10000, Math.floor(base * 0.8 / 10000) * 10000) };
      }).sort((a, b) => b.budget - a.budget).slice(0, 3);
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
    challenges: { accepted: accepted.map(a => ({ ...a.data, id: a.id, used: cur.used[a.data.cat] || 0 })), offers, open: chOpen, partial: !!(cur.budget && cur.budget.partial) },
    lastCycles: Object.values(cyc).filter(c => c.done).map(c => ({ key: c.key, result: c.result, hits: c.hits, max: c.maxHits })),
    prevKey: addMonthKey(curKey, -1),
    gym: { pending: pending.slice(), week: wk },
  };
}

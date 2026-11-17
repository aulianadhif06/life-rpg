// Mesin game. Semua angka dihitung ulang dari data (transaksi, budget, jurnal), jadi tidak ada
// state yang bisa "nyasar": edit transaksi lama → HP/XP ikut menyesuaikan.
import { isFree, addDays, daysBetween, cycleOf, cycleEnd, addMonthKey } from './fin.js';
import { BOSSES } from './sprites.js';

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
  reviveDays: 3, reviveHp: 40, sick: 30, tired: 60,
};

export const QUESTS = {
  jatah: { name: 'Jaga jatah', desc: 'Belanja bebas hari ini ≤ jatah aman', xp: 20, gold: 10, icon: 'sword', eod: true },
  nospend: { name: 'Hari tanpa jajan', desc: 'Nol belanja bebas hari ini', xp: 30, gold: 15, icon: 'shield', eod: true },
  food: { name: 'Makan hemat', desc: 'Makan & minum ≤ Rp50rb', xp: 20, gold: 10, icon: 'heart', eod: true },
  noonline: { name: 'Tahan checkout', desc: 'Tidak belanja online', xp: 15, gold: 5, icon: 'chest', eod: true },
  log2: { name: 'Juru catat', desc: 'Catat ≥ 2 transaksi (atau check-in)', xp: 15, gold: 5, icon: 'star' },
  save: { name: 'Isi celengan', desc: 'Pindahkan uang ke tabungan/investasi', xp: 25, gold: 15, icon: 'coin' },
};
const QUEST_POOL = Object.keys(QUESTS);

export const TITLES = [[1, 'Pemula'], [3, 'Pencatat'], [5, 'Petualang'], [8, 'Penjaga Dompet'], [10, 'Ksatria Hemat'], [15, 'Penjaga Harta'], [20, 'Juragan'], [30, 'Sultan']];
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
    if (S.hp === 0 && before > 0) { S.ko = true; S.koGood = 0; S.events.push({ date, text: 'Pingsan! Butuh ' + RULES.reviveDays + ' hari bagus berturut-turut untuk bangun.', kind: 'ko' }); }
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
    if (c.hits >= c.maxHits && freeOk) { c.result = 'win'; gain(date, name + ' dikalahkan! Siklus ditutup di bawah budget.', RULES.boss.xp, RULES.boss.gold, 0, 'boss'); }
    else { c.result = 'lose'; gain(date, name + ' kabur. ' + (freeOk ? 'Serangan kurang (' + c.hits + '/' + c.maxHits + ').' : 'Budget bebas tembus.'), 0, 0, RULES.boss.escapeHp, 'boss'); }
    challenges.filter(ch => ch.data.cycle === c.key).forEach(ch => {
      const used = c.used[ch.data.cat] || 0, lim = ch.data.limit;
      if (used <= lim) {
        const saved = Math.max(0, (b && b.lines[ch.data.cat] != null ? b.lines[ch.data.cat] : lim) - used);
        const fund = Math.round(saved * share / 1000) * 1000;
        S.fund += fund;
        gain(date, 'Tantangan ' + ch.data.cat + ' ≤ ' + Math.round(lim / 1000) + 'rb berhasil! Dana hadiah +' + fund.toLocaleString('id-ID'), RULES.challenge.xp, RULES.challenge.gold, 0, 'challenge');
      } else S.events.push({ date, text: 'Tantangan ' + ch.data.cat + ' gagal (terpakai ' + used.toLocaleString('id-ID') + ').', kind: 'challenge' });
    });
  };

  // Prolog: hari-hari yang sudah tercatat sebelum game dimulai jadi XP awal (tanpa efek HP).
  const pro = Object.keys(days).filter(d => d < start && (days[d].n > 0 || days[d].checkin)).length;
  if (pro) gain(addDays(start, -1), 'Prolog: ' + pro + ' hari tercatat sebelum petualangan dimulai.', pro * 5, pro * 2, 0, 'prologue');

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
        if (lim != null && lim > 0 && !c.overHit[cat] && c.used[cat] > lim) { c.overHit[cat] = d; gain(d, cat + ' tembus budget! Monster menyerang.', 0, 0, RULES.over.hp, 'over'); }
      });
    }
    const under = allowance == null || (day ? day.free : 0) <= allowance + 500;

    if (logged) gain(d, 'Catatan hari ini', RULES.log.xp, RULES.log.gold, 0, 'log');
    // quest yang tidak bisa batal dibayar langsung; sisanya di akhir hari
    questsFor(d).forEach(q => {
      const Q = QUESTS[q];
      if ((closed || !Q.eod) && questDone(q, day, allowance)) gain(d, 'Quest: ' + Q.name, Q.xp, Q.gold, 0, 'quest');
    });
    if (!closed) continue;

    if (!logged) { gain(d, 'Lupa nyatet. Monster mencuri HP.', 0, 0, RULES.missed.hp, 'miss'); S.streak = 0; S.koGood = 0; continue; }
    S.streak++; S.best = Math.max(S.best, S.streak);
    if (S.streak % RULES.streak.every === 0) gain(d, 'Streak ' + S.streak + ' hari!', RULES.streak.xp, RULES.streak.gold, 0, 'streak');
    if (under) {
      c.hits += 1 + (day.free === 0 ? 1 : 0);
      gain(d, day.free === 0 ? 'Critical hit! Hari tanpa jajan.' : 'Serangan ke boss: belanja di bawah jatah.', RULES.pace.xp, RULES.pace.gold, RULES.pace.hp, 'hit');
      if (S.ko && ++S.koGood >= RULES.reviveDays) { S.ko = false; S.hp = RULES.reviveHp; S.events.push({ date: d, text: 'Bangkit lagi! HP ' + RULES.reviveHp + '.', kind: 'revive' }); }
    } else { gain(d, 'Belanja lewat jatah harian.', 0, 0, RULES.offPace.hp, 'offpace'); S.koGood = 0; }
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
  };
}

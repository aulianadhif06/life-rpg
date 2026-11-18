// Training: exercise library, plan generator, schedule helpers and workout statistics.
// The plan + schedule live in the game settings (game.train); each finished workout is a journal entry
// (kind 'workout'); a rest-day excuse is kind 'rest'.
import { addDays, dow } from './fin.js';

// equip: g = gym machine/barbell, d = dumbbells, b = bodyweight. kind: c = compound, i = isolation.
export const EX = {
  bench: { name: 'Barbell bench press', m: 'Chest', e: 'g', k: 'c', reps: '6-10', rest: 150, step: 2.5 },
  db_bench: { name: 'Dumbbell bench press', m: 'Chest', e: 'd', k: 'c', reps: '8-12', rest: 120, step: 2 },
  incline_db: { name: 'Incline dumbbell press', m: 'Chest', e: 'd', k: 'c', reps: '8-12', rest: 120, step: 2 },
  pushup: { name: 'Push-up', m: 'Chest', e: 'b', k: 'c', reps: '8-20', rest: 90 },
  fly: { name: 'Cable or pec-deck fly', m: 'Chest', e: 'g', k: 'i', reps: '12-15', rest: 60, step: 2.5 },
  ohp: { name: 'Overhead press', m: 'Shoulders', e: 'g', k: 'c', reps: '6-10', rest: 150, step: 2.5 },
  db_ohp: { name: 'Seated dumbbell shoulder press', m: 'Shoulders', e: 'd', k: 'c', reps: '8-12', rest: 120, step: 2 },
  pike: { name: 'Pike push-up', m: 'Shoulders', e: 'b', k: 'c', reps: '6-12', rest: 90 },
  lat_raise: { name: 'Lateral raise', m: 'Shoulders', e: 'd', k: 'i', reps: '12-20', rest: 60, step: 1 },
  face_pull: { name: 'Face pull', m: 'Rear delts', e: 'g', k: 'i', reps: '12-15', rest: 60, step: 2.5 },
  rear_fly: { name: 'Rear delt fly', m: 'Rear delts', e: 'd', k: 'i', reps: '12-20', rest: 60, step: 1 },
  pulldown: { name: 'Lat pulldown', m: 'Back', e: 'g', k: 'c', reps: '8-12', rest: 120, step: 2.5 },
  pullup: { name: 'Pull-up', m: 'Back', e: 'b', k: 'c', reps: '5-10', rest: 120 },
  row: { name: 'Barbell row', m: 'Back', e: 'g', k: 'c', reps: '6-10', rest: 120, step: 2.5 },
  cable_row: { name: 'Seated cable row', m: 'Back', e: 'g', k: 'c', reps: '10-12', rest: 90, step: 2.5 },
  db_row: { name: 'One-arm dumbbell row', m: 'Back', e: 'd', k: 'c', reps: '8-12', rest: 90, step: 2 },
  inv_row: { name: 'Inverted row', m: 'Back', e: 'b', k: 'c', reps: '8-15', rest: 90 },
  squat: { name: 'Back squat', m: 'Quads', e: 'g', k: 'c', reps: '6-10', rest: 180, step: 5 },
  leg_press: { name: 'Leg press', m: 'Quads', e: 'g', k: 'c', reps: '10-15', rest: 120, step: 5 },
  goblet: { name: 'Goblet squat', m: 'Quads', e: 'd', k: 'c', reps: '8-12', rest: 120, step: 2 },
  split_squat: { name: 'Bulgarian split squat', m: 'Quads', e: 'd', k: 'c', reps: '8-12', rest: 90, step: 2 },
  bw_split: { name: 'Bodyweight split squat', m: 'Quads', e: 'b', k: 'c', reps: '10-20', rest: 90 },
  leg_ext: { name: 'Leg extension', m: 'Quads', e: 'g', k: 'i', reps: '12-15', rest: 60, step: 2.5 },
  rdl: { name: 'Romanian deadlift', m: 'Hamstrings', e: 'g', k: 'c', reps: '8-10', rest: 150, step: 5 },
  db_rdl: { name: 'Dumbbell Romanian deadlift', m: 'Hamstrings', e: 'd', k: 'c', reps: '8-12', rest: 120, step: 2 },
  leg_curl: { name: 'Leg curl', m: 'Hamstrings', e: 'g', k: 'i', reps: '10-15', rest: 90, step: 2.5 },
  bridge: { name: 'Single-leg glute bridge', m: 'Glutes', e: 'b', k: 'c', reps: '10-15', rest: 60 },
  hip_thrust: { name: 'Hip thrust', m: 'Glutes', e: 'g', k: 'c', reps: '8-12', rest: 120, step: 5 },
  calf: { name: 'Standing calf raise', m: 'Calves', e: 'b', k: 'i', reps: '10-20', rest: 60, step: 2.5 },
  curl: { name: 'Dumbbell curl', m: 'Biceps', e: 'd', k: 'i', reps: '10-15', rest: 60, step: 1 },
  hammer: { name: 'Hammer curl', m: 'Biceps', e: 'd', k: 'i', reps: '10-15', rest: 60, step: 1 },
  chinup: { name: 'Chin-up', m: 'Biceps', e: 'b', k: 'c', reps: '5-10', rest: 120 },
  pushdown: { name: 'Triceps pushdown', m: 'Triceps', e: 'g', k: 'i', reps: '10-15', rest: 60, step: 2.5 },
  oh_ext: { name: 'Overhead triceps extension', m: 'Triceps', e: 'd', k: 'i', reps: '10-15', rest: 60, step: 1 },
  dips: { name: 'Dips', m: 'Triceps', e: 'b', k: 'c', reps: '6-12', rest: 120 },
  knee_raise: { name: 'Hanging knee raise', m: 'Core', e: 'b', k: 'i', reps: '10-15', rest: 60 },
  plank: { name: 'Plank (seconds)', m: 'Core', e: 'b', k: 'i', reps: '30-60', rest: 60, secs: true },
};

// movement slots → best exercise for [gym, dumbbells, bodyweight]
const SLOT = {
  hpush: ['bench', 'db_bench', 'pushup'], ipush: ['incline_db', 'incline_db', 'pushup'], vpush: ['ohp', 'db_ohp', 'pike'],
  hpull: ['row', 'db_row', 'inv_row'], hpull2: ['cable_row', 'db_row', 'inv_row'], vpull: ['pulldown', 'pullup', 'pullup'],
  squat: ['squat', 'goblet', 'bw_split'], quad: ['leg_press', 'split_squat', 'bw_split'], quad2: ['leg_ext', 'goblet', null],
  hinge: ['rdl', 'db_rdl', 'bridge'], ham: ['leg_curl', 'db_rdl', 'bridge'], glute: ['hip_thrust', 'db_rdl', 'bridge'],
  lat: ['lat_raise', 'lat_raise', null], rear: ['face_pull', 'rear_fly', null], fly: ['fly', null, null],
  bi: ['curl', 'curl', 'chinup'], bi2: ['hammer', 'hammer', null], tri: ['pushdown', 'oh_ext', 'dips'], calf: ['calf', 'calf', 'calf'], core: ['knee_raise', 'plank', 'plank'],
};
const T = {
  FA: ['Full body A', ['squat', 'hpush', 'hpull', 'lat', 'bi', 'core', 'calf', 'tri']],
  FB: ['Full body B', ['hinge', 'vpush', 'vpull', 'quad', 'tri', 'rear', 'bi2', 'core']],
  FC: ['Full body C', ['quad', 'ipush', 'hpull2', 'ham', 'lat', 'bi', 'calf', 'tri']],
  UA: ['Upper A', ['hpush', 'hpull', 'vpush', 'vpull', 'lat', 'bi', 'tri', 'rear']],
  LA: ['Lower A', ['squat', 'hinge', 'quad2', 'ham', 'calf', 'core', 'glute']],
  UB: ['Upper B', ['vpush', 'vpull', 'ipush', 'hpull2', 'rear', 'tri', 'bi2', 'lat']],
  LB: ['Lower B', ['hinge', 'quad', 'ham', 'glute', 'calf', 'core', 'quad2']],
  PU: ['Push', ['hpush', 'vpush', 'ipush', 'lat', 'tri', 'fly', 'lat']],
  PL: ['Pull', ['vpull', 'hpull', 'hpull2', 'rear', 'bi', 'bi2', 'core']],
  LG: ['Legs', ['squat', 'hinge', 'quad', 'ham', 'calf', 'core', 'glute']],
};
const SPLITS = { 1: ['FA'], 2: ['FA', 'FB'], 3: ['FA', 'FB', 'FC'], 4: ['UA', 'LA', 'UB', 'LB'], 5: ['UA', 'LA', 'PU', 'PL', 'LG'], 6: ['PU', 'PL', 'LG', 'PU', 'PL', 'LG'] };
export const SPLIT_TXT = { 1: 'one full-body session', 2: 'two full-body sessions (A/B)', 3: 'three full-body sessions (A/B/C)', 4: 'an upper/lower split', 5: 'upper/lower plus push/pull/legs', 6: 'push/pull/legs twice a week' };

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0 = Monday
export const wdOf = date => (dow(date) + 6) % 7;                          // dow(): 0 = Sunday

const exFrom = (id, level) => {
  const x = EX[id];
  const sets = x.k === 'c' ? (level === 'advanced' ? 4 : 3) : (level === 'beginner' ? 2 : 3);
  return { id, name: x.name, sets, reps: x.reps, rest: x.rest };
};

/** Recommended plan from the setup answers. setup: {level, days:[weekday idx], minutes, equip: 'gym'|'db'|'bw'} */
export function recommend(setup) {
  const n = Math.max(1, Math.min(6, setup.days.length));
  const ei = { gym: 0, db: 1, bw: 2 }[setup.equip] ?? 0;
  const cap = Math.max(4, Math.min(8, Math.round((setup.minutes || 60) / 10)));
  const days = [], letters = 'ABCDEF';
  const keys = SPLITS[n];
  const made = {};
  keys.forEach((k, i) => {
    if (made[k]) return;                                   // PPL twice: reuse the same day
    const [name, slots] = T[k], ex = [], seen = new Set();
    for (const s of slots) {
      if (ex.length >= cap) break;
      const id = SLOT[s][ei];
      if (!id || seen.has(id)) continue;
      seen.add(id); ex.push(exFrom(id, setup.level));
    }
    made[k] = letters[days.length];
    days.push({ id: made[k], name, ex });
  });
  const sched = {};
  setup.days.slice().sort((a, b) => a - b).forEach((wd, i) => { sched[wd] = made[keys[i % keys.length]]; });
  return { name: 'Recommended · ' + SPLIT_TXT[n], source: 'rec', days, sched };
}

// ---------- schedule ----------
/** The schedule in force on a date: {wd: dayId}. train.sched is a history [{from, map}] so old misses stay fixed. */
export function schedOn(train, date) {
  const h = (train && train.sched) || [];
  let cur = null;
  for (const s of h) if (s.from <= date) cur = s;
  return cur ? cur.map : null;
}
/** All sessions scheduled on a date (a weekday can hold several, e.g. gym + padel). */
export function sessionsOn(train, date) {
  const m = schedOn(train, date);
  if (!m) return [];
  const v = m[wdOf(date)];
  const ids = Array.isArray(v) ? v : v ? [v] : [];
  return ids.map(id => {
    const d = train.plan && train.plan.days.find(x => x.id === id);
    return d ? { id, name: d.name, type: d.type || 'gym', sport: d.sport || '', min: d.min || 0 } : null;
  }).filter(Boolean);
}
export const sessionOn = (train, date) => sessionsOn(train, date)[0] || null;
export const schedIds = (map, wd) => { const v = map && map[wd]; return Array.isArray(v) ? v : v ? [v] : []; };

// ---------- workout statistics ----------
export const e1rm = (w, r) => (w > 0 ? w * (1 + Math.min(r, 15) / 30) : 0);
const setsOf = ex => (ex.s || []).filter(s => s && s[1] > 0);

/** Best effort per exercise name across the given workouts (sorted by date ascending). */
export function prTable(workouts) {
  const best = {};
  workouts.forEach(w => (w.data.ex || []).forEach(ex => setsOf(ex).forEach(([kg, reps]) => {
    const k = ex.n, v = kg > 0 ? e1rm(kg, reps) : reps;
    if (!best[k] || v > best[k].v) best[k] = { v, kg, reps, date: w.date, bw: !(kg > 0) };
  })));
  return best;
}

/** New PRs in one workout compared with everything before it. */
export function prsIn(workout, before) {
  const prev = prTable(before), out = [];
  (workout.data.ex || []).forEach(ex => {
    const p = prev[ex.n];
    if (!p) return;                                   // first time = baseline, not a PR
    let top = null;
    setsOf(ex).forEach(([kg, reps]) => { const v = kg > 0 ? e1rm(kg, reps) : reps; if (!top || v > top.v) top = { v, kg, reps }; });
    if (top && top.v > p.v + 0.01 && (top.kg > 0) === !p.bw) out.push({ n: ex.n, ...top });
  });
  return out;
}

/** Last logged sets for an exercise name, and a suggestion (double progression). */
export function lastFor(workouts, name, reps, step) {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const ex = (workouts[i].data.ex || []).find(e => e.n === name);
    if (ex && setsOf(ex).length) {
      const sets = setsOf(ex), top = Number(String(reps).split('-').pop()) || 0;
      const kg = Math.max(...sets.map(s => s[0] || 0));
      const allTop = top && sets.every(s => s[1] >= top);
      let tip = null;
      if (kg > 0 && allTop) tip = { kg: Math.round((kg + (step || 2.5)) * 4) / 4, text: 'All sets hit ' + top + '. Go up to ' };
      else if (!(kg > 0) && allTop) tip = { text: 'All sets hit ' + top + '. Add a rep or slow the tempo.' };
      return { date: workouts[i].date, sets, kg, tip };
    }
  }
  return null;
}

export const volume = w => (w.data.ex || []).reduce((s, ex) => s + setsOf(ex).reduce((a, [kg, r]) => a + (kg || 0) * r, 0), 0);
export const setCount = w => (w.data.ex || []).reduce((s, ex) => s + setsOf(ex).length, 0);
export const weekStart = date => addDays(date, -wdOf(date));
export const fmtRest = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

// ---------- sports & cardio ----------
// met = rough energy cost (Compendium of Physical Activities ballpark) for calorie estimates.
export const SPORTS = {
  run: { name: 'Run', met: 9.8, dist: true }, walk: { name: 'Walk', met: 3.5, dist: true }, cycle: { name: 'Cycling', met: 7.5, dist: true },
  swim: { name: 'Swim', met: 7, dist: true }, padel: { name: 'Padel', met: 7 }, basketball: { name: 'Basketball', met: 7.5 },
  football: { name: 'Football', met: 8 }, futsal: { name: 'Futsal', met: 8.5 }, badminton: { name: 'Badminton', met: 5.5 },
  tennis: { name: 'Tennis', met: 7.3 }, hiit: { name: 'HIIT / circuit', met: 8 }, yoga: { name: 'Yoga / mobility', met: 2.8 },
  other: { name: 'Other sport', met: 6 },
};
// Garmin activityType.typeKey → our sport key
export const GARMIN_SPORT = {
  running: 'run', treadmill_running: 'run', trail_running: 'run', track_running: 'run', indoor_running: 'run',
  walking: 'walk', hiking: 'walk', casual_walking: 'walk', speed_walking: 'walk',
  cycling: 'cycle', road_biking: 'cycle', indoor_cycling: 'cycle', mountain_biking: 'cycle', virtual_ride: 'cycle',
  lap_swimming: 'swim', open_water_swimming: 'swim', swimming: 'swim',
  padel: 'padel', basketball: 'basketball', soccer: 'football', football: 'football', futsal: 'futsal', badminton: 'badminton',
  tennis: 'tennis', hiit: 'hiit', cardio: 'hiit', yoga: 'yoga', pilates: 'yoga', breathwork: 'yoga',
  strength_training: 'gym', indoor_cardio: 'hiit',
};
export const EFFORT = [['easy', 'Easy', 0.8], ['moderate', 'Moderate', 1], ['hard', 'Hard', 1.2]];
export const sportKcal = (sport, min, kg, effort) => {
  const s = SPORTS[sport] || SPORTS.other, f = (EFFORT.find(e => e[0] === effort) || EFFORT[1])[2];
  return Math.round(s.met * f * (kg || 70) * (min || 0) / 60);
};
export const isSport = w => w && w.data && w.data.type === 'sport' && w.data.as !== 'gym';
/** 'gym' | 'sport' | 'any'. An untagged Garmin HIIT session can be gym or a sport, so it fills whichever session is due. */
export const kindOf = w => !w || !w.data ? 'gym' : w.data.as === 'gym' ? 'gym' : w.data.type !== 'sport' ? 'gym'
  : (w.data.src === 'garmin' && w.data.gtype === 'hiit' && !w.data.as) ? 'any' : 'sport';

// ---------- nutrition targets ----------
// Mifflin-St Jeor BMR × activity factor, plus a small surplus for lean gain; protein 1.8 g per kg.
export const ACTIVITY = [['light', 'Light (1–2 sessions/week)', 1.375], ['moderate', 'Moderate (3–5/week)', 1.55], ['high', 'High (6+/week or physical job)', 1.725]];
export const GOALS = [['gain', 'Lean muscle gain', 250], ['maintain', 'Maintain / recomp', 0], ['cut', 'Lose fat', -400]];
export function targets(body, weightKg) {
  const b = body || {};
  const w = weightKg || Number(b.weight) || 0, hgt = Number(b.height) || 0, age = Number(b.age) || 0;
  if (!w || !hgt || !age) return null;
  const bmr = 10 * w + 6.25 * hgt - 5 * age + (b.sex === 'female' ? -161 : 5);
  const act = (ACTIVITY.find(a => a[0] === b.activity) || ACTIVITY[1])[2];
  const goal = (GOALS.find(g => g[0] === b.goal) || GOALS[0])[2];
  const kcal = Math.round((bmr * act + goal) / 10) * 10;
  return { kcal, protein: Math.round(w * (b.goal === 'cut' ? 2.0 : 1.8)), bmr: Math.round(bmr), weight: w };
}
/** 7-day average of the weight log ending at a date (journal entries kind 'weight'). */
export function weightAvg(journal, date) {
  const from = addDays(date, -6);
  const xs = (journal || []).filter(j => j.kind === 'weight' && j.date >= from && j.date <= date && j.data.kg > 0).map(j => Number(j.data.kg));
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
}
export function latestWeight(journal, date) {
  const xs = (journal || []).filter(j => j.kind === 'weight' && j.date <= date && j.data.kg > 0).sort((a, b) => a.date < b.date ? 1 : -1);
  return xs.length ? Number(xs[0].data.kg) : null;
}

// Common Indonesian & gym foods, per typical portion. Estimates only.
export const FOODS = [
  ['Nasi putih (1 piring, 200 g)', 260, 5], ['Nasi merah (1 piring)', 220, 5], ['Ayam goreng paha (1 potong)', 260, 22], ['Ayam bakar (1 potong)', 220, 25],
  ['Dada ayam rebus/panggang (100 g)', 165, 31], ['Telur rebus (1 butir)', 75, 6], ['Telur dadar (1 butir)', 110, 7], ['Tempe goreng (2 potong)', 150, 9],
  ['Tahu goreng (2 potong)', 120, 8], ['Ikan bakar (1 ekor sedang)', 220, 34], ['Rendang (1 potong)', 290, 21], ['Sate ayam (10 tusuk + bumbu)', 400, 30],
  ['Nasi goreng (1 piring)', 600, 18], ['Mie goreng instan (1 bungkus)', 380, 8], ['Mie ayam (1 mangkok)', 450, 18], ['Bakso (1 mangkok)', 400, 20],
  ['Soto ayam (1 mangkok, tanpa nasi)', 250, 20], ['Gado-gado (1 porsi)', 400, 15], ['Nasi Padang lengkap (rendang/ayam)', 800, 32], ['Ketoprak (1 porsi)', 450, 14],
  ['Whey protein (1 scoop)', 120, 24], ['Susu UHT (250 ml)', 150, 8], ['Greek yogurt (150 g)', 130, 15], ['Oatmeal (40 g kering)', 150, 5],
  ['Pisang (1 buah)', 105, 1], ['Roti tawar (2 lembar)', 140, 5], ['Selai kacang (1 sdm)', 95, 4], ['Kopi susu gula aren (1 gelas)', 220, 4],
];

// ---------- energy balance (calories in vs out) ----------
export const bmrOf = (body, kg) => {
  const b = body || {}, w = kg || Number(b.weight) || 0, hgt = Number(b.height) || 0, age = Number(b.age) || 0;
  if (!w || !hgt || !age) return null;
  return Math.round(10 * w + 6.25 * hgt - 5 * age + (b.sex === 'female' ? -161 : 5));
};
/**
 * One day's balance. Out = resting + active.
 *  - Garmin days: resting and active calories from the watch (active already includes activities the watch recorded),
 *    plus activities logged by hand in the app and any extra active calories entered for that day.
 *  - Days without Garmin: resting = BMR × 1.2 (covers normal daily movement) + hand-logged activities + extra.
 *  - Today: resting is projected for the full day (the watch only counts it as the day goes on).
 */
export function energyDay(journal, body, date, todayDate) {
  const J = journal || [];
  const food = J.filter(j => j.kind === 'meal' && j.date === date).reduce((s, j) => s + (Number(j.data.kcal) || 0), 0);
  const g = (J.find(j => j.kind === 'daily' && j.date === date) || {}).data || null;
  const manualAct = J.filter(j => j.kind === 'workout' && j.date === date && j.data && j.data.type === 'sport' && j.data.src !== 'garmin').reduce((s, j) => s + (Number(j.data.kcal) || 0), 0);
  const extra = J.filter(j => j.kind === 'energy' && j.date === date).reduce((s, j) => s + (Number(j.data.active) || 0), 0);
  const kg = weightAvg(J, date) || latestWeight(J, date) || Number((body || {}).weight) || 0;
  const bmr = bmrOf(body, kg);
  const isToday = date === todayDate;
  let rest, garminAct = 0, src;
  if (g && g.kcalRest > 0) {
    src = 'garmin';
    garminAct = Number(g.kcalActive) || 0;
    rest = Number(g.kcalRest);
    if (isToday) {   // project the full day from the latest complete Garmin day, or BMR
      const prev = J.filter(j => j.kind === 'daily' && j.date < date && j.data && j.data.kcalRest > 0).sort((a, b) => a.date < b.date ? 1 : -1)[0];
      rest = Math.max(rest, prev ? Number(prev.data.kcalRest) : (bmr || rest));
    }
  } else {
    if (!bmr) return null;
    src = 'estimate';
    rest = Math.round(bmr * 1.2);
  }
  const active = garminAct + manualAct + extra;
  const out = Math.round(rest + active);
  const goal = (GOALS.find(x => x[0] === (body || {}).goal) || GOALS[0])[2];
  return { food: Math.round(food), rest: Math.round(rest), garminAct, manualAct, extra, active: Math.round(active), out, goal, target: out + goal, net: Math.round(food - out), src, partial: isToday };
}

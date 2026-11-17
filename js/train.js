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
export function sessionOn(train, date) {
  const m = schedOn(train, date);
  if (!m) return null;
  const id = m[wdOf(date)];
  if (!id) return null;
  const d = train.plan && train.plan.days.find(x => x.id === id);
  return d ? { id, name: d.name } : { id, name: 'Session ' + id };
}

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

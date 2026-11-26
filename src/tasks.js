// Todo list, reminders, deadlines, daily routines and exams, kept in tasks.json. A 20 second scheduler reports what is due.
const fs = require('fs');
const path = require('path');

let file = null, data = null, timer = null, onEvent = () => {};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const EMPTY = () => ({ todos: [], reminders: [], routines: [], exams: [], log: {}, water: { goal: 8 } });

// Routines every user gets on day one; they can switch them off or change the times.
const DEFAULT_ROUTINES = () => [
  { name: 'Breakfast', icon: 'coffee', times: ['08:30'], anim: 'eating', on: true },
  { name: 'Lunch', icon: 'fork-knife', times: ['13:30'], anim: 'eating', on: true },
  { name: 'Dinner', icon: 'fork-knife', times: ['20:30'], anim: 'eating', on: true },
  { name: 'Drink water', icon: 'drop', times: ['10:30', '12:30', '15:30', '17:30', '19:30'], anim: 'drink_water', on: true, water: true },
  { name: 'Brush teeth', icon: 'sparkle', times: ['07:30', '22:00'], anim: 'brushing', on: true },
  { name: 'Medicine', icon: 'pill', times: [], anim: 'medicine', on: false },
  { name: 'Exercise', icon: 'barbell', times: ['18:00'], anim: 'exercise', on: false },
  { name: 'Go to bed', icon: 'moon', times: ['23:00'], anim: 'yawn_sleepy', on: true },
].map((r) => ({ id: uid(), ...r }));

function init(dir, cb) {
  file = path.join(dir, 'tasks.json'); onEvent = cb || onEvent;
  try { data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { data = EMPTY(); }
  for (const r of data.reminders) if (r.fired && r.ack === undefined) r.ack = true;       // old fired reminders do not come back
  if (!data.routines.length && !data.seeded) { data.routines = DEFAULT_ROUTINES(); data.seeded = true; save(); }
  clearInterval(timer); timer = setInterval(tick, 5000); setTimeout(tick, 1500);
}
const save = () => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } catch { /* disk full etc: keep running */ } };
const d = () => data;

// ---------------------------------------------------------------- finding things by the words people use
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]+/g, ' ').replace(/\s+/g, ' ').trim();
function score(text, query) {
  const A = norm(text).split(' ').filter(Boolean), B = norm(query).split(' ').filter(Boolean); if (!B.length || !A.length) return 0;
  let hit = 0; for (const w of B) if (A.some((x) => x === w || (w.length > 2 && (x.startsWith(w) || w.startsWith(x) && x.length > 2)))) hit++;
  return hit / B.length;
}
/** The item whose field best matches the words in `q` (at least half of them), or null. */
function best(list, q, field = 'text') { let b = null, bs = 0; for (const x of list) { const s = score(x[field], q); if (s > bs) { bs = s; b = x; } } return bs >= 0.5 ? b : null; }
const findTodo = (q, openOnly = false) => best(data.todos.filter((t) => !openOnly || !t.done), q);
const findReminder = (q) => best(data.reminders, q);
const findExam = (q) => best(data.exams, q, 'name');
function moveReminder(id, at) { const r = data.reminders.find((x) => x.id === id); if (!r || !Number.isFinite(at)) return null; r.at = at; r.fired = false; r.ack = false; data.reminders.sort((a, b) => a.at - b.at); save(); return r; }
function clearReminders() { const n = data.reminders.length; data.reminders = []; save(); return n; }
/** A fired reminder stays in the list (with its Open button) until it is dismissed. */
function ackReminder(id) { const r = data.reminders.find((x) => x.id === id); if (!r) return; if (r.fired) data.reminders = data.reminders.filter((x) => x.id !== id); else r.ack = true; save(); }
function setRoutine(name, { times, on } = {}) {
  const r = findRoutine(name); if (!r) return null;
  if (Array.isArray(times)) r.times = times.filter((t) => /^\d{1,2}:\d{2}$/.test(t)); if (typeof on === 'boolean') r.on = on; else if (times && times.length) r.on = true;
  save(); return r;
}
function setWaterGoal(n) { data.water.goal = Math.max(1, Math.min(30, Math.round(n))); save(); return data.water.goal; }


// ---------------------------------------------------------------- todos
function addTodo(text, due = null) {
  text = String(text || '').trim().slice(0, 200); if (!text) return null;
  const t = { id: uid(), text, done: false, due, made: Date.now() }; data.todos.unshift(t); save(); return t;
}
function toggleTodo(id, done) {
  const t = data.todos.find((x) => x.id === id); if (!t) return null;
  t.done = done === undefined ? !t.done : !!done; t.doneAt = t.done ? Date.now() : 0; save();
  if (t.done) onEvent({ type: 'todo-done', todo: t });
  return t;
}
const removeTodo = (id) => { data.todos = data.todos.filter((x) => x.id !== id); save(); };
const clearDone = () => { data.todos = data.todos.filter((x) => !x.done); save(); };

// ---------------------------------------------------------------- reminders / deadlines
/** at: epoch ms. repeat: null | 'daily' | 'weekdays' | 'weekly'. kind: 'reminder' | 'deadline'. */
function addReminder(text, at, { repeat = null, kind = 'reminder', open = null } = {}) {
  text = String(text || '').trim().slice(0, 200); if (!text || !Number.isFinite(at)) return null;
  const r = { id: uid(), text, at, repeat, kind, open: open && open.value ? { label: String(open.label || '').slice(0, 30), kind: open.kind === 'app' ? 'app' : 'url', value: String(open.value).slice(0, 300), ...(open.noAuto ? { noAuto: true } : {}), ...(open.join === 'join' || open.join === 'start' ? { join: open.join } : {}) } : null, fired: false, made: Date.now() }; data.reminders.push(r); data.reminders.sort((a, b) => a.at - b.at); save(); return r;
}
const removeReminder = (id) => { data.reminders = data.reminders.filter((x) => x.id !== id); save(); };
function snooze(id, minutes = 10) { const r = data.reminders.find((x) => x.id === id); if (!r) return null; r.at = Date.now() + minutes * 60000; r.fired = false; save(); return r; }

function nextRepeat(r) {
  let t = r.at; const step = r.repeat === 'weekly' ? 7 : 1;
  do { t += step * 86400000; } while (t <= Date.now() || (r.repeat === 'weekdays' && [0, 6].includes(new Date(t).getDay())));
  return t;
}

// ---------------------------------------------------------------- routines
const routineLog = (day = dayKey()) => (data.log[day] = data.log[day] || {});
function markRoutine(id, count = 1) {
  const r = data.routines.find((x) => x.id === id); if (!r) return null;
  const log = routineLog(); log[id] = Math.min((log[id] || 0) + count, r.water ? 99 : Math.max(1, r.times.length || 1)); save();
  onEvent({ type: 'routine-done', routine: r, count: log[id] }); return { routine: r, count: log[id] };
}
const unmarkRoutine = (id) => { const l = routineLog(); if (l[id] > 0) l[id]--; save(); };
const findRoutine = (name) => { name = String(name || '').toLowerCase(); return data.routines.find((r) => r.name.toLowerCase() === name) || data.routines.find((r) => name.includes(r.name.toLowerCase().split(' ').pop()) || r.name.toLowerCase().includes(name)); };
function saveRoutine(r) {
  const i = data.routines.findIndex((x) => x.id === r.id);
  const clean = { id: r.id || uid(), name: String(r.name || 'Routine').slice(0, 40), icon: r.icon || 'star', times: (r.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(t)), anim: r.anim || 'tick_done', on: r.on !== false, water: !!r.water };
  if (i >= 0) data.routines[i] = { ...data.routines[i], ...clean }; else data.routines.push(clean); save(); return clean;
}
const removeRoutine = (id) => { data.routines = data.routines.filter((x) => x.id !== id); save(); };

/** Streak of days on which every enabled routine with a time was completed at least once. */
function routineStats() {
  const active = data.routines.filter((r) => r.on && r.times.length);
  const doneOn = (day) => { const l = data.log[day] || {}; return active.length ? active.filter((r) => (l[r.id] || 0) >= (r.water ? 1 : r.times.length)).length : 0; };
  const today = dayKey(); const l = data.log[today] || {};
  let streak = 0; for (let i = 1; i < 400; i++) { const k = dayKey(new Date(Date.now() - i * 86400000)); if (active.length && doneOn(k) === active.length) streak++; else break; }
  return { total: active.length, done: doneOn(today), streak, water: Object.fromEntries(data.routines.filter((r) => r.water).map((r) => [r.id, l[r.id] || 0])), waterGoal: data.water.goal };
}

// ---------------------------------------------------------------- exams
function addExam(name, date) { const t = Date.parse(date); if (!name || !Number.isFinite(t)) return null; const e = { id: uid(), name: String(name).slice(0, 60), date: t }; data.exams.push(e); data.exams.sort((a, b) => a.date - b.date); save(); return e; }
const removeExam = (id) => { data.exams = data.exams.filter((x) => x.id !== id); save(); };

// ---------------------------------------------------------------- calendar import (.ics)
/** Reads VEVENT / VTODO entries from an iCalendar file and adds the future ones as deadlines. Returns how many were added. */
function importIcs(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/); let added = 0, cur = null;
  const when = (v) => {
    const m = String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/); if (!m) return NaN;
    return m[7] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0)).getTime();
  };
  for (const ln of lines) {
    if (/^BEGIN:(VEVENT|VTODO)/.test(ln)) cur = {}; else if (/^END:(VEVENT|VTODO)/.test(ln)) {
      if (cur && cur.title && Number.isFinite(cur.at) && cur.at > Date.now() && !data.reminders.some((r) => r.text === cur.title && r.at === cur.at)) { data.reminders.push({ id: uid(), text: cur.title.slice(0, 200), at: cur.at, repeat: null, kind: 'deadline', fired: false, made: Date.now() }); added++; }
      cur = null;
    } else if (cur) {
      const m = ln.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/); if (!m) continue;
      if (m[1] === 'SUMMARY') cur.title = m[2].replace(/\\([,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c)).trim();
      else if (m[1] === 'DTSTART' || m[1] === 'DUE') cur.at = when(m[2].trim());
    }
  }
  data.reminders.sort((a, b) => a.at - b.at); save(); return added;
}

// ---------------------------------------------------------------- scheduler
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const routineFired = new Set();                                  // `${day}|${id}|${time}`, this session only
function tick() {
  if (!data) return; const now = Date.now(); let changed = false;
  for (const r of data.reminders) {
    if (r.fired || r.at > now) continue;
    onEvent({ type: 'reminder', reminder: r, late: now - r.at > 120000 });
    if (r.repeat) r.at = nextRepeat(r); else { r.fired = true; r.ack = false; } changed = true;      // stays listed until dismissed
  }
  data.reminders = data.reminders.filter((r) => !r.fired || r.ack === false || now - r.at < 86400000);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes(), day = dayKey();
  for (const r of data.routines) {
    if (!r.on) continue;
    const done = routineLog()[r.id] || 0;
    r.times.forEach((t, i) => {
      const key = `${day}|${r.id}|${t}`; const m = hm(t);
      if (routineFired.has(key) || nowMin < m || nowMin > m + 20) return;       // only within 20 minutes after the set time (nothing after a missed window)
      routineFired.add(key);
      if (!r.water && done > i) return;                                       // already done
      onEvent({ type: 'routine', routine: r, time: t });
    });
  }
  if (changed) save();
}

/** Everything the dock needs to draw itself. */
function snapshot() {
  const now = Date.now();
  return {
    todos: data.todos, reminders: data.reminders.filter((r) => !r.fired || r.ack === false).slice(0, 50), exams: data.exams.filter((e) => e.date > now - 86400000),
    routines: data.routines, today: routineLog(), stats: routineStats(),
  };
}

/** The short line Tito says in the morning. */
function brief() {
  const open = data.todos.filter((t) => !t.done), day = dayKey(); const soon = data.reminders.filter((r) => !r.fired && dayKey(new Date(r.at)) === day);
  const exam = data.exams.find((e) => e.date > Date.now()); const parts = [];
  if (soon.length) parts.push(`${soon.length} reminder${soon.length > 1 ? 's' : ''} today`);
  if (open.length) parts.push(`${open.length} thing${open.length > 1 ? 's' : ''} on your list`);
  if (exam) parts.push(`${exam.name} in ${Math.max(0, Math.ceil((exam.date - Date.now()) / 86400000))} days`);
  return parts.length ? 'Good morning. ' + parts.join(', ') + '.' : 'Good morning. Nothing is waiting for you today.';
}

module.exports = { best, findTodo, findReminder, findExam, moveReminder, clearReminders, ackReminder, setRoutine, setWaterGoal, importIcs, init, snapshot, brief, tick, addTodo, toggleTodo, removeTodo, clearDone, addReminder, removeReminder, snooze, markRoutine, unmarkRoutine, findRoutine, saveRoutine, removeRoutine, routineStats, addExam, removeExam, dayKey, _data: d };

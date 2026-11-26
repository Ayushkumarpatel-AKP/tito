// Exam Rescue Autopilot: a chapter list + an exam date become a day-by-day plan. Each day has a study reminder and a Teach Tito reminder, every
// chapter gets flashcards, Focus Guard's study minutes decide whether you kept up, and a plan that slipped moves the work forward by itself.
// The plan, the readiness score and the adjusting are plain rules (no AI, no key). The functions here are pure so they can be tested.
const fs = require('fs');
const path = require('path');
const kit = require('./textkit');

const DAY = 86400000;
let file = null, db = null;
function init(dir) { file = path.join(dir, 'rescue.json'); db = null; }
function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = null; }
  if (!db || !Array.isArray(db.plans)) db = { plans: [] };
  return db;
}
const save = () => { try { fs.writeFileSync(file, JSON.stringify(load())); } catch { /* ignore */ } };
const plans = () => load().plans;

const pad = (n) => String(n).padStart(2, '0');
const key = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const keyToMs = (k, hour = 0, min = 0) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, hour, min).getTime(); };
const label = (k) => new Date(keyToMs(k)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** The days still open for study: today (if the study hour has not passed) up to the day before the exam. */
function openDays(plan, now) {
  const out = []; const examDay = dayStart(plan.examAt);
  const d = new Date(dayStart(now)); if (new Date(now).getHours() >= plan.studyHour) d.setDate(d.getDate() + 1);
  while (d.getTime() < examDay && out.length < 400) { out.push(key(d.getTime())); d.setDate(d.getDate() + 1); }
  return out;
}

/** Spread the unfinished chapters over `dayKeys`: proportional to their pages, last days kept for revision. Returns plan days. */
function spread(plan, dayKeys) {
  const rev = dayKeys.length >= 8 ? Math.max(1, Math.round(dayKeys.length * 0.2)) : dayKeys.length >= 3 ? 1 : 0;
  const learnKeys = dayKeys.slice(0, dayKeys.length - rev), revKeys = dayKeys.slice(dayKeys.length - rev);
  const left = plan.chapters.filter((c) => !c.done); const days = learnKeys.map((k) => ({ date: k, type: 'learn', chapters: [], settled: false }));
  const L = days.length;
  if (left.length && L) {
    const w = (c) => Math.max(1, c.pages || 1), total = left.reduce((a, c) => a + w(c), 0); let cum = 0;
    for (const c of left) {
      const s = Math.min(L - 1, Math.floor((cum / total) * L)); cum += w(c); const e = Math.min(L - 1, Math.max(s, Math.ceil((cum / total) * L) - 1));
      for (let i = s; i <= e; i++) days[i].chapters.push(c.n);
    }
  }
  const all = plan.chapters.map((c) => c.n);
  for (const k of revKeys) days.push({ date: k, type: 'revise', chapters: all, settled: false });
  if (!left.length && !revKeys.length) for (const d of days) { d.type = 'revise'; d.chapters = all; }
  return { days, rev };
}

/** { name, examAt, chapters: [{ n, title, from, to }], studyHour, dayMin, pdf } -> a new plan (not stored), or { ok: false, reason }. */
function buildPlan({ name, examAt, chapters, studyHour = 18, dayMin = 90, pdf = '', now = Date.now() }) {
  if (!name || !Number.isFinite(examAt)) return { ok: false, reason: 'need-exam' };
  if (!chapters || !chapters.length) return { ok: false, reason: 'no-chapters' };
  const plan = {
    id: uid(), name: String(name).slice(0, 60), examAt: dayStart(examAt), studyHour: Math.min(23, Math.max(5, studyHour)), dayMin: Math.min(480, Math.max(20, dayMin)), pdf, created: now,
    chapters: chapters.map((c, i) => ({ n: i + 1, title: String(c.title).slice(0, 80), from: c.from || 0, to: c.to || 0, pages: c.from && c.to ? c.to - c.from + 1 : 1, done: false, cards: 0 })),
    days: [], reminders: [], adjustments: [],
  };
  const keys = openDays(plan, now); if (!keys.length) return { ok: false, reason: 'too-late' };
  plan.days = spread(plan, keys).days;
  return { ok: true, plan };
}

// ---- progress ---------------------------------------------------------------------------------------------
const cardValue = (c) => Math.max(0, Math.min(1, c.box / 4 - 0.15 * (c.missed || 0)));
/** { percent, chapters: [{ n, title, pct, done, cards, teach }], daysLeft } from study progress, flashcards and Teach Tito scores. */
function readiness(plan, { cards = [], teachLog = [], now = Date.now() } = {}) {
  const rows = plan.chapters.map((c) => {
    const mine = cards.filter((x) => x.tag === `rescue:${plan.id}:${c.n}` && (x.box > 0 || (x.missed || 0) > 0));
    const cardScore = mine.length ? mine.reduce((a, x) => a + cardValue(x), 0) / mine.length : null;
    const t = teachLog.filter((x) => kit.overlap(x.topic, c.title) >= 0.5).sort((a, b) => b.ts - a.ts)[0];
    const teach = t ? Math.max(0, Math.min(1, t.avg / 100)) : null;
    const parts = [[0.4, c.done ? 1 : 0]]; if (cardScore !== null) parts.push([0.3, cardScore]); if (teach !== null) parts.push([0.3, teach]);
    const v = parts.reduce((a, [w, x]) => a + w * x, 0) / parts.reduce((a, [w]) => a + w, 0);
    return { n: c.n, title: c.title, pct: Math.round(v * 100), done: c.done, cards: cardScore === null ? null : Math.round(cardScore * 100), teach: teach === null ? null : Math.round(teach * 100), w: Math.max(1, c.pages || 1) };
  });
  const tw = rows.reduce((a, r) => a + r.w, 0) || 1;
  const percent = Math.round(rows.reduce((a, r) => a + r.pct * r.w, 0) / tw);
  return { percent, chapters: rows, daysLeft: Math.max(0, Math.round((plan.examAt - dayStart(now)) / DAY)) };
}

const hhmm = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + ' min' : ''}`.trim() : `${min} min`);
/** What a day asks for, as short text. */
function dayText(plan, d) {
  const ch = d.chapters.map((n) => plan.chapters.find((c) => c.n === n)).filter(Boolean);
  if (d.type === 'revise') return `Revise ${plan.name}: all chapters, your flashcards and one Teach Tito round`;
  return `Study ${ch.map((c) => c.title).join(' and ')}${ch[0] && ch[0].from ? ` (pages ${ch[0].from}-${ch[ch.length - 1].to})` : ''} for about ${hhmm(plan.dayMin)}`;
}

/** Marks days that have passed: enough Focus Guard minutes = done, otherwise the unfinished chapters move forward.
 *  focusMin(dateKey) -> minutes of real study that day. Returns { changed, messages, moved: [chapter n], pulled: [chapter n] } and edits the plan. */
function adjust(plan, { now = Date.now(), focusMin = () => 0, force = false } = {}) {
  const today = key(now); const messages = []; let changed = false; const missedCh = new Set();
  for (const d of plan.days) {
    if (d.settled || d.date >= today) continue;
    d.settled = true; changed = true;
    const got = Math.round(focusMin(d.date) || 0), need = plan.dayMin;
    if (d.type === 'revise') { d.ok = got >= need * 0.5; continue; }
    if (got >= need * 0.6) {
      d.ok = true;
      for (const n of d.chapters) { const last = plan.days.filter((x) => x.type === 'learn' && x.chapters.includes(n)).map((x) => x.date).sort().pop(); if (last <= d.date) { const c = plan.chapters.find((x) => x.n === n); if (c) c.done = true; } }
    } else { d.ok = false; d.missed = Math.max(0, need - got); messages.push(`${label(d.date)}: studied ${got} of ${need} min`); for (const n of d.chapters) missedCh.add(n); }
  }
  const stuck = plan.chapters.filter((c) => !c.done && !plan.days.some((d) => d.date >= today && d.chapters.includes(c.n) && d.type === 'learn'));
  if (!missedCh.size && !stuck.length && !force) return { changed, messages: [], moved: [], pulled: [] };
  const keys = openDays(plan, now);
  const keep = plan.days.filter((d) => d.date < keys[0] || !keys.length);
  const before = JSON.stringify(plan.days.filter((d) => d.date >= (keys[0] || '9999')).map((d) => [d.date, d.chapters]));
  if (!keys.length) { messages.push('There are no study days left before the exam. Use the time to revise.'); return { changed: true, messages, moved: [...missedCh], pulled: [...missedCh] }; }
  const { days, rev } = spread(plan, keys);
  plan.days = [...keep, ...days];
  if (JSON.stringify(days.map((d) => [d.date, d.chapters])) !== before) changed = true;
  const moved = [...new Set([...missedCh, ...stuck.map((c) => c.n)])].filter((n) => !plan.chapters.find((c) => c.n === n).done);
  for (const n of moved) { const nd = days.find((d) => d.chapters.includes(n) && d.type === 'learn'); const c = plan.chapters.find((x) => x.n === n); messages.push(`${c.title} moved to ${nd ? label(nd.date) : 'revision'}.`); }
  if (moved.length && rev === 0 && keys.length < 3) messages.push('Few days left, so there is no separate revision day.');
  return { changed, messages, moved, pulled: moved };
}

/** Everything about a plan as Markdown for the chat. */
function statusMarkdown(plan, r, now = Date.now()) {
  const today = key(now); const lines = [`**${plan.name}**: ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} to the exam. **${r.percent}% ready**`, ''];
  for (const c of r.chapters) lines.push(`- ${c.done ? '[done] ' : ''}${c.title}: **${c.pct}%**${c.cards !== null ? `, cards ${c.cards}%` : ''}${c.teach !== null ? `, teaching ${c.teach}%` : ''}`);
  const next = plan.days.filter((d) => d.date >= today).slice(0, 3);
  if (next.length) { lines.push('', '**Coming up**'); for (const d of next) lines.push(`- ${label(d.date)}: ${dayText(plan, d)}`); }
  const missed = plan.days.filter((d) => d.missed).length; if (missed) lines.push('', `Missed study days so far: ${missed}. The plan has moved the work forward.`);
  return lines.join('\n');
}

const add = (plan) => { load().plans.push(plan); save(); return plan; };
const remove = (id) => { const p = plans().find((x) => x.id === id); db.plans = plans().filter((x) => x.id !== id); save(); return p || null; };
const find = (name) => { const n = String(name || '').toLowerCase().trim(); return (n && plans().find((p) => p.name.toLowerCase() === n)) || (n && plans().find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()))) || null; };
/** The plan to talk about when none is named: the one whose exam is next. */
const current = (now = Date.now()) => plans().filter((p) => p.examAt >= dayStart(now)).sort((a, b) => a.examAt - b.examAt)[0] || null;

module.exports = { init, save, plans, add, remove, find, current, buildPlan, spread, adjust, readiness, statusMarkdown, dayText, openDays, key, keyToMs, label, dayStart, hhmm };

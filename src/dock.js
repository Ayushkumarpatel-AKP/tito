// Tito Dock: the little pet that lives at the edge of the screen, with its panel (today, study, media, daily).
// Owns the dock window, the task scheduler's alerts, voice commands and the media / search helpers behind them.
const { BrowserWindow, Notification, screen, ipcMain, shell, globalShortcut, session } = require('electron');
const path = require('path');
const store = require('./store');
const tasks = require('./tasks');
const intent = require('./intent');
const media = require('./media');
const search = require('./search');
const voice = require('./voice');

const PET = { w: 190, h: 176 };                    // the pet's own area, always at the bottom of the window
const PANEL = { w: 404, h: 540 };                  // the panel sits above it and shrinks on short screens
let win = null, open = false, pop = false, popH = 150, deps = null, pos = null, bubble = false, hiddenForOverlay = false;
const POP_W = 344;
let focusSession = null;
const BUBBLE_H = 150;                                // extra height while the pet is speaking, so a long bubble is never cut off   // pos: { side: 'left' | 'right', bottom: screen y of the pet's bottom edge }

const openOut = (u) => (process.env.TITO_DOCK_HIDDEN ? Promise.resolve() : shell.openExternal(u));   // tests never open a real browser or app
const send = (ch, p) => { if (win && !win.isDestroyed()) win.webContents.send(ch, p); };
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { ok: false, message: String(e.message || e) }; } });
const fmtWhen = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

// ------------------------------------------------------------------ window
// The pet keeps its place on screen; opening the panel grows the window upward, never off the screen.
function workArea() {
  try { if (win && !win.isDestroyed()) return screen.getDisplayMatching(win.getBounds()).workArea; } catch { /* fall through */ }
  return screen.getPrimaryDisplay().workArea;
}
function bounds() {
  const wa = workArea(), right = !pos || pos.side !== 'left';
  const minPanel = 300;
  let bottom = pos && Number.isFinite(pos.bottom) ? pos.bottom : wa.y + wa.height - 8;
  bottom = Math.min(Math.max(bottom, wa.y + PET.h + (open ? minPanel : pop ? Math.min(popH, 200) : 0)), wa.y + wa.height);
  const panelH = open ? Math.min(PANEL.h, bottom - wa.y - PET.h) : 0;
  const popExtra = pop && !open ? Math.min(popH, bottom - wa.y - PET.h) : 0;
  const w = open ? PANEL.w : pop ? POP_W : PET.w, h = PET.h + panelH + popExtra + (bubble && !open && !pop ? BUBBLE_H : 0);
  return { x: right ? wa.x + wa.width - w - 6 : wa.x + 6, y: bottom - h, width: w, height: h };
}
function apply() { if (win && !win.isDestroyed()) { win.setBounds(bounds()); send('dock:layout', { open, pop, side: pos ? pos.side : 'right' }); } }

function ensure() {
  if (win && !win.isDestroyed()) return win;
  const saved = store.get().dock; pos = saved && Number.isFinite(saved.bottom) ? { side: saved.side === 'left' ? 'left' : 'right', bottom: saved.bottom } : null;
  win = new BrowserWindow({
    ...bounds(), show: false, frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating'); win.setVisibleOnAllWorkspaces(true);
  if (process.env.TITO_DOCK_HIDDEN) { win.show = win.showInactive = win.focus = () => {}; }   // tests: the window never appears on the real desktop
  win.loadFile(path.join(__dirname, '..', 'renderer', 'dock.html'));
  win.once('ready-to-show', () => { if (store.get().dockOn !== false) win.showInactive(); });
  win.on('closed', () => { win = null; });
  win.on('blur', () => { if (pop && !open) setTimeout(() => { if (pop && win && !win.isDestroyed() && !win.isFocused()) setPop(false); }, 400); });   // clicking elsewhere closes the small popup
  return win;
}

function toggleDock() {
  ensure();
  if (win.isVisible()) { win.hide(); store.save({ dockOn: false }); } else { win.showInactive(); store.save({ dockOn: true }); }
  return win.isVisible();
}
function openPanel(tab) { ensure(); open = true; pop = false; apply(); win.show(); win.focus(); send('dock:tab', tab || null); }
function setOpen(v) { open = !!v; if (open) { pop = false; bubble = false; } apply(); if (open && win) win.focus(); }
function setPop(v) { pop = !!v; if (pop) { open = false; bubble = false; } apply(); if (pop && win && !process.env.TITO_DOCK_HIDDEN) win.focus(); }

// ------------------------------------------------------------------ alerts (reminders, routines, todos)
const ROUTINE_SAY = {
  Breakfast: 'Breakfast time. Have something before you start.', Lunch: 'Lunch time. Take a proper break.', Dinner: 'Dinner time.',
  'Drink water': 'Time for a glass of water.', 'Brush teeth': 'Time to brush your teeth.', Medicine: 'Do not forget your medicine.',
  Exercise: 'Time to move a little.', 'Go to bed': 'It is getting late. Time to sleep.',
};
function alert(p) {
  ensure(); send('dock:alert', p);
  const petVisible = win && !win.isDestroyed() && win.isVisible();
  if (store.get().notify !== false && !p.noNotify && !petVisible && !process.env.TITO_DOCK_HIDDEN && Notification.isSupported()) {
    const n = new Notification({ title: p.title || 'Tito', body: p.text, silent: true }); n.on('click', () => openPanel(p.tab || 'today')); n.show();
  }
  if (win && !win.isVisible() && store.get().dockOn !== false && !hiddenForOverlay) win.showInactive();   // not while the circle overlay is open
}
function onTaskEvent(e) {
  if (e.type === 'reminder' && e.reminder.open && e.reminder.open.kind === 'url' && store.get().autoOpenSites !== false) openTarget(e.reminder.open);   // a site or video opens at the time; apps wait for your tap
  if (e.type === 'reminder') alert({ title: e.reminder.kind === 'deadline' ? 'Deadline' : 'Reminder', ring: e.reminder.kind !== 'deadline' || true, text: e.reminder.text + (e.reminder.open && e.reminder.open.kind === 'url' && store.get().autoOpenSites !== false ? '  (opening ' + e.reminder.open.label + ')' : ''), open: e.reminder.open, anim: e.reminder.kind === 'deadline' ? 'worried' : 'alarm', id: e.reminder.id, snooze: true, tab: 'today' });
  else if (e.type === 'routine') alert({ title: e.routine.name, text: ROUTINE_SAY[e.routine.name] || e.routine.name, anim: e.routine.anim === 'eating' ? 'hungry' : e.routine.anim, routine: e.routine.id, tab: 'daily' });
  else if (e.type === 'todo-done') send('dock:cheer', { anim: 'celebrate', text: 'Done. Nice work.' });
  else if (e.type === 'routine-done') send('dock:cheer', { anim: 'tick_done', text: `${e.routine.name} done.` });
  send('dock:data', tasks.snapshot());
}

// ------------------------------------------------------------------ commands (typed or spoken)
const TEACH_SYSTEM = [
  'You are Tito, a curious, friendly 10 year old learner. A student is teaching you a topic out loud (the Feynman technique). Judge their explanation honestly, kindly and accurately.',
  'Reply with ONLY one JSON object, no markdown: {"score":0-100,"good":[up to 3 things they explained correctly],"gaps":[up to 3 important things they left out],"wrong":[up to 3 mistakes, each with the correct fact],"question":"one short, curious follow-up question a child would ask that probes the biggest gap","cards":[up to 3 {"front":"question","back":"short answer"} for the gaps and mistakes],"praise":"one short encouraging sentence"}.',
  'Score the correctness and completeness for a learner of that level. If the explanation is too short or off topic, say so in "wrong" and score low. Answer in the same language style as the student (English, Hindi or Hinglish). Keep every string short.',
].join('\n');

/** Rules did not understand it (or a reminder has no time): ask the AI. It answers in its own small JSON format (not Tito's explain format),
 *  which also lets it chat normally. Returns a result, or null when no AI is available. */
const ASSISTANT = [
  'You are Tito, a friendly, smart desktop assistant and study buddy who lives on the user\'s screen. You chat about anything, explain things clearly and write code. The user writes in English, Hindi or Hinglish: answer in the same language style.',
  'Format answers in Markdown: short paragraphs, lists, **bold** for key words, and fenced code blocks with the language name (```python) for ALL code, so it can be copied. Be accurate and as brief as the question allows. If something important is unclear (which site, what time, which item), do not guess: ask one short clarifying question.',
  'If the user wants Tito to DO something inside Tito (a reminder, to-do, music, a web search, opening a site or app, routines, flashcards, exams, switching tab), reply with ONLY one line and no other text: ACTION {json}. The json has "action" and as needed "text", "at", "query", "source", "open", "name", "times", "on", "front", "back", "tab".',
  'Actions: reminder (text, "at" as local YYYY-MM-DDTHH:MM worked out from the current time given below, a bare "11.30" means the next 11:30, optional "open": a site or app name like youtube, whatsapp, vs code, or "youtube: search words" for a video search); todo (text); todo_done, todo_delete, reminder_delete (text = words from the item); reminder_move (text, at); routine_add (name, times as HH:MM array); routine_set (name, optional times and on:true/false); routine_remove (name); card_add (front, back); exam_add (name, at); play (source youtube or spotify, query); search (query); open (open = site or app name or https address); tab (tab = today, study, media, daily or chat).',
  'If a reminder has no clear time, do not use ACTION: ask for the time in plain text.',
].join('\n');
function extractJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) return null;
  try { return JSON.parse(m[0]); } catch { /* try a looser read of "key: value" style output */ }
  return null;
}
async function aiAssist(text, history = []) {
  const engine = require('./engine'); const now = new Date(); const nm = store.get().userName;
  const system = ASSISTANT + '\nCurrent local time: ' + now.toString() + '.' + (nm ? ' The user is called ' + nm + '.' : '');
  let r; try { r = await engine.ask({ images: [], turns: [...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', text: String(h.text).slice(0, 1200) })), { role: 'user', text: String(text).slice(0, 2000) }], task: 'explain', rawSystem: system, rawJson: false, maxTokens: 1800 }); } catch { return null; }
  if (!r || !r.ok || !r.result || !r.result.answer) return null;
  const ans = String(r.result.answer).trim();
  const am = ans.match(/^\s*ACTION\s*:?\s*(\{[\s\S]*\})\s*$/i); let j = null;
  if (am) { try { j = JSON.parse(am[1]); } catch { j = null; } } else if (/^\s*\{[\s\S]*"action"[\s\S]*\}\s*$/.test(ans)) j = extractJson(ans);
  if (!j) return { ok: true, intent: { type: 'chat' }, anim: 'talking', say: ans.slice(0, 8000), md: true };
  const act = String(j.action || 'chat').toLowerCase();
  if (act === 'reminder') {
    const at = Date.parse(j.at);
    if (Number.isFinite(at) && at > Date.now() - 60000) {
      const open = j.open ? resolveOpen(String(j.open)) : null;
      return exec({ type: 'reminder', text: String(j.text || '').slice(0, 200) || 'Reminder', at, repeat: null, kind: 'reminder', whenGuessed: false, open: open || intent.findTarget(String(j.text || '') + ' ' + text) }, text, true);
    }
    return { ok: false, intent: { type: 'chat' }, anim: 'confused', say: String(j.reply || 'What time should I remind you?').slice(0, 300) };
  }
  const q = String(j.text || j.query || j.name || '');
  const map = {
    todo_done: { type: 'todo_done', query: q }, todo_delete: { type: 'todo_delete', query: q }, reminder_delete: { type: 'reminder_delete', query: q, all: !q },
    reminder_move: { type: 'reminder_move', query: q, at: Date.parse(j.at) }, routine_add: { type: 'routine_add', name: String(j.name || q || 'Routine'), times: Array.isArray(j.times) ? j.times : [] },
    routine_set: { type: 'routine_set', name: q, times: Array.isArray(j.times) ? j.times : undefined, on: typeof j.on === 'boolean' ? j.on : undefined }, routine_remove: { type: 'routine_remove', name: q },
    card_add: { type: 'card_add', front: String(j.front || ''), back: String(j.back || '') }, exam_add: { type: 'exam_add', name: String(j.name || q || 'Exam'), at: Date.parse(j.at) }, tab: { type: 'tab', tab: String(j.tab || 'today') },
    todo: { type: 'todo', text: String(j.text || '') }, play: { type: 'play', source: j.source === 'spotify' ? 'spotify' : 'youtube', query: String(j.query || j.text || '') }, search: { type: 'search', query: String(j.query || j.text || '') },
  };
  if (map[act] && (act !== 'todo' || j.text) && (!['play', 'search'].includes(act) || map[act].query || map[act].text)) return exec(map[act], text, true);
  if (act === 'open' && j.open) { const tg = resolveOpen(String(j.open)); if (tg) return exec({ type: 'open', target: tg }, text, true); }
  return { ok: true, intent: { type: 'chat' }, anim: 'talking', say: String(j.reply || j.text || 'Okay.').slice(0, 800), md: true };
}
/** Finds a site by its name by checking the likely addresses (unstop -> unstop.com). Null when none answers. */
async function resolveSite(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); if (slug.length < 2) return null;
  const hosts = [slug + '.com', slug + '.in', slug + '.org', slug + '.io', slug + '.co', slug + '.net', slug + '.ai'];
  const probe = async (h) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    try { const r = await fetch('https://' + h, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': search.UA } }); return r.status < 500 && r.status !== 404 && r.status !== 410 ? { host: h, url: r.url || 'https://' + h } : null; }
    catch { return null; } finally { clearTimeout(t); }
  };
  const hit = (await Promise.all(hosts.map(probe))).find(Boolean); if (!hit) return null;
  let u; try { u = new URL(hit.url); } catch { u = null; }
  return { label: String((u && u.hostname) || hit.host).replace(/^www\./, ''), kind: 'url', value: (u && u.origin) || 'https://' + hit.host };
}
const askOpen = (name) => ({ ok: true, anim: 'confused', say: `I could not find a website called "${name}". What should I do?`, ask: { options: [{ label: 'Search the web', cmd: 'search ' + name }, { label: 'Search on Google', url: 'https://www.google.com/search?q=' + encodeURIComponent(name) }] } });
/** "youtube: lofi songs", "https://...", or a plain site / app name -> an openable target. */
function resolveOpen(s) {
  const yt = s.match(/^youtube\s*[:\-]\s*(.+)$/i); if (yt) return { label: 'YouTube', kind: 'url', value: media.youtubeSearchUrl(yt[1].trim()) };
  if (/^https:\/\//i.test(s)) return { label: s.replace(/^https:\/\//i, '').split('/')[0], kind: 'url', value: s };
  return intent.findTarget(s);
}

let chatHistory = [];
async function runCommand(arg) {
  const text = typeof arg === 'string' ? arg : String((arg && arg.text) || ''); chatHistory = Array.isArray(arg && arg.history) ? arg.history : [];
  return exec(intent.parse(text, new Date()), text, false);
}
const notFound = (what, q) => ({ ok: false, anim: 'confused', say: `I could not find ${what}${q ? ' "' + q + '"' : ''}.` });
const refresh = () => send('dock:data', tasks.snapshot());
async function exec(c, text, viaAi) {
  const settings = store.get();
  switch (c.type) {
    case 'reminder': {
      if (c.openName && !c.open) { c.open = await resolveSite(c.openName); if (!c.open) c.text = c.openName + ' (I could not find a website, so there is no Open button)'; }
      if (c.whenGuessed) {                                   // never guess a time: let the AI work it out, otherwise ask
        if (!viaAi) { const a = await aiAssist(text, chatHistory); if (a) return a; }
        return { ok: false, intent: c, anim: 'confused', say: 'What time should I remind you? For example: "remind me at 5 pm to call mom" or "kal 8 baje reminder".' };
      }
      const r = tasks.addReminder(c.text, c.at, { repeat: c.repeat, kind: c.kind, open: c.open });
      send('dock:data', tasks.snapshot());
      return { ok: true, intent: c, anim: 'checklist', undo: r && { kind: 'reminder', id: r.id }, say: `Okay. I will remind you ${c.text && c.text !== 'Reminder' ? 'to ' + c.text + ' ' : ''}${c.repeat ? 'every ' + (c.repeat === 'daily' ? 'day' : c.repeat) + ', starting ' : ''}${fmtWhen(c.at)}.` + (c.open ? ` There will be an Open ${c.open.label} button.` : ''), reminder: r };
    }
    case 'todo': { if (!c.text) return { ok: false, say: 'What should I add to your list?' }; const t0 = tasks.addTodo(c.text); send('dock:data', tasks.snapshot()); return { ok: true, intent: c, anim: 'checklist', say: `Added "${c.text}" to your list.`, undo: t0 && { kind: 'todo', id: t0.id } }; }
    case 'routine': {
      const r = tasks.findRoutine(c.name); if (!r) return { ok: false, say: `I do not have a "${c.name}" routine.` };
      tasks.markRoutine(r.id); send('dock:data', tasks.snapshot()); return { ok: true, intent: c, anim: 'tick_done', say: `Got it. ${r.name} done.` };
    }
    // ---- upkeep by command: to-dos, reminders, routines, flashcards, exams, tabs, preferences
    case 'todo_done': {
      const t = tasks.findTodo(c.query, true);
      if (t) { tasks.toggleTodo(t.id, true); refresh(); return { ok: true, intent: c, anim: 'celebrate', say: `Done: ${t.text}.`, undo: { kind: 'todo_done', id: t.id } }; }
      const r = tasks.findRoutine(c.query); if (r) { tasks.markRoutine(r.id); refresh(); return { ok: true, intent: c, anim: 'tick_done', say: `${r.name} done.` }; }
      return notFound('that on your list', c.query);
    }
    case 'todo_delete': { const t = tasks.findTodo(c.query); if (!t) return notFound('that on your list', c.query); tasks.removeTodo(t.id); refresh(); return { ok: true, intent: c, anim: 'checklist', say: `Removed "${t.text}".` }; }
    case 'todos_clear_done': tasks.clearDone(); refresh(); return { ok: true, intent: c, anim: 'checklist', say: 'Cleared the finished items.' };
    case 'reminder_delete': {
      if (c.all) { const n = tasks.clearReminders(); refresh(); return { ok: true, intent: c, anim: 'checklist', say: n ? `Removed ${n} reminder${n > 1 ? 's' : ''}.` : 'You have no reminders.' }; }
      const r = tasks.findReminder(c.query); if (!r) return notFound('a reminder', c.query); tasks.removeReminder(r.id); refresh(); return { ok: true, intent: c, anim: 'checklist', say: `Removed the reminder "${r.text}".` };
    }
    case 'reminder_move': {
      const r = tasks.findReminder(c.query); if (!r) return notFound('a reminder', c.query); if (!Number.isFinite(c.at)) return { ok: false, intent: c, say: 'What time should I move it to?' };
      tasks.moveReminder(r.id, c.at); refresh(); return { ok: true, intent: c, anim: 'checklist', say: `Moved "${r.text}" to ${fmtWhen(c.at)}.` };
    }
    case 'routine_add': { const r = tasks.saveRoutine({ name: c.name, times: c.times || [], icon: 'star', anim: 'tick_done', on: true }); refresh(); return { ok: true, intent: c, anim: 'checklist', undo: { kind: 'routine', id: r.id }, say: `Added the routine ${r.name}${r.times.length ? ' at ' + r.times.join(', ') : ''}.` }; }
    case 'routine_remove': { const r = tasks.findRoutine(c.name); if (!r) return notFound('a routine', c.name); tasks.removeRoutine(r.id); refresh(); return { ok: true, intent: c, anim: 'checklist', say: `Removed the routine ${r.name}.` }; }
    case 'routine_set': {
      const r = tasks.setRoutine(c.name, { times: c.times, on: c.on }); if (!r) return notFound('a routine', c.name); refresh();
      return { ok: true, intent: c, anim: 'checklist', say: c.times ? `${r.name} is now at ${r.times.join(', ')}.` : `${r.name} is ${r.on ? 'on' : 'off'}.` };
    }
    case 'water_goal': { const g = tasks.setWaterGoal(c.n); refresh(); return { ok: true, intent: c, anim: 'drink_water', say: `Water goal: ${g} glasses a day.` }; }
    case 'card_add': {
      if (!c.front || !c.back) return { ok: false, intent: c, say: 'Tell me both sides, like "add flashcard photosynthesis = how plants make food".' };
      const x = store.addCard(c.front, c.back); send('dock:cards'); return { ok: !!x, intent: c, anim: 'checklist', undo: x && { kind: 'card', id: x.id }, say: `Saved a flashcard for "${c.front}".` };
    }
    case 'card_delete': { const f = tasks.best(store.listCards(), c.query, 'front'); if (!f) return notFound('a flashcard', c.query); store.removeCard(f.id); send('dock:cards'); return { ok: true, intent: c, anim: 'checklist', say: `Removed the flashcard "${f.front}".` }; }
    case 'exam_add': {
      if (!Number.isFinite(c.at)) return { ok: false, intent: c, say: 'What date is the exam?' }; const e = tasks.addExam(c.name, new Date(c.at).toISOString()); refresh();
      return { ok: !!e, intent: c, anim: 'checklist', say: `Exam added: ${c.name}, ${new Date(c.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.` };
    }
    case 'exam_remove': { const e = tasks.findExam(c.query); if (!e) return notFound('an exam', c.query); tasks.removeExam(e.id); refresh(); return { ok: true, intent: c, say: `Removed ${e.name}.` }; }
    case 'tab': { setOpen(true); send('dock:tab', ['today', 'study', 'media', 'daily', 'chat'].includes(c.tab) ? c.tab : c.tab === 'cards' ? 'study' : 'today'); return { ok: true, intent: c, say: `Here is ${c.tab}.` }; }
    case 'focus_stop': send('dock:stopFocus'); return { ok: true, intent: c, say: 'Focus stopped.' };
    case 'pref': {
      store.save({ [c.key]: c.value }); for (const w of require('electron').BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('settings:changed', store.publicSettings());
      return { ok: true, intent: c, anim: 'success', say: c.key === 'ringtone' ? `Ringtone: ${c.value}.` : c.key === 'sounds' ? `Sounds ${c.value ? 'on' : 'off'}.` : c.key === 'userName' ? `Nice to meet you, ${c.value}.` : c.key === 'focusGuard' ? `Focus Guard ${c.value ? 'on' : 'off'}.` : `Voice: ${c.value}.` };
    }
    case 'brief': showBrief(); return { ok: true, intent: c, anim: 'greeting', say: 'Here is your day.' };
    case 'focus_report': {
      const f = store.get().lastFocus; if (!f) return { ok: true, intent: c, anim: 'confused', say: 'No focus round yet. Say "start focus" and I will keep you on track.' };
      return { ok: true, intent: c, anim: f.score >= 80 ? 'celebrate' : 'thinking', md: true, say: `**Last focus round**\n\n- Focus score: **${f.score}%**\n- Studied: **${Math.round(f.onSec / 60)} min**, drifted: **${Math.round(f.badSec / 60)} min**\n${f.top && f.top.length ? '- Top distractions: ' + f.top.map((x) => x.label + ' (' + Math.round(x.sec / 60) + ' min)').join(', ') + '\n' : ''}- Nudges: ${f.nudges}` };
    }
    case 'timer': { const tr = tasks.addReminder('Timer done: ' + c.label, Date.now() + c.ms, { kind: 'reminder' }); send('dock:data', tasks.snapshot()); return { ok: true, intent: c, anim: 'checklist', undo: tr && { kind: 'reminder', id: tr.id }, say: `Timer set for ${c.label}.` }; }
    case 'focus': setOpen(true); send('dock:tab', 'study'); send('dock:startFocus'); return { ok: true, intent: c, say: 'Focus time. 25 minutes, I will stay quiet.' };
    case 'list': {
      const snap = tasks.snapshot(); const todos = snap.todos.filter((t) => !t.done).slice(0, 4).map((t) => t.text), rem = snap.reminders.slice(0, 3).map((r) => `${r.text} (${fmtWhen(r.at)})`);
      const say = !todos.length && !rem.length ? 'Nothing on your list. Enjoy.' : [todos.length ? 'To do: ' + todos.join(', ') + '.' : '', rem.length ? 'Coming up: ' + rem.join('; ') + '.' : ''].filter(Boolean).join(' ');
      return { ok: true, intent: c, anim: 'checklist', say };
    }
    case 'time': return { ok: true, intent: c, anim: 'talking', say: new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true }) + '.' };
    case 'theme': {
      const ok = ['mochi', 'midnight', 'cyber', 'ocean', 'forest', 'sunset', 'graphite', 'lavender'].includes(c.theme); if (!ok) return { ok: false, intent: c, say: 'I do not know that theme.' };
      store.save({ theme: c.theme }); for (const w of require('electron').BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('settings:changed', store.publicSettings());
      return { ok: true, intent: c, anim: 'success', say: `Switched to the ${c.theme} theme.` };
    }
    case 'settings': deps.openSettings('settings'); return { ok: true, intent: c, say: 'Opening settings.' };
    case 'open_site': {
      const tg = await resolveSite(c.name); if (!tg) return askOpen(c.name);
      openTarget(tg); return { ok: true, intent: c, anim: 'success', say: `Opening ${tg.label}.` };
    }
    case 'teach': setOpen(true); send('dock:teach', { topic: c.topic || '' }); return { ok: true, intent: c, anim: 'listening', say: c.topic ? `Okay, teach me ${c.topic}.` : 'Okay, what should you teach me?' };
    case 'open': { const ok = openTarget(c.target); return { ok, intent: c, anim: ok ? 'success' : 'confused', say: ok ? `Opening ${c.target.label}.` : `I cannot open ${c.target.label}.` }; }
    case 'media': return { ok: true, intent: c, media: c.action, seconds: c.seconds || 0 };
    case 'play': {
      const q = c.query;
      if (c.source === 'spotify') {
        const sp = String(q).match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
        if (sp) return { ok: true, intent: c, anim: 'headphones', play: { source: 'spotify', kind: sp[1], id: sp[2] }, say: 'Here it is.' };
        openSpotify(q); return { ok: true, intent: c, anim: 'headphones', say: `Opening Spotify for "${q}".` };
      }
      const id = media.youtubeId(q); const key = store.getKey('youtube');
      if (id) return { ok: true, intent: c, anim: 'headphones', play: { source: 'youtube', video: await media.youtubeInfo(id) }, say: 'Playing.' };
      if (key) {
        let list = null; try { list = await media.youtubeSearch(q, key); } catch (e) { return { ok: false, intent: c, anim: 'confused', say: 'YouTube did not accept the key: ' + e.message, ask: { options: [{ label: 'Open settings', settings: true }, { label: 'Search on YouTube', url: media.youtubeSearchUrl(q) }] } }; }
        if (list && list.length) return { ok: true, intent: c, anim: 'headphones', play: { source: 'youtube', video: list[0], more: list.slice(1) }, say: `Playing "${list[0].title}".` };
        return { ok: true, intent: c, anim: 'confused', say: `I could not find "${q}" on YouTube.`, ask: { options: [{ label: 'Search on YouTube', url: media.youtubeSearchUrl(q) }] } };
      }
      return { ok: true, intent: c, anim: 'confused', say: 'To play a song by name inside Tito I need a free YouTube key. Or paste a video link and I will play it right away.', ask: { options: [{ label: 'Add a YouTube key', settings: true }, { label: 'Search on YouTube', url: media.youtubeSearchUrl(q) }] } };
    }
    case 'ask': {                                   // a question: the AI answers it (with code, lists...); with no AI, a web lookup instead
      if (!viaAi) { const a = await aiAssist(text, chatHistory); if (a) return a; }
      return exec({ type: 'search', query: c.query }, text, true);
    }
    case 'search': {
      const r = await search.lookup(c.query, { searx: settings.searxUrl });
      return { ok: true, intent: c, anim: 'searching', search: r, say: r.wiki ? r.wiki.extract.split('. ').slice(0, 2).join('. ') : r.results.length ? r.results[0].snippet : 'I could not find much about that.' };
    }
    case 'quiz': setOpen(true); send('dock:tab', 'study'); return { ok: true, intent: c, say: 'Let us revise.' };
    case 'circle': setTimeout(() => deps.summon(), 150); return { ok: true, intent: c, say: 'Draw around what you want to know.' };
    case 'dock': setOpen(true); send('dock:tab', c.tab); return { ok: true, intent: c };
    default: {
      if (!viaAi) { const a = await aiAssist(text, chatHistory); if (a) return a; }
      return { ok: false, intent: c, anim: 'confused', say: 'I am not sure what you want. Pick one below, or add an AI key in Settings so I can chat.', original: text };
    }
  }
}
const APPS = { notepad: 'notepad', calc: 'calc', explorer: 'explorer', paint: 'mspaint', code: 'code', chrome: 'chrome', edge: 'msedge', excel: 'excel', word: 'winword' };
/** Opens a website (https only) or one app from a fixed list. Returns true when something was started. */
const PROTO = { whatsapp: ['whatsapp', 'https://web.whatsapp.com'], telegram: ['tg', 'https://web.telegram.org'], discord: ['discord', 'https://discord.com/app'], spotify: ['spotify', 'https://open.spotify.com'] };
function protocolInstalled(name) {
  return new Promise((res) => require('child_process').execFile('reg.exe', ['query', 'HKCR\\' + name], { windowsHide: true }, (err) => res(!err)));
}
function openTarget(t) {
  if (!t || !t.value) return false;
  if (process.env.TITO_DOCK_HIDDEN) return true;                       // tests never open anything
  if (t.kind === 'url' && /^https:\/\//i.test(t.value)) { shell.openExternal(t.value); return true; }
  if (t.kind === 'app' && PROTO[t.value]) { const [proto, web] = PROTO[t.value]; protocolInstalled(proto).then((yes) => shell.openExternal(yes ? proto + ':' : web)); return true; }
  if (t.kind === 'app' && t.value === 'settings') { shell.openExternal('ms-settings:'); return true; }
  if (t.kind === 'app' && APPS[t.value]) { require('child_process').execFile('cmd.exe', ['/c', 'start', '', APPS[t.value]], { windowsHide: true }, () => {}); return true; }
  return false;
}
const PLAYER_HTML = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{width:100%;height:100%}</style><div id="p"></div>
<script>
var vid='__ID__',pl=null,CMDS={playVideo:1,pauseVideo:1,seekTo:1,setVolume:1,mute:1,unMute:1};
function post(o){parent.postMessage(Object.assign({tito:'yt'},o),'*');}
var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';tag.onerror=function(){post({error:'offline'});};document.head.appendChild(tag);
window.onYouTubeIframeAPIReady=function(){
  pl=new YT.Player('p',{width:'100%',height:'100%',videoId:vid,playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1},
    events:{onReady:function(){post({ready:1});},onStateChange:function(e){post({state:e.data});},onError:function(e){post({error:e.data});}}});
  setInterval(function(){try{post({time:pl.getCurrentTime(),vol:pl.getVolume(),state:pl.getPlayerState()});}catch(x){}},1000);
};
addEventListener('message',function(e){var d=e.data;if(!d||d.tito!=='cmd'||!pl||!CMDS[d.fn])return;try{pl[d.fn].apply(pl,d.args||[]);}catch(x){}});
</script>`;
let playerPort = 0;
function ensurePlayer() {
  return new Promise((resolve) => {
    if (playerPort) return resolve(playerPort);
    const http = require('http');
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1'); const v = u.searchParams.get('v') || '';
      if (u.pathname !== '/player' || !/^[\w-]{11}$/.test(v)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(PLAYER_HTML.replace('__ID__', v));
    });
    srv.listen(0, '127.0.0.1', () => { playerPort = srv.address().port; resolve(playerPort); });
  });
}
function openSpotify(q) {
  openOut(media.spotifyUri(q)).catch(() => openOut(media.spotifyWebSearch(q)));
}

// ------------------------------------------------------------------ IPC
// flashcards are shared with the overlay's "Save to flashcards" button, so they register even when the dock itself is off
let cardsDone = false;
function registerCards() {
  if (cardsDone) return; cardsDone = true;
  handle('search:images', (q) => search.images(q, 4));
  handle('tts:speak', async (text) => {
    const s = store.get(); const tts = require('./tts');
    try {
      return await tts.speak(text, { provider: s.ttsProvider || 'auto', voices: s.ttsVoices, custom: s.ttsCustom, keys: { gemini: store.getKey('gemini'), openai: store.getKey('tts_openai'), elevenlabs: store.getKey('tts_eleven'), custom: store.getKey('tts_custom') } });
    } catch (e) { return { ok: false, code: e.code, message: e.message }; }
  });
  handle('tts:info', () => { const t = require('./tts'); return { providers: t.PROVIDERS, gemini: t.GEMINI_VOICES, openai: t.OPENAI_VOICES, defaults: t.DEFAULTS }; });
  handle('reminder:add', ({ text, at, repeat, kind }) => { const r = tasks.addReminder(text, at, { repeat, kind }); if (r) send('dock:data', tasks.snapshot()); return { ok: !!r, data: r ? tasks.snapshot() : null }; });
  handle('cards:add', (f, b) => { const c = store.addCard(f, b); return { ok: !!c, card: c, stats: store.cardStats() }; });
  handle('cards:due', (n, mistakes) => ({ cards: store.dueCards(n || 5, !!mistakes), stats: store.cardStats() }));
  handle('stats:week', () => store.weekStats());
  handle('cards:grade', (id, right) => { store.gradeCard(id, !!right); return { ok: true, stats: store.cardStats() }; });
  handle('cards:remove', (id) => { store.removeCard(id); return { ok: true, stats: store.cardStats() }; });
  handle('cards:list', () => store.listCards());
  handle('cards:stats', () => store.cardStats());
}

function registerIpc() {
  handle('dock:data', () => tasks.snapshot());
  handle('dock:open', (v) => { setOpen(v); return open; });
  handle('dock:pop', (v) => { setPop(v); return pop; });
  handle('dock:popH', (h) => { const n = Math.max(80, Math.min(440, Math.round(Number(h) || 150))); if (n !== popH) { popH = n; if (pop && !open) apply(); } return popH; });
  handle('dock:briefData', () => briefData());
  handle('undo:run', ({ kind, id }) => {
    if (kind === 'todo') tasks.removeTodo(id); else if (kind === 'reminder') tasks.removeReminder(id); else if (kind === 'card') store.removeCard(id);
    else if (kind === 'routine') tasks.removeRoutine(id); else if (kind === 'todo_done') tasks.toggleTodo(id, false);
    send('dock:cards'); return tasks.snapshot();
  });
  // Focus Guard
  handle('focus:start', () => {
    if (store.get().focusGuard === false) return { ok: true, guard: false };
    const g = require('./focusguard'); focusSession = g.createSession({ words: store.get().guardWords, onNudge: (n) => send('dock:nudge', n), onLive: (l) => send('dock:focusLive', l) });
    if (!process.env.TITO_DOCK_HIDDEN) g.startPoller((title, proc) => { if (focusSession) focusSession.feed(title, proc, 3); });
    return { ok: true, guard: true };
  });
  handle('focus:pause', (min) => { if (focusSession) focusSession.pause(Math.max(1, Math.min(30, Number(min) || 5)) * 60); return true; });
  handle('focus:stop', () => {
    const g = require('./focusguard'); g.stopPoller(); const rep = focusSession ? focusSession.report() : null; focusSession = null;
    if (!rep || !rep.minutes) return { ok: true, report: rep };
    rep.xp = Math.max(1, Math.round(rep.score / 10) + Math.round(rep.onSec / 300));
    const log = [...(store.get().focusLog || []), { ts: Date.now(), min: Math.round(rep.onSec / 60), score: rep.score }].slice(-80);
    store.save({ xp: (store.get().xp || 0) + rep.xp, focusLog: log, lastFocus: rep }); return { ok: true, report: rep };
  });
  handle('dock:bubble', (v) => { if (bubble !== !!v) { bubble = !!v; apply(); } return bubble; });
  handle('target:open', (t) => ({ ok: openTarget(t) }));
  handle('dock:hide', () => { win.hide(); store.save({ dockOn: false }); return true; });
  handle('dock:command', (arg) => runCommand(arg));
  handle('dock:brief', () => tasks.brief());
  handle('dock:state', () => ({ open, side: pos ? pos.side : 'right', settings: store.publicSettings(), quiet: !!process.env.TITO_DOCK_HIDDEN }));
  // dragging the pet: the renderer reports pointer movement in screen pixels
  let drag = null;
  ipcMain.on('dock:dragstart', () => { if (!win) return; const b = win.getBounds(); drag = { x: b.x, y: b.y }; });
  ipcMain.on('dock:drag', (_e, d) => { if (!win || !drag) return; const b = win.getBounds(); win.setBounds({ x: Math.round(drag.x + d.dx), y: Math.round(drag.y + d.dy), width: b.width, height: b.height }); });
  ipcMain.on('dock:dragend', () => {
    if (!win || !drag) return; drag = null;
    const b = win.getBounds(), wa = screen.getDisplayMatching(b).workArea;
    pos = { side: b.x + b.width / 2 < wa.x + wa.width / 2 ? 'left' : 'right', bottom: b.y + b.height }; store.save({ dock: pos }); apply();     // snaps to the nearest side edge
  });
  registerCards();
  // tasks
  handle('todo:add', (t) => { const r = tasks.addTodo(t); return { ok: !!r, data: tasks.snapshot() }; });
  handle('todo:toggle', (id) => { tasks.toggleTodo(id); return tasks.snapshot(); });
  handle('todo:remove', (id) => { tasks.removeTodo(id); return tasks.snapshot(); });
  handle('todo:clearDone', () => { tasks.clearDone(); return tasks.snapshot(); });
  handle('reminder:remove', (id) => { tasks.removeReminder(id); return tasks.snapshot(); });
  handle('reminder:ack', (id) => { tasks.ackReminder(id); return tasks.snapshot(); });
  handle('reminder:snooze', ({ id, minutes }) => { tasks.snooze(id, minutes); return tasks.snapshot(); });
  handle('routine:mark', (id) => { tasks.markRoutine(id); return tasks.snapshot(); });
  handle('routine:unmark', (id) => { tasks.unmarkRoutine(id); return tasks.snapshot(); });
  handle('routine:save', (r) => { tasks.saveRoutine(r); return tasks.snapshot(); });
  handle('routine:remove', (id) => { tasks.removeRoutine(id); return tasks.snapshot(); });
  handle('ics:import', async () => {
    const { dialog } = require('electron'); const fs = require('fs');
    const r = await dialog.showOpenDialog(win, { title: 'Import calendar', filters: [{ name: 'Calendar', extensions: ['ics'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    const n = tasks.importIcs(fs.readFileSync(r.filePaths[0], 'utf8')); send('dock:data', tasks.snapshot());
    return { ok: true, added: n, data: tasks.snapshot() };
  });
  handle('exam:add', ({ name, date }) => { const e = tasks.addExam(name, date); return { ok: !!e, data: tasks.snapshot() }; });
  handle('exam:remove', (id) => { tasks.removeExam(id); return tasks.snapshot(); });
  // media / search / voice
  handle('clip:explain', async ({ text, mode }) => {
    const engine = require('./engine');
    const ask = mode === 'foreign' ? 'Translate this text into simple English (or Hindi if it is English) and give only the translation in the answer field.' : 'Explain this error in simple words and give the most likely fix.';
    const r = await engine.ask({ images: [], turns: [{ role: 'user', text: ask + '\n\n"""' + String(text).slice(0, 2500) + '"""' }], task: mode === 'foreign' ? 'translate' : 'fix' });
    return r.ok ? { ok: true, title: r.result.title, answer: r.result.answer } : { ok: false, message: r.message || 'No answer available.' };
  });
  handle('media:playerUrl', async (id) => { if (!/^[\w-]{11}$/.test(String(id))) return { ok: false }; const port = await ensurePlayer(); return { ok: true, url: `http://127.0.0.1:${port}/player?v=${id}` }; });
  handle('teach:evaluate', async ({ topic, text, round, question }) => {
    const engine = require('./engine');
    const user = `Topic: ${String(topic).slice(0, 120)}\nRound ${round || 1} of 3${question ? '\nYou asked the student: ' + String(question).slice(0, 200) : ''}\nThe student explains:\n"""${String(text).slice(0, 1800)}"""`;
    let r; try { r = await engine.ask({ images: [], turns: [{ role: 'user', text: user }], task: 'explain', rawSystem: TEACH_SYSTEM }); } catch (e) { return { ok: false, message: String(e.message || e) }; }
    if (!r || !r.ok || !r.result) return { ok: false, message: (r && r.message) || 'I need an AI key to judge your explanation. Add a free Gemini key in Settings.' };
    const j = extractJson(r.result.answer); if (!j) return { ok: false, message: 'I could not read my own notes. Please try again.' };
    const list = (a, n) => (Array.isArray(a) ? a : []).map((x) => String(x).slice(0, 170)).filter(Boolean).slice(0, n);
    const cards = (Array.isArray(j.cards) ? j.cards : []).map((c) => ({ front: String(c.front || '').slice(0, 120), back: String(c.back || '').slice(0, 300) })).filter((c) => c.front && c.back).slice(0, 3);
    return { ok: true, score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))), good: list(j.good, 3), gaps: list(j.gaps, 3), wrong: list(j.wrong, 3), question: String(j.question || '').slice(0, 220), praise: String(j.praise || '').slice(0, 170), cards };
  });
  handle('teach:finish', ({ topic, scores }) => {
    const sc = (Array.isArray(scores) ? scores : []).map(Number).filter(Number.isFinite); const avg = sc.length ? Math.round(sc.reduce((x, y) => x + y, 0) / sc.length) : 0;
    const gain = Math.max(1, Math.round(avg / 4)); store.save({ xp: (store.get().xp || 0) + gain }); return { ok: true, avg, gain, stats: store.cardStats() };
  });
  handle('media:key', async (action) => ({ ok: await media.pressKey(action) }));
  handle('media:spotify', (q) => { openSpotify(q); return true; });
  handle('media:youtubeInfo', async (text) => { const id = media.youtubeId(text); return id ? { ok: true, video: await media.youtubeInfo(id) } : { ok: false, message: 'That is not a YouTube link.' }; });
  handle('search:lookup', (q) => search.lookup(q, { searx: store.get().searxUrl }));
  handle('voice:transcribe', async ({ audio, mime }) => {
    try { const text = await voice.transcribe(Buffer.from(audio), { apiKey: store.getKey('groq'), mime }); return { ok: true, text }; }
    catch (e) { return { ok: false, code: e.code, message: e.message }; }
  });
}

// ------------------------------------------------------------------ shortcuts
const SC_DEFAULT = { voice: 'CommandOrControl+Shift+V', todo: 'CommandOrControl+Shift+T', dock: 'CommandOrControl+Shift+D', quiz: 'CommandOrControl+Shift+K' };
const scAction = {
  voice: () => { ensure(); if (!win.isVisible()) win.showInactive(); setPop(true); send('dock:pop', { voice: true }); },
  todo: () => { ensure(); if (!win.isVisible()) win.showInactive(); setPop(true); send('dock:pop', { prefill: 'add todo ' }); },
  dock: () => toggleDock(),
  quiz: () => { ensure(); setOpen(true); send('dock:tab', 'study'); },
};
let bound = {};
/** Registers the four dock shortcuts from `map` (name -> accelerator). Returns the names that another app already owns. */
function bindShortcuts(map) {
  for (const a of Object.values(bound)) { try { globalShortcut.unregister(a); } catch { /* ignore */ } }
  bound = {}; const failed = [];
  for (const [name, accel] of Object.entries(map)) {
    let ok = false; try { ok = globalShortcut.register(accel, scAction[name]); } catch { ok = false; }
    if (ok) bound[name] = accel; else failed.push(name);
  }
  return failed;
}
const currentMap = (extra) => ({ ...SC_DEFAULT, ...(store.get().shortcuts || {}), ...(extra || {}) });
function registerShortcuts() { return bindShortcuts(currentMap()); }
/** Tries new shortcuts; if one is taken, puts the old ones back and says which. */
function tryShortcuts(patch) {
  const failed = bindShortcuts(currentMap(patch));
  if (failed.length) { bindShortcuts(currentMap()); return failed; }
  return [];
}

// ------------------------------------------------------------------ clipboard watcher (opt-in)
let clipTimer = null, lastClip = '', ignoreText = '', lastClipAlert = 0;
const ERRORISH = /(Traceback \(most recent|Exception in thread|\bError:|\bERR!|npm ERR|Uncaught |Segmentation fault|FATAL|stack trace|\bat [\w.$<>]+ \(.+:\d+:\d+\)|cannot find module|is not defined|undefined is not|NullPointerException|Permission denied)/i;
function foreignRatio(t) { const letters = t.match(/\p{L}/gu) || []; if (letters.length < 8) return 0; return letters.filter((c) => !/[A-Za-z\u00C0-\u024F]/.test(c)).length / letters.length; }
function ignoreClip(t) { ignoreText = String(t || ''); lastClip = ignoreText; }
function clipTick() {
  const { clipboard } = require('electron');
  let t = ''; try { t = clipboard.readText(); } catch { return; }
  if (!t || t === lastClip || t === ignoreText) return;
  lastClip = t;
  if (t.length < 14 || t.length > 4000 || Date.now() - lastClipAlert < 20000) return;
  const mode = ERRORISH.test(t) ? 'error' : foreignRatio(t) > 0.5 ? 'foreign' : '';
  if (!mode) return; lastClipAlert = Date.now();
  alert({ title: mode === 'error' ? 'Copied an error' : 'Copied other-language text', text: mode === 'error' ? 'That looks like an error. Want me to explain it?' : 'That is not English. Want me to translate it?', anim: mode === 'error' ? 'confused' : 'listening_wave', clip: { text: t.slice(0, 2500), mode }, tab: 'today', noNotify: true });
}
function applySettings() {
  const s = store.get(); ensure();
  if (s.dockOn === false) { if (win.isVisible()) win.hide(); } else if (!win.isVisible()) win.showInactive();
  clearInterval(clipTimer); clipTimer = s.clipWatch ? setInterval(clipTick, 1500) : null;
  if (s.clipWatch) { try { lastClip = require('electron').clipboard.readText(); } catch { lastClip = ''; } }
}

function onSummon() {                               // Ctrl+Shift+Space: hide the dock (and its panel) until the overlay closes
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  open = false; bubble = false; apply(); win.hide(); hiddenForOverlay = true;
}
function onOverlayClosed() {
  if (hiddenForOverlay && win && !win.isDestroyed() && store.get().dockOn !== false) { win.showInactive(); apply(); }
  hiddenForOverlay = false;
}

/** What the greeting popup shows: next countdowns, the top to-dos, cards due. */
function briefData() {
  const snap = tasks.snapshot(); const now = Date.now(); const st = store.cardStats();
  const rem = snap.reminders.filter((r) => !r.fired && r.at > now).slice(0, 3).map((r) => ({ label: r.text, at: r.at, kind: r.kind === 'deadline' ? 'deadline' : 'reminder' }));
  const ex = snap.exams.filter((e) => e.date > now).slice(0, 1).map((e) => ({ label: e.name, at: e.date, kind: 'exam' }));
  return {
    name: store.get().userName || '', hour: new Date().getHours(), countdowns: [...rem, ...ex].sort((a, b) => a.at - b.at).slice(0, 4),
    todos: snap.todos.filter((t) => !t.done).slice(0, 4).map((t) => ({ id: t.id, text: t.text })), due: st.due, streak: st.streak,
    routinesDone: snap.stats.done, routinesTotal: snap.stats.total,
  };
}
function showBrief() { ensure(); if (win && !win.isVisible() && store.get().dockOn !== false) win.showInactive(); setPop(true); send('dock:brief', briefData()); }

function init(d) {
  deps = d;
  setInterval(() => { try { send('dock:idle', require('electron').powerMonitor.getSystemIdleTime()); } catch { /* ignore */ } }, 15000);
  tasks.init(require('electron').app.getPath('userData'), onTaskEvent);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && wc.getURL().startsWith('file://')));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && !!wc && wc.getURL().startsWith('file://'));
  registerIpc(); ensure(); registerShortcuts(); applySettings();
  // once a day, the first time Tito starts after 6 am, the pet gives the morning brief
  if (store.get().greetOnStart !== false && !process.env.TITO_DOCK_HIDDEN) setTimeout(showBrief, 5000);        // every start: greeting, countdowns and the to-do list
}

module.exports = { _feedFocus: (title, proc, dt) => focusSession && focusSession.feed(title, proc, dt), showBrief, onOverlayClosed, onSummon, tryShortcuts, applySettings, ignoreClip, registerCards, init, toggleDock, openPanel, setOpen, getWindow: () => win, runCommand, registerShortcuts };

// Settings + notebook history, stored as JSON in the user-data folder.
// API keys are encrypted with Windows DPAPI (Electron safeStorage) and never sent to a renderer.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { PROVIDERS } = require('./providers');

const DEFAULTS = {
  mode: 'auto',                  // auto = online, falling back to the offline text reader without internet | online = never use the offline reader
  provider: 'gemini',            // preferred online provider; any other provider with a saved key is the automatic backup
  models: {},                    // provider -> model the user pinned by hand (empty = Tito picks the best one automatically)
  custom: { base: '', model: '' },   // the "Other (OpenAI-compatible)" provider
  modelCache: {},                // provider -> { at, ranked } from live model discovery
  keys: {},                      // provider -> encrypted base64
  hotkey: 'CommandOrControl+Shift+Space',
  personality: 'mochi',          // mochi | desi | panda
  language: 'english',           // english | hinglish | hindi (language of Tito's answers)
  level: 'teen',                 // kid | teen | expert | meme
  openAtLogin: true,
  greetOnStart: true,
  translateEngine: 'auto',       // auto = AI first, then MyMemory, then the offline pack | ai | mymemory | offline
  translateTo: 'hi',             // your own language: English text is translated into this, everything else into English
  memory: { enabled: true, topics: [] },   // what Tito remembers about your recent questions (kept only on this PC)
  textSize: 1,                   // answer text size: 0 small, 1 medium, 2 large, 3 extra large
  sendContext: false,            // also send a whole-screen image (more accurate, uses more of a free limit)
  xp: 0,
  dockOn: true,                   // show the pet at the edge of the screen
  notify: true,                  // Windows notifications for reminders
  sounds: true,                  // cute sound effects for alerts, quiz and the dock
  autoOpenSites: true,           // a reminder about a website or video opens it at the time (apps only get a button)
  theme: 'mochi',
  tourDone: false,               // the first-time tour has been seen (or skipped)
  lastVersion: '',               // the Tito version that last ran, to show "what is new" once after an update
  userName: '',                  // what Tito calls you
  focusGuard: true,              // Focus Guard: nudge when a focus round drifts to distracting windows
  guardWords: '',                // your own extra distracting words, comma separated
  focusLog: [],                  // { ts, min, score } of finished focus rounds
  lastFocus: null,
  ringtone: 'marimba',           // reminder ringtone (renderer/sfx.js)
  ringLoop: true,                // keep ringing until dismissed (max 20 s)
  voiceMode: 'alerts',           // alerts | all | off: when Tito speaks out loud
  ttsProvider: 'auto',           // auto | gemini | openai | elevenlabs | custom | system
  ttsVoices: {},                 // provider -> voice
  ttsCustom: { base: '', model: '' },
  clipWatch: false,              // offer to explain copied errors / foreign text (off by default)
  searxUrl: '',                  // optional SearXNG instance for full web search
  shortcuts: {},                 // voice | todo | dock | quiz -> accelerator
  dock: null,                    // { side, y } where the pet was left
  lastBrief: '',
  reviewLog: {},                 // day -> flashcards reviewed that day
  streak: 0,
  lastStudy: '',
};

const file = (n) => path.join(app.getPath('userData'), n);
const readJson = (n, fallback) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return fallback; } };
const writeJson = (n, v) => { fs.mkdirSync(path.dirname(file(n)), { recursive: true }); fs.writeFileSync(file(n), JSON.stringify(v)); };

let settings = null;
function load() {
  const s = readJson('settings.json', {});
  settings = { ...DEFAULTS, ...s, models: { ...DEFAULTS.models, ...(s.models || {}) }, keys: { ...(s.keys || {}) } };
  if (s.schema !== 4) {   // v4: automatic model selection for any provider
    settings.schema = 4; settings.language = 'english'; settings.models = {}; settings.modelCache = {}; if (!PROVIDERS[settings.provider]) settings.provider = 'gemini'; if (settings.mode === 'offline') settings.mode = 'auto';
  }
  settings.custom = { ...DEFAULTS.custom, ...(s.custom || {}) };
  settings.memory = { ...DEFAULTS.memory, ...(s.memory || {}) };
  return settings;
}
const get = () => settings || load();
function save(patch) {
  const s = get();
  for (const k of Object.keys(patch)) {
    if (k === 'keys') continue;                 // keys only go through setKey
    if (k === 'models') s.models = { ...s.models, ...patch.models }; else if (k === 'custom') s.custom = { ...s.custom, ...patch.custom }; else if (k === 'memory') s.memory = { ...s.memory, ...patch.memory }; else if (k === 'shortcuts') s.shortcuts = { ...s.shortcuts, ...patch.shortcuts }; else if (k === 'ttsVoices') s.ttsVoices = { ...s.ttsVoices, ...patch.ttsVoices }; else if (k === 'ttsCustom') s.ttsCustom = { ...s.ttsCustom, ...patch.ttsCustom }; else s[k] = patch[k];
  }
  writeJson('settings.json', s);
  return s;
}

function setKey(provider, plain) {
  const s = get();
  if (!plain) delete s.keys[provider];
  else s.keys[provider] = safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(plain).toString('base64')
    : 'plain:' + Buffer.from(plain).toString('base64');
  writeJson('settings.json', s);
}
function getKey(provider) {
  const v = get().keys[provider];
  if (v) {
    try {
      if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
      if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString();
    } catch { /* fall through to env */ }
  }
  return (PROVIDERS[provider] && process.env[PROVIDERS[provider].env]) || '';
}

/** What the renderer is allowed to see: no keys, just whether one exists. */
function publicSettings() {
  const s = get();
  const { keys, ...rest } = s;
  const { modelCache, ...pub } = rest;
  return { ...pub, memory: { enabled: s.memory.enabled, count: s.memory.topics.length }, hasKey: { ...Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, !!getKey(p)])), youtube: !!getKey('youtube'), tts_openai: !!getKey('tts_openai'), tts_eleven: !!getKey('tts_eleven'), tts_custom: !!getKey('tts_custom') } };
}

// ---- model discovery cache (see models.js) -------------------------------
const modelCache = {
  get: (id) => get().modelCache[id],
  set: (id, v) => { const s = get(); s.modelCache[id] = v; writeJson('settings.json', s); },
};

// ---- notebook ---------------------------------------------------------
let history = null;
const hist = () => history || (history = readJson('history.json', []));
function addHistory(entry) {
  const h = hist();
  h.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), ...entry });
  if (h.length > 500) h.length = 500;
  writeJson('history.json', h);
  return h[0];
}
const listHistory = () => hist();
function removeHistory(id) { history = hist().filter((x) => x.id !== id); writeJson('history.json', history); }
function clearHistory() { history = []; writeJson('history.json', history); }

// ---- flashcards (Leitner boxes: a right answer moves a card up and schedules it further out) -----------
const DAY = 86400000, BOX_DAYS = [0, 1, 3, 7, 14, 30];
let cards = null;
const deck = () => cards || (cards = readJson('cards.json', []));
function addCard(front, back, tag, due) {
  front = String(front || '').trim().slice(0, 120); back = String(back || '').trim().slice(0, 600);
  if (!front || !back) return null;
  const d = deck(); const dup = d.find((c) => c.front.toLowerCase() === front.toLowerCase());
  if (dup) { if (tag && !dup.tag) { dup.tag = String(tag).slice(0, 60); if (Number.isFinite(due) && dup.box === 0) dup.due = due; writeJson('cards.json', d); } return dup; }
  const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), front, back, box: 0, due: Number.isFinite(due) ? due : Date.now(), made: Date.now() };
  if (tag) c.tag = String(tag).slice(0, 60);
  d.unshift(c); writeJson('cards.json', d); return c;
}
const isMistake = (c) => (c.missed || 0) > 0 && c.box < 2;
const dueCards = (n = 5, mistakes = false) => deck().filter((c) => (mistakes ? isMistake(c) : c.due <= Date.now())).sort((a, b) => a.due - b.due).slice(0, n);
function gradeCard(id, right) {
  const c = deck().find((x) => x.id === id); if (!c) return null;
  if (!right) c.missed = (c.missed || 0) + 1; else if (c.box >= 2) c.missed = 0;
  c.box = right ? Math.min(BOX_DAYS.length - 1, c.box + 1) : 0; c.due = Date.now() + BOX_DAYS[c.box] * DAY + (right ? 0 : 10 * 60000);
  writeJson('cards.json', deck());
  const s = get(); const today = new Date().toDateString();
  if (right && s.lastStudy !== today) { const y = new Date(Date.now() - DAY).toDateString(); save({ streak: s.lastStudy === y ? (s.streak || 0) + 1 : 1, lastStudy: today }); }
  const log = { ...(get().reviewLog || {}) }; log[today] = (log[today] || 0) + 1; for (const k of Object.keys(log)) if (Date.now() - Date.parse(k) > 40 * DAY) delete log[k];
  save({ xp: (get().xp || 0) + (right ? 5 : 1), reviewLog: log });
  return c;
}
const cardStats = () => ({ total: deck().length, mistakes: deck().filter(isMistake).length, due: deck().filter((c) => c.due <= Date.now()).length, streak: get().streak || 0, xp: get().xp || 0 });
const listCards = () => deck().slice();
/** Brings the cards of one tag (a chapter of an exam plan) back to due today, up to n of them. Returns how many. */
function pullCards(tag, n = 5) {
  const hit = deck().filter((c) => c.tag === tag && c.due > Date.now()).slice(0, n); for (const c of hit) c.due = Date.now();
  if (hit.length) writeJson('cards.json', deck()); return hit.length;
}
const removeCard = (id) => { cards = deck().filter((c) => c.id !== id); writeJson('cards.json', cards); };

/** What the weekly card shows: questions asked in the notebook and cards reviewed over the last 7 days. */
function weekStats() {
  const since = Date.now() - 7 * DAY, log = get().reviewLog || {};
  const reviewed = Object.entries(log).filter(([k]) => Date.now() - Date.parse(k) < 7 * DAY).reduce((n, [, v]) => n + v, 0);
  const focusMin = (get().focusLog || []).filter((f) => f.ts >= since).reduce((n, f) => n + (f.min || 0), 0);
  return { asked: hist().filter((h) => h.ts >= since).length, reviewed, focusMin, cards: deck().length, streak: get().streak || 0, xp: get().xp || 0 };
}

module.exports = { pullCards, weekStats, listCards, addCard, dueCards, gradeCard, cardStats, removeCard, modelCache, load, get, save, setKey, getKey, publicSettings, addHistory, listHistory, removeHistory, clearHistory, DEFAULTS };

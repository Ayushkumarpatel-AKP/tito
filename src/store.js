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
    if (k === 'models') s.models = { ...s.models, ...patch.models }; else if (k === 'custom') s.custom = { ...s.custom, ...patch.custom }; else if (k === 'memory') s.memory = { ...s.memory, ...patch.memory }; else s[k] = patch[k];
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
  return { ...pub, memory: { enabled: s.memory.enabled, count: s.memory.topics.length }, hasKey: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, !!getKey(p)])) };
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

module.exports = { modelCache, load, get, save, setKey, getKey, publicSettings, addHistory, listHistory, removeHistory, clearHistory, DEFAULTS };

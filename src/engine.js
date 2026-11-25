// Chooses how to answer.
//   online : the AI provider (Gemini, Groq, ...) with automatic fallback to any other provider that has a key
//   translate : AI first; MyMemory (free online API) and the offline Hindi pack as free / offline alternatives
//   offline : with no internet, Windows OCR reads the selection and the small built-in AI (if installed) explains it
const ai = require('./ai');
const ocr = require('./ocr');
const llm = require('./llm');
const packs = require('./packs');
const memory = require('./memory');
const tr = require('./translate');
const offlineTr = require('./offline-tr');
const store = require('./store');
const { PROVIDERS } = require('./providers');

const NETWORK_LIKE = new Set(['network', 'timeout']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TITLES = { explain: 'Explanation', translate: 'Translation', summarize: 'Summary', solve: 'Solution', fix: 'Fix' };
const OFFLINE_TASK = {
  explain: 'Explain the selected text simply.',
  summarize: 'Summarize the selected text in two or three sentences.',
  solve: 'Solve the selected problem step by step, briefly, and give the final answer.',
  fix: 'Explain the selected error or code and give the most likely fix.',
  translate: 'Translate the selected text into English.',
};

async function ocrText(image) {
  try { return image ? await ocr.recognize(image.data) : ''; } catch { return ''; }
}

// ------------------------------------------------------------------ translation engines
function translationResult(text, from, to, engine) {
  const L = tr.LANGS;
  return {
    title: 'Translation', answer: text, kind: 'text', mood: 'happy', chips: [], search: '',
    note: `${L[from] || 'Detected language'} to ${L[to] || to}, translated with ${engine}.`,
  };
}

async function viaMyMemory(text, det, target) {
  const r = await tr.mymemory(text, det.lang, target);
  const from = det.lang === 'auto' ? ((r.detected || 'en') + '').slice(0, 2) : det.lang;
  return { via: 'mymemory', result: translationResult(r.text, from, target, 'MyMemory') };
}
async function viaOfflinePack(text, det, target) {
  if (!offlineTr.supports(det.lang, target)) throw new tr.TranslateError('unsupported', 'Offline translation only supports English and Hindi. Connect to the internet for other languages.');
  if (!packs.installed('hi')) throw new tr.TranslateError('nopack', 'Download the Hindi pack in Settings to translate offline.');
  const out = await offlineTr.translate(packs.root(), text, det.lang, target);
  return { via: 'offline-tr', result: translationResult(out, det.lang, target, 'the offline Hindi pack') };
}

/** engines: ordered list of 'mymemory' | 'offline'. Returns the first that works, or throws the most useful error. */
async function translateSelection(s, images, engines) {
  const text = await ocrText(images[0]);
  if (!text) throw new tr.TranslateError('notext', 'I could not read any text in your selection. Try the AI translate, or select the text more tightly.');
  const det = tr.detectLang(text); const target = tr.pickTarget(det.lang, s.translateTo);
  let lastErr = null;
  for (const e of engines) {
    try { return e === 'mymemory' ? await viaMyMemory(text, det, target) : await viaOfflinePack(text, det, target); }
    catch (err) { lastErr = err; }
  }
  throw lastErr;
}

// ------------------------------------------------------------------ offline answers
/** No internet: read the selection with Windows OCR, then explain it with the built-in AI when its pack is installed. */
async function offline(s, images, turns, task) {
  const text = await ocrText(images[0]);
  if (!text) return null;
  if (packs.installed('llm')) {
    const first = `${OFFLINE_TASK[task] || OFFLINE_TASK.explain}\n\nSelected text:\n"""${text.slice(0, 1800)}"""`;
    const t2 = turns.length > 1 ? [{ role: 'user', text: first }, ...turns.slice(1)] : [{ role: 'user', text: first }];
    const system = `You are Tito, a friendly helper. Answer in simple English, in at most four short sentences, in plain text with no markdown headings. ${s.memoryNote || ''}`;
    try {
      const answer = await llm.generate(packs.llmPath(), { system, turns: t2 });
      if (answer) return { via: 'llm', result: { title: TITLES[task] || 'Answer', answer, kind: 'text', mood: 'happy', chips: [], search: text.slice(0, 80) } };
    } catch { /* fall back to showing the text */ }
  }
  if (turns.length > 1) return null;
  return {
    via: 'ocr',
    result: {
      title: 'Text I can read', kind: 'text', mood: 'thinking', search: text.slice(0, 100), offlineOcr: true,
      answer: text.length > 600 ? text.slice(0, 600) + '...' : text,
      note: 'You are offline, so I can read this but not explain it. Download the Offline AI pack in Settings, or reconnect.', chips: [],
    },
  };
}

// ------------------------------------------------------------------ online
/** One provider, politely waiting out short free-tier rate limits (and telling the UI how long). */
async function askProvider(s, provider, key, images, turns, onWait, rawSystem) {
  const cfg = { ...s, provider };
  for (let attempt = 0; ; attempt++) {
    try { return await ai.ask({ settings: cfg, provider, apiKey: key, images, turns, cache: store.modelCache, rawSystem }); }
    catch (e) {
      if (e.code === 'rate' && e.retryAfter && e.retryAfter <= 25 && attempt < 1) {
        for (let t = Math.ceil(e.retryAfter) + 1; t > 0; t--) { if (onWait) onWait(t); await sleep(1000); }
        continue;
      }
      throw e;
    }
  }
}

const done = (r) => {
  if (r.result && r.result.raw) return { ok: true, ...r };          // command parsing: no xp, no memory, no notebook
  store.save({ xp: (store.get().xp || 0) + 1 });
  if (r.result && !r.result.demo && !r.result.offlineOcr) memory.remember(store, r.result.title, r.result.kind);
  return { ok: true, ...r };
};

async function ask({ images, turns, override, onWait, task = 'explain', rawSystem = '' }) {
  const s = { ...store.get(), ...(override || {}), memoryNote: memory.promptNote(store) };
  const engineChoice = s.translateEngine || 'auto';

  // translation with a free / offline engine chosen explicitly
  if (task === 'translate' && turns.length === 1 && (engineChoice === 'mymemory' || engineChoice === 'offline')) {
    try { return done(await translateSelection(s, images, engineChoice === 'mymemory' ? ['mymemory', 'offline'] : ['offline', 'mymemory'])); }
    catch (e) { return { ok: false, code: e.code || 'translate', message: e.message }; }
  }

  // the chosen provider first, then any other provider that has a key: one hiccup never leaves you without an answer
  const usable = (p) => PROVIDERS[p] && store.getKey(p) && (!PROVIDERS[p].custom || (s.custom && s.custom.base));
  const order = [s.provider, ...Object.keys(PROVIDERS).filter((p) => p !== s.provider)].filter(usable);
  let firstErr = null, sawNetwork = false;

  if (s.mode !== 'offline') {
    for (const p of order) {
      try {
        const result = await askProvider(s, p, store.getKey(p), images, turns, order.length > 1 && p === order[0] ? null : onWait, rawSystem);
        return done({ via: 'online', provider: PROVIDERS[p].name, model: result.model, result });
      } catch (e) {
        if (!firstErr) firstErr = e;
        if (NETWORK_LIKE.has(e.code)) sawNetwork = true;
      }
    }
  }

  // the AI could not answer: translation has free fallbacks, everything else can still be read offline
  if (rawSystem) return { ok: false, code: firstErr ? firstErr.code || 'unknown' : 'nokey', message: firstErr ? firstErr.message : 'No AI key is set.' };
  if (task === 'translate' && turns.length === 1 && engineChoice !== 'ai') {
    try { return done(await translateSelection(s, images, sawNetwork ? ['offline', 'mymemory'] : ['mymemory', 'offline'])); } catch (e) { if (!firstErr) firstErr = e; }
  }
  if (!order.length || (sawNetwork && s.mode === 'auto')) {
    try { const off = await offline(s, images, turns, task); if (off) return done(off); } catch { /* ignore */ }
  }
  if (!order.length) return { ok: true, via: 'demo', result: ai.demo(turns.length > 1) };
  return { ok: false, code: firstErr ? firstErr.code || 'unknown' : 'unknown', message: firstErr ? firstErr.message : 'No answer available.' };
}

async function status() {
  const s = store.get();
  return { hasKey: !!store.getKey(s.provider), keys: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, !!store.getKey(p)])), packs: packs.status() };
}

module.exports = { ask, status };

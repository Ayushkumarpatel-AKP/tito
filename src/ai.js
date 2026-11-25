// Talks to the vision model of any configured provider (Gemini, or anything OpenAI-compatible: ChatGPT, Groq,
// OpenRouter, xAI, custom). The model is chosen automatically by ./models.js and replaced if it is retired.
const { buildSystem } = require('./prompts');
const { PROVIDERS } = require('./providers');
const models = require('./models');

const TIMEOUT_MS = 45000;
const GEMINI_TIMEOUT_MS = 22000;

class AiError extends Error {
  constructor(code, message, retryAfter) { super(message); this.code = code; this.retryAfter = retryAfter; }
}

// A deadline the model found on screen: kept only if it is a real date in the future (within two years).
function dueOf(due, title) {
  const t = Date.parse(String(due || '')); const now = Date.now();
  return Number.isFinite(t) && t > now && t < now + 2 * 365 * 86400000 ? { due: t, due_title: String(title || '').slice(0, 60) } : {};
}

function parseReply(raw) {
  const fallback = { title: 'Tito says', answer: String(raw || '').trim().slice(0, 700), kind: 'other', mood: 'happy', chips: [], search: '' };
  if (!raw) return fallback;
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return fallback;
  try {
    const j = JSON.parse(m[0]);
    return {
      title: String(j.title || 'Tito says').slice(0, 60),
      answer: (typeof j.answer === 'object' && j.answer ? JSON.stringify(j.answer) : String(j.answer || '')).trim().slice(0, 900) || fallback.answer,
      kind: String(j.kind || 'other'),
      mood: ['happy', 'excited', 'thinking', 'confused'].includes(j.mood) ? j.mood : 'happy',
      chips: Array.isArray(j.chips) ? j.chips.slice(0, 2).map((c) => String(c).slice(0, 40)) : [],
      search: String(j.search || '').slice(0, 120),
      image_query: String(j.image_query || '').trim().slice(0, 60),
      ...dueOf(j.due, j.due_title),
    };
  } catch { return fallback; }
}

async function post(url, headers, body, timeout = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* keep text */ }
    if (!r.ok) {
      const msg = json?.error?.message || (Array.isArray(json) && json[0]?.error?.message) || text.slice(0, 200);
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key/i.test(msg))) throw new AiError('auth', 'API key not accepted. ' + msg);
      if (r.status === 429) {
        const wait = parseFloat(r.headers.get('retry-after')) || 0;
        throw new AiError('rate', wait ? `Free limit reached. Try again in about ${Math.ceil(wait)} seconds.` : 'Free limit reached. Try again in a minute.', wait);
      }
      const he = new AiError('http', `Model error (${r.status}). ${msg}`); he.status = r.status; throw he;
    }
    return json;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e.name === 'AbortError') throw new AiError('timeout', 'The model took too long to answer.');
    throw new AiError('network', 'Could not reach the internet.');
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------------ one model, one request
async function callOpenAI({ base, id, apiKey, model, system, images, turns, raw, maxTokens }) {
  const messages = [{ role: 'system', content: system }, ...turns.map((t, i) => ({
    role: t.role,
    content: i === 0 && t.role === 'user'
      ? [...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })), { type: 'text', text: t.text }]
      : t.text,
  }))];
  const body = { model, messages };
  if (id === 'openai') body.max_completion_tokens = maxTokens || 900;          // newer OpenAI models reject max_tokens / temperature
  else { body.max_tokens = maxTokens || 700; body.temperature = 0.7; }
  if (id === 'groq' && /qwen/i.test(model)) body.reasoning_effort = 'none';   // skip "thinking": much faster
  const j = await post(base + '/chat/completions', { authorization: 'Bearer ' + apiKey, 'x-title': 'Tito' }, body);
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new AiError('empty', 'The model sent back nothing.');
  const t = Array.isArray(text) ? text.map((p) => p.text || '').join('') : text;
  return raw ? { answer: String(t).trim(), raw: true } : parseReply(t);
}

async function callGemini({ apiKey, model, system, images, turns, raw, maxTokens, rawJson }) {
  const contents = turns.map((t, i) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [
      ...(i === 0 ? images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } })) : []),
      { text: t.text },
    ],
  }));
  const j = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': apiKey },
    { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { ...(raw && rawJson === false ? {} : { responseMimeType: 'application/json' }), maxOutputTokens: maxTokens || 700, temperature: 0.7 } },
    GEMINI_TIMEOUT_MS,
  );
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new AiError('empty', 'The model sent back nothing.');
  return raw ? { answer: text.trim(), raw: true } : parseReply(text);
}

// A different model may well work when this one failed (retired, overloaded, no image support...). Rate limits and bad keys will not.
const skippable = (e) => e.code === 'empty' || e.code === 'timeout' || (e.code === 'http' && [400, 404, 422, 500, 502, 503, 504].includes(e.status));

/**
 * images: [{mime, data(base64)}] attached to the first user turn. turns: [{role:'user'|'assistant', text}]
 * Tries the pinned model, then the auto-discovered best models; if every one fails it re-discovers once (models get retired).
 */
async function ask({ settings, provider, apiKey, images, turns, cache, rawSystem, rawJson, maxTokens }) {
  const P = PROVIDERS[provider];
  if (!P) throw new AiError('config', 'Unknown provider: ' + provider);
  if (!apiKey) throw new AiError('nokey', 'No API key set.');
  const custom = settings.custom || {};
  const base = models.baseOf(provider, custom);
  if (P.kind === 'openai' && !base) throw new AiError('config', 'Set the base URL for this provider in Settings.');
  const system = rawSystem || buildSystem(settings);        // rawSystem: a different job (command parsing) with its own reply format
  const raw = !!rawSystem;
  const pinned = P.custom ? custom.model : (settings.models || {})[provider];

  const tried = new Set(); let lastErr = null;
  const run = async (list) => {
    for (const model of list) {
      if (tried.has(model)) continue; tried.add(model);
      try {
        const r = P.kind === 'gemini' ? await callGemini({ apiKey, model, system, images, turns, raw, maxTokens, rawJson }) : await callOpenAI({ base, id: provider, apiKey, model, system, images, turns, raw, maxTokens });
        return { ...r, model };
      } catch (e) { lastErr = e; if (!skippable(e)) throw e; }
    }
    return null;
  };

  let r = await run(await models.candidates(provider, apiKey, { pinned, cache, custom }));
  if (r) return r;
  if (!P.custom) {                                   // everything failed: the models may have been retired, so look again
    const fresh = await models.discover(provider, apiKey, { cache, force: true, custom });
    r = await run(fresh.ranked);
    if (r) return r;
  }
  throw lastErr || new AiError('empty', 'No model could answer.');
}

/** Cheap call to verify a key + model work. */
async function test({ settings, provider, apiKey, cache }) {
  const s = { ...settings, personality: 'mochi', language: 'english' };
  const r = await ask({ settings: s, provider, apiKey, images: [], turns: [{ role: 'user', text: 'Say hi in one short sentence.' }], cache });
  return { answer: r.answer, model: r.model };
}

/** Shown when nothing can answer (no key, or nothing to read offline) so the whole flow can still be seen. */
function demo(question) {
  return {
    title: 'Hi, I am Tito',
    answer: question
      ? 'I cannot answer follow-up questions without an AI model. Add a free API key in Settings, then ask again.'
      : 'This is a demo answer. Add a free API key in Settings and I will explain whatever you select.',
    kind: 'other', mood: 'happy', chips: ['Where do I get a key?', 'What can you do?'], search: '', demo: true,
  };
}

module.exports = { ask, test, demo, AiError };

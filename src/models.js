// Live model discovery: ask the provider what models exist today, rank them, and PROVE each one accepts images
// with a 1-pixel-class probe. Results are cached for a day and refreshed automatically when a model is retired,
// so an old model disappearing (or a better free one appearing) never needs a Tito update.
// Pure Node: no Electron imports, so it can be tested with `node tools/try-models.js`.
const fs = require('fs');
const path = require('path');
const { PROVIDERS } = require('./providers');

const PROBE_PNG = fs.readFileSync(path.join(__dirname, 'probe.png.b64'), 'utf8').trim();
const DAY = 24 * 3600 * 1000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
// not chat/vision models, or previews/aliases that are unreliable for everyday use
const BAD = /(whisper|tts|audio|speech|transcribe|realtime|embed|moderation|guard|safeguard|dall|imagen|image-gen|image-preview|veo|lyria|orpheus|robotics|computer-use|search|codex|allam|rerank|live|omni|nano-banana|customtools|gpt-oss|latest|instruct-|vision-preview|deep-research|-image$|-tts$)/i;

async function http(url, { headers = {}, method = 'GET', body, timeout = 15000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text };
  } catch (e) { return { status: 0, json: null, text: String(e.message || e) }; }
  finally { clearTimeout(t); }
}

const baseOf = (id, custom) => (PROVIDERS[id].custom ? (custom && custom.base || '').replace(/\/+$/, '') : PROVIDERS[id].base);
const authHeaders = (id, key) => (PROVIDERS[id].kind === 'gemini' ? { 'x-goog-api-key': key } : { authorization: 'Bearer ' + key });

// ------------------------------------------------------------------ listing
/** -> [{ id, created, ctx, free, image }] straight from the provider (best effort). */
async function listRaw(id, key, custom) {
  const P = PROVIDERS[id];
  if (P.kind === 'gemini') {
    const r = await http('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: authHeaders(id, key) });
    if (r.status !== 200) throw Object.assign(new Error(`model list failed (${r.status})`), { status: r.status });
    return (r.json.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => ({ id: m.name.replace(/^models\//, '') }));
  }
  const base = baseOf(id, custom);
  if (!base) return [];
  const r = await http(base + '/models', { headers: key ? authHeaders(id, key) : {} });
  if (r.status !== 200) throw Object.assign(new Error(`model list failed (${r.status})`), { status: r.status });
  return (r.json.data || r.json.models || []).map((m) => ({
    id: m.id || m.name, created: m.created || 0, ctx: m.context_length || m.context_window || 0,
    free: m.pricing ? Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0 : undefined,
    image: m.architecture && Array.isArray(m.architecture.input_modalities) ? m.architecture.input_modalities.includes('image') : undefined,
  }));
}

// ------------------------------------------------------------------ ranking (best everyday vision model first)
const ver = (id, re) => { const m = id.match(re); return m ? parseFloat(m[1]) : 0; };
function rank(id, items) {
  const ok = items.filter((m) => m.id && !BAD.test(m.id));
  let out;
  if (id === 'gemini') {
    out = ok.filter((m) => /^gemini-/.test(m.id)).map((m) => ({
      m, tier: /flash-lite/.test(m.id) ? 3 : /flash/.test(m.id) ? 2 : /pro/.test(m.id) ? 1 : 0,
      v: ver(m.id, /gemini-(\d+(?:\.\d+)?)/), pre: /preview|exp/.test(m.id) ? 1 : 0,
    })).filter((x) => x.tier > 0).sort((a, b) => b.tier - a.tier || a.pre - b.pre || b.v - a.v).map((x) => x.m.id);
  } else if (id === 'openai') {
    out = ok.filter((m) => /^gpt-\d/.test(m.id) && !/\d{4}-\d{2}-\d{2}$/.test(m.id) && !/(mini-search|chat|pro|turbo|16k|32k)/.test(m.id)).map((m) => ({
      m, tier: /mini/.test(m.id) ? 3 : /nano/.test(m.id) ? 2 : 1, v: ver(m.id, /gpt-(\d+(?:\.\d+)?)/),
    })).sort((a, b) => b.tier - a.tier || b.v - a.v).map((x) => x.m.id);
  } else if (id === 'openrouter') {
    out = ok.filter((m) => m.free && m.image !== false && m.image === true).sort((a, b) => b.created - a.created || b.ctx - a.ctx).map((m) => m.id);
  } else if (id === 'groq') {
    out = ok.filter((m) => /(vision|scout|maverick|qwen|gemma|llama-4|pixtral|llava|multimodal|mistral-small|gpt-4o)/i.test(m.id)).sort((a, b) => b.created - a.created).map((m) => m.id);
  } else if (id === 'xai') {
    out = ok.filter((m) => /grok/i.test(m.id)).sort((a, b) => b.created - a.created).map((m) => m.id);
  } else out = [];
  return [...new Set(out)];
}

// ------------------------------------------------------------------ probing
/** Does `model` really accept an image? { ok, status } (status 0 = network problem) */
async function probe(id, key, model, custom) {
  const P = PROVIDERS[id];
  if (P.kind === 'gemini') {
    const r = await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: authHeaders(id, key), timeout: 12000,
      body: { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/png', data: PROBE_PNG } }, { text: 'What colour is this image? One word.' }] }], generationConfig: { maxOutputTokens: 20 } },
    });
    return { ok: r.status === 200 && !!r.json?.candidates?.length, status: r.status };
  }
  const base = baseOf(id, custom);
  const body = {
    model, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' + PROBE_PNG } }, { type: 'text', text: 'What colour is this image? One word.' }] }],
  };
  if (id === 'openai') body.max_completion_tokens = 64; else body.max_tokens = 16;
  if (id === 'groq' && /qwen/i.test(model)) body.reasoning_effort = 'none';
  const r = await http(base + '/chat/completions', { method: 'POST', headers: authHeaders(id, key), body, timeout: 12000 });
  return { ok: r.status === 200 && !!r.json?.choices?.length, status: r.status };
}

// ------------------------------------------------------------------ discovery + cache
/**
 * @param cache { get(id) -> {at, ranked}|undefined, set(id, value) }
 * Returns { at, ranked, verified } where ranked = models to try, best first.
 */
async function discover(id, key, { cache, force = false, custom } = {}) {
  const P = PROVIDERS[id];
  const cached = cache && cache.get(id);
  if (!force && cached && cached.ranked && cached.ranked.length && Date.now() - cached.at < DAY) return cached;

  let ranked = [], verified = 0, listed = true;
  try {
    const cands = rank(id, await listRaw(id, key, custom)).slice(0, 6);
    if (!key) { ranked = cands.slice(0, 3); }             // listing only (no key to probe with)
    else {
      const results = await Promise.all(cands.map((m) => probe(id, key, m, custom)));   // in parallel: discovery takes seconds, not minutes
      const good = cands.filter((m, i) => results[i].ok).slice(0, 3);
      const maybe = cands.filter((m, i) => !results[i].ok && (RETRYABLE.has(results[i].status) || results[i].status === 0));   // busy right now, not necessarily broken
      ranked = [...good, ...maybe.slice(0, 2)]; verified = good.length;
    }
  } catch { listed = false; }

  if (!ranked.length) {                                   // could not list or nothing passed: keep what worked before, else the built-in hints
    ranked = (cached && cached.ranked && cached.ranked.length ? cached.ranked : P.fallback.slice());
    if (!listed && cached) return cached;
  }
  const value = { at: Date.now(), ranked, verified };
  if (cache) cache.set(id, value);
  return value;
}

const inflight = new Map();
/** Refresh the model list without making anyone wait for it. */
function refreshInBackground(id, key, opts) {
  if (inflight.has(id)) return;
  inflight.set(id, discover(id, key, { ...opts, force: true }).catch(() => {}).finally(() => inflight.delete(id)));
}

/**
 * Models to try for a request: the user's pinned model, then the verified auto list.
 * Never makes the user wait for discovery when we already know something that works: the cache (or the built-in
 * hints) answers now and a fresh discovery runs in the background for next time.
 */
async function candidates(id, key, { pinned, cache, custom } = {}) {
  const P = PROVIDERS[id];
  const cached = cache && cache.get(id);
  let auto;
  if (cached && cached.ranked && cached.ranked.length) {
    auto = cached.ranked;
    if (Date.now() - cached.at >= DAY) refreshInBackground(id, key, { cache, custom });
  } else if (P.fallback.length) {
    auto = P.fallback; refreshInBackground(id, key, { cache, custom });
  } else if (!P.custom) {
    auto = (await discover(id, key, { cache, custom })).ranked;      // nothing known yet: we have to look
  } else auto = [];
  return [...new Set([pinned, ...auto, ...P.fallback].filter(Boolean))];
}

module.exports = { listRaw, rank, probe, discover, candidates, refreshInBackground, baseOf, authHeaders, http, BAD };

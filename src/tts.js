// Natural text to speech. Free path: Gemini's speech models with the Gemini key Tito already has (free tier). Other providers take
// their own key: OpenAI, ElevenLabs, or any OpenAI-compatible /audio/speech service. 'system' uses the Windows voice (robotic, but offline).
// speak() returns { ok, mime, audio (base64) } or { ok: false, system: true } when the page should use the built-in voice.
const crypto = require('crypto');

const GEMINI_VOICES = ['Zephyr', 'Puck', 'Leda', 'Aoede', 'Kore', 'Achird', 'Sulafat', 'Charon', 'Fenrir'];
const OPENAI_VOICES = ['nova', 'shimmer', 'alloy', 'coral', 'sage', 'echo', 'fable', 'onyx'];
const DEFAULTS = { gemini: 'Zephyr', openai: 'nova', elevenlabs: 'EXAVITQu4vr4xnSDxMaL', custom: 'alloy' };   // ElevenLabs default: the public "Sarah" voice
const PROVIDERS = [
  ['auto', 'Automatic (best one that has a key)'], ['gemini', 'Gemini voice (free with your Gemini key)'], ['openai', 'OpenAI'], ['elevenlabs', 'ElevenLabs'],
  ['custom', 'Other (OpenAI-compatible)'], ['system', 'Windows voice (offline, robotic)'],
];

class TtsError extends Error { constructor(code, message) { super(message); this.code = code; } }

/** 24 kHz mono 16-bit PCM from Gemini -> a playable WAV file. */
function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function post(url, headers, body, timeout = 30000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { return await fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body), signal: ctl.signal }); }
  catch (e) { throw new TtsError(e.name === 'AbortError' ? 'timeout' : 'network', e.name === 'AbortError' ? 'The voice service took too long.' : 'No internet connection for the voice.'); }
  finally { clearTimeout(t); }
}
async function failFrom(r, name) {
  let msg = ''; try { const j = await r.json(); msg = j.error?.message || j.detail?.message || j.message || ''; } catch { /* not json */ }
  if (r.status === 401 || r.status === 403) throw new TtsError('auth', `${name} did not accept the key. ${msg}`.trim());
  if (r.status === 429) throw new TtsError('rate', `${name} free limit reached for the moment.`);
  throw new TtsError('http', `${name} voice error (${r.status}). ${msg}`.trim());
}

// ---- Gemini: find today's speech models from the live model list, newest flash first
let geminiModels = null, geminiAt = 0;
async function geminiTtsModels(key) {
  if (geminiModels && Date.now() - geminiAt < 24 * 3600000) return geminiModels;
  let list = [];
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (r.ok) list = ((await r.json()).models || []).filter((m) => /tts/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  } catch { /* use the known names below */ }
  const rank = (n) => (/flash/.test(n) ? 0 : 1) + (/preview/.test(n) ? 0.5 : 0) - (parseFloat((n.match(/(\d+\.\d+)/) || [0])[1]) || 0) / 100;
  geminiModels = [...new Set([...list.sort((a, b) => rank(a) - rank(b)), 'gemini-2.5-flash-preview-tts'])]; geminiAt = Date.now();
  return geminiModels;
}
async function viaGemini(text, voice, key) {
  if (!key) throw new TtsError('nokey', 'Add a Gemini key in Settings to use the free natural voice.');
  let last = null;
  for (const model of await geminiTtsModels(key)) {
    const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'content-type': 'application/json', 'x-goog-api-key': key }, {
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || DEFAULTS.gemini } } } },
    });
    if (!r.ok) { try { await failFrom(r, 'Gemini'); } catch (e) { last = e; if (e.code === 'auth' || e.code === 'rate') throw e; continue; } }
    const j = await r.json(); const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data); const d = part && (part.inlineData || part.inline_data);
    if (!d || !d.data) { last = new TtsError('empty', 'Gemini sent back no audio.'); continue; }
    const mime = String(d.mimeType || d.mime_type || ''); const rate = parseInt((mime.match(/rate=(\d+)/) || [])[1], 10) || 24000;
    if (/wav|mpeg|mp3|ogg/i.test(mime)) return { mime, audio: d.data };
    return { mime: 'audio/wav', audio: pcmToWav(Buffer.from(d.data, 'base64'), rate).toString('base64') };
  }
  throw last || new TtsError('empty', 'No Gemini speech model answered.');
}
async function viaOpenAI(text, voice, key, base = 'https://api.openai.com/v1', model = 'gpt-4o-mini-tts', name = 'OpenAI') {
  if (!key) throw new TtsError('nokey', `Add a ${name} key in Settings.`);
  const r = await post(base.replace(/\/+$/, '') + '/audio/speech', { 'content-type': 'application/json', authorization: 'Bearer ' + key }, { model, voice: voice || DEFAULTS.openai, input: text, response_format: 'mp3', instructions: 'Warm, cheerful and natural, like a friendly small companion.' });
  if (!r.ok) await failFrom(r, name);
  return { mime: 'audio/mpeg', audio: Buffer.from(await r.arrayBuffer()).toString('base64') };
}
async function viaEleven(text, voice, key) {
  if (!key) throw new TtsError('nokey', 'Add an ElevenLabs key in Settings.');
  const r = await post(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice || DEFAULTS.elevenlabs)}?output_format=mp3_44100_128`, { 'content-type': 'application/json', 'xi-api-key': key }, { text, model_id: 'eleven_multilingual_v2' });
  if (!r.ok) await failFrom(r, 'ElevenLabs');
  return { mime: 'audio/mpeg', audio: Buffer.from(await r.arrayBuffer()).toString('base64') };
}

const cache = new Map();
/** cfg: { provider, voice, custom: { base, model }, keys: { gemini, openai, elevenlabs, custom } } */
async function speak(text, cfg) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 450); if (!text) throw new TtsError('empty', 'Nothing to say.');
  const k = cfg.keys || {}; let p = cfg.provider || 'auto';
  if (p === 'auto') p = k.gemini ? 'gemini' : k.openai ? 'openai' : k.elevenlabs ? 'elevenlabs' : (cfg.custom && cfg.custom.base && k.custom) ? 'custom' : 'system';
  if (p === 'system') return { ok: false, system: true };
  const voice = (cfg.voices && cfg.voices[p]) || DEFAULTS[p];
  const id = crypto.createHash('sha1').update([p, voice, text].join('|')).digest('hex');
  if (cache.has(id)) return { ok: true, ...cache.get(id) };
  let out;
  if (p === 'gemini') out = await viaGemini(text, voice, k.gemini);
  else if (p === 'openai') out = await viaOpenAI(text, voice, k.openai);
  else if (p === 'elevenlabs') out = await viaEleven(text, voice, k.elevenlabs);
  else if (p === 'custom') out = await viaOpenAI(text, voice, k.custom, cfg.custom && cfg.custom.base, (cfg.custom && cfg.custom.model) || 'tts-1', 'Voice service');
  else throw new TtsError('config', 'Unknown voice provider.');
  cache.set(id, out); if (cache.size > 30) cache.delete(cache.keys().next().value);
  return { ok: true, provider: p, ...out };
}

module.exports = { speak, pcmToWav, TtsError, PROVIDERS, GEMINI_VOICES, OPENAI_VOICES, DEFAULTS };

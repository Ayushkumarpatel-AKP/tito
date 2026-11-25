// Speech to text through Groq's Whisper (free tier, good Hindi and Hinglish). Audio goes to Groq only when the user presses the mic.
const GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
// Nudges Whisper toward Roman-script Hinglish and the words Tito is likely to hear.
const HINT = 'Tito, remind me, reminder, todo, play on YouTube, Spotify, kal, aaj, baje, chalao, roko, agla gaana, maine lunch kha liya, quiz, search karo.';

class VoiceError extends Error { constructor(code, message) { super(message); this.code = code; } }

/** audio: Buffer of webm/ogg/wav. Returns the recognised text. */
async function transcribe(audio, { apiKey, mime = 'audio/webm', language = '' } = {}) {
  if (!apiKey) throw new VoiceError('nokey', 'Voice needs a free Groq key. Add one in Settings > AI provider.');
  if (!audio || audio.length < 1200) throw new VoiceError('short', 'I did not hear anything. Hold the mic a little longer.');
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), 'speech.' + (mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm'));
  form.append('model', MODEL); form.append('response_format', 'json'); form.append('temperature', '0'); form.append('prompt', HINT);
  if (language) form.append('language', language);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(GROQ, { method: 'POST', headers: { authorization: 'Bearer ' + apiKey }, body: form, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new VoiceError('auth', 'The Groq key was not accepted.');
    if (r.status === 429) throw new VoiceError('rate', 'Groq free limit reached for the moment. Try again in a minute.');
    if (!r.ok) throw new VoiceError('http', j.error?.message || 'Speech service answered ' + r.status);
    return String(j.text || '').trim();
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    throw new VoiceError(e.name === 'AbortError' ? 'timeout' : 'network', e.name === 'AbortError' ? 'Speech recognition took too long.' : 'No internet connection for voice.');
  } finally { clearTimeout(t); }
}

module.exports = { transcribe, VoiceError };

// node tools/test-tts.js : checks the text-to-speech module against a pretend server (no real key or network is used)
const tts = require('../src/tts'); let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };
const calls = []; const pcm = Buffer.alloc(4800, 1);
global.fetch = async (url, o = {}) => {
  calls.push({ url: String(url), body: o.body ? (() => { try { return JSON.parse(o.body); } catch { return o.body; } })() : null, headers: o.headers });
  const json = (j, status = 200) => ({ ok: status < 400, status, json: async () => j, arrayBuffer: async () => Buffer.from('MP3DATA') });
  if (/\/v1beta\/models\?/.test(url)) return json({ models: [{ name: 'models/gemini-3.0-flash-tts', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-pro-tts', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
  if (/generateContent/.test(url)) return /BADKEY/.test(o.headers['x-goog-api-key']) ? json({ error: { message: 'API key not valid' } }, 400 + 1) : json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }] });
  if (/audio\/speech/.test(url)) return json({}, 200);
  if (/elevenlabs/.test(url)) return json({}, 200);
  return json({}, 404);
};
(async () => {
  const wav = tts.pcmToWav(pcm); ok(wav.slice(0, 4).toString() === 'RIFF' && wav.readUInt32LE(24) === 24000 && wav.readUInt32LE(40) === pcm.length && wav.length === 44 + pcm.length, 'PCM is wrapped into a valid WAV header');
  let r = await tts.speak('Hello there', { provider: 'auto', keys: { gemini: 'GOODKEY' } });
  ok(r.ok && r.provider === 'gemini' && r.mime === 'audio/wav', 'auto picks Gemini when a Gemini key exists');
  const gen = calls.find((c) => /generateContent/.test(c.url)); ok(/gemini-3\.0-flash-tts/.test(gen.url), 'uses the newest flash speech model found in the live list: ' + gen.url.split('models/')[1].split(':')[0]);
  ok(gen.body.generationConfig.responseModalities[0] === 'AUDIO' && gen.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === 'Zephyr', 'asks for audio with the default voice');
  const before = calls.length; await tts.speak('Hello there', { provider: 'auto', keys: { gemini: 'GOODKEY' } }); ok(calls.length === before, 'a repeated phrase comes from the cache');
  r = await tts.speak('Hi', { provider: 'openai', keys: { openai: 'sk-x' } }); ok(r.ok && r.mime === 'audio/mpeg' && calls.at(-1).body.model === 'gpt-4o-mini-tts', 'OpenAI request shape');
  r = await tts.speak('Hi', { provider: 'elevenlabs', keys: { elevenlabs: 'xi' } }); ok(r.ok && /EXAVITQu4vr4xnSDxMaL/.test(calls.at(-1).url) && calls.at(-1).headers['xi-api-key'] === 'xi', 'ElevenLabs request shape');
  r = await tts.speak('Hi', { provider: 'custom', custom: { base: 'https://tts.example.com/v1/', model: 'my-model' }, keys: { custom: 'k' } }); ok(r.ok && calls.at(-1).url === 'https://tts.example.com/v1/audio/speech' && calls.at(-1).body.model === 'my-model', 'custom OpenAI-compatible service');
  r = await tts.speak('Hi', { provider: 'auto', keys: {} }); ok(r.ok === false && r.system === true, 'no key anywhere: the page falls back to the Windows voice');
  try { await tts.speak('Hi', { provider: 'gemini', keys: { gemini: 'BADKEY' } }); ok(false, 'bad key should throw'); } catch (e) { ok(/Gemini|API key/.test(e.message), 'bad key gives a readable error: ' + e.message); }
  try { await tts.speak('Hi', { provider: 'gemini', keys: {} }); ok(false, 'missing key should throw'); } catch (e) { ok(e.code === 'nokey', 'missing Gemini key says so'); }
  console.log(bad ? bad + ' FAILED' : 'tts ok'); process.exit(bad ? 1 : 0);
})();

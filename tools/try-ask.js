// node tools/try-ask.js <provider> <image.jpg>   (key from the provider's env var, e.g. GEMINI_API_KEY)
// One real question through the same code path the app uses, with a fresh model cache.
const fs = require('fs');
const { PROVIDERS } = require('../src/providers');
const ai = require('../src/ai');
(async () => {
  const [provider, file] = process.argv.slice(2);
  const key = process.env[PROVIDERS[provider].env];
  const store = {}; const cache = { get: (k) => store[k], set: (k, v) => (store[k] = v) };
  const settings = { personality: 'mochi', language: 'english', level: 'teen', models: {}, custom: {} };
  const images = [{ mime: 'image/jpeg', data: fs.readFileSync(file).toString('base64') }];
  for (const text of ['Explain what I selected.', 'Translate the selected text into English.']) {
    const t = Date.now();
    try {
      const r = await ai.ask({ settings, provider, apiKey: key, images, turns: [{ role: 'user', text }], cache });
      console.log(`${provider} ${((Date.now() - t) / 1000).toFixed(1)}s model=${r.model} mood=${r.mood} | ${r.title} | ${r.answer.slice(0, 110)}`);
    } catch (e) { console.log(`${provider} FAILED ${e.code}: ${e.message}`); }
  }
})();

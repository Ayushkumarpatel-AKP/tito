// node tools/try-models.js  (set GEMINI_API_KEY / GROQ_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / XAI_API_KEY)
// Shows what live model discovery picks for each provider you have a key for.
const { PROVIDERS } = require('../src/providers');
const models = require('../src/models');
(async () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const key = process.env[p.env] || (id === 'openrouter' ? 'public' : '');
    if (!key || p.custom) { console.log(`${id.padEnd(11)} skipped (no ${p.env})`); continue; }
    const store = {}; const t = Date.now();
    const r = await models.discover(id, key === 'public' ? '' : key, { cache: { get: (k) => store[k], set: (k, v) => (store[k] = v) } });
    console.log(`${id.padEnd(11)} ${((Date.now() - t) / 1000).toFixed(1)}s  verified=${r.verified}  ranked=${JSON.stringify(r.ranked)}`);
  }
})();

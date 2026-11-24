// node tools/test-offline-tr.js : offline English <-> Hindi using the downloaded pack (no network allowed)
const path = require('path');
const off = require('../src/offline-tr');
const dir = path.join(process.env.APPDATA, 'tito', 'packs');
(async () => {
  for (const [from, to, text] of [
    ['en', 'hi', 'The library opens at nine and closes at six on weekdays.'],
    ['en', 'hi', 'Where is the nearest railway station?'],
    ['hi', 'en', 'मैं कल दिल्ली जा रहा हूँ।'],
    ['hi', 'en', 'यह किताब बहुत अच्छी है और मुझे पसंद आई।'],
  ]) {
    const t = Date.now(); const out = await off.translate(dir, text, from, to);
    console.log(`${from}->${to} ${((Date.now() - t) / 1000).toFixed(1)}s | ${text}\n        => ${out}`);
  }
  process.exit(0);
})().catch((e) => { console.log('FAILED', e.code || '', e.message); process.exit(1); });

// node tools/test-translate.js : checks language detection, target choice, chunking and a real MyMemory call
const assert = require('assert');
const t = require('../src/translate');
assert.deepStrictEqual(t.detectLang('मैं कल दिल्ली जा रहा हूँ।'), { lang: 'hi', certain: true });
assert.strictEqual(t.detectLang('தமிழ் மொழி இனிமையானது').lang, 'ta');
assert.strictEqual(t.detectLang('Where is the library?').lang, 'en');
assert.strictEqual(t.detectLang('Où est la bibliothèque, s\u2019il vous plaît ? Je voudrais emprunter ce livre.').lang, 'auto');
assert.strictEqual(t.pickTarget('en', 'mr'), 'mr'); assert.strictEqual(t.pickTarget('hi', 'mr'), 'en'); assert.strictEqual(t.pickTarget('en', 'en'), 'hi');
const long = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i + 1} of the long text.`).join(' ');
const parts = t.chunk(long); assert(parts.length > 1 && parts.every((p) => p.length <= 450), 'chunks must stay under 450 chars');
assert.strictEqual(parts.join(' '), long, 'chunking must not lose text');
console.log('pure functions ok:', parts.length, 'chunks for', long.length, 'chars');
(async () => {
  const r1 = await t.mymemory('Hello, where is the library?', 'en', 'hi'); console.log('en->hi :', r1.text);
  const r2 = await t.mymemory('Où est la bibliothèque ?', 'auto', 'en'); console.log('auto->en:', r2.text, '| detected', r2.detected);
  const r3 = await t.mymemory(long, 'en', 'mr'); console.log('long en->mr (' + parts.length + ' requests):', r3.text.slice(0, 80) + '...');
})().catch((e) => { console.log('FAILED', e.code, e.message); process.exit(1); });

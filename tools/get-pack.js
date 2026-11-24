// node tools/get-pack.js <llm|hi> [baseDir]   downloads an offline pack with the same code the app uses
const path = require('path');
const packs = require('../src/packs');
const base = process.argv[3] || path.join(process.env.APPDATA, 'tito');
packs.init(base);
const id = process.argv[2]; let last = -1; const t0 = Date.now();
packs.download(id, (p) => { const pct = Math.floor(p * 100); if (pct !== last && pct % 2 === 0) { last = pct; console.log(`${id} ${pct}%  ${((Date.now() - t0) / 1000).toFixed(0)}s`); } })
  .then(() => console.log(id, 'DONE', JSON.stringify(packs.status()[id])))
  .catch((e) => { console.log(id, 'FAILED', e.message); process.exit(1); });

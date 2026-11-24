// Offline English <-> Hindi translation: OPUS-MT models (int8 ONNX, about 110 MB each) run by transformers.js.
// The models are downloaded once into the packs folder; after that this works with no internet at all.
const path = require('path');
const { TranslateError, chunk } = require('./translate');

const MODELS = { 'en-hi': 'Xenova/opus-mt-en-hi', 'hi-en': 'Xenova/opus-mt-hi-en' };
let tf = null; const pipes = {};

async function lib(dir) {
  if (!tf) {
    tf = await import('@huggingface/transformers');
    tf.env.cacheDir = path.join(dir, 'hf'); tf.env.localModelPath = path.join(dir, 'hf');
  }
  return tf;
}

async function pipe(dir, pair, { online = false, progress } = {}) {
  const t = await lib(dir);
  t.env.allowRemoteModels = online;                       // installing: download. Afterwards the files are read from disk and the network is never touched
  t.env.allowLocalModels = !online;
  if (!pipes[pair]) {
    try { pipes[pair] = await t.pipeline('translation', MODELS[pair], { dtype: 'q8', progress_callback: progress }); }
    catch (e) { throw new TranslateError(online ? 'download' : 'nopack', online ? 'Could not download the translation pack.' : 'The offline Hindi pack is not installed.'); }
  }
  return pipes[pair];
}

const supports = (from, to) => !!MODELS[`${from}-${to}`];

async function translate(dir, text, from, to) {
  if (!supports(from, to)) throw new TranslateError('unsupported', 'Offline translation only supports English and Hindi.');
  const p = await pipe(dir, `${from}-${to}`);
  const out = [];
  for (const piece of chunk(text, 380)) { const r = await p(piece, { max_new_tokens: 256, num_beams: 3 }); out.push((r[0] && r[0].translation_text) || ''); }
  return out.join(' ').trim();
}

/** Download both directions into the cache. onProgress gets 0..1. */
async function install(dir, onProgress) {
  const pairs = Object.keys(MODELS);
  for (let i = 0; i < pairs.length; i++) {
    const files = {};
    await pipe(dir, pairs[i], {
      online: true,
      progress: (p) => {
        if (!p.file || !p.total) return;
        files[p.file] = { loaded: p.loaded || 0, total: p.total };
        const all = Object.values(files); const loaded = all.reduce((a, b) => a + b.loaded, 0), total = all.reduce((a, b) => a + b.total, 0);
        onProgress(Math.min(0.99, (i + loaded / Math.max(1, total)) / pairs.length));
      },
    });
  }
  onProgress(1);
}

module.exports = { supports, translate, install };

// Offline "packs": big files Tito downloads once (so the installer stays small) and then keeps on this PC.
//   llm : the small built-in language model (Qwen3 0.6B, 4-bit, about 400 MB)
//   hi  : offline English <-> Hindi translation (about 230 MB)
const fs = require('fs');
const path = require('path');
const offlineTr = require('./offline-tr');

const LLM_FILE = 'Qwen3-0.6B-Q4_K_M.gguf';
const LLM_URL = 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf';
const LLM_MIN_BYTES = 300e6;
const INFO = {
  llm: { name: 'Offline AI', detail: 'Qwen3 0.6B, a small model that explains and summarizes text with no internet', size: '400 MB' },
  hi: { name: 'Hindi translation', detail: 'English to Hindi and Hindi to English with no internet', size: '230 MB' },
};

let dir = null;
function init(baseDir) { dir = path.join(baseDir, 'packs'); fs.mkdirSync(dir, { recursive: true }); return dir; }
const llmPath = () => path.join(dir, LLM_FILE);
const markerPath = (id) => path.join(dir, id + '.ok');
const root = () => dir;

function status() {
  const llmOk = fs.existsSync(llmPath()) && fs.statSync(llmPath()).size > LLM_MIN_BYTES;
  return {
    llm: { ...INFO.llm, installed: llmOk },
    hi: { ...INFO.hi, installed: fs.existsSync(markerPath('hi')) },
  };
}
const installed = (id) => status()[id].installed;

async function downloadFile(url, dest, onProgress) {
  const part = dest + '.part'; let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' }); const total = parseInt(head.headers.get('content-length') || '0', 10);
  if (have && total && have >= total) { fs.renameSync(part, dest); return; }
  const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: 'follow' });
  if (!res.ok && res.status !== 206) throw new Error(`Download failed (${res.status}).`);
  if (res.status === 200) have = 0;                                         // server ignored Range: start over
  const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
  let got = have;
  for await (const chunk of res.body) {
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    got += chunk.length; if (total) onProgress(Math.min(0.99, got / total));
  }
  await new Promise((r) => out.end(r));
  fs.renameSync(part, dest); onProgress(1);
}

const running = new Map();
/** Start (or resume) a download. Resolves when the pack is ready. */
function download(id, onProgress = () => {}) {
  if (running.has(id)) return running.get(id);
  const job = (async () => {
    if (id === 'llm') {                                                   // flaky connections: resume from where it stopped, up to 8 times
      for (let i = 0; ; i++) {
        try { await downloadFile(LLM_URL, llmPath(), onProgress); break; }
        catch (e) { if (i >= 7) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
      }
    }
    else if (id === 'hi') { await offlineTr.install(dir, onProgress); fs.writeFileSync(markerPath('hi'), String(Date.now())); onProgress(1); }
    else throw new Error('Unknown pack: ' + id);
  })().finally(() => running.delete(id));
  running.set(id, job); return job;
}
const isDownloading = (id) => running.has(id);

function remove(id) {
  if (id === 'llm') { fs.rmSync(llmPath(), { force: true }); fs.rmSync(llmPath() + '.part', { force: true }); }
  if (id === 'hi') { fs.rmSync(markerPath('hi'), { force: true }); fs.rmSync(path.join(dir, 'hf'), { recursive: true, force: true }); }
}

module.exports = { init, root, llmPath, status, installed, download, isDownloading, remove, INFO };

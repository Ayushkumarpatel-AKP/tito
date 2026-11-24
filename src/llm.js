// The small built-in language model (Qwen3 0.6B, 4-bit) run by node-llama-cpp on the CPU.
// It reads text that Windows OCR pulled from your selection and explains / summarizes / translates it, fully offline.
const fs = require('fs');

let llama = null, model = null, idleTimer = null;
const IDLE_MS = 4 * 60 * 1000;                          // free the ~0.8 GB of RAM when Tito has been quiet

async function load(modelPath) {
  if (model) return model;
  const { getLlama } = await import('node-llama-cpp');
  llama = llama || await getLlama({ gpu: false });
  model = await llama.loadModel({ modelPath });
  return model;
}
function scheduleUnload() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { try { await model?.dispose(); } catch { /* ignore */ } model = null; }, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

/** turns: [{role:'user'|'assistant', text}] -> reply text */
async function generate(modelPath, { system, turns, maxTokens = 320 }) {
  if (!fs.existsSync(modelPath)) { const e = new Error('The offline AI pack is not installed.'); e.code = 'nopack'; throw e; }
  const { LlamaChatSession } = await import('node-llama-cpp');
  const m = await load(modelPath);
  const context = await m.createContext({ contextSize: 3072 });
  try {
    const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: system });
    // replay earlier turns, then answer the last user message ("/no_think" turns Qwen3's long reasoning off)
    const history = turns.slice(0, -1);
    if (history.length) session.setChatHistory([{ type: 'system', text: system }, ...history.map((t) => (t.role === 'user' ? { type: 'user', text: t.text } : { type: 'model', response: [t.text] }))]);
    const last = turns[turns.length - 1].text;
    const out = await session.prompt(last + ' /no_think', { maxTokens, temperature: 0.4, topP: 0.9 });
    return out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } finally { await context.dispose(); scheduleUnload(); }
}

module.exports = { generate };

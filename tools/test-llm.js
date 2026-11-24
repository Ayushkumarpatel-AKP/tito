// node tools/test-llm.js : runs the built-in offline model on a few typical selections
const path = require('path');
const llm = require('../src/llm');
const model = path.join(process.env.APPDATA, 'tito', 'packs', 'Qwen3-0.6B-Q4_K_M.gguf');
const system = 'You are Tito, a friendly helper. Answer in simple English, in at most four short sentences, in plain text with no markdown headings.';
const jobs = [
  ['explain a word', 'Explain the selected text simply.\n\nSelected text:\n"""serendipity"""'],
  ['explain an error', 'Explain the selected error or code and give the most likely fix.\n\nSelected text:\n"""TypeError: Cannot read properties of undefined (reading \'map\')"""'],
  ['summarize', 'Summarize the selected text in two or three sentences.\n\nSelected text:\n"""The library opens at nine and closes at six on weekdays. Ask the librarian if you cannot find a book. Members can borrow up to five books for two weeks, and late returns cost ten rupees per day."""'],
];
(async () => {
  for (const [label, text] of jobs) {
    const t = Date.now();
    const out = await llm.generate(model, { system, turns: [{ role: 'user', text }] });
    console.log(`\n[${label}] ${((Date.now() - t) / 1000).toFixed(1)}s\n${out}`);
  }
  const t = Date.now();
  const f = await llm.generate(model, { system, turns: [{ role: 'user', text: jobs[0][1] }, { role: 'assistant', text: 'Serendipity means finding something good by chance.' }, { role: 'user', text: 'Give me one example sentence.' }] });
  console.log(`\n[follow-up] ${((Date.now() - t) / 1000).toFixed(1)}s\n${f}`);
  process.exit(0);
})().catch((e) => { console.log('FAILED', e.code || '', e.message); process.exit(1); });

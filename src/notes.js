// Tito Notes: screenshots (read with the offline OCR), copied text and web pages are filed under a topic and arranged into a clean note
// (key terms, a short summary, bullet points by source, sources). Export as Markdown, Word or PDF. The arranging needs no AI and no key.
const fs = require('fs');
const path = require('path');
const kit = require('./textkit');
const { buildDocx } = require('./docx');

let file = null, data = null;
function init(dir) { file = path.join(dir, 'notes.json'); data = null; }
function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = null; }
  if (!data || !Array.isArray(data.topics)) data = { topics: [] };
  return data;
}
const save = () => { try { fs.writeFileSync(file, JSON.stringify(load())); } catch { /* ignore: notes are still in memory */ } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Text read from a screen: line breaks joined, stray symbols and one-word crumbs dropped. */
function cleanOcr(t) {
  const lines = String(t || '').replace(/\r/g, '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length >= 3 && kit.looksReal(l));
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

const topics = () => load().topics;
/** A topic by name (exact, then close), or null. */
function findTopic(name) {
  const n = norm(name); if (!n) return null;
  const ts = topics();
  return ts.find((t) => norm(t.title) === n) || ts.find((t) => norm(t.title).includes(n) || n.includes(norm(t.title))) || ts.map((t) => ({ t, s: kit.overlap(t.title, name) })).filter((x) => x.s >= 0.99).map((x) => x.t)[0] || null;
}
/** Which existing topic does this text belong to? Compared by shared meaningful words. */
function matchTopic(text) {
  let best = null, bestScore = 0; const keys = kit.keywords(text, 10).join(' ');
  for (const t of topics()) {
    const tk = kit.keywords(t.items.map((i) => i.text).join(' ') + ' ' + t.title, 14).join(' ');
    const s = kit.overlap(keys, tk); if (s > bestScore) { best = t; bestScore = s; }
  }
  return bestScore >= 0.3 ? best : null;
}
function guessTitle(text) {
  const first = String(text || '').split(/[.\n]/)[0].trim();
  const heading = first.length >= 4 && first.length <= 60 && first.split(' ').length <= 8 && !/[,;]$/.test(first) ? first : '';
  const ks = kit.keywords(text, 2);
  return kit.titleCase(heading || ks.join(' ') || 'Untitled notes').slice(0, 60);
}

/** Files a piece of text under a topic: the one named, the closest existing one, or a new one. Returns { topic, item, created }. */
function add({ topic, text, kind = 'text', source = '', url = '' }) {
  const body = kind === 'screen' ? cleanOcr(text) : String(text || '').replace(/\s+/g, ' ').trim();
  if (body.length < 8) return null;
  let t = topic ? findTopic(topic) : matchTopic(body), created = false;
  if (!t) { t = { id: uid(), title: topic ? kit.titleCase(String(topic).trim()).slice(0, 60) : guessTitle(body), created: Date.now(), updated: Date.now(), items: [] }; load().topics.unshift(t); created = true; }
  const dup = t.items.find((i) => kit.overlap(i.text, body) > 0.9 && Math.abs(i.text.length - body.length) < 40);
  if (dup) return { topic: t, item: dup, created: false, duplicate: true };
  const item = { id: uid(), ts: Date.now(), kind, text: body.slice(0, 12000), source: String(source || '').slice(0, 120), url: String(url || '').slice(0, 300) };
  t.items.push(item); t.updated = Date.now(); save();
  return { topic: t, item, created };
}
function remove(name) { const t = findTopic(name); if (!t) return null; load().topics = topics().filter((x) => x !== t); save(); return t; }

// ---- arranging ---------------------------------------------------------------------------------------
const KIND_LABEL = { screen: 'Screenshot', clipboard: 'Copied text', text: 'Note', web: 'Web', pdf: 'PDF' };
/** The structure of a note: { title, terms, summary, sections: [{ heading, bullets, url }], sources } */
const usable = (s) => s.length >= 25 && s.length <= 300 && !/[→=]/.test(s) && (s.match(/[A-Za-zऀ-ॿ ,.'-]/g) || []).length / s.length > 0.9;
function compose(t) {
  const all = t.items.map((i) => i.text).join('\n');
  const seen = [];
  const fresh = (s) => { if (seen.some((x) => kit.overlap(x, s) > 0.8)) return false; seen.push(s); return true; };
  const sections = [];
  let shot = 0;
  for (const it of t.items) {
    const label = it.kind === 'screen' ? `Screenshot ${++shot}` : it.source || KIND_LABEL[it.kind] || 'Note';
    const ss = kit.sentences(it.text).filter(usable);
    const chosen = it.kind === 'web' ? kit.summarize(ss.join(' '), 3) : ss.length ? ss.slice(0, 14) : [it.text.slice(0, 300)];   // web pages are long: keep the 3 most informative lines
    const picks = chosen.filter(fresh);
    if (picks.length) sections.push({ heading: label, bullets: picks, url: it.url || '', when: it.ts });
  }
  const sources = [...new Map(t.items.filter((i) => i.url).map((i) => [i.url, { title: i.source || i.url, url: i.url }])).values()];
  const clean = t.items.flatMap((i) => kit.sentences(i.text).filter(usable)).join(' ');
  return { title: t.title, terms: kit.keywords(all, 8).map(kit.titleCase), summary: kit.summarize(clean || all, 3), sections: sections.slice(0, 14), sources, count: t.items.length, updated: t.updated };
}

function toMarkdown(t) {
  const n = compose(t); const out = [`# ${n.title}`, '', `_${n.count} item${n.count === 1 ? '' : 's'} - updated ${new Date(n.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}_`, ''];
  if (n.terms.length) out.push('**Key terms:** ' + n.terms.join(', '), '');
  if (n.summary.length) out.push('## Summary', '', ...n.summary.map((s) => `- ${s}`), '');
  if (n.sections.length) { out.push('## Notes', ''); for (const s of n.sections) { out.push(`### ${s.heading}`, '', ...s.bullets.map((b) => `- ${b}`), ''); } }
  if (n.sources.length) out.push('## Sources', '', ...n.sources.map((s) => `- [${s.title}](${s.url})`), '');
  return out.join('\n').trim() + '\n';
}
function toBlocks(t) {
  const n = compose(t); const b = [{ t: 'title', text: n.title }, { t: 'quote', text: `${n.count} item${n.count === 1 ? '' : 's'} - ${new Date(n.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` }];
  if (n.terms.length) b.push({ t: 'p', text: '**Key terms:** ' + n.terms.join(', ') });
  if (n.summary.length) { b.push({ t: 'h1', text: 'Summary' }); n.summary.forEach((s) => b.push({ t: 'bullet', text: s })); }
  if (n.sections.length) { b.push({ t: 'h1', text: 'Notes' }); for (const s of n.sections) { b.push({ t: 'h2', text: s.heading }); s.bullets.forEach((x) => b.push({ t: 'bullet', text: x })); } }
  if (n.sources.length) { b.push({ t: 'h1', text: 'Sources' }); n.sources.forEach((s) => b.push({ t: 'bullet', text: `${s.title} - ${s.url}` })); }
  return b;
}
const toDocx = (t) => buildDocx(toBlocks(t));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function toHtml(t) {
  const n = compose(t);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:13px/1.55 "Segoe UI",Calibri,Arial,sans-serif;color:#2b2a3a;margin:0}h1{font-size:26px;color:#4a3fa8;margin:0 0 4px}h2{font-size:17px;color:#4a3fa8;margin:22px 0 6px;border-bottom:2px solid #e6e3f7;padding-bottom:3px}h3{font-size:14px;margin:14px 0 4px}
.meta{color:#77758a;font-size:11.5px;margin-bottom:10px}.terms span{display:inline-block;background:#edebfa;color:#4a3fa8;border-radius:999px;padding:2px 10px;margin:2px 4px 2px 0;font-weight:600;font-size:12px}
ul{margin:4px 0 8px 18px;padding:0}li{margin:3px 0}a{color:#4a3fa8;word-break:break-all}.foot{margin-top:28px;color:#99a;font-size:11px;border-top:1px solid #eee;padding-top:6px}</style></head><body>
<h1>${esc(n.title)}</h1><div class="meta">${n.count} item${n.count === 1 ? '' : 's'} &middot; ${esc(new Date(n.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
${n.terms.length ? `<div class="terms">${n.terms.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
${n.summary.length ? `<h2>Summary</h2><ul>${n.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
${n.sections.length ? `<h2>Notes</h2>${n.sections.map((s) => `<h3>${esc(s.heading)}</h3><ul>${s.bullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}` : ''}
${n.sources.length ? `<h2>Sources</h2><ul>${n.sources.map((s) => `<li>${esc(s.title)} - <a href="${esc(s.url)}">${esc(s.url)}</a></li>`).join('')}</ul>` : ''}
<div class="foot">Made with Tito</div></body></html>`;
}

/** Writes the note into `dir` as the given formats ('md', 'docx', 'pdf'). pdfRender(html) -> Promise<Buffer>. Returns { md, docx, pdf } paths. */
async function exportNote(t, dir, formats, pdfRender) {
  fs.mkdirSync(dir, { recursive: true }); const base = String(t.title).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'notes'; const out = {};
  if (formats.includes('md')) { out.md = path.join(dir, base + '.md'); fs.writeFileSync(out.md, toMarkdown(t), 'utf8'); }
  if (formats.includes('docx')) { out.docx = path.join(dir, base + '.docx'); fs.writeFileSync(out.docx, toDocx(t)); }
  if (formats.includes('pdf') && pdfRender) { out.pdf = path.join(dir, base + '.pdf'); fs.writeFileSync(out.pdf, await pdfRender(toHtml(t))); }
  return out;
}

module.exports = { init, topics, findTopic, add, remove, compose, toMarkdown, toDocx, toHtml, exportNote, cleanOcr, guessTitle, matchTopic };

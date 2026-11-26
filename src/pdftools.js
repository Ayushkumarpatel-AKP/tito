// PDF commands: read the text of a PDF, find its chapters, pull out definitions, summarise pages, and merge or split files.
// Reading uses pdf.js, merging and splitting use pdf-lib. Everything runs on this computer, no key needed.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const kit = require('./textkit');

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  let file = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'legacy', 'build', 'pdf.mjs');
  file = file.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');          // a packaged app keeps pdf.js outside the archive (see asarUnpack)
  pdfjs = await import(pathToFileURL(file).href);
  return pdfjs;
}

const cache = new Map();
/** { numPages, pages: [text per page], outline: [{ title, page }] } for a PDF file. */
async function read(file) {
  const st = fs.statSync(file); const key = file + '|' + st.mtimeMs + '|' + st.size; if (cache.has(key)) return cache.get(key);
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), tc = await page.getTextContent(); let out = '', lastY = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform ? it.transform[5] : 0, h = it.height || 10;
        if (lastY !== null && Math.abs(y - lastY) > h * 0.6 && !out.endsWith('\n')) out += '\n';
        out += it.str; if (it.hasEOL) out += '\n'; lastY = y;
      }
      pages.push(kit.clean(out)); page.cleanup();
    }
    const outline = [];
    try {
      const ol = await doc.getOutline();
      for (const o of ol || []) {
        let dest = o.dest; if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0] && typeof dest[0] === 'object') { const idx = await doc.getPageIndex(dest[0]); outline.push({ title: String(o.title || '').trim(), page: idx + 1 }); }
        else if (Number.isInteger(dest && dest[0])) outline.push({ title: String(o.title || '').trim(), page: dest[0] + 1 });
      }
    } catch { /* no usable bookmarks */ }
    const info = { numPages: doc.numPages, pages, outline: outline.filter((o) => o.title && o.page >= 1) };
    cache.set(key, info); if (cache.size > 6) cache.delete(cache.keys().next().value);
    return info;
  } finally { try { await doc.destroy(); } catch { /* ignore */ } }
}

// ---- chapters -----------------------------------------------------------------------------------
const HEAD = /^(chapter|unit|module|lesson|topic|section|part|ch\.?)\s*([0-9]{1,3}|[ivxl]{1,6})\b[\s:.–—-]*(.{0,80})$/i;
const NUMBERED = /^(\d{1,2})[.)]?\s+([A-Z][A-Za-z0-9 ,&'/-]{3,60})$/;
const tidyTitle = (s) => String(s).replace(/\s+/g, ' ').replace(/[.\s]+\d+$/, '').trim();

/** Chapters as [{ n, title, from, to }] with page numbers: bookmarks first, then "Chapter 3" style headings, else even blocks of pages. */
function chapters(info) {
  const total = info.numPages;
  const fromStarts = (starts) => starts.map((s, i) => ({ n: i + 1, title: s.title, from: s.page, to: i + 1 < starts.length ? Math.max(s.page, starts[i + 1].page - 1) : total }));
  const ol = (info.outline || []).filter((o) => o.page >= 1 && o.page <= total);
  const dedupe = (arr) => { const seen = new Set(); return arr.filter((s) => { if (seen.has(s.page)) return false; seen.add(s.page); return true; }).sort((a, b) => a.page - b.page); };
  const o2 = dedupe(ol); if (o2.length >= 2 && o2.length <= 60) return fromStarts(o2);
  const found = [];
  info.pages.forEach((txt, i) => {
    const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
    for (const l of lines) { const m = l.match(HEAD); if (m && l.length < 90) { found.push({ title: tidyTitle(`${titleOf(m[1])} ${m[2]}${m[3] ? ': ' + m[3] : ''}`), page: i + 1 }); break; } }
  });
  const f2 = dedupe(found); if (f2.length >= 2) { if (f2[0].page > 1) f2[0] = { ...f2[0], page: 1 }; return fromStarts(f2); }
  const numbered = [];
  info.pages.forEach((txt, i) => { const l = txt.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3); for (const ln of l) { const m = ln.match(NUMBERED); if (m) { numbered.push({ k: +m[1], title: `${m[1]}. ${tidyTitle(m[2])}`, page: i + 1 }); break; } } });
  const seq = []; for (const x of dedupe(numbered)) if (!seq.length || x.k > seq[seq.length - 1].k) seq.push(x);
  if (seq.length >= 3) { if (seq[0].page > 1) seq[0] = { ...seq[0], page: 1 }; return fromStarts(seq); }
  if (total <= 3) return [{ n: 1, title: 'Whole document', from: 1, to: total }];
  const blocks = Math.min(10, Math.max(2, Math.round(total / 12))), size = Math.ceil(total / blocks), out = [];
  for (let s = 1, i = 1; s <= total; s += size, i++) out.push({ n: i, title: `Part ${i} (pages ${s}-${Math.min(total, s + size - 1)})`, from: s, to: Math.min(total, s + size - 1) });
  return out;
}
const titleOf = (w) => w[0].toUpperCase() + w.slice(1).toLowerCase().replace(/\.$/, '');

const textOf = (info, from, to) => info.pages.slice(Math.max(1, from) - 1, Math.min(info.numPages, to)).join('\n');

/** "5-9", "5 to 9", "2, 5, 8-10" -> sorted unique page numbers inside the document. */
function parsePages(spec, total) {
  const set = new Set(); const t = String(spec || '').toLowerCase();
  for (const m of t.matchAll(/(\d+)\s*(?:-|to|se|till|tak|through|–)\s*(\d+)/g)) { let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]; for (let p = a; p <= b && p <= total; p++) if (p >= 1) set.add(p); }
  const rest = t.replace(/(\d+)\s*(?:-|to|se|till|tak|through|–)\s*(\d+)/g, ' ');
  for (const m of rest.matchAll(/\b(\d+)\b/g)) { const p = +m[1]; if (p >= 1 && p <= total) set.add(p); }
  return [...set].sort((a, b) => a - b);
}

// ---- files: merge and split ---------------------------------------------------------------------
async function merge(files, outFile) {
  const { PDFDocument } = require('pdf-lib'); const out = await PDFDocument.create(); let count = 0;
  for (const f of files) {
    const src = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
    for (const p of await out.copyPages(src, src.getPageIndices())) { out.addPage(p); count++; }
  }
  fs.writeFileSync(outFile, await out.save()); return { pages: count };
}
async function split(file, pages, outFile) {
  const { PDFDocument } = require('pdf-lib'); const src = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
  const idx = pages.filter((p) => p >= 1 && p <= src.getPageCount()).map((p) => p - 1); if (!idx.length) throw new Error('Those pages are not in the PDF.');
  const out = await PDFDocument.create(); for (const p of await out.copyPages(src, idx)) out.addPage(p);
  fs.writeFileSync(outFile, await out.save()); return { pages: idx.length };
}

/** Loads pdf.js and pdf-lib and opens a blank page, so the first real PDF does not wait ~4 seconds. Called quietly a little after start-up. */
async function warm() {
  const lib = await loadPdfjs(); const { PDFDocument } = require('pdf-lib');
  const d = await PDFDocument.create(); d.addPage();
  const doc = await lib.getDocument({ data: new Uint8Array(await d.save()), verbosity: 0 }).promise; const pg = await doc.getPage(1); await pg.getTextContent(); await doc.destroy();
}

module.exports = { warm, read, chapters, textOf, parsePages, merge, split };

// Reads the files you attach to a chat: Excel (.xlsx), CSV / TSV, Word (.docx), plain text and code. No extra package, no key.
const fs = require('fs');
const path = require('path');
const { readZip } = require('./zip');

const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref); if (!m) return 0; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/** Sheets of an .xlsx: [{ name, rows: [[cell]] }] (numbers stay numbers, formulas give their saved value). */
function readXlsx(file) {
  const z = readZip(fs.readFileSync(file)); const get = (n) => (z.has(n) ? z.get(n)().toString('utf8') : '');
  const shared = []; for (const m of get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const rels = {}; for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]); if (id && t) rels[id[1]] = t[1].replace(/^\/?(xl\/)?/, 'xl/'); }
  const sheets = [];
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]+)"/.exec(m[0]); if (!name || !rid || !rels[rid[1]]) continue;
    const xml = get(rels[rid[1]]); const rows = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(cm[1]), type = (/t="([^"]+)"/.exec(cm[1]) || [])[1], body = cm[2] || ''; if (!ref) continue;
        const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1]; let val = '';
        if (type === 's') val = shared[+v] || ''; else if (type === 'inlineStr') val = unesc([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (type === 'str' || type === 'e') val = unesc(v || ''); else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE'; else if (v !== undefined && v !== '') val = Number.isFinite(+v) ? +v : v;
        row[colIndex(ref[1])] = val;
      }
      rows.push(Array.from(row, (x) => (x === undefined ? '' : x)));
    }
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    sheets.push({ name: unesc(name[1]), rows });
  }
  return sheets;
}

/** Text of a .docx: paragraphs on their own lines. */
function readDocx(file) {
  const z = readZip(fs.readFileSync(file)); if (!z.has('word/document.xml')) throw new Error('Not a Word file');
  return unesc(z.get('word/document.xml')().toString('utf8').replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const TEXT = new Set(['.txt', '.md', '.markdown', '.log', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.sql', '.yml', '.yaml', '.ini', '.rtf', '.tex']);
/** What kind of file is this: pdf | image | sheet | csv | doc | text | other */
function kindOf(file) {
  const e = path.extname(file).toLowerCase();
  if (e === '.pdf') return 'pdf'; if (IMAGE.has(e)) return 'image'; if (e === '.xlsx' || e === '.xlsm') return 'sheet'; if (e === '.csv' || e === '.tsv') return 'csv'; if (e === '.docx') return 'doc'; if (TEXT.has(e)) return 'text';
  return 'other';
}
const mimeOf = (file) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif' }[path.extname(file).toLowerCase()] || 'image/png');
const readText = (file, max = 400000) => { const b = fs.readFileSync(file); return b.slice(0, max).toString('utf8').replace(/^﻿/, ''); };

module.exports = { readXlsx, readDocx, readText, kindOf, mimeOf };

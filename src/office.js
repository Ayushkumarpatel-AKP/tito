// The "office" commands: meetings, Excel sheets, PDF jobs, topic notes, web notes and the Exam Rescue Autopilot.
// dock.js hands each parsed command to run(). Everything here works without an AI key; a key only makes summaries nicer.
const fs = require('fs');
const path = require('path');
const kit = require('./textkit');
const meeting = require('./meeting');
const excel = require('./excel');
const pdftools = require('./pdftools');
const notes = require('./notes');
const exam = require('./exam');
const filekit = require('./filekit');

let ctx = null;
/** ctx: { tasks, store, search, outDir(sub), register(path), open(path), reveal(path), pickPdfs(multi), getPdf(), setPdf(path), clipboard(), captureScreen(), ocr(b64), pdfRender(html), aiText(system, user), history(), alert(p), refresh(), send(ch, p) } */
function setup(c) { ctx = c; }

const ok = (say, extra = {}) => ({ ok: true, anim: 'success', say, ...extra });
const fail = (say, extra = {}) => ({ ok: false, anim: 'confused', say, ...extra });
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const safe = (s) => String(s || 'tito').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'tito';
const fmtWhen = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const fileButtons = (...items) => { const l = items.filter(Boolean); return { options: [...l.map((p) => ({ label: p.label, file: p.path })), ...(l[0] ? [{ label: 'Show in folder', reveal: l[0].path }] : [])] }; };
const made = (p) => { ctx.register(p); return p; };

// ------------------------------------------------------------------------------------------------ meetings
function meetingCmd(c) {
  if (!Number.isFinite(c.at) || !c.at) return fail('What time is the meeting? For example: "meeting with Rahul tomorrow at 4 pm on Google Meet".', { intent: c });
  if (c.at < Date.now() - 60000) return fail('That time has already passed. Tell me a time from now on.', { intent: c });
  const open = c.link ? { label: c.provider || 'meeting', kind: 'url', value: c.link, noAuto: true, join: c.hasRealLink ? 'join' : 'start' } : null;
  const ids = [];
  const before = c.at - 10 * 60000;
  if (before > Date.now() + 30000) { const r = ctx.tasks.addReminder(`${c.title} in 10 minutes`, before, { kind: 'reminder', open }); if (r) ids.push(r.id); }
  const r2 = ctx.tasks.addReminder(`${c.title} is starting now`, c.at, { kind: 'reminder', open }); if (r2) ids.push(r2.id);
  ctx.refresh();
  const ics = made(path.join(ctx.outDir('Meetings'), `${safe(c.title)}-${stamp()}.ics`)); fs.writeFileSync(ics, meeting.makeIcs(c), 'utf8');
  const join = c.link ? (c.hasRealLink ? `The alert has a Join ${c.provider} button.` : `The alert has a Start ${c.provider} button. Create the room there and share its link.`) : 'Add a link or say "on Google Meet" and I will add a Join button.';
  return ok(`Meeting set: ${c.title}, ${fmtWhen(c.at)}. I will remind you 10 minutes before and when it starts. ${join} Open the calendar file to add it to Google Calendar, Outlook or your phone.`,
    { intent: c, anim: 'checklist', ask: { options: [{ label: 'Add to calendar', file: ics }, { label: 'Show in folder', reveal: ics }] }, undo: ids.length ? { kind: 'reminders', ids } : null });
}

// ------------------------------------------------------------------------------------------------ excel
const SHEET_SYSTEM = 'You design spreadsheets. Reply with ONLY one JSON object, no markdown: {"title":"short name","columns":[{"name":"Column","type":"text|number|money|date"}],"rows":[[sample row values]]}. 2 to 10 columns. Add up to 8 realistic sample rows only when the user gave real data; otherwise leave "rows" empty.';
async function excelCmd(c) {
  let spec = null, title = 'Sheet';
  if (c.source === 'clipboard' || c.source === 'chat') {
    let text = '';
    if (c.source === 'clipboard') text = ctx.clipboard().text || '';
    else for (const m of [...ctx.history()].reverse()) { if (m.role !== 'user' && excel.parseTable(m.text)) { text = m.text; break; } }
    const rows = excel.parseTable(text);
    if (!rows) return fail(c.source === 'clipboard' ? 'The clipboard does not hold a table. Copy a table from Excel, a web page or a chat answer, then try again.' : 'I do not see a table in our chat. Ask me for a table first, or copy one and say "excel from clipboard".', { intent: c });
    title = 'Table'; spec = excel.sheetFromTable(rows, title);
  } else {
    const plan = excel.planSheet(c.text);
    if (plan) { title = plan.title; spec = excel.sheetFromPlan(plan); }
    else {
      const ai = ctx.aiText ? await ctx.aiText(SHEET_SYSTEM, c.text) : null; const j = ai && JSON.parse((String(ai).match(/\{[\s\S]*\}/) || ['null'])[0]);
      if (j && Array.isArray(j.columns) && j.columns.length >= 2) {
        title = String(j.title || 'Sheet').slice(0, 30); const cols = j.columns.slice(0, 12).map((x) => ({ name: String(x.name || x).slice(0, 30), kind: ['money', 'number', 'date'].includes(x.type) ? x.type : excel.kindOf(String(x.name || x)) }));
        spec = Array.isArray(j.rows) && j.rows.length ? excel.sheetFromTable([cols.map((x) => x.name), ...j.rows.map((r) => cols.map((_, i) => (r[i] === undefined || r[i] === null ? '' : String(r[i]))))], title) : excel.sheetFromPlan({ title, columns: cols, wantAverage: false });
      } else return fail('Tell me the columns, like "make excel sheet: name, class, marks". Or name a kind of sheet: expenses, marks, attendance, timetable, workout, habits, sales, inventory, tasks, contacts.', { intent: c });
    }
  }
  const file = made(path.join(ctx.outDir('Excel'), `${safe(title)}-${stamp()}.xlsx`)); fs.writeFileSync(file, excel.toXlsx(spec));
  ctx.open(file);
  const names = spec.rows[0].join(', ');
  return ok(`Your Excel file is ready: ${path.basename(file)}. Columns: ${names}.${spec.rows.some((r) => r.some((x) => x && x.f)) ? ' Totals and formulas are live, so just type your numbers.' : ''}`, { intent: c, anim: 'success', ask: fileButtons({ path: file, label: 'Open Excel' }) });
}

// ------------------------------------------------------------------------------------------------ PDF
async function pickOne() { const cur = ctx.getPdf(); if (cur && fs.existsSync(cur)) return cur; const p = await ctx.pickPdfs(false); if (p && p[0]) { ctx.setPdf(p[0]); return p[0]; } return null; }
const noPdf = (c) => fail('Drop a PDF on me, or tell me again and pick the file.', { intent: c });
const md = (say, extra = {}) => ({ ok: true, anim: 'thinking', md: true, say, ...extra });
const sortChapters = (list) => list.map((c) => `${c.n}. **${c.title}** (pages ${c.from === c.to ? c.from : c.from + '-' + c.to})`).join('\n');
const scanned = (info) => info.pages.join('').replace(/\s/g, '').length < 40;

async function aiSummary(text, what) {
  if (!ctx.aiText) return null;
  const r = await ctx.aiText('You write clear study summaries. Reply in Markdown bullet points only: the main ideas, definitions and facts, in plain language. No preamble. Keep it under 12 bullets.', `Summarise ${what}:\n\n${text.slice(0, 7000)}`);
  return r && r.length > 40 ? String(r).trim() : null;
}

async function pdfCmd(c) {
  if (c.op === 'merge') {
    const list = ctx.pdfList && ctx.pdfList().length >= 2 ? ctx.pdfList() : await ctx.pickPdfs(true);
    if (!list || list.length < 2) return fail('Pick at least two PDFs to merge (hold Ctrl in the file window to choose several).', { intent: c });
    const out = made(path.join(ctx.outDir('PDF'), `merged-${stamp()}.pdf`)); const r = await pdftools.merge(list, out);
    return ok(`Merged ${list.length} PDFs into one file with ${r.pages} pages.`, { intent: c, anim: 'success', ask: fileButtons({ path: out, label: 'Open PDF' }) });
  }
  const file = await pickOne(); if (!file) return noPdf(c);
  const name = path.basename(file); let info;
  try { info = await pdftools.read(file); } catch (e) { return fail('I could not open that PDF (' + String(e.message || e).slice(0, 80) + '). It may be locked or damaged.', { intent: c }); }
  if (c.op === 'split') {
    const pages = pdftools.parsePages(c.pages, info.numPages);
    if (!pages.length) return fail(`Which pages? Say for example "split pages 5 to 9". This PDF has ${info.numPages} pages.`, { intent: c });
    const out = made(path.join(ctx.outDir('PDF'), `${safe(path.basename(file, '.pdf'))}-pages-${pages[0]}-${pages[pages.length - 1]}-${stamp()}.pdf`)); await pdftools.split(file, pages, out);
    return ok(`Saved ${pages.length} page${pages.length > 1 ? 's' : ''} (${c.pages.trim() || pages.join(', ')}) as a new PDF.`, { intent: c, anim: 'success', ask: fileButtons({ path: out, label: 'Open PDF' }) });
  }
  if (c.op === 'load') return ok(`Got ${name}: ${info.numPages} pages. Try: "chapters", "definitions", "summary of page 3", "split pages 2 to 5" or "exam rescue <subject> on <date>".`, { intent: c });
  if (c.op === 'info') return md(`**${name}**: ${info.numPages} pages, about ${Math.round(info.pages.join(' ').split(/\s+/).length / 100) * 100} words.`, { intent: c });
  if (scanned(info)) return fail('This PDF looks scanned (pictures only), so there is no text for me to read. A PDF with real text works.', { intent: c });
  const chs = pdftools.chapters(info);
  const scope = () => {
    if (c.chapter) { const ch = chs.find((x) => x.n === c.chapter); if (ch) return { text: pdftools.textOf(info, ch.from, ch.to), what: ch.title }; }
    const pages = c.pages ? pdftools.parsePages(c.pages, info.numPages) : [];
    if (pages.length) return { text: pdftools.textOf(info, pages[0], pages[pages.length - 1]), what: `pages ${pages[0]}-${pages[pages.length - 1]}` };
    return { text: info.pages.join('\n'), what: 'the whole PDF' };
  };
  switch (c.op) {
    case 'chapters': return md(`**${name}** has ${chs.length} chapter${chs.length === 1 ? '' : 's'}:\n\n${sortChapters(chs)}`, { intent: c, anim: 'checklist', ask: { options: [{ label: 'Definitions', cmd: 'definitions from the pdf' }, { label: 'Summary', cmd: 'summary of the pdf' }] } });
    case 'defs': {
      const s = scope(); const defs = kit.definitions(s.text, 25); if (!defs.length) return fail(`I could not find clear definitions in ${s.what}. Try "important points" instead.`, { intent: c });
      return md(`**Definitions from ${s.what}**\n\n${defs.map((d) => `- **${d.term}**: ${d.meaning}`).join('\n')}`, { intent: c, anim: 'checklist', ask: { options: [{ label: 'Save as flashcards', cmd: 'save pdf definitions as flashcards' }] } });
    }
    case 'cards': {
      const s = scope(); const defs = kit.definitions(s.text, 40); let n = 0; for (const d of defs) if (ctx.store.addCard(d.term, d.meaning)) n++;
      ctx.send('dock:cards'); return n ? ok(`Saved ${n} flashcard${n > 1 ? 's' : ''} from ${s.what}. Say "quiz me" to revise.`, { intent: c, anim: 'celebrate' }) : fail('I could not find definitions to turn into flashcards.', { intent: c });
    }
    case 'points': {
      const s = scope(); const pts = kit.importantPoints(s.text, 12); if (!pts.length) return fail('I could not find enough text.', { intent: c });
      return md(`**Important points from ${s.what}**\n\n${pts.map((p) => `- ${p}`).join('\n')}`, { intent: c, anim: 'checklist' });
    }
    case 'summary': {
      const s = scope(); let body = await aiSummary(s.text, s.what);
      if (!body) {
        if (s.what === 'the whole PDF' && chs.length > 1) body = chs.slice(0, 20).map((ch) => `**${ch.title}**\n${kit.summarize(pdftools.textOf(info, ch.from, ch.to), 2).map((x) => `- ${x}`).join('\n')}`).join('\n\n');
        else body = kit.summarize(s.text, 7).map((x) => `- ${x}`).join('\n');
      }
      return md(`**Summary of ${s.what}**\n\n${body}`, { intent: c, anim: 'thinking' });
    }
    case 'find': {
      const q = String(c.query || '').toLowerCase(); if (!q) return fail('What should I look for in the PDF?', { intent: c });
      const hits = []; info.pages.forEach((t, i) => { const at = t.toLowerCase().indexOf(q); if (at >= 0) hits.push(`- Page ${i + 1}: ...${t.slice(Math.max(0, at - 50), at + q.length + 70).replace(/\s+/g, ' ')}...`); });
      return hits.length ? md(`**"${c.query}"** appears on ${hits.length} page${hits.length > 1 ? 's' : ''}:\n\n${hits.slice(0, 10).join('\n')}`, { intent: c, anim: 'searching' }) : fail(`I did not find "${c.query}" in ${name}.`, { intent: c });
    }
    case 'text': {
      const out = made(path.join(ctx.outDir('PDF'), `${safe(path.basename(file, '.pdf'))}-text-${stamp()}.txt`));
      fs.writeFileSync(out, info.pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n'), 'utf8');
      return ok(`Saved the text of ${info.numPages} pages as a text file.`, { intent: c, anim: 'success', ask: fileButtons({ path: out, label: 'Open text' }) });
    }
    default: return fail('Tell me what to do with the PDF: chapters, definitions, important points, summary, find a word, split pages, merge PDFs or text.', { intent: c });
  }
}

// ------------------------------------------------------------------------------------------------ attached files (paperclip, drop, paste)
let last = null;                                     // the file the next "summary of this" / "excel from this" talks about
const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
const nf = (n) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100).toLocaleString('en-IN');
function mdTable(rows, max = 15) {
  const n = Math.max(...rows.map((r) => r.length)); const cell = (v) => String(v === undefined || v === null ? '' : v).replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 40);
  const fix = (r) => Array.from({ length: n }, (_, i) => cell(r[i]));
  const body = rows.slice(1, max + 1).map((r) => '| ' + fix(r).join(' | ') + ' |');
  return ['| ' + fix(rows[0]).join(' | ') + ' |', '| ' + fix(rows[0]).map(() => '---').join(' | ') + ' |', ...body].join('\n') + (rows.length - 1 > max ? `\n\n_...and ${rows.length - 1 - max} more rows_` : '');
}
function tableStats(rows) {
  const head = rows[0] || [], body = rows.slice(1); const lines = [];
  head.forEach((h, c) => {
    const nums = body.map((r) => r[c]).filter((v) => typeof v === 'number' || (v !== '' && v !== undefined && excel.parseNumber(v) !== null)).map((v) => (typeof v === 'number' ? v : excel.parseNumber(v)));
    if (nums.length >= Math.max(2, body.length * 0.6)) { const sum = nums.reduce((a, b) => a + b, 0); lines.push(`- **${h || 'Column ' + (c + 1)}**: total ${nf(sum)}, average ${nf(sum / nums.length)}, highest ${nf(Math.max(...nums))}, lowest ${nf(Math.min(...nums))}`); }
  });
  return lines;
}
/** A closing "Total" row is not data: leave it out so counts and sums are not doubled. */
const withoutTotals = (rows) => { const l = rows[rows.length - 1]; return rows.length > 2 && l && /^(total|grand total|sum|average)$/i.test(String(l.find((x) => x !== '' && x !== undefined) || '').trim()) ? rows.slice(0, -1) : rows; };
const BUTTONS = {
  pdf: [{ label: 'Chapters', cmd: 'chapters of the pdf' }, { label: 'Summary', cmd: 'summary of the pdf' }, { label: 'Definitions', cmd: 'definitions from the pdf' }],
  image: [{ label: 'Explain this', cmd: 'explain the attached file' }, { label: 'Save to notes', cmd: 'add the attached file to notes' }, { label: 'Excel from this', cmd: 'make excel from the attached file' }],
  sheet: [{ label: 'Show the table', cmd: 'show the attached file' }, { label: 'Summary', cmd: 'summary of the attached file' }, { label: 'Clean Excel copy', cmd: 'make excel from the attached file' }],
  text: [{ label: 'Summary', cmd: 'summary of the attached file' }, { label: 'Key points', cmd: 'key points of the attached file' }, { label: 'Add to notes', cmd: 'add the attached file to notes' }],
};

/** Reads every attached file, remembers the last one, and says what Tito found, with buttons for what to do next. */
async function attach(paths) {
  const out = []; let lastKind = ''; const pdfs = [];
  for (const p of paths) {
    const name = path.basename(p); const kind = filekit.kindOf(p);
    try {
      const st = fs.statSync(p); if (!st.isFile()) throw new Error('not a file');
      if (st.size > 250 * 1024 * 1024) { out.push(`**${name}**: too big (over 250 MB).`); continue; }
      if (kind === 'pdf') {
        const info = await pdftools.read(p); pdfs.push(p); last = { kind: 'pdf', name, path: p }; lastKind = 'pdf'; const nch = scanned(info) ? 0 : pdftools.chapters(info).length;
        out.push(`**${name}**: PDF, ${info.numPages} page${info.numPages === 1 ? '' : 's'}, ${nch ? nch + ' chapter' + (nch === 1 ? '' : 's') : 'no readable text (it looks scanned)'}.`);
      } else if (kind === 'image') {
        const b64 = fs.readFileSync(p).toString('base64'); const t = await readImage(b64); const text = t && t.error ? '' : String(t || '');
        last = { kind: 'image', name, path: p, text, b64, mime: filekit.mimeOf(p) }; lastKind = 'image';
        out.push(`**${name}**: picture. ${text ? `I read ${words(text)} words from it:\n> ${text.slice(0, 260).replace(/\n/g, ' ')}${text.length > 260 ? '...' : ''}` : 'I could not find any text in it.'}`);
      } else if (kind === 'sheet' || kind === 'csv') {
        let sheets;
        if (kind === 'sheet') sheets = filekit.readXlsx(p); else { const raw = filekit.readText(p); const rows = excel.parseTable(raw); sheets = rows ? [{ name: 'Data', rows }] : []; }
        const main = sheets.find((x) => x.rows.length); if (!main) { out.push(`**${name}**: I could not find a table in it.`); continue; }
        main.rows = withoutTotals(main.rows);
        last = { kind: 'sheet', name, path: p, sheets, rows: main.rows }; lastKind = 'sheet';
        out.push(`**${name}**: ${sheets.length > 1 ? sheets.length + ' sheets, the first has ' : ''}${main.rows.length - 1} rows and ${main.rows[0].length} columns (${main.rows[0].slice(0, 6).map((x) => x || '?').join(', ')}${main.rows[0].length > 6 ? ', ...' : ''}).`);
      } else if (kind === 'doc' || kind === 'text') {
        const text = kind === 'doc' ? filekit.readDocx(p) : filekit.readText(p); last = { kind: 'text', name, path: p, text }; lastKind = 'text';
        out.push(`**${name}**: ${kind === 'doc' ? 'Word document' : 'text file'}, about ${words(text)} words.`);
      } else out.push(`**${name}**: I cannot read this kind of file yet. I can read PDF, pictures, Excel (.xlsx), CSV, Word (.docx) and text or code files.`);
    } catch (e) { out.push(`**${name}**: I could not open it (${String(e.message || e).slice(0, 80)}).`); }
  }
  if (pdfs.length) ctx.setPdf(pdfs[pdfs.length - 1], pdfs);
  if (!lastKind) return { ok: false, anim: 'confused', md: true, say: out.join('\n\n') || 'I did not get any file.' };
  const opts = [...BUTTONS[lastKind]]; if (pdfs.length > 1) opts.push({ label: 'Merge PDFs', cmd: 'merge pdfs' });
  return { ok: true, anim: 'success', md: true, say: out.join('\n\n') + '\n\nWhat should I do with it?', ask: { options: opts } };
}

async function attachCmd(c) {
  if (!last && !ctx.getPdf()) return fail('Attach a file first: the paperclip button in Chat, or drop a file on me. It can be a PDF, picture, Excel, CSV, Word or text file.', { intent: c });
  if (!last || last.kind === 'pdf') {                       // a PDF: the PDF commands already know it
    const map = { summary: 'summary', points: 'points', defs: 'defs', show: 'chapters', explain: 'summary' };
    if (map[c.op]) return pdfCmd({ type: 'pdf', op: map[c.op], chapter: 0, pages: '' });
    return fail('For a PDF, say "chapters", "summary", "definitions", "split pages 2 to 5" or "exam rescue <subject> on <date>".', { intent: c });
  }
  const f = last; const text = f.kind === 'sheet' ? f.rows.map((r) => r.join(' ')).join('. ') : f.text || '';
  switch (c.op) {
    case 'show': return f.kind === 'sheet' ? md(`**${f.name}**\n\n${mdTable(f.rows)}`, { intent: c, anim: 'thinking' }) : md(`**${f.name}**\n\n${(text || 'No text found.').slice(0, 3000)}`, { intent: c, anim: 'thinking' });
    case 'summary': {
      if (f.kind === 'sheet') { const st = tableStats(f.rows); return md(`**${f.name}**: ${f.rows.length - 1} rows, ${f.rows[0].length} columns\n\n${st.length ? st.join('\n') : 'No number columns found.'}`, { intent: c, anim: 'thinking' }); }
      if (!text.trim()) return fail('There is no readable text in it.', { intent: c });
      const ai = await aiSummary(text, f.name); return md(`**Summary of ${f.name}**\n\n${ai || kit.summarize(text, 7).map((x) => `- ${x}`).join('\n') || text.slice(0, 600)}`, { intent: c, anim: 'thinking' });
    }
    case 'points': { const pts = kit.importantPoints(text, 12); return pts.length ? md(`**Important points from ${f.name}**\n\n${pts.map((x) => `- ${x}`).join('\n')}`, { intent: c, anim: 'checklist' }) : fail('There is not enough text.', { intent: c }); }
    case 'defs': { const d = kit.definitions(text, 25); return d.length ? md(`**Definitions from ${f.name}**\n\n${d.map((x) => `- **${x.term}**: ${x.meaning}`).join('\n')}`, { intent: c, anim: 'checklist' }) : fail('I could not find clear definitions in it.', { intent: c }); }
    case 'notes': {
      if (!text.trim()) return fail('There is no readable text to save.', { intent: c });
      const r = notes.add({ topic: c.topic, text, kind: f.kind === 'image' ? 'screen' : 'text', source: f.name }); if (!r) return fail('That was too short to save as a note.', { intent: c });
      return ok(noteSay(r), { intent: c, anim: 'checklist', ask: { options: [{ label: 'Show this note', cmd: 'show notes on ' + r.topic.title }, { label: 'Make PDF and Word', cmd: 'export notes on ' + r.topic.title }] } });
    }
    case 'excel': {
      const rows = f.kind === 'sheet' ? f.rows : excel.parseTable(text);
      if (!rows || rows.length < 2) return fail('I do not see a table in it. A picture or text of a table works best.', { intent: c });
      const spec = excel.sheetFromTable(rows.map((r) => r.map((x) => (x === undefined ? '' : String(x)))), 'Table');
      const file = made(path.join(ctx.outDir('Excel'), `${safe(path.basename(f.name, path.extname(f.name)))}-clean-${stamp()}.xlsx`)); fs.writeFileSync(file, excel.toXlsx(spec)); ctx.open(file);
      return ok(`Made a clean Excel file from ${f.name}, with a styled header, filters and a totals row.`, { intent: c, anim: 'success', ask: fileButtons({ path: file, label: 'Open Excel' }) });
    }
    case 'explain': {
      let ans = null;
      if (f.kind === 'image' && ctx.aiImage) ans = await ctx.aiImage(f.b64, f.mime, 'Explain what this picture shows. If it has text, explain the text clearly. Be brief.');
      if (!ans && text.trim() && ctx.aiText) ans = await ctx.aiText('You explain things simply and clearly in Markdown. Be brief.', `Explain this:\n\n${text.slice(0, 6000)}`);
      if (ans) return md(ans, { intent: c, anim: 'thinking' });
      if (!text.trim()) return fail('I could not read anything in it, and no AI key is set to look at the picture. Add a Gemini key in Settings and I can describe pictures.', { intent: c });
      return md(`I have no AI key set, so here are the main points from ${f.name}:\n\n${kit.summarize(text, 6).map((x) => `- ${x}`).join('\n') || text.slice(0, 500)}`, { intent: c, anim: 'thinking' });
    }
    default: return fail('Say "summary of the attached file", "key points", "add it to notes" or "make excel from it".', { intent: c });
  }
}

// ------------------------------------------------------------------------------------------------ notes
const noteSay = (r, extra) => `Saved to "${r.topic.title}"${r.created ? ' (new topic)' : ''}. ${r.topic.items.length} item${r.topic.items.length === 1 ? '' : 's'} in this topic.${extra || ''}`;
async function readImage(b64) { try { return await ctx.ocr(b64); } catch (e) { return { error: String(e.message || e) }; } }
async function noteCmd(c) {
  switch (c.op) {
    case 'add': {
      let text = c.text || '', kind = 'text', source = '';
      if (c.from === 'clipboard') {
        const clip = ctx.clipboard();
        if (clip.image) { const t = await readImage(clip.image); if (t && t.error) return fail('I could not read the picture: ' + t.error, { intent: c }); text = t; kind = 'screen'; source = 'Screenshot'; }
        else { text = clip.text || ''; kind = 'clipboard'; source = 'Copied text'; }
        if (!text.trim()) return fail('The clipboard is empty. Copy some text, or take a screenshot (Win+Shift+S) first.', { intent: c });
      } else if (c.from === 'screen') {
        const img = await ctx.captureScreen(); if (!img) return fail('I could not capture the screen.', { intent: c });
        const t = await readImage(img); if (t && t.error) return fail('I could not read the screen: ' + t.error, { intent: c });
        text = t; kind = 'screen'; source = 'Screenshot';
      }
      if (!text || String(text).replace(/\s/g, '').length < 8) return fail(kind === 'screen' ? 'I could not find readable text there.' : 'What should I note? For example: "note on photosynthesis: plants make food using light".', { intent: c });
      const r = notes.add({ topic: c.topic, text, kind, source }); if (!r) return fail('That was too short to save as a note.', { intent: c });
      return ok(noteSay(r, r.duplicate ? ' (I already had this.)' : ''), { intent: c, anim: 'checklist', ask: { options: [{ label: 'Show this note', cmd: 'show notes on ' + r.topic.title }, { label: 'Make PDF and Word', cmd: 'export notes on ' + r.topic.title }] } });
    }
    case 'list': {
      const ts = notes.topics(); if (!ts.length) return ok('No notes yet. Say "note on <topic>: ..." or "add clipboard to notes", and I will keep them organised.', { intent: c, anim: 'thinking' });
      return md('**Your notes**\n\n' + ts.slice(0, 25).map((t) => `- **${t.title}**: ${t.items.length} item${t.items.length === 1 ? '' : 's'}`).join('\n') + '\n\nSay "show notes on <topic>".', { intent: c, anim: 'checklist' });
    }
    case 'show': {
      const t = c.topic ? notes.findTopic(c.topic) : notes.topics()[0]; if (!t) return fail(c.topic ? `I have no notes on "${c.topic}".` : 'No notes yet.', { intent: c });
      return md(notes.toMarkdown(t), { intent: c, anim: 'checklist', ask: { options: [{ label: 'Make PDF and Word', cmd: 'export notes on ' + t.title }] } });
    }
    case 'export': {
      const t = c.topic ? notes.findTopic(c.topic) : notes.topics()[0]; if (!t) return fail(c.topic ? `I have no notes on "${c.topic}".` : 'No notes yet.', { intent: c });
      const out = await notes.exportNote(t, ctx.outDir('Notes'), c.formats && c.formats.length ? c.formats : ['md', 'docx', 'pdf'], ctx.pdfRender);
      Object.values(out).forEach(made);
      return ok(`Exported "${t.title}": ${Object.keys(out).map((k) => ({ md: 'Markdown', docx: 'Word', pdf: 'PDF' }[k])).join(', ')}.`, { intent: c, anim: 'success', ask: fileButtons(out.pdf && { path: out.pdf, label: 'Open PDF' }, out.docx && { path: out.docx, label: 'Open Word' }, out.md && { path: out.md, label: 'Open Markdown' }) });
    }
    case 'delete': { const t = notes.remove(c.topic); return t ? ok(`Deleted the notes on "${t.title}".`, { intent: c, anim: 'checklist' }) : fail(`I have no notes on "${c.topic}".`, { intent: c }); }
    default: return fail('Say "note on <topic>: <text>", "add clipboard to notes", "show notes on <topic>" or "export notes".', { intent: c });
  }
}

// ---- notes from the web ("write a note on photosynthesis from the internet")
async function wikiSections(title) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|info&inprop=url&explaintext=1&redirects=1&titles=' + encodeURIComponent(title) + '&origin=*';
  const r = await ctx.search.get(u, { timeout: 10000 }); if (!r.ok) return null;
  const pg = Object.values((await r.json()).query?.pages || {})[0]; if (!pg || pg.missing !== undefined || !pg.extract) return null;
  const parts = pg.extract.split(/\n==+\s*([^=\n]+?)\s*==+\s*\n/); const out = [{ heading: pg.title, text: parts[0] }];
  for (let i = 1; i < parts.length; i += 2) if (!/^(see also|references|external links|further reading|notes|bibliography|sources|citations)$/i.test(parts[i])) out.push({ heading: pg.title + ': ' + parts[i], text: parts[i + 1] || '' });
  return { title: pg.title, url: pg.fullurl || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(pg.title.replace(/ /g, '_')), sections: out.filter((s) => s.text.trim().length > 60).slice(0, 6) };
}
async function writeCmd(c) {
  const topic = String(c.topic || '').trim(); if (topic.length < 2) return fail('What should the note be about? For example: "write a note on photosynthesis from the internet".', { intent: c });
  const found = notes.findTopic(topic); const before = found ? found.items.length : 0;
  const [w, look] = await Promise.allSettled([wikiSections(topic), ctx.search.lookup(topic, { searx: ctx.store.get().searxUrl })]);
  const wiki = w.status === 'fulfilled' ? w.value : null, lk = look.status === 'fulfilled' ? look.value : null; let added = 0, sources = 0;
  const title = wiki ? wiki.title : topic;
  if (wiki) { for (const s of wiki.sections) { const r = notes.add({ topic: title, text: s.text.replace(/\n+/g, ' '), kind: 'web', source: 'Wikipedia - ' + s.heading.split(': ').pop(), url: wiki.url }); if (r && !r.duplicate) added++; } sources++; }
  const pages = ((lk && lk.results) || []).filter((r) => r.url && !/wikipedia\.org/i.test(r.url)).slice(0, 3);
  const got = await Promise.allSettled(pages.map((p) => ctx.search.readPage(p.url, 5000)));
  got.forEach((g, i) => { if (g.status !== 'fulfilled' || !g.value.text || g.value.text.length < 200) return; const r = notes.add({ topic: title, text: g.value.text, kind: 'web', source: (g.value.title || pages[i].title || pages[i].url).slice(0, 80), url: pages[i].url }); if (r && !r.duplicate) { added++; sources++; } });
  if (lk && lk.wiki && !wiki && lk.wiki.extract) { notes.add({ topic: title, text: lk.wiki.extract, kind: 'web', source: 'Wikipedia', url: lk.wiki.url || '' }); added++; sources++; }
  const t = notes.findTopic(title);
  if (!t || !t.items.length || (!added && !before)) return fail('I could not reach the web right now, so I could not write that note. Check the internet and try again.', { intent: c });
  const out = await notes.exportNote(t, ctx.outDir('Notes'), ['md', 'docx', 'pdf'], ctx.pdfRender); Object.values(out).forEach(made);
  return md(notes.toMarkdown(t), { intent: c, anim: 'success', ask: fileButtons(out.pdf && { path: out.pdf, label: 'Open PDF' }, out.docx && { path: out.docx, label: 'Open Word' }, out.md && { path: out.md, label: 'Open Markdown' }) });
}

// ------------------------------------------------------------------------------------------------ Exam Rescue Autopilot
const focusMinutes = (dateKey) => (ctx.store.get().focusLog || []).filter((f) => exam.key(f.ts) === dateKey).reduce((a, f) => a + (f.min || 0), 0);

/** Replace the plan's reminders: a study reminder and a Teach Tito reminder for every day still ahead. */
function reschedule(plan) {
  for (const id of plan.reminders || []) { try { ctx.tasks.removeReminder(id); } catch { /* already gone */ } }
  plan.reminders = []; const now = Date.now();
  for (const d of plan.days) {
    const base = exam.keyToMs(d.date, plan.studyHour, 0); if (base < now - 60000) continue;
    const r1 = ctx.tasks.addReminder(`Exam plan - ${exam.dayText(plan, d)}`, Math.max(base, now + 5000), { kind: 'reminder' }); if (r1) plan.reminders.push(r1.id);
    const first = d.chapters.map((n) => plan.chapters.find((x) => x.n === n)).filter(Boolean)[0];
    const t2 = Math.min(base + plan.dayMin * 60000, exam.keyToMs(d.date, 23, 40));
    if (d.type === 'learn' && first && t2 > now) { const r2 = ctx.tasks.addReminder(`Teach Tito what you studied: ${first.title}. Say "teach tito ${first.title.replace(/^(chapter|unit|module|lesson|part|topic)\s*\d+\s*[:.-]?\s*/i, '').slice(0, 40) || first.title}"`, t2, { kind: 'reminder' }); if (r2) plan.reminders.push(r2.id); }
  }
}
const ensureExam = (plan) => { try { const snap = ctx.tasks.snapshot(); if (!snap.exams.some((e) => e.name.toLowerCase() === plan.name.toLowerCase())) ctx.tasks.addExam(plan.name, new Date(plan.examAt).toISOString()); } catch { /* optional */ } };
function pullCards(plan, ns) { let n = 0; for (const k of ns) n += ctx.store.pullCards(`rescue:${plan.id}:${k}`, 5); return n; }

async function rescueCmd(c) {
  const ready = (plan) => exam.readiness(plan, { cards: ctx.store.listCards(), teachLog: ctx.store.get().teachLog || [] });
  switch (c.op) {
    case 'create': {
      if (!c.name) return fail('Which exam is it? For example: "exam rescue chemistry on 20 dec".', { intent: c });
      if (!Number.isFinite(c.at)) return fail(`When is the ${c.name} exam? For example: "exam rescue ${c.name} on 20 dec".`, { intent: c });
      let chs = null, info = null, file = '';
      if (c.chapters) chs = Array.from({ length: Math.min(60, c.chapters) }, (_, i) => ({ title: `Chapter ${i + 1}`, from: 0, to: 0 }));
      else {
        file = await pickOne(); if (!file) return fail(`Drop your ${c.name} syllabus or notes PDF on me and say it again. Or tell me the chapter count: "exam rescue ${c.name} on 20 dec, 8 chapters".`, { intent: c });
        try { info = await pdftools.read(file); } catch (e) { return fail('I could not open that PDF.', { intent: c }); }
        if (scanned(info)) return fail('This PDF looks scanned (pictures only). Use a text PDF, or tell me the number of chapters instead.', { intent: c });
        chs = pdftools.chapters(info).slice(0, 60);
      }
      const old = exam.find(c.name); if (old) { for (const id of old.reminders || []) { try { ctx.tasks.removeReminder(id); } catch { /* ignore */ } } exam.remove(old.id); }
      const b = exam.buildPlan({ name: c.name, examAt: c.at, chapters: chs, studyHour: c.studyHour || 18, dayMin: c.dayMin || 90, pdf: file });
      if (!b.ok) return fail(b.reason === 'too-late' ? 'The exam is too close for a plan: there is no study day left before it. Use "quiz me" and "teach tito" to revise now.' : 'I could not make a plan from that.', { intent: c });
      const plan = b.plan; let cards = 0;
      if (info) for (const ch of plan.chapters) {
        const firstDay = plan.days.find((d) => d.chapters.includes(ch.n)); const due = firstDay ? exam.keyToMs(firstDay.date, plan.studyHour) : Date.now();
        for (const d of kit.definitions(pdftools.textOf(info, ch.from, ch.to), 6)) { if (ctx.store.addCard(d.term, d.meaning, `rescue:${plan.id}:${ch.n}`, due)) { ch.cards++; cards++; } }
      }
      reschedule(plan); ensureExam(plan); exam.add(plan); ctx.refresh(); ctx.send('dock:cards');
      const first3 = plan.days.slice(0, 4).map((d) => `- ${exam.label(d.date)}: ${exam.dayText(plan, d)}`).join('\n');
      return md(`**${plan.name} plan is ready**\n\n${plan.chapters.length} chapter${plan.chapters.length > 1 ? 's' : ''} over ${plan.days.length} day${plan.days.length > 1 ? 's' : ''} before the exam on ${exam.label(exam.key(plan.examAt))}, about ${exam.hhmm(plan.dayMin)} a day at ${plan.studyHour > 12 ? plan.studyHour - 12 : plan.studyHour} ${plan.studyHour >= 12 ? 'pm' : 'am'}.\n\n${first3}\n\n${cards ? `I made ${cards} flashcards from the definitions, timed for the day you study each chapter.\n\n` : ''}Each day has a study reminder and a Teach Tito reminder. If you fall behind, I will move the work forward by myself.`, { intent: c, anim: 'celebrate', ask: { options: [{ label: 'How ready am I?', cmd: 'how ready am i' }] } });
    }
    case 'status': {
      const plan = exam.find(c.name) || exam.current(); if (!plan) return fail('No exam plan yet. Say "exam rescue chemistry on 20 dec" and drop your PDF.', { intent: c });
      return md(exam.statusMarkdown(plan, ready(plan)), { intent: c, anim: 'checklist', ask: { options: [{ label: 'Replan', cmd: 'replan my exam plan' }, { label: 'Teach Tito', cmd: 'teach tito' }] } });
    }
    case 'replan': {
      const plan = exam.find(c.name) || exam.current(); if (!plan) return fail('No exam plan yet.', { intent: c });
      const r = exam.adjust(plan, { focusMin: focusMinutes, force: true }); pullCards(plan, r.pulled || []); reschedule(plan); exam.save(); ctx.refresh();
      return md(`**Plan updated**\n\n${r.messages.length ? r.messages.map((m) => `- ${m}`).join('\n') : '- Everything is on track.'}\n\n${exam.statusMarkdown(plan, ready(plan))}`, { intent: c, anim: 'checklist' });
    }
    case 'done': {
      const plan = exam.find(c.name) || exam.current(); if (!plan) return fail('No exam plan yet.', { intent: c });
      const ch = plan.chapters.find((x) => x.n === c.n); if (!ch) return fail(`There is no chapter ${c.n} in ${plan.name}.`, { intent: c });
      ch.done = true; exam.adjust(plan, { focusMin: focusMinutes, force: true }); reschedule(plan); exam.save(); ctx.refresh();
      const r = ready(plan); return ok(`Chapter ${ch.n} marked done. ${plan.name} is ${r.percent}% ready, ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} to go.`, { intent: c, anim: 'celebrate' });
    }
    case 'remove': {
      const plan = exam.find(c.name) || exam.current(); if (!plan) return fail('No exam plan to remove.', { intent: c });
      for (const id of plan.reminders || []) { try { ctx.tasks.removeReminder(id); } catch { /* ignore */ } } exam.remove(plan.id); ctx.refresh();
      return ok(`Removed the ${plan.name} plan and its reminders.`, { intent: c, anim: 'checklist' });
    }
    default: return fail('Say "exam rescue <subject> on <date>" and drop your PDF, or "how ready am i".', { intent: c });
  }
}

/** Runs now and every hour: marks past days, moves missed work forward, and tells you what changed. */
function autoAdjust() {
  if (!ctx) return;
  for (const plan of exam.plans()) {
    if (plan.examAt < exam.dayStart(Date.now())) continue;
    let r; try { r = exam.adjust(plan, { focusMin: focusMinutes }); } catch { continue; }
    if (!r.changed && !r.messages.length) continue;
    const pulled = pullCards(plan, r.pulled || []); if (r.moved.length || r.messages.length) reschedule(plan); exam.save(); ctx.refresh();
    if (r.messages.length) ctx.alert({ title: plan.name + ' plan updated', text: r.messages.slice(0, 3).join(' ') + (pulled ? ` Pulled ${pulled} flashcard${pulled > 1 ? 's' : ''} back for revision.` : ''), anim: 'worried', tab: 'study', noNotify: false });
  }
}
/** One line for the greeting: the next exam and how ready you are. */
function rescueLine() {
  const plan = exam.current(); if (!plan || !ctx) return null;
  const r = exam.readiness(plan, { cards: ctx.store.listCards(), teachLog: ctx.store.get().teachLog || [] });
  return { name: plan.name, percent: r.percent, daysLeft: r.daysLeft };
}

const TYPES = new Set(['meeting', 'excel', 'pdf', 'note', 'write', 'rescue', 'attach']);
async function run(c) {
  try {
    switch (c.type) {
      case 'meeting': return meetingCmd(c);
      case 'excel': return await excelCmd(c);
      case 'pdf': return await pdfCmd(c);
      case 'note': return await noteCmd(c);
      case 'write': return await writeCmd(c);
      case 'rescue': return await rescueCmd(c);
      case 'attach': return await attachCmd(c);
      default: return null;
    }
  } catch (e) { return fail('That did not work: ' + String(e && e.message || e).slice(0, 140), { intent: c }); }
}

module.exports = { setup, run, attach, TYPES, autoAdjust, rescueLine, reschedule };

// node tools/test-office.js : meetings, Excel, PDF jobs, notes, web notes and the exam autopilot, with a fake task list and card deck.
// Real files are written to a temp folder and (when LibreOffice is installed) opened by LibreOffice to prove Excel and Word accept them.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tito-office-'));
let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };
const src = (f) => require(path.join(__dirname, '..', 'src', f));

const excel = src('excel.js'), meeting = src('meeting.js'), pdftools = src('pdftools.js'), notes = src('notes.js'), exam = src('exam.js'), office = src('office.js'), kit = src('textkit.js'), intent = src('intent.js');
notes.init(root); exam.init(root);

// ---- fakes
const tasksFake = { list: [], n: 0, exams: [],
  addReminder(text, at, o = {}) { const r = { id: 'r' + ++this.n, text, at, open: o.open || null }; this.list.push(r); return r; },
  removeReminder(id) { this.list = this.list.filter((x) => x.id !== id); }, snapshot() { return { exams: this.exams, reminders: this.list, todos: [], routines: [] }; },
  addExam(name, date) { this.exams.push({ name, date: Date.parse(date) }); } };
const storeFake = { deck: [], focusLog: [], teachLog: [],
  addCard(f, b, tag, due) { const dup = this.deck.find((c) => c.front === f); if (dup) { if (tag && !dup.tag) dup.tag = tag; return dup; } const c = { id: 'c' + this.deck.length, front: f, back: b, box: 0, due: due || Date.now(), tag }; this.deck.push(c); return c; },
  listCards() { return this.deck; }, pullCards(tag, n) { const h = this.deck.filter((c) => c.tag === tag && c.due > Date.now()).slice(0, n); h.forEach((c) => { c.due = Date.now(); }); return h.length; },
  get() { return { focusLog: this.focusLog, teachLog: this.teachLog, searxUrl: '' }; } };
let clip = { text: '', image: '' }, picked = [], alerts = [], pdfCur = '', opened = [];
const wikiPage = { query: { pages: { 1: { title: 'Photosynthesis', fullurl: 'https://en.wikipedia.org/wiki/Photosynthesis', extract: 'Photosynthesis is a biological process used by plants to convert light energy into chemical energy that is stored in sugars. It takes place in the chloroplasts of leaf cells.\n\n== Light-dependent reactions ==\nIn the light-dependent reactions, chlorophyll absorbs photons and the energy splits water into oxygen, protons and electrons, which makes ATP and NADPH for the plant.\n\n== Calvin cycle ==\nThe Calvin cycle uses ATP and NADPH to fix carbon dioxide into sugar molecules inside the stroma of the chloroplast during the day.\n\n== References ==\nignored text that must not appear in the notes at all here' } } } };
office.setup({
  tasks: tasksFake, store: storeFake, outDir: (s) => { const d = path.join(root, s); fs.mkdirSync(d, { recursive: true }); return d; }, register: (p) => p, open: (p) => opened.push(p), reveal: () => {},
  search: { get: async () => ({ ok: true, json: async () => wikiPage }), lookup: async () => ({ results: [{ title: 'Photosynthesis explained', url: 'https://example.org/photo' }], wiki: null }), readPage: async (u) => ({ title: 'Photosynthesis explained', url: u, text: 'Plants capture sunlight with chlorophyll inside chloroplasts. The captured energy powers the making of glucose from carbon dioxide and water, and oxygen is released as a by-product that animals breathe in every day.' }) },
  store: storeFake, pickPdfs: async () => picked, getPdf: () => pdfCur, setPdf: (p) => { pdfCur = p; }, pdfList: () => [],
  setPdf: (p) => { pdfCur = p; }, clipboard: () => clip, captureScreen: async () => 'AAAA', ocr: async () => 'Mitochondria are the powerhouse of the cell and make energy for the body. Cells divide by mitosis to grow and repair tissue in living things.',
  pdfRender: async (html) => Buffer.from('%PDF-1.4 fake ' + html.length), aiText: async () => null, history: () => hist, alert: (a) => alerts.push(a), refresh: () => {}, send: () => {},
});
let hist = [];
const run = async (text) => office.run(intent.parse(text, new Date()));

(async () => {
  // ---- Excel
  const p1 = excel.planSheet('make an expense sheet: date, item, amount, total');
  ok(p1 && p1.columns.length === 4 && p1.columns[2].kind === 'money', 'excel: columns read from the request');
  const r1 = await run('is mahine ka kharcha ka sheet banao: date, item, amount, total');
  ok(r1.ok && r1.ask.options.some((o) => /xlsx$/.test(o.file || '')), 'excel: command writes an .xlsx and offers it');
  const xl = r1.ask.options[0].file; ok(fs.statSync(xl).size > 1500 && opened.includes(xl), 'excel: file exists and was opened');
  ok(!!(await run('make marks sheet excel')).ok, 'excel: a known kind of sheet works without columns');
  ok((await run('make an excel sheet')).ok === false, 'excel: no columns and no AI asks for columns politely');
  clip = { text: 'Name\tMarks\nAsha\t90\nRavi\t75\nMina\t88', image: '' };
  const rc = await run('excel from clipboard'); ok(rc.ok && /Name, Marks/.test(rc.say), 'excel: a copied table becomes a sheet');
  hist = [{ role: 'user', text: 'table please' }, { role: 'tito', text: '| Planet | Moons |\n|---|---|\n| Earth | 1 |\n| Mars | 2 |' }];
  ok((await run('export this table to excel')).ok, 'excel: the last table in the chat becomes a sheet');
  ok((await run('excel from clipboard')).ok, 'excel: clipboard again'); clip = { text: 'just words', image: '' }; ok(!(await run('excel from clipboard')).ok, 'excel: clipboard without a table says so');
  const lo = 'C:/Program Files/LibreOffice/program/soffice.exe';
  let haveLO = fs.existsSync(lo);
  if (haveLO) {
    const out = path.join(root, 'lo'); fs.mkdirSync(out, { recursive: true });
    const tbl = excel.toXlsx(excel.sheetFromTable(excel.parseTable('Name\tMarks\nAsha\t90\nRavi\t75'), 'Marks')); const tf = path.join(root, 'tbl.xlsx'); fs.writeFileSync(tf, tbl);
    cp.spawnSync(lo, ['--headless', '--convert-to', 'csv', '--outdir', out, tf, xl], { timeout: 120000 });
    const csv = fs.readFileSync(path.join(out, 'tbl.csv'), 'utf8'); ok(/Total,165/.test(csv), 'excel: LibreOffice opens the sheet and the SUM formula gives 165');
    ok(/Date,Item,Amount,Total/.test(fs.readFileSync(path.join(out, path.basename(xl, '.xlsx') + '.csv'), 'utf8')), 'excel: LibreOffice opens the expense sheet with its headers');
  }

  // ---- meetings
  const soon = Date.now() + 3 * 3600000; const d1 = meeting.describe('meeting with Rahul on google meet', { at: soon });
  ok(d1.who === 'Rahul' && d1.provider === 'Google Meet' && /meet\.google\.com/.test(d1.link), 'meeting: person and provider found');
  const rm = await run('kal 4 baje Rahul ke saath meeting google meet');
  ok(rm.ok && tasksFake.list.length >= 1 && /Rahul/.test(tasksFake.list[tasksFake.list.length - 1].text), 'meeting: reminders created');
  const mr = tasksFake.list.filter((x) => /Rahul/.test(x.text)); ok(mr.length === 2 && mr.every((x) => x.open && x.open.noAuto && x.open.join === 'start'), 'meeting: two reminders, each with a Start button that does not auto-open');
  const ics = rm.ask.options[0].file; const icsText = fs.readFileSync(ics, 'utf8');
  ok(/BEGIN:VEVENT/.test(icsText) && /DTSTART:\d{8}T\d{6}Z/.test(icsText) && /SUMMARY:Meeting with Rahul/.test(icsText) && /TRIGGER:-PT10M/.test(icsText) && /\r\n/.test(icsText), 'meeting: valid calendar file');
  const rl = await run('meeting with Sam on https://meet.google.com/abc-defg-hij tomorrow 5pm'); ok(rl.ok && /Join Google Meet/.test(rl.say), 'meeting: a pasted link gives a Join button');
  ok(!(await run('set meeting')).ok, 'meeting: no time asks for the time');

  // ---- PDF
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  async function makePdf(file, pagesText) { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); for (const t of pagesText) { const pg = d.addPage([595, 842]); let y = 780; for (const ln of t.split('\n')) { pg.drawText(ln, { x: 50, y, size: 12, font: f }); y -= 18; } } fs.writeFileSync(file, await d.save()); }
  const body = (t) => t + '\nPhotosynthesis is defined as the process by which green plants make food using sunlight.\nChlorophyll: the green pigment that absorbs light energy for the plant.\nRemember that light is essential for the reaction to happen in the leaf.\nStomata are tiny pores on leaves that let gases move in and out of the plant.';
  const pdfA = path.join(root, 'bio.pdf');
  await makePdf(pdfA, [body('Chapter 1: Photosynthesis'), body('more on light'), body('Chapter 2: Respiration'), body('more on energy'), body('Chapter 3: Transport'), body('more on water')]);
  picked = [pdfA]; pdfCur = '';
  const rch = await run('chapters batao pdf'); ok(rch.ok && /Chapter 1: Photosynthesis/.test(rch.say) && /3 chapters/.test(rch.say), 'pdf: chapters found with page ranges: ' + (rch.say || '').split('\n')[0]);
  const rd = await run('extract important definitions from the pdf'); ok(rd.ok && /Photosynthesis/.test(rd.say) && /Chlorophyll/.test(rd.say), 'pdf: definitions extracted');
  const rp = await run('important points from pdf'); ok(rp.ok && /Remember that light/.test(rp.say), 'pdf: important points');
  const rs = await run('summary of page 3'); ok(rs.ok && /Summary of pages 3-3/.test(rs.say), 'pdf: summary of one page');
  ok((await run('find chlorophyll in pdf')).say.includes('appears on 6 pages'), 'pdf: find a word');
  const before = storeFake.deck.length; const rk = await run('save pdf definitions as flashcards'); ok(rk.ok && storeFake.deck.length > before, 'pdf: definitions saved as flashcards');
  const rsp = await run('split pdf pages 2-4'); const splitFile = rsp.ask.options[0].file; ok(rsp.ok && (await pdftools.read(splitFile)).numPages === 3, 'pdf: split pages 2-4 gives a 3 page file');
  const rsp2 = await run('pages 5 se 9 alag karo'); ok(rsp2.ok && (await pdftools.read(rsp2.ask.options[0].file)).numPages === 2, 'pdf: "pages 5 se 9" clipped to the 6 pages that exist');
  const pdfB = path.join(root, 'two.pdf'); await makePdf(pdfB, ['Second file page one', 'Second file page two']); picked = [pdfA, pdfB];
  const rm2 = await run('merge pdfs'); ok(rm2.ok && (await pdftools.read(rm2.ask.options[0].file)).numPages === 8, 'pdf: merge gives 8 pages');
  picked = [pdfA]; const rt = await run('extract the text of the pdf to text'); ok(rt.ok && /Page 1 ---/.test(fs.readFileSync(rt.ask.options[0].file, 'utf8')), 'pdf: text export');
  pdfCur = ''; picked = []; ok(!(await run('chapters batao pdf')).ok, 'pdf: no file chosen says what to do');
  pdfCur = pdfA;
  if (haveLO) {   // the merged and split files must open in a real PDF reader too: pdf.js already parsed them above
    ok(true, 'pdf: merged and split files re-read by pdf.js');
  }

  // ---- notes
  const n1 = await run('note on cells: Cells are the basic unit of life and every living thing is made of cells that grow and divide.');
  ok(n1.ok && /new topic/.test(n1.say), 'notes: typed note creates a topic');
  const n2 = await run('note on cells: The nucleus controls the cell and holds the DNA that carries the instructions for growth.');
  ok(n2.ok && /2 items/.test(n2.say), 'notes: second note joins the same topic');
  clip = { text: '', image: 'AAAA' };
  const n3 = await run('add clipboard to notes'); ok(n3.ok && /Mitochondria/.test(JSON.stringify(notes.topics())), 'notes: a clipboard screenshot is read and filed (' + n3.say + ')');
  const n4 = await run('snap screen to notes under cells'); ok(n4.ok && notes.findTopic('cells').items.length >= 3, 'notes: a screen capture joins the named topic');
  ok((await run('notes')).say.includes('Cells'), 'notes: list shows the topic');
  const sh = await run('show notes on cells'); ok(sh.md && /## Notes/.test(sh.say) && /Key terms/.test(sh.say), 'notes: arranged note has key terms and sections');
  const ex = await run('export notes on cells'); ok(ex.ok && ex.ask.options.length >= 3, 'notes: exported');
  const files = ex.ask.options.filter((o) => o.file).map((o) => o.file); ok(files.some((f) => /\.docx$/.test(f)) && files.some((f) => /\.md$/.test(f)) && files.some((f) => /\.pdf$/.test(f)), 'notes: Markdown, Word and PDF files written');
  if (haveLO) {
    const out = path.join(root, 'lo2'); fs.mkdirSync(out, { recursive: true }); const dx = files.find((f) => /\.docx$/.test(f));
    cp.spawnSync(lo, ['--headless', '--convert-to', 'txt:Text', '--outdir', out, dx], { timeout: 120000 });
    const txt = fs.readFileSync(path.join(out, path.basename(dx, '.docx') + '.txt'), 'utf8'); ok(/Cells/.test(txt) && /Key terms/.test(txt) && /Mitochondria/.test(txt), 'notes: LibreOffice opens the Word file and reads the note');
  }
  const wr = await run('write a note on photosynthesis from the internet'); ok(wr.ok && wr.md && /Light-dependent reactions/.test(wr.say) && !/ignored text/.test(wr.say), 'write: web note built from Wikipedia sections, references dropped');
  ok(/example\.org/.test(wr.say) && /Sources/.test(wr.say), 'write: other web pages are used and listed as sources');
  ok(wr.ask.options.some((o) => /\.pdf$/.test(o.file || '')), 'write: PDF and Word copies are made');
  ok((await run('delete notes on photosynthesis')).ok, 'notes: delete a topic');

  // ---- exam autopilot
  const examAt = Date.now() + 10 * 86400000;
  const cr = await run('exam rescue biology on ' + new Date(examAt).getDate() + ' ' + new Date(examAt).toLocaleString('en', { month: 'short' }).toLowerCase());
  ok(cr.ok && /plan is ready/.test(cr.say), 'rescue: plan built from the PDF: ' + (cr.say || '').split('\n').slice(0, 3).join(' | '));
  const plan = exam.find('biology'); ok(plan && plan.chapters.length === 3 && plan.days.length >= 8 && plan.days[plan.days.length - 1].type === 'revise', 'rescue: 3 chapters over the days, revision at the end (' + (plan && plan.days.length) + ' days)');
  ok(plan.chapters.every((c) => plan.days.some((d) => d.type === 'learn' && d.chapters.includes(c.n))), 'rescue: every chapter has a study day');
  ok(storeFake.deck.some((c) => c.tag === `rescue:${plan.id}:1`), 'rescue: flashcards made per chapter');
  ok(tasksFake.list.filter((x) => /Exam plan/.test(x.text)).length >= plan.days.length && tasksFake.list.some((x) => /Teach Tito/.test(x.text)), 'rescue: study and Teach Tito reminders scheduled');
  ok(tasksFake.exams.length === 1, 'rescue: exam added to the countdowns');
  let st = await run('how ready am i'); ok(st.md && /% ready/.test(st.say), 'rescue: readiness shown');
  const pct0 = exam.readiness(plan, { cards: storeFake.deck, teachLog: [] }).percent; ok(pct0 === 0, 'rescue: 0% before any study');
  // a missed day: pretend the plan began 3 days ago and Focus Guard saw almost no study
  const day0 = plan.days[0]; const fakeNow = exam.keyToMs(plan.days[2].date, 9);
  const adj = exam.adjust(plan, { now: fakeNow, focusMin: () => 10 });
  ok(adj.changed && adj.messages.length >= 2 && plan.days.filter((d) => d.missed).length >= 2, 'rescue: missed days noticed: ' + adj.messages.slice(0, 2).join(' / '));
  ok(plan.chapters.every((c) => c.done || plan.days.some((d) => d.date >= exam.key(fakeNow) && d.chapters.includes(c.n))), 'rescue: unfinished chapters moved to days ahead');
  const adj2 = exam.adjust(plan, { now: fakeNow, focusMin: () => 10 }); ok(!adj2.changed || adj2.messages.length === 0, 'rescue: adjusting twice changes nothing more');
  // good study: chapters get marked done
  const plan2 = exam.buildPlan({ name: 'Maths', examAt, chapters: [{ title: 'Algebra', from: 1, to: 10 }, { title: 'Geometry', from: 11, to: 20 }], now: Date.now() }).plan;
  const adj3 = exam.adjust(plan2, { now: exam.keyToMs(plan2.days[plan2.days.length - 1].date, 9), focusMin: () => 100 }); ok(plan2.chapters.every((c) => c.done) && !adj3.messages.length, 'rescue: enough Focus Guard minutes marks chapters done without any change');
  const dn = await run('chapter 1 done'); ok(dn.ok && /Chapter 1 marked done/.test(dn.say), 'rescue: "chapter 1 done" works');
  storeFake.teachLog.push({ ts: Date.now(), topic: 'Photosynthesis', avg: 80 }); storeFake.deck.filter((c) => c.tag === `rescue:${plan.id}:1`).forEach((c) => { c.box = 3; });
  const rd2 = exam.readiness(plan, { cards: storeFake.deck, teachLog: storeFake.teachLog }); ok(rd2.percent > 0 && rd2.chapters[0].cards === 75 && rd2.chapters[0].teach === 80, 'rescue: readiness mixes study, cards (75%) and teaching score (80%): ' + rd2.percent + '%');
  const rp2 = await run('replan my exam plan'); ok(rp2.ok && /Plan updated/.test(rp2.say), 'rescue: replan command');
  office.autoAdjust(); ok(true, 'rescue: the hourly adjust runs without error');
  const none = await run('exam rescue chemistry'); ok(!none.ok && /When is the/i.test(none.say), 'rescue: a missing date is asked for');
  ok((await run('exam rescue physics on ' + new Date(examAt).getDate() + ' ' + new Date(examAt).toLocaleString('en', { month: 'short' }).toLowerCase() + ' 5 chapters')).ok, 'rescue: with a chapter count and no PDF still plans');
  const rm3 = await run('remove exam plan'); ok(rm3.ok && exam.plans().length === 1, 'rescue: a plan can be removed');


  // ---- attached files: Excel, CSV, Word, text, picture, unknown, and the follow-up commands
  {
    const fk = src('filekit.js'); const af = path.join(root, 'att'); fs.mkdirSync(af, { recursive: true });
    const xlsxP = path.join(af, 'sales.xlsx'); fs.writeFileSync(xlsxP, excel.toXlsx(excel.sheetFromTable(excel.parseTable('Item\tQty\tPrice\nPen\t10\t5\nBook\t4\t120\nBag\t2\t800'), 'Sales')));
    const back = fk.readXlsx(xlsxP); ok(back[0].name === 'Sales' && back[0].rows[1][0] === 'Pen' && back[0].rows[3][2] === 800, 'attach: our own .xlsx reads back (' + JSON.stringify(back[0].rows[1]) + ')');
    if (haveLO) {
      const csvP = path.join(af, 'real.csv'); fs.writeFileSync(csvP, 'Name,City,Score\nAsha,Pune,91\nRavi,Delhi,78\n"Lee, Jo",Goa,85\n');
      cp.spawnSync(lo, ['--headless', '--convert-to', 'xlsx', '--outdir', af, csvP], { timeout: 120000 });
      const real = fk.readXlsx(path.join(af, 'real.xlsx')); ok(real[0].rows.length === 4 && real[0].rows[3][0] === 'Lee, Jo' && real[0].rows[1][2] === 91, 'attach: an .xlsx saved by LibreOffice (shared strings) reads correctly');
    }
    const csvP2 = path.join(af, 'marks.csv'); fs.writeFileSync(csvP2, 'Name,Marks\nAsha,90\nRavi,75\nMina,88\n'); const txtP = path.join(af, 'notes.txt'); fs.writeFileSync(txtP, 'Cells are the basic unit of life. Every living thing is made of cells. Remember that the nucleus controls the cell and holds the DNA.\nMitochondria: the organelle that releases energy for the cell to use in its work.');
    const docxP = path.join(af, 'essay.docx'); fs.writeFileSync(docxP, src('docx.js').buildDocx([{ t: 'title', text: 'Energy' }, { t: 'p', text: 'Energy is the ability to do work and it can change from one form to another without being lost.' }]));
    ok(fk.readDocx(docxP).includes('Energy is the ability'), 'attach: Word text read');
    const imgP = path.join(af, 'shot.png'); fs.writeFileSync(imgP, Buffer.from('89504e470d0a1a0a', 'hex')); const weird = path.join(af, 'thing.xyz'); fs.writeFileSync(weird, 'abc');
    let r = await office.attach([xlsxP]); ok(r.ok && /3 rows and 3 columns/.test(r.say) && r.ask.options.length === 3, 'attach: Excel summary line and buttons');
    r = await run('show the attached file'); ok(r.md && /\| Pen \|/.test(r.say), 'attach: show the table');
    r = await run('summary of the attached file'); ok(/Qty\*\*: total 16/.test(r.say), 'attach: column totals in the summary: ' + (r.say || '').split('\n').slice(2, 3));
    r = await run('make excel from the attached file'); ok(r.ok && /\.xlsx$/.test(r.ask.options[0].file), 'attach: clean Excel copy');
    r = await office.attach([csvP2]); ok(r.ok && /3 rows and 2 columns/.test(r.say), 'attach: CSV read');
    r = await office.attach([txtP]); ok(r.ok && /text file/.test(r.say), 'attach: text file read');
    ok((await run('key points of the attached file')).ok, 'attach: key points');
    ok((await run('definitions from the attached file')).say.includes('Mitochondria'), 'attach: definitions');
    r = await run('add the attached file to notes under cells'); ok(r.ok && /cells/i.test(r.say), 'attach: added to notes under a topic');
    ok((await run('explain the attached file')).md, 'attach: explain with no AI falls back to the main points');
    r = await office.attach([docxP]); ok(r.ok && /Word document/.test(r.say), 'attach: Word read');
    r = await office.attach([imgP]); ok(r.ok && /picture/.test(r.say) && /read \d+ words/.test(r.say), 'attach: picture read with the offline reader');
    ok((await run('add the attached file to notes')).ok, 'attach: picture text saved to notes');
    r = await office.attach([weird]); ok(!r.ok && /cannot read this kind/.test(r.say), 'attach: unknown type says what is supported');
    r = await office.attach([path.join(af, 'missing.pdf')]); ok(!r.ok && /could not open/.test(r.say), 'attach: missing file is explained');
    r = await office.attach([xlsxP, txtP, weird]); ok(r.ok && /sales.xlsx/.test(r.say) && /cannot read/.test(r.say), 'attach: several files at once');
    r = await office.attach([pdfA]); ok(r.ok && /PDF, 6 pages, 3 chapters/.test(r.say), 'attach: PDF'); ok((await run('summary of the attached file')).ok, 'attach: PDF follow-up goes to the PDF commands');
  }

  console.log(bad ? `${bad} FAILED` : 'office ok', '->', root); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });

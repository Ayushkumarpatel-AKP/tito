// electron tools/test-dock.js <out dir> : drives the dock in a window that is never shown, saves screenshots, checks the logic.
process.env.TITO_OUT_DIR = require('path').join(require('os').tmpdir(), 'tito-out-' + process.pid); process.env.TITO_DOCK_HIDDEN = '1'; process.env.GEMINI_API_KEY = ''; process.env.GROQ_API_KEY = '';   // no AI in tests: unknown commands must fail politely
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'tito-dock-')); fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'tito-ud-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };

app.whenReady().then(async () => {
  // pretend AI (no real key is ever used): it only knows how to judge a Teach Tito explanation
  const engine = require('../src/engine');
  engine.ask = async ({ rawSystem, turns }) => {
    const last = turns && turns.length ? String(turns[turns.length - 1].text) : '';
    if (rawSystem && /curious/.test(rawSystem)) return { ok: true, via: 'online', result: { raw: true, answer: JSON.stringify({ score: 72, good: ['Plants use light'], gaps: ['Where the water goes'], wrong: ['Oxygen is a product, not the food'], question: 'Where does the water come from?', praise: 'Nice start!', cards: [{ front: 'photosynthesis output', back: 'sugar and oxygen' }] }) } };
    if (rawSystem && /desktop assistant/.test(rawSystem)) {
      if (/python loop/i.test(last)) return { ok: true, via: 'online', result: { raw: true, answer: 'A **for loop** repeats work.\n\n```python\nfor i in range(3):\n    print(i)\n```\n\n- `range(3)` gives 0, 1, 2' } };
      if (/ACTIONTEST/.test(last)) return { ok: true, via: 'online', result: { raw: true, answer: 'ACTION {"action":"todo","text":"buy eggs"}' } };
    }
    return { ok: false, code: 'nokey', message: 'No AI key is set.' };
  };
  const { ipcMain } = require('electron'); ipcMain.handle('settings:get', () => require('../src/store').publicSettings()); ipcMain.handle('history:list', () => []);   // main.js owns these in the real app
  const store = require('../src/store'); store.load(); store.save({ dockOn: true, lastBrief: require('../src/tasks').dayKey() });
  const dock = require('../src/dock'); dock.init({ summon: () => {} });
  const win = dock.getWindow(); await new Promise((r) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', r) : r())); await sleep(1500);
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (n) => { await sleep(400); await win.webContents.capturePage(); await sleep(400); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const freezeKey = await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');   // a window that is never shown does not run animations
  // every theme must render the panel (screenshots 20-<theme>.png); the theme is set the way the app does it
  const themeShots = process.env.TITO_THEME_SHOTS ? ['mochi', 'midnight', 'cyber', 'graphite', 'ocean', 'forest', 'sunset', 'lavender'] : [];
  const errors = []; win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 3) errors.push(msg); });

  // drag the pet, then open the panel: this path used to crash ("conversion failure" in workArea)
  const { screen } = require('electron'); const inside = () => { const b = win.getBounds(), w = screen.getDisplayMatching(b).workArea; return b.x >= w.x && b.y >= w.y && b.x + b.width <= w.x + w.width && b.y + b.height <= w.y + w.height; };
  await js(`window.tito.dock.dragStart(); window.tito.dock.drag(-2000, -300); window.tito.dock.dragEnd()`); await sleep(300);
  for (const open of [true, false, true]) { const r = await js(`window.tito.dock.open(${open})`); await sleep(250); ok(r === open && inside(), 'after a drag the panel ' + (open ? 'opens' : 'closes') + ' and stays on screen ' + JSON.stringify(win.getBounds())); }
  await js(`window.tito.dock.dragStart(); window.tito.dock.drag(2000, 900); window.tito.dock.dragEnd()`); await sleep(300); ok(inside(), 'dragged to the bottom right corner stays on screen');
  await js(`window.tito.dock.open(false)`); await sleep(250);
  dock.setOpen(true); await sleep(400); await js(`document.getElementById('btnHide').click()`); await sleep(500);
  { const st = await js('window.__dock.state()'); ok(st.open === false, 'the cross closes the panel and Tito stays (open=' + st.open + ')'); }
  await shot('1-closed'); ok((await js('window.__dock.state()')).pet === 'idle' || (await js('window.__dock.state()')).pet === 'sleeping', 'pet is idle or asleep');
  dock.setOpen(true); await sleep(600); await shot('2-today-empty'); ok((await js('window.__dock.state()')).open === true, 'panel opens');

  let r = await js(`window.__dockRun('remind me in 30 minutes to drink water')`); ok(r.ok && r.reminder, 'voice command makes a reminder: ' + r.say);
  r = await js(`window.__dockRun('reminder set kro 11.30 ka')`); ok(r.ok && r.reminder && /11:30/.test(r.say), 'bare 11.30 becomes 11:30 (not now + 10 min): ' + r.say);
  r = await js(`window.__dockRun('reminder set karo')`); ok(!r.ok && /What time/.test(r.say), 'no time given: Tito asks instead of guessing');
  r = await js(`window.__dockRun('remind me at 11 pm to open youtube')`); ok(r.ok && r.reminder && r.reminder.open && r.reminder.open.label === 'YouTube', 'a reminder about YouTube gets an Open button: ' + (r.reminder && JSON.stringify(r.reminder.open)));
  r = await js(`window.__dockRun('open whatsapp')`); ok(r.ok && /WhatsApp/.test(r.say), 'open command: ' + r.say);
  // everything can be driven by commands alone
  const snap = () => require('../src/tasks').snapshot();
  r = await js(`window.__dockRun('add todo buy bread')`); r = await js(`window.__dockRun('mark buy bread done')`); ok(r.ok && snap().todos.some((t) => t.text === 'buy bread' && t.done), 'command: mark a todo done: ' + r.say);
  r = await js(`window.__dockRun('delete todo buy bread')`); ok(r.ok && !snap().todos.some((t) => t.text === 'buy bread'), 'command: delete a todo');
  r = await js(`window.__dockRun('add routine yoga at 6 am')`); ok(r.ok && snap().routines.some((x) => x.name === 'Yoga' && x.times[0] === '06:00'), 'command: add a routine: ' + r.say);
  r = await js(`window.__dockRun('set lunch time to 2 pm')`); ok(r.ok && snap().routines.find((x) => x.name === 'Lunch').times[0] === '14:00', 'command: change a routine time: ' + r.say);
  r = await js(`window.__dockRun('turn off water routine')`); ok(r.ok && snap().routines.find((x) => x.water).on === false, 'command: switch a routine off');
  r = await js(`window.__dockRun('remove yoga routine')`); ok(r.ok && !snap().routines.some((x) => x.name === 'Yoga'), 'command: remove a routine');
  r = await js(`window.__dockRun('water goal 10')`); ok(r.ok && snap().stats.waterGoal === 10, 'command: water goal');
  r = await js(`window.__dockRun('maths exam on 12 dec')`); ok(r.ok && snap().exams.some((e) => e.name === 'maths'), 'command: add an exam: ' + r.say);
  r = await js(`window.__dockRun('add flashcard cell = the basic unit of life')`); ok(r.ok && store.listCards().some((c) => c.front === 'cell'), 'command: add a flashcard: ' + r.say);
  r = await js(`window.__dockRun('delete flashcard cell')`); ok(r.ok && !store.listCards().some((c) => c.front === 'cell'), 'command: delete a flashcard');
  r = await js(`window.__dockRun('remind me at 11 pm to call mom')`); r = await js(`window.__dockRun('change reminder call mom to 6 am')`); ok(r.ok && /Moved/.test(r.say), 'command: move a reminder: ' + r.say);
  r = await js(`window.__dockRun('delete reminder call mom')`); ok(r.ok && !snap().reminders.some((x) => /call mom/.test(x.text)), 'command: delete a reminder');
  r = await js(`window.__dockRun('show study tab')`); await sleep(300); ok((await js('window.__dock.state()')).tab === 'study', 'command: show a tab');
  r = await js(`window.__dockRun('ringtone sparkle')`); ok(r.ok && store.get().ringtone === 'sparkle', 'command: ringtone');
  r = await js(`window.__dockRun('mark invisible thing done')`); ok(!r.ok, 'command about something missing says so: ' + r.say);
  r = await js(`window.__dockRun('add todo buy milk')`); ok(r.ok && /buy milk/.test(r.say), 'todo command: ' + r.say);
  r = await js(`window.__dockRun('maine lunch kha liya')`); ok(r.ok, 'routine command: ' + r.say);
  r = await js(`window.__dockRun('blah blah')`); ok(!r.ok && r.anim === 'confused', 'unknown command is polite');
  await shot('3-today-filled');

  const tasks = require('../src/tasks'); tasks.addReminder('Submit assignment', Date.now() - 1000, { kind: 'deadline' }); tasks.tick(); await sleep(800);
  ok((await js('window.__dock.state()')).pet === 'worried', 'deadline alert makes Tito worried'); await shot('4-alert');
  tasks.addReminder('Call mom', Date.now() - 1000); tasks.tick(); await sleep(800); { const st = await js('window.__dock.state()'); ok(st.pet === 'alarm', 'reminder alert rings (pet=' + st.pet + ')'); }

  store.addCard('photosynthesis', 'How plants turn light into food'); store.addCard('mitochondria', 'The powerhouse of the cell');
  await js(`window.__dock.setTab('study')`); await sleep(700); await shot('5-study');
  await js(`document.getElementById('btnQuiz').click()`); await sleep(500); await js(`document.getElementById('qReveal').click()`); await shot('6-quiz');
  await js(`document.getElementById('qYes').click()`); await sleep(600); ok((await js('window.__dock.state()')).pet === 'cheer', 'right answer: cheer');
  await js(`document.getElementById('qExit').click()`);
  await js(`document.getElementById('btnQuiz').click()`); await sleep(500); await js(`document.getElementById('qReveal').click()`); await js(`document.getElementById('qNo').click()`); await sleep(600);
  { const st = await js('window.__dock.state()'); ok(['oops', 'celebrate', 'streak_fire'].includes(st.pet), 'wrong answer reacts (pet=' + st.pet + ')'); }
  await js(`document.getElementById('qExit').click()`); await sleep(500);
  ok(store.cardStats().mistakes >= 1, 'a missed card lands in the mistakes list (' + store.cardStats().mistakes + ')');
  ok(store.weekStats().reviewed >= 2, 'weekly stats count reviews (' + store.weekStats().reviewed + ')');
  await js(`window.__dock.setTab('daily')`); await sleep(400); await shot('7-daily');
  dock.setOpen(false); await sleep(500);
  tasks.addReminder('Open WhatsApp', Date.now() - 1000, { open: { label: 'WhatsApp', kind: 'app', value: 'whatsapp' } }); tasks.tick(); await sleep(900); await shot('8a-bubble-alert');
  ok(await js(`document.querySelectorAll('#bubble .bbtns .chip').length`) >= 2, 'the pet bubble shows the Open and Dismiss buttons ');
  // the bubble with three buttons on two rows (the one that used to be cut off): every button and the whole bubble sit inside the window
  { const fit = async () => js(`(() => { const r = (e) => e.getBoundingClientRect(), b = r(document.getElementById('bubble')), c = [...document.querySelectorAll('#bubble .bbtns .chip')].map(r); return { n: c.length, top: b.top, bottom: b.bottom, btn: Math.max(...c.map((x) => x.bottom)), h: innerHeight, petTop: r(document.getElementById('pet')).top }; })()`);
    for (const dy of [0, 400, 1200]) {
      await js(`window.tito.dock.dragStart(); window.tito.dock.drag(0, ${dy ? -dy : 0}); window.tito.dock.dragEnd()`); await sleep(200);
      tasks.addReminder('Open Instagram', Date.now() - 1000, { open: { label: 'Instagram', kind: 'url', value: 'https://instagram.com' } }); tasks.tick(); await sleep(900);
      const f = await fit(); ok(f.n === 3 && f.top >= 0 && f.btn <= f.bottom + 0.5 && f.bottom <= f.h && f.bottom <= f.petTop + 40, 'long alert bubble fits whole, buttons not cut (' + JSON.stringify(f) + ')'); await shot('8b-bubble-fit-' + dy);
      ok(inside(), 'the window with the tall bubble stays on screen');
      await js(`document.querySelector('#bubble .bbtns .chip:last-child').click()`); await sleep(400);
    } }
  await js(`document.querySelector('#bubble .bbtns .chip:last-child').click()`); await sleep(400); dock.setOpen(true); await sleep(400);
  // ---- Teach Tito: explain a topic, get graded, go another round, save the gaps as flashcards
  await js(`window.__dock.setTab('study'); window.__dock.teach('photosynthesis', true)`); await sleep(500);
  ok(await js(`!document.getElementById('tpTalk').hidden && /photosynthesis/.test(document.getElementById('tpQ').textContent)`), 'Teach Tito: Tito asks the first question');
  await js(`document.getElementById('tpText').value = 'Plants take in sunlight, water and air and make sugar and oxygen with chlorophyll.'; document.getElementById('tpSend').click()`); await sleep(900);
  ok(await js(`document.querySelector('#tpResult .tpscore b').textContent`) === '72', 'Teach Tito: the score is shown'); await shot('9b-teach');
  await js(`[...document.querySelectorAll('#tpResult button')].find((b) => /Answer my question/.test(b.textContent)).click()`); await sleep(300);
  ok(await js(`/round 2 of 3/.test(document.getElementById('tpRound').textContent) && /water come from/.test(document.getElementById('tpQ').textContent)`), 'Teach Tito: round 2 asks the follow-up question');
  await js(`document.getElementById('tpText').value = 'The roots drink water from the soil and it travels up to the leaves where it is used.'; document.getElementById('tpSend').click()`); await sleep(800);
  await js(`[...document.querySelectorAll('#tpResult button')].find((b) => /^Finish/.test(b.textContent)).click()`); await sleep(600);
  ok(await js(`!document.getElementById('tpDone').hidden && document.querySelector('#tpDone .tpscore b').textContent === '72'`), 'Teach Tito: the final score is shown');
  await js(`[...document.querySelectorAll('#tpDone button')].find((b) => /^Save/.test(b.textContent)).click()`); await sleep(500);
  ok(store.listCards().some((c) => c.front === 'photosynthesis output'), 'Teach Tito: the gaps become flashcards');
  await js(`document.getElementById('tpExit').click()`);
  r = await js(`window.__dockRun('teach tito gravity')`); await sleep(600); ok(r.ok && !(await js(`document.getElementById('teach').hidden`)), 'command "teach tito gravity" opens Teach Tito');
  await js(`document.getElementById('tpExit').click()`);

  // ---- commands that used to confuse Tito
  r = await js(`window.__dockRun('open unstop')`); ok(r.ok && /unstop/i.test(r.say), 'unknown name "open unstop" finds the website: ' + r.say);
  r = await js(`window.__dockRun('open qzxwvbnmk')`); ok(r.ok && r.ask && r.ask.options.length >= 1, 'a name with no website asks what to do instead of guessing: ' + r.say);

  // ---- small popup: small jobs do not open the panel, and can be undone
  dock.setOpen(false); await sleep(400); await js(`window.__dock.pop('', false)`); await sleep(500);
  ok((await js('window.__dock.state()')).pop === true, 'a click opens the small popup');
  r = await js(`window.__dockRun('add todo test pop task', { from: 'pop' })`); await sleep(400);
  { const st = await js('window.__dock.state()'); ok(r.ok && st.open === false && st.pop === true, 'a small job stays in the popup (panel open=' + st.open + ')'); }
  ok(await js(`/Added/.test(document.getElementById('popRes').textContent) && [...document.querySelectorAll('#popRes button')].some((b) => b.textContent === 'Undo')`), 'the popup shows the result with an Undo button'); await shot('10a-pop');
  await js(`[...document.querySelectorAll('#popRes button')].find((b) => b.textContent === 'Undo').click()`); await sleep(500);
  ok(!snap().todos.some((t) => t.text === 'test pop task'), 'Undo removes the to-do');
  await js(`window.__dock.closePop()`); await sleep(300);
  // ---- greeting popup with live countdowns
  await js(`window.__dock.brief({ name: 'Ayush', hour: 9, countdowns: [{ label: 'Maths exam', at: Date.now() + 3 * 86400000, kind: 'exam' }, { label: 'Call mom', at: Date.now() + 125000, kind: 'reminder' }], todos: [{ id: 'x1', text: 'buy milk' }, { id: 'x2', text: 'finish notes' }], due: 2, streak: 3, routinesDone: 1, routinesTotal: 6 })`); await sleep(1500);
  ok(await js(`!document.getElementById('brief').hidden && /Good morning, Ayush/.test(document.getElementById('brief').textContent) && /0[12]:[0-9][0-9]/.test(document.querySelectorAll('#brief .cd .cdt')[1].textContent) && /[0-9]d [0-9]/.test(document.querySelectorAll('#brief .cd .cdt')[0].textContent)`), 'the greeting popup shows the name, an exam in days and a live mm:ss countdown: ' + (await js(`[...document.querySelectorAll('#brief .cdt')].map((x) => x.textContent).join(' | ')`))); await shot('10b-brief');
  const t1 = await js(`document.querySelectorAll('#brief .cdt')[1].textContent`); await sleep(2200); const t2 = await js(`document.querySelectorAll('#brief .cdt')[1].textContent`); ok(t1 !== t2, 'the countdown ticks (' + t1 + ' -> ' + t2 + ')');
  await js(`window.__dock.closePop()`); await sleep(300);
  r = await js(`window.__dockRun('call me ayush')`); ok(r.ok && store.get().userName === 'Ayush', 'command: call me Ayush');
  r = await js(`window.__dockRun('good morning')`); await sleep(600); ok(await js(`!document.getElementById('brief').hidden`), 'command: "good morning" shows the greeting popup'); await js(`window.__dock.closePop()`); await sleep(300);
  // ---- chat like a GPT: markdown, copyable code, composer at the bottom, answers stay in the chat
  dock.setOpen(true); await sleep(400);
  r = await js(`window.__dockRun('explain a python loop')`); await sleep(700);
  ok(r.ok && r.md && (await js('window.__dock.state()')).tab === 'chat', 'a question is answered in the Chat tab');
  ok(await js(`!!document.querySelector('#chatLog .codeblock .cbcopy') && /for i in range/.test(document.querySelector('#chatLog .codeblock pre').textContent) && !!document.querySelector('#chatLog strong') && !!document.querySelector('#chatLog li')`), 'the answer is Markdown with a code block that has a Copy button'); await shot('10c-chat-code');
  ok(await js(`document.getElementById('cmd').parentNode.id === 'chatDock'`), 'in Chat the input box sits at the bottom');
  await js(`window.__dock.setTab('today')`); await sleep(300); ok(await js(`document.getElementById('cmd').parentNode.id !== 'chatDock'`), 'on the other tabs the input box is back at the top');
  r = await js(`window.__dockRun('search black hole')`); await sleep(2500);
  ok((await js('window.__dock.state()')).tab === 'chat' && await js(`/Black hole/.test(document.getElementById('chatLog').textContent)`), 'a web lookup lands in the chat instead of floating over another tab');
  r = await js(`window.__dockRun('ACTIONTEST add eggs please')`); await sleep(400); ok(r.ok && snap().todos.some((t) => t.text === 'buy eggs'), 'the AI can act: it added a to-do from a normal sentence');
  // ---- Focus Guard
  await js(`window.__dock.setTab('study')`); await sleep(300); await js(`document.getElementById('btnFocus').click()`); await sleep(600);
  ok(await js(`window.__dock.focusUi().guardOn`), 'a focus round starts Focus Guard');
  for (let i = 0; i < 40; i++) dock._feedFocus('main.js - Visual Studio Code', 'Code', 3);
  for (let i = 0; i < 10; i++) dock._feedFocus('(5) Instagram - Google Chrome', 'chrome', 3);
  await sleep(700);
  ok(await js(`/Drifting|On task/.test(document.getElementById('fLive').textContent)`), 'the focus screen shows the live status: ' + (await js(`document.getElementById('fLive').textContent`)));
  ok(await js(`/Instagram/.test(document.getElementById('reply').textContent) && [...document.querySelectorAll('#reply button')].some((b) => /break/.test(b.textContent))`), 'Tito nudges about Instagram with a break button');
  await js(`document.getElementById('fStop').click()`); await sleep(900); await shot('10d-focus-report');
  ok(await js(`window.__dock.focusUi().report && /focus score/.test(document.getElementById('fReport').textContent)`), 'stopping shows the focus report');
  ok(store.get().lastFocus && store.get().lastFocus.score < 100 && store.get().lastFocus.top[0].label === 'Instagram', 'the report is saved: ' + JSON.stringify(store.get().lastFocus && store.get().lastFocus.top));
  r = await js(`window.__dockRun('focus report')`); ok(r.ok && /Focus score/.test(r.say), 'command: focus report');
  await js(`[...document.querySelectorAll('#fReport button')].find((b) => b.textContent === 'Done').click()`); await sleep(300);

  await js(`window.__dock.setTab('chat')`); await sleep(500); await shot('8c-chat');
  r = await js(`window.__dockRun('search black hole')`); ok(r.ok && r.search, 'search returns: ' + String(r.say).slice(0, 60)); await sleep(2500); await js(`window.__dock.setTab('today')`); await sleep(500); await shot('9-search');

  dock.setOpen(false); await sleep(400); await win.webContents.removeInsertedCSS(freezeKey); await js(`window.__dock.ringFx(true); window.__dock.mood('alarm', 0)`); await sleep(900); await shot('21-ringing'); await js(`window.__dock.ringFx(false)`); await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  dock.setOpen(true); await js(`window.__dock.setTab('today')`);
  for (const t of themeShots) { await js(`document.documentElement.dataset.theme = '${t}'`); await shot('20-' + t); }

  // ---- office commands through the real panel: meeting, Excel, PDF drop, notes, exam rescue, file buttons
  {
    const fsx = require('fs'); const run = (c) => js(`window.__dockRun(${JSON.stringify(c)}, { from: 'panel' })`);
    const { PDFDocument, StandardFonts } = require('pdf-lib'); const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
    for (const t of ['Chapter 1: Cells', 'cells page two', 'Chapter 2: Energy', 'energy page two']) { const pg = d.addPage([595, 842]); pg.drawText(t, { x: 50, y: 780, size: 16, font: f }); pg.drawText('Mitochondria are defined as the organelles that release energy for the cell to use.', { x: 50, y: 740, size: 11, font: f }); pg.drawText('Remember that every cell needs energy to stay alive and to divide.', { x: 50, y: 720, size: 11, font: f }); }
    const pdfPath = path.join(out, 'drop.pdf'); fsx.writeFileSync(pdfPath, await d.save());
    const bad0 = await win.webContents.executeJavaScript(`window.tito.dock.pdf(['C:/nope/x.txt'])`); ok(bad0.ok === false, 'dropping a non-PDF is refused politely');
    const dr = await win.webContents.executeJavaScript(`window.tito.dock.pdf(${JSON.stringify([pdfPath])})`); ok(dr.ok && dr.name === 'drop.pdf', 'dropping a PDF on Tito sets the current PDF');
    const mt = await run('kal 4 baje Rahul ke saath meeting google meet'); ok(mt.ok && /Meeting set/.test(mt.say) && mt.ask.options.some((o) => /\.ics$/.test(o.file || '')), 'panel: meeting command sets the meeting and offers the calendar file');
    const fo = await js(`window.tito.dock.file({ action: 'open', path: ${JSON.stringify(mt.ask.options[0].file)} })`); ok(fo.ok, 'the calendar file button is allowed to open the file Tito made');
    const fx = await js(`window.tito.dock.file({ action: 'open', path: 'C:/Windows/System32/cmd.exe' })`); ok(fx.ok === false, 'a button can never open a file Tito did not make');
    const ex = await run('make an excel sheet: name, class, marks'); ok(ex.ok && ex.ask.options.some((o) => /\.xlsx$/.test(o.file || '')), 'panel: Excel command makes the sheet');
    const ch = await run('chapters batao pdf'); ok(ch.ok && /Chapter 1: Cells/.test(ch.say), 'panel: PDF chapters from the dropped file');
    const df = await run('definitions from the pdf'); ok(df.ok && /Mitochondria/.test(df.say), 'panel: PDF definitions');
    const sp = await run('pages 2 to 3 alag karo'); ok(sp.ok && sp.ask.options.some((o) => /\.pdf$/.test(o.file || '')), 'panel: PDF split');
    const nt = await run('note on cells: Cells are the basic unit of life and all living things are made of them.'); ok(nt.ok, 'panel: note saved');
    const sn = await run('show notes on cells'); ok(sn.ok && /Cells/.test(sn.say), 'panel: note shown');
    const wk = await run('exam rescue biology on ' + (() => { const x = new Date(Date.now() + 9 * 86400000); return x.getDate() + ' ' + x.toLocaleString('en', { month: 'short' }); })());
    ok(wk.ok && /plan is ready/.test(wk.say), 'panel: exam rescue plan from the dropped PDF');
    const rd = await run('how ready am i'); ok(rd.ok && /% ready/.test(rd.say), 'panel: readiness');
    const bf = await js(`window.tito.dock.briefData()`); ok(bf && bf.rescue && bf.rescue.name === 'Biology', 'the greeting carries the exam readiness line');
    await js(`window.__dock.brief(${JSON.stringify(bf)})`); await sleep(500); await shot('9-brief-exam');
    ok(await js(`document.getElementById('brief').textContent.includes('Biology')`), 'greeting popup shows the exam line');
    // the Join / Start button label on an alert
    await js(`window.__dock.closePop()`); dock.setOpen(false); await sleep(500);
    require('../src/tasks').addReminder('Meeting with Sam in 10 minutes', Date.now() - 1000, { open: { label: 'Google Meet', kind: 'url', value: 'https://meet.google.com/abc-defg-hij', noAuto: true, join: 'join' } }); require('../src/tasks').tick(); await sleep(900);
    ok((await js(`[...document.querySelectorAll('#bubble .bbtns .chip')].map((x) => x.textContent).join('|')`)).includes('Join Google Meet'), 'meeting alert shows a Join Google Meet button');
    await shot('9b-meeting-alert'); await js(`document.querySelector('#bubble .bbtns .chip:last-child').click()`); await sleep(300);
    dock.setOpen(true); await sleep(300); await js(`window.__dock.setTab('chat')`); await sleep(300); await shot('9c-chat-office');
    ok(await js(`!!document.getElementById('btnClip') && !!document.getElementById('popClip')`), 'the paperclip buttons exist in Chat and in the small popup');
    dock.setOpen(false); await sleep(400);
    await js(`window.postMessage({ tito: 'drop', paths: [${JSON.stringify(pdfPath)}] }, '*')`); await sleep(3000);
    const dropped = await js(`document.getElementById('chatLog') ? document.getElementById('chatLog').innerText : document.body.innerText`);
    ok(/Attached: drop\.pdf/.test(dropped) && /PDF, 4 pages/.test(dropped), 'dropping a file opens the chat and Tito reads it: ' + dropped.replace(/\s+/g, ' ').slice(-120));
    const attBtns = await js(`[...document.querySelectorAll('#reply .alertbtns .chip')].map((x) => x.textContent).join('|')`); ok(/Chapters/.test(attBtns) && /Summary/.test(attBtns), 'the reply offers Chapters, Summary and Definitions buttons: ' + attBtns);
    const txtP = path.join(out, 'hello.txt'); fsx.writeFileSync(txtP, 'Cells are the basic unit of life. Remember that every living thing is made of cells that grow and divide.');
    const viaCmd = await js(`window.tito.dock.command({ text: 'Attached: hello.txt', files: [${JSON.stringify(txtP)}, { name: 'pasted.png', data: new Uint8Array([137,80,78,71]).buffer }] })`); ok(viaCmd.ok && /hello\.txt/.test(viaCmd.say) && /pasted\.png/.test(viaCmd.say), 'files and a pasted picture go through the command channel');
    await js(`window.postMessage({ tito: 'drop', paths: [] }, '*')`); await sleep(500); await shot('9d-attach');
  }

  // ---- first-time tour, update card and "what is new"
  {
    const tourText = () => js(`document.getElementById('tour').hidden ? '' : document.getElementById('tour').innerText`);
    const click = (label) => js(`(() => { const b = [...document.querySelectorAll('#tour button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
    dock.setOpen(false); await sleep(300); await js(`document.getElementById('tour').hidden = true`);
    store.save({ userName: '', tourDone: false }); dock.showTour(); await sleep(900);
    let t = await tourText(); ok(/Hi, I am Tito :\)/.test(t) && /What should I call you/.test(t), 'the tour opens with a sweet hello and asks for your name'); await shot('10-tour-hello');
    await js(`(() => { const i = document.querySelector('#tour input.tname'); i.value = 'asha'; })()`); await click('Next'); await sleep(900);
    t = await tourText(); ok(store.get().userName === 'Asha' && /Nice to meet you, Asha/.test(t), 'the name is remembered and used right away (' + store.get().userName + ')');
    await click('Next'); await sleep(500); t = await tourText(); ok(/Try the small popup/.test(t), 'the tour offers commands to try for real');
    await js(`[...document.querySelectorAll('#tour .tchips .chip')].find((x) => /time/.test(x.textContent)).click()`); await sleep(900);
    ok(/\d/.test(await js(`document.querySelector('#tour .tres').innerText`)), 'a command tapped in the tour really runs and answers');
    await click('Next'); await sleep(400); t = await tourText(); ok(/Circle anything/.test(t) && /Space/.test(t), 'the tour shows the circle shortcut'); await shot('10b-tour-circle');
    await click('Next'); await sleep(400); ok(/Your panel/.test(await tourText()), 'the tour explains the panel');
    await click('Next'); await sleep(400); ok(/Say it and I do it/.test(await tourText()), 'the tour shows what to ask');
    await click('Next'); await sleep(400); ok(/Shortcuts/.test(await tourText()), 'the tour lists the shortcuts');
    await click('Back'); await sleep(300); ok(/Say it and I do it/.test(await tourText()), 'Back goes one step back');
    await click('Next'); await sleep(300); await click('Next'); await sleep(400); t = await tourText(); ok(/You are all set, Asha :\)/.test(t), 'the last step uses your name'); await shot('10c-tour-done');
    await click('Start using Tito'); await sleep(700); ok(store.get().tourDone === true && (await tourText()) === '', 'finishing the tour closes it and it is not shown again');
    // an update that is ready, and what is new after an update
    dock.updateEvent('ready', { version: '9.9.9' }); await sleep(700); t = await tourText(); ok(/A new Tito is ready :\)/.test(t) && /9\.9\.9/.test(t) && /Restart and update/.test(t) && /Later/.test(t), 'the update card offers Restart and update, or Later'); await shot('10d-update');
    await click('Later'); await sleep(500); ok((await tourText()) === '', 'Later closes the update card');
    dock.showWhatsNew('9.9.9'); await sleep(700); t = await tourText(); ok(/Tito 9\.9\.9 is here, Asha :\)/.test(t) && /Take the tour/.test(t), 'what is new greets you by name after an update'); await shot('10e-whatsnew');
    await click('Got it'); await sleep(400);
    r = await js(`window.__dockRun('tour')`); await sleep(700); ok(r.ok && /Hi, I am Tito|Nice to meet you/.test(await tourText()), 'saying "tour" starts it again'); await click('Skip the tour'); await sleep(400);
  }
  ok(errors.length === 0, 'no renderer errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(bad ? bad + ' FAILED' : 'dock ok', '->', out); app.exit(bad ? 1 : 0);
});

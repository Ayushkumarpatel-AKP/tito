// electron tools/test-dock.js <out dir> : drives the dock in a window that is never shown, saves screenshots, checks the logic.
process.env.TITO_DOCK_HIDDEN = '1'; process.env.GEMINI_API_KEY = ''; process.env.GROQ_API_KEY = '';   // no AI in tests: unknown commands must fail politely
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'tito-dock-')); fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'tito-ud-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };

app.whenReady().then(async () => {
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
  r = await js(`window.__dockRun('show media tab')`); await sleep(300); ok((await js('window.__dock.state()')).tab === 'media', 'command: show a tab');
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
  await js(`window.__dock.setTab('media')`); await sleep(400); await shot('8-media');
  dock.setOpen(false); await sleep(500);
  tasks.addReminder('Open WhatsApp', Date.now() - 1000, { open: { label: 'WhatsApp', kind: 'app', value: 'whatsapp' } }); tasks.tick(); await sleep(900); await shot('8a-bubble-alert');
  ok(await js(`document.querySelectorAll('#bubble .bbtns .chip').length`) >= 2, 'the pet bubble shows the Open and Dismiss buttons ');
  await js(`document.querySelector('#bubble .bbtns .chip:last-child').click()`); await sleep(400); dock.setOpen(true); await sleep(400);
  // the YouTube player must either play or say why it cannot, never show a black box
  await js(`window.__dock.setTab('media'); window.__dock.playVideo({ id: 'jNQXAC9IVRw', title: 'Test video', channel: 'test' })`);
  let yt = null; for (let i = 0; i < 16; i++) { await sleep(1000); yt = await js(`({ ...window.__dock.yt(), err: !!document.querySelector('.playerr') })`); if (yt.ready || yt.err) break; }
  ok(yt && (yt.ready || yt.err), 'the player is ready or shows a message: ' + JSON.stringify(yt)); await shot('8d-player');
  await js(`window.__dock.setTab('chat')`); await sleep(500); await shot('8c-chat');
  r = await js(`window.__dockRun('search black hole')`); ok(r.ok && r.search, 'search returns: ' + String(r.say).slice(0, 60)); await sleep(2500); await js(`window.__dock.setTab('today')`); await sleep(500); await shot('9-search');
  r = await js(`window.__dockRun('play lofi on youtube')`); ok(r.ok, 'play without a YouTube key falls back: ' + r.say);

  dock.setOpen(false); await sleep(400); await win.webContents.removeInsertedCSS(freezeKey); await js(`window.__dock.ringFx(true); window.__dock.mood('alarm', 0)`); await sleep(900); await shot('21-ringing'); await js(`window.__dock.ringFx(false)`); await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  dock.setOpen(true); await js(`window.__dock.setTab('today')`);
  for (const t of themeShots) { await js(`document.documentElement.dataset.theme = '${t}'`); await shot('20-' + t); }
  ok(errors.length === 0, 'no renderer errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(bad ? bad + ' FAILED' : 'dock ok', '->', out); app.exit(bad ? 1 : 0);
});

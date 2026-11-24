// electron tools/shot-site.js <url> <outDir> [width height] [--sections]
// Screenshots a page of our own (the website) at the top of every section. Progress goes to %TEMP%/shot-trace.txt.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const trace = (m) => fs.appendFileSync(path.join(os.tmpdir(), 'shot-trace.txt'), m + '\n');
process.on('uncaughtException', (e) => { trace('UNCAUGHT ' + (e && e.stack)); app.exit(2); });
process.on('unhandledRejection', (e) => { trace('REJECTION ' + ((e && e.stack) || e)); app.exit(3); });

// settings come from the environment (SHOT_URL, SHOT_OUT, SHOT_W, SHOT_H, SHOT_SECTIONS=1): Electron mishandles some argument mixes
const args = process.argv.slice(2);
const flags = process.env.SHOT_SECTIONS ? ['--sections'] : [];
const url = process.env.SHOT_URL, out = process.env.SHOT_OUT, W = process.env.SHOT_W || '1440', H = process.env.SHOT_H || '900';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
trace('boot ' + args.join(' '));

app.whenReady().then(async () => {
  trace('ready');
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: +W, height: +H, show: true, x: 0, y: 0, frame: false, webPreferences: { backgroundThrottling: false } });
  const logs = [];
  win.webContents.on('console-message', (...a) => {
    const d = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2] };
    logs.push(`${d.level}: ${d.message}`);
  });
  trace('window');
  await win.loadURL(url);
  trace('loaded');
  await sleep(3500);
  const total = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
  const marks = flags.includes('--sections')
    ? await win.webContents.executeJavaScript("[...document.querySelectorAll('main > section, footer')].map((s) => [s.id || 'footer', Math.round(s.getBoundingClientRect().top + scrollY)])")
    : [['top', 0]];
  let n = 0;
  for (const [name, y] of marks) {
    await win.webContents.executeJavaScript(`window.scrollTo(0, ${Math.max(0, y - 40)})`);
    await sleep(1800);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${String(n++).padStart(2, '0')}_${name}.png`), img.toPNG());
    trace('shot ' + name);
  }
  fs.writeFileSync(path.join(out, 'log.txt'), `page height ${total}\n` + logs.join('\n'));
  trace('done');
  app.exit(0);
});

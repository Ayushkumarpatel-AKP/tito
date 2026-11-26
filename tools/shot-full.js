// SHOT_FULL=1 SHOT_URL=<url> SHOT_OUT=<file.png> ... gives one tall picture (needs a page that honours prefers-reduced-motion).
// SHOT_URL=<url> SHOT_OUT=<folder> [SHOT_W=1440] [SHOT_H=900] npx electron tools/shot-full.js
// Scrolls a page from top to bottom and saves one picture of every screenful (slice-01.png, slice-02.png ...). The window is never shown.
// A page with scroll-pinned animations cannot be captured in one go ("captureBeyondViewport" leaves the pinned parts empty), so the slices are
// stitched into one long picture afterwards (see tools/stitch.py).
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = process.env.SHOT_URL, out = process.env.SHOT_OUT, W = +process.env.SHOT_W || 1440, H = +process.env.SHOT_H || 900;   // environment, because Electron mishandles some command-line mixes
app.disableHardwareAcceleration();
process.on('unhandledRejection', (e) => { console.log('FAILED', e && e.stack); app.exit(1); });
app.whenReady().then(async () => {
  if (!process.env.SHOT_FULL) fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  await win.loadURL(url); await sleep(3500);
  const wc = win.webContents;
  if (process.env.SHOT_FULL) {                                                 // one tall picture: ask the page for its calm, unpinned layout (prefers-reduced-motion), then capture it all
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await win.loadURL(url); await sleep(3000);
    let h = await wc.executeJavaScript('document.documentElement.scrollHeight');
    for (let y = 0; y < h; y += 600) { await wc.executeJavaScript(`window.scrollTo(0, ${y})`); await sleep(250); h = await wc.executeJavaScript('document.documentElement.scrollHeight'); }
    await wc.executeJavaScript('window.scrollTo(0, 0)'); await sleep(1500);
    h = Math.min(16000, await wc.executeJavaScript('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)'));
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(1200);
    const shot = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: h, scale: 1 } });
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(shot.data, 'base64')); console.log('saved', out, W + 'x' + h); app.quit(); return;
  }
  if (process.env.SHOT_REDUCED) {                                              // calm layout: scroll-pinned scenes become plain stacked sections
    wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await win.loadURL(url); await sleep(3500);
  }
  const total = await wc.executeJavaScript('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
  let i = 0; const ys = []; let end = total;
  for (let y = 0; y < end - 5; y += H - 100) {                              // 100 px of overlap, so nothing is lost between two pictures
    await wc.executeJavaScript(`window.scrollTo(0, ${y})`); await sleep(1100);
    const img = await wc.capturePage(); i++;
    fs.writeFileSync(path.join(out, `slice-${String(i).padStart(2, '0')}.png`), img.toPNG());
    ys.push(await wc.executeJavaScript('Math.round(window.scrollY)')); end = await wc.executeJavaScript('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
  }
  fs.writeFileSync(path.join(out, 'slices.json'), JSON.stringify({ ys, total: end, h: H, w: W }));
  console.log('saved', i, 'slices, page height', total, 'viewport', W + 'x' + H);
  app.quit();
});

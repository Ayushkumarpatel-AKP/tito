// Offline text recognition using the OCR engine built into Windows 10/11 (no internet, no download).
// Languages come from the user's Windows language list (Settings > Time & language > Language & region).
// A helper PowerShell process stays alive after the first picture, so later pictures take a fraction of a second instead of ~2 seconds.
const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = () => path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), app.isPackaged ? 'app.asar.unpacked' : '', 'src', 'ocr.ps1');
const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'];

// ---- the long-lived helper
let srv = null, buf = '', idle = null; const queue = [];
const b64text = (s) => Buffer.from(s, 'base64').toString('utf8');
function stop() { clearTimeout(idle); const p = srv; srv = null; if (p) { try { p.stdin.end(); p.kill(); } catch { /* already gone */ } } }
function start() {
  buf = ''; const p = spawn('powershell.exe', [...PS, script(), '-Server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); srv = p;
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); const job = queue.shift(); if (!job) continue; clearTimeout(job.timer);
      if (line.startsWith('OK:')) job.resolve(b64text(line.slice(3)).replace(/\s+/g, ' ').trim()); else job.reject(Object.assign(new Error(b64text(line.slice(4)) || 'OCR failed'), { final: true }));
    }
  });
  p.on('error', () => {});
  p.on('exit', () => { if (srv === p) srv = null; for (const j of queue.splice(0)) { clearTimeout(j.timer); j.reject(new Error('The OCR helper stopped')); } });
}
function viaHelper(file) {
  return new Promise((resolve, reject) => {
    if (!srv) start();
    const job = { resolve, reject, timer: setTimeout(() => { stop(); reject(new Error('OCR timed out')); }, 25000) };
    queue.push(job); srv.stdin.write(file + '\n');
    clearTimeout(idle); idle = setTimeout(stop, 4 * 60000);                    // let go of the memory after a few quiet minutes
  });
}
function oneShot(file) {                                                       // the slow, always-works way
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [...PS, script(), '-Path', file], { windowsHide: true, timeout: 20000, encoding: 'utf8' }, (err, out, errOut) => {
      if (err) return reject(new Error((errOut || err.message || 'OCR failed').toString().trim().split('\n')[0]));
      resolve(String(out).replace(/\s+/g, ' ').trim());
    });
  });
}

/** @param {string} b64 base64 image data (jpeg/png). Resolves to the recognised text ('' if none). */
async function recognize(b64) {
  const tmp = path.join(os.tmpdir(), `tito-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`);
  fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
  try {
    try { return await viaHelper(tmp); } catch (e) { if (e.final) throw e; }   // a real answer (such as "no OCR language") is final; a crashed helper falls back
    return await oneShot(tmp);
  } finally { fs.rm(tmp, { force: true }, () => {}); }
}
app.on('will-quit', stop);
module.exports = { recognize, stop };

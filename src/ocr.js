// Offline text recognition using the OCR engine built into Windows 10/11 (no internet, no download).
// Languages come from the user's Windows language list (Settings > Time & language > Language & region).
const { app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = () => path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), app.isPackaged ? 'app.asar.unpacked' : '', 'src', 'ocr.ps1');

/** @param {string} b64 base64 image data (jpeg/png). Resolves to the recognised text ('' if none). */
function recognize(b64) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `tito-ocr-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
    const done = (err, out, errOut) => {
      fs.rm(tmp, { force: true }, () => {});
      if (err) return reject(new Error((errOut || err.message || 'OCR failed').toString().trim().split('\n')[0]));
      resolve(String(out).replace(/\s+/g, ' ').trim());
    };
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script(), '-Path', tmp],
      { windowsHide: true, timeout: 20000, encoding: 'utf8' }, done);
  });
}
module.exports = { recognize };

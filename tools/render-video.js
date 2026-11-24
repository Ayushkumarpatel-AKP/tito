// electron tools/render-video.js   (settings from the environment, see below)
// Renders website/video.html frame by frame (window.seek(t)), pipes the frames to ffmpeg, then mixes the narration
// (website/video-src/audio/*.mp3 placed at window.__starts) and a very quiet pad into website/public/tito-demo.mp4.
//   VIDEO_URL  page to render        (default http://localhost:4173/video.html)
//   VIDEO_FPS  frames per second     (default 30)
//   VIDEO_MAX  stop after N seconds  (for quick tests)
const { app, BrowserWindow } = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'website');
const AUDIO = path.join(ROOT, 'video-src', 'audio');
const OUT = path.join(ROOT, 'public');
const TMP = path.join(os.tmpdir(), 'tito-video');
const URL = process.env.VIDEO_URL || 'http://localhost:4173/video.html';
const FPS = Number(process.env.VIDEO_FPS || 30);
const trace = (m) => fs.appendFileSync(path.join(os.tmpdir(), 'video-trace.txt'), m + '\n');
process.on('uncaughtException', (e) => { trace('UNCAUGHT ' + (e && e.stack)); app.exit(2); });
process.on('unhandledRejection', (e) => { trace('REJECTION ' + ((e && e.stack) || e)); app.exit(3); });

const run = (args) => { const r = spawnSync('ffmpeg', args, { encoding: 'utf8' }); if (r.status !== 0) { trace('ffmpeg failed: ' + (r.stderr || '').slice(-600)); throw new Error('ffmpeg failed'); } };

app.whenReady().then(async () => {
  fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  trace('start ' + URL);
  const win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, frame: false, x: 0, y: 0, resizable: false, webPreferences: { backgroundThrottling: false, zoomFactor: 1 } });
  await win.loadURL(URL);
  await win.webContents.executeJavaScript('window.__ready');
  const starts = await win.webContents.executeJavaScript('window.__starts');
  let duration = await win.webContents.executeJavaScript('window.__duration');
  if (process.env.VIDEO_MAX) duration = Math.min(duration, Number(process.env.VIDEO_MAX));
  const frames = Math.ceil(duration * FPS);
  trace(`duration ${duration.toFixed(2)}s, ${frames} frames, starts ${starts.map((s) => s.toFixed(2)).join(',')}`);

  // 1. frames -> silent video
  const silent = path.join(TMP, 'silent.mp4');
  let ff = null, size = null;
  for (let i = 0; i < frames; i++) {
    await win.webContents.executeJavaScript(`window.seek(${(i / FPS).toFixed(4)})`);
    const img = await win.webContents.capturePage();
    if (!ff) {
      size = img.getSize();
      trace(`frame size ${size.width}x${size.height}`);
      ff = spawn('ffmpeg', ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${size.width}x${size.height}`, '-r', String(FPS), '-i', '-',
        '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'ignore', 'ignore'] });
    }
    if (!ff.stdin.write(img.toBitmap())) await new Promise((r) => ff.stdin.once('drain', r));
    if (i === Math.round((starts[3] + 3.4) * FPS)) fs.writeFileSync(path.join(TMP, 'poster.png'), img.toPNG());
    if (i % 90 === 0) trace(`frame ${i}/${frames}`);
  }
  await new Promise((r) => { ff.on('close', r); ff.stdin.end(); });
  trace('silent video done');

  // 2. narration at the scene starts + a very quiet pad, then mux
  const mp3 = fs.readdirSync(AUDIO).filter((f) => f.endsWith('.mp3'));
  const order = JSON.parse(fs.readFileSync(path.join(AUDIO, 'timing.json'), 'utf8')).map((l) => l.key + '.mp3');
  const inputs = ['-i', silent]; order.forEach((f) => inputs.push('-i', path.join(AUDIO, f)));
  const pad = `aevalsrc=0.020*sin(2*PI*196*t)+0.016*sin(2*PI*246.94*t)+0.014*sin(2*PI*293.66*t)+0.010*sin(2*PI*392*t):s=44100:d=${duration.toFixed(2)}`;
  inputs.push('-f', 'lavfi', '-i', pad);
  const padIdx = order.length + 1;
  const delays = order.map((_, i) => `[${i + 1}:a]adelay=${Math.round(starts[i] * 1000)}|${Math.round(starts[i] * 1000)},volume=1.0[v${i}]`).join(';');
  const voiceMix = `${order.map((_, i) => `[v${i}]`).join('')}amix=inputs=${order.length}:normalize=0[voice]`;
  const padChain = `[${padIdx}:a]lowpass=f=700,tremolo=f=0.18:d=0.5,afade=t=in:d=2,afade=t=out:st=${(duration - 2.5).toFixed(2)}:d=2.5,volume=0.55[pad]`;
  const final = `[voice][pad]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  run(['-y', ...inputs, '-filter_complex', [delays, voiceMix, padChain, final].join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-b:a', '160k', '-t', duration.toFixed(2), '-movflags', '+faststart', path.join(OUT, 'tito-demo.mp4')]);
  if (fs.existsSync(path.join(TMP, 'poster.png'))) run(['-y', '-i', path.join(TMP, 'poster.png'), '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', path.join(OUT, 'poster.jpg')]);
  trace('done ' + fs.statSync(path.join(OUT, 'tito-demo.mp4')).size + ' bytes');
  void mp3;
  app.exit(0);
});

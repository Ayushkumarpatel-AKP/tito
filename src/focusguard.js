// Focus Guard: while a focus round runs, Tito notices when you wander off to something distracting and nudges you back, then gives a focus report.
// Privacy: it reads only the title and program name of the window in front, on this PC, once every few seconds. Nothing is stored except
// the summary of a session (minutes, score, the names of the top distractions) and nothing is ever sent anywhere.
const { spawn } = require('child_process');

const DEFAULT_BAD = ['instagram', 'facebook', 'twitter', 'reddit', 'netflix', 'prime video', 'hotstar', 'disney', 'snapchat', 'tiktok', 'steam', 'valorant', 'roblox', 'minecraft', 'pubg', 'genshin', 'fortnite', 'epic games', 'bgmi', 'free fire', 'spotify wrapped', 'twitch', 'pinterest', 'wizard101'];
// YouTube is dual use: it only counts as a distraction when the title does not look like studying.
const STUDY_WORDS = ['lecture', 'tutorial', 'course', 'lesson', 'class', 'physics', 'chemistry', 'maths', 'math ', 'mathematics', 'biology', 'study', 'notes', 'lofi', 'khan academy', 'nptel', 'coursera', 'udemy', 'leetcode', 'geeksforgeeks', 'revision', 'exam', 'chapter', 'solution', 'explained', 'how to', 'documentation', 'stack overflow', 'github'];
const LABELS = { chrome: 'your browser', msedge: 'your browser', firefox: 'your browser', brave: 'your browser', opera: 'your browser' };

const words = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
/** { kind: 'task' | 'distract', label } for the window in front. */
function classify(title, proc, extra = []) {
  const t = String(title || '').toLowerCase(), p = String(proc || '').toLowerCase();
  if (!t && !p) return { kind: 'task', label: '' };
  if (/^(tito|electron)$/.test(p)) return { kind: 'task', label: 'Tito' };
  const studying = STUDY_WORDS.some((w) => t.includes(w));
  const hit = [...DEFAULT_BAD, ...extra].find((w) => t.includes(w) || p.includes(w.replace(/\s+/g, '')));
  if (hit && !(studying && !extra.includes(hit))) return { kind: 'distract', label: hit.replace(/\b\w/g, (c) => c.toUpperCase()) };
  if (/youtube/.test(t) && !studying) return { kind: 'distract', label: 'YouTube' };
  return { kind: 'task', label: LABELS[p] || (p ? p : '') };
}

/** One focus round. feed() is called every few seconds with the front window; it reports through onNudge / onLive. */
function createSession({ words: extraRaw = '', nudgeAfter = 25, nudgeGap = 90, onNudge = () => {}, onLive = () => {} } = {}) {
  const extra = words(extraRaw); const s = { onSec: 0, badSec: 0, streak: 0, lastNudgeAt: -1e9, t: 0, pausedUntil: 0, nudges: 0, apps: {} };
  return {
    feed(title, proc, dt = 3) {
      s.t += dt; const c = classify(title, proc, extra);
      if (s.t < s.pausedUntil) { onLive({ state: 'break', label: 'Break', ...totals() }); return c; }   // a break: nothing is counted
      if (c.kind === 'distract') { s.badSec += dt; s.streak += dt; s.apps[c.label] = (s.apps[c.label] || 0) + dt; } else { s.onSec += dt; s.streak = 0; }
      if (s.streak >= nudgeAfter && s.t - s.lastNudgeAt >= nudgeGap) { s.lastNudgeAt = s.t; s.nudges++; onNudge({ label: c.label, secs: Math.round(s.streak) }); }
      onLive({ state: c.kind, label: c.label, ...totals() }); return c;
    },
    pause(sec) { s.pausedUntil = s.t + sec; s.streak = 0; },
    report() {
      const total = s.onSec + s.badSec; const top = Object.entries(s.apps).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, sec]) => ({ label, sec: Math.round(sec) }));
      return { minutes: Math.round(total / 60), onSec: Math.round(s.onSec), badSec: Math.round(s.badSec), score: total ? Math.round((100 * s.onSec) / total) : 100, top, nudges: s.nudges };
    },
  };
  function totals() { const total = s.onSec + s.badSec; return { score: total ? Math.round((100 * s.onSec) / total) : 100, onMin: Math.round(s.onSec / 60), badMin: Math.round(s.badSec / 60) }; }
}

// ---- reading the front window (Windows): one hidden PowerShell that prints "program|title" every 3 seconds until stopped
const SCRIPT = `Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($true) { $h = [W]::GetForegroundWindow(); $sb = New-Object Text.StringBuilder 300; [void][W]::GetWindowText($h, $sb, 300); $p = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$p); $n = ''; try { $n = (Get-Process -Id $p).ProcessName } catch {}; Write-Output ($n + '|' + $sb.ToString()); Start-Sleep -Seconds 3 }`;
let poller = null;
function startPoller(onWindow) {
  stopPoller();
  const enc = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  poller = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', enc], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = ''; poller.stdout.setEncoding('utf8');
  poller.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); const k = line.indexOf('|'); if (k >= 0) onWindow(line.slice(k + 1), line.slice(0, k)); } });
  poller.on('error', () => { poller = null; }); poller.on('exit', () => { poller = null; });
}
function stopPoller() { if (poller) { try { poller.kill(); } catch { /* already gone */ } poller = null; } }

module.exports = { classify, createSession, startPoller, stopPoller, DEFAULT_BAD };

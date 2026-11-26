// Meeting Maker: "kal 4 baje Rahul ke saath meeting, Google Meet" -> reminders (10 minutes before and at the time, with a Join button)
// and a calendar file (.ics) that Outlook, Google Calendar, Apple Calendar and phones import with one click. No key needed.
const PROVIDERS = [
  { re: /\b(google\s*meet|gmeet|g\s*meet|meet\.google)\b/i, name: 'Google Meet', link: 'https://meet.google.com/new' },
  { re: /\bzoom\b/i, name: 'Zoom', link: 'https://zoom.us/join' },
  { re: /\b(microsoft\s*teams|ms\s*teams|teams)\b/i, name: 'Microsoft Teams', link: 'https://teams.microsoft.com/' },
  { re: /\bwebex\b/i, name: 'Webex', link: 'https://web.webex.com/' },
  { re: /\bdiscord\b/i, name: 'Discord', link: 'https://discord.com/channels/@me' },
];
const NOT_NAME = new Set(['kal', 'aaj', 'parso', 'tomorrow', 'today', 'tonight', 'baje', 'at', 'on', 'pm', 'am', 'set', 'schedule', 'book', 'fix', 'create', 'add', 'plan', 'a', 'an', 'the', 'my', 'meeting', 'meet', 'call', 'zoom', 'google', 'gmeet', 'teams', 'microsoft', 'ek', 'mera', 'meri', 'ki', 'ka', 'ke', 'liye', 'hai', 'ho', 'kro', 'karo', 'kar', 'do', 'next', 'this', 'with', 'and', 'for', 'video', 'online', 'subah', 'shaam', 'raat', 'dopahar', 'morning', 'evening', 'night', 'afternoon', 'me', 'mein', 'se', 'i', 'have', 'need', 'want', 'to', 'please', 'tito']);
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Finds who the meeting is with: "with Rahul", "Rahul ke saath", "meeting with Priya Sharma". */
function personOf(text) {
  let m = text.match(/\bwith\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})/i);
  if (m) { const words = []; for (const w of m[1].split(/\s+/)) { if (NOT_NAME.has(w.toLowerCase()) || /^\d/.test(w)) break; words.push(w); } if (words.length) return titleCase(words.join(' ')); }
  m = text.match(/((?:[A-Za-z][A-Za-z.'-]*\s+){0,2}[A-Za-z][A-Za-z.'-]*)\s+(?:ke\s+saath|ke\s+sath|ke\s+sang|se)\b/i);
  if (m) { const words = m[1].split(/\s+/); const out = []; for (let i = words.length - 1; i >= 0; i--) { if (NOT_NAME.has(words[i].toLowerCase()) || /^\d/.test(words[i])) break; out.unshift(words[i]); } if (out.length) return titleCase(out.join(' ')); }
  return '';
}

/** Everything the text says about the meeting. `when` is the result of intent.parseWhen. */
function describe(text, when) {
  const url = (text.match(/https?:\/\/[^\s]+/i) || [''])[0].replace(/[),.;]+$/, '');
  const prov = PROVIDERS.find((p) => p.re.test(text)) || (url ? { name: /meet\.google/.test(url) ? 'Google Meet' : /zoom\./.test(url) ? 'Zoom' : /teams\./.test(url) ? 'Microsoft Teams' : 'Meeting link', link: url } : null);
  const who = personOf(text);
  const about = (text.match(/\b(?:about|regarding|topic|agenda)\s*[:\-]?\s+(.+?)(?:\s+(?:at|on|via|tomorrow|today|kal|aaj)\b|[,.]|$)/i) || [])[1] || '';
  const dur = text.match(/\b(\d+)\s*(min|minutes?|mins|hours?|hrs?|ghanta|ghante)\b/i);
  const durMin = dur ? Math.max(5, Math.min(480, +dur[1] * (/^(h|g)/i.test(dur[2]) ? 60 : 1))) : 30;
  const base = who ? 'Meeting with ' + who : prov && prov.name !== 'Meeting link' ? prov.name + ' meeting' : 'Meeting';
  return { title: about ? base + ': ' + titleCase(about.trim()).slice(0, 50) : base, who, provider: prov ? prov.name : '', link: url || (prov ? prov.link : ''), hasRealLink: !!url, durMin, at: when ? when.at : 0 };
}

// ---- calendar file ----------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const utc = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) { const out = []; let b = Buffer.from(line, 'utf8'); while (b.length > 74) { let cut = 74; while (cut > 0 && (b[cut] & 0xc0) === 0x80) cut--; out.push(b.slice(0, cut).toString('utf8')); b = Buffer.concat([Buffer.from(' '), b.slice(cut)]); } out.push(b.toString('utf8')); return out.join('\r\n'); }

function makeIcs(m) {
  const end = m.at + m.durMin * 60000, uid = `${m.at}-${Math.random().toString(36).slice(2, 8)}@tito`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tito//Meeting Maker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + uid, 'DTSTAMP:' + utc(Date.now()), 'DTSTART:' + utc(m.at), 'DTEND:' + utc(end), 'SUMMARY:' + icsEsc(m.title),
    'DESCRIPTION:' + icsEsc((m.provider ? m.provider + (m.hasRealLink ? '\n' + m.link : '\nOpen the app or link to start or join.') : 'Set up with Tito.')),
    ...(m.hasRealLink ? ['LOCATION:' + icsEsc(m.link), 'URL:' + m.link] : m.provider ? ['LOCATION:' + icsEsc(m.provider)] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(m.title + ' in 10 minutes'), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { describe, makeIcs, personOf, PROVIDERS };

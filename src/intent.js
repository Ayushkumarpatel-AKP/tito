// Turns a spoken or typed command (English, Hindi or Hinglish) into an action for Tito. Pure rules, so it also works offline.
// parse(text, now) -> { type, ... } where type is one of
//   reminder | todo | routine | play | media | search | quiz | dock | circle | unknown
const NUM_WORDS = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, four: 4, paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10, gyarah: 11, eleven: 11, barah: 12, twelve: 12, aadha: 0.5, half: 0.5 };
const num = (s) => { s = String(s).toLowerCase(); return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NUM_WORDS[s]; };
const NUMRE = '(\\d+(?:\\.\\d+)?|' + Object.keys(NUM_WORDS).join('|') + ')';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const WEEKDAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
/** "12 dec", "dec 12 2026", "12/12", "next friday": days from today plus the phrase to cut out. */
function parseDay(t, now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0); let m, d = null, cut = '';
  if ((m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*(?:,?\s+(20\d\d))?\b/))) { d = new Date(+(m[3] || today.getFullYear()), MONTHS[m[2]], +m[1]); cut = m[0]; if (!m[3] && d < today) d.setFullYear(d.getFullYear() + 1); }
  else if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?\b/))) { d = new Date(+(m[3] || today.getFullYear()), MONTHS[m[1]], +m[2]); cut = m[0]; if (!m[3] && d < today) d.setFullYear(d.getFullYear() + 1); }
  else if ((m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)) && +m[2] <= 12 && +m[1] <= 31) { const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : today.getFullYear(); d = new Date(y, +m[2] - 1, +m[1]); cut = m[0]; if (!m[3] && d < today) d.setFullYear(d.getFullYear() + 1); }
  else if ((m = t.match(/\b(next\s+|this\s+|coming\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)\b/))) {
    const wd = WEEKDAYS[m[2]]; let diff = (wd - today.getDay() + 7) % 7; if (diff === 0) diff = 7;      // the coming one; "friday" said on a friday means next week
    d = new Date(today); d.setDate(d.getDate() + diff); cut = m[0];
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return { offset: Math.round((d - today) / 86400000), cut };
}

/** Finds a time phrase. Returns { at: epoch ms, cut: the phrase to remove from the text } or null. */
function parseWhen(text, now = new Date()) {
  const t = text.toLowerCase(); let m;
  if ((m = t.match(new RegExp(`\\b(?:in\\s+)?${NUMRE}\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|ghante|ghanta|minat)\\s*(?:baad|mein|me|later|ke baad)?`)))
      && (/\bin\b/.test(m[0]) || /baad|later|mein|me\b/.test(m[0]))) {
    const n = num(m[1]); const u = m[2]; const ms = /^(sec|second)/.test(u) ? 1000 : /^(min|minat)/.test(u) ? 60000 : 3600000;
    if (n) return { at: now.getTime() + n * ms, cut: m[0] };
  }
  let day = null, cutDay = '';
  if ((m = t.match(/\b(tomorrow|kal|parso|day after tomorrow|today|aaj|tonight|aaj raat)\b/))) {
    cutDay = m[0]; day = /tomorrow|kal/.test(m[1]) && !/parso/.test(m[1]) ? 1 : /day after|parso/.test(m[1]) ? 2 : 0;
    if (/tonight|raat/.test(m[1])) day = 0;
  }
  if (day === null) { const pd = parseDay(t, now); if (pd) { day = pd.offset; cutDay = pd.cut; } }
  // clock times: "5 pm", "5:30", "11.30", "5 baje", "11.30 ka", "at 6", "raat 11 baje"
  // separators people really type between hour and minute: 1:05  1.05  1;05  1,05  or a space before am/pm (1 05 am), or 105 am
  const CLOCK = /(?:\b(?:at|ko|by|for)\s+)?\b(\d{1,2})(?:\s*[:.;,]\s*(\d{2})|\s+(\d{2})(?=\s*(?:am|pm|a\.m\.|p\.m\.)\b))?\s*(am|pm|baje|bje|o'?clock|ka|ke|tak|pe|par)?(?:\s*(subah|morning|shaam|evening|raat|night|dopahar|afternoon))?/g;
  let time = null, cutClock = '';
  const compact = t.match(/\b(\d{3,4})\s*(am|pm)\b/);                        // "105 am" is 1:05 am
  if (compact && +compact[1] % 100 < 60 && Math.floor(+compact[1] / 100) >= 1 && Math.floor(+compact[1] / 100) <= 12) {
    let h = Math.floor(+compact[1] / 100); if (compact[2] === 'pm' && h < 12) h += 12; else if (compact[2] === 'am' && h === 12) h = 0;
    time = { h, min: +compact[1] % 100, ampm: true }; cutClock = compact[0];
  }
  for (const m2 of time ? [] : t.matchAll(CLOCK)) {
    const c = m2[0], pre = /^(at|ko|by|for)\s/.test(c), mins = m2[2] || m2[3];
    if (!(mins || m2[4] || m2[5] || pre)) continue;
    let h = +m2[1], min = +(mins || 0); if (h > 24 || min > 59) continue;
    const ap = /^(am|pm)$/.test(m2[4] || '') ? m2[4] : '', part = m2[5];
    if (ap === 'pm' && h < 12) h += 12; else if (ap === 'am' && h === 12) h = 0;
    else if (!ap && part && /shaam|evening|raat|night|dopahar|afternoon/.test(part) && h < 12) h += 12;
    time = { h, min, ampm: !!(ap || part) }; cutClock = c.trim(); break;
  }
  if (!time && day === null) return null;
  const base = new Date(now); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() + (day || 0));
  if (time) base.setHours(time.h, time.min); else base.setHours(9, 0);
  if (day === null && base.getTime() <= now.getTime()) {                          // "at 5" with no day: next time it is 5
    if (time && !time.ampm && time.h < 12 && base.getTime() + 12 * 3600000 > now.getTime()) base.setHours(base.getHours() + 12); else base.setDate(base.getDate() + 1);
  }
  return { at: base.getTime(), cut: [cutDay, cutClock].filter(Boolean) };
}

const strip = (s, cuts) => { for (const c of [].concat(cuts || [])) if (c) s = s.replace(new RegExp(c.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' '); return s; };
const tidy = (s) => s.replace(/\b(please|pls|tito|hey|ok|okay|zara|na|yaar)\b/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,.:-]+|[\s,.:-]+$/g, '');

// Sites and apps a reminder can offer to open. Apps come from a short fixed list; nothing else is ever launched.
const TARGETS = [
  [/\b(youtube|yt)\b/, 'YouTube', 'url', 'https://www.youtube.com'], [/whatsapp/, 'WhatsApp', 'app', 'whatsapp'], [/telegram/, 'Telegram', 'app', 'telegram'], [/discord/, 'Discord', 'app', 'discord'],
  [/\b(gmail|email|e-mail)\b/, 'Gmail', 'url', 'https://mail.google.com'], [/\b(instagram|insta)\b/, 'Instagram', 'url', 'https://www.instagram.com'],
  [/\bchat ?gpt\b/, 'ChatGPT', 'url', 'https://chatgpt.com'], [/\bgithub\b/, 'GitHub', 'url', 'https://github.com'],
  [/\b(google ?classroom|classroom)\b/, 'Classroom', 'url', 'https://classroom.google.com'], [/\b(google ?drive|drive)\b/, 'Google Drive', 'url', 'https://drive.google.com'],
  [/\b(google ?meet|meet)\b/, 'Google Meet', 'url', 'https://meet.google.com'], [/\bzoom\b/, 'Zoom', 'url', 'https://zoom.us'],
  [/\b(calendar)\b/, 'Calendar', 'url', 'https://calendar.google.com'], [/\b(maps|google maps)\b/, 'Maps', 'url', 'https://www.google.com/maps'],
  [/\bnetflix\b/, 'Netflix', 'url', 'https://www.netflix.com'], [/\blinkedin\b/, 'LinkedIn', 'url', 'https://www.linkedin.com'],
  [/\b(facebook|fb)\b/, 'Facebook', 'url', 'https://www.facebook.com'], [/\b(twitter|x\.com)\b/, 'X', 'url', 'https://x.com'],
  [/\bamazon\b/, 'Amazon', 'url', 'https://www.amazon.in'], [/\bgoogle\b/, 'Google', 'url', 'https://www.google.com'],
  [/\bspotify\b/, 'Spotify', 'app', 'spotify'], [/\bnotepad\b/, 'Notepad', 'app', 'notepad'], [/\b(calculator|calc)\b/, 'Calculator', 'app', 'calc'],
  [/\b(file explorer|explorer|my files)\b/, 'Files', 'app', 'explorer'], [/windows settings|pc settings/, 'Windows Settings', 'app', 'settings'], [/\bpaint\b/, 'Paint', 'app', 'paint'],
  [/\b(vs ?code|visual studio code)\b/, 'VS Code', 'app', 'code'], [/\bchrome\b/, 'Chrome', 'app', 'chrome'], [/\bedge\b/, 'Edge', 'app', 'edge'],
  [/\bexcel\b/, 'Excel', 'app', 'excel'], [/\bword\b/, 'Word', 'app', 'word'],
];
/** { label, kind: 'url' | 'app', value } for the first known site, app or web address mentioned in the text. */
function findTarget(text) {
  const t = String(text || '').toLowerCase();
  // "open mrbeast latest video", "watch lofi songs": a YouTube search for exactly that
  const v = t.match(/\b(?:open|play|watch|dekho|chalao|chalana|dekhna)\s+(.+?\s+(?:latest\s+|new\s+|newest\s+)?(?:videos?|vlogs?|songs?|gaana|gane|trailer|movie|episode|stream|live))\b/);
  const v2 = t.match(/(.+?\s+(?:latest\s+|new\s+)?(?:videos?|vlogs?|songs?|gaana|trailer|movie|episode))\s+(?:dekhna|dekho|dekh|chalana|chalao|play|open)\b/);
  if (!v && v2) return { label: 'YouTube', kind: 'url', value: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(v2[1].trim()) };
  if (v) return { label: 'YouTube', kind: 'url', value: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(v[1].replace(/\b(at|on|by)\b.*$/, '').trim()) };
  const d = t.match(/\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|in|org|net|io|edu|dev|ac\.in|co\.in)(?:\/\S*)?)/);
  if (d && !/^\d/.test(d[1])) return { label: d[1].replace(/^https?:\/\//, '').split('/')[0], kind: 'url', value: /^https?:/.test(d[1]) ? d[1] : 'https://' + d[1] };
  for (const [re, label, kind, value] of TARGETS) if (re.test(t)) return { label, kind, value };
  return null;
}

const ROUTINE_WORDS = [
  [/(breakfast|nashta|nasta)/, 'Breakfast'], [/(lunch|dopahar ka khana)/, 'Lunch'], [/(dinner|raat ka khana)/, 'Dinner'],
  [/(water|paani|pani)/, 'Drink water'], [/(brush|brushed|daant)/, 'Brush teeth'], [/(medicine|dawai|dawa|vitamin|goli|tablet)/, 'Medicine'],
  [/(exercise|workout|gym|walk|yoga|run)/, 'Exercise'],
];

function parse(raw, now = new Date()) {
  const text = String(raw || '').trim(); const t = text.toLowerCase().replace(/[?!]+$/g, '');
  if (!t) return { type: 'unknown', text };
  let m;

  // ---- a pasted link: YouTube plays here, Spotify embeds, any other site opens
  const um = text.match(/https?:\/\/[^\s]+/i);
  if (um && text.replace(um[0], '').trim().split(/\s+/).filter(Boolean).length <= 3) {
    const url = um[0].replace(/[),.;]+$/, '');
    if (/youtu\.be|youtube\.com/i.test(url)) return { type: 'play', source: 'youtube', query: url };
    if (/open\.spotify\.com/i.test(url)) return { type: 'play', source: 'spotify', query: url };
    try { const u = new URL(url); return { type: 'open', target: { label: u.hostname.replace(/^www\./, ''), kind: 'url', value: 'https://' + u.host + u.pathname + u.search } }; } catch { /* not a link after all */ }
  }
  // ---- greeting / today's brief, your name, focus report
  if (/^(?:good\s+(?:morning|afternoon|evening|night)|hello|hi|hey|namaste|namaskar)(?:\s+tito)?$|^(?:brief|my day|plan my day|what'?s up|today'?s plan|aaj ka plan|daily brief)$/.test(t)) return { type: 'brief' };
  if ((m = t.match(/^(?:call me|my name is|mera naam|you can call me)\s+(.+)$/))) { const n = tidy(m[1]).replace(/\b\w/g, (c) => c.toUpperCase()); if (n) return { type: 'pref', key: 'userName', value: n.slice(0, 30) }; }
  if (/\b(focus report|how was my focus|focus score|focus stats|focus summary)\b/.test(t)) return { type: 'focus_report' };
  if ((m = t.match(/^focus guard\s+(on|off)$/))) return { type: 'pref', key: 'focusGuard', value: m[1] === 'on' };
  // ---- Teach Tito (explain a topic to Tito and get graded)
  if ((m = t.match(/^(?:teach tito|teach you|let me teach you|i will teach you|i want to teach|feynman(?: mode)?|explain to tito|teach me tito)\s*(?:about\s+|on\s+)?(.*)$/))) return { type: 'teach', topic: tidy(m[1]) };

  // ---- media controls (before "play X": "play" alone just resumes)
  if (/^(play|resume|chalu karo|chalao|start)$/.test(t)) return { type: 'media', action: 'play' };
  if (/^(pause|stop|ruko|roko|band karo|gaana band karo|stop the music|pause music)$/.test(t) || /\b(gaana|music|song|video)\b.*\b(roko|ruko|pause|band)\b/.test(t)) return { type: 'media', action: 'pause' };
  if (/\b(next|agla|skip)\b.*(song|gaana|track|video)?/.test(t) && !/\bnext (week|month|year)\b/.test(t) && t.split(' ').length <= 4) return { type: 'media', action: 'next' };
  if (/\b(previous|prev|pichla|pichhla|back)\b/.test(t) && t.split(' ').length <= 4) return { type: 'media', action: 'prev' };
  if (/\b(volume|awaaz|awaz)\b.*\b(up|badha|zyada|increase|badhao|tez)\b|\b(louder|volume up)\b/.test(t)) return { type: 'media', action: 'volup' };
  if (/\b(volume|awaaz|awaz)\b.*\b(down|kam|ghata|decrease|ghatao|dheere)\b|\b(quieter|volume down)\b/.test(t)) return { type: 'media', action: 'voldown' };
  if (/^(mute|unmute|chup)$/.test(t)) return { type: 'media', action: 'mute' };
  if ((m = t.match(/(?:skip|forward|aage)\s+(?:by\s+)?(\d+)\s*(?:min|minute|minat|sec|second)/))) return { type: 'media', action: 'seek', seconds: +m[1] * (/min/.test(m[0]) ? 60 : 1) };

  // ---- study: flashcards, exams, tabs
  if ((m = t.match(/^(?:add\s+|new\s+|make\s+|create\s+)?(?:a\s+)?(?:flash\s?card|card)\s*[:\-]?\s*(.+?)\s*(?:=|=>|->|:|\bmeans\b|\bis\b|\bka matlab\b)\s*(.+)$/)) || (m = t.match(/^(?:remember|yaad rakh(?:o|na)?)\s+(?:that\s+)?(.+?)\s+(?:is|means|=|ka matlab)\s+(.+)$/)))
    return { type: 'card_add', front: tidy(m[1]), back: tidy(m[2]) };
  if ((m = t.match(/^(?:delete|remove|hata(?:o|do)?)\s+(?:the\s+)?(?:flash\s?card|card)\s+(.+)$/))) return { type: 'card_delete', query: tidy(m[1]) };
  if ((m = t.match(/^(?:add\s+|set\s+|new\s+)?exam\s+(.+?)\s+(?:on|date|ko|is on)\s+(.+)$/)) || (m = t.match(/^(?:my\s+)?(.+?)\s+exam\s+(?:is\s+)?(?:on|ko)\s+(.+)$/))) {
    const w = parseWhen(m[2], now); if (w) return { type: 'exam_add', name: tidy(m[1]).replace(/\bexam\b/g, '').trim() || 'Exam', at: w.at };
  }
  if ((m = t.match(/^(?:delete|remove|cancel|hata(?:o|do)?)\s+(?:the\s+)?exam\s+(.+)$/))) return { type: 'exam_remove', query: tidy(m[1]) };
  if ((m = t.match(/^(?:show|open|go to|switch to|take me to|kholo)\s+(?:the\s+|my\s+)?(today|study|media|daily|routines?|cards?|flash\s?cards?|chat)(?:\s+tab)?$/)))
    return { type: 'tab', tab: /routine|daily/.test(m[1]) ? 'daily' : /card/.test(m[1]) ? 'study' : m[1] };
  if (/^(stop|end|cancel)\s+(?:the\s+)?(?:focus|pomodoro)(?:\s+mode|\s+timer)?$/.test(t)) return { type: 'focus_stop' };

  // ---- to-do and reminder upkeep: done, delete, move
  if ((m = t.match(/^clear\s+(?:all\s+)?(?:done|completed|finished)(?:\s+(?:todos?|tasks|items))?$/))) return { type: 'todos_clear_done' };
  if ((m = t.match(/^(?:delete|remove|cancel|clear|hata(?:o|do)?)\s+(?:all\s+)?(?:the\s+)?(?:my\s+)?(?:reminders?|alarms?)(?:\s+(?:for|of|about)?\s*(.*))?$/))) { const q = tidy(m[1] || ''); return q ? { type: 'reminder_delete', query: q } : { type: 'reminder_delete', all: true }; }
  if ((m = t.match(/^(?:change|move|shift|reschedule|update)\s+(?:the\s+)?(?:reminder|alarm)\s+(?:for|of|about)?\s*(.+?)\s+(?:to|at|for)\s+(.+)$/))) { const w = parseWhen(m[2], now); if (w) return { type: 'reminder_move', query: tidy(m[1]), at: w.at }; }
  if ((m = t.match(/^(?:delete|remove|cancel|hata(?:o|do)?)\s+(?:the\s+)?(?:todo|to-do|task|item)\s+(.+)$/)) || (m = t.match(/^(?:remove|delete|hata(?:o|do)?)\s+(.+?)\s+(?:from|se)\s+(?:my\s+)?(?:todo\s+|to-do\s+)?(?:list)$/))) return { type: 'todo_delete', query: tidy(m[1]) };
  if ((m = t.match(/^(?:mark|tick|check)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/)) || (m = t.match(/^(?:finish(?:ed)?|complete(?:d)?|done with|done)\s+(.+)$/)) || (m = t.match(/^(.+?)\s+(?:done|complete|completed|finished|ho gaya|ho gayi|kar diya|kar liya)$/)))
    return { type: 'todo_done', query: tidy(m[1]) };

  // ---- routines: add, remove, switch on or off, change the time, water goal
  if ((m = t.match(/^(?:add|new|create|make|set)\s+(?:a\s+|an\s+)?(?:daily\s+)?routine\s+(.+)$/)) || (m = t.match(/^(?:add|new|create)\s+(.+?)\s+(?:to|in)\s+(?:my\s+)?(?:daily\s+)?routines?$/))) {
    const w = parseWhen(m[1], now); const name = tidy(w ? strip(m[1], w.cut) : m[1]).replace(/\b(at|every ?day|daily|roz|ko|baje)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const d0 = w ? new Date(w.at) : null; return { type: 'routine_add', name: name ? name[0].toUpperCase() + name.slice(1) : 'Routine', times: d0 ? [String(d0.getHours()).padStart(2, '0') + ':' + String(d0.getMinutes()).padStart(2, '0')] : [] };
  }
  if ((m = t.match(/^(?:delete|remove|hata(?:o|do)?)\s+(?:the\s+)?(.+?)\s+routine$|^(?:delete|remove|hata(?:o|do)?)\s+routine\s+(.+)$/))) return { type: 'routine_remove', name: tidy(m[1] || m[2]) };
  if ((m = t.match(/^(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+?)\s*(?:routine|reminders?)?$/)) || (m = t.match(/^(enable|disable)\s+(?:the\s+)?(.+?)\s*(?:routine|reminders?)?$/)) || (m = t.match(/^(.+?)\s+(?:routine|reminder)s?\s+(on|off)$/))) {
    const word = m[1], other = m[2]; const on = /^(on|enable)$/.test(word) ? true : /^(off|disable)$/.test(word) ? false : /^on$/.test(other); const name = /^(on|off|enable|disable)$/.test(word) ? other : word;
    if (/\b(breakfast|lunch|dinner|water|medicine|brush|exercise|workout|bed|sleep|routine)\b/.test(name)) return { type: 'routine_set', name: tidy(name), on };
  }
  if ((m = t.match(/^(?:set|change|update|move)\s+(?:my\s+)?(breakfast|lunch|dinner|medicine|vitamin|exercise|workout|brush(?:ing)?(?: teeth)?|bed ?time|sleep|water)\s*(?:time|reminder)?\s*(?:to|at|for|ko)?\s*(.+)$/)) || (m = t.match(/^(breakfast|lunch|dinner|medicine|vitamin|exercise|workout|bed ?time)\s+(?:reminder\s+)?(?:at|ko)\s+(.+)$/))) {
    const w = parseWhen(m[2], now); if (w) { const d0 = new Date(w.at); return { type: 'routine_set', name: m[1], times: [String(d0.getHours()).padStart(2, '0') + ':' + String(d0.getMinutes()).padStart(2, '0')] }; }
  }
  if ((m = t.match(/^(?:set\s+)?water\s+goal\s+(?:to\s+)?(\d+)/)) || (m = t.match(/^(\d+)\s+glass(?:es)?\s+(?:water\s+)?(?:goal|a day|daily)$/))) return { type: 'water_goal', n: +m[1] };

  // ---- Tito's own preferences: ringtone, sounds, voice
  if ((m = t.match(/^(?:set\s+|change\s+)?ringtone\s+(?:to\s+)?(marimba|sparkle|soft bells|bells|sunrise|retro(?: beeps)?|kawaii(?: pluck)?|steel(?: drum)?|glass(?: chime)?)$/))) {
    const k = m[1]; return { type: 'pref', key: 'ringtone', value: /marimba/.test(k) ? 'marimba' : /sparkle/.test(k) ? 'sparkle' : /bell/.test(k) ? 'bells' : /sunrise/.test(k) ? 'sunrise' : /retro/.test(k) ? 'retro' : /kawaii/.test(k) ? 'kawaii' : /steel/.test(k) ? 'steel' : 'glass' };
  }
  if ((m = t.match(/^(?:turn\s+)?(?:sounds?|sound effects)\s+(on|off)$/)) || (m = t.match(/^(mute|unmute)(?:\s+(?:sounds?|tito))$/))) return { type: 'pref', key: 'sounds', value: /^(on|unmute)$/.test(m[1]) };
  if ((m = t.match(/^(?:tito\s+)?(?:voice|speak|talk|bolna)\s+(on|off|alerts|all)$/)) || (m = t.match(/^(?:turn\s+)?(?:voice|speech)\s+(on|off)$/))) return { type: 'pref', key: 'voiceMode', value: m[1] === 'off' ? 'off' : m[1] === 'all' ? 'all' : 'alerts' };

  // ---- timer, focus, lists, time, theme, Tito's own settings
  if ((m = t.match(new RegExp('^(?:set\\s+)?(?:a\\s+)?(?:timer|countdown)\\s+(?:for\\s+|of\\s+)?' + NUMRE + '\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|ghante|minat)'))) ||
      (m = t.match(new RegExp('^' + NUMRE + '\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|ghante|minat)\\s+(?:ka|ke)?\\s*(?:timer|countdown)')))) {
    const n = num(m[1]), u = m[2]; if (n) return { type: 'timer', ms: n * (/^(sec|second)/.test(u) ? 1000 : /^(min|minat)/.test(u) ? 60000 : 3600000), label: n + ' ' + u.replace(/s$/, '') };
  }
  if (/\b(start|begin|shuru|chalu|lagao)\b.*\b(focus|pomodoro|study timer|study mode)\b|^(focus|pomodoro|focus mode)$/.test(t)) return { type: 'focus' };
  if (/\b(what'?s? on my|show (?:me )?my|my)\s+(list|todos?|to-?dos?|reminders?|tasks)\b|\bmeri (list|todo|reminders?)\b|\bkya karna hai\b/.test(t)) return { type: 'list' };
  if (/^(?:what'?s? |what is )?(?:the )?(time|date|day)(?: is it| now| today)?$|\bkitne baje\b|\btime kya hai\b|\baaj (?:kya )?(?:date|din)\b/.test(t)) return { type: 'time' };
  if ((m = t.match(/\b(mochi|midnight|cyber|ocean|forest|sunset|graphite|lavender|dark|light)\b.*\b(theme|mode)\b|\b(theme|mode)\b.*\b(mochi|midnight|cyber|ocean|forest|sunset|graphite|lavender|dark|light)\b/))) {
    const w = m[1] || m[4]; return { type: 'theme', theme: w === 'dark' ? 'midnight' : w === 'light' ? 'mochi' : w };
  }
  if (/^(?:open |show |kholo )?(?:tito )?(?:settings|setting)(?: kholo| open)?$/.test(t)) return { type: 'settings' };

  // ---- open a site or app: "open youtube", "whatsapp kholo"
  if ((m = t.match(/^(?:open|launch|start|kholo|khol do|khol)\s+(.+)$/)) || (m = t.match(/^(.+?)\s+(?:kholo|khol do|khol dena|open karo|open kar do|chalu karo|launch karo|open kro)$/))) {
    const tg = findTarget(t);
    if (!tg) {                                                                   // a name Tito does not know: find its website, or ask
      const name = tidy(m[1]).replace(/\b(the|website|site|page|please|app)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (name && name.split(' ').length <= 4 && /[a-z]/i.test(name)) {
        const w0 = parseWhen(name, now);
        if (w0) { const n2 = tidy(strip(name, w0.cut)).replace(/\b(at|on|by)\b/g, ' ').replace(/\s+/g, ' ').trim(); if (n2) return { type: 'reminder', text: 'Open ' + n2, at: w0.at, whenGuessed: false, repeat: null, kind: 'reminder', openName: n2 }; }
        else return { type: 'open_site', name };
      }
    }
    if (tg) {
      const w = parseWhen(m[1], now);                                         // "open X at 12:04 am" is a reminder that opens X at that time
      if (w) return { type: 'reminder', text: tg.label === 'YouTube' ? tidy(strip(m[1], w.cut)).replace(/^(?:open|play|watch)\s+/, '') : 'Open ' + tg.label, at: w.at, whenGuessed: false, repeat: null, kind: 'reminder', open: tg };
      return { type: 'open', target: tg };
    }
  }

  // ---- a site, video or app plus a time, with or without the word "remind": it is a reminder that offers (or, for websites, performs) the opening
  { const tg0 = findTarget(t), w0 = parseWhen(t, now);
    if (tg0 && w0 && !/\b(search|todo|to-do)\b/.test(t)) return { type: 'reminder', text: tg0.label === 'YouTube' && tg0.value.includes('search_query') ? tidy(strip(t, w0.cut)).replace(/\b(open|play|watch|dekhna|dekho|dekh|chalana|chalao)\b/g, ' ').replace(/\s+/g, ' ').trim() : 'Open ' + tg0.label, at: w0.at, whenGuessed: false, repeat: null, kind: 'reminder', open: tg0 }; }

  // ---- play something
  if ((m = t.match(/^(?:play|chalao|laga(?:o|do)?|bajao)\s+(.+?)\s+(?:on|par|pe|me|mein)\s+(youtube|yt|spotify)$/)) || (m = t.match(/^(youtube|yt|spotify)\s+(?:par|pe|me|mein|on)\s+(.+?)\s+(?:chalao|play|laga(?:o|do)?|bajao)$/)) ) {
    const src = /spotify/.test(m[1] + m[2]) ? 'spotify' : 'youtube'; const q = /youtube|yt|spotify/.test(m[1]) && m[1].length <= 8 && /^(youtube|yt|spotify)$/.test(m[1]) ? m[2] : m[1];
    return { type: 'play', source: src, query: tidy(q) };
  }
  if ((m = t.match(/^(?:play|chalao|bajao|laga(?:o|do)?)\s+(.+)$/)) && !/\b(game|quiz)\b/.test(t)) return { type: 'play', source: /spotify/.test(t) ? 'spotify' : 'youtube', query: tidy(m[1].replace(/\b(on|par|pe)\s+(youtube|spotify)\b/, '')) };
  if ((m = t.match(/^(.+?)\s+(?:chalao|bajao|play karo)$/))) return { type: 'play', source: 'youtube', query: tidy(m[1]) };

  // ---- routines: "i had lunch", "maine lunch kha liya", "drank water"
  if (/\b(maine|i\s+(?:had|ate|took|drank|finished|did|have)|had|ate|drank|took|kha\s*liya|pee\s*liya|le\s*li|kar\s*liya|ho\s*gaya)\b/.test(t)) {
    for (const [re, name] of ROUTINE_WORDS) if (re.test(t)) return { type: 'routine', name, count: 1 };
  }

  // ---- study
  if (/\b(quiz|flashcards?|revise|revision|test me|mujhe poocho|sawal poocho)\b/.test(t)) return { type: 'quiz' };

  // ---- reminders
  if (/\b(remind\w*|yaad\s*dil\w*|yaad\s*rakh\w*|alarm|wake me)\b/.test(t) || /\bdeadline\b/.test(t)) {
    const w = parseWhen(t, now);
    let what = strip(t, w && w.cut).replace(/\b(set|add|create|a|an|the|me|to|that|about|for|ka|ki|ke|ke liye|mujhe|muje|mere liye|mere|mera|reminder|remind\w*|yaad\s*dil\w*|yaad\s*rakh\w*|karo|kro|krna|karna|kar do|kardo|do|dena|lagao|laga|alarm|deadline|on|at|ko|pe|par|tak|baje|time)\b/g, ' ');
    what = tidy(what);
    const repeat = /\b(every ?day|daily|roz|har din|everyday)\b/.test(t) ? 'daily' : /\bweekdays\b/.test(t) ? 'weekdays' : /\b(every week|weekly|har hafte)\b/.test(t) ? 'weekly' : null;
    if (repeat) what = tidy(what.replace(/\b(every ?day|daily|roz|har din|everyday|weekdays|every week|weekly|har hafte)\b/g, ' '));
    return { type: 'reminder', open: findTarget(t), text: what || 'Reminder', at: w ? w.at : 0, whenGuessed: !w, repeat, kind: /\bdeadline\b/.test(t) ? 'deadline' : 'reminder' };
  }

  // ---- todo
  if ((m = t.match(/^(?:add|create|new|note)?\s*(?:a\s+)?(?:todo|to-do|to do|task)\s*(?:list)?\s*(?:mein|me|:|-)?\s*(?:add\s+)?(.*)$/)) && m[1] && !/^(list|show|dikhao)$/.test(m[1]))
    return { type: 'todo', text: tidy(m[1].replace(/\b(add karo|add kar do|add|karo|kar do|likho|jodo)\b/g, ' ')) };
  if ((m = t.match(/^(.+?)\s+(?:todo|to-do|to do|task)\s+(?:mein|me)?\s*(?:add|likho|jodo|daalo|dalo)(?:\s+karo|\s+kar do)?$/))) return { type: 'todo', text: tidy(m[1]) };
  if ((m = t.match(/^(?:add|jodo|likho)\s+(.+?)\s+(?:to|in)\s+(?:my\s+)?(?:todo|to-do|to do|list)/))) return { type: 'todo', text: tidy(m[1]) };

  // ---- dock / circle
  if (/\b(circle|select|explain this|isse samjhao|ye kya hai)\b/.test(t)) return { type: 'circle' };
  if (/\b(show|open|dikhao|kholo)\b.*\b(todo|list|tasks|dock|reminders)\b/.test(t)) return { type: 'dock', tab: 'today' };

  // ---- search / lookup / questions
  if ((m = t.match(/^(?:search|google|look up|lookup|find|dhundo|khojo)\s+(?:for\s+)?(.+)$/)) || (m = t.match(/^(.+?)\s+(?:search karo|google karo|dhundo|khojo|search kar)$/))) return { type: 'search', query: tidy(m[1]) };
  if ((m = t.match(/^(?:tell me about|batao|what is|what are|what was|who is|who was|kya hai|kaun hai|explain|define|meaning of)\s+(.+)$/)) || (m = t.match(/^(.+?)\s+(?:ke baare mein batao|kya hai|kaun hai|batao)$/))) return { type: 'ask', query: tidy(m[1]), text };

  return { type: 'unknown', text };
}

module.exports = { parse, parseWhen, parseDay, findTarget };

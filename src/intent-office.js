// Rules that understand the office commands (English, Hindi, Hinglish): exam rescue, Excel sheets, PDF jobs, notes, web notes and meetings.
// Called from intent.parse before the general rules; returns a command object or null.
const meeting = require('./meeting');

const NAMESTOP = /\b(exam|exams|rescue|plan|autopilot|study|revision|prep|make|create|build|banao|bana|banado|do|de|for|my|the|a|an|on|by|ke|ka|ki|liye|from|this|that|pdf|with|chapters?|tito|please|prepare|set|up|aur|and|mera|meri|mere|ek|karo|kro|in|of|is|at|per|day|daily|hours?|hrs?|mins?|minutes?|hai|h|se|tak|new)\b/gi;
const cap = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

function rescue(text, t, now, H) {
  if (/\b(delete|remove|cancel|hata\w*|stop)\b/.test(t) && /\b(exam plan|study plan|rescue plan|exam rescue|revision plan)\b/.test(t)) return { type: 'rescue', op: 'remove', name: '' };
  let m;
  if ((m = t.match(/\b(?:chapter|ch)\s*(\d{1,2})\s*(?:is\s+)?(?:done|finished|complete|completed|ho gaya|khatam)\b/)) || (m = t.match(/\b(?:done|finished|completed|finish)\s+(?:with\s+)?(?:chapter|ch)\s*(\d{1,2})\b/))) return { type: 'rescue', op: 'done', n: +m[1], name: '' };
  if (/\b(how ready|am i ready|readiness|exam status|rescue status|plan status|study progress|kitna ready|exam readiness|how prepared)\b/.test(t)) return { type: 'rescue', op: 'status', name: '' };
  if (/\b(re-?plan|adjust (?:my )?(?:exam |study )?plan|reschedule (?:my )?(?:exam |study )?plan|fix my plan)\b/.test(t)) return { type: 'rescue', op: 'replan', name: '' };
  const create = /\b(exam rescue|exam autopilot|study autopilot|rescue plan)\b/.test(t) ||
    (/\b(make|create|build|prepare|banao|bana\s?do|bana\s?de|set up|setup)\b/.test(t) && /\b(study|exam|revision|prep)\s+plan\b/.test(t)) || (/\b(study|exam|revision)\s+plan\b/.test(t) && /\b(banao|bana\s?do|bana\s?de)\b/.test(t));
  if (!create) return null;
  let rest = t, studyHour = 0, dayMin = 0, chapters = 0;
  if ((m = rest.match(/\b(?:study(?:ing)?\s+)?(?:at|around|starting|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/))) { let h = +m[1]; if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; studyHour = h; rest = rest.replace(m[0], ' '); }
  if ((m = rest.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\s*(?:a day|per day|daily|roz|every day|each day|ek din)/))) { dayMin = Math.round(parseFloat(m[1]) * (/^h/.test(m[2]) ? 60 : 1)); rest = rest.replace(m[0], ' '); }
  if ((m = rest.match(/(\d{1,2})\s*chapters?/))) { chapters = +m[1]; rest = rest.replace(m[0], ' '); }
  const w = H.parseWhen(rest, now); let name = rest;
  if (w) name = H.strip(rest, w.cut);
  name = H.tidy(name.replace(NAMESTOP, ' ').replace(/[^a-zऀ-ॿ ]+/g, ' ')).replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  return { type: 'rescue', op: 'create', name: name ? cap(name) : '', at: w ? w.at : NaN, studyHour, dayMin, chapters };
}

function excel(text, t) {
  const XL = /\b(excel|xlsx|spreadsheet)\b/.test(t), SHEET = /\bsheet\b/.test(t) && /:/.test(text);
  if (!XL && !SHEET) return null;
  const VERB = /\b(make|create|build|generate|prepare|banao|bana|banado|bana\s?do|bana\s?de|export|convert|save|turn|chahiye|chahie|de\s?do|dedo|kar\s?do|karo|kro)\b/.test(t) || /\b(to|into|mein|me)\s+(excel|xlsx|spreadsheet)\b/.test(t);
  if (/^(?:open|launch|start|kholo)\s+(?:ms\s+)?excel$/.test(t)) return null;
  const source = /\b(clipboard|copied|copy kiya|jo copy|copy ki)\b/.test(t) ? 'clipboard'
    : /\b(this|that|last|above|previous|upar|iss|isse|is|ye|yeh|uska|iska)\b.*\b(table|answer|list|result|chat|reply)\b|\b(export|convert|save|turn)\s+(?:this|that|it)\b/.test(t) ? 'chat' : 'text';
  if (!VERB && source === 'text') return null;
  return { type: 'excel', source, text };
}

function pdf(text, t) {
  let m; const P = /\bpdfs?\b/.test(t);
  const verbs = /\b(show|list|batao|nikalo|dikhao|find|extract|kitne|from|de\s?do|do)\b/.test(t);
  const pagesSpec = () => { const x = t.match(/pages?\s*(\d[\d\s,\-–]*(?:(?:to|se|till|tak|and|aur|&|through)\s*\d[\d\s,\-–]*)*)/) || t.match(/(\d+\s*(?:-|to|se|till|tak)\s*\d+)\s*pages?/); return x ? x[1].trim() : ''; };
  if (P && /\b(merge|join|combine|jodo|jod\s?do|jod\s?de)\b/.test(t)) return { type: 'pdf', op: 'merge' };
  if (/\b(split|extract|separate|alag|nikalo|nikaal|cut|kaato|kato|take out)\b/.test(t) && /\bpages?\b/.test(t) && /\d/.test(t) && !/\b(summary|summari[sz]e)\b/.test(t)) return { type: 'pdf', op: 'split', pages: pagesSpec() };
  if (/\b(save|make|create|convert|banao|bana)\b.*\b(definitions?|terms)\b.*\b(flash\s?cards?|cards?)\b|\bdefinitions?\s+(?:as|to|into)\s+(?:flash\s?)?cards?\b/.test(t)) return { type: 'pdf', op: 'cards', chapter: ((t.match(/chapter\s*(\d+)/) || [])[1] | 0), pages: pagesSpec() };
  if (/\b(summary|summari[sz]e|summarise|saransh)\b/.test(t) && (P || /\b(?:page|pages|chapter)\s*\d+/.test(t))) return { type: 'pdf', op: 'summary', chapter: ((t.match(/chapter\s*(\d+)/) || [])[1] | 0), pages: pagesSpec() };
  if (/\b(definitions?|key terms|important terms|glossary)\b/.test(t) && (P || verbs) && !/^define\b/.test(t)) return { type: 'pdf', op: 'defs', chapter: ((t.match(/chapter\s*(\d+)/) || [])[1] | 0), pages: pagesSpec() };
  if (/\b(important|key|imp)\s+(points?|lines?|sentences?)\b/.test(t) && (P || verbs)) return { type: 'pdf', op: 'points', chapter: ((t.match(/chapter\s*(\d+)/) || [])[1] | 0), pages: pagesSpec() };
  if (/\b(chapters?|chapter list|contents|table of contents|toc)\b/.test(t) && (P || /\b(show|list|batao|nikalo|dikhao|find|kitne|kaun|kya)\b/.test(t)) && !/\bchapter\s*\d+\s+(?:explain|samjhao|notes)\b/.test(t) && t.split(' ').length <= 9) return { type: 'pdf', op: 'chapters' };
  if ((m = t.match(/^(?:find|search|dhundo|khojo|look for)\s+(.+?)\s+in\s+(?:the\s+|this\s+|my\s+)?pdf\b/))) return { type: 'pdf', op: 'find', query: m[1].trim() };
  if (P && (/\b(?:to|into|ko)\s+(?:a\s+)?(?:text|txt)\b/.test(t) || /\b(extract|nikalo|convert)\b.*\btext\b/.test(t))) return { type: 'pdf', op: 'text' };
  if (/^(?:open|load|read|select|choose|pick|upload)\s+(?:a\s+|my\s+|the\s+)?pdf(?:\s+file)?$|^pdf\s+(?:kholo|lagao|load karo)$|^pdf$/.test(t)) return { type: 'pdf', op: 'load' };
  return null;
}

const FORMATS = (t) => { const f = []; if (/\bpdf\b/.test(t)) f.push('pdf'); if (/\b(word|docx|doc)\b/.test(t)) f.push('docx'); if (/\b(markdown|md)\b/.test(t)) f.push('md'); return f; };
const topicOf = (s) => String(s || '').replace(/\s+(?:as|to|in|into)\s+(?:a\s+)?(?:pdf|word|docx|doc|markdown|md)\b.*$/i, '').replace(/\b(from|using|via|through)\s+(?:the\s+)?(?:internet|web|net|google|wikipedia|online)\b/i, '').replace(/\binternet\s+se\b/i, '').replace(/\bonline\b/i, '').replace(/[.,!]+$/, '').replace(/\s+/g, ' ').trim();

function notes(text, t, H) {
  let m;
  const topicTail = () => { const x = t.match(/\b(?:under|topic|notes?\s+(?:on|for|about))\s+(.+)$/); return x ? topicOf(text.slice(text.toLowerCase().lastIndexOf(x[1]))) : ''; };
  // web notes: "write a note on photosynthesis from the internet", "photosynthesis par ek page ka note banao internet se"
  if ((m = t.match(/\b(?:write|make|create|prepare|generate|banao|bana\s?do|likho|likh\s?do)\b.*?\b(?:notes?|page|summary|report)\b.*?\b(?:on|about|of|regarding|par|pe|per|ke\s+baare\s+mein|ke\s+bare\s+mein)\s+(.+)$/)) && !/\b(clipboard|screenshot|pdf)\b/.test(t)) {
    const raw = topicOf(m[1]); if (/[:]/.test(raw)) { const [tp, ...rest] = raw.split(':'); return { type: 'note', op: 'add', topic: tp.trim(), text: rest.join(':').trim(), from: 'text' }; }
    if (raw) return { type: 'write', topic: raw };
  }
  if ((m = t.match(/^(.+?)\s+(?:par|pe|per|ke\s+baare\s+mein|ke\s+bare\s+mein|ka|ke|ki)\s+(?:ek\s+)?(?:page\s+(?:ka\s+)?)?(?:notes?|note)\s+(?:banao|bana\s?do|likho|likh\s?do|bana\s?de|chahiye)(?:\s+(?:internet|net|web|google)\s+se)?$/)) || (m = t.match(/^(?:internet|net|web|google)\s+se\s+(.+?)\s+(?:ke\s+)?(?:notes?|note)\s+(?:banao|bana\s?do|likho)$/)))
    return { type: 'write', topic: topicOf(m[1].replace(/^(?:ek|mujhe)\s+/, '')) };
  // clipboard or screen to notes
  if (/\bnotes?\b/.test(t) && (/\b(snap|capture|grab|take)\b.*\bscreen\b|\bscreen\s?shot\b.*\bscreen\b|\bsave (?:my |the |this )?screen\b/.test(t)) && /\b(add|save|put|store|to|in|into|snap|capture)\b/.test(t)) return { type: 'note', op: 'add', from: 'screen', topic: topicTail() };
  if (/\bnotes?\b/.test(t) && /\b(clipboard|copied|screenshot|screen\s?shot)\b/.test(t) && /\b(add|save|put|dalo|daalo|rakho|store|file)\b/.test(t)) return { type: 'note', op: 'add', from: 'clipboard', topic: topicTail() };
  // typed text
  if ((m = text.match(/^(?:add to (?:my )?notes|note down|note this|note|save to notes|notes? mein (?:add|likho|daalo|dalo)|notes? add|noting)\s*(?:on|under|about|for|topic)?\s*([^:]*?)\s*[:\-]\s*(.+)$/is))) return { type: 'note', op: 'add', topic: topicOf(m[1]), text: m[2].trim(), from: 'text' };
  if ((m = text.match(/^(?:add|save|put)\s+(.+?)\s+(?:to|in|into)\s+(?:my\s+)?notes?(?:\s+(?:on|under|for)\s+(.+))?$/is)) && !/\b(clipboard|screen)\b/i.test(m[1])) return { type: 'note', op: 'add', topic: topicOf(m[2] || ''), text: m[1].trim(), from: 'text' };
  // export, delete, show, list
  if (/\b(export|save|download|convert|make|banao|bana\s?do)\b.*\bnotes?\b.*\b(pdf|word|docx|doc|markdown|md)\b|^export\s+(?:my\s+)?notes?\b/.test(t)) {
    const x = t.match(/\b(?:on|of|for|about)\s+(.+)$/); return { type: 'note', op: 'export', topic: x ? topicOf(x[1]) : '', formats: FORMATS(t) };
  }
  if ((m = t.match(/^(?:delete|remove|hata\w*|clear)\s+(?:my\s+)?notes?\s+(?:on|about|of|for)\s+(.+)$/))) return { type: 'note', op: 'delete', topic: topicOf(m[1]) };
  if ((m = t.match(/^(?:show|open|dikhao|kholo|read|display)\s+(?:me\s+)?(?:my\s+)?notes?(?:\s+(?:on|about|of|for)\s+(.+))?$/)) && !/\b(tab|window)\b/.test(t)) return { type: 'note', op: 'show', topic: topicOf(m[1] || '') };
  if ((m = t.match(/^(.+?)\s+(?:ke|ka|ki)\s+notes?\s+(?:dikhao|dikha\s?do|kholo|batao)$/))) return { type: 'note', op: 'show', topic: topicOf(m[1]) };
  if (/^(?:my\s+)?notes?(?:\s+list)?$|^(?:list|show all|all)\s+(?:my\s+)?notes?(?:\s+topics)?$|\bnotes topics\b/.test(t)) return { type: 'note', op: 'list' };
  return null;
}

/** "summary of the attached file", "add this picture to notes", "make excel from the uploaded file" */
function attached(text, t) {
  if (!/\b(attached|attachment|uploaded|(?:this|the|iss|is|ye|yeh)\s+(?:file|image|picture|photo|screenshot|document|doc))\b/.test(t)) return null;
  if (/\bpdf\b/.test(t) && !/\battach/.test(t)) return null;
  const tm = t.match(/\b(?:under|topic|notes?\s+(?:on|for|about))\s+(.+)$/), topic = tm ? tm[1].trim() : '';
  if (/\bnotes?\b/.test(t) && /\b(add|save|put|dalo|daalo|rakho|store)\b/.test(t)) return { type: 'attach', op: 'notes', topic };
  if (/\b(excel|xlsx|spreadsheet)\b/.test(t)) return { type: 'attach', op: 'excel' };
  if (/\b(key|important|imp)\s+(points?|lines?)\b/.test(t)) return { type: 'attach', op: 'points' };
  if (/\bdefinitions?\b/.test(t)) return { type: 'attach', op: 'defs' };
  if (/\b(summar\w*|saransh|short mein)\b/.test(t)) return { type: 'attach', op: 'summary' };
  if (/\b(explain|samjhao|samjha|describe|kya hai|what is in|what does)\b/.test(t)) return { type: 'attach', op: 'explain' };
  if (/\b(show|display|dikhao|read|open|ocr|extract|text)\b/.test(t)) return { type: 'attach', op: 'show' };
  return null;
}

function meetingRule(text, t, now, H) {
  if (/\bremind/.test(t) || /^(open|launch|join|start|kholo)\b/.test(t) || /\b(meet me|nice to meet|meet up|meet you)\b/.test(t)) return null;
  const w = H.parseWhen(t, now);
  const strong = /\b(meeting|zoom|gmeet|google\s*meet|stand-?up|webex|ms teams|microsoft teams|video call)\b/.test(t), weak = /\bmeet\b/.test(t) && !!w;
  if (!strong && !weak) return null;
  const VERB = /\b(set|schedule|book|fix|create|add|plan|arrange|banao|bana\s?do|bana|rakho|rakh|lagao|laga\s?do|kro|karo|karna|krna|setup|set up)\b/.test(t);
  if (!w && !VERB) return null;
  let at = w ? w.at : 0;
  if (w && !/(am|a\.m|subah|morning|savere|raat|night|midnight)/.test(t)) { const d = new Date(at); if (d.getHours() >= 1 && d.getHours() <= 7) at += 12 * 3600000; }   // "kal 4 baje meeting" means 4 pm
  return { type: 'meeting', ...meeting.describe(text, w ? { at } : null) };
}

/** H = { parseWhen, strip, tidy } from intent.js */
function parse(text, t, now, H) {
  return attached(text, t) || rescue(text, t, now, H) || excel(text, t) || pdf(text, t) || notes(text, t, H) || meetingRule(text, t, now, H);
}
module.exports = { parse };

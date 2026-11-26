// Small text helpers that need no AI: sentences, key words, an extractive summary, definitions and important lines.
const STOP = new Set(('a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours ' +
  'also however thus hence therefore etc eg ie via per may might shall within without upon among often usually many much one two three first second').split(/\s+/));

const clean = (s) => String(s || '').replace(/­/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/** Sentences of a text; line breaks inside a sentence are joined. */
function sentences(text) {
  const t = clean(text).replace(/(\w)-\n(\w)/g, '$1$2').replace(/([^.!?:;\n])\n(?=[a-z(])/g, '$1 ');
  return t.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])|\n{1,}/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 20 && s.split(' ').length >= 4 && /[a-z]/i.test(s));
}
const words = (s) => (String(s).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter((w) => !STOP.has(w));
function freq(text) { const f = new Map(); for (const w of words(text)) f.set(w, (f.get(w) || 0) + 1); return f; }
/** Most common meaningful words, best first. */
function keywords(text, n = 8) { return [...freq(text)].filter(([w]) => w.length > 3).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([w]) => w); }

/** Picks the n most informative sentences (by word frequency), kept in their original order. */
function summarize(text, n = 6) {
  const ss = sentences(text); if (ss.length <= n) return ss;
  const f = freq(text), top = Math.max(1, ...f.values());
  const score = (s, i) => { const ws = words(s); if (!ws.length) return 0; const base = ws.reduce((a, w) => a + (f.get(w) || 0) / top, 0) / Math.sqrt(ws.length + 4); return base * (i < 3 ? 1.15 : 1) * (s.length > 260 ? 0.7 : 1) * (/^(however|but|also|thus|moreover|furthermore|therefore|and|so)/i.test(s) ? 0.6 : 1); };
  return ss.map((s, i) => ({ s, i, v: score(s, i) })).sort((a, b) => b.v - a.v).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

/** "X is defined as ...", "X: ...", "X refers to ..." -> [{ term, meaning }] */
function definitions(text, max = 20) {
  const out = [], seen = new Set();
  const add = (term, meaning) => {
    term = term.replace(/^(the|a|an)\s+/i, '').replace(/[\s:,-]+$/, '').trim(); meaning = meaning.replace(/\s+/g, ' ').trim();
    const k = term.toLowerCase(); if (term.length < 3 || term.length > 48 || term.split(' ').length > 6 || meaning.length < 18 || seen.has(k) || STOP.has(k) || /^(figure|table|page|chapter|note|example|exercise|section)\b/i.test(term)) return;
    seen.add(k); out.push({ term: term[0].toUpperCase() + term.slice(1), meaning: meaning.length > 260 ? meaning.slice(0, 257).replace(/\s+\S*$/, '') + '...' : meaning });
  };
  const colon = (ln) => { const m = ln.match(/^([A-Z][A-Za-z0-9' ()/-]{2,46}?)\s*[:–—-]\s+([A-Za-z].{17,})$/); if (m && !/^(note|example|hint|tip|answer|solution|step|figure)\b/i.test(m[1])) add(m[1], m[2]); };
  for (const s of sentences(text)) {
    colon(s);                                                            // "Term: meaning" inside running text
    let m =s.match(/^((?:[A-Z][\w'-]*|[a-z][\w'-]*)(?:\s+[\w'-]+){0,4}?)\s+(?:is|are)\s+(?:defined as|known as|called|termed|the (?:process|study|science|measure|ability|branch|property|tendency|rate|study) (?:of|by which|that)|a type of|a kind of)\s+(.{12,}?)[.]?$/i)
      || s.match(/^((?:[A-Z][\w'-]*|[a-z][\w'-]*)(?:\s+[\w'-]+){0,4}?)\s+(?:refers to|means|denotes|can be defined as|is described as)\s+(.{12,}?)[.]?$/i)
      || s.match(/^(?:the\s+)?term\s+"?([\w' -]{3,40}?)"?\s+(?:refers to|means|is used to)\s+(.{12,}?)[.]?$/i);
    if (m) add(m[1], s.slice(s.indexOf(m[2])).replace(/[.]*$/, '.'));
    if (out.length >= max) break;
  }
  for (const ln of clean(text).split('\n')) colon(ln);                   // "Term: meaning" lines that stand alone
  return out.slice(0, max);
}

const IMPORTANT = /\b(important|note that|remember|key (?:point|idea|fact)|must|always|never|essential|crucial|formula|law of|principle|theorem|rule|in summary|to summari[sz]e|therefore|conclusion)\b/i;
/** Lines that signal something worth remembering, best first; falls back to the summary. */
function importantPoints(text, n = 12) {
  const ss = sentences(text); const hit = ss.filter((s) => IMPORTANT.test(s) && s.length < 320);
  const picked = hit.length >= 3 ? [...new Set(hit)].slice(0, n) : [...new Set([...hit, ...summarize(text, n)])].slice(0, n);
  return picked;
}

const titleCase = (s) => String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** Share of words two texts have in common (0..1), for grouping notes and matching topics. */
function overlap(a, b) {
  const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
/** Is the text mostly real words (not OCR noise)? */
const looksReal = (s) => { const t = String(s); const letters = (t.match(/[A-Za-zऀ-ॿ]/g) || []).length; return t.length > 0 && letters / t.length > 0.55; };

module.exports = { clean, sentences, words, keywords, summarize, definitions, importantPoints, titleCase, overlap, looksReal, STOP };

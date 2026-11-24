// Translation engines: MyMemory (free online API) and the offline Hindi pack (OPUS-MT via transformers.js).
// The AI model is still the best translator when it is available; these are the free / offline alternatives and fallbacks.
const MYMEMORY = 'https://api.mymemory.translated.net/get';

// Indian languages first (MyMemory covers all of these), then a few common ones.
const LANGS = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', gu: 'Gujarati', kn: 'Kannada',
  ml: 'Malayalam', pa: 'Punjabi', ur: 'Urdu', or: 'Odia', as: 'Assamese', ne: 'Nepali',
  fr: 'French', es: 'Spanish', de: 'German',
};

// Unicode script -> language (Devanagari could also be Marathi/Nepali; Hindi is the best default)
const SCRIPTS = [
  ['hi', /[ऀ-ॿ]/g], ['bn', /[ঀ-৿]/g], ['pa', /[਀-੿]/g], ['gu', /[઀-૿]/g],
  ['or', /[଀-୿]/g], ['ta', /[஀-௿]/g], ['te', /[ఀ-౿]/g], ['kn', /[ಀ-೿]/g],
  ['ml', /[ഀ-ൿ]/g], ['ur', /[؀-ۿ]/g],
];

const FOREIGN = /\b(le|les|des|une|est|où|je|vous|nous|avec|dans|el|los|las|una|por|der|die|das|und|ist|nicht|ein|ich|che|uma|não|bonjour|merci|gracias|hola|danke)\b/g;

/** Best guess of the language of `text`: a script match is certain, Latin text is assumed English (or 'auto' if it looks foreign). */
function detectLang(text) {
  const t = String(text || '');
  for (const [lang, re] of SCRIPTS) { const m = t.match(re); if (m && m.length >= Math.max(2, t.replace(/\s/g, '').length * 0.25)) return { lang, certain: true }; }
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (!latin) return { lang: 'auto', certain: false };
  const accented = (t.match(/[À-ſ]/g) || []).length;
  if (accented / latin > 0.03) return { lang: 'auto', certain: false };            // looks like French / Spanish / German...
  // OCR often drops accents, so also look for common non-English function words
  const foreign = new Set((t.toLowerCase().match(FOREIGN) || []));
  if (foreign.size >= 2) return { lang: 'auto', certain: false };
  return { lang: 'en', certain: false };
}

/** English text goes to the user's own language; anything else goes to English. */
const pickTarget = (src, myLang) => (src === 'en' ? (myLang && myLang !== 'en' ? myLang : 'hi') : 'en');

function chunk(text, max = 450) {
  const parts = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?।؟])\s+/); const out = []; let cur = '';
  for (let p of parts) {
    while (p.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(p.slice(0, max)); p = p.slice(max); }
    if ((cur + ' ' + p).trim().length > max) { out.push(cur); cur = p; } else cur = (cur + ' ' + p).trim();
  }
  if (cur) out.push(cur);
  return out.filter(Boolean);
}

class TranslateError extends Error { constructor(code, message) { super(message); this.code = code; } }

async function mymemoryOne(q, from, to, timeout = 15000) {
  let r;
  try { r = await fetch(`${MYMEMORY}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent((from === 'auto' ? 'Autodetect' : from) + '|' + to)}`, { signal: AbortSignal.timeout(timeout) }); }
  catch { throw new TranslateError('network', 'Could not reach the translation service.'); }
  const j = await r.json().catch(() => null);
  const text = j && j.responseData && j.responseData.translatedText;
  if (!j || (j.responseStatus !== 200 && j.responseStatus !== '200') || !text) {
    if (j && (j.quotaFinished || /quota|all available free/i.test(String(j.responseDetails || text || '')))) throw new TranslateError('quota', 'The free MyMemory limit for today is used up.');
    throw new TranslateError('http', (j && j.responseDetails) || `Translation service error (${r.status}).`);
  }
  if (/MYMEMORY WARNING/i.test(text)) throw new TranslateError('quota', 'The free MyMemory limit for today is used up.');
  return { text, detected: j.responseData.detectedLanguage || null };
}

/** Free online translation. Long text is split into <=450 character pieces (the API allows 500 per request). */
async function mymemory(text, from, to) {
  const pieces = chunk(text); const out = []; let detected = null;
  for (const p of pieces) { const r = await mymemoryOne(p, from, to); out.push(r.text); detected = detected || r.detected; }
  return { text: out.join(' '), detected };
}

module.exports = { LANGS, detectLang, pickTarget, chunk, mymemory, TranslateError };

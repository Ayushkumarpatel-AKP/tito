// Free web lookups with no API key: DuckDuckGo (the same HTML endpoint the DDGS library uses), Wikipedia (text + a picture)
// and a plain readable-text fetch for any page. Everything has a short timeout and never throws into the caller.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Tito/1.0';

async function get(url, { timeout = 9000, headers = {}, method = 'GET', body } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { return await fetch(url, { method, body, headers: { 'user-agent': UA, 'accept-language': 'en', ...headers }, signal: ctl.signal, redirect: 'follow' }); }
  finally { clearTimeout(t); }
}

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const strip = (h) => decode(String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** DuckDuckGo Instant Answer API (official, free, no key): the topic summary plus related links. [{ title, url, snippet }].
 *  DuckDuckGo's HTML results page is bot-protected, so it is deliberately not scraped; use SearXNG below for full web results. */
async function ddg(query, max = 6) {
  const r = await get('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&no_redirect=1&q=' + encodeURIComponent(query));
  if (!r.ok) throw new Error('DuckDuckGo answered ' + r.status);
  const j = await r.json(); const out = [];
  if (j.AbstractText && j.AbstractURL) out.push({ title: j.Heading || query, url: j.AbstractURL, snippet: j.AbstractText });
  const walk = (list) => { for (const t of list || []) { if (t.Topics) walk(t.Topics); else if (t.FirstURL && t.Text) out.push({ title: t.Text.split(' - ')[0].slice(0, 80), url: t.FirstURL, snippet: t.Text }); } };
  walk(j.RelatedTopics);
  return out.slice(0, max);
}

/** SearXNG (open source meta search, self-hosted or a public instance that enables JSON): full web results, no key. */
async function searxng(base, query, max = 6) {
  if (!/^https?:\/\//i.test(base || '')) throw new Error('No SearXNG address set');
  const r = await get(base.replace(/\/+$/, '') + '/search?format=json&q=' + encodeURIComponent(query));
  if (!r.ok) throw new Error('SearXNG answered ' + r.status + ' (JSON output must be enabled on that instance)');
  return ((await r.json()).results || []).slice(0, max).map((x) => ({ title: strip(x.title), url: x.url, snippet: strip(x.content || '') }));
}

/** Best available web results: your SearXNG instance when one is set, otherwise DuckDuckGo's Instant Answers. */
async function web(query, { searx = '', max = 6 } = {}) {
  if (searx) { try { const r = await searxng(searx, query, max); if (r.length) return r; } catch { /* fall back */ } }
  return ddg(query, max);
}

/** Wikipedia summary for a topic: { title, extract, image, url } or null. Pictures are freely licensed (Wikimedia). */
async function wiki(query, lang = 'en') {
  const s = await get(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(query)}`);
  if (!s.ok) return null;
  const hit = (await s.json())[1]?.[0]; if (!hit) return null;
  const r = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit)}`);
  if (!r.ok) return null;
  const j = await r.json(); if (j.type === 'disambiguation') return null;
  return { title: j.title, extract: j.extract || '', image: j.thumbnail ? j.thumbnail.source : '', page: j.content_urls?.desktop?.page || '', description: j.description || '' };
}

/** Up to n freely licensed pictures for a topic from Wikimedia Commons: [{ thumb, full, title, credit, page }]. */
async function images(query, n = 3) {
  const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=' + (n + 3) +
    '&gsrsearch=' + encodeURIComponent(query + ' filetype:bitmap') + '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=360&origin=*';
  const r = await get(u); if (!r.ok) return [];
  const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => a.index - b.index);
  return pages.map((p) => {
    const ii = p.imageinfo?.[0]; if (!ii || !ii.thumburl) return null;
    const meta = ii.extmetadata || {};
    if (!/jpe?g|png|webp/i.test(ii.url)) return null;
    return { thumb: ii.thumburl, full: ii.url, title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''), credit: strip(meta.Artist?.value || 'Wikimedia Commons') + (meta.LicenseShortName ? ' (' + meta.LicenseShortName.value + ')' : ''), page: ii.descriptionurl };
  }).filter(Boolean).slice(0, n);
}

/** Readable text of any web page (tags, scripts and menus removed), trimmed to `max` characters. */
async function readPage(url, max = 6000) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a web address');
  const r = await get(url, { timeout: 12000 }); if (!r.ok) throw new Error('The page answered ' + r.status);
  let html = await r.text();
  const main = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i);
  if (main) html = main[0];
  html = html.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  return { title, text: strip(html).slice(0, max), url };
}

/** One call for "look this up": web results + the Wikipedia card. Either part may be empty. */
async function lookup(query, opts = {}) {
  const [wr, w] = await Promise.allSettled([web(query, opts), wiki(query)]);
  return { query, results: wr.status === "fulfilled" ? wr.value : [], wiki: w.status === 'fulfilled' ? w.value : null, error: wr.status === "rejected" && w.status === "rejected" ? String(wr.reason.message || wr.reason) : '' };
}

module.exports = { ddg, searxng, web, wiki, images, readPage, lookup, get, strip, decode, UA };

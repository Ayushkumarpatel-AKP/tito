// Music and video: Windows media keys (control Spotify, a browser, any player), YouTube lookup through the official Data API
// (needs a free key, or a pasted link) and Spotify links. Nothing here scrapes a site.
const { spawn } = require('child_process');
const search = require('./search');

const VK = { play: 0xB3, pause: 0xB3, next: 0xB0, prev: 0xB1, stop: 0xB2, volup: 0xAF, voldown: 0xAE, mute: 0xAD };

/** Presses one Windows media key. Works for whatever player is active (Spotify app, browser tab, ...). */
function pressKey(action) {
  const code = VK[action]; if (!code) return Promise.resolve(false);
  const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, int f, int e);' -Name K -Namespace T; [T.K]::keybd_event(${code},0,0,0); [T.K]::keybd_event(${code},0,2,0)`;
  return new Promise((res) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => res(false)); p.on('exit', (c) => res(c === 0));
  });
}

/** Video id from a pasted YouTube link (watch, youtu.be, shorts, embed) or a bare 11 character id. */
function youtubeId(text) {
  const s = String(text || '').trim();
  let m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/); if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : '';
}
const youtubeListId = (text) => (String(text).match(/[?&]list=([\w-]+)/) || [])[1] || '';

/** First embeddable video for a query via YouTube Data API v3. Returns { id, title, channel, thumb } or null without a key. */
async function youtubeSearch(query, apiKey) {
  if (!apiKey) return null;
  const u = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5&safeSearch=moderate&q=' + encodeURIComponent(query) + '&key=' + encodeURIComponent(apiKey);
  const r = await search.get(u); const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'YouTube answered ' + r.status);
  return (j.items || []).map((i) => ({ id: i.id.videoId, title: search.decode(i.snippet.title), channel: i.snippet.channelTitle, thumb: i.snippet.thumbnails?.medium?.url || '' }));
}

/** YouTube oEmbed: the title and thumbnail of a pasted link, no key needed. */
async function youtubeInfo(id) {
  const r = await search.get('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
  if (!r.ok) return { id, title: 'YouTube video', channel: '', thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
  const j = await r.json(); return { id, title: j.title, channel: j.author_name, thumb: j.thumbnail_url };
}

const youtubeSearchUrl = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
const spotifyUri = (q) => 'spotify:search:' + encodeURIComponent(q);
const spotifyWebSearch = (q) => 'https://open.spotify.com/search/' + encodeURIComponent(q);

module.exports = { pressKey, youtubeId, youtubeListId, youtubeSearch, youtubeInfo, youtubeSearchUrl, spotifyUri, spotifyWebSearch };

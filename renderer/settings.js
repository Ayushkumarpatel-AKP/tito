/* Tito home / notebook / settings window */
(async () => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const pill = (cls, icon, color, text) => { const p = el('span', 'pill ' + cls); p.append(window.Icons.make(icon, color), text); return p; };
  const { Sprite, ready } = window.TitoSprite;
  await ready;

  const MODES = [
    ['auto', 'Auto', 'Online answers. Without internet Tito reads your selection offline.', 'rocket-launch', 'pink'],
    ['online', 'Online only', 'Always use the AI provider and never the offline text reader.', 'globe', 'sky'],
  ];
  const PERSONAS = [['mochi', 'Cute Mochi', 'Soft, friendly, short answers', 'heart', 'pink'], ['desi', 'Chill Buddy', 'Casual and a little witty', 'lightning', 'butter'], ['panda', 'Study Buddy', 'Patient, step by step', 'book-open', 'sky']];
  const LANGS = [['english', 'English'], ['hinglish', 'Hinglish'], ['hindi', 'Hindi']];
  const LEVELS = [['kid', 'Simple'], ['teen', 'Student'], ['expert', 'Expert'], ['meme', 'Fun']];
  const RANKS = ['Little Star', 'Cadet', 'Pilot', 'Commander', 'Captain', 'Galaxy Guru'];

  let S = await window.tito.getSettings();
  const PROVS = await window.tito.providers();
  const PROV = Object.fromEntries(PROVS.map((p) => [p.id, p]));
  const info = await window.tito.info();
  $('ver').textContent = 'Version ' + info.version; $('hkShow').textContent = info.hotkeyPretty;

  // ---- pets
  const logo = new Sprite($('logoPet'), { scale: 0.2 }); logo.play('idle', { boing: false });
  const big = new Sprite($('bigPet'), { scale: 0.9 }); big.play('greeting', { then: 'idle' });
  const POKES = [['success', 'Yay!'], ['success_alt', 'Hehe'], ['thinking', 'Hmm...'], ['searching', 'Looking...'], ['talking', 'Hello there'], ['confused', 'Huh?'], ['loading', 'Wheee']];
  $('bigPet').onclick = () => { const [s, t] = POKES[Math.floor(Math.random() * POKES.length)]; $('petSay').textContent = t; big.play(s, { then: 'idle' }); };
  $('tryBtn').onclick = () => window.tito.summon();

  // ---- tabs
  function tab(name) {
    document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
    if (name === 'notebook') loadNotebook(); if (name === 'settings') refreshOffline(); if (name === 'home') renderHome();
  }
  document.querySelectorAll('.nav').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
  window.tito.on('win:tab', tab);
  window.tito.on('settings:changed', (s) => { S = s; });
  tab(new URLSearchParams(location.search).get('tab') || 'home');

  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200); }
  async function save(patch, quiet) {
    const r = await window.tito.saveSettings(patch);
    if (r && r.ok === false) { toast(r.message || 'Could not save'); return r; }
    S = r.settings; if (!quiet) toast('Saved'); return r;
  }
  const msg = (id, text, ok) => { const e = $(id); e.textContent = text; e.className = 'msg ' + (ok ? 'ok' : 'bad'); };

  // ---- HOME
  async function renderHome() {
    S = await window.tito.getSettings();
    const st = await window.tito.aiStatus();
    const box = $('status'); box.textContent = '';
    box.append(pill('', 'rocket-launch', 'lav', { auto: 'Auto mode', online: 'Online only' }[S.mode] || 'Auto mode'));
    const withKey = PROVS.filter((p) => st.keys[p.id]);
    if (withKey.length) for (const p of withKey) box.append(pill('ok', 'check-circle', 'mint', `${p.name} ready`));
    else box.append(pill('warn', 'key', 'butter', 'No API key yet'));
    box.append(pill('ok', 'text-aa', 'mint', 'Offline text reader ready'));
    const xp = S.xp || 0, lv = Math.floor(Math.sqrt(xp)), cur = lv * lv, nxt = (lv + 1) * (lv + 1);
    $('lvName').textContent = `Level ${lv + 1}: ${RANKS[Math.min(lv, RANKS.length - 1)]}`;
    $('xpNum').textContent = `${xp} questions, next level at ${nxt}`;
    requestAnimationFrame(() => ($('xpBar').style.width = Math.max(4, ((xp - cur) / (nxt - cur)) * 100) + '%'));
  }

  // ---- NOTEBOOK
  async function loadNotebook() {
    const all = await window.tito.history.list(); const q = $('nbSearch').value.toLowerCase();
    const list = $('nbList'); list.textContent = '';
    const items = all.filter((i) => !q || (i.title + ' ' + i.answer).toLowerCase().includes(q));
    if (!items.length) { list.append(el('div', 'empty', all.length ? 'Nothing matches your search.' : 'Nothing here yet. Select something on your screen and I will save it here.')); return; }
    for (const i of items) {
      const row = el('div', 'nb clay pop-in');
      if (i.thumb) { const im = el('img'); im.src = i.thumb; row.append(im); }
      const body = el('div'); body.append(el('h4', '', i.title), el('p', '', i.answer), el('small', '', new Date(i.ts).toLocaleString()));
      const cp = el('button', 'btn small'); cp.append(window.Icons.make('copy', 'lav')); cp.title = 'Copy'; cp.onclick = async () => { await window.tito.copyText(`${i.title}\n${i.answer}`); toast('Copied'); };
      const del = el('button', 'btn small'); del.append(window.Icons.make('trash', 'coral')); del.title = 'Delete'; del.onclick = async () => { await window.tito.history.remove(i.id); loadNotebook(); };
      const side = el('div', 'nbSide'); side.append(cp, del);
      row.append(body, side); list.append(row);
    }
  }
  $('nbSearch').oninput = loadNotebook;
  $('nbPdf').onclick = async () => { toast('Making your PDF...'); const r = await window.tito.saveNotebookPdf(); if (r && r.ok) toast('PDF saved'); else if (r && r.message) toast(r.message); };
  $('nbExport').onclick = async () => { const r = await window.tito.history.exportMd(); if (r && r.ok) toast('Exported'); };
  $('nbClear').onclick = async () => { if (confirm('Delete the whole notebook?')) { await window.tito.history.clear(); loadNotebook(); } };

  // ---- SETTINGS: option groups
  function group(box, items, current, onPick, build) {
    box.textContent = '';
    for (const it of items) {
      const b = build(it); if (it[0] === current) b.classList.add('on');
      b.onclick = async () => { await onPick(it[0]); group(box, items, it[0], onPick, build); };
      box.append(b);
    }
  }
  const optCard = (it) => { const b = el('button', 'opt'); const h = el('b'); h.append(window.Icons.make(it[3], it[4]), it[1]); b.append(h, el('span', '', it[2])); return b; };
  const chipBtn = (it) => el('button', 'chip', it[1]);

  function renderSettings() {
    group($('modes'), MODES, S.mode, (v) => save({ mode: v }), optCard);
    group($('persona'), PERSONAS, S.personality, (v) => save({ personality: v }), optCard);
    group($('langRow'), LANGS, S.language, (v) => save({ language: v }), chipBtn);
    group($('levelRow'), LEVELS, S.level, (v) => save({ level: v }), chipBtn);
    renderProviders(); $('hkIn').value = info.hotkeyPretty;
    renderTranslate(); renderMemory();
    renderDockCard(); renderThemes(); renderVoice();
    $('swLogin').checked = S.openAtLogin; $('swGreet').checked = S.greetOnStart; $('swCtx').checked = !!S.sendContext;
  }

  // ---- providers: any key, automatic model
  function renderProviders() {
    group($('provRow'), PROVS.map((p) => [p.id, `${p.name}${p.free ? ' (free)' : ''}${S.hasKey[p.id] ? ' - key saved' : ''}`]), S.provider, async (v) => { await save({ provider: v }, true); renderProviders(); }, chipBtn);
    const p = PROV[S.provider];
    $('keyIn').value = ''; $('keyIn').placeholder = S.hasKey[p.id] ? 'Key saved. Paste a new one to replace it' : 'Paste your ' + p.name + ' API key';
    $('provHint').textContent = p.hint; $('keyMsg').textContent = '';
    $('getKey').hidden = !p.keyUrl; $('getKey').textContent = (p.free ? 'Get a free ' : 'Get a ') + p.name + ' key'; $('getKey').onclick = () => window.tito.openExternal(p.keyUrl);
    $('customRow').hidden = !p.custom; if (p.custom) { $('baseIn').value = S.custom.base || ''; $('customModelIn').value = S.custom.model || ''; }
    renderModels();
  }
  async function renderModels() {
    const p = PROV[S.provider], sel = $('modelSel'); sel.textContent = ''; sel.disabled = !!p.custom;
    if (p.custom) { sel.append(new Option('Set the model name above', '')); $('modelInfo').textContent = ''; return; }
    const m = await window.tito.models(p.id);
    sel.append(new Option(`Automatic (best available${m.ranked[0] ? ': ' + m.ranked[0] : ''})`, ''));
    for (const id of m.ranked) sel.append(new Option(id, id));
    if (m.pinned && !m.ranked.includes(m.pinned)) sel.append(new Option(m.pinned, m.pinned));
    sel.value = m.pinned || '';
    $('modelInfo').textContent = m.at ? `Models checked ${new Date(m.at).toLocaleString()}. Tito rechecks daily and switches by itself if a model is retired.` : 'Models have not been checked yet. Save a key and Tito will find the best one.';
  }
  $('modelSel').onchange = () => save({ models: { [S.provider]: $('modelSel').value } });
  $('baseIn').onchange = () => save({ custom: { base: $('baseIn').value.trim() } }, true);
  $('customModelIn').onchange = () => save({ custom: { model: $('customModelIn').value.trim() } }, true);

  // recognise the provider from the key itself
  let detectT = 0;
  $('keyIn').addEventListener('input', () => {
    clearTimeout(detectT);
    detectT = setTimeout(async () => {
      const k = $('keyIn').value.trim(); if (k.length < 20) return;
      const id = await window.tito.detectKey(k);
      if (id && id !== S.provider) { await save({ provider: id }, true); renderProviders(); $('keyIn').value = k; msg('keyMsg', `That looks like a ${PROV[id].name} key. Press Save.`, true); }
    }, 250);
  });
  async function findBest(provider, announce) {
    msg('keyMsg', 'Finding the best model and testing it with an image...', true);
    const r = await window.tito.autopick(provider);
    if (!r.ok) return msg('keyMsg', r.message, false);
    await renderModels();
    if (r.verified) msg('keyMsg', `${announce || 'Ready'}. Using ${r.best} (tested with an image).`, true);
    else if (r.best) msg('keyMsg', `${announce || 'Saved'}. Could not fully test right now, will use ${r.best}.`, true);
    else msg('keyMsg', 'Saved, but no image-capable model was found. Check the key or pick another provider.', false);
  }
  $('keySave').onclick = async () => {
    const k = $('keyIn').value.trim(); if (!k) return msg('keyMsg', 'Paste your key first', false);
    const provider = S.provider; const r = await window.tito.setKey({ provider, key: k }); S = r.settings; renderProviders();
    await findBest(provider, 'Key saved');
  };
  $('modelRefresh').onclick = () => (S.hasKey[S.provider] ? findBest(S.provider, 'Updated') : msg('keyMsg', 'Save a key first', false));
  $('keyTest').onclick = async () => {
    msg('keyMsg', 'Testing...', true); const r = await window.tito.testKey(S.provider);
    msg('keyMsg', r.ok ? `It works with ${r.model}. Tito says: ${r.message}` : r.message, r.ok);
  };

  // ---- translation
  async function renderTranslate() {
    const langs = await window.tito.translateLangs();
    $('trEngine').value = S.translateEngine || 'auto';
    const sel = $('trTo'); sel.textContent = '';
    for (const [code, name] of Object.entries(langs)) if (code !== 'en') sel.append(new Option(name, code));
    sel.value = S.translateTo || 'hi';
  }
  $('trEngine').onchange = () => save({ translateEngine: $('trEngine').value });
  $('trTo').onchange = () => save({ translateTo: $('trTo').value });

  // ---- memory
  function renderMemory() {
    $('swMem').checked = !!S.memory.enabled;
    $('memInfo').textContent = S.memory.count ? `Remembering ${S.memory.count} recent topic${S.memory.count === 1 ? '' : 's'}` : 'Nothing remembered yet';
  }
  $('swMem').onchange = async (e) => { await save({ memory: { enabled: e.target.checked } }); renderMemory(); };
  $('memForget').onclick = async () => { const r = await window.tito.forgetMemory(); S = r.settings; renderMemory(); toast('Forgotten'); };

  // ---- offline packs
  const PACK_ICON = { llm: ['cpu', 'lav'], hi: ['translate', 'sky'] };
  async function refreshOffline() {
    const box = $('offStatus'); box.textContent = '';
    box.append(pill('ok', 'text-aa', 'mint', 'Windows text reader ready'));
    const st = await window.tito.packs.status(); const list = $('packList'); list.textContent = '';
    for (const id of ['llm', 'hi']) {
      const p = st[id], row = el('div', 'packrow'); row.dataset.id = id;
      row.append(window.Icons.make(...PACK_ICON[id]));
      const info = el('div', 'pi'); info.append(el('b', '', `${p.name}  (${p.size})`), el('div', 'pd', p.detail));
      const bar = el('div', 'pbar'); bar.hidden = true; bar.append(el('i')); info.append(bar); row.append(info);
      const btn = el('button', 'btn small');
      const paint = (installed, busy) => {
        btn.textContent = ''; btn.disabled = false;
        if (busy) { btn.append('Downloading...'); btn.disabled = true; bar.hidden = false; }
        else if (installed) { btn.append(window.Icons.make('trash', 'coral'), 'Remove'); btn.onclick = async () => { await window.tito.packs.remove(id); refreshOffline(); }; bar.hidden = true; }
        else { btn.classList.add('primary'); btn.append(window.Icons.make('download-simple', 'white'), 'Download'); btn.onclick = () => startPack(id, row, paint); bar.hidden = true; }
      };
      paint(p.installed, st.busy[id]); row.append(btn); list.append(row);
      if (st.busy[id]) row.dataset.busy = '1';
    }
  }
  async function startPack(id, row, paint) {
    paint(false, true); row.querySelector('.pbar i').style.width = '2%';
    const r = await window.tito.packs.download(id);
    if (r.ok) toast('Pack ready'); else toast(r.message || 'Download failed');
    refreshOffline();
  }
  window.tito.on('packs:progress', ({ id, pct }) => { const i = document.querySelector(`.packrow[data-id="${id}"] .pbar i`); if (i) { i.parentElement.hidden = false; i.style.width = Math.round(pct * 100) + '%'; } });

  // hotkey recorder
  const KEYMAP = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Enter: 'Return' };
  $('hkIn').addEventListener('keydown', async (e) => {
    e.preventDefault();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const mods = []; if (e.ctrlKey) mods.push('CommandOrControl'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift'); if (e.metaKey) mods.push('Super');
    if (!mods.length) return msg('hkMsg', 'Hold Ctrl, Alt or Shift while pressing a key', false);
    const k = KEYMAP[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const accel = [...mods, k].join('+'); const r = await save({ hotkey: accel }, true);
    if (r && r.ok === false) return msg('hkMsg', r.message, false);
    info.hotkeyPretty = accel.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + '); $('hkIn').value = info.hotkeyPretty; $('hkShow').textContent = info.hotkeyPretty;
    msg('hkMsg', 'New shortcut saved', true); $('hkIn').blur();
  });
  $('swLogin').onchange = (e) => save({ openAtLogin: e.target.checked });
  $('swGreet').onchange = (e) => save({ greetOnStart: e.target.checked });
  $('swCtx').onchange = (e) => save({ sendContext: e.target.checked });

  // ---- voice + ringtone
  let TI = null;
  const KEYNAME = { openai: 'tts_openai', elevenlabs: 'tts_eleven', custom: 'tts_custom' };
  async function renderVoice() {
    TI = TI || await window.tito.ttsInfo(); const prov = S.ttsProvider || 'auto';
    const sel = $('ttsProv'); sel.textContent = ''; for (const [id, name] of TI.providers) sel.append(new Option(name, id)); sel.value = prov;
    const vsel = $('ttsVoice'); vsel.textContent = ''; const eff = prov === 'auto' ? (S.hasKey.gemini ? 'gemini' : 'gemini') : prov;
    const voices = eff === 'gemini' ? TI.gemini : eff === 'openai' ? TI.openai : null;
    $('ttsVoiceRow').hidden = prov === 'system';
    if (voices) { for (const v of voices) vsel.append(new Option(v, v)); vsel.value = (S.ttsVoices && S.ttsVoices[eff]) || TI.defaults[eff]; vsel.disabled = false; }
    else { vsel.append(new Option(eff === 'elevenlabs' ? 'Default voice (Sarah)' : 'Default voice', '')); vsel.disabled = true; }
    $('ttsKeyRow').hidden = !KEYNAME[prov]; $('ttsCustomRow').hidden = prov !== 'custom';
    if (KEYNAME[prov]) $('ttsKey').placeholder = S.hasKey[KEYNAME[prov]] ? 'Key saved. Paste a new one to replace it' : 'Paste your key for this voice service';
    if (prov === 'custom') { $('ttsBase').value = (S.ttsCustom && S.ttsCustom.base) || ''; $('ttsModel').value = (S.ttsCustom && S.ttsCustom.model) || ''; }
    $('voiceMode').value = S.voiceMode || 'alerts'; $('swRingLoop').checked = S.ringLoop !== false;
    const box = $('toneRow'); box.textContent = '';
    for (const [id, name] of window.TitoSfx.RINGTONES) {
      const b = document.createElement('button'); b.className = 'chip' + ((S.ringtone || 'marimba') === id ? ' on' : ''); b.textContent = name;
      b.onclick = async () => { await save({ ringtone: id }, true); window.TitoSfx.ring(id, { once: true, maxMs: 3000, vol: 0.6 }); renderVoice(); }; box.append(b);
    }
  }
  $('ttsProv').onchange = async () => { await save({ ttsProvider: $('ttsProv').value }, true); renderVoice(); };
  $('ttsVoice').onchange = async () => { const p = ($('ttsProv').value === 'auto') ? 'gemini' : $('ttsProv').value; await save({ ttsVoices: { [p]: $('ttsVoice').value } }, true); };
  $('ttsKeySave').onclick = async () => { const p = $('ttsProv').value, k = $('ttsKey').value.trim(); if (!k) return; const r = await window.tito.setKey(KEYNAME[p], k); S = r.settings; $('ttsKey').value = ''; msg('ttsMsg', 'Key saved. Press Test voice.', true); renderVoice(); };
  $('ttsBase').onchange = () => save({ ttsCustom: { base: $('ttsBase').value.trim() } }, true); $('ttsModel').onchange = () => save({ ttsCustom: { model: $('ttsModel').value.trim() } }, true);
  $('voiceMode').onchange = () => save({ voiceMode: $('voiceMode').value }, true); $('swRingLoop').onchange = (e) => save({ ringLoop: e.target.checked }, true);
  $('ttsTest').onclick = async () => {
    msg('ttsMsg', 'Asking the voice service...', true); const r = await window.TitoVoice.say('Hi, I am Tito. This is how I sound.');
    if (r && r.ok) msg('ttsMsg', 'That was the voice.', true); else msg('ttsMsg', (r && r.message) || 'The voice did not work. Check the key.', false);
  };

  // ---- theme picker
  const THEMES = [['mochi', 'Mochi', ['#fff3ea', '#ffb4d0', '#a58bff']], ['midnight', 'Midnight', ['#0f1530', '#4d66ff', '#b682ff']], ['cyber', 'Cyber', ['#07090e', '#19f0a5', '#00d5ff']], ['graphite', 'Graphite', ['#17181c', '#ff7a1f', '#ffc06b']],
    ['ocean', 'Ocean', ['#e9f5ff', '#2f8df0', '#5f7bff']], ['forest', 'Forest', ['#eef6ea', '#2fa866', '#4ec2a5']], ['sunset', 'Sunset', ['#fff1e4', '#ff5e62', '#ffb347']], ['lavender', 'Lavender', ['#f3edff', '#7a5af0', '#c36bff']]];
  function renderThemes() {
    const box = $('themeRow'); box.textContent = '';
    for (const [id, name, cols] of THEMES) {
      const b = document.createElement('button'); b.className = 'theme' + ((S.theme || 'mochi') === id ? ' on' : '');
      const sw = document.createElement('div'); sw.className = 'sw'; for (const c of cols) { const i = document.createElement('i'); i.style.background = c; sw.append(i); }
      b.append(sw, name); b.onclick = async () => { await save({ theme: id }, true); renderThemes(); }; box.append(b);
    }
  }
  // ---- dock, voice, search
  const SC_DEFAULT = { voice: 'CommandOrControl+Shift+V', todo: 'CommandOrControl+Shift+T', dock: 'CommandOrControl+Shift+D', quiz: 'CommandOrControl+Shift+K' };
  const pretty = (a) => a.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ');
  const SC_LABEL = { voice: 'Voice', todo: 'Quick to-do', dock: 'Dock', quiz: 'Quiz' };
  function renderDockCard() {
    $('nameIn').value = S.userName || ''; $('swGuard').checked = S.focusGuard !== false; $('guardWords').value = S.guardWords || '';
    $('swDock').checked = S.dockOn !== false; $('swNotify').checked = S.notify !== false; $('swSound').checked = S.sounds !== false; $('swClip').checked = !!S.clipWatch;
    $('searxIn').value = S.searxUrl || ''; $('ytKey').value = ''; $('ytKey').placeholder = S.hasKey && S.hasKey.youtube ? 'Key saved. Paste a new one to replace it' : 'Paste a YouTube Data API key';
    for (const n of document.querySelectorAll('[data-sc]')) n.value = SC_LABEL[n.dataset.sc] + ':  ' + pretty((S.shortcuts && S.shortcuts[n.dataset.sc]) || SC_DEFAULT[n.dataset.sc]);
  }
  $('nameIn').onchange = () => save({ userName: $('nameIn').value.trim().slice(0, 30) }); $('swGuard').onchange = (e) => save({ focusGuard: e.target.checked }); $('guardWords').onchange = () => save({ guardWords: $('guardWords').value.trim() });
  $('swDock').onchange = (e) => save({ dockOn: e.target.checked }); $('swSound').onchange = (e) => save({ sounds: e.target.checked }); $('swNotify').onchange = (e) => save({ notify: e.target.checked }); $('swClip').onchange = (e) => save({ clipWatch: e.target.checked });
  $('searxIn').onchange = () => { const v = $('searxIn').value.trim(); if (v && !/^https?:\/\//i.test(v)) return msg('scMsg', 'Start the address with https://', false); save({ searxUrl: v.replace(/\/+$/, '') }); };
  $('getYt').onclick = () => window.tito.openExternal('https://console.cloud.google.com/apis/library/youtube.googleapis.com');
  $('ytSave').onclick = async () => { const k = $('ytKey').value.trim(); if (!k) return msg('ytMsg', 'Paste the key first', false); const r = await window.tito.setKey('youtube', k); S = r.settings; msg('ytMsg', 'Saved', true); renderDockCard(); };
  for (const inp of document.querySelectorAll('[data-sc]')) inp.addEventListener('keydown', async (e) => {
    e.preventDefault(); if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const mods = []; if (e.ctrlKey) mods.push('CommandOrControl'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift');
    if (!mods.length) return msg('scMsg', 'Hold Ctrl, Alt or Shift while pressing a key', false);
    const k = KEYMAP[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const r = await save({ shortcuts: { [inp.dataset.sc]: [...mods, k].join('+') } }, true);
    if (r && r.ok === false) return msg('scMsg', r.message, false);
    msg('scMsg', 'Saved', true); renderDockCard(); inp.blur();
  });

  renderSettings(); renderHome(); window.Icons.hydrate();
})();

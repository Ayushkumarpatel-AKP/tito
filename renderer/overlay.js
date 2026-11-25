/* Tito overlay: frozen screenshot -> select (draw / box / whole screen) -> Tito explains it in a clay card. */
(function () {
  const $ = (id) => document.getElementById(id);
  const { Sprite, ready, drawFrame } = window.TitoSprite;
  const bg = $('bg'), cv = $('cv'), ctx = cv.getContext('2d');
  const card = $('card'), bubble = $('bubble');

  const BUBBLES = ['Circle anything and I will explain it.', 'Words, photos, errors, code. Anything works.', 'Just draw a loop around it.'];
  const NUDGE = 'Go on, draw around something!';
  const HINTS = { draw: 'Draw around anything on your screen', box: 'Drag a box around anything on your screen' };
  const LANG_NAME = { english: 'English', hindi: 'Hindi', hinglish: 'Hinglish' };
  const ACTIONS = {
    explain: () => 'Explain what I selected.',
    translate: (S) => `Translate the selected text into ${LANG_NAME[S.language] || 'English'}. If it is already in that language, translate it into Hindi instead. The answer field must contain only the translation of the text itself, not a description of it.`,
    summarize: () => 'Summarize the selected content in two or three sentences.',
    solve: () => 'Solve the selected problem step by step, briefly, and give the final answer.',
    fix: () => 'Explain the selected error or code and give the most likely fix.',
    teach: () => 'Teach me this by asking, not telling: do not explain it. Ask me one short guiding question about the selected content, with a tiny hint, so I can work it out myself.',
    quiz: () => 'Make 3 short quiz questions about what the selected content teaches. In the answer field write exactly 3 lines, each formatted as: question | short answer',
  };
  const HANDLE = 7, MIN = 40;
  const SIZES = [0.9, 1, 1.14, 1.3], SIZE_NAMES = ['Small text', 'Medium text', 'Large text', 'Extra large text'];

  let S = {};                                   // settings snapshot
  let shot = null;                              // screenshot Image
  let mode = 'draw';
  let strokes = [], cur = null, boxStart = null, region = null, regionIsStroke = false;
  let drag = null;                              // { kind: 'move' | handle name, sx, sy, orig }
  let holeT = 1, holeAnim = 0;
  let groupTimer = 0, idleTimer = 0, loadTimer = 0, typeTimer = 0, toastTimer = 0, readjustTimer = 0;
  let reqId = 0, opens = 0;
  let turns = [], images = null, crop = null, levelOverride = null, firstAsk = true, lastResult = null;
  let instruction = ACTIONS.explain, activeAct = 'explain';
  let typingDone = true, talkName = 'talking';

  const buddy = new Sprite($('buddyPet'), { scale: 0.62 });
  const cardPet = new Sprite($('cardPet'), { scale: 0.5 });

  // ---------------------------------------------------------------- canvas
  function resize() {
    const d = window.devicePixelRatio || 1;
    cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d);
    ctx.setTransform(d, 0, 0, d, 0, 0); redraw();
  }
  addEventListener('resize', resize);

  const easeOutBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function rr(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function holeRect() {
    const k = 0.55 + 0.45 * easeOutBack(holeT), r = region;
    const w = r.w * k, h = r.h * k; return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
  }
  function strokePath(pts) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2; ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my); }
    const l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
  }
  const wholeScreen = () => region && region.w >= innerWidth - 14 && region.h >= innerHeight - 14;

  function handles() {
    const r = region, xs = [r.x, r.x + r.w / 2, r.x + r.w], ys = [r.y, r.y + r.h / 2, r.y + r.h];
    return [['nw', xs[0], ys[0]], ['n', xs[1], ys[0]], ['ne', xs[2], ys[0]], ['e', xs[2], ys[1]], ['se', xs[2], ys[2]], ['s', xs[1], ys[2]], ['sw', xs[0], ys[2]], ['w', xs[0], ys[1]]];
  }

  function redraw() {
    const W = innerWidth, H = innerHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = region ? (wholeScreen() ? 'rgba(26,18,48,.22)' : 'rgba(26,18,48,.58)') : 'rgba(26,18,48,.34)';
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    if (region && !wholeScreen()) { const h = holeRect(); rr(h.x, h.y, h.w, h.h, 20); }
    ctx.fill('evenodd');

    if (region && !wholeScreen()) {                      // glowing rim + resize handles
      const h = holeRect(); ctx.save(); ctx.beginPath(); rr(h.x, h.y, h.w, h.h, 20);
      ctx.strokeStyle = 'rgba(255,190,215,.9)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,130,180,.9)'; ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();
      if (holeT >= 1) for (const [, x, y] of handles()) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, HANDLE, 0, 7); ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(255,100,160,.7)'; ctx.shadowBlur = 8; ctx.fill();
        ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = '#ff7fb0'; ctx.stroke(); ctx.restore();
      }
    }
    if (mode === 'box' && boxStart && cur) {              // live box while dragging
      const b = boxRect(); ctx.save(); ctx.beginPath(); rr(b.x, b.y, b.w, b.h, 14); ctx.clearRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#ff7fb0'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,120,175,.9)'; ctx.shadowBlur = 14; ctx.stroke(); ctx.restore();
      return;
    }
    const all = cur && mode === 'draw' ? strokes.concat([cur]) : strokes;
    if (!all.length || region) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pts of all) {
      if (pts.length < 2) continue;
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.addColorStop(0, '#ff7fb0'); g.addColorStop(1, '#a58bff');
      strokePath(pts); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 13; ctx.stroke();
      ctx.shadowColor = 'rgba(255,120,175,.9)'; ctx.shadowBlur = 16;
      strokePath(pts); ctx.strokeStyle = g; ctx.lineWidth = 7; ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function animateHole() {
    cancelAnimationFrame(holeAnim); const t0 = performance.now();
    const step = (n) => { holeT = Math.min(1, (n - t0) / 420); redraw(); if (holeT < 1) holeAnim = requestAnimationFrame(step); };
    holeT = 0; holeAnim = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- pointer input
  const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };
  function hit(x, y) {
    if (!region || wholeScreen()) return null;
    for (const [n, hx, hy] of handles()) if (Math.hypot(x - hx, y - hy) <= HANDLE + 6) return n;
    const r = region; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return 'move';
    return null;
  }
  const boxRect = () => ({ x: Math.min(boxStart.x, cur.x), y: Math.min(boxStart.y, cur.y), w: Math.abs(cur.x - boxStart.x), h: Math.abs(cur.y - boxStart.y) });

  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    clearTimeout(groupTimer); clearTimeout(idleTimer);
    const h = hit(e.clientX, e.clientY);
    if (h) { drag = { kind: h, sx: e.clientX, sy: e.clientY, orig: { ...region } }; cv.setPointerCapture(e.pointerId); return; }
    if (region) resetSelection();                         // clicking outside starts a fresh selection
    document.body.classList.add('drawing'); bubble.hidden = true;
    if (mode === 'box') { boxStart = { x: e.clientX, y: e.clientY }; cur = { x: e.clientX, y: e.clientY }; }
    else cur = [{ x: e.clientX, y: e.clientY }];
    cv.setPointerCapture(e.pointerId); redraw();
  });

  cv.addEventListener('pointermove', (e) => {
    const x = e.clientX, y = e.clientY;
    if (drag) { moveDrag(x, y); return; }
    if (!cur) { const h = hit(x, y); cv.style.cursor = h ? CURSORS[h] : 'crosshair'; return; }
    if (mode === 'box') { cur = { x, y }; redraw(); return; }
    const l = cur[cur.length - 1];
    if (Math.hypot(x - l.x, y - l.y) < 2.5) return;
    cur.push({ x, y }); redraw();
  });

  function moveDrag(x, y) {
    const o = drag.orig, dx = x - drag.sx, dy = y - drag.sy; let { x: rx, y: ry, w, h } = o;
    if (drag.kind === 'move') { rx = Math.min(Math.max(0, o.x + dx), innerWidth - o.w); ry = Math.min(Math.max(0, o.y + dy), innerHeight - o.h); }
    else {
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h; const k = drag.kind;
      if (k.includes('w')) x0 = Math.min(o.x + dx, x1 - MIN); if (k.includes('e')) x1 = Math.max(o.x + o.w + dx, x0 + MIN);
      if (k.includes('n')) y0 = Math.min(o.y + dy, y1 - MIN); if (k.includes('s')) y1 = Math.max(o.y + o.h + dy, y0 + MIN);
      rx = Math.max(0, x0); ry = Math.max(0, y0); w = Math.min(innerWidth, x1) - rx; h = Math.min(innerHeight, y1) - ry;
    }
    region = { x: rx, y: ry, w, h }; regionIsStroke = false; holeT = 1; redraw(); placeCard();
  }

  function pointerEnd() {
    if (drag) {                                           // adjusted the selection: ask again after a short pause
      drag = null; strokes = []; clearTimeout(readjustTimer);
      readjustTimer = setTimeout(() => { buildImages(); runAsk({ first: true }); }, 450); return;
    }
    if (!cur) return;
    if (mode === 'box') {
      const b = boxRect(); cur = null; boxStart = null;
      if (b.w < 14 && b.h < 14) { redraw(); return; }
      strokes = [[{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]]; finalize(b); return;
    }
    strokes.push(cur); cur = null; redraw();
    clearTimeout(groupTimer); groupTimer = setTimeout(() => finalize(), 520);   // lets people add a dot or a second arc
  }
  cv.addEventListener('pointerup', pointerEnd);
  cv.addEventListener('pointercancel', pointerEnd);

  addEventListener('contextmenu', (e) => { e.preventDefault(); close(); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (document.activeElement === $('q')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (e.key.toLowerCase() === 'd') setMode('draw'); else if (e.key.toLowerCase() === 'b') setMode('box');
  });

  // ---------------------------------------------------------------- toolbar
  function setMode(m) {
    mode = m; document.querySelectorAll('.tool[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('hintLine').textContent = HINTS[m]; cv.style.cursor = 'crosshair';
  }
  document.querySelectorAll('.tool[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('tClose').onclick = () => close(); $('cardX').onclick = () => close();
  $('tUndo').onclick = () => undo();
  $('tScreen').onclick = () => {
    resetSelection(); region = { x: 0, y: 0, w: innerWidth, h: innerHeight }; regionIsStroke = false; strokes = [];
    document.body.classList.add('drawn'); holeT = 1; redraw(); buildImages(); runAsk({ first: true });
  };
  function undo() {
    clearTimeout(groupTimer);
    if (!region && strokes.length) { strokes.pop(); redraw(); return; }
    resetSelection(); startBuddy(true);
  }

  // ---------------------------------------------------------------- selection -> region
  function bbox() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x0, y0, x1, y1 };
  }
  function finalize(box) {
    if (!strokes.length) return;
    let x, y, w, h;
    if (box) { x = box.x; y = box.y; w = box.w; h = box.h; }
    else {
      const b = bbox(); w = b.x1 - b.x0; h = b.y1 - b.y0; const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (w < 30 && h < 30) { w = 260; h = 170; }                       // a click or dot: look at what is around it
      const pad = Math.max(12, 0.08 * Math.max(w, h)); w += pad * 2; h += pad * 2; x = cx - w / 2; y = cy - h / 2;
    }
    w = Math.max(w, 110); h = Math.max(h, 80);
    x = Math.min(Math.max(4, x), innerWidth - w - 4); y = Math.min(Math.max(4, y), innerHeight - h - 4);
    w = Math.min(w, innerWidth - x - 4); h = Math.min(h, innerHeight - y - 4);
    region = { x, y, w, h }; regionIsStroke = !box;
    document.body.classList.add('drawn'); document.body.classList.remove('drawing'); animateHole();
    buildImages(); instruction = ACTIONS.explain; activeAct = 'explain'; runAsk({ first: true });
  }

  function resetSelection() {
    reqId++; strokes = []; cur = null; boxStart = null; region = null; images = null; crop = null; turns = []; drag = null;
    levelOverride = null; firstAsk = true; instruction = ACTIONS.explain; activeAct = 'explain';
    clearTimeout(typeTimer); clearTimeout(loadTimer); clearTimeout(groupTimer); clearTimeout(readjustTimer);
    if (window.speechSynthesis) speechSynthesis.cancel();
    card.hidden = true; document.body.classList.remove('drawn', 'drawing'); redraw();
  }

  // ---------------------------------------------------------------- build model input
  const jpeg = (c, q = 0.86) => ({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', q).split(',')[1] });
  function buildImages() {
    const k = shot.naturalWidth / innerWidth, r = region;
    let cw = r.w * k, ch = r.h * k; const down = Math.min(1, 1100 / Math.max(cw, ch)); cw *= down; ch *= down;
    const c1 = document.createElement('canvas'); c1.width = Math.max(1, Math.round(cw)); c1.height = Math.max(1, Math.round(ch));
    c1.getContext('2d').drawImage(shot, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c1.width, c1.height);
    images = [jpeg(c1)];
    if (!wholeScreen() && S.sendContext) {                 // optional second image: whole screen with the selection marked
      const W = Math.min(1280, shot.naturalWidth), s = W / innerWidth;
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = Math.round(innerHeight * s);
      const x2 = c2.getContext('2d'); x2.drawImage(shot, 0, 0, c2.width, c2.height);
      x2.lineCap = 'round'; x2.lineJoin = 'round'; x2.strokeStyle = '#ff2d95'; x2.lineWidth = Math.max(4, 5 * s);
      if (strokes.length && regionIsStroke) for (const pts of strokes) { if (pts.length < 2) continue; x2.beginPath(); pts.forEach((p, i) => (i ? x2.lineTo(p.x * s, p.y * s) : x2.moveTo(p.x * s, p.y * s))); x2.stroke(); }
      else x2.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
      images.push(jpeg(c2, 0.8));
    }
    const t = document.createElement('canvas'), tk = Math.min(1, 360 / Math.max(c1.width, c1.height));
    t.width = Math.round(c1.width * tk); t.height = Math.round(c1.height * tk); t.getContext('2d').drawImage(c1, 0, 0, t.width, t.height);
    crop = { thumb: t.toDataURL('image/jpeg', 0.7), full: c1 };
  }

  // ---------------------------------------------------------------- card
  function placeCard() {
    if (!region || card.hidden) return;
    const r = region, cw = card.offsetWidth, ch = card.offsetHeight, M = 16, TOP = 168, W = innerWidth, H = innerHeight;
    let best = null;
    if (wholeScreen()) best = { x: W - cw - 40, y: Math.max(TOP, (H - ch) / 2) };
    else {
      const spots = [
        { x: r.x + r.w + 18, y: r.y }, { x: r.x - 18 - cw, y: r.y },
        { x: r.x + r.w / 2 - cw / 2, y: r.y + r.h + 18 }, { x: r.x + r.w / 2 - cw / 2, y: r.y - 18 - ch },
      ];
      for (const s of spots) { const y = Math.max(s.y, TOP); if (s.x >= M && s.x + cw <= W - M && y + ch <= H - M) { best = { x: s.x, y }; break; } }
      if (!best) best = { x: r.x + r.w + 18, y: r.y };
    }
    const x = Math.min(Math.max(best.x, M), W - cw - M), y = Math.max(TOP, Math.min(best.y, H - ch - M));
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  new ResizeObserver(placeCard).observe(card);

  const setBusy = (b) => card.classList.toggle('busy', b);
  const viaLabel = { online: ['Online', ''], mymemory: ['MyMemory', ''], 'offline-tr': ['Offline translation', 'off'], llm: ['Offline AI', 'off'], ocr: ['Offline - text only', 'off'], demo: ['Demo', 'demo'] };
  let lastVia = '', lastProvider = '';

  function showLoading() {
    const wasHidden = card.hidden;
    card.hidden = false; setBusy(true);
    $('title').textContent = 'Looking closely...'; $('skeleton').hidden = false; $('answer').textContent = '';
    $('note').hidden = true; $('chips').textContent = ''; $('viaTag').textContent = ''; $('viaTag').className = 'tag';
    if (wasHidden) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); card.style.left = (region.x + region.w + 18) + 'px'; card.style.top = Math.max(168, region.y) + 'px'; }
    placeCard(); markUi();
    cardPet.play('searching');
    clearTimeout(loadTimer); loadTimer = setTimeout(() => cardPet.play('thinking'), 3800);
  }

  function markUi() {
    const lv = levelOverride || S.level || 'teen';
    $('styleSel').value = lv;
    document.querySelectorAll('#qa button').forEach((b) => b.classList.toggle('on', b.dataset.act === activeAct));
  }

  const friendly = {
    auth: 'The API key was not accepted. Check it in Settings.',
    rate: 'The free limit is used up for the moment. Wait a little and press Retry, or pick another provider in Settings.',
    network: 'No internet connection. Reconnect and press Retry.',
    timeout: 'The model took too long to answer. Please try again.',
  };

  async function runAsk({ first = false, question = null, override = null } = {}) {
    if (!images) return;
    const id = ++reqId;
    if (override) levelOverride = override.level;
    if (first) { turns = [{ role: 'user', text: instruction(S) }]; firstAsk = true; }
    else if (question) { turns.push({ role: 'user', text: question }); firstAsk = false; }
    else { turns = [{ role: 'user', text: instruction(S) }]; firstAsk = true; }      // retry / style change: start over from the selection
    showLoading();
    let res;
    try { res = await window.tito.ask({ images, turns, task: activeAct, override: levelOverride ? { level: levelOverride } : null }); }
    catch (e) { res = { ok: false, message: String(e) }; }
    if (id !== reqId) return;                                                          // the user selected something else meanwhile
    clearTimeout(loadTimer);
    if (!res || !res.ok) return showError(res && res.code, res && res.message);
    showResult(res);
  }

  function showError(code, msg) {
    setBusy(false); $('skeleton').hidden = true; $('title').textContent = 'Something went wrong';
    $('answer').textContent = code === 'rate' && msg ? msg : (friendly[code] || msg || 'Something unexpected happened. Please try again.');
    $('chips').textContent = '';
    const b = document.createElement('button'); b.className = 'chip on'; b.append(window.Icons.make('gear-six', 'white'), 'Open settings'); b.onclick = () => window.tito.openWindow('settings'); $('chips').append(b);
    cardPet.play('error');
  }

  function showResult(res) {
    const id0 = reqId; const r = res.result; lastResult = r; lastVia = res.via; lastProvider = res.provider || ''; setBusy(false);
    turns.push({ role: 'assistant', text: JSON.stringify({ title: r.title, answer: r.answer, kind: r.kind, mood: r.mood, chips: r.chips, search: r.search }) });
    $('skeleton').hidden = true; $('title').textContent = r.title;
    const [label0, cls] = viaLabel[res.via] || viaLabel.online; const label = res.via === 'online' && res.provider ? res.provider : label0; $('viaTag').textContent = label; $('viaTag').className = 'tag ' + cls;
    $('note').hidden = !r.note; $('note').textContent = r.note || '';
    $('pics').hidden = true; $('pics').textContent = ''; $('quizBox').hidden = true; $('quizBox').textContent = '';
    $('chips').textContent = ''; markUi();
    talkName = Math.random() < 0.5 ? 'talking_alt' : 'talking'; typingDone = false;
    if (r.mood === 'confused') cardPet.play('confused', { onEnd: () => cardPet.play('idle') });
    else if (r.offlineOcr) cardPet.play('thinking');
    else cardPet.play(r.mood === 'excited' ? 'success_alt' : 'success', { onEnd: () => (typingDone ? cardPet.play('idle') : cardPet.play(talkName)) });
    if (activeAct === 'quiz' && firstAsk) renderQuiz(r.answer); else renderAnswer($('answer'), r.answer);
    $('body').scrollTop = 0;
    if (r.image_query && activeAct !== 'quiz') loadPics(r.image_query, id0);
    clearTimeout(typeTimer);   // let the pet "talk" for about as long as it takes to read, then settle
    typeTimer = setTimeout(() => { typingDone = true; if (cardPet.name === talkName || cardPet.name === 'thinking') cardPet.release('idle'); }, Math.min(4500, 900 + r.answer.length * 12));
    quickActions(r).forEach((q, i) => { const b = document.createElement('button'); b.className = 'chip on pop-in'; b.style.animationDelay = 120 + i * 80 + 'ms'; b.append(window.Icons.make(q.icon, 'white'), q.label); b.onclick = () => q.run(b); $('chips').append(b); });
    (r.chips || []).forEach((c, i) => { const b = document.createElement('button'); b.className = 'chip pop-in'; b.style.animationDelay = 250 + i * 90 + 'ms'; b.textContent = c; b.onclick = () => ask(c); $('chips').append(b); });
    if (firstAsk && res.via !== 'demo' && crop) window.tito.history.add({ title: r.title, answer: r.answer, kind: r.kind, search: r.search, via: res.via, thumb: crop.thumb });
  }

  // Pictures only when the model asked for one (a living thing, a place, a diagram...). Freely licensed Wikimedia Commons images.
  async function loadPics(q, id) {
    let list = []; try { list = await window.tito.images(q); } catch { return; }
    if (id !== reqId || !Array.isArray(list) || !list.length) return;
    const box = $('pics'); box.textContent = '';
    for (const p of list.slice(0, 4)) { const im = new Image(); im.src = p.thumb; im.alt = p.title; im.title = p.title + ' - ' + p.credit; im.onclick = () => window.tito.openExternal(p.page); box.append(im); }
    const c = document.createElement('small'); c.textContent = 'Wikimedia Commons'; box.append(c); box.hidden = false; placeCard();
  }

  // "Quiz me on this": three questions with hidden answers, saved as flashcards in one click.
  function renderQuiz(text) {
    $('answer').textContent = 'Try to answer each one in your head, then tap it.';
    const box = $('quizBox'); box.textContent = ''; const cards = [];
    for (const line of String(text).split(/\n+/)) {
      const m = line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').split('|'); if (m.length < 2 || !m[0].trim()) continue;
      const q = m[0].trim(), a = m.slice(1).join('|').trim(); cards.push([q, a]);
      const row = document.createElement('div'); row.className = 'q'; row.textContent = q; const ans = document.createElement('span'); ans.textContent = 'Tap to show the answer'; row.append(ans);
      row.onclick = () => { ans.textContent = a; }; box.append(row);
    }
    if (!cards.length) { renderAnswer($('answer'), text); return; }
    const save = document.createElement('button'); save.className = 'chip on'; save.append(window.Icons.make('cards', 'white'), 'Save ' + cards.length + ' flashcards');
    save.onclick = async () => { for (const [q, a] of cards) await window.tito.cards.add(q, a); save.disabled = true; flash('Saved ' + cards.length + ' flashcards'); };
    box.append(save); box.hidden = false;
  }

  // One extra button that fits what was circled (the model labels it as `kind`).
  function codeBlock(text) { const m = String(text).match(/`([^`]{4,})`/g); return m ? m.map((x) => x.slice(1, -1)).join('\n') : ''; }
  function quickActions(r) {
    const q = r.search || r.title, out = [];
    const web = (u) => () => window.tito.openExternal(u);
    switch (r.kind) {
      case 'code': out.push({ icon: 'copy', label: 'Copy fixed code', run: async () => { const c = codeBlock(r.answer); await window.tito.copyText(c || r.answer); flash(c ? 'Code copied' : 'Answer copied'); } }); break;
      case 'error': out.push({ icon: 'magnifying-glass', label: 'Search this error', run: web('https://www.google.com/search?q=' + encodeURIComponent(q + ' error fix')) }); break;
      case 'math': if (activeAct !== 'solve') out.push({ icon: 'calculator', label: 'Show steps', run: () => { activeAct = 'solve'; instruction = ACTIONS.solve; runAsk({ first: true }); } }); break;
      case 'word': out.push({ icon: 'cards', label: 'Save to flashcards', run: async (b) => { const x = await window.tito.cards.add(r.title, r.answer); flash(x && x.ok ? 'Saved. ' + x.stats.total + ' cards' : 'Could not save'); b.disabled = true; } }); break;
      case 'place': out.push({ icon: 'map-pin', label: 'Open in Maps', run: web('https://www.google.com/maps/search/' + encodeURIComponent(q)) }); break;
      case 'object': out.push({ icon: 'image-square', label: 'See pictures', run: web('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q)) }); break;
      default: break;
    }
    if (r.due) out.push({ icon: 'bell', label: 'Remind me ' + new Date(r.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), run: async (b) => { const x = await window.tito.reminderAdd({ text: r.due_title || r.title, at: r.due - 3600000, kind: 'deadline' }); flash(x && x.ok ? 'Reminder set for 1 hour before' : 'Could not set it'); if (x && x.ok) b.disabled = true; } });
    if (activeAct !== 'quiz' && !r.offlineOcr && ['word', 'object', 'math', 'text', 'code', 'other'].includes(r.kind) && !r.demo) out.push({ icon: 'brain', label: 'Quiz me on this', run: () => { activeAct = 'quiz'; instruction = ACTIONS.quiz; runAsk({ first: true }); } });
    if (r.kind !== 'word' && !r.offlineOcr && r.kind !== 'error') out.push({ icon: 'cards', label: 'Make a flashcard', run: async (b) => { const x = await window.tito.cards.add(r.title, r.answer); flash(x && x.ok ? 'Saved. ' + x.stats.total + ' cards' : 'Could not save'); b.disabled = true; } });
    return out;
  }

  // The model replies in plain text with optional "- " bullets, "1." steps, **bold** and `code`. Build real elements (never innerHTML).
  function inline(node, text) {
    for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) { const e = document.createElement('strong'); e.textContent = part.slice(2, -2); node.append(e); }
      else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) { const e = document.createElement('code'); e.textContent = part.slice(1, -1); node.append(e); }
      else node.append(part);
    }
  }
  function renderAnswer(el, text) {
    el.textContent = '';
    let lines = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].length > 200) {          // one long block: break it into short paragraphs of two sentences
      const sentences = lines[0].split(/(?<=[.!?])\s+/); lines = [];
      for (let i = 0; i < sentences.length; i += 2) lines.push(sentences.slice(i, i + 2).join(' '));
    }
    let list = null, type = null, n = 0;
    for (const ln of lines) {
      const m = ln.match(/^(?:[-*\u2022]\s+|(\d+)[.)]\s+)(.*)$/);
      let node;
      if (m) {
        const t = m[1] ? 'ol' : 'ul';
        if (!list || type !== t) { list = document.createElement(t); type = t; el.append(list); }
        node = document.createElement('li'); inline(node, m[2]); list.append(node);
      } else { list = null; node = document.createElement('p'); inline(node, ln); el.append(node); }
      node.style.animationDelay = n++ * 70 + 'ms';
    }
  }

  function ask(q) { q = (q || '').trim(); if (!q || !images) return; $('q').value = ''; runAsk({ question: q }); }
  $('send').onclick = () => ask($('q').value);
  $('q').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ask($('q').value); if (e.key === 'Escape') close(); });
  $('styleSel').onchange = () => runAsk({ override: { level: $('styleSel').value } });
  document.querySelectorAll('#qa button').forEach((b) => (b.onclick = () => { activeAct = b.dataset.act; instruction = ACTIONS[activeAct]; runAsk({ first: true }); }));
  function applySize() { card.style.setProperty('--read', SIZES[S.textSize ?? 1]); }
  $('aSize').onclick = () => { S.textSize = ((S.textSize ?? 1) + 1) % SIZES.length; applySize(); window.tito.saveSettings({ textSize: S.textSize }); flash(SIZE_NAMES[S.textSize]); };
  $('aAgain').onclick = () => runAsk({});

  function flash(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  $('aCopy').onclick = async () => { if (!lastResult) return; await window.tito.copyText(`${lastResult.title}\n${lastResult.answer}`); flash('Answer copied'); };
  $('aGrab').onclick = async () => {
    if (!images) return; flash('Reading text...');
    const r = await window.tito.ocr(images[0].data);
    if (r && r.ok && r.text) { await window.tito.copyText(r.text); flash('Text copied'); } else flash('No readable text found');
  };
  $('aListen').onclick = async () => {
    if (!lastResult) return;
    const icon = $('aListen').querySelector('i.ic');
    if ($('aListen').dataset.busy) { window.TitoVoice.stop(); $('aListen').dataset.busy = ''; icon.innerHTML = window.Icons.svg('speaker-high'); return; }
    $('aListen').dataset.busy = '1'; icon.innerHTML = window.Icons.svg('speaker-slash');
    const r = await window.TitoVoice.say(`${lastResult.title}. ${lastResult.answer}`);
    $('aListen').dataset.busy = ''; icon.innerHTML = window.Icons.svg('speaker-high');
    if (r && r.ok === false && r.message) flash(r.message);
  };
  function pdfImage() {
    if (!crop) return '';
    const c = crop.full, k = Math.min(1, 900 / c.width), t = document.createElement('canvas');
    t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.82);
  }
  $('aPdf').onclick = async () => {
    if (!lastResult) return; flash('Making your PDF...');
    const r = await window.tito.savePdf({ title: lastResult.title, answer: lastResult.answer, image: pdfImage(), via: lastVia, provider: lastProvider });
    if (r && r.ok) flash('PDF saved'); else if (r && r.message) flash(r.message);
  };
  $('aSearch').onclick = () => { if (!lastResult) return; window.tito.openExternal('https://www.google.com/search?q=' + encodeURIComponent(lastResult.search || lastResult.title)); };
  $('aShare').onclick = async () => {
    if (!lastResult) return;
    const url = await buildShareCard(lastResult); await window.tito.copyImage(url);
    const r = await window.tito.saveImage(url); flash(r && r.ok ? 'Copied and saved to Pictures/Tito' : 'Image copied');
  };

  // ---------------------------------------------------------------- share card (1080 x 1350)
  function wrap(c, text, x, y, maxW, lh) {
    let line = '', yy = y; for (const w of text.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t;
    } c.fillText(line, x, yy); return yy + lh;
  }
  async function buildShareCard(r) {
    await document.fonts.load('800 56px Nunito'); await document.fonts.load('600 38px Nunito');
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ffd3e4'); g.addColorStop(1, '#d4c8ff'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.35)'; for (const [a, b, rad] of [[140, 160, 90], [930, 260, 60], [880, 1180, 120], [90, 1010, 50]]) { x.beginPath(); x.arc(a, b, rad, 0, 7); x.fill(); }
    x.save(); x.shadowColor = 'rgba(95,60,150,.35)'; x.shadowBlur = 50; x.shadowOffsetY = 24; x.fillStyle = '#fff7f0';
    x.beginPath(); x.roundRect(70, 170, 940, 940, 70); x.fill(); x.restore();
    let y = 250;
    if (crop) { const mw = 800, mh = 330, cc = crop.full, k = Math.min(mw / cc.width, mh / cc.height), w = cc.width * k, h = cc.height * k; x.save(); x.beginPath(); x.roundRect(540 - w / 2, y, w, h, 34); x.clip(); x.drawImage(cc, 540 - w / 2, y, w, h); x.restore(); y += h + 60; }
    x.fillStyle = '#4a3865'; x.font = '800 62px Nunito'; y = wrap(x, r.title, 120, y + 40, 840, 70);
    x.fillStyle = '#5d4a7a'; x.font = '600 38px Nunito'; wrap(x, r.answer, 120, y + 14, 840, 54);
    drawFrame(x, 'success', -1, 760, 1010, 250, 275);
    x.fillStyle = '#4a3865'; x.font = '800 40px Nunito'; x.fillText('Tito', 100, 1245);
    x.fillStyle = '#85729e'; x.font = '600 30px Nunito'; x.fillText('Circle anything. Tito explains it.', 100, 1290);
    return c.toDataURL('image/png');
  }

  // ---------------------------------------------------------------- lifecycle
  function startBuddy(quiet) {
    bubble.hidden = false; bubble.textContent = BUBBLES[opens % BUBBLES.length];
    bubble.style.animation = 'none'; void bubble.offsetWidth; bubble.style.animation = '';
    if (!quiet && opens % 6 === 0) buddy.play('greeting', { then: 'listening' }); else buddy.play('listening');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!region && !cur) { bubble.textContent = NUDGE; buddy.play('listening_wave', { then: 'listening' }); } }, 7000);
    opens++;
  }

  function close() { window.tito.closeOverlay(); }

  window.tito.on('overlay:open', async ({ image, settings }) => {
    resetSelection(); S = settings || {}; clearTimeout(idleTimer); setMode('draw'); applySize();
    document.body.classList.remove('show', 'drawn', 'drawing');
    shot = new Image(); shot.src = image; await shot.decode();
    bg.style.backgroundImage = `url(${image})`;
    await ready; window.Icons.hydrate(); resize();
    buddy.paused = false; cardPet.paused = false;
    requestAnimationFrame(() => { window.tito.overlayReady(); setTimeout(() => { document.body.classList.add('show'); startBuddy(); }, 40); });
  });
  window.tito.on('ai:wait', (secs) => { if (!card.hidden && card.classList.contains('busy')) $('title').textContent = `Free limit reached. Retrying in ${secs}s...`; });
  window.tito.on('overlay:closed', () => {
    resetSelection(); clearTimeout(idleTimer); document.body.classList.remove('show', 'drawn', 'drawing');
    bg.style.backgroundImage = 'none'; shot = null; buddy.paused = true; cardPet.paused = true;
  });

  // test hooks (used by `npm run selftest`)
  window.__tito = {
    simulate(points) { resetSelection(); strokes = [points]; finalize(); },
    box(x, y, w, h) { resetSelection(); strokes = [[{ x, y }, { x: x + w, y: y + h }]]; finalize({ x, y, w, h }); },
    state: () => ({ mode, region, card: !card.hidden, title: $('title').textContent, answer: $('answer').textContent, pet: cardPet.name, buddy: buddy.name, level: levelOverride, act: activeAct, via: $('viaTag').textContent }),
    ask: (q) => ask(q),
    fake(r, act) { if (!images) return; activeAct = act || 'explain'; firstAsk = activeAct === 'quiz'; showLoading(); showResult({ ok: true, via: 'online', provider: 'Test', result: r }); },
    extras: () => ({ pics: $('pics').children.length, quiz: $('quizBox').children.length, chips: [...$('chips').children].map((c) => c.textContent) }),
    setStyle: (v) => { $('styleSel').value = v; $('styleSel').dispatchEvent(new Event('change')); },
    cardRect: () => { const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
    click: (sel) => document.querySelector(sel).click(),
  };
})();

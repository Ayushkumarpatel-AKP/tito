/* Tito Dock: the pet at the edge of the screen and its panel. All user text is placed with textContent, never innerHTML. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const T = window.tito;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const icon = (n, c) => window.Icons.make(n, c);
  await window.TitoSprite.ready; window.Icons.hydrate();
  const { Sprite } = window.TitoSprite;
  const pet = new Sprite($('pet'), { scale: 0.5 });
  const root = $('root');

  let quiet = false, wasOpen = false, S = {}, noteTimer = 0;
  const sfx = (n, v) => window.TitoSfx && window.TitoSfx.play(n, v);
  let data = { todos: [], reminders: [], exams: [], routines: [], today: {}, stats: {} };
  let isOpen = false, tab = 'today', temp = 0, bubbleT = 0, wander = 0;
  let playing = false, focusing = false, recording = false, alertNow = null, idleSecs = 0;

  // ---------------------------------------------------------------- pet moods
  const night = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };
  const asleep = () => night() && idleSecs > 300;     // only when it is night and you have really been away
  function baseState() { return focusing ? 'studying' : playing ? 'dancing' : asleep() ? 'sleeping' : 'idle'; }
  function settle() { const b = baseState(); if (pet.name !== b) pet.play(b, { boing: false }); }
  /** Play an animation for a moment, then go back to whatever Tito is doing normally. */
  function mood(name, ms = 3200) {
    clearTimeout(temp); pet.play(name);
    if (ms) temp = setTimeout(settle, ms);
  }
  function say(text, ms = 6500, buttons) {
    if (!text) return; const b = $('bubble'); if (!isOpen) T.dock.bubble(true);
    b.textContent = ''; b.append(el('div', 'btxt', text));
    if (buttons && buttons.length) { const row = el('div', 'bbtns'); for (const [label, fn, primary] of buttons) { const x = el('button', 'chip' + (primary ? ' on' : ''), label); x.onclick = (e) => { e.stopPropagation(); fn(); }; row.append(x); } b.append(row); }
    b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bubbleT); if (ms) bubbleT = setTimeout(hideBubble, ms);
  }
  function hideBubble() { $('bubble').hidden = true; T.dock.bubble(false); }
  let replyT = 0;
  function reply(text, buttons) {
    const r = $('reply'); clearTimeout(replyT); r.textContent = ''; r.hidden = !text || (tab === 'chat' && !(buttons && buttons.length)); if (!text) return; r.append(text);
    if (buttons && buttons.length) { const row = el('div', 'alertbtns'); for (const [label, fn] of buttons) { const b = el('button', 'chip', label); b.onclick = fn; row.append(b); } r.append(row); }
    else replyT = setTimeout(() => { r.hidden = true; }, 6500);               // a plain message fades by itself; one with buttons waits for you
  }

  // ---------------------------------------------------------------- layout, drag, open / close
  T.dock.state().then((st) => { quiet = !!st.quiet; S = st.settings; window.TitoSfx.enable(!quiet && S.sounds !== false); });
  T.on('settings:changed', (s) => { S = s; window.TitoSfx.enable(!quiet && s.sounds !== false); });
  let isPop = false, briefOn = false;
  T.on('dock:layout', ({ open, pop, side }) => { isPop = !!pop; if (!pop) { briefOn = false; clearInterval(briefT); }
    if (open && window.TitoSfx.isRinging()) window.TitoSfx.stopRing(); if (open !== wasOpen) sfx(open ? 'open' : 'close', 0.35); wasOpen = open; if (open) $('bubble').hidden = true; isOpen = open; root.className = (open ? 'open ' : pop ? 'pop ' : 'closed ') + side; $('panel').hidden = !open; $('pop').hidden = !pop || briefOn; $('brief').hidden = !pop || !briefOn; if (open) { T.dock.data().then(setData); showAlert(); } });
  T.dock.state().then(({ open, side }) => { isOpen = open; root.className = (open ? 'open ' : 'closed ') + side; $('panel').hidden = !open; });
  let down = null;
  $('pet').addEventListener('pointerdown', (e) => { down = { x: e.screenX, y: e.screenY, moved: false }; $('pet').setPointerCapture(e.pointerId); });
  $('pet').addEventListener('pointermove', (e) => {
    if (!down) return; const dx = e.screenX - down.x, dy = e.screenY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 5) { down.moved = true; T.dock.dragStart(); $('pet').classList.add('dragging'); }
    if (down.moved) T.dock.drag(dx, dy);
  });
  $('pet').addEventListener('pointerup', () => {
    if (!down) return; const moved = down.moved; down = null; $('pet').classList.remove('dragging');
    if (moved) { T.dock.dragEnd(); settle(); return; }
    idleSecs = 0; sfx('tap', 0.4);
    if (isOpen) T.dock.open(false); else if (isPop) closePop(); else { openPop(''); mood(pet.name === 'sleeping' ? 'wake_up' : 'greeting', 2600); }     // a click gives the small popup; the full panel is one button away
  });
  $('btnHide').onclick = () => T.dock.open(false);          // the cross closes the panel, the pet stays (Ctrl+Shift+D hides the pet)
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (isOpen) T.dock.open(false); else if (isPop) closePop(); } });
  $('qkCircle').onclick = () => T.summon();
  $('qkQuiz').onclick = () => { setTab('study'); if (!$('btnQuiz').disabled) $('btnQuiz').click(); };
  $('qkFocus').onclick = () => { setTab('study'); if (!focusing) $('btnFocus').click(); };
  // Ctrl+Shift+Space (circle something): Tito wakes up and cheers you on
  T.on('dock:summon', () => { idleSecs = 0; if (!alertNow) mood('listening_wave', 2600); });
  T.on('dock:idle', (s) => { const was = asleep(); idleSecs = s; if (was && !asleep()) { sfx('wake', 0.4); mood('wake_up', 2600); } else if (!was && asleep() && !alertNow) settle(); });
  function setTab(t) {
    tab = t || tab; $('reply').hidden = tab === 'chat' || $('reply').hidden; placeComposer(); $('cmdIn').placeholder = tab === 'chat' ? 'Chat with Tito, or tell him what to do...' : 'Tell Tito: remind me at 5 pm, play lofi, search...';
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + tab));
    if (tab === 'study') refreshStudy();
    if (tab === 'chat') renderChat();
  }
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  T.on('dock:tab', (t) => { if (t) setTab(t); });
  T.on('dock:startFocus', () => { setTab('study'); if (!focusing) $('btnFocus').click(); });
  T.on('dock:focus', (what) => { if (what === 'todo') setTimeout(() => $('todoText').focus(), 120); });

  // ---------------------------------------------------------------- data rendering
  const pad = (n) => String(n).padStart(2, '0');
  function rel(ms) {
    const d = ms - Date.now(), a = Math.abs(d); if (a < 60000) return 'now'; const m = Math.round(a / 60000), h = Math.round(a / 3600000), dd = Math.round(a / 86400000);
    const s = a < 3600000 ? m + ' min' : a < 86400000 ? h + ' h' : dd + ' d'; return d < 0 ? s + ' ago' : 'in ' + s;
  }
  const when = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  function delBtn(fn) { const b = el('button', 'del', '×'); b.onclick = fn; b.title = 'Remove'; return b; }

  function setData(d) { data = d; renderToday(); renderDaily(); renderExams(); }
  T.on('dock:data', setData);

  function renderToday() {
    const rl = $('remList'); rl.textContent = '';
    if (!data.reminders.length) rl.append(el('div', 'sub', 'No reminders. Say "remind me at 5 pm to call mom".'));
    for (const r of data.reminders) {
      const it = el('div', 'item' + (r.at < Date.now() ? ' late' : r.at - Date.now() < 3600000 ? ' soon' : ''));
      it.append(icon(r.kind === 'deadline' ? 'warning' : 'bell', r.kind === 'deadline' ? 'coral' : 'butter'));
      const t = el('div', 'txt', r.text); const s = el('small', '', `${when(r.at)}  (${rel(r.at)})${r.repeat ? '  repeats ' + r.repeat : ''}`); t.append(s); it.append(t);
      if (r.open) { const ob = el('button', 'chip on', 'Open ' + r.open.label); ob.onclick = () => T.dock.openTarget(r.open); it.append(ob); }
      it.append(delBtn(async () => setData(await T.dock.reminderRemove(r.id)))); rl.append(it);
    }
    const tl = $('todoList'); tl.textContent = '';
    if (!data.todos.length) tl.append(el('div', 'sub', 'Your list is empty.'));
    for (const t of data.todos) {
      const it = el('div', 'item' + (t.done ? ' done' : '')); const c = el('button', 'chk' + (t.done ? ' on' : '')); c.onclick = async () => setData(await T.dock.todoToggle(t.id));
      it.append(c, el('div', 'txt', t.text), delBtn(async () => setData(await T.dock.todoRemove(t.id)))); tl.append(it);
    }
  }
  function renderExams() {
    const box = $('examBox'), list = $('examList'); box.textContent = ''; list.textContent = '';
    const exams = data.exams.filter((e) => e.date > Date.now() - 86400000);
    for (const e of exams) {
      const days = Math.max(0, Math.ceil((e.date - Date.now()) / 86400000));
      const it = el('div', 'item' + (days <= 3 ? ' soon' : '')); it.append(icon('trophy', 'butter')); const t = el('div', 'txt', e.name); t.append(el('small', '', days === 0 ? 'Today' : days + ' day' + (days > 1 ? 's' : '') + ' left'));
      it.append(t, delBtn(async () => setData(await T.dock.examRemove(e.id)))); list.append(it);
    }
    if (exams[0]) { const days = Math.ceil((exams[0].date - Date.now()) / 86400000); box.append(el('div', 'sub', `${exams[0].name}: ${days <= 0 ? 'today' : days + ' day' + (days > 1 ? 's' : '') + ' to go'}`)); }
  }
  function renderDaily() {
    const st = data.stats || {}; $('dDone').textContent = `${st.done || 0}/${st.total || 0}`; $('dStreak').textContent = st.streak || 0;
    const wr = (data.routines.find((r) => r.water) || {}).id; $('dWater').textContent = (st.water && st.water[wr]) || 0;
    const list = $('routineList'); list.textContent = '';
    for (const r of data.routines) {
      const n = (data.today && data.today[r.id]) || 0, need = r.water ? (st.waterGoal || 8) : Math.max(1, r.times.length);
      const it = el('div', 'item' + (n >= need ? ' done' : '')); it.style.opacity = r.on ? '' : '.55';
      const c = el('button', 'chk' + (n >= need ? ' on' : '')); c.title = 'Mark done'; c.onclick = async () => { setData(await T.dock.routineMark(r.id)); mood(r.anim === 'eating' ? 'eating' : 'tick_done', 3500); };
      const t = el('div', 'txt', r.name + (need > 1 ? `  ${n}/${need}` : '')); t.append(el('small', '', r.times.length ? r.times.join(', ') : 'no reminder time'));
      const sw = el('button', 'chip' + (r.on ? ' on' : ''), r.on ? 'On' : 'Off'); sw.onclick = async () => setData(await T.dock.routineSave({ ...r, on: !r.on }));
      it.append(c, t, sw, delBtn(async () => setData(await T.dock.routineRemove(r.id)))); list.append(it);
    }
  }

  // ---------------------------------------------------------------- forms
  $('todoForm').onsubmit = async (e) => { e.preventDefault(); const v = $('todoText').value.trim(); if (!v) return; $('todoText').value = ''; const r = await T.dock.todoAdd(v); if (r.data) setData(r.data); mood('checklist', 2600); };
  $('btnIcs').onclick = async () => { const r = await T.dock.importIcs(); if (r && r.ok) { setData(r.data); reply(r.added ? `Added ${r.added} deadline${r.added > 1 ? 's' : ''} from your calendar.` : 'No upcoming events found in that file.'); mood('checklist', 2600); } };
  $('clearDone').onclick = async () => setData(await T.dock.todoClearDone());
  $('remForm').onsubmit = async (e) => {
    e.preventDefault(); const text = $('remText').value.trim(), at = Date.parse($('remAt').value); if (!text || !Number.isFinite(at)) { reply('Type the reminder and pick a date and time.'); return; }
    $('remText').value = ''; $('remAt').value = ''; const r = await T.dock.reminderAdd({ text, at }); if (r.data) setData(r.data); mood('checklist', 2600);
  };
  $('examForm').onsubmit = async (e) => { e.preventDefault(); const name = $('examName').value.trim(), date = $('examDate').value; if (!name || !date) return; $('examName').value = ''; const r = await T.dock.examAdd({ name, date: date + 'T09:00:00' }); if (r.data) setData(r.data); };
  $('routineForm').onsubmit = async (e) => {
    e.preventDefault(); const name = $('rName').value.trim(); if (!name) return; const t = $('rTime').value; $('rName').value = '';
    setData(await T.dock.routineSave({ name, times: t ? [t] : [], icon: 'star', anim: 'tick_done', on: true }));
  };

  // ---------------------------------------------------------------- ringing: ringtone, shaking pet, rings and floating notes
  function ringFx(on) {
    $('stage').classList.toggle('ringing', on); clearInterval(noteTimer);
    if (!on) return;
    const spawn = () => { const n = icon('music-notes', Math.random() < 0.5 ? 'pink' : 'sky'); n.classList.add('flynote'); n.style.left = 28 + Math.random() * 120 + 'px'; n.style.animationDuration = 1.6 + Math.random() * 0.8 + 's'; $('stage').append(n); setTimeout(() => n.remove(), 2600); };
    spawn(); noteTimer = setInterval(spawn, 420);
  }
  const voiceOn = () => S.voiceMode !== 'off' && (S.ttsProvider === 'system' || S.hasKey && (S.hasKey.gemini || S.hasKey.tts_openai || S.hasKey.tts_eleven || S.hasKey.tts_custom));
  function startRing(a) {
    if (quiet) return; const tone = S.ringtone || 'marimba';
    ringFx(true);
    if (voiceOn()) window.TitoSfx.ring(tone, { once: true, vol: 0.6, onEnd: () => {
      if (alertNow !== a) { ringFx(false); return; }
      window.TitoVoice.say(String(a.text).replace(/\s*\(opening [^)]*\)/, '')).then((r) => {
        ringFx(false);
        if (r && r.ok === false && alertNow === a) { ringFx(true); window.TitoSfx.ring(tone, { maxMs: S.ringLoop === false ? 3000 : 15000, once: S.ringLoop === false, vol: 0.6, onEnd: () => ringFx(false) }); }   // the voice failed: keep ringing instead
      });
    } });
    else window.TitoSfx.ring(tone, { maxMs: S.ringLoop === false ? 3000 : 20000, once: S.ringLoop === false, vol: 0.6, onEnd: () => ringFx(false) });
  }
  function clearAlert() { alertNow = null; window.TitoSfx.stopRing(); window.TitoVoice.stop(); ringFx(false); }

  // ---------------------------------------------------------------- alerts from the scheduler
  T.on('dock:alert', (a) => {
    alertNow = a; idleSecs = 0;
    if (a.clip) sfx('tap', 0.5); else if (a.routine) { sfx('routine', 0.6); if (voiceOn()) setTimeout(() => window.TitoVoice.say(a.text), 900); } else startRing(a);
    mood(a.anim || 'alarm', 9000);
    if (isOpen) showAlert(); else if (isPop) { briefOn = false; $('brief').hidden = true; $('pop').hidden = false; popResult(`${a.title}: ${a.text}`, alertButtons(a)); }
    else say(a.text, 0, alertButtons(a));          // the bubble keeps its buttons until you answer
  });
  T.on('dock:cheer', (c) => { sfx('done', 0.5); mood(c.anim, 3800); say(c.text, 3500); });
  function alertButtons(a, after) {
    const done = () => { clearAlert(); hideBubble(); reply(''); settle(); if (after) after(); };
    const btns = [];
    if (a.open) btns.push(['Open ' + a.open.label, () => { T.dock.openTarget(a.open); }, true]);
    if (a.clip) btns.push(['Explain', async () => { reply('Thinking...'); mood('thinking', 0); const r = await T.dock.explainText(a.clip); done(); showAnswer(r.ok ? r.title : 'Hmm', r.ok ? r.answer : r.message); setTab('today'); mood(r.ok ? 'success' : 'error', 2800); }, true]);
    if (a.snooze) btns.push(['Snooze 10 min', async () => { setData(await T.dock.reminderSnooze({ id: a.id, minutes: 10 })); done(); }]);
    if (a.routine) btns.push(['Done', async () => { setData(await T.dock.routineMark(a.routine)); done(); mood('tick_done', 3000); }, true]);
    btns.push([a.snooze ? 'Done' : 'Dismiss', async () => { if (a.id) setData(await T.dock.reminderAck(a.id)); done(); }]);
    return btns;
  }
  function showAlert() { if (!alertNow) return; const a = alertNow; reply(`${a.title}: ${a.text}`, alertButtons(a)); }

  // ---------------------------------------------------------------- commands
  $('cmd').onsubmit = (e) => { e.preventDefault(); const v = $('cmdIn').value.trim(); if (v) { $('cmdIn').value = ''; run(v); } };
  // ---------------------------------------------------------------- small popup (for small jobs) and the greeting popup
  function popResult(text, buttons) {
    const r = $('popRes'); r.textContent = ''; r.hidden = !text; if (!text) return; r.append(el('div', 'ptxt', text));
    if (buttons && buttons.length) { const row = el('div', 'alertbtns'); for (const [label, fn] of buttons) { const b = el('button', 'chip' + (label === 'Undo' ? '' : ''), label); b.onclick = fn; row.append(b); } r.append(row); }
  }
  function openPop(prefill, voice) { briefOn = false; T.dock.pop(true); $('popIn').value = prefill || ''; setTimeout(() => $('popIn').focus(), 90); if (voice) { voiceTarget = 'pop'; startVoice(); } }
  function closePop() { briefOn = false; clearInterval(briefT); T.dock.pop(false); }
  $('popForm').onsubmit = (e) => { e.preventDefault(); const v = $('popIn').value.trim(); if (!v) return; $('popIn').value = ''; run(v, { from: 'pop' }); };
  document.querySelectorAll('#popChips [data-q]').forEach((b) => (b.onclick = () => { $('popIn').value = b.dataset.q; $('popIn').focus(); }));
  $('popCircle').onclick = () => { closePop(); setTimeout(() => T.summon(), 120); };
  $('popPanel').onclick = () => { closePop(); T.dock.open(true); };
  $('popMic').onclick = () => { voiceTarget = 'pop'; startVoice(); };
  T.on('dock:pop', (o) => { if (o && o.prefill !== undefined) openPop(o.prefill); if (o && o.voice) openPop('', true); });
  new ResizeObserver(() => { if (isPop) T.dock.popH(Math.max($('pop').offsetHeight, $('brief').offsetHeight) + 14); }).observe($('pop'));
  new ResizeObserver(() => { if (isPop) T.dock.popH(Math.max($('pop').offsetHeight, $('brief').offsetHeight) + 14); }).observe($('brief'));

  let briefT = 0;
  const fmtCd = (ms) => { if (ms <= 0) return 'now'; const sec = Math.floor(ms / 1000), d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60); return d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${pad(m)}m` : `${pad(m)}:${pad(sec % 60)}`; };
  function showBrief(d) {
    briefOn = true; $('pop').hidden = true; const b = $('brief'); b.hidden = false; b.textContent = ''; clearInterval(briefT);
    const greet = d.hour < 5 ? 'Still up' : d.hour < 12 ? 'Good morning' : d.hour < 17 ? 'Good afternoon' : d.hour < 22 ? 'Good evening' : 'Good night';
    const head = el('div', 'bhead'); head.append(el('b', '', greet + (d.name ? ', ' + d.name : '')), el('span', 'bclock', new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }))); b.append(head);
    if (d.countdowns.length) {
      b.append(el('h6', '', 'Coming up')); const rows = [];
      for (const c of d.countdowns) {
        const row = el('div', 'cd ' + c.kind); const ring = el('div', 'cdring'); const lab = el('div', 'cdl', c.label); lab.append(el('small', '', c.kind === 'exam' ? 'Exam' : c.kind === 'deadline' ? 'Deadline' : 'Reminder')); const t = el('div', 'cdt'); row.append(ring, lab, t); b.append(row); rows.push({ c, ring, t, row });
      }
      const tick = () => { for (const x of rows) { const left = x.c.at - Date.now(); x.t.textContent = fmtCd(left); x.ring.style.setProperty('--p', String(left > 3600000 ? 1 : Math.max(0.02, left / 3600000))); x.row.classList.toggle('soon', left < 3600000); } };
      tick(); briefT = setInterval(tick, 1000);
    }
    if (d.todos.length) {
      b.append(el('h6', '', 'To do'));
      for (const t of d.todos) { const it = el('div', 'item'); const c = el('button', 'chk'); c.onclick = async () => { c.classList.add('on'); it.classList.add('done'); setData(await T.dock.todoToggle(t.id)); sfx('done', 0.45); }; it.append(c, el('div', 'txt', t.text)); b.append(it); }
    }
    const bits = []; if (d.due) bits.push(`${d.due} flashcard${d.due > 1 ? 's' : ''} due`); if (d.streak) bits.push(`${d.streak} day streak`); if (d.routinesTotal) bits.push(`routines ${d.routinesDone}/${d.routinesTotal}`);
    b.append(el('div', 'bstats', bits.length ? bits.join('  -  ') : 'Nothing is waiting. Have a good one.'));
    const row = el('div', 'alertbtns');
    if (d.due) { const q = el('button', 'chip on', 'Quiz me'); q.onclick = () => { closePop(); T.dock.open(true); setTab('study'); setTimeout(() => $('btnQuiz').click(), 300); }; row.append(q); }
    const f = el('button', 'chip', 'Focus'); f.onclick = () => { closePop(); T.dock.open(true); setTab('study'); setTimeout(() => $('btnFocus').click(), 300); }; row.append(f);
    const p = el('button', 'chip', 'Open panel'); p.onclick = () => { closePop(); T.dock.open(true); }; row.append(p);
    const x = el('button', 'chip', 'Dismiss'); x.onclick = closePop; row.append(x); b.append(row);
    T.dock.pop(true); mood('greeting', 3800); sfx('wake', 0.4);
    setTimeout(() => { if (briefOn && isPop) closePop(); }, 45000);
  }
  T.on('dock:brief', showBrief);

  // ---------------------------------------------------------------- chat (the command bar and the Chat tab share one conversation)
  let chat = []; try { chat = JSON.parse(localStorage.getItem('titoChat') || '[]').slice(-40); } catch { chat = []; }
  const cmdHome = { parent: $('cmd').parentNode, next: $('cmd').nextSibling };
  function placeComposer() {                                             // in the Chat tab the input sits at the bottom, like a chat app
    const cmd = $('cmd');
    if (tab === 'chat') { $('chatDock').append(cmd); $('quick').hidden = true; } else { cmdHome.parent.insertBefore(cmd, cmdHome.next); $('quick').hidden = false; }
  }
  const mdHooks = { copy: (t) => T.copyText(t), open: (u) => T.openExternal(u) };
  function msgNode(m) {
    const box = el('div', 'msg ' + (m.role === 'user' ? 'user' : 'tito') + (m.fail ? ' fail' : ''));
    if (m.role === 'user') { box.textContent = m.text; return box; }
    box.append(window.TitoMd.render(m.text, mdHooks));
    const tools = el('div', 'mtools'); const cp = el('button', '', 'Copy'); cp.onclick = async () => { await T.copyText(m.text); cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1500); };
    const rd = el('button', '', 'Read aloud'); rd.onclick = async () => { rd.textContent = 'Reading...'; const r = await window.TitoVoice.say(m.text.replace(/```[\s\S]*?```/g, ' code block ').replace(/[*_`#>]/g, '')); rd.textContent = r && r.ok === false ? 'No voice' : 'Read aloud'; };
    tools.append(cp, rd); box.append(tools); return box;
  }
  function renderChat() {
    const log = $('chatLog'); log.textContent = '';
    if (!chat.length) log.append(msgNode({ role: 'tito', text: 'Hi, I am **Tito**. Ask me anything, ask for code, or tell me what to do: _"remind me at 5 pm to call mom"_, "add flashcard ...", "play lofi".' }));
    for (const m of chat) log.append(msgNode(m));
    const hints = $('chatHints'); hints.textContent = '';
    if (tab === 'chat') for (const h of ['What is on my list?', 'Start focus', 'Quiz me', 'Explain recursion with a Python example']) { const c = el('button', 'chip', h); c.onclick = () => run(h); hints.append(c); }
    $('chatScroll').scrollTop = $('chatScroll').scrollHeight;
  }
  function logChat(role, text, fail) { if (!text) return; chat.push({ role, text: String(text).slice(0, 8000), fail: !!fail }); chat = chat.slice(-30); try { localStorage.setItem('titoChat', JSON.stringify(chat)); } catch { /* private mode or full */ } if (tab === 'chat') renderChat(); }
  T.on('dock:cards', () => { if (tab === 'study') refreshStudy(); });
  T.on('dock:stopFocus', () => { if (focusing) $('fStop').click(); });

  const short = (t, n = 230) => { t = String(t).replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*_`#>]|!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '...' : t; };
  /** Wikipedia + web results as Markdown, so a lookup lives in the chat like any other answer. */
  async function searchMd(res, query) {
    let out = '';
    if (res.wiki) {
      if (res.wiki.image) out += `![${res.wiki.title}](${res.wiki.image})\n\n`;
      out += `**${res.wiki.title}**\n\n${res.wiki.extract.split('. ').slice(0, 3).join('. ')}\n\n`; if (res.wiki.page) out += `[Read more on Wikipedia](${res.wiki.page})\n\n`;
    } else out += `**${query}**\n\n`;
    for (const r of res.results.slice(0, 3)) out += `- [${String(r.title).replace(/[\[\]]/g, '')}](${r.url})${r.snippet ? ' ' + String(r.snippet).slice(0, 100) : ''}\n`;
    if (!res.wiki && !res.results.length) out += res.error || 'I could not find anything. Try different words.';
    try { const imgs = await Promise.race([T.dock.images(query), new Promise((r) => setTimeout(() => r([]), 2500))]); if (Array.isArray(imgs) && imgs.length) out += '\n' + imgs.slice(0, 3).map((i) => `![${String(i.title).replace(/[\[\]]/g, '')}](${i.thumb})`).join(' ') + '\n\n_Pictures: Wikimedia Commons_'; } catch { /* pictures are optional */ }
    return out;
  }
  async function run(text, opts = {}) {
    const from = opts.from || (isPop && !isOpen ? 'pop' : 'panel');
    if (from === 'pop') popResult('Thinking...'); else reply('...');
    mood('thinking', 0); logChat('user', text);
    const r = await T.dock.command({ text, history: chat.slice(-9, -1).map((m) => ({ role: m.role, text: m.text })) });
    const full = r.search ? await searchMd(r.search, r.intent.query) : r.say || (r.ok ? 'Done.' : 'Something went wrong.');
    logChat('tito', full, !r.ok); settle(); if (r.anim) mood(r.anim, 3500);
    const unknown = !r.ok && r.intent && r.intent.type === 'unknown';
    const askBtns = r.ask && r.ask.options ? r.ask.options.map((o) => [o.label, () => { if (o.cmd) run(o.cmd, { from }); else if (o.url) T.openExternal(o.url); else if (o.settings) T.openWindow('settings'); }]) : [];
    const unknownBtns = unknown ? [['Search it', () => run('search ' + text, { from })], ['Remind me', () => { (from === 'pop' ? $('popIn') : $('cmdIn')).value = 'remind me at '; (from === 'pop' ? $('popIn') : $('cmdIn')).focus(); }], ['Add to list', () => run('add todo ' + text, { from })]] : [];
    const needsPanel = !!r.play || (r.intent && ['teach', 'tab', 'quiz', 'focus', 'settings'].includes(r.intent.type));
    if (from === 'pop') {
      const btns = [...askBtns, ...unknownBtns];
      if (r.undo) btns.unshift(['Undo', async () => { setData(await T.dock.undo(r.undo)); popResult('Undone.'); setTimeout(() => { if (isPop) popResult(''); }, 1600); }]);
      if (r.search || r.md || (r.intent && r.intent.type === 'chat')) btns.push(['Open chat', () => { T.dock.open(true); setTab('chat'); }]);
      popResult(short(full), btns);
      if (needsPanel) { T.dock.open(true); }
    } else {
      reply(short(full, 400), askBtns.length ? askBtns : unknownBtns);
      if (r.say && !isOpen && !alertNow) say(short(r.say, 160));
      if (r.search || r.md) setTab('chat');                                   // answers live in the chat, not floating over another tab
    }
    if (r.say && S.voiceMode === 'all' && voiceOn() && !r.search) window.TitoVoice.say(short(r.say, 400));
    if (r.play && r.play.source === 'spotify') { setTab('media'); embedSpotify(r.play.kind, r.play.id); }
    else if (r.play) { setTab('media'); startYoutube(r.play.video, r.play.more || []); }
    if (r.media) mediaAction(r.media, r.seconds);
    if (r.intent && r.intent.type === 'todo' && from === 'panel') setTab('today');
    return r;
  }
  window.__dockRun = run;

  function showAnswer(title, text) { logChat('tito', `**${title}**\n\n${text}`); setTab('chat'); }

  // ---------------------------------------------------------------- media
  let ytQueue = [], ytHist = [], currentVideo = null;
  let ytFrame = null, ytState = -1, ytTime = 0, ytVol = 100, ytReady = false, ytWatch = 0, ytId = '';
  const ytSend = (fn, args = []) => { if (ytFrame && ytFrame.contentWindow) ytFrame.contentWindow.postMessage({ tito: 'cmd', fn, args }, '*'); };
  function setPlaying(v) { playing = v; $('eq').classList.toggle('on', v); if (!focusing && !alertNow) { clearTimeout(temp); settle(); } }
  function playerFailed(why) {
    clearTimeout(ytWatch); const box = $('playerFrame'); box.textContent = ''; ytFrame = null; setPlaying(false);
    const m = el('div', 'playerr', why === 'offline' ? 'Could not reach YouTube. Check your internet connection.' : 'This video cannot be played inside Tito.');
    const b = el('button', 'chip on', 'Open on YouTube'); b.onclick = () => T.openExternal('https://www.youtube.com/watch?v=' + ytId); m.append(document.createElement('br'), b); box.append(m);
  }
  function renderMore() {
    const box = $('ytMore'); box.textContent = '';
    for (const v of ytQueue.slice(0, 4)) {
      const it = el('div', 'item'); const im = el('img'); im.src = v.thumb || ''; im.alt = ''; const t = el('div', 'txt', v.title); t.append(el('small', '', v.channel || ''));
      it.append(im, t); it.onclick = () => { if (currentVideo) ytHist.push(currentVideo); ytQueue = ytQueue.filter((x) => x.id !== v.id); startYoutube(v, ytQueue); }; box.append(it);
    }
  }
  async function startYoutube(v, more) {
    if (Array.isArray(more)) ytQueue = more; currentVideo = v; renderMore();
    $('player').hidden = false; $('nowTitle').textContent = v.title + (v.channel ? '  -  ' + v.channel : ''); ytId = v.id;
    const box = $('playerFrame'); box.textContent = ''; ytState = -1; ytReady = false; clearTimeout(ytWatch);
    const r = await T.dock.playerUrl(v.id); if (!r.ok) return playerFailed('bad');
    ytFrame = el('iframe'); ytFrame.allow = 'autoplay; encrypted-media; fullscreen'; ytFrame.setAttribute('allowfullscreen', ''); ytFrame.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;background:#000';
    ytFrame.src = r.url; box.append(ytFrame); mood('headphones', 2500);
    ytWatch = setTimeout(() => { if (!ytReady) playerFailed('offline'); }, 12000);          // never leave a black box: say what is wrong
  }
  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || m.tito !== 'yt' || !ytFrame || e.source !== ytFrame.contentWindow) return;
    if (m.ready) { ytReady = true; clearTimeout(ytWatch); setPlaying(true); }
    if (m.error !== undefined) playerFailed(m.error);
    if (typeof m.state === 'number') { ytState = m.state; setPlaying(m.state === 1); }
    if (typeof m.time === 'number') ytTime = m.time; if (typeof m.vol === 'number') ytVol = m.vol;
  });
  /** Controls the embedded player when there is one, otherwise the Windows media keys (Spotify, a browser tab, any player). */
  async function mediaAction(a, seconds) {
    if (a === 'next' && ytFrame && ytQueue.length) { if (currentVideo) ytHist.push(currentVideo); startYoutube(ytQueue.shift(), ytQueue); return; }
    if (a === 'prev' && ytFrame && ytHist.length) { const v = ytHist.pop(); if (currentVideo) ytQueue.unshift(currentVideo); startYoutube(v, ytQueue); return; }
    const yt = ytFrame && document.contains(ytFrame);
    if (yt && ytReady && ['play', 'pause', 'volup', 'voldown', 'mute', 'seek'].includes(a)) {
      if (a === 'play') ytSend(ytState === 1 ? 'pauseVideo' : 'playVideo'); else if (a === 'pause') ytSend('pauseVideo');
      else if (a === 'volup') ytSend('setVolume', [Math.min(100, ytVol + 20)]); else if (a === 'voldown') ytSend('setVolume', [Math.max(0, ytVol - 20)]);
      else if (a === 'mute') ytSend(ytVol ? 'mute' : 'unMute'); else if (a === 'seek') ytSend('seekTo', [ytTime + (seconds || 10), true]);
      return;
    }
    const r = await T.dock.mediaKey(a === 'seek' ? 'next' : a); if (r && r.ok) { if (a === 'play') setPlaying(!playing); if (a === 'pause') setPlaying(false); }
  }
  document.querySelectorAll('.ctrl [data-key]').forEach((b) => (b.onclick = () => mediaAction(b.dataset.key)));
  function embedSpotify(kind, id) {
    const f = el('iframe'); f.src = `https://open.spotify.com/embed/${kind}/${id}`; f.allow = 'autoplay; encrypted-media; clipboard-write'; f.style.height = kind === 'track' || kind === 'episode' ? '152px' : '352px';
    $('spFrame').textContent = ''; $('spFrame').append(f); mood('headphones', 2500);
  }
  // anything pasted into either box is understood: a YouTube link plays here, a Spotify link embeds, a song name is searched
  $('ytForm').onsubmit = async (e) => {
    e.preventDefault(); const v = $('ytIn').value.trim(); if (!v) return; $('ytIn').value = '';
    const r = await T.dock.youtubeInfo(v);
    if (r.ok) startYoutube(r.video, []); else run(/^https?:\/\//i.test(v) ? v : 'play ' + v + ' on youtube');
  };
  $('spForm').onsubmit = (e) => {
    e.preventDefault(); const v = $('spIn').value.trim(); if (!v) return; $('spIn').value = '';
    const m = v.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (m) embedSpotify(m[1], m[2]); else { T.dock.spotify(v); reply(`Opening Spotify for "${v}".`); mood('headphones', 2500); }
  };

  // ---------------------------------------------------------------- study: flashcards, quiz, focus timer
  const level = (xp) => { let l = 1, need = 20; while (xp >= need) { xp -= need; l++; need = Math.round(need * 1.4); } return { l, into: xp, need }; };
  async function refreshStudy() {
    const [{ stats }, all] = await Promise.all([T.cards.due(1), T.cards.list()]);
    $('stDue').textContent = stats.due; $('stTotal').textContent = stats.total; $('stStreak').textContent = stats.streak;
    const lv = level(stats.xp); $('stLevel').textContent = `Level ${lv.l}  -  ${stats.xp} xp`; $('stBar').style.width = Math.round(100 * lv.into / lv.need) + '%';
    $('btnQuiz').disabled = !stats.due; $('btnMistakes').disabled = !stats.mistakes; $('mistakeLabel').textContent = `Mistakes (${stats.mistakes || 0})`;
    const exam = data.exams.find((e) => e.date > Date.now());
    $('planBox').textContent = exam
      ? (() => { const days = Math.max(1, Math.ceil((exam.date - Date.now()) / 86400000)); return `${exam.name} in ${days} day${days > 1 ? 's' : ''}. Today: review ${stats.due} card${stats.due === 1 ? '' : 's'}${days > 1 && stats.total ? `, about ${Math.ceil(stats.total / days)} new per day` : ''} and do one focus round.`; })()
      : stats.due ? `Today: review ${stats.due} card${stats.due === 1 ? '' : 's'} and do one 25 minute focus round.` : 'Nothing due today. Add cards, or circle something and press "Save to flashcards".';
    const list = $('cardList'); list.textContent = '';
    if (!all.length) list.append(el('div', 'sub', 'No cards yet. Circle a word and press "Save to flashcards", or add one here.'));
    for (const c of all.slice(0, 40)) { const it = el('div', 'item'); const t = el('div', 'txt', c.front); t.append(el('small', '', c.back.slice(0, 80))); it.append(t, delBtn(async () => { await T.cards.remove(c.id); refreshStudy(); })); list.append(it); }
    renderExams();
  }
  $('cardForm').onsubmit = async (e) => { e.preventDefault(); const f = $('cardFront').value, b = $('cardBack').value; const r = await T.cards.add(f, b); if (r.ok) { $('cardFront').value = ''; $('cardBack').value = ''; refreshStudy(); } };

  let queue = [], qi = 0, qRight = 0;
  async function startQuiz(mistakes) {
    const r = await T.cards.due(8, mistakes); queue = r.cards; qi = 0; qRight = 0;
    if (!queue.length) { reply('Nothing is due. Come back later or add more cards.'); return; }
    $('studyHome').hidden = true; $('quiz').hidden = false; showCard(); mood('thinking', 2000);
  }
  $('btnQuiz').onclick = () => startQuiz(false); $('btnMistakes').onclick = () => startQuiz(true);
  function showCard() {
    const c = queue[qi]; $('qCount').textContent = `Card ${qi + 1} of ${queue.length}`; $('qFront').textContent = c.front; $('qBack').textContent = c.back; $('qBack').hidden = true;
    $('qShow').hidden = false; $('qGrade').hidden = true;
  }
  $('qReveal').onclick = () => { $('qBack').hidden = false; $('qShow').hidden = true; $('qGrade').hidden = false; };
  async function grade(right) {
    await T.cards.grade(queue[qi].id, right); if (right) { qRight++; sfx('cheer', 0.5); mood('cheer', 2600); } else { sfx('oops', 0.4); mood('oops', 2600); }
    qi++; if (qi < queue.length) showCard(); else endQuiz(true);
  }
  $('qYes').onclick = () => grade(true); $('qNo').onclick = () => grade(false);
  $('qExit').onclick = () => endQuiz(false);
  function endQuiz(finished) {
    $('quiz').hidden = true; $('studyHome').hidden = false; refreshStudy();
    if (finished) { sfx('celebrate', 0.55); reply(`Round done. You knew ${qRight} of ${queue.length}.`); mood(qRight === queue.length ? 'streak_fire' : 'celebrate', 4200); say(`${qRight} of ${queue.length}. Nice.`); }
  }

  // weekly card: a picture of the week to keep or share
  $('btnWeek').onclick = async () => {
    const w = await T.weekStats(); await document.fonts.load('800 56px Nunito');
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1080, 1080); g.addColorStop(0, '#ffd3e4'); g.addColorStop(1, '#d4c8ff'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
    x.fillStyle = '#4a3865'; x.font = '800 64px Nunito'; x.fillText('My week with Tito', 80, 140);
    const rows = [[w.asked, 'things I looked up'], [w.reviewed, 'flashcards reviewed'], [w.streak, 'day study streak'], [w.cards, 'cards in my deck']];
    rows.forEach(([n, label], i) => { const y = 250 + i * 170; x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.roundRect(80, y, 920, 140, 40); x.fill(); x.fillStyle = '#ff7fb0'; x.font = '800 84px Nunito'; x.fillText(String(n), 120, y + 100); x.fillStyle = '#5d4a7a'; x.font = '700 40px Nunito'; x.fillText(label, 340, y + 88); });
    x.fillStyle = '#85729e'; x.font = '700 32px Nunito'; x.fillText('Circle anything. Tito explains it.', 80, 1020);
    await T.copyImage(c.toDataURL('image/png')); const saved = await T.saveImage(c.toDataURL('image/png')); reply('Weekly card copied' + (saved && saved.ok ? ' and saved to Pictures/Tito.' : '.')); mood('celebrate', 3000);
  };

  // ---------------------------------------------------------------- Teach Tito: explain a topic to Tito (Feynman technique) and get graded
  let tp = { topic: '', round: 0, question: '', scores: [], cards: [], busy: false };
  const tpShow = (id) => { for (const x of ['tpSetup', 'tpTalk', 'tpResult', 'tpDone']) $(x).hidden = x !== id; };
  async function openTeach(topic, autoStart) {
    setTab('study'); $('studyHome').hidden = true; $('quiz').hidden = true; $('focus').hidden = true; $('teach').hidden = false;
    tp = { topic: '', round: 0, question: '', scores: [], cards: [], busy: false }; $('tpTopic').value = topic || ''; $('tpRound').textContent = 'Teach Tito'; tpShow('tpSetup');
    const rec = $('tpRecent'); rec.textContent = '';
    try { const h = await T.history.list(); const seen = new Set(); for (const x of h) { const t = String(x.title || '').trim(); if (!t || seen.has(t.toLowerCase()) || seen.size >= 4) continue; seen.add(t.toLowerCase()); const c = el('button', 'chip', t); c.onclick = () => { $('tpTopic').value = t; startTeach(); }; rec.append(c); } } catch { /* no notebook yet */ }
    if (topic && autoStart) startTeach(); else $('tpTopic').focus();
  }
  function startTeach() {
    const topic = $('tpTopic').value.trim(); if (topic.length < 2) { reply('What should you teach me?'); return; }
    tp = { topic, round: 1, question: '', scores: [], cards: [], busy: false };
    askRound(`I have never heard of ${topic}. Can you teach me? Explain it like I am 10 years old.`);
  }
  function askRound(q) { tp.question = q; $('tpRound').textContent = `Teach Tito: round ${tp.round} of 3`; $('tpQ').textContent = q; $('tpText').value = ''; tpShow('tpTalk'); mood('listening', 0); $('tpText').focus(); }
  async function sendTeach() {
    if (tp.busy) return; const text = $('tpText').value.trim(); if (text.length < 15) { reply('Tell me a little more, in your own words.'); return; }
    tp.busy = true; $('tpSend').disabled = true; reply('Thinking about what you said...'); mood('thinking', 0);
    const r = await T.dock.teachEvaluate({ topic: tp.topic, text, round: tp.round, question: tp.question });
    tp.busy = false; $('tpSend').disabled = false; settle(); reply('');
    if (!r.ok) { reply(r.message || 'Something went wrong. Try again.'); mood('confused', 2500); return; }
    tp.scores.push(r.score); for (const c of r.cards) if (!tp.cards.some((x) => x.front.toLowerCase() === c.front.toLowerCase())) tp.cards.push(c);
    renderTeachResult(r);
  }
  function tpList(title, items, cls) { if (!items.length) return null; const b = el('div', 'tpl ' + cls); b.append(el('b', '', title)); for (const i of items) b.append(el('div', '', i)); return b; }
  function renderTeachResult(r) {
    const box = $('tpResult'); box.textContent = '';
    const head = el('div', 'tpscore ' + (r.score >= 80 ? 'great' : r.score >= 50 ? 'okay' : 'low')); head.append(el('b', '', String(r.score)), el('span', '', 'out of 100')); box.append(head);
    if (r.praise) box.append(el('div', 'tppraise', r.praise));
    for (const [t, a, c] of [['You got right', r.good, 'good'], ['Missing', r.gaps, 'gap'], ['Not quite', r.wrong, 'wrong']]) { const l = tpList(t, a, c); if (l) box.append(l); }
    const last = tp.round >= 3 || !r.question; const row = el('div', 'row2');
    if (!last) { box.append(el('div', 'tpq', 'I wonder: ' + r.question)); const b = el('button', 'btn primary', 'Answer my question'); b.onclick = () => { tp.round++; askRound(r.question); }; row.append(b); }
    const f = el('button', 'btn' + (last ? ' primary' : ''), last ? 'Finish' : 'Finish now'); f.onclick = finishTeach; row.append(f); box.append(row);
    tpShow('tpResult'); const [anim, snd] = r.score >= 80 ? ['streak_fire', 'celebrate'] : r.score >= 50 ? ['cheer', 'cheer'] : ['oops', 'oops']; sfx(snd, 0.5); mood(anim, 3500);
  }
  async function finishTeach() {
    const r = await T.dock.teachFinish({ topic: tp.topic, scores: tp.scores }); const box = $('tpDone'); box.textContent = '';
    const head = el('div', 'tpscore ' + (r.avg >= 80 ? 'great' : r.avg >= 50 ? 'okay' : 'low')); head.append(el('b', '', String(r.avg)), el('span', '', 'teaching score')); box.append(head);
    box.append(el('div', 'tppraise', `You taught me ${tp.topic}. +${r.gain} xp.`));
    const row = el('div', 'row2');
    if (tp.cards.length) { const sv = el('button', 'btn primary', `Save ${tp.cards.length} flashcard${tp.cards.length > 1 ? 's' : ''}`); sv.onclick = async () => { for (const c of tp.cards) await T.cards.add(c.front, c.back); sv.disabled = true; sv.textContent = 'Saved'; refreshStudy(); }; row.append(sv); }
    const again = el('button', 'btn', 'Teach something else'); again.onclick = () => openTeach('', false); row.append(again); box.append(row);
    tpShow('tpDone'); refreshStudy(); sfx('celebrate', 0.5);
  }
  function closeTeach() { $('teach').hidden = true; $('studyHome').hidden = false; settle(); refreshStudy(); }
  $('btnTeach').onclick = () => openTeach('', false); $('tpForm').onsubmit = (e) => { e.preventDefault(); startTeach(); }; $('tpSend').onclick = sendTeach; $('tpExit').onclick = closeTeach;
  $('tpMic').onclick = () => { voiceTarget = 'teach'; startVoice(); };
  T.on('dock:teach', ({ topic }) => openTeach(topic, !!topic));

  let fTimer = 0, fEnd = 0, guardOn = false;
  $('btnFocus').onclick = async () => {
    focusing = true; fEnd = Date.now() + 25 * 60000; $('studyHome').hidden = true; $('focus').hidden = false; $('fReport').hidden = true; $('fReport').textContent = ''; $('fTime').hidden = false; $('fStop').parentNode.hidden = false;
    clearTimeout(temp); settle(); tickFocus(); fTimer = setInterval(tickFocus, 1000);
    const g = await T.dock.focusStart(); guardOn = !!(g && g.guard); $('fLive').textContent = guardOn ? 'Focus Guard is watching quietly (only window titles, on this PC).' : ''; $('fMeterBar').style.width = '100%';
  };
  function tickFocus() {
    const left = Math.max(0, fEnd - Date.now()); $('fTime').textContent = `${pad(Math.floor(left / 60000))}:${pad(Math.floor(left / 1000) % 60)}`;
    if (!left) { sfx('focus_done', 0.6); mood('celebrate', 5000); say('Focus round done. Take a 5 minute break.', 9000); stopFocus(true); }
  }
  T.on('dock:focusLive', (l) => {
    if (!focusing) return; $('fMeterBar').style.width = Math.max(4, l.score) + '%';
    $('fLive').className = 'sub' + (l.state === 'distract' ? ' bad' : ''); $('fLive').textContent = l.state === 'break' ? 'On a break. Not counting.' : l.state === 'distract' ? `Drifting: ${l.label}` : `On task  -  focus ${l.score}%`;
  });
  T.on('dock:nudge', (n) => {
    if (!focusing) return; sfx('oops', 0.45); mood('worried', 5000);
    const back = () => { clearAlert(); hideBubble(); reply(''); if (isPop) popResult(''); settle(); };
    const btns = [['Back to work', back], ['5 min break', async () => { await T.dock.focusPause(5); back(); }]];
    const msg = `You have been on ${n.label} for ${n.secs} seconds. Back to studying?`;
    if (isOpen) reply(msg, btns); else if (isPop) popResult(msg, btns); else say(msg, 0, btns);
  });
  function reportNode(rep) {
    const box = el('div'); const head = el('div', 'tpscore ' + (rep.score >= 80 ? 'great' : rep.score >= 50 ? 'okay' : 'low')); head.append(el('b', '', rep.score + '%'), el('span', '', 'focus score')); box.append(head);
    box.append(el('div', 'tppraise', rep.score >= 80 ? 'Great focus. Proud of you.' : rep.score >= 50 ? 'Decent. A little less wandering next round.' : 'That was a drifty one. Try again, I will help.'));
    const l = el('div', 'tpl good'); l.append(el('b', '', 'This round')); l.append(el('div', '', `Studied ${Math.round(rep.onSec / 60)} min, drifted ${Math.round(rep.badSec / 60)} min, ${rep.nudges} nudge${rep.nudges === 1 ? '' : 's'}.  +${rep.xp || 0} xp`)); box.append(l);
    if (rep.top && rep.top.length) { const d = el('div', 'tpl gap'); d.append(el('b', '', 'Top distractions')); for (const x of rep.top) d.append(el('div', '', `${x.label}: ${Math.max(1, Math.round(x.sec / 60))} min`)); box.append(d); }
    return box;
  }
  async function stopFocus(finished) {
    clearInterval(fTimer); focusing = false; const res = await T.dock.focusStop(); const rep = res && res.report;
    if (!rep || !rep.minutes) { $('focus').hidden = true; $('studyHome').hidden = false; settle(); refreshStudy(); return; }
    $('fTime').hidden = true; $('fStop').parentNode.hidden = true; $('fLive').textContent = ''; const box = $('fReport'); box.textContent = ''; box.hidden = false; box.append(reportNode(rep));
    const done = el('button', 'btn primary', 'Done'); done.style.width = '100%'; done.onclick = () => { $('focus').hidden = true; $('studyHome').hidden = false; settle(); refreshStudy(); }; box.append(el('div', 'row2').appendChild(done).parentNode);
    logChat('tito', `**Focus round**: score **${rep.score}%**, studied ${Math.round(rep.onSec / 60)} min, drifted ${Math.round(rep.badSec / 60)} min` + (rep.top.length ? ` (${rep.top.map((x) => x.label).join(', ')})` : '') + '.');
    sfx(rep.score >= 80 ? 'celebrate' : 'done', 0.5); mood(rep.score >= 80 ? 'streak_fire' : rep.score >= 50 ? 'cheer' : 'oops', 3500); refreshStudy();
  }
  $('fStop').onclick = () => stopFocus(false);

  // ---------------------------------------------------------------- voice
  let rec = null, chunks = [], stream = null, silence = null, voiceTarget = '';
  async function startVoice() {
    if (recording) return stopVoice();
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { reply('I cannot reach a microphone. Check that one is connected and allowed in Windows privacy settings.'); return; }
    recording = true; chunks = []; sfx('mic_on', 0.4); $('btnMic').classList.add('rec'); mood('mic_listening', 0); $('popMic').classList.add('rec'); if (voiceTarget === 'pop') popResult('Listening... speak now.'); else { reply('Listening... speak now.'); if (!isOpen && !isPop) say('Listening...', 12000); }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); rec.onstop = finishVoice; rec.start(250);
    // stop by itself after the speaker goes quiet (or after 15 seconds)
    const ac = new AudioContext(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 512; src.connect(an); const buf = new Uint8Array(an.fftSize);
    let heard = false, quietSince = 0; const started = Date.now();
    silence = setInterval(() => {
      an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      if (peak > 14) { heard = true; quietSince = 0; } else if (heard && !quietSince) quietSince = Date.now();
      if ((heard && quietSince && Date.now() - quietSince > 1400) || Date.now() - started > 15000) { ac.close(); stopVoice(); }
    }, 120);
  }
  function stopVoice() { if (recording) sfx('mic_off', 0.4); clearInterval(silence); if (rec && rec.state !== 'inactive') rec.stop(); recording = false; $('btnMic').classList.remove('rec'); $('popMic').classList.remove('rec'); }
  async function finishVoice() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); if (voiceTarget === 'pop') popResult('Understanding...'); else reply('Understanding...'); mood('thinking', 0);
    const r = await T.dock.transcribe({ audio: await blob.arrayBuffer(), mime: blob.type });
    settle(); const target = voiceTarget; voiceTarget = '';
    if (!r.ok) { reply(r.message || 'I could not understand that.'); mood('confused', 2500); return; }
    if (!r.text) { reply('I did not hear anything.'); return; }
    if (target === 'teach') { reply(''); $('tpText').value = ($('tpText').value + ' ' + r.text).trim(); return; }
    if (target === 'pop') { run(r.text, { from: 'pop' }); return; }
    $('cmdIn').value = r.text; setTimeout(() => { $('cmdIn').value = ''; }, 400); run(r.text);
  }
  $('btnMic').onclick = startVoice;
  T.on('dock:voice', () => startVoice());

  // ---------------------------------------------------------------- idle life
  function life() {
    wander = setTimeout(() => {
      if (!isOpen && !focusing && !playing && !alertNow && !night() && pet.name === 'idle') {
        const soon = data.reminders.find((r) => r.kind === 'deadline' && r.at > Date.now() && r.at - Date.now() < 3 * 3600000);
        if (soon) { mood('worried', 4500); say(`${soon.text} ${rel(soon.at)}`, 6000); }
        else mood(Math.random() < 0.5 ? 'listening_wave' : 'greeting', 3500);
      }
      life();
    }, 40000 + Math.random() * 40000);
  }
  setInterval(() => { if (!alertNow && (pet.name === 'idle' || pet.name === 'sleeping')) settle(); }, 20000);          // falls asleep at night when you are away

  setData(await T.dock.data()); settle(); life(); renderChat();
  window.__dock = { brief: showBrief, pop: openPop, closePop, focusUi: () => ({ focusing, guardOn, live: $('fLive').textContent, report: !$('fReport').hidden }), teach: openTeach, playVideo: startYoutube, yt: () => ({ ready: ytReady, state: ytState, time: ytTime, hasFrame: !!ytFrame, id: currentVideo && currentVideo.id, queue: ytQueue.length }), ringFx, say, mood, run, setTab, state: () => ({ pet: pet.name, open: isOpen, pop: isPop, tab, playing, focusing }) };
})();

// `npm run selftest`: drives every window and saves screenshots to $TITO_SHOTS plus a console log, then quits.
// Uses TITO_TEST_IMAGE as a fake screen (never captures the real desktop) and the keys in GEMINI_API_KEY / GROQ_API_KEY.
const fs = require('fs');
const path = require('path');
const { app, screen, clipboard } = require('electron');
const store = require('./store');

const OUT = process.env.TITO_SHOTS || path.join(app.getPath('temp'), 'tito-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

function watch(name, win) {
  if (!win || win.__watched) return; win.__watched = true;
  win.webContents.on('console-message', (...a) => {
    const d = a[0] && a[0].message !== undefined ? a[0] : { level: a[1], message: a[2], sourceId: a[4] };
    log.push(`[${name}] ${d.level}: ${d.message}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => log.push(`[${name}] CRASH ${d.reason}`));
}
async function shot(win, name) {
  if (!win || win.isDestroyed()) { log.push(`(no window for ${name})`); return; }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  log.push(`shot ${name} ${img.getSize().width}x${img.getSize().height}`);
}
const js = (win, code) => win.webContents.executeJavaScript(code);

async function run({ summon, openSettings, showToast, closeOverlay, getOverlay, getToast }) {
  fs.mkdirSync(OUT, { recursive: true });
  try {
    watch('overlay', getOverlay());
    // --- settings window
    const sw = openSettings('home'); watch('settings', sw); await sleep(2600);
    await shot(sw, '1_home');
    store.addHistory({ title: 'Serendipity', answer: 'A happy accident: finding something good without looking for it.', kind: 'word', via: 'online' });
    store.addHistory({ title: 'Error 404', answer: 'The page was not found. The link is wrong or the page was removed.', kind: 'error', via: 'ocr' });
    openSettings('notebook'); await sleep(900); await shot(sw, '2_notebook');
    openSettings('settings'); await sleep(900);

    // paste a key the way a user would: Tito should recognise the provider, save it, find and test the best model
    const groqKey = process.env.GROQ_API_KEY || '';
    if (groqKey) {
      await js(sw, `(() => { const i = document.getElementById('keyIn'); i.value = ${JSON.stringify(groqKey)}; i.dispatchEvent(new Event('input')); })()`);
      await sleep(900);
      log.push('after paste: ' + await js(sw, "document.getElementById('keyMsg').textContent") + ' | chip on: ' + await js(sw, "document.querySelector('#provRow .chip.on').textContent"));
      await js(sw, "document.getElementById('keySave').click()");
      for (let i = 0; i < 40; i++) { await sleep(1000); const m = await js(sw, "document.getElementById('keyMsg').textContent"); if (!/Finding/.test(m)) break; }
      log.push('after save: ' + await js(sw, "document.getElementById('keyMsg').textContent"));
      log.push('model select: ' + await js(sw, "JSON.stringify([...document.getElementById('modelSel').options].map(o => o.textContent))"));
      await js(sw, "document.getElementById('keyTest').click()"); await sleep(6000);
      log.push('test button: ' + await js(sw, "document.getElementById('keyMsg').textContent"));
    }
    await shot(sw, '3_settings');
    await js(sw, "document.getElementById('packList').scrollIntoView({ block: 'center' })"); await sleep(1200); await shot(sw, '3c_packs');
    // theme + voice cards, in the default theme and in a dark one
    await js(sw, "document.getElementById('themeRow').scrollIntoView({ block: 'center' })"); await sleep(700); await shot(sw, '3d_themes');
    await js(sw, "document.getElementById('toneRow').scrollIntoView({ block: 'center' })"); await sleep(700); await shot(sw, '3e_voice_ringtone');
    await js(sw, "document.documentElement.dataset.theme = 'midnight'"); await sleep(500); await shot(sw, '3f_voice_midnight');
    await js(sw, "document.getElementById('themeRow').scrollIntoView({ block: 'center' })"); await sleep(500); await shot(sw, '3g_themes_midnight');
    await js(sw, "document.documentElement.dataset.theme = 'cyber'"); await sleep(400); await js(sw, "document.getElementById('tab-home') && document.querySelector('[data-tab=home]').click()"); await sleep(600); await shot(sw, '3h_home_cyber');
    await js(sw, "document.documentElement.dataset.theme = 'mochi'; document.querySelector('[data-tab=settings]').click()");
    log.push('packs ui: ' + await js(sw, "JSON.stringify([...document.querySelectorAll('.packrow')].map(r => r.querySelector('b').textContent + ' -> ' + r.querySelector('button').textContent))"));
    await js(sw, "document.querySelector('main').scrollTo(0, 99999)"); await sleep(300); await shot(sw, '3b_settings_bottom');

    // --- greeting toast
    showToast({ state: 'greeting', text: 'Tito is awake. Press Ctrl + Shift + Space and circle anything on your screen.' });
    await sleep(2200); watch('toast', getToast()); await shot(getToast(), '4_toast');
    await sleep(500);

    // --- overlay
    sw.hide();
    await summon();
    for (let i = 0; i < 40 && !(getOverlay() && getOverlay().isVisible()); i++) await sleep(150);
    const ov = getOverlay(); watch('overlay', ov);
    const waitAnswer = async (label) => {
      for (let i = 0; i < 400; i++) { const st = await js(ov, 'window.__tito.state()'); if (st.answer && st.title !== 'Looking closely...' && !/Retrying/.test(st.title)) return st; await sleep(150); }
      log.push('TIMEOUT waiting for answer: ' + label); return js(ov, 'window.__tito.state()');
    };
    const snap = async (label) => { const s = await js(ov, 'window.__tito.state()'); const c = await js(ov, 'window.__tito.cardRect()'); log.push(label + ' => ' + s.title + ' | ' + s.via + ' | pet=' + s.pet + ' | card ' + Math.round(c.w) + 'x' + Math.round(c.h) + ' | ' + s.answer.slice(0, 120)); };
    await sleep(1500); await shot(ov, '5_overlay_listening');
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
    const k = 1920 / d.width;                                    // the fake screen is 1920 wide; place strokes in window coordinates
    const cx = 800 / k, cy = 480 / k, rx = 190 / k, ry = 70 / k;  // around the French sentence
    const pts = Array.from({ length: 46 }, (_, i) => { const t = (i / 45) * Math.PI * 2.1; return { x: Math.round(cx + Math.cos(t) * rx), y: Math.round(cy + Math.sin(t) * ry) }; });
    await js(ov, `window.__tito.simulate(${JSON.stringify(pts)})`);
    await sleep(600); await shot(ov, '6_overlay_loading');
    await waitAnswer('explain'); await sleep(900); await shot(ov, '7_overlay_typing');
    await sleep(3500); await shot(ov, '8_overlay_done'); await snap('explain (French sentence)');
    await js(ov, "window.__tito.click('#qa [data-act=translate]')"); await sleep(400); await waitAnswer('translate'); await sleep(3500); await shot(ov, '9_overlay_translate'); await snap('translate');
    await js(ov, "window.__tito.setStyle('kid')"); await sleep(400); await waitAnswer('kid'); await sleep(2500); await snap('kid style');
    await js(ov, "window.__tito.ask('Why is that?')"); await sleep(400); await waitAnswer('followup'); await sleep(3500); await shot(ov, '10_overlay_followup'); await snap('follow-up');
    await js(ov, "window.__tito.click('#aGrab')"); await sleep(3500);
    log.push('clipboard after Grab text: ' + JSON.stringify(clipboard.readText().slice(0, 80)) + ' | toast: ' + await js(ov, "document.getElementById('toast').textContent"));
    await js(ov, "window.__tito.click('#aCopy')"); await sleep(500);
    log.push('clipboard after Copy: ' + JSON.stringify(clipboard.readText().slice(0, 60)));
    await js(ov, "window.__tito.click('#aShare')"); await sleep(2500);
    log.push('toast after Share: ' + await js(ov, "document.getElementById('toast').textContent"));
    await js(ov, "window.__tito.click('#tScreen')"); await sleep(600); await waitAnswer('whole screen'); await sleep(3500); await shot(ov, '11_overlay_wholescreen'); await snap('whole screen');
    await js(ov, "window.__tito.click('.tool[data-mode=box]')");
    await js(ov, `window.__tito.box(${Math.round(1050 / k)}, ${Math.round(310 / k)}, ${Math.round(450 / k)}, ${Math.round(290 / k)})`); await sleep(500); await waitAnswer('box'); await sleep(3500); await shot(ov, '12_overlay_box'); await snap('box (code error)');
    await js(ov, "window.__tito.click('#qa [data-act=fix]')"); await sleep(400); await waitAnswer('fix'); await sleep(3500); await shot(ov, '13_overlay_fix'); await snap('fix');

    // --- PDF export (writes straight to the output folder in the self-test instead of opening a dialog)
    process.env.TITO_SELFTEST_PDF = path.join(OUT, 'answer.pdf');
    await js(ov, "window.__tito.click('#aPdf')"); await sleep(4500);
    const pdfOk = fs.existsSync(process.env.TITO_SELFTEST_PDF);
    log.push('PDF export: ' + pdfOk + (pdfOk ? ' ' + fs.statSync(process.env.TITO_SELFTEST_PDF).size + ' bytes' : '') + ' | toast: ' + await js(ov, "document.getElementById('toast').textContent"));
    log.push('memory: ' + JSON.stringify(store.publicSettings().memory));

    // --- translation engines: MyMemory (online) on the French sentence
    store.save({ translateEngine: 'mymemory' });
    await js(ov, `window.__tito.simulate(${JSON.stringify(pts)})`); await sleep(500); await waitAnswer('explain again'); await sleep(2500);
    await js(ov, "window.__tito.click('#qa [data-act=translate]')"); await sleep(400); await waitAnswer('mymemory'); await sleep(3000); await shot(ov, '14_overlay_mymemory'); await snap('translate via MyMemory (French)');
    // offline Hindi pack on the English paragraph
    store.save({ translateEngine: 'offline', translateTo: 'hi' });
    const para = () => `window.__tito.box(${Math.round(110 / k)}, ${Math.round(205 / k)}, ${Math.round(780 / k)}, ${Math.round(110 / k)})`;
    await js(ov, "window.__tito.click('.tool[data-mode=box]')"); await js(ov, para()); await sleep(500); await waitAnswer('explain para'); await sleep(2500);
    await js(ov, "window.__tito.click('#qa [data-act=translate]')"); await sleep(400); await waitAnswer('offline hindi'); await sleep(3500); await shot(ov, '15_overlay_offline_hindi'); await snap('translate via offline Hindi pack (English paragraph)');
    store.save({ translateEngine: 'auto' });

    // provider fallback: break the preferred provider's key, Tito must silently use the other one
    store.setKey('gemini', 'AIzaBADBADBADBADBADBADBADBADBADBADBADBAD'); store.save({ provider: 'gemini' });
    await js(ov, "window.__tito.click('#aAgain')"); await sleep(400); await waitAnswer('fallback'); await sleep(2500); await snap('fallback (bad Gemini key)');
    store.setKey('gemini', '');

    // --- offline AI: remove every key, the small built-in model must explain the selection from OCR text
    store.setKey('groq', ''); process.env.GEMINI_API_KEY = ''; process.env.GROQ_API_KEY = '';
    await js(ov, "window.__tito.click('.tool[data-mode=box]')"); await js(ov, para()); await sleep(600); await waitAnswer('offline ai'); await sleep(3500); await shot(ov, '16_overlay_offline_ai'); await snap('offline AI (no keys)');
    await js(ov, "window.__tito.click('#qa [data-act=summarize]')"); await sleep(400); await waitAnswer('offline ai summarize'); await sleep(3000); await snap('offline AI summarize');
    // --- extras with a fake answer (no AI needed): picture strip, deadline chip, quiz cards
    await js(ov, "window.__tito.click('.tool[data-mode=box]')"); await js(ov, para()); await sleep(600); await waitAnswer('extras base'); await sleep(800);
    await js(ov, "window.__tito.fake({ title: 'Red panda', answer: 'A small tree-living mammal from the Himalayas that eats mostly bamboo.', kind: 'object', mood: 'excited', chips: [], search: 'red panda', image_query: 'red panda', due: Date.now() + 6 * 86400000, due_title: 'Library report' })");
    await sleep(4500); await shot(ov, '17_overlay_pictures'); log.push('extras: ' + JSON.stringify(await js(ov, 'window.__tito.extras()')));
    await js(ov, "window.__tito.fake({ title: 'Quiz', answer: 'What does the library open at? | Nine\\nWhen does it close? | Six\\nWho can help you find a book? | The librarian', kind: 'text', mood: 'happy', chips: [], search: '' }, 'quiz')");
    await sleep(1200); await shot(ov, '18_overlay_quiz'); log.push('quiz: ' + JSON.stringify(await js(ov, 'window.__tito.extras()')));
    closeOverlay(); await sleep(400);
    log.push('overlay hidden: ' + !ov.isVisible());
  } catch (e) { log.push('SELFTEST ERROR ' + (e.stack || e)); }
  fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n'));
  setTimeout(() => app.exit(0), 300);
}
module.exports = { run };

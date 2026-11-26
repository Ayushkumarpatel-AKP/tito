const { contextBridge, ipcRenderer, webUtils } = require('electron');

// every window follows the chosen theme (set on <html data-theme>)
const applyTheme = (t) => { try { document.documentElement.dataset.theme = t || 'mochi'; } catch { /* page not ready */ } };
window.addEventListener('DOMContentLoaded', () => { ipcRenderer.invoke('settings:get').then((s) => applyTheme(s && s.theme)).catch(() => {}); });
ipcRenderer.on('settings:changed', (_e, s) => applyTheme(s && s.theme));

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const EVENTS = ['overlay:open', 'overlay:closed', 'win:tab', 'settings:changed', 'ai:wait', 'packs:progress', 'dock:alert', 'dock:data', 'dock:layout', 'dock:tab', 'dock:voice', 'dock:focus', 'dock:cheer', 'dock:idle', 'dock:summon', 'dock:startFocus', 'dock:stopFocus', 'dock:cards', 'dock:teach', 'dock:pop', 'dock:brief', 'dock:nudge', 'dock:focusLive', 'dock:tour', 'dock:update', 'dock:whatsnew'];

contextBridge.exposeInMainWorld('tito', {
  getSettings: inv('settings:get'),
  saveSettings: inv('settings:save'),
  setKey: inv('settings:setKey'),
  testKey: inv('ai:test'),
  providers: inv('ai:providers'),
  detectKey: inv('ai:detectKey'),
  autopick: inv('ai:autopick'),
  models: inv('ai:models'),
  aiStatus: inv('ai:status'),
  ask: inv('ai:ask'),
  history: { list: inv('history:list'), add: inv('history:add'), remove: inv('history:remove'), clear: inv('history:clear'), exportMd: inv('history:export') },
  weekStats: inv('stats:week'),
  cards: { list: inv('cards:list'), add: inv('cards:add'), due: inv('cards:due'), grade: inv('cards:grade'), remove: inv('cards:remove'), stats: inv('cards:stats') },
  images: inv('search:images'),
  speak: inv('tts:speak'),
  ttsInfo: inv('tts:info'),
  reminderAdd: inv('reminder:add'),
  ocr: inv('ocr:run'),
  packs: { status: inv('packs:status'), download: inv('packs:download'), remove: inv('packs:remove') },
  translateLangs: inv('translate:langs'),
  forgetMemory: inv('memory:forget'),
  savePdf: inv('pdf:save'),
  saveNotebookPdf: inv('pdf:notebook'),
  copyText: inv('clip:text'),
  copyImage: inv('clip:image'),
  saveImage: inv('share:save'),
  openExternal: inv('open:external'),
  showInFolder: inv('open:folder'),
  openWindow: inv('win:open'),
  info: inv('app:info'),
  dock: {
    data: inv('dock:data'), open: inv('dock:open'), hide: inv('dock:hide'), command: inv('dock:command'), brief: inv('dock:brief'), state: inv('dock:state'),
    tourDone: inv('tour:done'), pin: inv('dock:pin'), installUpdate: () => ipcRenderer.send('app:installUpdate'),
    file: inv('dock:file'), pdf: inv('dock:pdf'), pickFiles: inv('dock:pickFiles'), pathsOf: (files) => Array.from(files || []).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }),
    bubble: inv('dock:bubble'), pop: inv('dock:pop'), popH: inv('dock:popH'), briefData: inv('dock:briefData'), undo: inv('undo:run'), focusStart: inv('focus:start'), focusStop: inv('focus:stop'), focusPause: inv('focus:pause'), openTarget: inv('target:open'),
    dragStart: () => ipcRenderer.send('dock:dragstart'), drag: (dx, dy) => ipcRenderer.send('dock:drag', { dx, dy }), dragEnd: () => ipcRenderer.send('dock:dragend'),
    todoAdd: inv('todo:add'), todoToggle: inv('todo:toggle'), todoRemove: inv('todo:remove'), todoClearDone: inv('todo:clearDone'),
    reminderAdd: inv('reminder:add'), reminderRemove: inv('reminder:remove'), reminderSnooze: inv('reminder:snooze'), reminderAck: inv('reminder:ack'),
    routineMark: inv('routine:mark'), routineUnmark: inv('routine:unmark'), routineSave: inv('routine:save'), routineRemove: inv('routine:remove'),
    importIcs: inv('ics:import'), examAdd: inv('exam:add'), examRemove: inv('exam:remove'),
    teachEvaluate: inv('teach:evaluate'), teachFinish: inv('teach:finish'),
    lookup: inv('search:lookup'), explainText: inv('clip:explain'), images: inv('search:images'), transcribe: inv('voice:transcribe'),
  },
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  closeOverlay: () => ipcRenderer.send('overlay:close'),
  summon: () => ipcRenderer.send('app:summon'),
  toastDone: () => ipcRenderer.send('toast:done'),
  toastClick: () => ipcRenderer.send('toast:click'),
  on: (ch, cb) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, p) => cb(p)); },
});

// Files dropped on Tito: a File object cannot cross into the page, so the path is read here and posted as a message.
const fileKind = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragover', (e) => { if (fileKind(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; window.postMessage({ tito: 'dragover' }, '*'); } }, true);
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) window.postMessage({ tito: 'dragleave' }, '*'); }, true);
window.addEventListener('drop', (e) => {
  if (!fileKind(e)) return; e.preventDefault();
  const paths = Array.from(e.dataTransfer.files || []).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean);
  window.postMessage({ tito: 'drop', paths }, '*');
}, true);

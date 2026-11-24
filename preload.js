const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const EVENTS = ['overlay:open', 'overlay:closed', 'win:tab', 'settings:changed', 'ai:wait', 'packs:progress'];

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
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  closeOverlay: () => ipcRenderer.send('overlay:close'),
  summon: () => ipcRenderer.send('app:summon'),
  toastDone: () => ipcRenderer.send('toast:done'),
  toastClick: () => ipcRenderer.send('toast:click'),
  on: (ch, cb) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, p) => cb(p)); },
});

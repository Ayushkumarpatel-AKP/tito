// The first-time tour, the update card and "what is new": small cards from Tito, shown in the pop area above the pet.
// This file only holds their words and steps. dock.js builds the cards with them (window.TitoTour).
(function () {
  const keys = (list) => list;
  /** The tour, step by step. A step can ask for a name, offer commands to try for real, press a shortcut for you, or just show something. */
  function steps(name) {
    const who = name ? `, ${name}` : '';
    return [
      { id: 'hello', anim: 'greeting', title: 'Hi, I am Tito :)', body: 'Thank you for installing me! I live at the edge of your screen and help you study and get things done. What should I call you?', ask: 'name' },
      { id: 'me', anim: 'success', ring: true, title: `Nice to meet you${who} <3`, body: 'I stay at the edge of your screen. Drag me anywhere you like. Click me any time and a small popup opens for quick jobs.' },
      { id: 'try', anim: 'typing', title: 'Try the small popup', body: 'Tap one and watch me do it for real.', chips: ['remind me in 1 minute to stretch', 'add todo drink water', 'what time is it'] },
      { id: 'circle', anim: 'searching', title: 'Circle anything on your screen', body: 'Press the shortcut, draw a box around any text or picture, and I explain it or translate it.', keys: keys(['Ctrl', 'Shift', 'Space']), action: { label: 'Try it now', cmd: 'circle something' } },
      { id: 'panel', anim: 'talking', title: 'Your panel', body: 'Open it from the tabs on my panel. Chat also takes files: press the paperclip, or drop a PDF, picture or Excel file on me.', tabs: [['check-square', 'Today', 'reminders and to-dos'], ['brain', 'Study', 'cards, quiz, focus'], ['calendar-check', 'Daily', 'water and routines'], ['chat-circle-text', 'Chat', 'ask or attach']] },
      { id: 'ask', anim: 'thinking', title: 'Say it and I do it', body: 'Meetings, Excel sheets, PDF tools, notes and exam plans work with no AI key and no internet. For example:', examples: ['exam rescue chemistry on 20 dec', 'make an expense sheet: date, item, amount, total', 'kal 4 baje Rahul ke saath meeting', 'add clipboard to notes'] },
      { id: 'keys', anim: 'listening_wave', title: 'Shortcuts to remember', body: '', list: [['Ctrl + Shift + Space', 'Circle anything'], ['Ctrl + Shift + V', 'Talk to me'], ['Ctrl + Shift + T', 'Add a to-do'], ['Ctrl + Shift + D', 'Hide or show me']] },
      { id: 'done', anim: 'celebrate', final: true, title: `You are all set${who} :)`, body: 'Say "tour" any time to see this again. For smarter answers, add a free AI key in Settings (right-click my tray icon). I will be right here, at the edge of your screen.' },
    ];
  }
  /** What is new, shown once after an update. */
  function whatsNew(version, name, items) {
    return { title: `Tito ${version} is here${name ? ', ' + name : ''} :)`, body: 'Thank you for staying with me. Here is what is new:', list: items.map((t) => ['', t]) };
  }
  window.TitoTour = { steps, whatsNew };
})();

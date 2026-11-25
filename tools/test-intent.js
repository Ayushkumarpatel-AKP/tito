// node tools/test-intent.js : checks the voice command parser against example sentences (now = Wed 2026-11-25 10:00)
const { parse } = require('../src/intent');
const now = new Date(2026, 10, 25, 10, 0, 0);
const late = new Date(2026, 10, 25, 23, 28, 0);      // 11:28 pm, as in the bug report
const at = (r) => r.at ? new Date(r.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '';
const cases = [
  ['remind me to call mom at 5 pm', { type: 'reminder', text: 'call mom', at: '25/11/2026, 17:00' }],
  ['kal 5 baje maa ko call reminder', { type: 'reminder', at: '26/11/2026, 05:00' }],
  ['remind me in 10 minutes to drink water', { type: 'reminder', text: 'drink water', at: '25/11/2026, 10:10' }],
  ['tomorrow 9 am remind me to submit assignment', { type: 'reminder', text: 'submit assignment', at: '26/11/2026, 09:00' }],
  ['10 minute baad chai reminder', { type: 'reminder', at: '25/11/2026, 10:10' }],
  ['add todo buy milk', { type: 'todo', text: 'buy milk' }],
  ['todo mein doodh add karo', { type: 'todo', text: 'doodh' }],
  ['play lofi on youtube', { type: 'play', source: 'youtube', query: 'lofi' }],
  ['youtube par lofi chalao', { type: 'play', source: 'youtube', query: 'lofi' }],
  ['play arijit singh on spotify', { type: 'play', source: 'spotify', query: 'arijit singh' }],
  ['pause', { type: 'media', action: 'pause' }],
  ['agla gaana', { type: 'media', action: 'next' }],
  ['volume up', { type: 'media', action: 'volup' }],
  ['search black hole', { type: 'search', query: 'black hole' }],
  ['black hole ke baare mein batao', { type: 'search', query: 'black hole' }],
  ['maine lunch kha liya', { type: 'routine', name: 'Lunch' }],
  ['i drank water', { type: 'routine', name: 'Drink water' }],
  ['quiz me', { type: 'quiz' }],
  ['math exam deadline friday', { type: 'reminder', kind: 'deadline' }],
];
const lateCases = [
  ['reminder set kro 11.30 ka', { type: 'reminder', at: '25/11/2026, 23:30' }],
  ['mujhe 11.30 baje yaad dilana', { type: 'reminder', at: '25/11/2026, 23:30' }],
  ['11:30 pe alarm lagao', { type: 'reminder', at: '25/11/2026, 23:30' }],
  ['remind me at 11.30 to sleep', { type: 'reminder', text: 'sleep', at: '25/11/2026, 23:30' }],
  ['set a reminder for 7 am', { type: 'reminder', at: '26/11/2026, 07:00' }],
  ['reminder set karo', { type: 'reminder', whenGuessed: true }],
];
lateCases.push(
  ['open mr beast latest video at 12:04 am', { type: 'reminder', at: '26/11/2026, 00:04' }],
  ['open whatsapp at 7 am', { type: 'reminder', at: '26/11/2026, 07:00' }],
  ['open whatsapp', { type: 'open' }], ['open vs code', { type: 'open' }], ['settings', { type: 'settings' }], ['open settings', { type: 'settings' }],
  ['timer 10 minutes', { type: 'timer', ms: 600000 }], ['5 minute ka timer', { type: 'timer', ms: 300000 }], ['start focus mode', { type: 'focus' }],
  ['what is on my list', { type: 'list' }], ['what time is it', { type: 'time' }], ['dark theme', { type: 'theme', theme: 'midnight' }], ['cyber theme', { type: 'theme', theme: 'cyber' }],
);
const early = new Date(2026, 10, 26, 1, 3, 0);      // 1:03 am: the reported "open whatsapp at 1;05 am"
const earlyCases = ['open whatsapp at 1:05 am', 'open whatsapp at 1;05 am', 'open whatsapp at 1.05 am', 'open whatsapp at 1 05 am', 'open whatsapp at 105 am', 'open whatsapp at 1:05am', 'open whatsapp at 1,05 am', 'whatsapp kholna 1;05 baje', 'remind me at 1:05 am to sleep'];
let bad = 0;
const upkeep = [
  ['add flashcard photosynthesis = how plants make food', { type: 'card_add', front: 'photosynthesis', back: 'how plants make food' }],
  ['remember mitochondria is the powerhouse of the cell', { type: 'card_add', front: 'mitochondria' }],
  ['maths exam on 12 dec', { type: 'exam_add', name: 'maths', at: '12/12/2026, 09:00' }],
  ['show cards tab', { type: 'tab', tab: 'study' }], ['open chat', { type: 'tab', tab: 'chat' }], ['open daily', { type: 'tab', tab: 'daily' }],
  ['mark buy milk done', { type: 'todo_done', query: 'buy milk' }], ['buy milk done', { type: 'todo_done', query: 'buy milk' }], ['delete todo buy milk', { type: 'todo_delete', query: 'buy milk' }],
  ['remove buy milk from my list', { type: 'todo_delete', query: 'buy milk' }], ['clear done', { type: 'todos_clear_done' }],
  ['delete reminder call mom', { type: 'reminder_delete', query: 'call mom' }], ['clear all reminders', { type: 'reminder_delete', all: true }],
  ['change reminder call mom to 6 pm', { type: 'reminder_move', query: 'call mom', at: '25/11/2026, 18:00' }],
  ['add routine yoga at 6 am', { type: 'routine_add', name: 'Yoga' }], ['remove yoga routine', { type: 'routine_remove', name: 'yoga' }],
  ['turn off water routine', { type: 'routine_set', on: false }], ['turn on medicine', { type: 'routine_set', on: true }], ['set lunch time to 2 pm', { type: 'routine_set', name: 'lunch' }],
  ['medicine at 9 pm', { type: 'routine_set', name: 'medicine' }], ['water goal 10', { type: 'water_goal', n: 10 }],
  ['ringtone sparkle', { type: 'pref', key: 'ringtone', value: 'sparkle' }], ['sounds off', { type: 'pref', key: 'sounds', value: false }], ['voice off', { type: 'pref', key: 'voiceMode', value: 'off' }],
  ['remind me on friday at 5 pm to submit report', { type: 'reminder', at: '27/11/2026, 17:00' }], ['remind me on 12 dec at 9 am to pay fees', { type: 'reminder', at: '12/12/2026, 09:00' }],
  ['stop focus', { type: 'focus_stop' }],
];
for (const q of earlyCases) {
  const got = parse(q, early); const when = got.at ? new Date(got.at) : null;
  if (!when || when.getHours() !== 1 || when.getMinutes() !== 5 || when.getDate() !== 26) { bad++; console.log('FAIL', JSON.stringify(q), 'got', got.at ? at(got) : got.type); }
}
for (const [s, want] of upkeep) {
  const got = parse(s, now); const flat = { ...got, at: got.at ? at(got) : '' }; const ok = Object.entries(want).every(([k, v]) => flat[k] === v);
  if (!ok) { bad++; console.log('FAIL', JSON.stringify(s), '\n   want', JSON.stringify(want), '\n   got ', JSON.stringify(flat)); }
}
for (const [s, want] of lateCases) {
  const got = parse(s, late); const flat = { ...got, at: got.at ? at(got) : '' }; const ok = Object.entries(want).every(([k, v]) => flat[k] === v);
  if (!ok) { bad++; console.log('FAIL', JSON.stringify(s), '\n   want', JSON.stringify(want), '\n   got ', JSON.stringify(flat)); }
}
for (const [s, want] of cases) {
  const got = parse(s, now); const flat = { ...got, at: at(got) };
  const ok = Object.entries(want).every(([k, v]) => flat[k] === v);
  if (!ok) { bad++; console.log('FAIL', JSON.stringify(s), '\n   want', JSON.stringify(want), '\n   got ', JSON.stringify(flat)); }
}
console.log((cases.length + lateCases.length + upkeep.length + earlyCases.length - bad) + '/' + (cases.length + lateCases.length + upkeep.length + earlyCases.length) + ' ok'); process.exit(bad ? 1 : 0);

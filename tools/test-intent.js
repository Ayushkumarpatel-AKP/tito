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
  ['search black hole', { type: 'search', query: 'black hole' }],
  ['black hole ke baare mein batao', { type: 'ask', query: 'black hole' }],
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
upkeep.push(
  ['https://youtu.be/dQw4w9WgXcQ?si=abc', { type: 'open' }],
  ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', { type: 'open' }], ['https://unstop.com/hackathons', { type: 'open' }],
  ['open unstop', { type: 'open_site', name: 'unstop' }], ['open unstop website', { type: 'open_site', name: 'unstop' }], ['unstop kholo', { type: 'open_site', name: 'unstop' }],
  ['open unstop at 5 pm', { type: 'reminder', openName: 'unstop' }], ['open youtube', { type: 'open' }],
  ['teach tito photosynthesis', { type: 'teach', topic: 'photosynthesis' }], ['let me teach you newton laws', { type: 'teach', topic: 'newton laws' }], ['feynman mode', { type: 'teach', topic: '' }],
);
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

// office commands (meetings, Excel, PDF, notes, web notes, exam rescue); now = Wed 2026-11-25 10:00
const office = [
  ['kal 4 baje Rahul ke saath meeting google meet', { type: 'meeting', who: 'Rahul', provider: 'Google Meet', at: '26/11/2026, 16:00' }],
  ['schedule a zoom meeting with Priya Sharma tomorrow at 5pm', { type: 'meeting', who: 'Priya Sharma', provider: 'Zoom', at: '26/11/2026, 17:00' }],
  ['set meeting at 6 pm', { type: 'meeting', at: '25/11/2026, 18:00' }],
  ['meeting kal 9 am team standup', { type: 'meeting', at: '26/11/2026, 09:00' }],
  ['remind me about the meeting at 5 pm', { type: 'reminder' }],
  ['open google meet at 5pm', { type: 'reminder' }],
  ['nice to meet you', { type: 'unknown' }],
  ['make an expense sheet: date, item, amount, total', { type: 'excel', source: 'text' }],
  ['is mahine ka kharcha ka sheet banao: date, item, amount, total', { type: 'excel', source: 'text' }],
  ['excel from clipboard', { type: 'excel', source: 'clipboard' }],
  ['clipboard ko excel mein convert karo', { type: 'excel', source: 'clipboard' }],
  ['export this table to excel', { type: 'excel', source: 'chat' }],
  ['open excel', { type: 'open' }],
  ['chapters batao pdf', { type: 'pdf', op: 'chapters' }],
  ['extract important definitions from the pdf', { type: 'pdf', op: 'defs' }],
  ['summary of page 12', { type: 'pdf', op: 'summary', pages: '12' }],
  ['summarize chapter 3 of the pdf', { type: 'pdf', op: 'summary', chapter: 3 }],
  ['merge pdfs', { type: 'pdf', op: 'merge' }],
  ['pages 5 se 9 alag karo', { type: 'pdf', op: 'split', pages: '5 se 9' }],
  ['split pdf pages 5-9', { type: 'pdf', op: 'split', pages: '5-9' }],
  ['find osmosis in pdf', { type: 'pdf', op: 'find', query: 'osmosis' }],
  ['save pdf definitions as flashcards', { type: 'pdf', op: 'cards' }],
  ['write a note on photosynthesis from the internet', { type: 'write', topic: 'photosynthesis' }],
  ['Photosynthesis par ek page ka note banao internet se', { type: 'write', topic: 'photosynthesis' }],
  ['note on cells: cells are the unit of life', { type: 'note', op: 'add', topic: 'cells', from: 'text' }],
  ['add clipboard to notes under biology', { type: 'note', op: 'add', from: 'clipboard', topic: 'biology' }],
  ['snap screen to notes', { type: 'note', op: 'add', from: 'screen' }],
  ['show notes on cells', { type: 'note', op: 'show', topic: 'cells' }],
  ['notes', { type: 'note', op: 'list' }],
  ['export notes on cells as pdf', { type: 'note', op: 'export', topic: 'cells' }],
  ['exam rescue chemistry on 20 dec', { type: 'rescue', op: 'create', name: 'Chemistry', at: '20/12/2026, 09:00' }],
  ['chemistry exam 20 dec ke liye study plan banao', { type: 'rescue', op: 'create', name: 'Chemistry' }],
  ['how ready am i', { type: 'rescue', op: 'status' }],
  ['chapter 3 done', { type: 'rescue', op: 'done', n: 3 }],
  ['replan my exam plan', { type: 'rescue', op: 'replan' }],
  ['exam physics on 20 dec', { type: 'exam_add' }],
  ['tour', { type: 'tour' }], ['show tour', { type: 'tour' }], ['how to use tito', { type: 'tour' }],
  ['add todo buy milk', { type: 'todo' }],
];
for (const [s, want] of office) {
  const got = parse(s, now); const flat = { ...got, at: at(got) };
  if (!Object.entries(want).every(([k, v]) => flat[k] === v)) { bad++; console.log('FAIL', JSON.stringify(s), '\n   want', JSON.stringify(want), '\n   got ', JSON.stringify(flat)); }
}
const total = cases.length + lateCases.length + upkeep.length + earlyCases.length + office.length; console.log((total - bad) + '/' + total + ' ok'); process.exit(bad ? 1 : 0);

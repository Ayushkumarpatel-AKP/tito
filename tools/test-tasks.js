// node tools/test-tasks.js : todos, reminders, routines and the scheduler against a temp folder
const os = require('os'), fs = require('fs'), path = require('path'); const tasks = require('../src/tasks');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tito-tasks-')); const events = []; let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
tasks.init(dir, (e) => events.push(e));
const t = tasks.addTodo('buy milk'); ok(t && tasks.snapshot().todos.length === 1, 'add todo');
tasks.toggleTodo(t.id); ok(events.some((e) => e.type === 'todo-done'), 'todo-done event');
const r = tasks.addReminder('call mom', Date.now() - 1000); tasks.tick(); ok(events.some((e) => e.type === 'reminder' && e.reminder.id === r.id), 'reminder fires');
const rep = tasks.addReminder('daily', Date.now() - 1000, { repeat: 'daily' }); tasks.tick(); ok(tasks.snapshot().reminders.some((x) => x.id === rep.id && x.at > Date.now()), 'repeat moves forward');
const lunch = tasks.findRoutine('Lunch'); ok(lunch, 'default routine'); tasks.markRoutine(lunch.id); ok(tasks.snapshot().today[lunch.id] === 1, 'mark routine');
const water = tasks.findRoutine('water'); tasks.markRoutine(water.id); tasks.markRoutine(water.id); ok(tasks.routineStats().water[water.id] === 2, 'water count');
ok(tasks.addExam('Maths', '2027-03-01') && /Maths/.test(tasks.brief()), 'exam in brief');
const ics = ['BEGIN:VCALENDAR','BEGIN:VEVENT','SUMMARY:Maths exam\\, paper 1','DTSTART:20991201T090000Z','END:VEVENT','BEGIN:VEVENT','SUMMARY:Old event','DTSTART:20200101T090000Z','END:VEVENT','BEGIN:VTODO','SUMMARY:Submit report','DUE;VALUE=DATE:20991202','END:VTODO','END:VCALENDAR'].join('\r\n');
ok(tasks.importIcs(ics) === 2, 'ics: imports future events only'); ok(tasks.importIcs(ics) === 0, 'ics: importing twice adds nothing');
const again = require('../src/tasks'); ok(JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8')).todos.length === 1, 'saved to disk');
console.log(bad ? bad + ' failed' : 'tasks ok'); process.exit(bad ? 1 : 0);

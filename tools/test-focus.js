// node tools/test-focus.js : Focus Guard decisions, nudges and the report (no window is ever read here)
const g = require('../src/focusguard'); let bad = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };
const k = (t, p, extra) => g.classify(t, p, extra).kind;
ok(k('(3) Instagram - Google Chrome', 'chrome') === 'distract', 'Instagram in the browser is a distraction');
ok(k('Stranger Things - Netflix', 'chrome') === 'distract', 'Netflix is a distraction');
ok(k('MrBeast - $250,000 Hunger Games - YouTube', 'chrome') === 'distract', 'a random YouTube video is a distraction');
ok(k('Organic Chemistry Lecture 4 - YouTube', 'chrome') === 'task', 'a YouTube lecture is NOT a distraction');
ok(k('Valorant', 'VALORANT-Win64-Shipping') === 'distract', 'a game is a distraction');
ok(k('main.js - tito - Visual Studio Code', 'Code') === 'task', 'the code editor is on task');
ok(k('Tito', 'Tito') === 'task', 'Tito itself is on task');
ok(k('Cricket scores - Chrome', 'chrome', ['cricket']) === 'distract', 'your own extra words count');
const nudges = [], lives = []; let t = 0;
const s = g.createSession({ onNudge: (n) => nudges.push(n), onLive: (l) => lives.push(l) });
for (let i = 0; i < 10; i++) s.feed('main.js - VS Code', 'Code', 3);                      // 30 s on task
ok(nudges.length === 0, 'no nudge while studying');
for (let i = 0; i < 7; i++) s.feed('Instagram - Chrome', 'chrome', 3);                    // 21 s wandering
ok(nudges.length === 0, 'no nudge for a short wander (21 s)');
s.feed('Instagram - Chrome', 'chrome', 3); s.feed('Instagram - Chrome', 'chrome', 3);
ok(nudges.length === 1 && nudges[0].label === 'Instagram', 'a nudge after 25 s of Instagram: ' + JSON.stringify(nudges[0]));
for (let i = 0; i < 20; i++) s.feed('Instagram - Chrome', 'chrome', 3);
ok(nudges.length === 1, 'no second nudge after only 60 s more (the gap is 90 s), not one every 3 s: ' + nudges.length);
for (let i = 0; i < 12; i++) s.feed('Instagram - Chrome', 'chrome', 3);
ok(nudges.length === 2, 'the second nudge comes once the gap has passed: ' + nudges.length);
s.pause(300); const before = s.report(); for (let i = 0; i < 20; i++) s.feed('Instagram - Chrome', 'chrome', 3); const after = s.report();
ok(after.badSec === before.badSec && nudges.length === 2, 'a 5 minute break counts and nudges nothing');
const r = s.report(); ok(r.score > 0 && r.score < 100 && r.top[0].label === 'Instagram' && r.nudges === 2, 'the report names the top distraction: ' + JSON.stringify(r));
const clean = g.createSession(); for (let i = 0; i < 20; i++) clean.feed('Notes - OneNote', 'onenote', 3); ok(clean.report().score === 100, 'a clean session scores 100');
console.log(bad ? bad + ' FAILED' : 'focus ok'); process.exit(bad ? 1 : 0);

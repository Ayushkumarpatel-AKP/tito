/**
 * The demo video, drawn by code. seek(t) sets every element from the time t alone, so any frame can be rendered
 * on demand (tools/render-video.js captures 30 frames a second and muxes them with the narration).
 */
import '../styles/legacy/site.css';
import './video.css';
import { gsap } from 'gsap';
import { def, frameAt, ready, type StateName } from '../lib/sprite';
import timingRaw from '../../video-src/audio/timing.json';

interface Line { key: string; text: string; dur: number }
declare global {
  interface Window { seek: (t: number) => void; __duration: number; __starts: number[]; __ready: Promise<void> }
}

const lines = timingRaw as Line[];
const GAP = 0.55;
const LEAD = 0.35;
const starts: number[] = [];
let acc = LEAD;
for (const l of lines) { starts.push(acc); acc += l.dur + GAP; }
const total = acc + 0.6;

const E = {
  out: gsap.parseEase('power3.out'),
  back: gsap.parseEase('back.out(1.8)'),
  inout: gsap.parseEase('power2.inOut'),
  elastic: gsap.parseEase('elastic.out(1, 0.55)'),
};
const c01 = (x: number): number => Math.min(1, Math.max(0, x));
const prog = (t: number, a: number, b: number): number => c01((t - a) / (b - a));
const q = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel) as T;
const qa = <T extends HTMLElement>(sel: string): T[] => Array.from(document.querySelectorAll<T>(sel));
const typed = (s: string, p: number): string => s.slice(0, Math.round(s.length * c01(p)));

const op = (el: Element, o: number): void => { (el as HTMLElement).style.opacity = String(c01(o)); };
const tf = (el: Element, x = 0, y = 0, s = 1, r = 0): void => { (el as HTMLElement).style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`; };
/** a thing that pops in (scale and fade) at time a */
const pop = (el: Element, t: number, a: number, dur = 0.6): void => { const p = prog(t, a, a + dur); op(el, p * 3); tf(el, 0, (1 - E.out(p)) * 24, 0.6 + 0.4 * E.back(p)); };
/** a thing that rises into place at time a */
const rise = (el: Element, t: number, a: number, dur = 0.7, dist = 60): void => { const p = prog(t, a, a + dur); op(el, p * 2.5); tf(el, 0, (1 - E.out(p)) * dist); };
const floatIn = (el: Element, t: number, a: number, i: number): void => {
  const p = prog(t, a, a + 0.9); const y = Math.sin(t * 2 + i * 1.7) * 10;
  op(el, p * 3); tf(el, 0, y, E.elastic(p), Math.sin(t * 1.3 + i) * 6);
};

const scenes = qa<HTMLElement>('.sc');
const captions = q('#vCap');
const tito = q('#vTito');
const sprEl = document.createElement('div');
sprEl.className = 'spr';
tito.appendChild(sprEl);

// ---------------------------------------------------------------- Tito: where he stands and what he does in each scene
interface Place { x: number; y: number; s: number }
const PLACE: Place[] = [
  { x: 1000, y: 700, s: 1.55 }, { x: 1040, y: 700, s: 1.3 }, { x: 1040, y: 700, s: 1.3 }, { x: 1040, y: 700, s: 1.3 },
  { x: 1040, y: 700, s: 1.3 }, { x: 1110, y: 708, s: 1.1 }, { x: 1130, y: 705, s: 0.95 }, { x: 1020, y: 700, s: 1.45 },
];
const POSES: Array<Array<[number, StateName]>> = [
  [[0, 'idle'], [0.1, 'greeting'], [2.6, 'idle']],
  [[0, 'listening']],
  [[0, 'listening'], [1.0, 'searching']],
  [[0, 'idle'], [0.8, 'success'], [2.7, 'talking']],
  [[0, 'idle'], [1.3, 'success_alt'], [3.4, 'idle']],
  [[0, 'typing']],
  [[0, 'talking']],
  [[0, 'greeting'], [2.8, 'success_alt'], [5.0, 'idle']],
];
let lastKey = '';
let lastStart = 0;
function renderTito(t: number): void {
  let i = 0;
  for (let k = 0; k < starts.length; k++) if (t >= starts[k] - 0.3) i = k;
  const prev = PLACE[Math.max(0, i - 1)], cur = PLACE[i];
  const m = E.out(prog(t, starts[i] - 0.3, starts[i] + 0.55));
  const x = prev.x + (cur.x - prev.x) * m, y = prev.y + (cur.y - prev.y) * m, s = prev.s + (cur.s - prev.s) * m;
  const local = t - starts[i];
  const segs = POSES[i];
  let seg = segs[0];
  for (const sg of segs) if (local >= sg[0]) seg = sg;
  const state = seg[1];
  const key = `${i}:${state}`;
  if (key !== lastKey) { lastKey = key; lastStart = Math.max(t, starts[i] + seg[0]); }
  const dt = Math.max(0, t - (starts[i] + seg[0]));
  const d = def(state);
  const f = frameAt(state, dt);
  sprEl.style.width = `${d.w}px`;
  sprEl.style.height = `${d.h}px`;
  sprEl.style.backgroundImage = `url(/tito/${d.file})`;
  sprEl.style.backgroundSize = `${d.w * d.count}px ${d.h}px`;
  sprEl.style.backgroundPosition = `-${f * d.w}px 0`;
  const k = Math.exp(-dt * 7) * Math.sin(dt * 18);
  const sx = 1 + (dt < 0.6 ? 0.12 * k : 0), sy = 1 - (dt < 0.6 ? 0.14 * k : 0);
  const fadeIn = prog(t, 0, 0.5);
  tito.style.opacity = String(fadeIn);
  tito.style.transform = `translate(${x - 130}px, ${y - 290}px) scale(${s * sx}, ${s * sy})`;
  void lastStart;
}

// ---------------------------------------------------------------- scenes
const S4_TEXT = 'It means “Where is the library, please?” A polite way to ask for directions.';
const HI_TEXT = 'पुस्तकालय कहाँ है, कृपया?';

function renderScenes(t: number): void {
  scenes.forEach((sc, i) => {
    const l = t - starts[i];
    op(sc, prog(t, starts[i] - 0.35, starts[i] + 0.05));
    sc.style.zIndex = String(i + 1);
    if (l < -0.4 || (i < scenes.length - 1 && t > starts[i + 1] + 0.1)) { sc.style.visibility = 'hidden'; return; }
    sc.style.visibility = 'visible';
    switch (i) {
      case 0: {
        rise(q('.s1__h'), l, 0.15, 0.9, 90); rise(q('.s1__p'), l, 1.1, 0.7, 30);
        floatIn(q('.s1__a'), l, 0.5, 0); floatIn(q('.s1__b'), l, 0.8, 1); floatIn(q('.s1__c'), l, 1.1, 2);
        break;
      }
      case 1: {
        rise(q('.s2__p'), l, 0.2, 0.8, 50);
        qa('.s2__keys .keycap').forEach((k, n) => {
          const p = prog(l, 0.5 + n * 0.12, 1.1 + n * 0.12);
          op(k, p * 3); k.style.transform = `translateY(${(1 - E.back(p)) * -70}px)`;
          k.classList.toggle('is-down', l > 3.1 + n * 0.62 && l < 5.6);
        });
        floatIn(q('.s2__a'), l, 1.3, 3);
        break;
      }
      case 2: {
        pop(q('.s3__paper'), l, 0.1);
        const loop = q<HTMLElement>('.s3__loop path'); loop.style.strokeDashoffset = String(1 - E.inout(prog(l, 1.0, 2.7)));
        op(q('.s3__loop'), 1 - prog(l, 3.0, 3.4));
        const box = q('.s3__box'); const bp = prog(l, 3.1, 3.8); op(box, bp * 2); tf(box, 0, 0, 0.92 + 0.08 * E.back(bp));
        floatIn(q('.s3__a'), l, 3.3, 1);
        break;
      }
      case 3: {
        pop(q('.s4__card'), l, 0.3);
        q('#s4Typed').textContent = typed(S4_TEXT, prog(l, 1.0, 4.0));
        floatIn(q('.s4__a'), l, 0.9, 4);
        break;
      }
      case 4: {
        pop(q('.s5__card'), l, 0.1);
        const tr = l > 1.2;
        qa('.s5__card .chip').forEach((c) => c.classList.remove('is-on'));
        q(tr ? '.c2' : '.c1').classList.add('is-on');
        q('#s5Title').textContent = tr ? 'Hindi translation' : 'A French question';
        q('#s5Text').textContent = tr ? typed(HI_TEXT, prog(l, 1.5, 2.9)) : S4_TEXT;
        qa('.s5__langs .chip').forEach((c, n) => pop(c, l, 2.6 + n * 0.35, 0.5));
        floatIn(q('.s5__a'), l, 0.7, 2);
        break;
      }
      case 5: {
        rise(q('.s6__h'), l, 0.1, 0.8, 60);
        const w = q('.s6__wifi'); pop(w, l, 0.5, 0.7);
        q<HTMLElement>('.s6__wifi path').style.strokeDashoffset = String(1 - E.inout(prog(l, 1.3, 1.9)));
        qa('.s6__packs li').forEach((li, n) => {
          const p = prog(l, 3.0 + n * 0.4, 3.8 + n * 0.4); op(li, p * 3); (li as HTMLElement).style.transform = `translateX(${(1 - E.out(p)) * 80}px)`;
          const bar = li.querySelector<HTMLElement>('.bar i'); if (bar) bar.style.transform = `scaleX(${E.out(prog(l, 3.5 + n * 0.4, 5.2 + n * 0.4))})`;
          const num = li.querySelector<HTMLElement>('.n'); const goal = [397, 222, 0][n];
          if (num) num.textContent = String(Math.round(goal * E.out(prog(l, 3.5 + n * 0.4, 5.0 + n * 0.4))));
        });
        break;
      }
      case 6: {
        qa('.s7__it').forEach((it, n) => pop(it, l, [0.3, 1.9, 3.3][n], 0.7));
        qa('.s7__chips .chip').forEach((c, n) => pop(c, l, 6.3 + n * 0.45, 0.5));
        break;
      }
      default: {
        rise(q('.s8__h'), l, 0.2, 0.9, 80);
        floatIn(q('.s8__a'), l, 0.6, 0); floatIn(q('.s8__b'), l, 0.9, 1);
        pop(q('.s8__url'), l, 2.2, 0.7); pop(q('.s8__btns'), l, 3.4, 0.7);
      }
    }
  });
}

function renderCaption(t: number): void {
  let text = ''; let o = 0;
  lines.forEach((ln, i) => {
    const a = starts[i], b = starts[i] + ln.dur + 0.15;
    if (t >= a - 0.1 && t <= b + 0.2) { text = ln.text; o = Math.min(prog(t, a - 0.1, a + 0.15), 1 - prog(t, b, b + 0.2)); }
  });
  if (text && captions.textContent !== text) captions.textContent = text;
  op(captions, o);
}

window.seek = (t: number): void => { renderScenes(t); renderTito(t); renderCaption(t); };
window.__duration = total;
window.__starts = starts;
window.__ready = (async () => {
  await ready;
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((im) => (im.complete ? Promise.resolve() : new Promise<void>((r) => { im.onload = im.onerror = () => r(); }))));
  window.seek(0);
})();

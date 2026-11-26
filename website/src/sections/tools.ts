import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { qsa, reduced } from '../lib/dom';

/**
 * The tools grid. A light follows the pointer over each tile. When a tile reaches the screen its command is typed once and its picture builds
 * up (the exam ring fills, the sheet's rows slide in, the pages fan out). At rest every tile is already complete.
 */
export function initTools(): void {
  const tiles = qsa('.bt');
  if (!tiles.length) return;

  tiles.forEach((t) => {
    const line = t.querySelector<HTMLElement>('.typed');
    if (line) line.textContent = t.dataset.cmd ?? '';                 // at rest the command is already written
    t.addEventListener('pointermove', (e: PointerEvent) => {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${e.clientX - r.left}px`);
      t.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
  if (reduced()) return;

  tiles.forEach((tile) => {
    if (tile.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    const typed = tile.querySelector<HTMLElement>('.typed');
    const res = tile.querySelector<HTMLElement>('.res');
    if (!typed || !res) return;
    const cmd = tile.dataset.cmd ?? '';
    const part = (sel: string): HTMLElement[] => qsa(sel, res);
    typed.textContent = '';
    gsap.set(res, { autoAlpha: 0, y: 14 });
    ScrollTrigger.create({
      trigger: tile,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        const o = { n: 0 };
        const dur = Math.max(0.7, cmd.length * 0.03);
        const tl = gsap.timeline({ delay: 0.15 });
        tl.to(o, { n: cmd.length, duration: dur, ease: 'none', onUpdate: () => { typed.textContent = cmd.slice(0, Math.round(o.n)); } })
          .to(res, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, '>0.1');
        const at = '>-0.2';
        const arc = part('.ring__arc');
        if (arc.length) tl.fromTo(arc, { strokeDashoffset: 1 }, { strokeDashoffset: 0.38, duration: 1.3, ease: 'power3.out' }, at);
        const bars = part('.bars b');
        if (bars.length) tl.fromTo(bars, { scaleX: 0 }, { scaleX: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out' }, '<0.1');
        const days = part('.days li');
        if (days.length) tl.fromTo(days, { autoAlpha: 0, x: 14 }, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.14 }, '<0.2');
        const rows = part('tr');
        if (rows.length) tl.fromTo(rows, { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.12 }, at);
        const pages = part('.pages span');
        if (pages.length) tl.fromTo(pages, { autoAlpha: 0, y: -30, scale: 0.7 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(1.8)' }, at);
        const lines = part('.res--note > i');
        if (lines.length) tl.fromTo(lines, { scaleX: 0, transformOrigin: 'left' }, { scaleX: 1, duration: 0.5, stagger: 0.12, ease: 'power2.out' }, at);
        const files = part('.fl');
        if (files.length) tl.fromTo(files, { autoAlpha: 0, y: -26 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.14, ease: 'back.out(1.6)' }, at);
        const rowsF = part('.res--focus li');
        if (rowsF.length) tl.fromTo(rowsF, { autoAlpha: 0, x: 12 }, { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.18 }, at);
        const bubbles = part('.b');
        if (bubbles.length) tl.fromTo(bubbles, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.3 }, at);
        part('[data-count]').forEach((c) => {
          const n = { v: 0 };
          tl.to(n, { v: Number(c.dataset.count), duration: 1.2, ease: 'power2.out', onUpdate: () => { c.textContent = String(Math.round(n.v)); } }, at);
        });
      },
    });
  });
}

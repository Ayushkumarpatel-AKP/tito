import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Pets } from '../lib/pets';
import { qs, qsa, reduced } from '../lib/dom';
import { SAMPLES, type SampleId, type Action } from '../data/samples';
import { addSelection, resetSelection, showSelected, type SelParts } from '../lib/select';

/** "Try it right here": pick something, draw around it, Tito answers. The answers are real Tito output, shown as samples. */
export function initDemo(pets: Pets): void {
  const text = qs('#tryText');
  const parts: SelParts = { win: qs('#tryScreen'), target: text, sel: qs('#trySel'), cursor: qs('#tryCursor') };
  const card = qs('#tryCard');
  const title = qs('#tryTitle');
  const answer = qs('#tryAnswer');
  const acts = qs('#tryActs');
  const draw = qs<HTMLButtonElement>('#drawBtn');
  const tabs = qsa<HTMLButtonElement>('.try__tabs .chip');
  const motion = !reduced();

  let cur: SampleId = 'fr';
  let busy = false;
  let typing: gsap.core.Tween | null = null;
  const pet = pets.try;

  const typeInto = (str: string, done?: () => void): void => {
    typing?.kill();
    if (!motion) {
      answer.textContent = str;
      done?.();
      return;
    }
    const o = { n: 0 };
    typing = gsap.to(o, {
      n: str.length,
      duration: Math.max(0.5, str.length * 0.022),
      ease: 'none',
      onUpdate: () => { answer.textContent = str.slice(0, Math.round(o.n)); },
      onComplete: done,
    });
  };

  const show = (kind: Action): void => {
    const s = SAMPLES[cur][kind];
    title.textContent = s.title;
    qsa<HTMLButtonElement>('.chip', acts).forEach((b) => b.classList.toggle('is-on', b.dataset.act === kind));
    if (motion) gsap.fromTo(card, { scale: 0.95 }, { scale: 1, duration: 0.6, ease: 'back.out(2)' });
    pet?.play(kind === 'translate' ? 'success_alt' : 'success', { onEnd: () => pet.play('idle', { boing: false }) });
    typeInto(s.answer, () => pet?.play('idle', { boing: false }));
  };

  const reset = (): void => {
    typing?.kill();
    busy = false;
    resetSelection(parts);
    (acts as HTMLElement).hidden = true;
    title.textContent = 'Tito is waiting';
    answer.textContent = 'Press the button and watch him work.';
    pet?.play('idle', { boing: false });
  };

  const pick = (id: SampleId): void => {
    cur = id;
    const s = SAMPLES[id];
    text.textContent = s.text;
    text.setAttribute('lang', s.lang);
    tabs.forEach((b) => {
      const on = b.dataset.sample === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
    });
    reset();
  };

  const run = (): void => {
    if (busy) return;
    busy = true;
    (acts as HTMLElement).hidden = true;
    title.textContent = 'Looking closely...';
    answer.textContent = '';
    pet?.play('searching');
    resetSelection(parts);
    const tl = gsap.timeline();
    const { end } = addSelection(tl, parts, 0, motion ? 1.1 : 0.01);
    tl.call(() => {
      (acts as HTMLElement).hidden = false;
      busy = false;
      show('explain');
    }, [], end + (motion ? 0.45 : 0));
  };

  resetSelection(parts);
  tabs.forEach((b) => b.addEventListener('click', () => pick(b.dataset.sample as SampleId)));
  qsa<HTMLButtonElement>('.chip', acts).forEach((b) => b.addEventListener('click', () => { if (!busy) show(b.dataset.act as Action); }));
  draw.addEventListener('click', run);

  // play it once on its own the first time it scrolls into view
  ScrollTrigger.create({ trigger: '#tryScreen', start: 'top 60%', once: true, onEnter: () => gsap.delayedCall(0.5, run) });
  window.addEventListener('resize', () => { if (!busy && !(acts as HTMLElement).hidden) showSelected(parts); });
}

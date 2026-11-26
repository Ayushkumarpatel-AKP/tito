import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Pets } from '../lib/pets';
import { qs, qsa, reduced } from '../lib/dom';
import type { StateName } from '../lib/sprite';
import { addSelection, resetSelection, showSelected, type SelParts } from '../lib/select';

/**
 * "Get answers in just 3 steps": a loop that shows exactly what the app does. Press the shortcut, the screen dims, the pointer drags a dashed
 * box around the text, Tito reads it, and a small answer card appears. The three step cards light up in time with it.
 */
export function initHow(pets: Pets): void {
  const parts: SelParts = { win: qs('#sceneWin'), target: qs('#sceneText'), sel: qs('#sceneSel'), cursor: qs('#sceneCursor') };
  const reading = qs('#sceneReading');
  const answer = qs('#sceneAnswer');
  const arrow = qsa<SVGPathElement>('.scene__arrow path');
  const keys = qsa('.how__keys .kbd');
  const steps = qsa('.how__step');
  const TITO: StateName[] = ['listening', 'searching', 'success'];
  let current = -1;

  const setStep = (i: number): void => {
    if (i === current) return;
    current = i;
    steps.forEach((s, n) => s.classList.toggle('is-on', n === i));
    pets.how?.play(TITO[i], { then: i === 2 ? 'idle' : undefined });
  };
  const finalFrame = (): void => {
    showSelected(parts);
    gsap.set(answer, { autoAlpha: 1, x: 0, scale: 1 });
    gsap.set(arrow, { strokeDashoffset: 0, autoAlpha: 1 });
    gsap.set(reading, { autoAlpha: 0 });
    gsap.set(keys, { y: 0 });
  };

  if (reduced()) {
    steps.forEach((s) => s.classList.add('is-on'));
    pets.how?.play('success', { then: 'idle' });
    finalFrame();
    return;
  }

  const build = (): gsap.core.Timeline => {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.call(() => {
      current = -1;
      setStep(0);
    }, [], 0)
      .set(answer, { autoAlpha: 0, x: 40, scale: 0.92 }, 0)
      .set(arrow, { strokeDashoffset: 1, autoAlpha: 1 }, 0)
      .set(reading, { autoAlpha: 0 }, 0)
      .set(keys, { y: 0 }, 0);
    // 1. the three keys go down one after another and come back up together
    keys.forEach((k, i) => tl.to(k, { y: 4, duration: 0.14, ease: 'power1.in' }, 0.5 + i * 0.28));
    tl.to(keys, { y: 0, duration: 0.2, ease: 'back.out(3)' }, 1.7);
    // 2. the screen dims and the pointer draws the box
    tl.call(() => setStep(1), [], 1.9);
    const { end, box } = addSelection(tl, parts, 2.0, 1.3);
    // 3. Tito reads it, then the answer comes in
    tl.set(reading, { x: box.x, y: box.y + box.h + 10 }, end)
      .to(reading, { autoAlpha: 1, y: box.y + box.h + 14, duration: 0.3 }, end + 0.1)
      .to(reading, { autoAlpha: 0, duration: 0.25 }, end + 1.3)
      .to(arrow, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut', stagger: 0.25 }, end + 1.25)
      .call(() => setStep(2), [], end + 1.45)
      .to(answer, { autoAlpha: 1, x: 0, scale: 1, duration: 0.65, ease: 'back.out(1.5)' }, end + 1.45)
      .from('#sceneAnswer > *', { y: 10, autoAlpha: 0, duration: 0.35, stagger: 0.12 }, end + 1.6);
    // 4. hold, then let go of everything so the loop can start again
    tl.to({}, { duration: 3.4 })
      .to([answer, arrow], { autoAlpha: 0, duration: 0.4 })
      .call(() => resetSelection(parts), []);
    return tl;
  };

  let tl: gsap.core.Timeline | null = null;
  let wait: gsap.core.Tween | null = null;
  let on = false;
  const cycle = (): void => {
    if (!on) return;
    tl?.kill();
    resetSelection(parts);
    tl = build();
    tl.eventCallback('onComplete', () => { wait = gsap.delayedCall(0.5, cycle); });
  };

  // before it is on screen the scene already shows its finished picture
  const settle = (): void => { if (!on) { current = -1; steps.forEach((s) => s.classList.remove('is-on')); setStep(2); finalFrame(); } };
  settle();
  window.addEventListener('resize', () => { if (!on) finalFrame(); });
  ScrollTrigger.create({
    trigger: '#scene',
    start: 'top 78%',
    end: 'bottom 12%',
    onToggle: (self) => {
      on = self.isActive;
      if (on) cycle();
      else { tl?.kill(); wait?.kill(); settle(); }
    },
  });
}

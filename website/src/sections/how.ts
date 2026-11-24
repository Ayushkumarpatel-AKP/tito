import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Pets } from '../lib/pets';
import { qs, qsa } from '../lib/dom';
import type { StateName } from '../lib/sprite';

/** "Press, draw, understand": the scene is pinned and scrubbed by scroll, so scrolling literally runs the product. */
export function initHow(pets: Pets): void {
  const pin = qs('.how__pin');
  const keys = qsa('.how__keys .keycap');
  const loop = qs<SVGPathElement>('.how__loop path');
  const paper = qs('.how__paper');
  const answer = qs('.how__answer');
  const steps = qsa('.how__step');
  const mm = gsap.matchMedia();

  const TITO: StateName[] = ['listening', 'searching', 'success'];
  let current = -1;
  const setStep = (i: number): void => {
    if (i === current) return;
    current = i;
    steps.forEach((s, n) => s.classList.toggle('is-on', n === i));
    pets.how?.play(TITO[i], { then: i === 2 ? 'idle' : undefined });
  };

  mm.add('(min-width: 61rem) and (prefers-reduced-motion: no-preference)', () => {
    gsap.set(loop, { strokeDashoffset: 1 });
    gsap.set(answer, { autoAlpha: 0, scale: 0.8, y: 18 });
    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    tl.to(keys, { y: 6, duration: 0.5, stagger: 0.35 }, 0.1)
      .to(paper, { scale: 1.03, duration: 0.6, ease: 'power2.inOut' }, 1.4)
      .to(loop, { strokeDashoffset: 0, duration: 1.8 }, 2.2)
      .to(answer, { autoAlpha: 1, scale: 1, y: 0, duration: 0.8, ease: 'back.out(1.6)' }, 4.3)
      .to({}, { duration: 0.7 });

    ScrollTrigger.create({
      trigger: pin,
      start: 'top top',
      end: '+=220%',
      pin: true,
      scrub: 0.7,
      animation: tl,
      anticipatePin: 1,
      onUpdate: (self) => {
        const p = self.progress;
        keys.forEach((k, i) => k.classList.toggle('is-down', p > 0.03 + i * 0.065 && p < 0.34));
        setStep(p < 0.3 ? 0 : p < 0.78 ? 1 : 2);
      },
    });
    setStep(0);
    return () => {
      keys.forEach((k) => k.classList.remove('is-down'));
    };
  });

  // small screens and reduced motion: show the finished scene, no pin
  mm.add('(max-width: 60rem), (prefers-reduced-motion: reduce)', () => {
    gsap.set(loop, { strokeDashoffset: 0 });
    gsap.set(answer, { autoAlpha: 1, scale: 1, y: 0 });
    steps.forEach((s) => s.classList.add('is-on'));
    pets.how?.play('success', { then: 'idle' });
  });
}

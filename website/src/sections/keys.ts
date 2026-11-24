import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { qsa, reduced } from '../lib/dom';

/** The "paste a key" explainer: provider chips pop in, then the four steps light up one after another while on screen. */
export function initKeys(): void {
  const chips = qsa('.providers .chip');
  const steps = qsa('#probe li');
  const motion = !reduced();

  if (!motion) {
    gsap.set(chips, { autoAlpha: 1 });
    steps.forEach((s) => s.classList.add('is-active'));
    return;
  }

  ScrollTrigger.create({
    trigger: '.providers',
    start: 'top 88%',
    once: true,
    onEnter: () => gsap.fromTo(chips, { y: 24, autoAlpha: 0, scale: 0.9 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.6, stagger: 0.08, ease: 'back.out(1.8)' }),
  });

  const tl = gsap.timeline({ paused: true, repeat: -1 });
  steps.forEach((_s, i) => {
    tl.call(() => steps.forEach((x, n) => x.classList.toggle('is-active', n === i)), [], i * 1.5);
  });
  tl.to({}, { duration: 1.5 }, steps.length * 1.5 - 0.001);
  ScrollTrigger.create({ trigger: '#probe', start: 'top 85%', end: 'bottom 10%', onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });

  gsap.to('.probe__key', { y: -12, rotation: -6, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

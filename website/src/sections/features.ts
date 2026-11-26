import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { qsa, reduced } from '../lib/dom';

/**
 * The everyday tiles rise in as you reach them and tilt toward the pointer.
 */
export function initFeatures(): void {
  const cards = qsa('.tile');
  if (reduced()) return;

  const below = cards.filter((c) => c.getBoundingClientRect().top > window.innerHeight * 0.95);
  gsap.set(below, { y: 60, autoAlpha: 0, scale: 0.94 });
  ScrollTrigger.batch(below, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { y: 0, autoAlpha: 1, scale: 1, duration: 0.85, stagger: 0.1, ease: 'back.out(1.4)' }),
  });

  if (window.matchMedia('(hover: hover)').matches) {
    cards.forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3' });
      gsap.set(card, { transformPerspective: 900 });
      card.addEventListener('pointermove', (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 8);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }
}

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Pets } from '../lib/pets';
import { qsa, reduced } from '../lib/dom';

/** Pack sizes: the bars fill and the numbers count up once, the 3D Wi-Fi bobs, Tito types. */
export function initOffline(pets: Pets): void {
  const bars = qsa('.bar i');
  const counters = qsa('.packs [data-count]');
  const packs = qsa('.pack');
  const motion = !reduced();

  if (!motion) {
    gsap.set([...bars], { scaleX: 1 });
    gsap.set(packs, { autoAlpha: 1 });
    pets.off?.play('idle', { boing: false });
    return;
  }
  pets.off?.play('typing');
  gsap.set(bars, { scaleX: 0, transformOrigin: 'left center' });

  ScrollTrigger.create({
    trigger: '.packs',
    start: 'top 80%',
    once: true,
    onEnter: () => {
      gsap.fromTo(packs, { x: 60, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.8, stagger: 0.14, ease: 'power3.out' });
      gsap.to(bars, { scaleX: 1, duration: 1.5, stagger: 0.16, ease: 'power3.out', delay: 0.3 });
      counters.forEach((c) => {
        const target = Number(c.dataset.count);
        const o = { n: 0 };
        gsap.to(o, { n: target, duration: 1.6, delay: 0.3, ease: 'power2.out', onUpdate: () => { c.textContent = String(Math.round(o.n)); } });
      });
    },
  });

  gsap.to('.offline__wifi', { y: -14, rotation: 4, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}

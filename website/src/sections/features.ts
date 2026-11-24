import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { qsa, reduced } from '../lib/dom';

/** Feature tiles pop in with a stagger, their 3D clay icons float, and each tile tilts toward the pointer. */
export function initFeatures(): void {
  const tiles = qsa('.tile');
  const motion = !reduced();
  if (!motion) {
    gsap.set(tiles, { autoAlpha: 1 });
    return;
  }

  ScrollTrigger.batch(tiles, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.fromTo(batch, { y: 70, autoAlpha: 0, scale: 0.92, rotation: 'random(-4, 4)' }, { y: 0, autoAlpha: 1, scale: 1, rotation: 0, duration: 0.9, stagger: 0.1, ease: 'back.out(1.5)' }),
  });

  gsap.to('.tile__3d', { y: -9, rotation: 'random(-4, 4)', duration: 'random(2.2, 3.4)', repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: { each: 0.25, from: 'random' } });

  if (window.matchMedia('(hover: hover)').matches) {
    tiles.forEach((tile) => {
      const rx = gsap.quickTo(tile, 'rotationX', { duration: 0.5, ease: 'power3' });
      const ry = gsap.quickTo(tile, 'rotationY', { duration: 0.5, ease: 'power3' });
      gsap.set(tile, { transformPerspective: 900 });
      tile.addEventListener('pointermove', (e: PointerEvent) => {
        const r = tile.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 12);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 12);
      });
      tile.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }
}

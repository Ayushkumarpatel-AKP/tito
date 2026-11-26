import { gsap } from 'gsap';
import type { Pets } from '../lib/pets';
import { qs, qsa, reduced } from '../lib/dom';

/** The hero: the headline rises, the glowing selection frame and Tito drop in, and a small loop keeps them alive while the hero is on screen. */
export function initHero(pets: Pets): void {
  const motion = !reduced();
  const hero = qs('.hero');
  pets.hero?.play('greeting', { then: 'idle' });
  if (!motion) return;

  // 1. intro (everything is visible without this; it only plays from a hidden start)
  gsap
    .timeline({ defaults: { ease: 'power3.out' } })
    .from('.hero .badge', { y: 18, autoAlpha: 0, duration: 0.6 }, 0.1)
    .from('.hero h1', { y: 46, autoAlpha: 0, duration: 0.9 }, 0.2)
    .from('.hero h1 em', { y: 30, autoAlpha: 0, duration: 0.8 }, 0.45)
    .from('.hero .lead, .hero .actions, .hero .trust', { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.12 }, 0.6)
    .from('.hero__frame', { scale: 0.6, rotation: -22, autoAlpha: 0, duration: 1, ease: 'back.out(1.6)' }, 0.5)
    .from('.hero__tito', { y: 70, autoAlpha: 0, duration: 0.9 }, 0.7)
    .from('.float3d, .spark', { scale: 0, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: 'elastic.out(1, 0.6)' }, 0.9);

  // 2. things that float, and a little parallax on the pointer
  qsa('.float3d').forEach((el, i) => gsap.to(el, { y: 'random(-14, 14)', rotation: 'random(-9, 9)', duration: 'random(3, 5)', repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.3 }));
  qsa('.spark').forEach((el, i) => gsap.to(el, { scaleY: 0.55, autoAlpha: 0.6, duration: 0.7, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.25 }));
  const layers = qsa('.hero__frame, .hero__tito, .float3d').map((el, i) => ({ qx: gsap.quickTo(el, 'xPercent', { duration: 0.9, ease: 'power3' }), qy: gsap.quickTo(el, 'yPercent', { duration: 0.9, ease: 'power3' }), depth: 0.4 + (i % 3) * 0.35 }));
  hero.addEventListener('pointermove', (e: PointerEvent) => {
    const r = hero.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    layers.forEach((l) => { l.qx(nx * 14 * l.depth); l.qy(ny * 12 * l.depth); });
  });

  // 3. the pointer drags toward the frame again and again, and Tito looks, then smiles
  const cursor = qs('.hero__cursor');
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, paused: true });
  tl.call(() => pets.hero?.play('searching'), [], 0)
    .fromTo(cursor, { x: 90, y: 60, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 1.1, ease: 'power2.out' }, 0.2)
    .to(cursor, { x: -70, y: -90, duration: 1.4, ease: 'power2.inOut' }, 1.6)
    .call(() => pets.hero?.play('success', { then: 'idle' }), [], 3.1)
    .to(cursor, { autoAlpha: 0, duration: 0.4 }, 3.4)
    .to({}, { duration: 1.8 });
  const io = new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? tl.play() : tl.pause())), { threshold: 0.2 });
  io.observe(hero);
}

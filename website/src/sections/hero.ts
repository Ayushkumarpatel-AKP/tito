import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type { Pets } from '../lib/pets';
import { qs, qsa, reduced } from '../lib/dom';

/** The hero: headline lines rise out of a mask, the stage drops in, then a loop plays forever while it is on screen. */
export function initHero(pets: Pets): void {
  const h1 = qs('#h-hero');
  const stage = qs('#heroStage');
  const motion = !reduced();

  // 1. intro
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  SplitText.create(h1, {
    type: 'lines',
    mask: 'lines',
    autoSplit: true,
    onSplit(self) {
      gsap.set(h1, { autoAlpha: 1 });
      if (!motion) return;
      return gsap.from(self.lines, { yPercent: 115, duration: 1, stagger: 0.12, ease: 'power4.out' });
    },
  });
  const copy = qsa('.hero .lead, .hero .actions');
  const bits = qsa('.float3d, .blob');
  gsap.set([...copy, stage], { autoAlpha: 1 });
  if (motion) {
    intro
      .from(copy, { y: 28, autoAlpha: 0, duration: 0.8, stagger: 0.12 }, 0.45)
      .from(stage, { y: 40, autoAlpha: 0, duration: 0.9 }, 0.5)
      .from('.keycap', { y: -40, autoAlpha: 0, duration: 0.6, stagger: 0.1, ease: 'back.out(2)' }, 0.8)
      .from(bits, { scale: 0, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: 'elastic.out(1, 0.6)' }, 0.6);
  } else gsap.set(bits, { autoAlpha: 1 });
  gsap.set(bits, { autoAlpha: 1 });

  if (!motion) {
    pets.hero?.play('idle', { boing: false });
    gsap.set('.paper__loop path', { strokeDashoffset: 0 });
    gsap.set('.answer', { autoAlpha: 1 });
    return;
  }

  // 2. floating 3D pieces and a little parallax on the pointer
  qsa('.float3d').forEach((el, i) => {
    gsap.to(el, { y: `random(-16, 16)`, x: `random(-10, 10)`, rotation: `random(-9, 9)`, duration: `random(3, 5)`, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.3 });
  });
  const hero = qs('.hero');
  const moveX = qsa('.float3d, .blob').map((el) => ({ el, qx: gsap.quickTo(el, 'xPercent', { duration: 0.8, ease: 'power3' }), qy: gsap.quickTo(el, 'yPercent', { duration: 0.8, ease: 'power3' }), depth: Number(el.dataset.depth ?? 0.3) }));
  hero.addEventListener('pointermove', (e: PointerEvent) => {
    const r = hero.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    moveX.forEach((m) => { m.qx(nx * 30 * m.depth); m.qy(ny * 30 * m.depth); });
  });

  // 3. the working loop: keys, a drawn loop, an answer, Tito searching then happy
  const keys = qsa('.hero .keycap');
  const loop = qs<SVGPathElement>('.paper__loop path');
  const paper = qs('.paper');
  const answer = qs('.answer');
  gsap.set(loop, { strokeDashoffset: 1 });
  gsap.set(answer, { autoAlpha: 0, scale: 0.8, y: 14 });
  const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1.6 });
  tl.call(() => pets.hero?.play('greeting', { then: 'idle' }), [], 0);
  keys.forEach((k, i) => {
    tl.call(() => k.classList.add('is-down'), [], 1.2 + i * 0.35);
  });
  tl.call(() => keys.forEach((k) => k.classList.remove('is-down')), [], 2.5)
    .to(paper, { scale: 1.03, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.inOut' }, 2.6)
    .call(() => pets.hero?.play('searching'), [], 3)
    .to(loop, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, 3)
    .call(() => pets.hero?.play('success', { then: 'idle' }), [], 4.7)
    .to(answer, { autoAlpha: 1, scale: 1, y: 0, duration: 0.6, ease: 'back.out(1.8)' }, 4.7)
    .to({}, { duration: 3.2 })
    .to([loop], { strokeDashoffset: 1, duration: 0.4 }, '>')
    .to(answer, { autoAlpha: 0, scale: 0.85, duration: 0.35 }, '<');
  ScrollTrigger.create({ trigger: stage, start: 'top 90%', end: 'bottom 5%', onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });
}

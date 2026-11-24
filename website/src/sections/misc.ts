import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type Lenis from 'lenis';
import type { Pets } from '../lib/pets';
import { qs, qsa, maybe, reduced } from '../lib/dom';

/** Section headings: lines rise out of a mask when they scroll into view. */
export function initHeadings(): void {
  const motion = !reduced();
  qsa('main .slab:not(.hero) h2, .foot h2').forEach((h) => {
    SplitText.create(h, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit(self) {
        gsap.set(h, { autoAlpha: 1 });
        if (!motion) return;
        return gsap.from(self.lines, { yPercent: 110, duration: 0.9, stagger: 0.1, ease: 'power4.out', scrollTrigger: { trigger: h, start: 'top 88%', once: true } });
      },
    });
  });
}

/** Everything else fades up in small batches as it arrives. */
export function initReveals(): void {
  const sel = '.lead, .player, .try__tabs, .try__screen, .try__card, .probe-wrap, .step, .source, .faq details, .providers';
  const els = qsa(sel).filter((e) => !e.closest('.hero'));
  if (reduced()) { gsap.set(els, { autoAlpha: 1 }); return; }
  ScrollTrigger.batch(els, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.fromTo(batch, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out' }),
  });
}

/** Nav: anchors scroll smoothly, and the pill tucks in a little once you leave the top. */
export function initNav(lenis: Lenis | null): void {
  qsa<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href') ?? '';
      const target = id === '#top' ? document.body : maybe(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target as HTMLElement, { offset: id === '#top' ? 0 : -20 });
      else target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
    });
  });
  if (reduced()) return;
  const pill = qs('.nav__pill');
  ScrollTrigger.create({ start: 80, end: 'max', onToggle: (self) => gsap.to(pill, { scale: self.isActive ? 0.94 : 1, y: self.isActive ? -2 : 0, duration: 0.4, ease: 'power3.out' }) });
}

/** Buttons lean toward the pointer like a magnet. */
export function initMagnets(): void {
  if (reduced() || !window.matchMedia('(hover: hover)').matches) return;
  qsa('[data-magnet]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
    el.addEventListener('pointermove', (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.25);
      y((e.clientY - (r.top + r.height / 2)) * 0.35);
    });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}

/** The build commands copy to the clipboard. */
export function initCopy(): void {
  const btn = maybe<HTMLButtonElement>('#copySrc');
  if (!btn) return;
  const label = qs('span', btn);
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(qs('#srcCode').textContent?.trim() ?? ''); } catch { /* clipboard blocked */ }
    label.textContent = 'Copied';
    gsap.delayedCall(1.8, () => { label.textContent = 'Copy commands'; });
  });
}

/** FAQ answers ease in when a question opens. */
export function initFaq(): void {
  if (reduced()) return;
  qsa<HTMLDetailsElement>('.faq details').forEach((d) => {
    d.addEventListener('toggle', () => { if (d.open) gsap.fromTo(qs('p', d), { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out' }); });
  });
}

/** The closing Tito waves whenever the footer comes into view. */
export function initFooter(pets: Pets): void {
  const pet = pets.foot;
  if (!pet || reduced()) { pet?.play('idle', { boing: false }); return; }
  let on = false;
  ScrollTrigger.create({ trigger: '#foot', start: 'top 70%', onToggle: (self) => { on = self.isActive; if (on) pet.play('success_alt', { then: 'idle' }); } });
  gsap.delayedCall(0, function loop() {
    if (on) pet.play(Math.random() < 0.5 ? 'greeting' : 'success', { then: 'idle' });
    gsap.delayedCall(7, loop);
  });
}

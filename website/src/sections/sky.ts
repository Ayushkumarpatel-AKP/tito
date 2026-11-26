import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { qsa, reduced } from '../lib/dom';

/** A small star with a face. It leads a glowing tail. */
const STAR = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3l5.6 12.4 13.4 1.5-10 9.1 2.8 13.2L24 32.2 12.2 39.2 15 26 5 16.9l13.4-1.5z" fill="#ffd45e" stroke="#ff9f43" stroke-width="2.2" stroke-linejoin="round"/><circle cx="19" cy="22" r="1.9" fill="#4a2a00"/><circle cx="29" cy="22" r="1.9" fill="#4a2a00"/><path d="M21 26.4c1.6 1.7 4.4 1.7 6 0" stroke="#4a2a00" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="15.5" cy="26" r="2.3" fill="#ff8fa3" opacity="0.85"/><circle cx="32.5" cy="26" r="2.3" fill="#ff8fa3" opacity="0.85"/></svg>`;

/** A round little flying saucer with a green alien looking out. */
const UFO = `<svg viewBox="0 0 120 84" aria-hidden="true"><ellipse cx="60" cy="34" rx="27" ry="23" fill="#c9efff" fill-opacity="0.8" stroke="#7ec9ff" stroke-width="2.2"/><ellipse cx="60" cy="40" rx="11.5" ry="10.5" fill="#8ff0a4"/><ellipse cx="55" cy="39" rx="2.6" ry="3.5" fill="#16311f"/><ellipse cx="65" cy="39" rx="2.6" ry="3.5" fill="#16311f"/><path d="M56.5 44.5c2 1.6 5 1.6 7 0" stroke="#16311f" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M60 29v-6" stroke="#8ff0a4" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="21" r="2.6" fill="#ff8fd0"/><ellipse cx="60" cy="54" rx="54" ry="15" fill="#a99bff" stroke="#6f5ce8" stroke-width="2"/><ellipse cx="60" cy="50.5" rx="44" ry="9" fill="#d2c9ff"/><circle cx="24" cy="57" r="3.4" fill="#ffd45e"/><circle cx="42" cy="61" r="3.4" fill="#ff8fd0"/><circle cx="60" cy="63" r="3.4" fill="#7fe7c4"/><circle cx="78" cy="61" r="3.4" fill="#ff8fd0"/><circle cx="96" cy="57" r="3.4" fill="#ffd45e"/><path d="M42 68l-6 12M78 68l6 12" stroke="#6f5ce8" stroke-width="3.2" stroke-linecap="round"/></svg>`;

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * Cute shooting stars and a saucer drifting through the night sections. Each one is a quiet loop that only runs while its section is on screen,
 * and it sits behind the content. With reduced motion the saucer simply hangs in the corner.
 */
export function initSky(): void {
  qsa('[data-sky]').forEach((host) => {
    const sky = document.createElement('div');
    sky.className = 'sky';
    sky.setAttribute('aria-hidden', 'true');
    sky.innerHTML = `<div class="ufo"><div class="ufo__beam"></div>${UFO}</div>` + Array.from({ length: 3 }, () => `<div class="shoot"><span class="shoot__tail"></span><span class="shoot__head">${STAR}</span></div>`).join('');
    host.prepend(sky);
    const ufo = sky.querySelector<HTMLElement>('.ufo');
    const beam = sky.querySelector<HTMLElement>('.ufo__beam');
    const shots = Array.from(sky.querySelectorAll<HTMLElement>('.shoot'));
    if (!ufo || !beam) return;

    if (reduced()) {
      gsap.set(ufo, { right: '6%', top: '10%', left: 'auto' });
      gsap.set(shots, { autoAlpha: 0 });
      return;
    }

    let on = false;
    const timers: gsap.core.Tween[] = [];

    const flyUfo = (): void => {
      if (!on) return;
      const w = host.clientWidth, h = host.clientHeight;
      const goRight = Math.random() < 0.5;
      const y = rand(0.1, 0.42) * h;
      const size = rand(70, 104);
      gsap.set(ufo, { width: size, x: goRight ? -size - 40 : w + 40, y, rotation: 0, autoAlpha: 1, scaleX: goRight ? 1 : -1 });
      const tl = gsap.timeline({ onComplete: () => { timers.push(gsap.delayedCall(rand(5, 11), flyUfo)); } });
      tl.to(ufo, { x: goRight ? w + 40 : -size - 40, duration: rand(16, 24), ease: 'none' }, 0)
        .to(ufo, { y: `+=${rand(14, 26)}`, duration: 1.6, repeat: 11, yoyo: true, ease: 'sine.inOut' }, 0)
        .to(ufo, { rotation: rand(4, 7), duration: 2.2, repeat: 8, yoyo: true, ease: 'sine.inOut' }, 0);
      tl.to(beam, { autoAlpha: 0.55, duration: 0.5, yoyo: true, repeat: 3 }, rand(3, 7));
      timers.push(tl as unknown as gsap.core.Tween);
    };

    const shoot = (el: HTMLElement): void => {
      if (!on) return;
      const w = host.clientWidth, h = host.clientHeight;
      const dx = -(w * rand(0.28, 0.5));
      const dy = Math.abs(dx) * rand(0.35, 0.6);
      const angle = -(Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
      const x0 = rand(0.45, 1.02) * w, y0 = rand(-0.05, 0.4) * h;
      gsap.set(el, { x: x0, y: y0, rotation: angle, autoAlpha: 0, scale: rand(0.8, 1.15) });
      const tl = gsap.timeline({ onComplete: () => { timers.push(gsap.delayedCall(rand(2.5, 8), () => shoot(el))); } });
      tl.to(el, { autoAlpha: 1, duration: 0.2 }, 0)
        .to(el, { x: x0 + dx, y: y0 + dy, duration: rand(1.5, 2.3), ease: 'power1.in' }, 0)
        .to(el, { autoAlpha: 0, duration: 0.35 }, '>-0.35');
      timers.push(tl as unknown as gsap.core.Tween);
    };

    ScrollTrigger.create({
      trigger: host,
      start: 'top 85%',
      end: 'bottom 5%',
      onToggle: (self) => {
        on = self.isActive;
        if (on) {
          gsap.delayedCall(rand(0.5, 1.5), flyUfo);
          shots.forEach((s, i) => timers.push(gsap.delayedCall(1 + i * 2.2 + rand(0, 1.5), () => shoot(s))));
        } else {
          timers.splice(0).forEach((t) => t.kill());
          gsap.killTweensOf([ufo, beam, ...shots]);
          gsap.set([ufo, ...shots], { autoAlpha: 0 });
        }
      },
    });
    gsap.set([ufo, ...shots], { autoAlpha: 0 });
  });
}

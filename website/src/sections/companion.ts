import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Pets } from '../lib/pets';
import { qs, qsa } from '../lib/dom';
import type { StateName } from '../lib/sprite';

const MAP: Record<string, [StateName, string]> = {
  watch: ['talking', 'Press play and I will narrate.'],
  try: ['searching', 'Go on, draw around something.'],
  features: ['success_alt', 'Plenty to play with.'],
  offline: ['typing', 'I work offline too.'],
  keys: ['thinking', 'Any AI key will do.'],
  setup: ['listening_wave', 'Five easy steps.'],
  faq: ['confused', 'Any questions?'],
};

/** A small Tito that follows you down the page and reacts to what you are reading. */
export function initCompanion(pets: Pets): void {
  const buddy = qs('#buddy');
  const bubble = qs('#buddyBubble');
  const pet = pets.buddy;
  if (!pet) return;
  const said = new Set<string>();
  let hideT: gsap.core.Tween | null = null;

  const say = (text: string): void => {
    bubble.textContent = text;
    bubble.classList.add('is-on');
    hideT?.kill();
    hideT = gsap.delayedCall(2.8, () => bubble.classList.remove('is-on'));
  };
  const hide = (): void => buddy.classList.remove('is-on');

  qsa('main > section[id]').forEach((sec) => {
    const m = MAP[sec.id];
    if (!m) return;
    const enter = (): void => {
      buddy.classList.add('is-on');
      pet.play(m[0], { then: 'idle' });
      if (!said.has(sec.id)) { said.add(sec.id); say(m[1]); }
    };
    ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 45%', onEnter: enter, onEnterBack: enter });
  });
  ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom 60%', onToggle: (self) => { if (self.isActive) hide(); } });
  ScrollTrigger.create({ trigger: '#how', start: 'top 60%', end: 'bottom 40%', onToggle: (self) => { if (self.isActive) hide(); } });
  ScrollTrigger.create({ trigger: '#foot', start: 'top 80%', onEnter: hide });

  qs('#buddyPet').addEventListener('click', () => {
    const states: StateName[] = ['success', 'success_alt', 'greeting', 'talking', 'loading', 'thinking'];
    pet.play(states[Math.floor(Math.random() * states.length)], { then: 'idle' });
    say(['Hehe!', 'Hello again.', 'Tickles!', 'Boing!'][Math.floor(Math.random() * 4)]);
  });
}

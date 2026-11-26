import './styles/site.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { hydrateIcons } from './lib/icons';
import { createPets } from './lib/pets';
import { reduced } from './lib/dom';
import { initHero } from './sections/hero';
import { initHow } from './sections/how';
import { initDemo } from './sections/demo';
import { initFeatures } from './sections/features';
import { initTools } from './sections/tools';
import { initSky } from './sections/sky';
import { initOffline } from './sections/offline';
import { initKeys } from './sections/keys';
import { initCompanion } from './sections/companion';
import { initCopy, initFaq, initFooter, initHeadings, initMagnets, initNav, initReveals } from './sections/misc';

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Smooth scrolling, wired into ScrollTrigger so pinned scenes stay exact. */
function smoothScroll(): Lenis | null {
  if (reduced()) return null;
  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

async function boot(): Promise<void> {
  hydrateIcons();
  const lenis = smoothScroll();
  await document.fonts.ready;
  const pets = await createPets();

  initHero(pets);
  initHow(pets);
  initHeadings();
  initReveals();
  initDemo(pets);
  initFeatures();
  initTools();
  initSky();
  initOffline(pets);
  initKeys();
  initFaq();
  initCopy();
  initFooter(pets);
  initCompanion(pets);
  initNav(lenis);
  initMagnets();

  window.addEventListener('load', () => ScrollTrigger.refresh());
  requestAnimationFrame(() => ScrollTrigger.refresh());
}

void boot();

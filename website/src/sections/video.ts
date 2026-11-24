import { gsap } from 'gsap';
import { qs, maybe, reduced } from '../lib/dom';

/** The demo video: a big clay play button that breathes until you press it. */
export function initVideo(): void {
  const vid = maybe<HTMLVideoElement>('#vid');
  const btn = maybe<HTMLButtonElement>('#playBtn');
  const player = maybe('.player');
  if (!vid || !btn || !player) return;

  if (!reduced()) gsap.to(btn, { scale: 1.07, duration: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  btn.addEventListener('click', () => { void vid.play(); vid.focus(); });
  vid.addEventListener('play', () => { player.classList.add('is-playing'); gsap.killTweensOf(btn); });
  vid.addEventListener('pause', () => player.classList.remove('is-playing'));
  vid.addEventListener('ended', () => player.classList.remove('is-playing'));
  qs('source', vid).addEventListener('error', () => { btn.hidden = true; });
}

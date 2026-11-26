import { gsap } from 'gsap';

/** The pieces of a "select something on the screen" scene. All of them live inside `win`, which clips the dimming. */
export interface SelParts {
  win: HTMLElement;
  /** the text the selection ends up around */
  target: HTMLElement;
  /** the dashed rectangle (with its handles) */
  sel: HTMLElement;
  /** the mouse pointer */
  cursor: HTMLElement;
  pad?: number;
}
export interface Box { x: number; y: number; w: number; h: number }

/** Where the selection rectangle ends up: the target's box, a little roomier, measured inside `win`. */
export function selectionBox(p: SelParts): Box {
  const t = p.target.getBoundingClientRect();
  const w = p.win.getBoundingClientRect();
  const pad = p.pad ?? 12;
  return { x: t.left - w.left - pad, y: t.top - w.top - pad * 0.7, w: t.width + pad * 2, h: t.height + pad * 1.4 };
}

// the pointer's tip is a few pixels inside its picture
const TIP = { x: 5, y: 3 };

/** Back to "nothing selected": no dimming, no rectangle, no pointer. Kill the old timeline yourself before calling it; it must never run inside the new one. */
export function resetSelection(p: SelParts): void {
  p.sel.classList.remove('is-on', 'is-locked');
  gsap.set(p.sel, { width: 0, height: 0, x: 0, y: 0 });
  gsap.set(p.cursor, { autoAlpha: 0, scale: 1 });
}

/** The finished picture: the text is selected and the rest is dimmed. Used before the loop starts and for reduced motion. */
export function showSelected(p: SelParts): Box {
  const b = selectionBox(p);
  gsap.set(p.sel, { x: b.x, y: b.y, width: b.w, height: b.h });
  p.sel.classList.add('is-on', 'is-locked');
  gsap.set(p.cursor, { autoAlpha: 0 });
  return b;
}

/**
 * Adds the real gesture to a timeline, starting at `at`: the screen dims, the pointer arrives, presses at the top-left corner of the text,
 * drags to the bottom-right while the dashed rectangle grows, then lets go and the handles appear. Returns when it ends and the final box.
 */
export function addSelection(tl: gsap.core.Timeline, p: SelParts, at: number, drag = 1.3): { end: number; box: Box } {
  const b = selectionBox(p);
  const from = { x: b.x - 90, y: b.y - 60 };           // the pointer first shows up above and to the left
  const press = at + 0.85;                             // when the button goes down
  tl.set(p.sel, { x: b.x, y: b.y, width: 0, height: 0 }, at)
    .set(p.cursor, { x: from.x - TIP.x, y: from.y - TIP.y, autoAlpha: 0, scale: 1 }, at)
    .to(p.cursor, { autoAlpha: 1, duration: 0.25 }, at)
    .to(p.cursor, { x: b.x - TIP.x, y: b.y - TIP.y, duration: 0.7, ease: 'power2.inOut' }, at + 0.1)
    .to(p.cursor, { scale: 0.86, duration: 0.1, ease: 'power1.in' }, press - 0.1)
    .call(() => p.sel.classList.add('is-on'), [], press)                                         // the screen dims as soon as you press
    .to(p.cursor, { x: b.x + b.w - TIP.x, y: b.y + b.h - TIP.y, duration: drag, ease: 'power2.inOut' }, press)
    .to(p.sel, { width: b.w, height: b.h, duration: drag, ease: 'power2.inOut' }, press)
    .to(p.cursor, { scale: 1, duration: 0.15, ease: 'back.out(3)' }, press + drag)
    .call(() => p.sel.classList.add('is-locked'), [], press + drag + 0.05)                       // let go: solid border and handles
    .to(p.cursor, { autoAlpha: 0, x: `+=26`, y: `+=22`, duration: 0.5, ease: 'power2.in' }, press + drag + 0.5);
  return { end: press + drag + 0.1, box: b };
}

export const qs = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

export const maybe = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);

export const qsa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => Array.from(root.querySelectorAll<T>(sel));

export const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Make a Sprite host: an empty, sized, positioned box the sprite draws into. */
export const host = (id: string): HTMLElement | null => document.getElementById(id);

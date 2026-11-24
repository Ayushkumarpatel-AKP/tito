import { gsap } from 'gsap';
import manifestJson from '../data/manifest.json';

/** One animation of Tito: a horizontal strip of frames with an intro, a loop and an outro. */
export interface StateDef {
  file: string;
  w: number;
  h: number;
  fps: number;
  count: number;
  intro: number[];
  loop: number[];
  outro: number[];
}
export type StateName = keyof typeof manifestJson;
const M = manifestJson as Record<string, StateDef>;
const BASE = '/tito/';

export interface PlayOptions {
  /** state to play when a non-looping state ends */
  then?: StateName;
  onEnd?: () => void;
  /** squash and stretch on state change (default true) */
  boing?: boolean;
}

/** Resolves when every strip is decoded, so the first frame never flashes empty. */
export const ready: Promise<void> = Promise.all(
  Object.values(M).map(
    (m) =>
      new Promise<void>((res) => {
        const i = new Image();
        i.onload = i.onerror = () => res();
        i.src = BASE + m.file;
      }),
  ),
).then(() => undefined);

export const def = (name: StateName): StateDef => M[name as string];

type Phase = 'intro' | 'loop' | 'outro' | 'done';

export class Sprite {
  readonly el: HTMLDivElement;
  name: StateName | null = null;
  private m: StateDef | null = null;
  private seq: number[] = [];
  private i = 0;
  private acc = 0;
  private phase: Phase = 'done';
  private opts: PlayOptions = {};
  paused = false;

  constructor(private host: HTMLElement, private scale = 1) {
    this.el = document.createElement('div');
    this.el.className = 'spr';
    host.appendChild(this.el);
    gsap.ticker.add(this.tick);
  }

  destroy(): void {
    gsap.ticker.remove(this.tick);
    this.el.remove();
  }

  play(name: StateName, opts: PlayOptions = {}): this {
    const m = M[name as string];
    if (!m) return this;
    this.name = name;
    this.m = m;
    this.opts = opts;
    this.acc = 0;
    this.el.style.width = `${m.w * this.scale}px`;
    this.el.style.height = `${m.h * this.scale}px`;
    this.el.style.backgroundImage = `url(${BASE}${m.file})`;
    this.el.style.backgroundSize = `${m.w * m.count * this.scale}px ${m.h * this.scale}px`;
    if (m.intro.length) {
      this.phase = 'intro';
      this.seq = m.intro;
    } else {
      this.phase = 'loop';
      this.seq = m.loop;
    }
    this.i = 0;
    this.show(this.seq[0]);
    if (opts.boing !== false) this.boing();
    return this;
  }

  /** Leave a looping state gracefully: play its outro, then continue with `then`. */
  release(then: StateName = 'idle', opts: PlayOptions = {}): void {
    if (this.phase === 'loop' && this.m && this.m.outro.length) {
      this.phase = 'outro';
      this.seq = this.m.outro;
      this.i = 0;
      this.opts = { then, ...opts, boing: false };
    } else this.play(then, opts);
  }

  /** Squash and stretch, the clay way. */
  boing(): void {
    gsap.killTweensOf(this.host, 'scaleX,scaleY');
    gsap.fromTo(
      this.host,
      { scaleX: 1, scaleY: 1, transformOrigin: '50% 100%' },
      {
        keyframes: [
          { scaleX: 1.12, scaleY: 0.85, duration: 0.14 },
          { scaleX: 0.93, scaleY: 1.1, duration: 0.16 },
          { scaleX: 1.03, scaleY: 0.98, duration: 0.12 },
          { scaleX: 1, scaleY: 1, duration: 0.14 },
        ],
        ease: 'power2.out',
      },
    );
  }

  private show(idx: number | undefined): void {
    if (idx === undefined || !this.m) return;
    this.el.style.backgroundPosition = `-${idx * this.m.w * this.scale}px 0`;
  }

  private advance(): void {
    if (!this.m) return;
    this.i++;
    if (this.i < this.seq.length) return this.show(this.seq[this.i]);
    if (this.phase === 'intro' && this.m.loop.length) {
      this.phase = 'loop';
      this.seq = this.m.loop;
      this.i = 0;
      return this.show(this.seq[0]);
    }
    if (this.phase === 'loop') {
      this.i = 0;
      return this.show(this.seq[0]);
    }
    const { then, onEnd } = this.opts;
    this.phase = 'done';
    this.i = this.seq.length - 1;
    onEnd?.();
    if (then && then !== this.name) this.play(then, { boing: false });
  }

  private tick = (_time: number, deltaMs: number): void => {
    if (this.paused || !this.m || this.phase === 'done') return;
    this.acc += Math.min(deltaMs, 200);
    const step = 1000 / this.m.fps;
    while (this.acc >= step) {
      this.acc -= step;
      this.advance();
      if ((this.phase as Phase) === 'done') break;
    }
  };
}

/** Which frame of a state is showing at time t (seconds): intro once, then the loop. Used by the video renderer. */
export function frameAt(name: StateName, t: number): number {
  const m = M[name as string];
  const n = Math.max(0, Math.floor(t * m.fps));
  if (n < m.intro.length) return m.intro[n];
  if (m.loop.length) return m.loop[(n - m.intro.length) % m.loop.length];
  return m.intro[m.intro.length - 1] ?? 0;
}

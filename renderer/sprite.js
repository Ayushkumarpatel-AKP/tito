// Plays Tito's sprite-strip animations. Each state = intro (once) -> loop (forever) -> outro (on release).
(function () {
  const BASE = '../assets/tito/';
  const M = window.TITO_MANIFEST;
  const imgs = {};
  const ready = Promise.all(Object.entries(M).map(([k, m]) => new Promise((res) => {
    const i = new Image(); i.onload = i.onerror = res; i.src = BASE + m.file; imgs[k] = i;
  })));

  class Sprite {
    /** host: element that will contain the sprite. scale: 1 = native frame size. */
    constructor(host, { scale = 1 } = {}) {
      this.host = host; this.scale = scale;
      this.el = document.createElement('div'); this.el.className = 'spr';
      host.appendChild(this.el);
      this.name = null; this.seq = []; this.i = 0; this.acc = 0; this.phase = 'none';
      this.opts = {}; this.last = performance.now(); this.paused = false;
      this._tick = this._tick.bind(this); requestAnimationFrame(this._tick);
    }

    /** Start a state. opts.then: state to play when a non-looping state ends. opts.onEnd: callback. opts.boing: squash-pop. */
    play(name, opts = {}) {
      const m = M[name]; if (!m) return;
      this.name = name; this.m = m; this.opts = opts; this.acc = 0;
      this.el.style.width = m.w * this.scale + 'px'; this.el.style.height = m.h * this.scale + 'px';
      this.el.style.backgroundImage = `url(${BASE}${m.file})`;
      this.el.style.backgroundSize = `${m.w * m.count * this.scale}px ${m.h * this.scale}px`;
      if (m.intro.length) { this.phase = 'intro'; this.seq = m.intro; }
      else { this.phase = 'loop'; this.seq = m.loop; }
      this.i = 0; this._show(this.seq[0]);
      if (opts.boing !== false) this.boing();
      return this;
    }

    /** Leave a looping state gracefully (plays its outro), then continue with `then`. */
    release(then = 'idle', opts = {}) {
      const m = this.m;
      if (this.phase === 'loop' && m && m.outro.length) {
        this.phase = 'outro'; this.seq = m.outro; this.i = 0; this.opts = { then, ...opts, boing: false };
      } else this.play(then, opts);
    }

    boing() {
      this.host.classList.remove('boing'); void this.host.offsetWidth; this.host.classList.add('boing');
    }

    _show(idx) {
      if (idx === undefined) return;
      this.el.style.backgroundPosition = `-${idx * this.m.w * this.scale}px 0`;
    }

    _advance() {
      this.i++;
      if (this.i < this.seq.length) return this._show(this.seq[this.i]);
      if (this.phase === 'intro' && this.m.loop.length) { this.phase = 'loop'; this.seq = this.m.loop; this.i = 0; return this._show(this.seq[0]); }
      if (this.phase === 'loop') { this.i = 0; return this._show(this.seq[0]); }
      // finished a one-shot (intro without loop, or an outro)
      const { then, onEnd } = this.opts;
      this.phase = 'done'; this.i = this.seq.length - 1;
      if (onEnd) onEnd();
      if (then && then !== this.name) this.play(then, { boing: false });
      else if (then === this.name) this.phase = 'done';
    }

    _tick(now) {
      requestAnimationFrame(this._tick);
      if (this.paused || !this.m || this.phase === 'done' || this.phase === 'none') { this.last = now; return; }
      this.acc += Math.min(now - this.last, 200); this.last = now;
      const step = 1000 / this.m.fps;
      while (this.acc >= step) { this.acc -= step; this._advance(); if (this.phase === 'done') break; }
    }
  }

  /** Draws one frame of a state onto a 2D context (used by the share-card renderer). */
  function drawFrame(ctx, name, frame, x, y, w, h) {
    const m = M[name], im = imgs[name];
    const idx = frame < 0 ? m.count + frame : frame;
    ctx.drawImage(im, idx * m.w, 0, m.w, m.h, x, y, w, h);
  }

  window.TitoSprite = { Sprite, ready, manifest: M, drawFrame };
})();

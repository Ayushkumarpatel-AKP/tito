// Tito's sounds: short effects (Kenney "Interface Sounds", CC0, assets/sfx), original synthesised ringtones, and the natural voice.
(function () {
  const BASE = '../assets/sfx/';
  const NAMES = ['reminder', 'deadline', 'routine', 'done', 'cheer', 'oops', 'open', 'close', 'tap', 'mic_on', 'mic_off', 'celebrate', 'wake', 'focus_done'];
  const cache = {}; let on = true;
  function load(n) { if (!cache[n]) { const a = new Audio(BASE + n + '.ogg'); a.preload = 'auto'; cache[n] = a; } return cache[n]; }

  // ---------------------------------------------------------------- ringtones
  // Original little melodies made with oscillators (no copyrighted tunes). Each plays one round and returns how long it lasted, in seconds.
  const F = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093 };
  let ac = null; const ctx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  function tone(c, t, f, d, type, gain, harm) {
    const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.05);
    if (harm) tone(c, t, f * harm, d * 0.6, 'sine', gain * 0.35);
  }
  const SYNTH = {
    marimba(c, t) { const seq = [F.E5, F.G5, F.B5, F.E6, F.B5, F.G5, F.E5, F.G5, F.B5, F.E6]; seq.forEach((f, i) => tone(c, t + i * 0.16, f, 0.55, 'triangle', 0.3, 4)); return seq.length * 0.16 + 0.7; },
    sparkle(c, t) { const seq = [F.C6, F.E6, F.G6, F.C7, F.G6, F.E6, F.C6, F.G6, F.C7]; seq.forEach((f, i) => tone(c, t + i * 0.11, f, 0.7, 'sine', 0.22, 2)); return seq.length * 0.11 + 0.8; },
    retro(c, t) { for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) tone(c, t + r * 0.55 + i * 0.16, i ? F.A5 : F.E6, 0.12, 'square', 0.12); return 1.8; },
    sunrise(c, t) { [F.C5, F.E5, F.G5, F.C6, F.E6].forEach((f, i) => tone(c, t + i * 0.22, f, 1.2, 'sine', 0.22, 2)); return 2.4; },
    bells(c, t) { const seq = [F.G5, F.C6, F.E6, F.C6, F.G5]; seq.forEach((f, i) => tone(c, t + i * 0.32, f, 1.4, 'sine', 0.24, 2.76)); return 2.6; },
  };
  const FILES = { kawaii: 'reminder', steel: 'celebrate', glass: 'routine' };
  const RINGTONES = [['marimba', 'Marimba'], ['sparkle', 'Sparkle'], ['bells', 'Soft bells'], ['sunrise', 'Sunrise'], ['retro', 'Retro beeps'], ['kawaii', 'Kawaii pluck'], ['steel', 'Steel drum'], ['glass', 'Glass chime']];
  let ringTimer = 0, ringEnd = 0, ringStop = null, ringing = false;

  function playOnce(name, vol) {
    if (SYNTH[name]) { const c = ctx(); if (c.state === 'suspended') c.resume(); return SYNTH[name](c, c.currentTime + 0.02) * 1000 * 1; }
    const a = load(FILES[name] || 'reminder'); a.volume = vol || 0.6; a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); return Math.max(1500, (a.duration || 1.5) * 1000 + 400);
  }
  /** Rings (and repeats) until stop() or maxMs. onEnd runs once when it finishes by itself or is stopped. */
  function ring(name, { maxMs = 20000, once = false, onEnd, vol } = {}) {
    stop(); if (!on && !once) return; ringing = true; ringEnd = Date.now() + maxMs; ringStop = onEnd || null;
    const loop = () => {
      if (!ringing) return; const len = playOnce(name, vol);
      if (once || Date.now() + len + 600 > ringEnd) { ringTimer = setTimeout(() => stop(), len); return; }
      ringTimer = setTimeout(loop, len + 700);
    };
    loop();
  }
  function stop() {
    if (!ringing && !ringTimer) return; clearTimeout(ringTimer); ringTimer = 0; const was = ringing; ringing = false;
    for (const k of Object.keys(cache)) { try { cache[k].pause(); } catch { /* ignore */ } }
    const cb = ringStop; ringStop = null; if (was && cb) cb();
  }

  // ---------------------------------------------------------------- natural voice
  let voiceAudio = null;
  async function say(text) {
    stopVoice(); let r;
    try { r = await window.tito.speak(String(text)); } catch (e) { return { ok: false, message: String(e) }; }
    if (r && r.ok) {
      return new Promise((resolve) => {
        voiceAudio = new Audio(`data:${r.mime};base64,${r.audio}`); voiceAudio.onended = voiceAudio.onerror = () => resolve({ ok: true }); voiceAudio.play().catch(() => resolve({ ok: false, message: 'Could not play the voice.' }));
      });
    }
    if (r && r.system && window.speechSynthesis) {
      return new Promise((resolve) => { const u = new SpeechSynthesisUtterance(String(text)); u.onend = u.onerror = () => resolve({ ok: true }); speechSynthesis.cancel(); speechSynthesis.speak(u); });
    }
    return r || { ok: false };
  }
  function stopVoice() { if (voiceAudio) { try { voiceAudio.pause(); } catch { /* ignore */ } voiceAudio = null; } if (window.speechSynthesis) speechSynthesis.cancel(); }

  window.TitoSfx = {
    enable(v) { on = !!v; if (on) NAMES.forEach(load); else { stop(); } },
    play(n, vol) {
      if (!on || !NAMES.includes(n)) return;
      try { const a = load(n); a.volume = vol || 0.5; a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch { /* no audio device */ }
    },
    ring, stopRing: stop, isRinging: () => ringing, RINGTONES,
  };
  window.TitoVoice = { say, stop: stopVoice };
})();

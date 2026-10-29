/* 音效：以 Web Audio 即時合成，不需要音檔 */
window.SFX = (function () {
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const sounds = {
    click:  () => tone(660, 0.08, 'triangle', 0.12),
    hover:  () => tone(1200, 0.035, 'sine', 0.035),
    toggle: () => { tone(520, 0.07, 'square', 0.06); tone(780, 0.08, 'square', 0.05, 0.06); },
    open:   () => { tone(300, 0.25, 'sine', 0.12, 0, 900); tone(900, 0.12, 'triangle', 0.06, 0.18); },
    close:  () => tone(700, 0.2, 'sine', 0.1, 0, 250),
    fav:    () => [784, 988, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.11, i * 0.07)),
    unfav:  () => tone(440, 0.18, 'sine', 0.1, 0, 220),
    swipe:  () => tone(500, 0.12, 'sawtooth', 0.04, 0, 1000),
    dice:   () => { for (let i = 0; i < 6; i++) tone(300 + Math.random() * 600, 0.05, 'square', 0.05, i * 0.05); },
    type:   () => tone(1500 + Math.random() * 300, 0.025, 'sine', 0.03),
    win:    () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, i * 0.1)),
    error:  () => { tone(220, 0.15, 'square', 0.07); tone(180, 0.2, 'square', 0.07, 0.12); }
  };

  return {
    play(name) { if (enabled && sounds[name]) { try { sounds[name](); } catch (e) { /* ignore */ } } },
    set(on) { enabled = !!on; },
    get enabled() { return enabled; }
  };
})();

// Tiny synthesised sound effects: plain WebAudio oscillators and noise,
// no audio files and no network. Everything is guarded so a browser
// without audio (or a blocked context) simply stays silent.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = null;
  let sirenOn = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.08, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch { /* silent */ }
  }

  function noise(dur, vol) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    try {
      const len = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(vol || 0.15, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      src.connect(gain).connect(c.destination);
      src.start();
    } catch { /* silent */ }
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (muted) this.setEngine(0);
      return muted;
    },
    isMuted() { return muted; },
    pickup() { tone(880, 0.12, 'sine', 0.1, 1320); },
    cash() { tone(660, 0.1, 'sine', 0.09); setTimeout(() => tone(990, 0.14, 'sine', 0.09), 90); },
    punch() { noise(0.08, 0.12); },
    crash(strength) { noise(0.18, Math.min(0.3, 0.08 + strength * 0.001)); tone(90, 0.15, 'sawtooth', 0.08, 50); },
    busted() { tone(220, 0.5, 'sawtooth', 0.1, 110); },
    jingle() {
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 110);
      });
    },
    fail() { tone(330, 0.3, 'sawtooth', 0.08, 165); },
    setEngine(speedRatio) {
      // A low hum whose pitch follows the car's speed; off when parked.
      if (muted || speedRatio <= 0.02) {
        if (engineOsc) { try { engineOsc.stop(); } catch { /* already stopped */ } engineOsc = null; }
        return;
      }
      const c = ensure();
      if (!c) return;
      try {
        if (!engineOsc) {
          engineOsc = c.createOscillator();
          engineGain = c.createGain();
          engineOsc.type = 'sawtooth';
          engineGain.gain.setValueAtTime(0.015, c.currentTime);
          engineOsc.connect(engineGain).connect(c.destination);
          engineOsc.start();
        }
        engineOsc.frequency.setValueAtTime(55 + speedRatio * 110, c.currentTime);
        engineGain.gain.setValueAtTime(0.012 + speedRatio * 0.02, c.currentTime);
      } catch { /* silent */ }
    },
    setSiren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      if (on) {
        let high = false;
        sirenTimer = setInterval(() => {
          if (muted) return;
          tone(high ? 950 : 700, 0.32, 'sine', 0.035);
          high = !high;
        }, 340);
      } else if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
    },
  };
}

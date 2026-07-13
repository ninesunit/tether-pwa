/**
 * Tiny generative sound effects — no audio assets, everything synthesized
 * on a shared AudioContext. Quiet and warm by design.
 *
 * iOS unlocks WebAudio only after a user gesture: `unlockAudio()` is wired
 * to the first pointerdown in App, so even *incoming* events (a partner's
 * pulse) can sound once the user has touched the app at least once.
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  ac();
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  /** glide the pitch to this frequency over the note's length */
  to?: number;
  delay?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const c = ac();
  if (!c) return;
  const { type = "sine", gain = 0.07, attack = 0.006, release = dur, to, delay = 0 } = opts;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + attack + release + 0.05);
}

export const sfx = {
  /** soft low thump — sending a pulse */
  thump() {
    tone(120, 0.22, { gain: 0.12, to: 62 });
  },
  /** two-beat heartbeat — receiving a pulse */
  heartbeat() {
    tone(105, 0.2, { gain: 0.13, to: 58 });
    tone(92, 0.26, { gain: 0.1, to: 50, delay: 0.34 });
  },
  /** string pluck — the tether line snapping back */
  pluck() {
    tone(392, 0.28, { type: "triangle", gain: 0.09, to: 330 });
    tone(784, 0.12, { type: "sine", gain: 0.03, to: 660 });
  },
  /** small pop — a message leaves or arrives */
  pop() {
    tone(340, 0.09, { type: "sine", gain: 0.05, to: 190 });
  },
  /** gentle two-note chime — cheers, redeems, completions */
  chime() {
    tone(660, 0.35, { gain: 0.05 });
    tone(990, 0.5, { gain: 0.04, delay: 0.12 });
  },
  /** warm rising swell — the core resonating */
  swell() {
    tone(110, 1.4, { gain: 0.08, attack: 0.5, to: 165 });
    tone(220, 1.4, { gain: 0.04, attack: 0.6, to: 330 });
  },
};

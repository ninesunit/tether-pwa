/**
 * A tiny generative soundscape for "sitting together": filtered pink noise
 * with a slow-breathing lowpass sweep. No audio assets, works offline, and
 * starts only from a user gesture (required by iOS).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function startAmbience() {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  // pink-ish noise buffer (Paul Kellet's economy filter)
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.05;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 380;
  filter.Q.value = 0.4;

  // slow breath: LFO on the filter cutoff, ~8s cycle
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 160;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);

  master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);

  src.connect(filter);
  filter.connect(master);
  master.connect(ctx.destination);
  src.start();
  lfo.start();
}

export function stopAmbience() {
  if (!ctx || !master) return;
  const c = ctx;
  master.gain.linearRampToValueAtTime(0, c.currentTime + 1.5);
  window.setTimeout(() => c.close().catch(() => {}), 1800);
  ctx = null;
  master = null;
}

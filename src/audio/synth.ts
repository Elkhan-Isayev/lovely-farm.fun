// Small Web Audio building blocks: tones and noise bursts. Every sound effect and the farm's
// ambience are synthesised from these (the music is recorded, see music.ts).

export interface ToneOpts {
  type?: OscillatorType;
  f0: number; // start frequency, Hz
  f1?: number; // end frequency (exponential glide)
  dur: number;
  vol: number;
  attack?: number;
  sustain?: boolean; // hold the volume and fade only at the end (bowed, blown notes)
  vibrato?: { rate: number; depth: number };
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

/** A note: oscillator → (filter) → envelope → out. */
export function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: ToneOpts) {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  const g = envelope(ctx, t, o.vol, o.attack ?? 0.005, o.dur);
  if (o.sustain) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.attack ?? 0.005));
    g.gain.setValueAtTime(o.vol, t + Math.max(o.dur - 0.1, o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  }
  chain(ctx, osc, g, o.filter).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

export interface BurstOpts {
  dur: number;
  vol: number;
  attack?: number;
  filter: { type: BiquadFilterType; freq: number; to?: number; q?: number };
}

/** A filtered noise burst: thuds, splashes, rustles, shakers. */
export function burst(ctx: BaseAudioContext, out: AudioNode, t: number, o: BurstOpts) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter.type;
  f.frequency.setValueAtTime(o.filter.freq, t);
  if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + o.dur);
  f.Q.value = o.filter.q ?? 1;
  const g = envelope(ctx, t, o.vol, o.attack ?? 0.003, o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

/** Attack, then an exponential decay to silence over `dur`. */
export function envelope(ctx: BaseAudioContext, t: number, vol: number, attack: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
  return g;
}

function chain(ctx: BaseAudioContext, src: AudioNode, g: GainNode, filter?: ToneOpts['filter']) {
  if (!filter) return src.connect(g);
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.value = filter.freq;
  f.Q.value = filter.q ?? 1;
  return src.connect(f).connect(g);
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, shared by every burst. */
export function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}

/** MIDI note → frequency. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

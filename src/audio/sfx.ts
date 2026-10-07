// Sound effects for actions on the farm, all synthesised (see synth.ts).
import { burst, hz, tone } from './synth';

type Sfx = (ctx: BaseAudioContext, out: AudioNode, t: number) => void;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const caw = (ctx: BaseAudioContext, out: AudioNode, t: number) =>
  tone(ctx, out, t, { type: 'sawtooth', f0: 560, f1: 420, dur: 0.18, vol: 0.22, attack: 0.01, filter: { type: 'bandpass', freq: 1100, q: 2 } });

const cluck = (ctx: BaseAudioContext, out: AudioNode, t: number, f = 700) => {
  for (let i = 0; i < 3; i++) tone(ctx, out, t + i * 0.11, { type: 'square', f0: f, f1: f * 0.7, dur: 0.07, vol: 0.25, filter: { type: 'bandpass', freq: 1300, q: 3 } });
};

export const SFX: Record<string, Sfx> = {
  click: (c, o, t) => tone(c, o, t, { type: 'triangle', f0: 1100, f1: 700, dur: 0.05, vol: 0.06 }),
  error: (c, o, t) => tone(c, o, t, { type: 'square', f0: 180, f1: 140, dur: 0.22, vol: 0.06, filter: { type: 'lowpass', freq: 900 } }),
  // the shovel bites into the soil
  dig: (c, o, t) => {
    burst(c, o, t, { dur: 0.2, vol: 0.5, filter: { type: 'lowpass', freq: 380 } });
    tone(c, o, t, { f0: 130, f1: 60, dur: 0.16, vol: 0.3 });
    burst(c, o, t + 0.03, { dur: 0.12, vol: 0.07, filter: { type: 'bandpass', freq: 1800, q: 1.5 } });
  },
  // seeds trickling into the bed
  sow: (c, o, t) => { for (let i = 0; i < 4; i++) burst(c, o, t + i * 0.05 + rnd(0, 0.02), { dur: 0.03, vol: 0.12, filter: { type: 'highpass', freq: 4200 } }); },
  water: (c, o, t) => {
    burst(c, o, t, { dur: 0.75, vol: 0.26, attack: 0.12, filter: { type: 'bandpass', freq: 1400, to: 2600, q: 0.8 } });
    for (let i = 0; i < 4; i++) { const f = rnd(500, 900); tone(c, o, t + 0.15 + i * 0.12, { f0: f, f1: f * 1.8, dur: 0.06, vol: 0.05 }); }
  },
  sprinkle: (c, o, t) => { for (let i = 0; i < 6; i++) burst(c, o, t + i * 0.045, { dur: 0.04, vol: 0.08, filter: { type: 'highpass', freq: 2800 } }); },
  // a vegetable pulled out of the bed
  pick: (c, o, t) => {
    tone(c, o, t, { f0: 260, f1: 880, dur: 0.09, vol: 0.22 });
    tone(c, o, t + 0.06, { type: 'triangle', f0: hz(84), dur: 0.14, vol: 0.05 });
  },
  harvest: (c, o, t) => {
    burst(c, o, t, { dur: 0.22, vol: 0.1, filter: { type: 'bandpass', freq: 3200, q: 1 } });
    SFX.pick(c, o, t + 0.08);
  },
  hammer: (c, o, t) => {
    for (const d of [0, 0.26]) {
      burst(c, o, t + d, { dur: 0.06, vol: 0.4, filter: { type: 'bandpass', freq: 950, q: 3 } });
      tone(c, o, t + d, { f0: 230, f1: 170, dur: 0.07, vol: 0.18 });
    }
  },
  shoo: (c, o, t) => {
    burst(c, o, t, { dur: 0.35, vol: 0.35, attack: 0.05, filter: { type: 'bandpass', freq: 700, to: 2600, q: 1.2 } });
    caw(c, o, t + 0.25);
    caw(c, o, t + 0.5);
  },
  coin: (c, o, t) => {
    tone(c, o, t, { f0: hz(91), dur: 0.08, vol: 0.14 });
    tone(c, o, t + 0.07, { f0: hz(96), dur: 0.3, vol: 0.14 });
  },
  place: (c, o, t) => {
    tone(c, o, t, { f0: 170, f1: 80, dur: 0.13, vol: 0.32 });
    burst(c, o, t, { dur: 0.12, vol: 0.14, filter: { type: 'lowpass', freq: 650 } });
  },
  levelup: (c, o, t) => {
    [67, 72, 76, 79, 84].forEach((n, i) => tone(c, o, t + i * 0.09, { type: 'triangle', f0: hz(n), dur: i === 4 ? 0.7 : 0.18, vol: 0.12 }));
    SFX.sparkle(c, o, t + 0.45);
  },
  sparkle: (c, o, t) => { for (let i = 0; i < 6; i++) tone(c, o, t + i * 0.06, { f0: rnd(1800, 3600), dur: 0.12, vol: 0.07 }); },
  bark: (c, o, t) => {
    for (const d of [0, 0.2]) {
      tone(c, o, t + d, { type: 'square', f0: 420, f1: 240, dur: 0.09, vol: 0.22, filter: { type: 'bandpass', freq: 900, q: 1.5 } });
      burst(c, o, t + d, { dur: 0.06, vol: 0.15, filter: { type: 'bandpass', freq: 1200, q: 2 } });
    }
  },
  // farm animals
  moo: (c, o, t) => tone(c, o, t, { type: 'sawtooth', f0: 150, f1: 105, dur: 1.1, vol: 0.13, attack: 0.15, vibrato: { rate: 5, depth: 3 }, filter: { type: 'lowpass', freq: 700, q: 2 } }),
  cluck: (c, o, t) => cluck(c, o, t),
  honk: (c, o, t) => { cluck(c, o, t, 420); },
  baa: (c, o, t) => tone(c, o, t, { type: 'sawtooth', f0: 390, f1: 340, dur: 0.6, vol: 0.2, attack: 0.04, vibrato: { rate: 9, depth: 22 }, filter: { type: 'bandpass', freq: 1000, q: 1.5 } }),
  oink: (c, o, t) => { for (const d of [0, 0.18]) tone(c, o, t + d, { type: 'square', f0: 190, f1: 130, dur: 0.12, vol: 0.08, filter: { type: 'lowpass', freq: 650 } }); },
  neigh: (c, o, t) => tone(c, o, t, { type: 'sawtooth', f0: 900, f1: 380, dur: 0.75, vol: 0.18, attack: 0.05, vibrato: { rate: 13, depth: 40 }, filter: { type: 'bandpass', freq: 1500, q: 1.5 } }),
  buzz: (c, o, t) => tone(c, o, t, { type: 'sawtooth', f0: 225, f1: 240, dur: 0.6, vol: 0.1, attack: 0.08, vibrato: { rate: 30, depth: 8 }, filter: { type: 'lowpass', freq: 1300 } }),
  squeak: (c, o, t) => { for (const d of [0, 0.12]) tone(c, o, t + d, { f0: 2100, f1: 2700, dur: 0.07, vol: 0.1 }); },
  roar: (c, o, t) => {
    tone(c, o, t, { type: 'sawtooth', f0: 110, f1: 70, dur: 1.0, vol: 0.12, attack: 0.1, vibrato: { rate: 7, depth: 6 }, filter: { type: 'lowpass', freq: 500 } });
    burst(c, o, t, { dur: 0.9, vol: 0.12, attack: 0.1, filter: { type: 'lowpass', freq: 420 } });
  },
  tweet: (c, o, t) => { for (let i = 0; i < 3; i++) { const f = rnd(2400, 3800); tone(c, o, t + i * 0.09, { f0: f, f1: f * rnd(0.8, 1.3), dur: 0.07, vol: 0.09 }); } },
};

/** Which voice each animal has when you collect from it. */
export const ANIMAL_VOICE: Record<string, string> = {
  cow: 'moo', burenka: 'moo', chicken: 'cluck', turkey: 'cluck', goose: 'honk', swan: 'honk', sheep: 'baa', goat: 'baa',
  pig: 'oink', foal: 'neigh', horse: 'neigh', dapple: 'neigh', beehive: 'buzz', mouse: 'squeak', raccoon: 'squeak',
  lion: 'roar', parrot: 'tweet', peacock: 'tweet', ostrich: 'honk', turtle: 'pick',
};

/** The sound of a farmer's tool when the work starts. */
export const TOOL_SOUND: Record<string, string> = {
  shovel: 'dig', seeds: 'sow', water: 'water', fertilizer: 'sprinkle', basket: 'pick', shoo: 'shoo', hammer: 'hammer',
};

/** Resolve a game sound name ('animal:cow', 'dig', …) to an effect. */
export function sfxFor(name: string): Sfx | undefined {
  if (name.startsWith('animal:')) return SFX[ANIMAL_VOICE[name.slice(7)] ?? 'pick'];
  return SFX[name];
}

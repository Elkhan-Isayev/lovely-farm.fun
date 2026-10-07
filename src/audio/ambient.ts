// The sound of the farm around you: a soft breeze, birds now and then, distant animals.
import { SFX } from './sfx';
import { noise } from './synth';

export class Ambient {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private wind: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;
  private running = false;

  constructor(private ctx: BaseAudioContext, private out: AudioNode, private random: () => number = Math.random) {}

  get playing() { return this.running; }

  start() {
    if (this.running) return;
    this.running = true;
    const c = this.ctx;
    // breeze: looping noise, low-passed, its volume slowly breathing
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.05;
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g).connect(this.out);
    src.start();
    lfo.start();
    this.wind = src;
    this.lfo = lfo;
    this.later('birds', 1.5, 6);
    this.later('animals', 15, 40);
  }

  stop() {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.wind?.stop();
    this.lfo?.stop();
    this.wind = this.lfo = null;
  }

  /** Schedule the next bird song or distant animal call after a random pause. */
  private later(kind: 'birds' | 'animals', min: number, max: number) {
    const wait = (min + this.random() * (max - min)) * 1000;
    this.timers.push(setTimeout(() => {
      if (!this.running) return;
      this.call(kind);
      this.later(kind, min, max);
    }, wait));
  }

  call(kind: 'birds' | 'animals') {
    const c = this.ctx;
    // far away: quieter and muffled
    const far = c.createGain();
    far.gain.value = kind === 'birds' ? 0.7 : 0.35;
    const muffle = c.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = kind === 'birds' ? 9000 : 1800;
    far.connect(muffle).connect(this.out);
    const voices = kind === 'birds' ? ['tweet', 'tweet', 'tweet'] : ['moo', 'cluck', 'baa', 'neigh'];
    SFX[voices[Math.floor(this.random() * voices.length)]](c, far, c.currentTime + 0.05);
  }
}

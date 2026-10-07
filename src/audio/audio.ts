// The game's sound: background music (recorded tracks), the farm's ambience and action effects
// (synthesised), each switchable. Browsers only allow audio after a user gesture, so nothing starts before unlock().
import { Ambient } from './ambient';
import { Music } from './music';
import { sfxFor } from './sfx';

export interface SoundSettings { music: boolean; sfx: boolean }

const KEY = 'lovely-farm-sound';
const VOLUME = { ambient: 0.6, sfx: 0.9 };

function defaultContext(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  return Ctor ? new Ctor() : null;
}

export class GameAudio {
  ctx: AudioContext | null = null;
  settings: SoundSettings;
  ambient: Ambient | null = null;
  private unlocked = false;
  private sfxBus: GainNode | null = null;
  private last = new Map<string, number>();

  constructor(private makeContext: () => AudioContext | null = defaultContext, readonly music: Music = new Music()) {
    this.settings = { music: true, sfx: true };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoundSettings> | null;
      if (saved) this.settings = { music: saved.music !== false, sfx: saved.sfx !== false };
    } catch { /* keep the defaults */ }
  }

  /** Call from a click or key press: creates the audio context and starts what is switched on. */
  unlock() {
    this.unlocked = true;
    if (!this.ctx) {
      this.ctx = this.makeContext();
      if (this.ctx) {
        const bus = (v: number) => { const g = this.ctx!.createGain(); g.gain.value = v; g.connect(this.ctx!.destination); return g; };
        this.ambient = new Ambient(this.ctx, bus(VOLUME.ambient));
        this.sfxBus = bus(VOLUME.sfx);
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.apply();
  }

  /** Start or stop the music and the ambience to match the settings. */
  apply() {
    if (!this.unlocked) return;
    if (this.settings.music) this.music.start(); else this.music.stop();
    if (this.settings.sfx) this.ambient?.start(); else this.ambient?.stop();
  }

  set(which: keyof SoundSettings, on: boolean) {
    this.settings[which] = on;
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
    this.apply();
  }

  /** Play an effect by name ('dig', 'coin', 'animal:cow', …). Repeats within 60 ms are dropped. */
  play(name: string) {
    if (!this.ctx || !this.sfxBus || !this.settings.sfx) return;
    const fx = sfxFor(name);
    if (!fx) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.06) return;
    this.last.set(name, now);
    fx(this.ctx, this.sfxBus, now + 0.01);
  }

  /** Pause everything while the tab is hidden. */
  pause(hidden: boolean) {
    if (hidden) this.music.stop();
    else this.apply();
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }
}

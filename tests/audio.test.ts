// Sound: synthesised effects, the country music sequencer, the farm ambience and the settings.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANIMALS } from '../src/data/items';
import { Ambient } from '../src/audio/ambient';
import { GameAudio } from '../src/audio/audio';
import { MUSIC_TRACKS, Music, type Track } from '../src/audio/music';
import { ANIMAL_VOICE, SFX, TOOL_SOUND, sfxFor } from '../src/audio/sfx';
import { hz, noise, tone } from '../src/audio/synth';
import { FakeAudioContext } from './helpers';

const fake = () => new FakeAudioContext();
const asCtx = (c: FakeAudioContext) => c as unknown as AudioContext;

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('synth', () => {
  it('notes and noise', () => {
    const c = fake();
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBeCloseTo(880);
    expect(noise(asCtx(c))).toBe(noise(asCtx(c)));
    tone(asCtx(c), c.destination as unknown as AudioNode, 0, { f0: 300, dur: 0.5, vol: 0.1, sustain: true, vibrato: { rate: 5, depth: 3 }, filter: { type: 'lowpass', freq: 900 } });
    expect(c.started).toContain('osc');
  });
});

describe('effects', () => {
  it.each(Object.keys(SFX))('%s plays', (name) => {
    const c = fake();
    SFX[name](asCtx(c), c.destination as unknown as AudioNode, 0);
    expect(c.started.length).toBeGreaterThan(0);
  });

  it('every animal has a voice and every tool a sound', () => {
    for (const a of ANIMALS) expect(sfxFor('animal:' + a.id)).toBe(SFX[ANIMAL_VOICE[a.id]]);
    expect(sfxFor('animal:dragon')).toBe(SFX.pick);
    expect(sfxFor('nope')).toBeUndefined();
    for (const tool of ['shovel', 'seeds', 'water', 'fertilizer', 'basket', 'shoo', 'hammer']) expect(SFX[TOOL_SOUND[tool]]).toBeDefined();
  });
});

/** A fake <audio> element. */
class FakeTrack implements Track {
  volume = 1;
  paused = true;
  private fns: Record<string, (() => void)[]> = {};
  constructor(public src: string, private refuse = false) {}
  play = vi.fn(async () => { if (this.refuse) throw new Error('autoplay'); this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  addEventListener(ev: string, fn: () => void) { (this.fns[ev] ??= []).push(fn); }
  emit(ev: string) { this.fns[ev]?.forEach((f) => f()); }
}

function player(tracks = ['a.mp3', 'b.mp3', 'c.mp3'], refuse = false) {
  const made: FakeTrack[] = [];
  const m = new Music(tracks, 0.3, (src) => { const t = new FakeTrack(src, refuse); made.push(t); return t; }, () => 0);
  return { m, made };
}

describe('music player', () => {
  it('the recorded tracks exist in public/audio', async () => {
    const { existsSync } = await import('node:fs');
    for (const f of MUSIC_TRACKS) expect(existsSync(`public/audio/${f}`)).toBe(true);
  });

  it('plays a shuffled round of tracks, one after another, and loops', () => {
    const { m, made } = player();
    expect(m.available).toBe(true);
    m.start();
    m.start(); // already playing
    expect(made).toHaveLength(1);
    expect(made[0].volume).toBe(0.3);
    expect(m.playing).toBe(true);
    const seen = [m.track];
    for (let i = 0; i < 5; i++) { made.at(-1)!.emit('ended'); seen.push(m.track); }
    expect(new Set(seen.slice(0, 3)).size).toBe(3); // every track once per round
    expect(seen[3]).toMatch(/^\/audio\/[abc]\.mp3$/);
    made[0].emit('ended'); // a stale track's event is ignored
    expect(made).toHaveLength(6);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]); // never the same track twice in a row
  });

  it('stops and resumes the same track; skips broken files', () => {
    const { m, made } = player();
    m.start();
    m.stop();
    expect(made[0].pause).toHaveBeenCalled();
    expect(m.playing).toBe(false);
    m.next(); // not wanted: nothing
    expect(made).toHaveLength(1);
    m.start();
    expect(made[0].play).toHaveBeenCalledTimes(2);
    made[0].emit('error');
    expect(made).toHaveLength(2);
    const one = player(['only.mp3']);
    one.m.start();
    one.made[0].emit('error'); // nothing else to try
    expect(one.made).toHaveLength(1);
  });

  it('autoplay refusal is harmless; no tracks means no music', async () => {
    const { m } = player(['a.mp3'], true);
    m.start();
    await Promise.resolve();
    const none = new Music([]);
    none.start();
    expect(none.available || none.playing).toBe(false);
    expect(none.track).toBe('');
    expect(m.track).toBe('/audio/a.mp3');
  });
});

describe('farm ambience', () => {
  it('a breeze plus birds and animals at random moments', () => {
    vi.useFakeTimers();
    const c = fake();
    const a = new Ambient(asCtx(c), c.destination as unknown as AudioNode, () => 0.5);
    a.start();
    a.start();
    expect(a.playing).toBe(true);
    const before = c.started.length;
    vi.advanceTimersByTime(60_000);
    expect(c.started.length).toBeGreaterThan(before + 10);
    a.call('animals');
    a.stop();
    expect(a.playing).toBe(false);
    const after = c.started.length;
    vi.advanceTimersByTime(60_000);
    expect(c.started.length).toBe(after);
  });
});

describe('GameAudio', () => {
  it('does nothing without Web Audio', () => {
    const { m, made } = player(['a.mp3']);
    const a = new GameAudio(() => null, m);
    a.apply(); // before a gesture: nothing
    expect(made).toHaveLength(0);
    a.unlock();
    a.play('dig');
    expect(m.playing).toBe(true); // music needs no Web Audio
    a.pause(true);
    expect(m.playing).toBe(false);
    a.pause(false);
    expect(m.playing).toBe(true);
    expect(a.ctx).toBeNull();
    expect(new GameAudio().ctx).toBeNull(); // happy-dom has no AudioContext
    new GameAudio().unlock();
  });

  it('starts after a gesture, plays effects once per 60 ms, remembers the switches', () => {
    vi.useFakeTimers();
    const c = fake();
    const a = new GameAudio(() => asCtx(c), player(['a.mp3']).m);
    expect(a.settings).toEqual({ music: true, sfx: true });
    a.unlock();
    expect(c.resume).toHaveBeenCalled();
    expect(a.music.playing && a.ambient!.playing).toBe(true);
    const n = c.started.length;
    a.play('dig');
    expect(c.started.length).toBeGreaterThan(n);
    const m = c.started.length;
    a.play('dig'); // same instant: dropped
    a.play('nope');
    expect(c.started.length).toBe(m);
    c.currentTime = 1;
    a.play('animal:cow');
    expect(c.started.length).toBeGreaterThan(m);

    a.set('music', false);
    a.set('sfx', false);
    expect(a.music.playing || a.ambient!.playing).toBe(false);
    const k = c.started.length;
    c.currentTime = 2;
    a.play('dig');
    expect(c.started.length).toBe(k);
    expect(JSON.parse(localStorage.getItem('lovely-farm-sound')!)).toEqual({ music: false, sfx: false });
    expect(new GameAudio(() => null).settings).toEqual({ music: false, sfx: false });

    a.pause(true);
    expect(c.suspend).toHaveBeenCalled();
    a.pause(false);
    a.unlock(); // a second gesture reuses the running context
    expect(c.resume).toHaveBeenCalledTimes(2);
  });

  it('broken saved settings fall back to everything on', () => {
    localStorage.setItem('lovely-farm-sound', '{oops');
    expect(new GameAudio(() => null).settings).toEqual({ music: true, sfx: true });
  });
});

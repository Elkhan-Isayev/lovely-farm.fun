// Shared fixtures for UI tests: game, renderer, controller and a fake API.
import { vi } from 'vitest';
import { Game } from '../src/core/game';
import { newState, type GameState } from '../src/core/state';
import type { Api } from '../src/net/api';
import { Renderer } from '../src/render/renderer';
import { Controller } from '../src/ui/controller';
import type { AppCtx } from '../src/ui/ctx';

export function fakeApi(over: Partial<Record<keyof Api, unknown>> = {}) {
  const api = {
    register: vi.fn(async () => ({ ok: true })),
    login: vi.fn(async () => ({ ok: true })),
    logout: vi.fn(async () => ({ ok: true })),
    me: vi.fn(async () => ({ user: { id: 1, login: 'me', name: 'Me', level: 1, face: '👩‍🌾' }, farm: null, events: [] })),
    save: vi.fn(async () => ({ rev: 1, events: [] })),
    events: vi.fn(async () => ({ events: [] })),
    friends: vi.fn(async () => ({ friends: [], incoming: [], outgoing: [] })),
    search: vi.fn(async () => ({ users: [] })),
    request: vi.fn(async () => ({ ok: true, status: 'pending' })),
    accept: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    farm: vi.fn(),
    help: vi.fn(async () => ({ ok: true, left: 4 })),
    gift: vi.fn(async () => ({ ok: true })),
    ...over,
  };
  return api as unknown as Api & Record<keyof Api, ReturnType<typeof vi.fn>>;
}

export function makeCtx(mod?: (s: GameState) => void, withApi = true) {
  const s = newState();
  s.gold = 100_000;
  s.cellar = {};
  s.plots = {};
  s.objects = [];
  mod?.(s);
  const game = new Game(s);
  const renderer = new Renderer(document.getElementById('world') as HTMLCanvasElement, game);
  renderer.resize(1000, 700, 1);
  const api = fakeApi();
  const ctx: AppCtx = {
    game,
    api: withApi ? api : null,
    user: { id: 1, login: 'me', name: 'Me', level: 1, face: '👩‍🌾' },
    incoming: [],
    outgoing: [],
    dev: true,
    ctrl: null as unknown as Controller,
    refreshFriends: vi.fn(async () => {}),
    visitFriend: vi.fn(async () => {}),
    visitNpc: vi.fn(),
    visitShowcase: vi.fn(),
    goHome: vi.fn(),
    logout: vi.fn(),
  };
  ctx.ctrl = new Controller(game, renderer, { openBuilding: vi.fn(), openPet: vi.fn(), openHouse: vi.fn(), openSeeds: vi.fn() });
  return { ctx, game, api, renderer };
}

export const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll(sel)] as T[];
export const clickEl = (el: Element | null) => { if (!el) throw new Error('element not found'); (el as HTMLElement).click(); };
export const flush = () => new Promise((r) => setTimeout(r, 0));

/** A Web Audio context that records what is played (happy-dom has no audio). */
export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state: 'running' | 'suspended' = 'suspended';
  destination = fakeNode(this);
  started: string[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  createGain() { return fakeNode(this, 'gain'); }
  createOscillator() { return fakeNode(this, 'osc'); }
  createBiquadFilter() { return fakeNode(this, 'filter'); }
  createBufferSource() { return fakeNode(this, 'buffer'); }
  createDynamicsCompressor() { return { ...fakeNode(this, 'compressor'), threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() }; }
  createBuffer(_ch: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { length, sampleRate, getChannelData: () => data };
  }
}

function fakeParam() {
  return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
}

function fakeNode(ctx: FakeAudioContext, kind = 'node') {
  const node: Record<string, unknown> = {
    kind, gain: fakeParam(), frequency: fakeParam(), Q: fakeParam(), type: '', buffer: null, loop: false,
    connect: (n: unknown) => n,
    start: () => ctx.started.push(kind),
    stop: vi.fn(),
  };
  return node;
}

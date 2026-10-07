// Farm sync with the server: periodic saving and the inbox of events from friends.
import { levelFromExp } from '../core/levels';
import type { Game } from '../core/game';
import { ApiError, type Api } from './api';

export class Sync {
  rev: number;
  dirty = false;
  saving: Promise<void> | null = null;
  stopped = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  onConflict: () => void = () => {};
  onError: (e: unknown) => void = () => {};
  game: Game;
  api: Api;
  face: () => string;

  constructor(game: Game, api: Api, rev: number, face: () => string) {
    this.game = game;
    this.api = api;
    this.rev = rev;
    this.face = face;
    game.on('change', () => { this.dirty = true; });
  }

  start(saveEvery = 15_000, pollEvery = 60_000) {
    this.timers.push(setInterval(() => { if (this.dirty) void this.flush(); }, saveEvery));
    this.timers.push(setInterval(() => void this.poll(), pollEvery));
  }
  stop() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  /** Save now; concurrent calls share one request. */
  flush(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.saving) return this.saving;
    this.dirty = false;
    const ack = [...this.game.appliedEvents];
    const s = this.game.s;
    this.saving = this.api
      .save(s, this.rev, ack, levelFromExp(s.exp), this.face())
      .then((res) => {
        this.rev = res.rev;
        this.game.appliedEvents = this.game.appliedEvents.filter((id) => !ack.includes(id));
        this.game.applyEvents(res.events);
      })
      .catch((e) => {
        this.dirty = true;
        if (e instanceof ApiError && e.status === 409) { this.stop(); this.onConflict(); }
        else this.onError(e);
      })
      .finally(() => { this.saving = null; });
    return this.saving;
  }

  async poll() {
    if (this.stopped) return;
    try {
      const { events } = await this.api.events();
      this.game.applyEvents(events);
    } catch (e) {
      this.onError(e);
    }
  }
}

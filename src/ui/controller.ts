// Tools and clicks on the field: turns the player's intent into tasks for the farmer.
import { DIG_COST, cropById, placeInfo } from '../data/items';
import type { Game } from '../core/game';
import { t } from '../i18n';
import { key, type FarmObject } from '../core/state';
import type { Renderer } from '../render/renderer';
import type { Task } from '../render/farmer';

export type ToolId = 'hand' | 'shovel' | 'seed' | 'water' | 'fertilize' | 'place' | 'move' | 'store';

export interface Callbacks {
  openBuilding(o: FarmObject): void;
  openPet(): void;
  openHouse(): void;
  openSeeds(): void;
}

export class Controller {
  tool: ToolId = 'hand';
  seed = 'radish';
  placing: { key: string; fromStorage: boolean } | null = null;
  moving: FarmObject | null = null;
  private listeners: (() => void)[] = [];
  game: Game;
  r: Renderer;
  cb: Callbacks;

  constructor(game: Game, r: Renderer, cb: Callbacks) {
    this.game = game;
    this.r = r;
    this.cb = cb;
  }

  onChange(fn: () => void) { this.listeners.push(fn); }
  private changed() { this.r.showGrid = this.tool !== 'hand'; this.listeners.forEach((f) => f()); }

  setTool(t: ToolId) {
    this.tool = t;
    if (t !== 'place') this.placing = null;
    if (t !== 'move') this.moving = null;
    this.r.ghost = null;
    this.changed();
  }
  setSeed(cropId: string) {
    this.seed = cropId;
    this.setTool('seed');
  }
  startPlacing(k: string, fromStorage: boolean) {
    this.placing = { key: k, fromStorage };
    this.tool = 'place';
    this.moving = null;
    this.changed();
  }
  cancel() { this.setTool('hand'); }

  /** Hover: highlight the cell and show a "ghost" of the object being placed. */
  hover(sx: number, sy: number) {
    const c = this.r.cellAt(sx, sy);
    this.r.hover = c;
    const k = this.placing?.key ?? this.moving?.key;
    if (k) {
      const info = placeInfo(k);
      const x = c.x - Math.floor((info.w - 1) / 2), y = c.y - Math.floor((info.h - 1) / 2);
      this.r.ghost = { key: k, x, y, w: info.w, h: info.h, valid: !this.game.visit && this.game.isFree(x, y, info.w, info.h, this.moving?.id) };
    } else this.r.ghost = null;
  }

  private queue(x: number, y: number, tool: Task['tool'], run: () => void, cancel?: () => void) {
    const k = key(x, y);
    if (this.game.pending.has(k)) return false;
    this.game.pending.add(k);
    this.r.farmer.add({
      x, y, tool, key: k,
      run: () => { this.game.pending.delete(k); run(); this.game.changed(); },
      cancel: () => { this.game.pending.delete(k); cancel?.(); },
    });
    return true;
  }

  click(sx: number, sy: number) {
    const g = this.game;
    const { x, y } = this.r.cellAt(sx, sy);
    const picked = this.r.pick(sx, sy);

    if (g.visit) {
      const kind = g.helpKind(x, y);
      if (!kind) return;
      if (g.helpLeft() <= 0) { g.toast(t('g.helpLimit')); return; }
      this.queue(x, y, kind === 'chase' ? 'shoo' : 'water', () => { void g.doHelp(x, y); });
      return;
    }

    switch (this.tool) {
      case 'place': return this.clickPlace();
      case 'move': return this.clickMove(picked);
      case 'store':
        if (picked && typeof picked === 'object') g.toStorage(picked);
        return;
    }

    if (picked === 'pet') return this.cb.openPet();
    if (picked === 'house' && this.tool === 'hand') return this.cb.openHouse();

    const p = g.plot(x, y);
    const obj = picked && typeof picked === 'object' ? picked : g.objectAt(x, y);
    // the farmer is already heading here: a second click must neither charge nor queue a task
    if (!obj && g.pending.has(key(x, y))) return;

    switch (this.tool) {
      case 'hand': {
        if (obj) {
          if (obj.key.startsWith('building:')) return this.cb.openBuilding(obj);
          if (g.objectReady(obj)) {
            const k = key(obj.x, obj.y);
            if (!g.pending.has(k)) this.queue(obj.x, obj.y, 'basket', () => g.doHarvestObject(obj));
          }
          return;
        }
        if (!p) return;
        if (p.pest) { this.queue(x, y, 'shoo', () => g.doChase(x, y)); return; }
        if (g.isRipe(p)) { this.queue(x, y, 'basket', () => g.doHarvestPlot(x, y)); return; }
        if (p.state === 'growing' && !p.watered) { this.queue(x, y, 'water', () => g.doWater(x, y)); return; }
        if (p.state === 'soil') { this.cb.openSeeds(); return; }
        if (p.state === 'withered') { this.digOrClear(x, y); return; }
        return;
      }
      case 'shovel': return this.digOrClear(x, y);
      case 'seed': {
        const why = g.canPlant(x, y, this.seed);
        if (why) {
          // on untouched grass, dig and plant in one go so the player needn't switch tools
          if (!p && !obj && g.inBounds(x, y) && g.canDig(x, y) === null && g.s.gold >= DIG_COST + cropById[this.seed].cost) {
            this.digOrClear(x, y);
            this.plantLater(x, y);
            return;
          }
          g.toast(why);
          return;
        }
        const c = cropById[this.seed];
        g.s.gold -= c.cost;
        g.float(x, y, `-${c.cost}`, '#ffb3a0', '🪙');
        this.queue(x, y, 'seeds', () => g.doPlant(x, y, c.id), () => { g.s.gold += c.cost; });
        g.changed();
        return;
      }
      case 'water':
        // chase the pest first: the plant doesn't grow while it sits there anyway
        if (p?.pest) this.queue(x, y, 'shoo', () => g.doChase(x, y));
        else if (p?.state === 'growing' && !p.watered) this.queue(x, y, 'water', () => g.doWater(x, y));
        return;
      case 'fertilize':
        if (p?.state === 'growing' && p.watered && !p.fertilized && !g.isRipe(p)) this.queue(x, y, 'fertilizer', () => g.doFertilize(x, y));
        else if (p?.state === 'growing' && !p.watered) g.toast(t('g.waterFirst'));
        return;
    }
  }

  /** Plant into the cell the farmer is digging right now. */
  private plantLater(x: number, y: number) {
    const g = this.game;
    const c = cropById[this.seed];
    g.s.gold -= c.cost;
    const k = key(x, y);
    this.r.farmer.add({
      x, y, tool: 'seeds', key: k,
      run: () => { g.doPlant(x, y, c.id); g.changed(); },
      cancel: () => { g.s.gold += c.cost; },
    });
  }

  private digOrClear(x: number, y: number) {
    const g = this.game;
    const p = g.plot(x, y);
    if (p?.state === 'withered') { this.queue(x, y, 'shovel', () => g.doClear(x, y)); return; }
    const why = g.canDig(x, y);
    if (why) { g.toast(why); return; }
    g.s.gold -= DIG_COST;
    g.float(x, y, `-${DIG_COST}`, '#ffb3a0', '🪙');
    this.queue(x, y, 'shovel', () => g.doDig(x, y), () => { g.s.gold += DIG_COST; });
    g.changed();
  }

  private clickPlace() {
    const gh = this.r.ghost;
    if (!this.placing || !gh) return;
    const ok = this.game.place(this.placing.key, gh.x, gh.y, this.placing.fromStorage);
    if (!ok) return;
    // from storage: keep placing while items remain; from the shop: while money lasts (except buildings)
    if (this.placing.fromStorage && !this.game.s.storage[this.placing.key]) this.cancel();
    else if (this.placing.key.startsWith('building:')) this.cancel();
    else this.hoverAgain();
  }

  private clickMove(picked: ReturnType<Renderer['pick']>) {
    if (!this.moving) {
      if (picked && typeof picked === 'object') { this.moving = picked; this.changed(); }
      return;
    }
    const gh = this.r.ghost;
    if (gh && this.game.move(this.moving, gh.x, gh.y)) { this.moving = null; this.r.ghost = null; this.changed(); }
  }

  private hoverAgain() { this.changed(); }
}

import { animalById, buildingById, cropById, decorById, placeInfo, treeById, type BuildingId } from '../data/items';
import type { Game } from '../core/game';
import { HOUR, unkey, type FarmObject, type Look, type Plot } from '../core/state';
import { Farmer } from './farmer';
import { TH, TW, cellCenter, diamond, iso, unIso } from './iso';
import { art, artFit } from './art';
import { artSprite, buildingSprite, cropSprite, drawSprite, emojiSprite, houseSprite, shade, treeSprite } from './sprites';

export interface FloatText { x: number; y: number; text: string; color: string; icon?: string; t0: number }
export interface Ghost { key: string; x: number; y: number; w: number; h: number; valid: boolean }
interface Hit { x0: number; y0: number; x1: number; y1: number; obj: FarmObject | 'pet' | 'house' }

/** What we draw: the player's own farm or a neighbour's. */
export interface FarmView {
  own: boolean;
  size: number;
  plots: Record<string, Plot>;
  objects: FarmObject[];
  look: Look;
  petHappy: boolean;
  now: number;
}

export const PET_POS = { x: -1.4, y: 1.3 };

export function plotStage(p: Plot): number {
  if (!p.crop || p.state === 'soil') return -1;
  if (p.state === 'withered') return p.growth === -1 ? 5 : 4;
  const f = p.growth / (cropById[p.crop].hours * HOUR);
  return f < 0.12 ? 0 : f < 0.5 ? 1 : f < 1 ? 2 : 3;
}

export function isReady(o: FarmObject, now: number): boolean {
  if (o.key.startsWith('building:')) {
    if ((o.jobs ?? []).some((j) => j.endsAt <= now)) return true;
    return (o.slots ?? []).some((s) => s.crop && s.plantedAt + cropById[s.crop].hours * HOUR <= now);
  }
  return o.readyAt !== undefined && o.readyAt <= now;
}

/** Icon above an object that is ready. */
export function readyIcon(o: FarmObject): string {
  const { kind, id } = placeInfo(o.key);
  if (kind === 'animal') return animalById[id].productEmoji;
  if (kind === 'tree') return treeById[id].emoji ?? '🧺';
  return '✅';
}

/** Where the sails' hub is on the painted mill, as fractions of the picture. */
export const MILL_HUB = { x: 0.6, y: 0.31 };

const HORIZON = -470; // world y of the horizon line
const CAM_MARGIN = 160; // how far past the farm's edge the camera centre may go, world px
const HOUSE_TOP = 300; // the house rises this far above the farm's top corner

/**
 * Pattern transform that lays a square texture flat on the isometric ground:
 * one tile covers `cells`×`cells` cells, starting at the corner of cell (0, 0).
 */
export function groundMatrix(texSize: number, cells: number) {
  const s = (cells * TW) / 2 / texSize;
  return { a: s, b: s / 2, c: -s, d: s / 2, e: 0, f: 0 };
}

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam = { x: 0, y: 160, zoom: 1 };
  w = 0;
  h = 0;
  dpr = 1;
  hover: { x: number; y: number } | null = null;
  ghost: Ghost | null = null;
  showGrid = false;
  floats: FloatText[] = [];
  farmer: Farmer;
  private hits: Hit[] = [];
  private patterns = new Map<string, CanvasPattern | null>();
  private canvas: HTMLCanvasElement;
  private game: Game;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.game = game;
    this.farmer = new Farmer(game.s.charPos.x, game.s.charPos.y);
    game.on('float', (f) => this.addFloat(f.x, f.y, f.text, f.color ?? '#fff', f.icon));
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  centerOn(size: number) {
    const c = iso(size / 2, size / 2);
    this.cam.x = c.x;
    this.cam.y = c.y - 40;
    const fit = Math.min(this.w / ((size + 6) * TW), this.h / ((size + 10) * TH));
    this.cam.zoom = clamp(fit, 0.45, 1.3);
  }

  /* ---------- coordinates ---------- */

  toWorld(sx: number, sy: number) {
    return { x: (sx - this.w / 2) / this.cam.zoom + this.cam.x, y: (sy - this.h / 2) / this.cam.zoom + this.cam.y };
  }
  toScreen(wx: number, wy: number) {
    return { x: (wx - this.cam.x) * this.cam.zoom + this.w / 2, y: (wy - this.cam.y) * this.cam.zoom + this.h / 2 };
  }
  cellAt(sx: number, sy: number) {
    const w = this.toWorld(sx, sy);
    const c = unIso(w.x, w.y);
    return { x: Math.floor(c.x), y: Math.floor(c.y) };
  }
  pick(sx: number, sy: number): FarmObject | 'pet' | 'house' | null {
    const w = this.toWorld(sx, sy);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (w.x >= h.x0 && w.x <= h.x1 && w.y >= h.y0 && w.y <= h.y1) return h.obj;
    }
    return null;
  }
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * factor, 0.35, 2.2);
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }
  pan(dx: number, dy: number) {
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.clampCam();
  }

  /** Keep the farm on screen: the camera centre stays over the farm (plus the house) with a small margin. */
  clampCam() {
    const size = this.view().size;
    const half = (size * TW) / 2;
    this.cam.x = clamp(this.cam.x, -half - CAM_MARGIN, half + CAM_MARGIN);
    this.cam.y = clamp(this.cam.y, -HOUSE_TOP, size * TH + CAM_MARGIN);
  }

  addFloat(x: number, y: number, text: string, color: string, icon?: string) {
    // stagger floating labels that start in the same cell
    const same = this.floats.filter((f) => Math.abs(f.x - x) < 0.5 && Math.abs(f.y - y) < 0.5 && performance.now() - f.t0 < 400).length;
    this.floats.push({ x, y, text, color, icon, t0: performance.now() + same * 180 });
  }

  /** Build the view model from the game state. */
  view(): FarmView {
    const g = this.game;
    if (g.visit) {
      return { own: false, size: g.visit.farm.size, plots: g.visit.farm.plots, objects: g.visit.farm.objects, look: g.s.look, petHappy: true, now: Date.now() };
    }
    return { own: true, size: g.s.size, plots: g.s.plots, objects: g.s.objects, look: g.s.look, petHappy: g.petHappy(), now: g.now() };
  }

  /* ---------- frame ---------- */

  render(time: number, dt: number) {
    const ctx = this.ctx;
    const v = this.view();
    this.farmer.update(dt);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(ctx);
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawScenery(ctx, v);
    this.drawGround(ctx, v);

    // objects sorted by depth
    const items: { d: number; draw: () => void }[] = [];
    this.hits = [];
    items.push({ d: -6, draw: () => this.drawHouse(ctx) });
    items.push({ d: PET_POS.x + PET_POS.y, draw: () => this.drawPet(ctx, v, time) });
    for (const [k, p] of Object.entries(v.plots)) {
      const [x, y] = unkey(k);
      if (x >= v.size || y >= v.size) continue;
      items.push({ d: x + y + 0.95, draw: () => this.drawPlot(ctx, x, y, p, v, time) });
    }
    for (const o of v.objects) items.push({ d: o.x + o.w + o.y + o.h - 1, draw: () => this.drawObject(ctx, o, v, time) });
    if (this.ghost) {
      const gh = this.ghost;
      items.push({ d: gh.x + gh.w + gh.y + gh.h - 1 + 0.01, draw: () => this.drawGhost(ctx, gh) });
    }
    items.push({ d: this.farmer.depth(), draw: () => this.farmer.draw(ctx, v.look, time) });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw();

    this.drawPending(ctx, time);
    this.drawFloats(ctx);
    ctx.restore();
  }

  /** A painted texture as a pattern lying on the ground, or null while it isn't loaded. */
  private ground(ctx: CanvasRenderingContext2D, id: string, cells: number): CanvasPattern | null {
    const img = art(id);
    if (!img) return null;
    let p = this.patterns.get(id);
    if (p === undefined) {
      p = ctx.createPattern(img, 'repeat');
      p?.setTransform?.(groundMatrix(img.width, cells));
      this.patterns.set(id, p);
    }
    return p;
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    const horizon = this.toScreen(0, HORIZON).y;
    const backdrop = art('backdrop');
    if (backdrop) {
      // painted sky and hills; its meadow starts at 57 % of the height and sits on the horizon line
      const k = Math.max(this.w / backdrop.width, 0.75 * clamp(this.cam.zoom, 0.8, 1.25));
      const dw = backdrop.width * k, dh = backdrop.height * k;
      const dy = horizon - dh * 0.57;
      const slack = (dw - this.w) / 2;
      const dx = -slack - clamp(this.cam.x * this.cam.zoom * 0.05, -slack, slack); // slight parallax
      ctx.fillStyle = '#3f9ae6';
      ctx.fillRect(0, 0, this.w, Math.max(0, dy + 2));
      ctx.drawImage(backdrop, dx, dy, dw, dh);
      ctx.fillStyle = '#86cf3a';
      ctx.fillRect(0, dy + dh - 1, this.w, Math.max(0, this.h - dy - dh + 1));
      return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, '#5fb7f0');
    sky.addColorStop(1, '#cfeefc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, Math.max(0, horizon));
    const grass = ctx.createLinearGradient(0, Math.max(0, horizon), 0, this.h);
    grass.addColorStop(0, '#9ccf3c');
    grass.addColorStop(1, '#6aae22');
    ctx.fillStyle = grass;
    ctx.fillRect(0, Math.max(0, horizon), this.w, this.h);
  }

  private drawScenery(ctx: CanvasRenderingContext2D, v: FarmView) {
    const grass = this.ground(ctx, 'tex-grass', 4);
    if (grass) {
      // the meadow: textured grass from just below the painted horizon, fading in over the hills' foot
      ctx.fillStyle = grass;
      ctx.fillRect(-6000, HORIZON + 40, 12000, 9000);
      const fade = ctx.createLinearGradient(0, HORIZON + 40, 0, HORIZON + 200);
      fade.addColorStop(0, 'rgba(134,207,58,1)');
      fade.addColorStop(1, 'rgba(134,207,58,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(-6000, HORIZON + 39, 12000, 162);
    }
    if (!art('backdrop')) this.drawForest(ctx);
    this.drawTufts(ctx, v);
  }

  private drawForest(ctx: CanvasRenderingContext2D) {
    // forest on the horizon, like on the original's screenshot
    ctx.fillStyle = '#7fa6c8';
    ctx.beginPath();
    ctx.moveTo(-4000, -470);
    for (let x = -4000; x <= 4000; x += 14) ctx.lineTo(x, -470 - 12 - hash(x, 1) * 16 - (x % 28 === 0 ? 8 : 0));
    ctx.lineTo(4000, -470);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a7c6de';
    ctx.fillRect(-4000, -472, 8000, 3);
  }

  private drawTufts(ctx: CanvasRenderingContext2D, v: FarmView) {
    // grass tufts and little flowers around the farm
    for (let i = 0; i < 260; i++) {
      const gx = Math.floor(hash(i, 7) * (v.size + 24)) - 12;
      const gy = Math.floor(hash(i, 11) * (v.size + 24)) - 12;
      if (gx >= -1 && gy >= -1 && gx <= v.size && gy <= v.size) continue;
      const p = iso(gx + hash(i, 3), gy + hash(i, 5));
      if (p.y < -440) continue;
      ctx.strokeStyle = i % 3 ? '#5f9e22' : '#80c040';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const dx of [-3, 0, 3]) { ctx.moveTo(p.x + dx, p.y); ctx.lineTo(p.x + dx * 1.6, p.y - 6 - Math.abs(dx)); }
      ctx.stroke();
      if (i % 9 === 0) {
        ctx.fillStyle = ['#fff', '#ffd23a', '#ff7aa8'][i % 3];
        ctx.beginPath();
        ctx.arc(p.x, p.y - 7, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, v: FarmView) {
    const grass = this.ground(ctx, 'tex-grass', 4);
    const soil = this.ground(ctx, 'tex-soil', 1);
    // farm border
    diamond(ctx, -0.12, -0.12, v.size + 0.24, v.size + 0.24);
    if (grass) {
      ctx.fillStyle = 'rgba(40,90,10,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,80,20,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#5f9a2a';
      ctx.fill();
    }
    for (let x = 0; x < v.size; x++) {
      for (let y = 0; y < v.size; y++) {
        const p = v.plots[`${x},${y}`];
        diamond(ctx, x, y);
        if (p && soil) {
          ctx.fillStyle = soil;
          ctx.fill();
          const watered = p.state === 'growing' && p.watered;
          if (watered || p.state === 'withered') {
            ctx.fillStyle = watered ? 'rgba(40,20,5,0.32)' : 'rgba(190,150,80,0.28)';
            ctx.fill();
          }
          ctx.strokeStyle = 'rgba(70,40,15,0.35)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else if (p) {
          const watered = p.state === 'growing' && p.watered;
          const base = p.state === 'withered' ? '#8a5a30' : watered ? '#5e3818' : '#7e4c24';
          ctx.fillStyle = base;
          ctx.fill();
          // furrows
          const a = iso(x + 0.15, y + 0.3), b = iso(x + 0.85, y + 0.3);
          ctx.strokeStyle = shade(base.length === 7 ? base : '#7e4c24', -0.25);
          ctx.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) {
            const off = iso(0, 0.2 * k);
            ctx.beginPath();
            ctx.moveTo(a.x + off.x, a.y + off.y);
            ctx.lineTo(b.x + off.x, b.y + off.y);
            ctx.stroke();
          }
        } else if (!grass) {
          const t = hash(x, y);
          ctx.fillStyle = t < 0.33 ? '#8cc43a' : t < 0.66 ? '#86be36' : '#92c840';
          ctx.fill();
        }
        if (this.showGrid) {
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    // paths are part of the ground
    const stones = this.ground(ctx, 'tex-path', 1);
    for (const o of v.objects) {
      if (o.key !== 'decor:path') continue;
      diamond(ctx, o.x + 0.04, o.y + 0.04, 0.92, 0.92);
      if (stones) {
        ctx.fillStyle = stones;
        ctx.fill();
        continue;
      }
      ctx.fillStyle = '#c8c0b0';
      ctx.fill();
      for (let k = 0; k < 4; k++) {
        const c = iso(o.x + 0.3 + (k % 2) * 0.4, o.y + 0.3 + Math.floor(k / 2) * 0.4);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 9, 4.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = k % 2 ? '#a8a092' : '#b8b0a2';
        ctx.fill();
      }
    }
    if (this.hover && !this.ghost && this.showGrid && this.hover.x >= 0 && this.hover.y >= 0 && this.hover.x < v.size && this.hover.y < v.size) {
      diamond(ctx, this.hover.x, this.hover.y);
      ctx.fillStyle = 'rgba(255,255,200,0.25)';
      ctx.fill();
      ctx.strokeStyle = '#fff8b0';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawHouse(ctx: CanvasRenderingContext2D) {
    const front = iso(-1, -1);
    const s = artSprite('house', 215, 235, 0.97) ?? houseSprite();
    drawSprite(ctx, s, front.x, front.y);
    this.hits.push({ x0: front.x - 100, y0: front.y - 200, x1: front.x + 100, y1: front.y, obj: 'house' });
  }

  private drawPet(ctx: CanvasRenderingContext2D, v: FarmView, time: number) {
    const p = iso(PET_POS.x, PET_POS.y);
    const kennel = iso(PET_POS.x - 0.7, PET_POS.y - 0.6);
    const bounce = v.petHappy ? Math.abs(Math.sin(time * 3)) * 3 : 0;
    const house = artSprite('kennel', 56, 52, 0.95), dog = artSprite('dog', 38, 38, 0.95);
    if (house) drawSprite(ctx, house, kennel.x, kennel.y + 14);
    else this.drawKennel(ctx, kennel);
    drawSprite(ctx, dog ?? emojiSprite('🐶', 26), p.x, p.y - bounce);
    if (v.own) this.bubble(ctx, p.x, p.y - 40, v.petHappy ? '❤️' : '🦴', time, !v.petHappy);
    this.hits.push({ x0: p.x - 22, y0: p.y - 40, x1: p.x + 22, y1: p.y + 4, obj: 'pet' });
  }

  private drawKennel(ctx: CanvasRenderingContext2D, kennel: { x: number; y: number }) {
    ctx.save();
    ctx.translate(kennel.x, kennel.y + 14);
    ctx.fillStyle = '#b5743a';
    ctx.strokeStyle = '#5a3418';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(-14, -22, 28, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-18, -20);
    ctx.lineTo(0, -36);
    ctx.lineTo(18, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2010';
    ctx.beginPath();
    ctx.arc(0, -6, 7, Math.PI, 0);
    ctx.lineTo(7, 0);
    ctx.lineTo(-7, 0);
    ctx.fill();
    ctx.restore();
  }

  private drawPlot(ctx: CanvasRenderingContext2D, x: number, y: number, p: Plot, v: FarmView, time: number) {
    const c = cellCenter(x, y);
    const st = plotStage(p);
    if (st >= 0 && p.crop) {
      const sway = st === 3 ? Math.sin(time * 1.5 + x * 0.7 + y) * 0.6 : 0;
      drawSprite(ctx, cropSprite(p.crop, st), c.x + sway, c.y);
    }
    if (p.pest) this.drawPest(ctx, p.pest, c.x, c.y, time, x + y);
    else if (p.state === 'growing' && !p.watered && st < 3 && (v.own || this.game.visit)) {
      this.drop(ctx, c.x + 12, c.y - 26 + Math.sin(time * 3 + x) * 1.5);
    }
  }

  private drop(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.quadraticCurveTo(x + 5, y, x, y + 3);
    ctx.quadraticCurveTo(x - 5, y, x, y - 7);
    ctx.fillStyle = '#4ab4ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  private drawPest(ctx: CanvasRenderingContext2D, pest: 'crow' | 'toad', x: number, y: number, time: number, seed: number) {
    const painted = pest === 'crow' ? artSprite('crow', 30, 28) : artSprite('toad', 26, 22);
    if (painted) {
      if (pest === 'crow') drawSprite(ctx, painted, x + 6, y - 1 - Math.abs(Math.sin(time * 4 + seed)) * 3);
      else {
        ctx.save();
        ctx.translate(x - 6, y + 3);
        ctx.scale(1, 1 + Math.sin(time * 5 + seed) * 0.06);
        drawSprite(ctx, painted, 0, 0);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    if (pest === 'crow') {
      const hop = Math.abs(Math.sin(time * 4 + seed)) * 3;
      ctx.translate(x + 4, y - 14 - hop);
      const flap = Math.sin(time * 14 + seed) * 0.5;
      ctx.fillStyle = '#1e1e28';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 5.5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, -5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.rotate(-0.6 + flap);
      ctx.beginPath();
      ctx.ellipse(-3, -5, 7, 3, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#34344a';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f2a51a';
      ctx.beginPath();
      ctx.moveTo(9.5, -6);
      ctx.lineTo(14, -4.5);
      ctx.lineTo(9.5, -3.5);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(7, -6, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(7.4, -6, 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const sq = 1 + Math.sin(time * 5 + seed) * 0.06;
      ctx.translate(x - 6, y - 3);
      ctx.scale(1, sq);
      ctx.fillStyle = '#5fa83a';
      ctx.strokeStyle = '#2f5a1a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, -5, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#7fc84a';
        ctx.beginPath();
        ctx.arc(s * 4, -10, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(s * 4, -10, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#c8e89a';
      ctx.beginPath();
      ctx.ellipse(0, -3, 5, 2.5, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawObject(ctx: CanvasRenderingContext2D, o: FarmObject, v: FarmView, time: number) {
    const { kind, id } = placeInfo(o.key);
    const ready = isReady(o, v.now);
    const front = iso(o.x + o.w, o.y + o.h);
    const center = iso(o.x + o.w / 2, o.y + o.h / 2);
    let top = center.y - 40;
    if (kind === 'tree') {
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 4, 22, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,40,10,0.22)';
      ctx.fill();
      const s = treeSprite(id, ready);
      drawSprite(ctx, s, center.x, center.y + 4, o.flip);
      top = center.y - 100;
      this.hits.push({ x0: center.x - 30, y0: center.y - 105, x1: center.x + 30, y1: center.y + 10, obj: o });
    } else if (kind === 'animal') {
      const a = animalById[id];
      const size = a.size === 2 ? 46 : 30;
      const bob = Math.sin(time * 2 + o.id) * 1.2;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 2, size * 0.45, size * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,40,10,0.25)';
      ctx.fill();
      const painted = a.size === 2 ? artSprite(`animal-${id}`, 70, 60) : artSprite(`animal-${id}`, 46, 44);
      drawSprite(ctx, painted ?? emojiSprite(a.emoji, size), center.x, center.y + 4 + bob, !o.flip);
      top = center.y - size * 1.2;
      this.hits.push({ x0: center.x - size * 0.6, y0: center.y - size * 1.1, x1: center.x + size * 0.6, y1: center.y + 8, obj: o });
    } else if (kind === 'decor') {
      top = this.drawDecor(ctx, o, id, center, time);
      this.hits.push({ x0: center.x - 16 * o.w, y0: top, x1: center.x + 16 * o.w, y1: center.y + 8 * o.h, obj: o });
    } else {
      const b = buildingById[id as BuildingId];
      const span = (b.w + b.h) * (TW / 2);
      const painted = artSprite(`bld-${id}`, span * 1.05, id === 'mill' ? 180 : span * 1.1, 0.97);
      const roofTop = center.y - 100;
      if (painted) {
        // the greenhouse picture has its long side to the right, the 2×3 footprint runs to the left
        drawSprite(ctx, painted, center.x, front.y + 2, id === 'greenhouse');
        if (id === 'mill') this.drawSails(ctx, center.x - painted.w / 2 + painted.w * MILL_HUB.x, front.y + 2 - painted.ay + painted.h * MILL_HUB.y, time);
      } else {
        drawSprite(ctx, buildingSprite(id, b.w, b.h, b.wall, b.roof), front.x, front.y);
        if (id === 'mill') this.drawSails(ctx, center.x + 14, center.y - 62, time);
        drawSprite(ctx, emojiSprite(b.emoji, 18), center.x, center.y - (id === 'greenhouse' ? 26 : 52));
      }
      if (id === 'greenhouse') this.drawGreenhousePlants(ctx, o, v.now);
      const job = o.jobs?.[0];
      if (job && job.endsAt > v.now && job.startsAt <= v.now) {
        this.progress(ctx, center.x, roofTop + 4, (v.now - job.startsAt) / (job.endsAt - job.startsAt));
      }
      top = roofTop;
      this.hits.push({ x0: center.x - (b.w + b.h) * 16, y0: center.y - 110, x1: center.x + (b.w + b.h) * 16, y1: front.y, obj: o });
    }
    if (ready && kind !== 'decor' && v.own) this.bubble(ctx, center.x, top - 6, kind === 'building' ? '✅' : readyIcon(o), time + o.id, false);
  }

  private drawGreenhousePlants(ctx: CanvasRenderingContext2D, o: FarmObject, now: number) {
    (o.slots ?? []).forEach((s, i) => {
      if (!s.crop) return;
      const f = (now - s.plantedAt) / (cropById[s.crop].hours * HOUR);
      const st = f < 0.12 ? 0 : f < 0.5 ? 1 : f < 1 ? 2 : 3;
      const cx = o.x + 0.25 + (i % 4) * 0.5;
      const cy = o.y + 0.5 + Math.floor(i / 4) * 1.0;
      const c = iso(cx, cy);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(0.55, 0.55);
      drawSprite(ctx, cropSprite(s.crop, st), 0, 0);
      ctx.restore();
    });
  }

  private drawDecor(ctx: CanvasRenderingContext2D, o: FarmObject, id: string, c: { x: number; y: number }, time: number) {
    const d = decorById[id];
    if (d.draw === 'path') return c.y - 8;
    const painted = this.drawDecorArt(ctx, o, id, c, time);
    if (painted !== null) return painted;
    switch (d.draw) {
      case 'fence': {
        ctx.strokeStyle = '#8a5a2a';
        ctx.lineWidth = 2;
        const a = iso(o.x, o.y + 1), b = iso(o.x + 1, o.y + 1);
        for (let k = 0; k <= 4; k++) {
          const t = k / 4;
          const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t - 4;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 18); ctx.stroke();
        }
        ctx.lineWidth = 1.6;
        for (const h of [8, 14]) { ctx.beginPath(); ctx.moveTo(a.x, a.y - 4 - h); ctx.lineTo(b.x, b.y - 4 - h); ctx.stroke(); }
        return c.y - 26;
      }
      case 'hedge': {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - 10, 24, 15, 0, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(c.x - 8, c.y - 18, 2, c.x, c.y - 10, 24);
        g.addColorStop(0, '#6ac04a');
        g.addColorStop(1, '#2f7a2a');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#245a1a';
        ctx.stroke();
        return c.y - 26;
      }
      case 'flowerbed': {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 24, 12, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#6a4020';
        ctx.fill();
        ctx.strokeStyle = '#a8a8a0';
        ctx.lineWidth = 3;
        ctx.stroke();
        const cols = ['#ff4f7a', '#ffd23a', '#fff', '#b07aff', '#ff8a2a'];
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          ctx.fillStyle = cols[k % cols.length];
          ctx.beginPath();
          ctx.arc(c.x + Math.cos(a) * 14, c.y + Math.sin(a) * 6 - 4, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        return c.y - 14;
      }
      case 'pond': {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 54, 26, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#9a9a8a';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 48, 22, 0, 0, Math.PI * 2);
        const g = ctx.createLinearGradient(0, c.y - 22, 0, c.y + 22);
        g.addColorStop(0, '#5ec8f0');
        g.addColorStop(1, '#2a8ac8');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        const r = (time * 6) % 20;
        ctx.beginPath();
        ctx.ellipse(c.x - 10, c.y + 4, 6 + r, 3 + r / 2, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 1 - r / 20;
        ctx.stroke();
        ctx.globalAlpha = 1;
        drawSprite(ctx, emojiSprite('🦆', 20), c.x + 14 + Math.sin(time * 0.6) * 10, c.y + 4);
        return c.y - 30;
      }
    }
    const size = d.size === 3 ? 80 : d.size === 2 ? 52 : 30;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 2, size * 0.4, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,40,10,0.22)';
    ctx.fill();
    const wobble = id === 'balloons' || id === 'pinwheel' ? Math.sin(time * 2 + o.id) * 2 : 0;
    drawSprite(ctx, emojiSprite(d.emoji, size), c.x + wobble, c.y + 4, o.flip);
    return c.y - size * 1.15;
  }

  /** Painted decor; returns the top of the picture, or null if it isn't loaded. */
  private drawDecorArt(ctx: CanvasRenderingContext2D, o: FarmObject, id: string, c: { x: number; y: number }, time: number): number | null {
    const d = decorById[id];
    if (d.draw === 'fence') {
      // a straight fence picture sheared along the cell's front-left edge
      const img = art(`decor-${id}`);
      if (!img) return null;
      const a = iso(o.x, o.y + 1);
      const { w, h } = artFit(`decor-${id}`, TW / 2, 40);
      ctx.save();
      ctx.translate(a.x, a.y - 2);
      ctx.transform(1, 0.5, 0, 1, 0, 0);
      ctx.drawImage(img, 0, -h, w, h);
      ctx.restore();
      return c.y - h - 8;
    }
    const box: Record<string, [number, number, number]> = { hedge: [58, 48, 0.92], flowerbed: [62, 46, 0.78], pond: [128, 84, 0.62] };
    const [bw, bh, anchor] = box[id] ?? (d.size === 3 ? [150, 150, 0.95] : d.size === 2 ? [104, 96, 0.95] : [46, 56, 0.95]);
    const s = artSprite(`decor-${id}`, bw, bh, anchor);
    if (!s) return null;
    if (!box[id]) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 2, bw * 0.4, bw * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,40,10,0.2)';
      ctx.fill();
    }
    const wobble = id === 'balloons' || id === 'pinwheel' ? Math.sin(time * 2 + o.id) * 2 : 0;
    drawSprite(ctx, s, c.x + wobble, c.y + 4, o.flip);
    return c.y + 4 - s.ay;
  }

  private drawSails(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
    const sails = artSprite('mill-sails', 96, 96, 0.5);
    if (sails) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.8);
      drawSprite(ctx, sails, 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.8);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#f2ead8';
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(2, -4, 30, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(32, 0);
      ctx.stroke();
    }
    ctx.fillStyle = '#6a4a2a';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private progress(ctx: CanvasRenderingContext2D, x: number, y: number, f: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x - 22, y - 4, 44, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#7ee05a';
    roundRect(ctx, x - 21, y - 3, 42 * clamp(f, 0, 1), 6, 3);
    ctx.fill();
  }

  private bubble(ctx: CanvasRenderingContext2D, x: number, y: number, emoji: string, time: number, alert: boolean) {
    const b = Math.sin(time * 3) * 2;
    ctx.save();
    ctx.translate(x, y + b);
    ctx.fillStyle = alert ? '#fff3c4' : '#ffffff';
    ctx.strokeStyle = 'rgba(80,50,20,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, -10, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(4, 0);
    ctx.fill();
    ctx.restore();
    drawSprite(ctx, emojiSprite(emoji, 16), x, y + b - 2);
  }

  private drawGhost(ctx: CanvasRenderingContext2D, g: Ghost) {
    diamond(ctx, g.x, g.y, g.w, g.h);
    ctx.fillStyle = g.valid ? 'rgba(120,255,120,0.35)' : 'rgba(255,90,90,0.4)';
    ctx.fill();
    ctx.strokeStyle = g.valid ? '#b8ffb0' : '#ff9a9a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    const fake: FarmObject = { id: -1, key: g.key, x: g.x, y: g.y, w: g.w, h: g.h, flip: false, readyAt: Infinity, jobs: [], slots: [] };
    this.drawObject(ctx, fake, { ...this.view(), now: 0 }, 0);
    this.hits.pop();
    ctx.globalAlpha = 1;
  }

  private drawPending(ctx: CanvasRenderingContext2D, time: number) {
    for (const k of this.game.pending) {
      const [x, y] = unkey(k);
      const c = cellCenter(x, y);
      ctx.globalAlpha = 0.65 + Math.sin(time * 6) * 0.2;
      drawSprite(ctx, emojiSprite('⏳', 14), c.x, c.y - 30);
      ctx.globalAlpha = 1;
    }
  }

  private drawFloats(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    this.floats = this.floats.filter((f) => now - f.t0 < 1700);
    for (const f of this.floats) {
      const t = (now - f.t0) / 1700;
      if (t < 0) continue;
      const c = cellCenter(f.x, f.y);
      const y = c.y - 40 - t * 46;
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.font = '800 13px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(40,25,10,0.85)';
      const text = f.icon ? `${f.text} ${f.icon}` : f.text;
      ctx.strokeText(text, c.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(text, c.x, y);
      ctx.globalAlpha = 1;
    }
  }
}

export function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

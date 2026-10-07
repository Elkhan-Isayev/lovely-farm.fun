// The farmer walks to the beds and "digs funnily", as in the original.
import type { Look } from '../core/state';
import { art } from './art';
import { iso } from './iso';
import { shade } from './sprites';

export type Tool = 'shovel' | 'seeds' | 'water' | 'fertilizer' | 'basket' | 'shoo' | 'hammer';

export interface Task {
  x: number;
  y: number;
  tool: Tool;
  key: string; // cell reserved by the task
  run: () => void;
  cancel?: () => void;
}

const SPEED = 3.2; // cells per second
const ACT_TIME = 0.55;

/*
 * The painted farmer: a 4×4 atlas of frames (art/sheets/farmer-<boy|girl>, cut by scripts/art/slice.py).
 * Every cell has the feet at its bottom centre, 4 px up. Hair, shirt and overalls/skirt are grey in the
 * atlas and get the player's colours through the farmer-<g>-<region> masks.
 */
export const FRAMES = {
  idle: 0, walk: [1, 2, 3, 2], digUp: 4, digDown: 5, canUp: 6, canPour: 7, sow: 8,
  pick: 9, basket: 10, fertilize: 11, hammerUp: 12, hammerDown: 13, shooA: 14, shooB: 15,
} as const;
const ATLAS_COLS = 4;
const FARMER_SCALE = 0.42; // atlas pixels → world pixels

/** Atlas frame for the current state: walking cycle, idle, or the two phases of a tool. */
export function farmerFrame(tool: Tool | undefined, actT: number, walk: number): number {
  if (!tool) return walk ? FRAMES.walk[Math.floor(walk / 1.6) % 4] : FRAMES.idle;
  switch (tool) {
    case 'shovel': return actT < 0.45 ? FRAMES.digUp : FRAMES.digDown;
    case 'water': return actT < 0.3 ? FRAMES.canUp : FRAMES.canPour;
    case 'seeds': return FRAMES.sow;
    case 'basket': return actT < 0.55 ? FRAMES.pick : FRAMES.basket;
    case 'fertilizer': return FRAMES.fertilize;
    case 'hammer': return actT < 0.45 ? FRAMES.hammerUp : FRAMES.hammerDown;
    case 'shoo': return Math.floor(actT * 4) % 2 ? FRAMES.shooB : FRAMES.shooA;
  }
}

const atlases = new Map<string, HTMLCanvasElement>();

/** The atlas in the player's colours (cached per look), or null while the pictures load. */
export function farmerAtlas(look: Look): HTMLCanvasElement | null {
  const id = `farmer-${look.gender === 'boy' ? 'boy' : 'girl'}`;
  const key = `${id}:${look.hair}:${look.shirt}:${look.pants}`;
  const done = atlases.get(key);
  if (done) return done;
  const base = art(id);
  const masks = (['hair', 'shirt', 'pants'] as const).map((r) => [art(`${id}-${r}`), look[r]] as const);
  if (!base || masks.some(([m]) => !m)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  for (const [mask, color] of masks) {
    // colour the mask, then multiply it onto the grey shading
    const layer = document.createElement('canvas');
    layer.width = base.width;
    layer.height = base.height;
    const lc = layer.getContext('2d')!;
    lc.drawImage(mask!, 0, 0);
    lc.globalCompositeOperation = 'source-in';
    lc.fillStyle = color;
    lc.fillRect(0, 0, layer.width, layer.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(layer, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  atlases.set(key, canvas);
  return canvas;
}

export class Farmer {
  x: number;
  y: number;
  queue: Task[] = [];
  cur: Task | null = null;
  acting = 0;
  facing = 1;
  walk = 0;
  onIdle?: () => void;
  /** Called when the farmer starts working with a tool (for its sound). */
  onAct?: (tool: Tool) => void;

  constructor(x: number, y: number) { this.x = x; this.y = y; }

  add(t: Task) { this.queue.push(t); }
  clear() {
    for (const t of [this.cur, ...this.queue]) t?.cancel?.();
    this.queue = [];
    this.cur = null;
    this.acting = 0;
  }
  busy() { return !!this.cur || this.queue.length > 0; }

  update(dt: number) {
    if (!this.cur) {
      this.cur = this.queue.shift() ?? null;
      if (!this.cur) { this.walk = 0; return; }
    }
    const t = this.cur;
    // stand at the cell's front-left edge, facing the plant
    const tx = t.x + 0.15, ty = t.y + 0.92;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (this.acting === 0 && d > 0.02) {
      const step = Math.min(d, SPEED * dt * (this.queue.length > 6 ? 1.6 : 1));
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      const sdx = dx - dy; // horizontal direction on screen
      if (Math.abs(sdx) > 0.01) this.facing = sdx > 0 ? 1 : -1;
      this.walk += dt * 10;
      return;
    }
    this.facing = 1;
    this.walk = 0;
    if (this.acting === 0) this.onAct?.(t.tool);
    this.acting += dt;
    if (this.acting >= ACT_TIME) {
      this.acting = 0;
      this.cur = null;
      t.run();
      if (!this.queue.length) this.onIdle?.();
    }
  }

  depth() { return this.x + this.y; }

  draw(ctx: CanvasRenderingContext2D, look: Look, time: number) {
    const atlas = farmerAtlas(look);
    if (!atlas) return this.drawProcedural(ctx, look, time);
    const p = iso(this.x, this.y);
    const tool = this.cur?.tool;
    const frame = farmerFrame(tool, this.acting / ACT_TIME, this.walk);
    const cw = atlas.width / ATLAS_COLS, ch = atlas.height / 4;
    const bob = this.walk ? Math.abs(Math.sin(this.walk)) * 1.2 : tool ? 0 : Math.sin(time * 2) * 0.3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,30,5,0.28)';
    ctx.fill();
    ctx.scale(this.facing * FARMER_SCALE, FARMER_SCALE);
    ctx.drawImage(atlas, (frame % ATLAS_COLS) * cw, Math.floor(frame / ATLAS_COLS) * ch, cw, ch, -cw / 2, -ch + 4 - bob / FARMER_SCALE, cw, ch);
    ctx.restore();
  }

  /** The farmer drawn in code: used until the painted atlas has loaded. */
  drawProcedural(ctx: CanvasRenderingContext2D, look: Look, time: number) {
    const p = iso(this.x, this.y);
    const tool = this.cur?.tool;
    const actT = this.acting / ACT_TIME; // 0..1
    ctx.save();
    ctx.translate(p.x, p.y);
    // shadow
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,30,5,0.3)';
    ctx.fill();
    ctx.scale(this.facing, 1);
    const bob = this.walk ? Math.abs(Math.sin(this.walk)) * 1.5 : Math.sin(time * 2) * 0.4;
    const crouch = tool === 'shovel' || tool === 'seeds' || tool === 'basket' ? Math.sin(actT * Math.PI) * 3 : 0;
    ctx.translate(0, -bob + crouch);

    const skin = '#f6c9a0';
    const outline = 'rgba(40,20,10,0.7)';
    const legSwing = this.walk ? Math.sin(this.walk) * 4 : 0;

    // legs
    for (const s of [-1, 1]) {
      ctx.fillStyle = look.pants;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.rect(s * 3 - 2 + s * legSwing * 0.5, -14, 4, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a2a14';
      ctx.beginPath();
      ctx.ellipse(s * 3 + s * legSwing * 0.5 + 1, -2, 3.4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // torso
    ctx.fillStyle = look.shirt;
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.moveTo(-7, -14);
    ctx.lineTo(-6, -29);
    ctx.quadraticCurveTo(0, -32, 6, -29);
    ctx.lineTo(7, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (look.gender === 'boy') {
      // overalls
      ctx.fillStyle = look.pants;
      ctx.fillRect(-6, -21, 12, 8);
      ctx.strokeRect(-6, -21, 12, 8);
      ctx.fillRect(-5, -29, 2, 9);
      ctx.fillRect(3, -29, 2, 9);
    } else {
      // skirt
      ctx.fillStyle = look.pants;
      ctx.beginPath();
      ctx.moveTo(-7, -17);
      ctx.lineTo(7, -17);
      ctx.lineTo(9, -10);
      ctx.lineTo(-9, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // arms + tool
    const swing = tool ? Math.sin(actT * Math.PI * 2) : 0;
    const armA = this.walk ? Math.sin(this.walk) * 0.5 : 0;
    ctx.save();
    ctx.translate(5, -27);
    ctx.rotate(tool ? -0.6 - swing * 0.6 : armA);
    ctx.fillStyle = look.shirt;
    ctx.fillRect(-1.6, 0, 3.4, 11);
    ctx.strokeRect(-1.6, 0, 3.4, 11);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, 12, 2, 0, Math.PI * 2);
    ctx.fill();
    if (tool) drawTool(ctx, tool, actT);
    ctx.restore();
    ctx.save();
    ctx.translate(-5, -27);
    ctx.rotate(tool === 'shoo' ? 2.4 + swing * 0.5 : -armA);
    ctx.fillStyle = look.shirt;
    ctx.fillRect(-1.6, 0, 3.4, 11);
    ctx.strokeRect(-1.6, 0, 3.4, 11);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, 12, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // head
    ctx.fillStyle = skin;
    ctx.strokeStyle = outline;
    ctx.beginPath();
    ctx.arc(0, -37, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // eyes and smile
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath();
    ctx.arc(3, -38, 1, 0, Math.PI * 2);
    ctx.arc(6, -38, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a0502a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(4.5, -35, 2, 0.2, Math.PI - 0.6);
    ctx.stroke();
    // hair
    ctx.fillStyle = look.hair;
    ctx.strokeStyle = shade(look.hair.length === 7 ? look.hair : '#3a2416', -0.4);
    ctx.lineWidth = 0.8;
    if (look.gender === 'girl') {
      ctx.beginPath();
      ctx.moveTo(-8, -36);
      ctx.quadraticCurveTo(-9, -47, 0, -46);
      ctx.quadraticCurveTo(8, -46, 8, -40);
      ctx.quadraticCurveTo(3, -42, 0, -40);
      ctx.quadraticCurveTo(-3, -36, -6, -38);
      ctx.lineTo(-9, -20);
      ctx.quadraticCurveTo(-11, -28, -8, -36);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-8, -37);
      ctx.quadraticCurveTo(-7, -46, 1, -45.5);
      ctx.quadraticCurveTo(8, -45, 8, -40);
      ctx.lineTo(4, -42);
      ctx.lineTo(2, -40);
      ctx.lineTo(-2, -42);
      ctx.lineTo(-5, -38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // straw hat
      ctx.fillStyle = '#e8c86a';
      ctx.strokeStyle = '#a07a2a';
      ctx.beginPath();
      ctx.ellipse(0, -44, 12, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -47, 6.5, 4.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-6.5, -46, 13, 1.6);
    }
    ctx.restore();
  }
}

function drawTool(ctx: CanvasRenderingContext2D, tool: Tool, t: number) {
  ctx.save();
  ctx.translate(0, 12);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(30,20,10,0.8)';
  switch (tool) {
    case 'shovel': case 'hammer':
      ctx.fillStyle = '#9a6a3a';
      ctx.fillRect(-1, -10, 2, 24);
      ctx.fillStyle = tool === 'hammer' ? '#6a6a6a' : '#b8c0c8';
      ctx.beginPath();
      if (tool === 'hammer') ctx.rect(-4, -12, 8, 4);
      else { ctx.moveTo(-4, 13); ctx.lineTo(4, 13); ctx.lineTo(3, 20); ctx.lineTo(0, 22); ctx.lineTo(-3, 20); ctx.closePath(); }
      ctx.fill();
      ctx.stroke();
      break;
    case 'water':
      ctx.rotate(-0.4 - t * 0.6);
      ctx.fillStyle = '#4aa86a';
      ctx.beginPath();
      ctx.rect(-5, -2, 10, 9);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, 1);
      ctx.lineTo(13, -3);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3a8a5a';
      ctx.stroke();
      if (t > 0.2) {
        ctx.fillStyle = '#6ac8ff';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(14 + i * 1.5, -1 + i * 4 + t * 6, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'fertilizer':
      ctx.fillStyle = '#d8c8a0';
      ctx.fillRect(-4, -2, 8, 10);
      ctx.strokeRect(-4, -2, 8, 10);
      ctx.fillStyle = '#6a4a1a';
      for (let i = 0; i < 4; i++) ctx.fillRect(6 + i * 2, 4 + i * 3 + t * 4, 1.4, 1.4);
      break;
    case 'seeds':
      ctx.fillStyle = '#c8a060';
      ctx.beginPath();
      ctx.ellipse(0, 3, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8d39a';
      for (let i = 0; i < 3; i++) ctx.fillRect(5 + i * 2, 6 + i * 3 + t * 5, 1.3, 1.3);
      break;
    case 'basket':
      ctx.fillStyle = '#c8904a';
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.lineTo(4, 8);
      ctx.lineTo(-4, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5, Math.PI, 0);
      ctx.stroke();
      break;
    case 'shoo':
      break;
  }
  ctx.restore();
}

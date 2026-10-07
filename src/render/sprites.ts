// Sprites: painted art from public/art (see art.ts) with procedural fallbacks drawn in code.
// Everything is cached.
import { cropById, treeById, type CropDef, type TreeDef } from '../data/items';
import { art, artFit, artURL } from './art';
import { TH, TW, iso } from './iso';

const SCALE = 2; // cached at 2× so zooming stays crisp

export interface Sprite { canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number }
const cache = new Map<string, Sprite>();

/** A sprite whose origin (ax, ay) is its point on the ground. */
export function sprite(key: string, w: number, h: number, ax: number, ay: number, draw: (ctx: CanvasRenderingContext2D) => void, scale = SCALE): Sprite {
  let s = cache.get(key);
  if (s) return s;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.translate(ax, ay);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  s = { canvas, w, h, ax, ay };
  cache.set(key, s);
  return s;
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, flip = false, alpha = 1) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    ctx.restore();
  } else ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/**
 * A painted sprite fitted into a maxW×maxH box, or null while its picture isn't loaded.
 * anchor is the ground point as a fraction of the height from the top (1 = bottom edge).
 */
export function artSprite(id: string, maxW: number, maxH: number, anchor = 1): Sprite | null {
  const img = art(id);
  if (!img) return null;
  const { w, h } = artFit(id, maxW, maxH);
  // baked at 3× so the pictures stay crisp when zoomed in
  return sprite(`art:${id}:${maxW}:${maxH}:${anchor}`, w, h, w / 2, h * anchor, (ctx) => ctx.drawImage(img, -w / 2, -h * anchor, w, h), 3);
}

/* ---------------- colour helpers ---------------- */

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, outline = true, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = 'rgba(40,25,10,0.45)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
}

function shine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.32, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(1, shade(color, -0.15));
  ell(ctx, x, y, r, r, g as unknown as string);
  shine(ctx, x, y, r);
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(wid, -len * 0.5, 0, -len);
  ctx.quadraticCurveTo(-wid, -len * 0.5, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.4);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(0, -len * 0.8);
  ctx.strokeStyle = shade(color, 0.25);
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.restore();
}

function stem(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 1.6) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + 2, (y0 + y1) / 2, x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function bushMound(ctx: CanvasRenderingContext2D, leafC: string, s = 1, y = 0) {
  const blobs: [number, number, number][] = [[-9, -6, 8], [9, -6, 8], [0, -12, 9], [-4, -3, 8], [5, -2, 8]];
  for (const [bx, by, r] of blobs) {
    const g = ctx.createRadialGradient(bx * s - 3, (by - 3) * s + y, 1, bx * s, by * s + y, r * s);
    g.addColorStop(0, shade(leafC, 0.25));
    g.addColorStop(1, shade(leafC, -0.2));
    ell(ctx, bx * s, by * s + y, r * s, r * 0.85 * s, g as unknown as string);
  }
}

/* ---------------- beds ---------------- */

function moundShadow(ctx: CanvasRenderingContext2D, r = 14) {
  ctx.beginPath();
  ctx.ellipse(0, 2, r, r / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,15,5,0.25)';
  ctx.fill();
}

function drawSeeds(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5a3418';
  ctx.fill();
  for (const [x, y] of [[-4, -1], [2, 0], [5, -1.5], [-1, 1.5]]) ell(ctx, x, y, 1.3, 1, '#e8d39a', false);
}

function drawSprout(ctx: CanvasRenderingContext2D, c: CropDef) {
  moundShadow(ctx, 7);
  stem(ctx, 0, 0, 0, -6, shade(c.leaf, -0.2));
  leaf(ctx, 0, -5, 7, 3.5, -0.9, shade(c.leaf, 0.15));
  leaf(ctx, 0, -5, 7, 3.5, 0.9, c.leaf);
}

function drawWithered(ctx: CanvasRenderingContext2D, harvested: boolean) {
  const col = harvested ? '#b89a5a' : '#8a6a3a';
  const n = harvested ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const x = -8 + (16 * i) / (n - 1);
    const h = harvested ? 4 + (i % 2) * 2 : 8 + (i % 3) * 3;
    stem(ctx, x, 1, x + (i % 2 ? 3 : -3), -h, col, 1.4);
  }
  if (!harvested) {
    leaf(ctx, -3, -6, 7, 3, 2.2, '#9a7a42');
    leaf(ctx, 3, -7, 7, 3, -2.3, '#a8884a');
  }
}

function drawRoot(ctx: CanvasRenderingContext2D, c: CropDef, mature: boolean) {
  moundShadow(ctx, 12);
  const s = mature ? 1 : 0.75;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -1.0 + (2.0 * i) / (n - 1);
    leaf(ctx, 0, -2, (c.id === 'onion' || c.id === 'redonion' ? 20 : 16) * s, c.id === 'onion' || c.id === 'redonion' ? 2 : 4.5, a, i % 2 ? c.leaf : shade(c.leaf, 0.15));
  }
  if (!mature) return;
  if (c.id === 'carrot') {
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(6, -2);
    ctx.lineTo(0, 7);
    ctx.closePath();
    ctx.fillStyle = c.fruit;
    ctx.fill();
    ctx.strokeStyle = shade(c.fruit, -0.4);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  } else {
    const r = c.id === 'radish' ? 6 : 7.5;
    ball(ctx, 0, 0, r, c.fruit);
  }
}

function fruitAt(ctx: CanvasRenderingContext2D, c: CropDef, x: number, y: number, i: number) {
  switch (c.id) {
    case 'cucumber': case 'chili': case 'eggplant': {
      const long = c.id === 'eggplant' ? [4, 7] : c.id === 'chili' ? [2, 6] : [2.5, 7.5];
      ell(ctx, x, y, long[0], long[1], c.fruit, true, 0.3 * (i % 2 ? 1 : -1));
      shine(ctx, x, y - 2, long[0] * 1.5);
      if (c.id !== 'cucumber') ell(ctx, x, y - long[1] + 0.5, 2, 1.3, '#4a8a2a', false);
      break;
    }
    case 'peas': case 'beans':
      ell(ctx, x, y, 2.4, 6, c.fruit, true, 0.5 * (i % 2 ? 1 : -1));
      for (let k = -1; k <= 1; k++) ell(ctx, x + k * 0.9, y + k * 3, 1.2, 1.2, shade(c.fruit, 0.3), false);
      break;
    case 'grape':
      for (const [dx, dy] of [[0, 0], [-2.5, -2.5], [2.5, -2.5], [0, -5], [-1.3, 2.5], [1.3, 2.5], [0, 5]]) ball(ctx, x + dx, y + dy, 2.2, c.fruit);
      break;
    case 'strawberry':
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y - 2);
      ctx.quadraticCurveTo(x, y - 4.5, x + 3.5, y - 2);
      ctx.quadraticCurveTo(x + 3, y + 3, x, y + 5);
      ctx.quadraticCurveTo(x - 3, y + 3, x - 3.5, y - 2);
      ctx.fillStyle = c.fruit;
      ctx.fill();
      ctx.strokeStyle = shade(c.fruit, -0.4);
      ctx.lineWidth = 0.7;
      ctx.stroke();
      for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, 2.5]]) ell(ctx, x + dx, y + dy, 0.5, 0.5, '#ffe9a0', false);
      ell(ctx, x, y - 3, 2.5, 1, '#3c8a2a', false);
      break;
    case 'potato':
      for (const [dx, dy] of [[0, 0], [-2.5, 1], [2.5, 1]]) ell(ctx, x + dx, y + dy - 2, 1.6, 1.6, '#fffbe8', true);
      ell(ctx, x, y - 2, 0.8, 0.8, '#f2c41a', false);
      break;
    case 'tea':
      leaf(ctx, x, y + 2, 7, 3, 0.4 * (i % 2 ? 1 : -1), c.fruit);
      break;
    case 'pepper':
      ell(ctx, x, y, 4, 5, i % 2 ? c.fruit : c.fruit2!, true);
      shine(ctx, x, y, 4);
      ell(ctx, x, y - 5, 1.2, 1.5, '#3a7a2a', false);
      break;
    default: {
      const r = c.id === 'tomato' ? 4.6 : c.id === 'raspberry' || c.id === 'blackberry' ? 3.2 : c.id === 'blueberry' ? 2.6 : 3.5;
      if (c.id === 'raspberry' || c.id === 'blackberry') {
        for (const [dx, dy] of [[0, 0], [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) ball(ctx, x + dx, y + dy, r * 0.55, c.fruit);
      } else ball(ctx, x, y, r, c.fruit);
      if (c.id === 'tomato') ell(ctx, x, y - 4, 2.4, 1, '#3c8a2a', false);
    }
  }
}

function drawBush(ctx: CanvasRenderingContext2D, c: CropDef, mature: boolean) {
  moundShadow(ctx, 15);
  const s = mature ? 1 : 0.72;
  if (c.id === 'peas' || c.id === 'beans' || c.id === 'grape') {
    // support stakes, like in a real garden
    ctx.strokeStyle = '#8a5a2a';
    ctx.lineWidth = 1.4;
    for (const x of [-9, 9]) { ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x * 0.8, -28 * s); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-8, -18 * s); ctx.lineTo(8, -18 * s); ctx.stroke();
  }
  bushMound(ctx, c.leaf, s);
  if (!mature) return;
  const spots: [number, number][] = c.id === 'tea' ? [[-8, -12], [7, -14], [0, -20], [-3, -6], [6, -5]] : [[-8, -8], [7, -10], [0, -16], [-2, -3], [8, -2], [-9, -1]];
  spots.forEach(([x, y], i) => fruitAt(ctx, c, x, y, i));
}

function drawGround(ctx: CanvasRenderingContext2D, c: CropDef, mature: boolean) {
  moundShadow(ctx, 16);
  if (c.id === 'cabbage' || c.id === 'broccoli') {
    const s = mature ? 1 : 0.7;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      leaf(ctx, Math.cos(a) * 3, Math.sin(a) * 1.5 - 2, 13 * s, 7 * s, a + Math.PI / 2, i % 2 ? c.leaf : shade(c.leaf, -0.1));
    }
    if (!mature) return;
    if (c.id === 'cabbage') {
      ball(ctx, 0, -6, 8.5, c.fruit);
      ctx.beginPath();
      ctx.arc(0, -6, 5.5, Math.PI * 0.9, Math.PI * 2.1);
      ctx.strokeStyle = shade(c.fruit, -0.25);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      stem(ctx, 0, 0, 0, -7, '#7ab05a', 3);
      for (const [x, y] of [[-4, -9], [4, -9], [0, -13], [-5, -13], [5, -13], [0, -9]]) ball(ctx, x, y, 3.6, c.fruit);
    }
    return;
  }
  // vines with leaves
  for (const [x, y, a] of [[-11, -2, -1.2], [10, -3, 1.2], [-4, -8, -0.4], [5, -9, 0.5]] as const) leaf(ctx, x, y, mature ? 11 : 8, 6, a, c.leaf);
  if (!mature) return;
  if (c.id === 'zucchini') {
    ell(ctx, -2, -3, 10, 3.6, c.fruit, true, -0.35);
    ell(ctx, 4, 0, 9, 3.2, shade(c.fruit, 0.1), true, -0.25);
    shine(ctx, -2, -3, 6);
    return;
  }
  const r = c.id === 'pumpkin' ? 10 : c.id === 'watermelon' ? 10.5 : 9;
  const ry = c.id === 'melon' ? r * 0.75 : r * 0.82;
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4 - 4, 1, 0, -4, r);
  g.addColorStop(0, shade(c.fruit, 0.35));
  g.addColorStop(1, shade(c.fruit, -0.2));
  ell(ctx, 0, -4, r, ry, g as unknown as string);
  if (c.id === 'pumpkin') {
    ctx.strokeStyle = shade(c.fruit, -0.3);
    ctx.lineWidth = 0.9;
    for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(0, -4, r * Math.abs(k) + 1, ry, 0, -Math.PI / 2, Math.PI / 2, k < 0); ctx.stroke(); }
    stem(ctx, 0, -4 - ry, 2, -7 - ry, '#5a7a2a', 2.2);
  }
  if (c.id === 'watermelon') {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -4, r, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = c.fruit2!;
    ctx.lineWidth = 2;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 4.5, -4 - ry); ctx.quadraticCurveTo(k * 6, -4, k * 4.5, -4 + ry); ctx.stroke(); }
    ctx.restore();
  }
  if (c.id === 'melon') {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 3 - 3, -4 - ry + 2); ctx.lineTo(k * 3 + 3, -4 + ry - 2); ctx.stroke(); }
  }
  shine(ctx, 0, -4, r);
}

function drawTall(ctx: CanvasRenderingContext2D, c: CropDef, mature: boolean) {
  moundShadow(ctx, 12);
  const s = mature ? 1 : 0.65;
  switch (c.id) {
    case 'corn':
      stem(ctx, 0, 0, 0, -38 * s, '#5f9e32', 3);
      for (const [y, a] of [[-8, -1.1], [-14, 1.0], [-22, -0.9], [-28, 1.1]] as const) leaf(ctx, 0, y * s, 16 * s, 3.5, a, c.leaf);
      if (mature) {
        ell(ctx, 4, -24, 3.5, 8, c.fruit, true, 0.25);
        for (let k = -2; k <= 2; k++) ell(ctx, 4 + k * 0.4, -24 + k * 3, 2.3, 0.8, shade(c.fruit, 0.25), false, 0.25);
        leaf(ctx, 2, -16, 12, 3, 0.3, '#a8c85a');
        stem(ctx, 0, -38, -3, -44, '#d8b84a', 1);
        stem(ctx, 0, -38, 3, -44, '#d8b84a', 1);
      }
      break;
    case 'sunflower':
      stem(ctx, 0, 0, 0, -36 * s, '#5a9a32', 2.6);
      leaf(ctx, 0, -10 * s, 11, 6, -1.1, c.leaf);
      leaf(ctx, 0, -17 * s, 11, 6, 1.1, shade(c.leaf, 0.1));
      if (mature) {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          ell(ctx, Math.cos(a) * 8, -38 + Math.sin(a) * 8, 4.5, 2.2, c.fruit, true, a);
        }
        ell(ctx, 0, -38, 6, 6, c.fruit2!);
        for (let i = 0; i < 6; i++) ell(ctx, Math.cos(i) * 3, -38 + Math.sin(i * 1.7) * 3, 0.7, 0.7, '#3a1e08', false);
      }
      break;
    case 'wheat': case 'rice':
      for (const x of [-8, -4, 0, 4, 8, -6, 6, 2, -2]) {
        const h = (24 + ((x * 7) % 6)) * s;
        const bend = c.id === 'rice' ? 5 : 1;
        stem(ctx, x, 1, x + bend, -h, mature ? '#cbb95a' : c.leaf, 1.2);
        if (mature) {
          for (let k = 0; k < 4; k++) ell(ctx, x + bend + (k % 2 ? 1.2 : -1.2) + (c.id === 'rice' ? k : 0), -h + 1 + k * 2.6, 1.6, 2.2, c.fruit, false, k % 2 ? 0.5 : -0.5);
        }
      }
      break;
    case 'sugarcane':
      for (const x of [-7, 0, 7, -3, 4]) {
        const h = (36 + (x % 3) * 3) * s;
        ctx.strokeStyle = mature ? c.fruit : c.leaf;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, 1); ctx.lineTo(x, -h); ctx.stroke();
        ctx.strokeStyle = '#7a8a3a';
        ctx.lineWidth = 0.8;
        for (let y = -6; y > -h; y -= 7) { ctx.beginPath(); ctx.moveTo(x - 1.6, y); ctx.lineTo(x + 1.6, y); ctx.stroke(); }
        leaf(ctx, x, -h + 4, 12 * s, 2.5, x < 0 ? -0.8 : 0.8, c.leaf);
      }
      break;
    case 'asparagus':
      for (const x of [-8, -4, 0, 4, 8, -2, 3]) {
        const h = (14 + ((x * 13) % 7)) * s;
        ctx.strokeStyle = c.fruit;
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(x, 1); ctx.lineTo(x, -h); ctx.stroke();
        if (mature) ell(ctx, x, -h - 1, 1.8, 3, shade(c.fruit, -0.2), true);
      }
      if (mature) for (const x of [-12, 11]) { stem(ctx, x, 1, x, -26, '#6aa84a', 0.8); for (let k = 0; k < 5; k++) leaf(ctx, x, -8 - k * 4, 6, 1, k % 2 ? 0.8 : -0.8, '#8fd06a'); }
      break;
  }
}

function drawFlower(ctx: CanvasRenderingContext2D, c: CropDef, mature: boolean) {
  moundShadow(ctx, 12);
  const s = mature ? 1 : 0.7;
  const heads: [number, number][] = [[-7, -18], [6, -22], [0, -13]];
  for (const [x, y] of heads) stem(ctx, x * 0.3, 1, x, y * s, '#3f8a2a', 1.4);
  leaf(ctx, 0, 0, 12 * s, 4, -0.8, c.leaf);
  leaf(ctx, 0, 0, 12 * s, 4, 0.9, shade(c.leaf, 0.1));
  if (!mature) {
    for (const [x, y] of heads) ell(ctx, x, y * s, 2, 3, shade(c.leaf, 0.2));
    return;
  }
  heads.forEach(([x, y], i) => {
    switch (c.id) {
      case 'chamomile': case 'gerbera': {
        const n = c.id === 'gerbera' ? 14 : 11;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          ell(ctx, x + Math.cos(a) * 4.5, y + Math.sin(a) * 3, 3, 1.2, c.fruit, true, a);
        }
        ell(ctx, x, y, 2.6, 2.2, c.fruit2!);
        break;
      }
      case 'violet': case 'orchid': {
        const n = 5;
        const r = c.id === 'orchid' ? 4 : 3;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 - Math.PI / 2;
          ell(ctx, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.7, r * 0.75, r * 0.55, k === 2 && c.id === 'orchid' ? shade(c.fruit, -0.2) : c.fruit, true, a);
        }
        ell(ctx, x, y, 1.3, 1.3, c.fruit2!);
        break;
      }
      case 'rose': {
        ball(ctx, x, y, 4.2, c.fruit);
        ctx.strokeStyle = shade(c.fruit, -0.4);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 1.6);
        ctx.stroke();
        break;
      }
      case 'tulip': {
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x - 1.5, y - 1);
        ctx.lineTo(x, y - 5);
        ctx.lineTo(x + 1.5, y - 1);
        ctx.lineTo(x + 4, y - 4);
        ctx.quadraticCurveTo(x + 4, y + 4, x, y + 4);
        ctx.quadraticCurveTo(x - 4, y + 4, x - 4, y - 4);
        ctx.fillStyle = i === 1 ? shade(c.fruit, -0.08) : c.fruit;
        ctx.fill();
        ctx.strokeStyle = shade(c.fruit, -0.45);
        ctx.lineWidth = 0.8;
        ctx.stroke();
        break;
      }
    }
  });
}

export const CROP_W = 64, CROP_H = 84, CROP_AX = 32, CROP_AY = 66;

/** Painted crop for a stage; the gerbera has no young picture of its own and borrows the chamomile's. */
function cropArt(cropId: string, stage: number): Sprite | null {
  switch (stage) {
    case 1: return artSprite('sprout', 20, 18, 0.95);
    case 2: return artSprite(`crop-${cropId}-young`, 40, 46, 0.95) ?? (cropId === 'gerbera' ? artSprite('crop-chamomile-young', 40, 46, 0.95) : null);
    case 3: return artSprite(`crop-${cropId}`, 54, 66, 0.95);
    case 4: return artSprite('withered', 38, 44, 0.95);
    case 5: return artSprite('stubble', 34, 26, 0.9);
  }
  return null;
}

/** stage: 0 seeds, 1 sprout, 2 growing, 3 ripe, 4 withered, 5 harvested */
export function cropSprite(cropId: string, stage: number): Sprite {
  const painted = cropArt(cropId, stage);
  if (painted) return painted;
  const c = cropById[cropId];
  return sprite(`crop:${cropId}:${stage}`, CROP_W, CROP_H, CROP_AX, CROP_AY, (ctx) => {
    if (stage === 0) return drawSeeds(ctx);
    if (stage === 1) return drawSprout(ctx, c);
    if (stage >= 4) return drawWithered(ctx, stage === 5);
    const mature = stage === 3;
    ({ root: drawRoot, bush: drawBush, ground: drawGround, tall: drawTall, flower: drawFlower })[c.kind](ctx, c, mature);
  });
}

/* ---------------- trees ---------------- */

function trunk(ctx: CanvasRenderingContext2D, h: number, w: number, color = '#8a5a2e') {
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.quadraticCurveTo(-w * 0.6, -h * 0.5, -w * 0.5, -h);
  ctx.lineTo(w * 0.5, -h);
  ctx.quadraticCurveTo(w * 0.6, -h * 0.5, w, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function canopy(ctx: CanvasRenderingContext2D, cy: number, r: number, leafC: string) {
  const blobs: [number, number, number][] = [[-0.55, 0.15, 0.6], [0.55, 0.15, 0.6], [0, -0.35, 0.68], [-0.3, 0.35, 0.6], [0.3, 0.38, 0.6], [0, 0.05, 0.7]];
  for (const [bx, by, br] of blobs) {
    const x = bx * r, y = cy + by * r, rr = br * r;
    const g = ctx.createRadialGradient(x - rr * 0.4, y - rr * 0.5, rr * 0.1, x, y, rr);
    g.addColorStop(0, shade(leafC, 0.3));
    g.addColorStop(1, shade(leafC, -0.25));
    ell(ctx, x, y, rr, rr * 0.9, g as unknown as string);
  }
}

const FRUIT_SPOTS: [number, number][] = [[-0.5, 0.1], [0.45, -0.05], [0.05, -0.45], [-0.2, 0.45], [0.35, 0.4], [-0.55, -0.3], [0.6, 0.3], [0.1, 0.1]];

export const TREE_BOX = { w: 84, h: 112 };

export function treeSprite(id: string, ready: boolean): Sprite {
  // both pictures must be there, otherwise a tree would switch styles when it ripens
  if (art(`tree-${id}`) && art(`tree-${id}-bare`)) return artSprite(ready ? `tree-${id}` : `tree-${id}-bare`, TREE_BOX.w, TREE_BOX.h, 0.97)!;
  const t = treeById[id];
  return sprite(`tree:${id}:${ready}`, 90, 130, 45, 112, (ctx) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,40,10,0.28)';
    ctx.fill();
    drawTree(ctx, t, ready);
  });
}

function drawTree(ctx: CanvasRenderingContext2D, t: TreeDef, ready: boolean) {
  switch (t.kind) {
    case 'fruit': case 'oak': {
      const big = t.kind === 'oak';
      trunk(ctx, big ? 40 : 34, big ? 7 : 5);
      const cy = big ? -64 : -56, r = big ? 34 : 27;
      canopy(ctx, cy, r, t.leaf);
      if (ready) for (const [fx, fy] of FRUIT_SPOTS) {
        if (t.id === 'oak') { ell(ctx, fx * r, cy + fy * r, 2.4, 3.2, t.fruit); ell(ctx, fx * r, cy + fy * r - 2.6, 2.6, 1.3, '#6a4a1a', false); }
        else ball(ctx, fx * r, cy + fy * r, t.id === 'cherry' || t.id === 'rowan' ? 3 : 4.4, t.fruit);
      }
      break;
    }
    case 'bush': {
      bushMound(ctx, t.leaf, 2.0, 0);
      if (ready) for (const [fx, fy] of FRUIT_SPOTS) ball(ctx, fx * 18, -18 + fy * 14, 2.8, t.fruit);
      break;
    }
    case 'conifer': {
      trunk(ctx, 14, 4, '#6a4a2a');
      for (let i = 0; i < 4; i++) {
        const y = -12 - i * 18, w = 30 - i * 6;
        ctx.beginPath();
        ctx.moveTo(-w, y);
        ctx.quadraticCurveTo(0, y + 6, w, y);
        ctx.lineTo(0, y - 30);
        ctx.closePath();
        const g = ctx.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, shade(t.leaf, 0.25));
        g.addColorStop(1, shade(t.leaf, -0.25));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = shade(t.leaf, -0.5);
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      if (ready) for (const [x, y] of [[-12, -20], [10, -34], [-6, -50], [7, -66]]) ell(ctx, x, y, 2.6, 4, t.fruit);
      break;
    }
    case 'palm': {
      ctx.strokeStyle = '#9a6a3a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-8, -40, 4, -78);
      ctx.stroke();
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 1;
      for (let y = -8; y > -74; y -= 7) { ctx.beginPath(); ctx.moveTo(-5 + y * 0.03, y); ctx.lineTo(4 + y * 0.03, y - 2); ctx.stroke(); }
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.5;
        leaf(ctx, 4, -78, 32, 7, a + Math.PI / 2, i % 2 ? t.leaf : shade(t.leaf, -0.12));
      }
      if (ready) {
        if (t.id === 'banana') for (let k = 0; k < 5; k++) ell(ctx, -2 + k * 2, -68 + (k % 2) * 3, 2.2, 6, t.fruit, true, 0.4);
        else for (const [x, y] of [[-3, -72], [2, -70], [6, -73], [0, -67], [4, -66]]) ball(ctx, x, y, 2.6, t.fruit);
      }
      break;
    }
    case 'birch': {
      trunk(ctx, 52, 4.5, '#f2f0e6');
      ctx.fillStyle = '#2a2a2a';
      for (const [x, y] of [[-3, -8], [1, -18], [-2, -30], [2, -42]]) ctx.fillRect(x, y, 3, 1.4);
      canopy(ctx, -66, 24, t.leaf);
      if (ready) { ctx.fillStyle = '#9ad0ff'; ell(ctx, 6, -10, 3, 4, '#bfe6ff'); }
      break;
    }
    case 'stump': {
      ctx.beginPath();
      ctx.ellipse(0, -14, 13, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e8c48a';
      ctx.fill();
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(-13, -14, 26, 14);
      ell(ctx, 0, 0, 13, 6, '#7a4a22');
      ell(ctx, 0, -14, 13, 6, '#e8c48a');
      ctx.strokeStyle = '#b08a52';
      for (const r of [4, 8]) { ctx.beginPath(); ctx.ellipse(0, -14, r, r * 0.46, 0, 0, Math.PI * 2); ctx.stroke(); }
      const shrooms: [number, number, number][] = ready ? [[-14, 2, 1], [-9, 4, 0.8], [12, 3, 1], [16, 0, 0.8], [6, -16, 0.9], [-5, -17, 0.8]] : [[-12, 2, 0.6], [13, 2, 0.6]];
      for (const [x, y, s] of shrooms) {
        ctx.fillStyle = '#f6e8c8';
        ctx.fillRect(x - 1.2 * s, y - 7 * s, 2.4 * s, 7 * s);
        ell(ctx, x, y - 7 * s, 5 * s, 3 * s, t.fruit);
      }
      break;
    }
  }
}

/* ---------------- buildings ---------------- */

/** Isometric box with a gable roof; the origin is the front corner of its base. */
export function drawBox(ctx: CanvasRenderingContext2D, w: number, h: number, height: number, wall: string, roof: string, opts: { roofH?: number; glass?: boolean } = {}) {
  // base vertices relative to the front (bottom) corner
  const base = iso(w, h);
  const P = (x: number, y: number, z: number) => { const p = iso(x, y); return { x: p.x - base.x, y: p.y - base.y - z }; };
  const L = P(0, h, 0), B = P(w, h, 0), R = P(w, 0, 0);
  const Lt = P(0, h, height), Bt = P(w, h, height), Rt = P(w, 0, height);
  const alpha = opts.glass ? 0.55 : 1;
  ctx.globalAlpha = alpha;
  // left wall (lit) and right wall (darker)
  const face = (pts: { x: number; y: number }[], fill: string) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,5,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  face([L, B, Bt, Lt], shade(wall, 0.05));
  face([B, R, Rt, Bt], shade(wall, -0.18));
  if (!opts.glass) {
    // planks/logs
    ctx.strokeStyle = 'rgba(60,30,10,0.25)';
    ctx.lineWidth = 0.8;
    for (let z = 6; z < height; z += 6) {
      const a = P(0, h, z), b = P(w, h, z), c = P(w, 0, z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // roof: the ridge runs along the longer side
  const rh = opts.roofH ?? 26;
  const e = 0.12; // overhang
  const alongX = w >= h;
  const top = (x: number, y: number) => P(x, y, height);
  const ridge = alongX
    ? [P(-e, h / 2, height + rh), P(w + e, h / 2, height + rh)]
    : [P(w / 2, -e, height + rh), P(w / 2, h + e, height + rh)];
  const roofC = opts.glass ? 'rgba(220,245,255,0.6)' : roof;
  if (alongX) {
    const back = [top(-e, -e), top(w + e, -e), ridge[1], ridge[0]];
    const gable = [top(w, 0), top(w, h), ridge[1]];
    const front = [top(-e, h + e), top(w + e, h + e), ridge[1], ridge[0]];
    face(back, shade(roofC, -0.25));
    face(gable, opts.glass ? 'rgba(200,240,255,0.5)' : shade(wall, -0.25));
    face(front, roofC);
  } else {
    const back = [top(-e, -e), top(-e, h + e), ridge[1], ridge[0]];
    const gable = [top(0, h), top(w, h), ridge[1]];
    const front = [top(w + e, -e), top(w + e, h + e), ridge[1], ridge[0]];
    face(back, shade(roofC, -0.25));
    face(front, shade(roofC, -0.12));
    face(gable, opts.glass ? 'rgba(200,240,255,0.5)' : shade(wall, 0.05));
  }
  if (!opts.glass && roof !== wall) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    const f = alongX ? [top(-e, h + e), top(w + e, h + e)] : [top(w + e, -e), top(w + e, h + e)];
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      ctx.beginPath();
      ctx.moveTo(f[0].x + (ridge[0].x - f[0].x) * t, f[0].y + (ridge[0].y - f[0].y) * t);
      ctx.lineTo(f[1].x + (ridge[1].x - f[1].x) * t, f[1].y + (ridge[1].y - f[1].y) * t);
      ctx.stroke();
    }
  }
  return { L, B, R, Lt, Bt };
}

export function buildingSprite(id: string, w: number, h: number, wall: string, roof: string): Sprite {
  const W = (w + h) * (TW / 2) + 20;
  const H = (w + h) * (TH / 2) + 110;
  const ax = w * (TW / 2) + 10;
  return sprite(`bld:${id}`, W, H, ax, H - 6, (ctx) => {
    const glass = id === 'greenhouse';
    const height = glass ? 26 : id === 'mill' ? 52 : 36;
    const { L, B } = drawBox(ctx, w, h, height, wall, roof, { glass, roofH: glass ? 18 : 26 });
    if (!glass) {
      // door on the left wall
      const mx = (L.x + B.x) / 2, my = (L.y + B.y) / 2;
      ctx.beginPath();
      ctx.moveTo(mx - 6, my - 3);
      ctx.lineTo(mx + 6, my + 3);
      ctx.lineTo(mx + 6, my - 17);
      ctx.lineTo(mx - 6, my - 23);
      ctx.closePath();
      ctx.fillStyle = '#5a3418';
      ctx.fill();
      ctx.strokeStyle = '#2a1608';
      ctx.stroke();
      // window
      ctx.beginPath();
      ctx.moveTo(mx - 22, my - 22);
      ctx.lineTo(mx - 13, my - 17.5);
      ctx.lineTo(mx - 13, my - 27.5);
      ctx.lineTo(mx - 22, my - 32);
      ctx.closePath();
      ctx.fillStyle = '#bfe6ff';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // beds inside the greenhouse
      for (let i = 0; i < 6; i++) {
        const p = iso(0.5 + (i % 2), 0.5 + Math.floor(i / 2));
        const base = iso(w, h);
        ell(ctx, p.x - base.x, p.y - base.y - 2, 9, 4, 'rgba(110,70,30,0.6)', false);
      }
    }
  });
}

/* ---------------- house ---------------- */

export function houseSprite(): Sprite {
  const w = 3, h = 3;
  const W = (w + h) * (TW / 2) + 40;
  const H = 230;
  return sprite('house', W, H, h * (TW / 2) + 20, H - 10, (ctx) => {
    const base = iso(w, h);
    const P = (x: number, y: number, z: number) => { const p = iso(x, y); return { x: p.x - base.x, y: p.y - base.y - z }; };
    const height = 58;
    const face = (pts: { x: number; y: number }[], fill: string | CanvasGradient) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,25,8,0.6)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    };
    // foundation
    face([P(-0.1, h + 0.1, 0), P(w + 0.1, h + 0.1, 0), P(w + 0.1, -0.1, 0), P(w + 0.1, -0.1, 6), P(w + 0.1, h + 0.1, 6), P(-0.1, h + 0.1, 6)], '#8a8a80');
    // log walls
    const L = P(0, h, 6), B = P(w, h, 6), R = P(w, 0, 6);
    const Lt = P(0, h, height), Bt = P(w, h, height), Rt = P(w, 0, height);
    face([L, B, Bt, Lt], '#a8703a');
    face([B, R, Rt, Bt], '#86552a');
    for (let z = 12; z < height; z += 7) {
      for (const [a, b, col] of [[P(0, h, z), P(w, h, z), '#c88a4a'], [P(w, h, z), P(w, 0, z), '#a06a35']] as const) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(60,30,10,0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y + 2);
        ctx.lineTo(b.x, b.y + 2);
        ctx.stroke();
      }
    }
    // porch, door and windows
    const door = (x: number, z: number, ww: number, hh: number, fill: string) => {
      const a = P(x, h, z), b = P(x + ww, h, z);
      face([a, b, { x: b.x, y: b.y - hh }, { x: a.x, y: a.y - hh }], fill);
    };
    door(1.15, 6, 0.7, 34, '#5a3016');
    door(0.25, 22, 0.6, 18, '#9ed8ff');
    door(2.1, 22, 0.6, 18, '#9ed8ff');
    const winR = (y: number) => { const a = P(w, y, 22), b = P(w, y - 0.6, 22); face([a, b, { x: b.x, y: b.y - 18 }, { x: a.x, y: a.y - 18 }], '#7ab8e0'); };
    winR(2.2);
    winR(1.0);
    // thatched roof
    const e = 0.35, er = 0.1, rh = 62; // overhang at the eaves and (smaller) along the ridge
    const top = (x: number, y: number) => P(x, y, height);
    // on the right the roof ends exactly at the gable so no slope sticks out past it
    const r0 = P(-er, h / 2, height + rh), r1 = P(w, h / 2, height + rh);
    face([top(-er, -e), top(w, 0), r1, r0], '#b8923a'); // right edge of the back slope matches the gable
    face([top(w, 0), top(w, h), r1], '#86552a');
    const fl = top(-er, h + e), fr = top(w, h + e);
    const g = ctx.createLinearGradient(0, r0.y, 0, fl.y);
    g.addColorStop(0, '#f2d27a');
    g.addColorStop(1, '#d8a84a');
    face([fl, fr, r1, r0], g);
    ctx.strokeStyle = 'rgba(140,95,30,0.55)';
    ctx.lineWidth = 0.9;
    for (let k = 0; k <= 26; k++) {
      const t = k / 26;
      const a = { x: fl.x + (fr.x - fl.x) * t, y: fl.y + (fr.y - fl.y) * t };
      const b = { x: r0.x + (r1.x - r0.x) * t, y: r0.y + (r1.y - r0.y) * t };
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * 0.95, a.y + (b.y - a.y) * 0.95); ctx.stroke();
    }
    // straw fringe along the edge
    ctx.strokeStyle = '#c8963a';
    ctx.lineWidth = 1.2;
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const x = fl.x + (fr.x - fl.x) * t, y = fl.y + (fr.y - fl.y) * t;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + 5 + (k % 3)); ctx.stroke();
    }
    // chimney
    const ch = P(2.2, 0.9, height + 40);
    ctx.fillStyle = '#9a5a3a';
    ctx.fillRect(ch.x - 5, ch.y - 16, 10, 26);
    ctx.strokeStyle = '#4a2a1a';
    ctx.strokeRect(ch.x - 5, ch.y - 16, 10, 26);
  });
}

/* ---------------- item icons (for the UI) ---------------- */

const iconCache = new Map<string, string>();

/** Crop picture for the UI: the painted one if it exists, otherwise a rendered sprite. */
export function cropIconURL(cropId: string): string {
  const painted = artURL(`crop-${cropId}`);
  if (painted) return painted;
  let url = iconCache.get(cropId);
  if (url) return url;
  const s = cropSprite(cropId, 3);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const ctx = c.getContext('2d')!;
  // the plant fills the sprite down to the ground line (plus some shadow): fit it into a square
  const srcH = (CROP_AY + 8) / CROP_H;
  const dw = 96 * (CROP_W / (CROP_AY + 8));
  ctx.drawImage(s.canvas, 0, 0, s.canvas.width, s.canvas.height * srcH, (96 - dw) / 2, 0, dw, 96);
  url = c.toDataURL();
  iconCache.set(cropId, url);
  return url;
}

export function treeIconURL(treeId: string): string {
  const painted = artURL(`tree-${treeId}`);
  if (painted) return painted;
  const k = 'tree:' + treeId;
  let url = iconCache.get(k);
  if (url) return url;
  const s = treeSprite(treeId, true);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  c.getContext('2d')!.drawImage(s.canvas, 0, 0, s.canvas.width, s.canvas.height, 14, 0, 68, 96);
  url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}

/* ---------------- emoji as sprites ---------------- */

export function emojiSprite(emoji: string, size: number): Sprite {
  return sprite(`emoji:${emoji}:${size}`, size * 1.4, size * 1.4, size * 0.7, size * 1.25, (ctx) => {
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(emoji, 0, -size * 0.12);
  });
}

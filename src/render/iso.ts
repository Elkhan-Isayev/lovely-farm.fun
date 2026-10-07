// 2:1 isometry like the Flash farm: a 64×32 px cell.
export const TW = 64;
export const TH = 32;

/** Corner of cell (x, y): the top vertex of its diamond. */
export const iso = (x: number, y: number) => ({ x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) });

/** Cell centre. */
export const cellCenter = (x: number, y: number) => iso(x + 0.5, y + 0.5);

/** World point → fractional cell coordinates. */
export const unIso = (wx: number, wy: number) => ({
  x: wy / TH + wx / TW,
  y: wy / TH - wx / TW,
});

export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) {
  const a = iso(x, y), b = iso(x + w, y), c = iso(x + w, y + h), d = iso(x, y + h);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

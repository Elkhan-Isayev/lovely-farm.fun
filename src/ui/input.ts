// Mouse, touch and keyboard: drag pans, click acts, wheel/pinch zooms.
import type { Controller, ToolId } from './controller';
import type { Renderer } from '../render/renderer';
import type { Hud } from './hud';

const DRAG = 6;
const KEYS: Record<string, ToolId> = { '1': 'hand', '2': 'shovel', '3': 'seed', '4': 'water', '5': 'fertilize', '6': 'move', '7': 'store' };

export class Input {
  private pointers = new Map<number, { x: number; y: number }>();
  private down: { x: number; y: number; moved: boolean } | null = null;
  private pinch = 0;
  private detach: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, r: Renderer, ctrl: Controller, hud: Hud, isModalOpen: () => boolean) {
    const pos = (e: PointerEvent | WheelEvent) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      this.detach.push(() => el.removeEventListener(ev, fn as EventListener));
    };

    on(canvas, 'pointerdown', (e) => {
      const p = pos(e);
      this.pointers.set(e.pointerId, p);
      canvas.setPointerCapture?.(e.pointerId);
      if (this.pointers.size === 1) this.down = { ...p, moved: false };
      else { this.down = null; this.pinch = this.pinchDist(); }
    });
    on(canvas, 'pointermove', (e) => {
      const p = pos(e);
      const prev = this.pointers.get(e.pointerId);
      if (prev && this.pointers.size === 2) {
        this.pointers.set(e.pointerId, p);
        const d = this.pinchDist();
        if (this.pinch) r.zoomAt(p.x, p.y, d / this.pinch);
        this.pinch = d;
        return;
      }
      if (prev && this.down) {
        if (!this.down.moved && Math.hypot(p.x - this.down.x, p.y - this.down.y) > DRAG) this.down.moved = true;
        if (this.down.moved) r.pan(p.x - prev.x, p.y - prev.y);
        this.pointers.set(e.pointerId, p);
        canvas.style.cursor = this.down.moved ? 'grabbing' : '';
        return;
      }
      ctrl.hover(p.x, p.y);
      const cell = r.cellAt(p.x, p.y);
      hud.tooltip(p.x, p.y, cell, r.pick(p.x, p.y));
    });
    const up = (e: PointerEvent) => {
      const p = pos(e);
      const wasClick = this.down && !this.down.moved && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = 0;
      canvas.style.cursor = '';
      this.down = null;
      if (wasClick && e.type === 'pointerup') {
        ctrl.hover(p.x, p.y);
        ctrl.click(p.x, p.y);
      }
    };
    on(canvas, 'pointerup', up);
    on(canvas, 'pointercancel', up);
    on(canvas, 'pointerleave', () => hud.tooltip(0, 0, null, null));
    on(canvas, 'wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      r.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    on(canvas, 'contextmenu', (e) => { e.preventDefault(); ctrl.cancel(); });
    on(window, 'keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || isModalOpen()) return;
      if (e.key === 'Escape') ctrl.cancel();
      else if (KEYS[e.key]) ctrl.setTool(KEYS[e.key]);
    });
  }

  private pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  dispose() { this.detach.forEach((f) => f()); this.detach = []; }
}

import { describe, expect, it, vi } from 'vitest';
import { Hud } from '../src/ui/hud';
import { Input } from '../src/ui/input';
import { makeCtx } from './helpers';

function setup(modal = false) {
  const { ctx, renderer } = makeCtx();
  const hud = new Hud(ctx);
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, x: 0, y: 0, toJSON() {} });
  const input = new Input(canvas, renderer, ctx.ctrl, hud, () => modal);
  const ctrl = ctx.ctrl;
  const spies = {
    click: vi.spyOn(ctrl, 'click').mockImplementation(() => {}),
    hover: vi.spyOn(ctrl, 'hover'),
    pan: vi.spyOn(renderer, 'pan'),
    zoom: vi.spyOn(renderer, 'zoomAt'),
    tip: vi.spyOn(hud, 'tooltip'),
  };
  const pe = (type: string, x: number, y: number, id = 1) => canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true }));
  return { canvas, input, ctrl, spies, pe, renderer };
}

describe('input', () => {
  it('a click without movement acts', () => {
    const { spies, pe } = setup();
    pe('pointerdown', 100, 100);
    pe('pointerup', 102, 101);
    expect(spies.click).toHaveBeenCalledWith(102, 101);
    expect(spies.pan).not.toHaveBeenCalled();
  });

  it('dragging pans instead of clicking', () => {
    const { spies, pe, canvas } = setup();
    pe('pointerdown', 100, 100);
    pe('pointermove', 103, 100);
    expect(spies.pan).not.toHaveBeenCalled();
    pe('pointermove', 130, 100);
    expect(spies.pan).toHaveBeenCalledWith(27, 0);
    expect(canvas.style.cursor).toBe('grabbing');
    pe('pointerup', 130, 100);
    expect(spies.click).not.toHaveBeenCalled();
    expect(canvas.style.cursor).toBe('');
  });

  it('moving without a press hovers and shows a tooltip; leaving hides it', () => {
    const { spies, pe, canvas } = setup();
    pe('pointermove', 50, 60);
    expect(spies.hover).toHaveBeenCalledWith(50, 60);
    expect(spies.tip).toHaveBeenCalled();
    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    expect(spies.tip).toHaveBeenLastCalledWith(0, 0, null, null);
  });

  it('two-finger pinch zooms; a cancelled gesture does not click', () => {
    const { spies, pe } = setup();
    pe('pointerdown', 100, 100, 1);
    pe('pointerdown', 200, 100, 2);
    pe('pointermove', 250, 100, 2);
    expect(spies.zoom).toHaveBeenCalled();
    expect(spies.zoom.mock.calls[0][2]).toBeCloseTo(1.5);
    pe('pointercancel', 250, 100, 2);
    pe('pointerup', 100, 100, 1);
    expect(spies.click).not.toHaveBeenCalled();
  });

  it('mouse wheel zooms; right click cancels the tool', () => {
    const { spies, canvas, ctrl } = setup();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 10, clientY: 10, cancelable: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 10, clientY: 10, cancelable: true }));
    expect(spies.zoom.mock.calls[0][2]).toBeCloseTo(1.1);
    expect(spies.zoom.mock.calls[1][2]).toBeCloseTo(1 / 1.1);
    ctrl.setTool('shovel');
    canvas.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }));
    expect(ctrl.tool).toBe('hand');
  });

  it('keys 1–7 and Esc; ignored in inputs and while a window is open', () => {
    const { ctrl, input } = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(ctrl.tool).toBe('shovel');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctrl.tool).toBe('hand');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
    expect(ctrl.tool).toBe('hand');
    input.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    expect(ctrl.tool).toBe('hand');
    const m = setup(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    expect(m.ctrl.tool).toBe('hand');
  });
});

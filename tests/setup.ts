// Global test setup: a fake canvas 2D context (happy-dom doesn't draw), clean storage, English locale.
import { afterEach, beforeEach, vi } from 'vitest';
import { setLang } from '../src/i18n';
import { closeModal } from '../src/ui/modal';

export interface FakeCtx extends CanvasRenderingContext2D { calls: string[] }

/** A context that accepts any call and records its name. */
export function fakeContext(): FakeCtx {
  const calls: string[] = [];
  const props: Record<string | symbol, unknown> = { calls };
  const gradient = { addColorStop: () => {} };
  return new Proxy(props, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => { calls.push(String(prop)); return gradient; };
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'canvas') return document.createElement('canvas');
      return (..._args: unknown[]) => { calls.push(String(prop)); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as FakeCtx;
}

const browserLike = typeof HTMLCanvasElement !== 'undefined'; // server tests run in the node environment

if (browserLike) {
  const proto = HTMLCanvasElement.prototype as any;
  proto.getContext = function getContext() {
    this.__ctx ??= fakeContext();
    return this.__ctx;
  };
  proto.toDataURL = () => 'data:image/png;base64,AAAA';
  proto.setPointerCapture = () => {};
}

beforeEach(() => {
  if (!browserLike) return;
  closeModal();
  try { localStorage.clear(); } catch { /* ignore */ }
  setLang('en');
  document.body.innerHTML = '<canvas id="world"></canvas><div id="ui"></div>';
});

afterEach(() => {
  vi.useRealTimers();
});

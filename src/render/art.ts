// Painted sprites: public/art/<id>.webp, generated with Higgsfield and cut by scripts/art/slice.py.
// They load in the background; until a picture arrives (or if it fails, and in unit tests)
// the renderer falls back to the procedural sprites from sprites.ts.
import { ART } from './artManifest';

const loaded = new Map<string, HTMLImageElement>();
const started = new Set<string>();

export const ART_DIR = '/art/';

export function hasArt(id: string): boolean {
  return id in ART;
}

/** Public URL of a painted sprite, or '' when there is none. */
export function artURL(id: string): string {
  return hasArt(id) ? `${ART_DIR}${id}.webp` : '';
}

/** Size of the sprite fitted into a maxW×maxH box, keeping its proportions. */
export function artFit(id: string, maxW: number, maxH: number): { w: number; h: number } {
  const [nw, nh] = ART[id];
  const k = Math.min(maxW / nw, maxH / nh);
  return { w: nw * k, h: nh * k };
}

/** The loaded picture, or null (and the download starts) if it isn't ready yet. */
export function art(id: string): HTMLImageElement | null {
  const img = loaded.get(id);
  if (img) return img;
  if (hasArt(id) && !started.has(id)) void load(id);
  return null;
}

function load(id: string): Promise<void> {
  started.add(id);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { loaded.set(id, img); resolve(); };
    img.onerror = () => resolve(); // keep the procedural fallback
    img.src = artURL(id);
  });
}

/** Start downloading every painted sprite; resolves when all have loaded or failed. */
export function preloadArt(): Promise<void> {
  return Promise.all(Object.keys(ART).filter((id) => !started.has(id)).map(load)).then(() => {});
}

/** Put a picture into the loaded set directly (tests; also lets a caller inject custom art). */
export function setArt(id: string, img: HTMLImageElement | null) {
  if (img) loaded.set(id, img);
  else { loaded.delete(id); started.delete(id); }
}

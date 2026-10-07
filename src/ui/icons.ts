// Item icons for the UI: the painted picture where there is one, otherwise an emoji or a rendered sprite.
import { ITEMS, cropById, placeInfo, treeById } from '../data/items';
import { itemName, placeName } from '../i18n';
import { artURL } from '../render/art';
import { cropIconURL, treeIconURL } from '../render/sprites';
import { h } from './dom';

const img = (src: string, size: number, alt: string) => h('img', { class: 'ico', src, width: size, height: size, alt });

export function itemIcon(id: string, size = 32): HTMLElement {
  const it = ITEMS[id];
  // crops and fruit: the same picture as on the field, so the player recognises it
  if (cropById[id] && (artURL(`crop-${id}`) || !it?.emoji)) return img(cropIconURL(id), size, itemName(id));
  if (it?.emoji) return h('span', { class: 'ico', style: `font-size:${size * 0.82}px;width:${size}px;height:${size}px` }, it.emoji);
  // fruit without an emoji of its own: the fruiting tree
  if (id.startsWith('t_') && treeById[id.slice(2)]) return img(treeIconURL(id.slice(2)), size, itemName(id));
  return h('span', { class: 'ico', style: `font-size:${size * 0.8}px` }, '📦');
}

/** Painted picture id for something placed on the farm. */
export function placeArtId(key: string): string {
  const { kind, id } = placeInfo(key);
  return kind === 'building' ? `bld-${id}` : `${kind}-${id}`;
}

export function placeIcon(key: string, size = 40): HTMLElement {
  const info = placeInfo(key);
  const painted = artURL(placeArtId(key));
  if (painted) return img(painted, size, placeName(key));
  if (info.kind === 'tree' && !treeById[info.id].emoji) return img(treeIconURL(info.id), size, placeName(key));
  return h('span', { class: 'ico', style: `font-size:${size * 0.8}px;width:${size}px;height:${size}px` }, info.emoji);
}

// A tiny DOM helper, no framework.
import { locale, t } from '../i18n';
type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }

export function fmt(n: number) {
  return Math.round(n).toLocaleString(locale()).replace(/[,\u202f\u00a0]/g, ' ');
}

export function fmtDiamonds(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString(locale(), { maximumFractionDigits: 2 });
}

/** "2 h 15 min", "45 min", "30 s" — units in the player's language */
export function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const [D, H, M, S] = [t('unit.d'), t('unit.h'), t('unit.min'), t('unit.s')];
  if (d) return `${d} ${D} ${hh} ${H}`;
  if (hh) return m ? `${hh} ${H} ${m} ${M}` : `${hh} ${H}`;
  if (m) return `${m} ${M}`;
  return `${s} ${S}`;
}

export function fmtHours(hours: number) {
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24} ${t('unit.d')}`;
  return `${hours} ${t('unit.h')}`;
}

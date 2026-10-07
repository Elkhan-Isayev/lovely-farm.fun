import { t } from '../i18n';
import { clear, h } from './dom';

export interface Modal { el: HTMLElement; body: HTMLElement; close(): void; setBody(...nodes: (Node | null | false)[]): void }

let current: Modal | null = null;
let onCloseHook: (() => void) | null = null;

export function root() {
  let el = document.getElementById('ui');
  if (!el) { el = h('div', { id: 'ui' }); document.body.appendChild(el); }
  return el;
}

export function openModal(title: string, opts: { wide?: boolean; tabs?: { id: string; label: string }[]; tab?: string; onTab?: (id: string) => void; onClose?: () => void } = {}): Modal {
  closeModal();
  const body = h('div', { class: 'modal-body' });
  const tabs = opts.tabs
    ? h('div', { class: 'tabs' }, opts.tabs.map((t) =>
      h('button', {
        class: 'tab' + (t.id === opts.tab ? ' active' : ''),
        'data-tab': t.id,
        onclick: (e: Event) => {
          (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
          opts.onTab?.(t.id);
        },
      }, t.label)))
    : null;
  const close = () => {
    el.remove();
    if (current === m) current = null;
    opts.onClose?.();
    onCloseHook?.();
  };
  const el = h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === el) close(); } },
    h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' },
        h('h2', null, title),
        h('button', { class: 'close', 'aria-label': t('common.close'), onclick: close }, '✕')),
      tabs,
      body));
  const m: Modal = { el, body, close, setBody: (...nodes) => { clear(body); nodes.forEach((n) => n && body.appendChild(n)); } };
  root().appendChild(el);
  current = m;
  return m;
}

export function closeModal() { current?.close(); }
export function currentModal() { return current; }
export function onModalClose(fn: (() => void) | null) { onCloseHook = fn; }

export function toast(text: string, icon?: string) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts' }); root().appendChild(box); }
  const el = h('div', { class: 'toast' }, icon ? h('span', { class: 't-ico' }, icon) : null, h('span', null, text));
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild!.remove();
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

export function confirmBox(text: string, yes: string, onYes: () => void, onNo?: () => void) {
  const m = openModal(t('common.confirm'));
  m.setBody(
    h('p', { class: 'center' }, text),
    h('div', { class: 'row center' },
      h('button', { class: 'btn green', onclick: () => { m.close(); onYes(); } }, yes),
      h('button', { class: 'btn', onclick: () => { m.close(); onNo?.(); } }, t('common.cancel'))),
  );
  return m;
}

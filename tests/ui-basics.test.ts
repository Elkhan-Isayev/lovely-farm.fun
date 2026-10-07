import { describe, expect, it, vi } from 'vitest';
import { clear, fmt, fmtDiamonds, fmtHours, fmtTime, h } from '../src/ui/dom';
import { ART } from '../src/render/artManifest';
import { itemIcon, placeIcon } from '../src/ui/icons';
import { closeModal, confirmBox, currentModal, onModalClose, openModal, root, toast } from '../src/ui/modal';
import { setLang } from '../src/i18n';
import { $, $$, clickEl } from './helpers';

describe('DOM helper', () => {
  it('creates elements, attributes, events and children', () => {
    const onClick = vi.fn();
    const el = h('div', { class: 'a', id: 'x', title: 't', hidden: false, 'data-on': true, onclick: onClick, html: undefined, disabled: null },
      'text', 5, null, false, [h('span', null, 'inside'), [undefined]]);
    expect(el.className).toBe('a');
    expect(el.getAttribute('data-on')).toBe('');
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.textContent).toBe('text5inside');
    el.click();
    expect(onClick).toHaveBeenCalled();
    const btn = h('button', { disabled: true, html: '<b>x</b>' });
    expect(btn.disabled).toBe(true);
    expect(btn.innerHTML).toBe('<b>x</b>');
    clear(el);
    expect(el.childNodes).toHaveLength(0);
  });

  it('formats numbers and durations per language', () => {
    expect(fmt(1234567)).toBe('1 234 567');
    expect(fmtDiamonds(0.5)).toBe('0.5');
    expect(fmtTime(30_000)).toBe('30 s');
    expect(fmtTime(45 * 60_000)).toBe('45 min');
    expect(fmtTime(2 * 3_600_000)).toBe('2 h');
    expect(fmtTime(2 * 3_600_000 + 15 * 60_000)).toBe('2 h 15 min');
    expect(fmtTime(26 * 3_600_000)).toBe('1 d 2 h');
    expect(fmtTime(-5)).toBe('0 s');
    expect(fmtHours(48)).toBe('2 d');
    expect(fmtHours(36)).toBe('36 h');
    expect(fmtTime(90 * 60_000)).toBe('1 h 30 min');
    setLang('ru');
    expect(fmtDiamonds(1.5)).toBe('1,5'); // Russian uses a decimal comma
    setLang('de');
    expect(fmtHours(24)).toBe('1 T');
  });
});

describe('icons', () => {
  it('painted pictures, emoji, rendered sprites and the fallback', () => {
    expect((itemIcon('tomato') as HTMLImageElement).src).toContain('/art/crop-tomato.webp');
    expect(itemIcon('radish').tagName).toBe('IMG');
    expect((itemIcon('t_plum') as HTMLImageElement).src).toContain('/art/tree-plum.webp');
    expect(itemIcon('t_cherry').textContent).toBe('🍒'); // the fruit itself reads better than the tree
    expect(itemIcon('a_cow').textContent).toBe('🥛');
    expect(itemIcon('nope').textContent).toBe('📦');
    expect((placeIcon('tree:plum') as HTMLImageElement).src).toContain('/art/tree-plum.webp');
    expect((placeIcon('animal:cow') as HTMLImageElement).src).toContain('/art/animal-cow.webp');
    expect((placeIcon('building:mill') as HTMLImageElement).src).toContain('/art/bld-mill.webp');
    expect((placeIcon('decor:gnome') as HTMLImageElement).src).toContain('/art/decor-gnome.webp');
    expect(placeIcon('decor:path').textContent).toBe('🪨'); // the path is a ground texture, no picture
  });

  it('without painted pictures: emoji and rendered sprites', () => {
    const saved = { ...ART };
    for (const k of ['crop-tomato', 'crop-radish', 'tree-plum', 'animal-cow']) delete ART[k];
    try {
      expect(itemIcon('tomato').textContent).toBe('🍅');
      expect((itemIcon('radish') as HTMLImageElement).src).toMatch(/^data:image/);
      expect((itemIcon('t_plum') as HTMLImageElement).src).toMatch(/^data:image/);
      expect((placeIcon('tree:plum') as HTMLImageElement).src).toMatch(/^data:image/);
      expect(placeIcon('animal:cow').textContent).toBe('🐄');
    } finally {
      Object.assign(ART, saved);
    }
  });
});

describe('modals and toasts', () => {
  it('open, tabs, close via button and backdrop click', () => {
    const onTab = vi.fn(), onClose = vi.fn(), hook = vi.fn();
    onModalClose(hook);
    const m = openModal('Test', { wide: true, tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], tab: 'a', onTab, onClose });
    expect(currentModal()).toBe(m);
    expect($('.modal.wide')).not.toBeNull();
    clickEl($('[data-tab=b]'));
    expect(onTab).toHaveBeenCalledWith('b');
    expect($('[data-tab=b]').classList.contains('active')).toBe(true);
    m.setBody(h('p', null, 'x'), null, false);
    expect(m.body.textContent).toBe('x');
    clickEl($('.close'));
    expect(currentModal()).toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(hook).toHaveBeenCalled();
    onModalClose(null);
    openModal('Backdrop');
    $('.overlay').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(currentModal()).toBeNull();
    openModal('Inside');
    clickEl($('.modal-head h2'));
    expect(currentModal()).not.toBeNull();
    openModal('Replacement');
    expect($$('.overlay')).toHaveLength(1);
    closeModal();
    closeModal();
  });

  it('creates the UI root when missing', () => {
    document.getElementById('ui')!.remove();
    expect(root().id).toBe('ui');
  });

  it('toasts: at most four and they fade out', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 6; i++) toast('message ' + i, i % 2 ? '🎁' : undefined);
    expect($$('.toast')).toHaveLength(4);
    vi.advanceTimersByTime(2700);
    expect($$('.toast.out')).toHaveLength(4);
    vi.advanceTimersByTime(500);
    expect($$('.toast')).toHaveLength(0);
  });

  it('confirm dialog: yes and cancel', () => {
    const yes = vi.fn();
    confirmBox('Sure?', 'Yes', yes);
    clickEl($$('.modal button.btn')[1]);
    expect(yes).not.toHaveBeenCalled();
    confirmBox('Sure?', 'Yes', yes);
    clickEl($('.modal button.btn.green'));
    expect(yes).toHaveBeenCalled();
    expect(currentModal()).toBeNull();
  });
});

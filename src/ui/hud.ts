// Persistent UI: top bar, toolbar, neighbour strip, visit banner, tooltip.
import { cropById, placeInfo } from '../data/items';
import { name, personName, placeName, t, type MsgKey } from '../i18n';
import { levelProgress } from '../core/levels';
import { npcById } from '../core/neighbors';
import { SHOWCASES } from '../core/showcase';
import { HOUR, type FarmObject } from '../core/state';
import type { AppCtx } from './ctx';
import type { ToolId } from './controller';
import { clear, fmt, fmtDiamonds, fmtTime, h } from './dom';
import { itemIcon } from './icons';
import { openAchievements, openCellar, openGifts, openNeighbors, openOrders, openProfile, openSeeds, openShop, openStorage } from './panels';
import { root } from './modal';

const TOOLS: { id: ToolId; icon: string; key: string }[] = [
  { id: 'hand', icon: '✋', key: '1' },
  { id: 'shovel', icon: '🪏', key: '2' },
  { id: 'seed', icon: '🌱', key: '3' },
  { id: 'water', icon: '💧', key: '4' },
  { id: 'fertilize', icon: '🧪', key: '5' },
  { id: 'move', icon: '↔️', key: '6' },
  { id: 'store', icon: '📥', key: '7' },
];

export class Hud {
  el: HTMLElement;
  private top: HTMLElement;
  private tools: HTMLElement;
  private strip: HTMLElement;
  private banner: HTMLElement;
  private tip: HTMLElement;
  private hint: HTMLElement;
  ctx: AppCtx;

  constructor(ctx: AppCtx) {
    this.ctx = ctx;
    this.top = h('div', { class: 'topbar' });
    this.tools = h('div', { class: 'toolbar' });
    this.strip = h('div', { class: 'strip' });
    this.banner = h('div', { class: 'banner hidden' });
    this.tip = h('div', { class: 'tip hidden' });
    this.hint = h('div', { class: 'hint-bar hidden' });
    this.el = h('div', { class: 'hud' }, this.top, this.banner, this.hint, this.tools, this.strip, this.tip);
    root().appendChild(this.el);
    ctx.ctrl.onChange(() => this.update());
    this.update();
  }

  update() {
    this.drawTop();
    this.drawTools();
    this.drawStrip();
    this.drawBanner();
  }

  private drawTop() {
    const g = this.ctx.game;
    const lp = levelProgress(g.s.exp);
    const giftsN = g.s.gifts.length;
    const ordersReady = g.s.orders.filter((o) => g.hasInputs(o.items)).length;
    clear(this.top);
    this.top.append(
      h('button', { class: 'me', onclick: () => openProfile(this.ctx), title: t('nav.profile') },
        h('span', { class: 'lvl-star' }, String(lp.level)),
        h('div', { class: 'me-info' },
          h('div', { class: 'me-name' }, this.ctx.user?.name ?? t('hud.farmer')),
          h('div', { class: 'xp', title: t('hud.xp', { cur: fmt(lp.cur), need: fmt(lp.need) }) },
            h('div', { class: 'xp-fill', style: `width:${(lp.cur / lp.need) * 100}%` }),
            h('span', { class: 'xp-text' }, `${fmt(lp.cur)} / ${fmt(lp.need)}`)))),
      h('div', { class: 'money' },
        h('div', { class: 'pill gold', 'data-gold': g.s.gold }, '🪙 ', h('b', null, fmt(g.s.gold))),
        h('div', { class: 'pill gem', 'data-gems': g.s.diamonds }, '💎 ', h('b', null, fmtDiamonds(g.s.diamonds)))),
      h('div', { class: 'top-actions' },
        this.topBtn('📋', t('nav.orders'), () => openOrders(this.ctx), ordersReady),
        this.topBtn('🎁', t('nav.gifts'), () => openGifts(this.ctx), giftsN),
        this.topBtn('🏆', t('nav.achievements'), () => openAchievements(this.ctx), 0),
        ...this.soundBtns()),
    );
  }

  /** Music and sound switches (when the game has audio). */
  private soundBtns() {
    const audio = this.ctx.audio;
    if (!audio) return [];
    const btn = (which: 'music' | 'sfx', on: string, off: string, label: string) => {
      const enabled = audio.settings[which];
      const b = this.topBtn(enabled ? on : off, label, () => { audio.unlock(); audio.set(which, !audio.settings[which]); this.ctx.game.changed(); }, 0);
      b.dataset.sound = which;
      b.classList.toggle('off', !enabled);
      return b;
    };
    return [audio.music.available ? btn('music', '🎵', '🎵', t('nav.music')) : null, btn('sfx', '🔊', '🔇', t('nav.sounds'))].filter((b) => b !== null);
  }

  private topBtn(icon: string, label: string, fn: () => void, badge: number) {
    return h('button', { class: 'round', title: label, 'aria-label': label, onclick: fn }, icon, badge ? h('span', { class: 'badge' }, String(badge)) : null);
  }

  private drawTools() {
    const { ctrl, game } = this.ctx;
    clear(this.tools);
    if (game.visit) { this.tools.classList.add('hidden'); return; }
    this.tools.classList.remove('hidden');
    for (const tool of TOOLS) {
      const active = ctrl.tool === tool.id || (tool.id === 'hand' && ctrl.tool === 'place');
      const seedIco = tool.id === 'seed' ? itemIcon(ctrl.seed, 26) : null;
      const label = t(`tool.${tool.id}` as MsgKey);
      this.tools.appendChild(h('button', {
        class: 'tool' + (active ? ' active' : ''), 'data-tool': tool.id, title: `${label} (${tool.key})`,
        onclick: () => (tool.id === 'seed' ? openSeeds(this.ctx) : ctrl.setTool(tool.id)),
      }, seedIco ?? h('span', { class: 'ti' }, tool.icon), h('span', { class: 'tl' }, tool.id === 'seed' ? name('crop', ctrl.seed) : label)));
    }
    this.tools.appendChild(h('span', { class: 'sep' }));
    const nav: [string, string, MsgKey, () => void][] = [
      ['🛒', 'shop', 'nav.shop', () => openShop(this.ctx)],
      ['🥫', 'cellar', 'nav.cellar', () => openCellar(this.ctx)],
      ['📦', 'storage', 'nav.storage', () => openStorage(this.ctx)],
    ];
    for (const [icon, id, label, fn] of nav) {
      this.tools.appendChild(h('button', { class: 'tool nav', 'data-nav': id, onclick: fn }, h('span', { class: 'ti' }, icon), h('span', { class: 'tl' }, t(label))));
    }
    const pk = ctrl.placing?.key ?? ctrl.moving?.key;
    if (pk || ctrl.tool === 'move' || ctrl.tool === 'store') {
      this.hint.classList.remove('hidden');
      clear(this.hint);
      this.hint.append(
        pk ? t(ctrl.moving ? 'hint.moving' : 'hint.placing', { name: placeName(pk) }) : ctrl.tool === 'move' ? t('hint.pickMove') : t('hint.pickStore'),
        h('button', { class: 'btn small', onclick: () => ctrl.cancel() }, t('hint.done')));
    } else this.hint.classList.add('hidden');
  }

  private drawStrip() {
    const g = this.ctx.game;
    clear(this.strip);
    if (g.visit) return;
    // the showcase farms come first: every player has them
    for (const sc of SHOWCASES) {
      const title = t(`showcase.${sc.id}`);
      this.strip.appendChild(h('button', { class: 'nb showcase', 'data-showcase': sc.id, onclick: () => this.ctx.visitShowcase(sc.id), title: t('nb.visitTitle', { name: title }) },
        h('span', { class: 'nb-face', style: `background:${sc.color}` }, sc.face), h('span', { class: 'nb-lvl' }, '★'), h('span', { class: 'nb-name' }, title)));
    }
    for (const f of g.friends) {
      this.strip.appendChild(h('button', { class: 'nb friend', 'data-friend': f.id, onclick: () => void this.ctx.visitFriend(f), title: t('nb.visitTitle', { name: f.name }) },
        h('span', { class: 'nb-face' }, f.face), h('span', { class: 'nb-lvl' }, String(f.level)), h('span', { class: 'nb-name' }, f.name)));
    }
    for (const id of g.s.neighbors) {
      const n = npcById[id];
      this.strip.appendChild(h('button', { class: 'nb', 'data-npc': id, onclick: () => this.ctx.visitNpc(id), title: t('nb.visitTitle', { name: personName(n.name) }) },
        h('span', { class: 'nb-face', style: `background:${n.color}` }, n.face), h('span', { class: 'nb-lvl' }, String(n.level)), h('span', { class: 'nb-name' }, personName(n.name))));
    }
    this.strip.appendChild(h('button', { class: 'nb add', onclick: () => openNeighbors(this.ctx), title: t('nav.neighbors') },
      h('span', { class: 'nb-face' }, '➕'), h('span', { class: 'nb-name' }, this.ctx.incoming.length ? t('nav.requests', { n: this.ctx.incoming.length }) : t('nav.neighbors'))));
  }

  private drawBanner() {
    const g = this.ctx.game;
    if (!g.visit) { this.banner.classList.add('hidden'); return; }
    const tg = g.visit.target;
    const who = tg.type === 'npc' ? tg.npc : tg.type === 'friend' ? tg.friend : tg.showcase;
    this.banner.classList.remove('hidden');
    clear(this.banner);
    this.banner.append(
      h('span', { class: 'face' }, who.face),
      h('div', { class: 'grow' }, h('b', null, t('visit.farm', { name: g.visitName() })),
        h('div', { class: 'sub' }, tg.type === 'showcase' ? t(`showcase.${tg.showcase.id}About`) : t('visit.info', { level: who.level, n: g.helpLeft() }))),
      h('button', { class: 'btn green', 'data-home': '', onclick: () => this.ctx.goHome() }, t('visit.home')));
  }

  /** Tooltip next to the cursor: what grows there and how long is left. */
  tooltip(sx: number, sy: number, cell: { x: number; y: number } | null, obj: FarmObject | 'pet' | 'house' | null) {
    const text = this.tipText(cell, obj);
    if (!text) { this.tip.classList.add('hidden'); return; }
    this.tip.classList.remove('hidden');
    this.tip.textContent = text;
    this.tip.style.transform = `translate(${sx + 16}px, ${sy + 12}px)`;
  }

  tipText(cell: { x: number; y: number } | null, obj: FarmObject | 'pet' | 'house' | null): string {
    const g = this.ctx.game;
    const now = g.visit ? Date.now() : g.now();
    if (obj === 'pet') return g.s.pet.name;
    if (obj === 'house') return t('tip.house');
    if (obj) {
      const { kind, id } = placeInfo(obj.key);
      const nm = placeName(obj.key);
      if (kind === 'tree' || kind === 'animal') {
        const product = name(kind === 'tree' ? 'treeProduct' : 'animalProduct', id);
        if (!obj.readyAt || obj.readyAt <= now) return t('tip.ready', { name: nm, product });
        return t('tip.wait', { name: nm, product, time: fmtTime(obj.readyAt - now) });
      }
      return nm;
    }
    if (!cell) return '';
    const plots = g.visit ? g.visit.farm.plots : g.s.plots;
    const p = plots[`${cell.x},${cell.y}`];
    if (!p) return '';
    if (p.state === 'soil') return t('tip.soil');
    if (p.state === 'withered') return p.growth === -1 ? t('tip.harvested') : t('tip.withered');
    const c = cropById[p.crop!];
    const nm = name('crop', c.id);
    const left = c.hours * HOUR - p.growth;
    const flags = [p.pest ? t(p.pest === 'crow' ? 'tip.crow' : 'tip.toad') : '', !p.watered ? t('tip.needWater') : ''].filter(Boolean).join(', ');
    if (left <= 0) return t('tip.ripe', { name: nm, time: fmtTime(c.hours * HOUR * 2 - p.growth) });
    return t('tip.growing', { name: nm, time: fmtTime(left) }) + (flags ? ' · ' + flags : '');
  }
}


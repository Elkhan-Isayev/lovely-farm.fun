// Game windows: shop, seeds, cellar, storage, buildings, orders, neighbours, gifts, achievements, profile.
import {
  ACHIEVEMENTS, ANIMALS, BUILDINGS, CROPS, DECOR, ITEMS, MATERIALS, RECIPES, TREES,
  cropById, recipeById, type BuildingId,
} from '../data/items';
import { HELP_LIMIT, PET_NAME_RE, giftChoices, giftName, type Friend } from '../core/game';
import { expToNext } from '../core/levels';
import { NPCS, npcById } from '../core/neighbors';
import { SHOWCASES } from '../core/showcase';
import { HOUR, dayIndex, type FarmObject, type Look } from '../core/state';
import { LANGS, getLang, itemName, name, personName, placeName, setLang, t, type MsgKey } from '../i18n';
import type { AppCtx } from './ctx';
import { clear, fmt, fmtDiamonds, fmtHours, fmtTime, h } from './dom';
import { itemIcon, placeIcon } from './icons';
import { confirmBox, openModal, toast, type Modal } from './modal';

const coin = (n: number) => h('span', { class: 'price gold' }, fmt(n), ' 🪙');
const gem = (n: number) => h('span', { class: 'price gem' }, fmtDiamonds(n), ' 💎');
const lock = (lvl: number) => h('div', { class: 'lock' }, '🔒 ', t('common.level', { n: lvl }));

function card(opts: { icon: HTMLElement; title: string; lines: (Node | string)[]; locked?: number | false; onClick?: () => void; footer?: Node | null; dim?: boolean }) {
  return h('div', {
    class: 'card' + (opts.locked ? ' locked' : '') + (opts.dim ? ' dim' : ''),
    onclick: opts.locked ? undefined : opts.onClick,
    role: opts.onClick && !opts.locked ? 'button' : undefined,
    'data-title': opts.title,
  },
  h('div', { class: 'card-ico' }, opts.icon),
  h('div', { class: 'card-title' }, opts.title),
  ...opts.lines.map((l) => h('div', { class: 'card-line' }, l)),
  opts.locked ? lock(opts.locked) : null,
  opts.footer ?? null);
}

/* ---------------- seeds ---------------- */

export function openSeeds(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(t('seeds.title'), { wide: true });
  m.setBody(h('div', { class: 'grid' }, CROPS.map((c) => card({
    icon: itemIcon(c.id, 40),
    title: name('crop', c.id),
    lines: [coin(c.cost), `⏱ ${fmtHours(c.hours)} · ⭐ ${c.exp}`, h('span', null, t('shop.sell'), ' ', coin(c.sell))],
    locked: g.level < c.level ? c.level : false,
    dim: g.s.gold < c.cost,
    onClick: () => { ctx.ctrl.setSeed(c.id); m.close(); },
  }))));
  return m;
}

/* ---------------- shop ---------------- */

export type ShopTab = 'seeds' | 'trees' | 'animals' | 'decor' | 'buildings' | 'materials' | 'land';
const SHOP_TABS: ShopTab[] = ['seeds', 'trees', 'animals', 'decor', 'buildings', 'materials', 'land'];

export function openShop(ctx: AppCtx, tab: ShopTab = 'trees') {
  const m = openModal(t('shop.title'), {
    wide: true,
    tab,
    tabs: SHOP_TABS.map((id) => ({ id, label: t(`shop.tab.${id}` as MsgKey) })),
    onTab: (tb) => fill(tb as ShopTab),
  });
  const fill = (tb: ShopTab) => m.setBody(shopTab(ctx, m, tb));
  fill(tab);
  return m;
}

function shopTab(ctx: AppCtx, m: Modal, tab: ShopTab): Node {
  const g = ctx.game;
  const buy = (k: string) => () => { ctx.ctrl.startPlacing(k, false); m.close(); toast(t('shop.pickPlace'), '📍'); };
  const priceNodes = (k: string) => { const p = g.priceOf(k); return [p.diamonds ? gem(p.diamonds) : coin(p.gold)]; };
  const afford = (k: string) => { const p = g.priceOf(k); return g.s.gold >= p.gold && g.s.diamonds >= p.diamonds; };
  switch (tab) {
    case 'seeds':
      return h('div', { class: 'grid' }, CROPS.map((c) => card({
        icon: itemIcon(c.id, 40), title: name('crop', c.id),
        lines: [coin(c.cost), `⏱ ${fmtHours(c.hours)} · ⭐ ${c.exp}`],
        locked: g.level < c.level ? c.level : false,
        onClick: () => { ctx.ctrl.setSeed(c.id); m.close(); },
      })));
    case 'trees':
      return h('div', { class: 'grid' }, TREES.filter((tr) => !tr.giftOnly).map((tr) => card({
        icon: placeIcon('tree:' + tr.id), title: name('tree', tr.id),
        lines: [...priceNodes('tree:' + tr.id), t('shop.every', { product: name('treeProduct', tr.id), time: fmtHours(tr.hours) }), h('span', null, t('shop.fruit'), ' ', coin(tr.income))],
        locked: g.level < tr.level ? tr.level : false, dim: !afford('tree:' + tr.id), onClick: buy('tree:' + tr.id),
      })));
    case 'animals':
      return h('div', { class: 'grid' }, ANIMALS.filter((a) => !a.giftOnly).map((a) => card({
        icon: placeIcon('animal:' + a.id), title: name('animal', a.id),
        lines: [...priceNodes('animal:' + a.id), `${a.productEmoji} ${t('shop.every', { product: name('animalProduct', a.id), time: fmtHours(a.hours) })}`, h('span', null, t('shop.sell'), ' ', coin(a.income))],
        locked: g.level < a.level ? a.level : false, dim: !afford('animal:' + a.id), onClick: buy('animal:' + a.id),
      })));
    case 'decor':
      return h('div', { class: 'grid' }, DECOR.filter((d) => !d.craftOnly).map((d) => card({
        icon: placeIcon('decor:' + d.id), title: name('decor', d.id),
        lines: [...priceNodes('decor:' + d.id), d.size > 1 ? `${d.size}×${d.size}` : ''],
        locked: g.level < d.level ? d.level : false, dim: !afford('decor:' + d.id), onClick: buy('decor:' + d.id),
      })));
    case 'buildings':
      return h('div', { class: 'grid' }, BUILDINGS.filter((b) => !b.craftOnly).map((b) => {
        const k = 'building:' + b.id;
        const owned = g.s.objects.some((o) => o.key === k) || !!g.s.storage[k];
        return card({
          icon: placeIcon(k), title: name('building', b.id),
          lines: [owned ? t('shop.owned') : coin(b.cost), name('buildingAbout', b.id)],
          locked: g.level < b.level ? b.level : false, dim: owned || !afford(k), onClick: owned ? undefined : buy(k),
        });
      }));
    case 'materials':
      return h('div', null,
        h('p', { class: 'hint' }, t('shop.materialsHint')),
        h('div', { class: 'grid' }, MATERIALS.map((mt) => card({
          icon: itemIcon(mt.id, 40), title: name('material', mt.id),
          lines: [coin(mt.price), t('shop.inCellar', { n: g.s.cellar[mt.id] ?? 0 })],
          dim: g.s.gold < mt.price,
          onClick: () => { g.buyMaterial(mt.id); m.setBody(shopTab(ctx, m, 'materials')); },
        }))));
    case 'land':
      return landTab(ctx, m);
  }
}

function landTab(ctx: AppCtx, m: Modal): Node {
  const g = ctx.game;
  const e = g.nextExpansion();
  if (!e) return h('p', { class: 'center' }, t('land.max', { n: g.s.size }));
  const redo = () => m.setBody(landTab(ctx, m));
  return h('div', { class: 'center' },
    h('p', null, t('land.now', { s: g.s.size, n: e.size })),
    h('div', { class: 'row center' },
      e.gold ? h('button', { class: 'btn green', 'data-expand': 'gold', onclick: () => { g.expand('gold'); redo(); } }, t('land.forGold', { n: fmt(e.gold) })) : null,
      e.diamonds ? h('button', { class: 'btn purple', 'data-expand': 'diamonds', onclick: () => { g.expand('diamonds'); redo(); } }, t('land.forGems', { n: e.diamonds })) : null,
      e.neighbors ? h('button', { class: 'btn', 'data-expand': 'neighbors', disabled: g.neighborCount() < e.neighbors, onclick: () => { g.expand('neighbors'); redo(); } },
        t('land.forNeighbors', { n: e.neighbors, have: g.neighborCount() })) : null),
    h('p', { class: 'hint' }, t('land.hint')));
}

/* ---------------- cellar ---------------- */

export function openCellar(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(t('cellar.title'), { wide: true });
  const isMaterial = (id: string) => MATERIALS.some((x) => x.id === id);
  const draw = () => {
    const ids = Object.keys(g.s.cellar).filter((id) => ITEMS[id]).sort((a, b) => itemName(a).localeCompare(itemName(b)));
    const total = ids.filter((id) => !isMaterial(id)).reduce((s, id) => s + ITEMS[id].price * g.s.cellar[id], 0);
    m.setBody(
      ids.length ? h('div', { class: 'list' }, ids.map((id) => h('div', { class: 'list-row', 'data-item': id },
        itemIcon(id, 34),
        h('div', { class: 'grow' }, h('b', null, itemName(id)), h('div', { class: 'sub' }, '× ', g.s.cellar[id], t('cellar.each'), coin(ITEMS[id].price))),
        h('button', { class: 'btn small', 'data-sell': '1', onclick: () => { g.sell(id, 1); draw(); } }, t('cellar.sell1')),
        h('button', { class: 'btn small green', 'data-sell': 'all', onclick: () => { g.sell(id, g.s.cellar[id]); draw(); } }, t('cellar.sellItemAll'))))) :
        h('p', { class: 'center hint' }, t('cellar.empty')),
      total ? h('div', { class: 'row center' }, h('button', {
        class: 'btn green big', 'data-sell-all': '',
        onclick: () => confirmBox(t('cellar.confirm', { n: fmt(total) }), t('cellar.sellBtn'), () => { g.sellAll((id) => !isMaterial(id)); openCellar(ctx); }),
      }, t('cellar.sellAll'), coin(total))) : null,
    );
  };
  draw();
  return m;
}

/* ---------------- storage ---------------- */

export function openStorage(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(t('storage.title'), { wide: true });
  const keys = Object.keys(g.s.storage);
  m.setBody(keys.length
    ? h('div', { class: 'grid' }, keys.map((k) => card({
      icon: placeIcon(k), title: placeName(k), lines: [`× ${g.s.storage[k]}`, t('storage.place')],
      onClick: () => { ctx.ctrl.startPlacing(k, true); m.close(); },
    })))
    : h('p', { class: 'center hint' }, t('storage.empty')));
  return m;
}

/* ---------------- buildings ---------------- */

export function openBuilding(ctx: AppCtx, o: FarmObject) {
  const g = ctx.game;
  const id = o.key.split(':')[1] as BuildingId;
  const m = openModal(name('building', id), { wide: true });
  const draw = () => {
    if (id === 'greenhouse') return m.setBody(greenhouseBody(ctx, o, draw));
    const now = g.now();
    const ready = (o.jobs ?? []).filter((j) => j.endsAt <= now).length;
    m.setBody(
      h('p', { class: 'hint' }, name('buildingAbout', id)),
      (o.jobs ?? []).length ? h('div', { class: 'queue' }, o.jobs!.map((j) => {
        const r = recipeById[j.recipe];
        return h('div', { class: 'q-item' + (j.endsAt <= now ? ' done' : '') }, h('span', { class: 'ico' }, r.emoji), name('recipe', r.id), h('span', { class: 'sub' }, j.endsAt <= now ? t('bld.ready') : fmtTime(j.endsAt - now)));
      })) : null,
      ready ? h('div', { class: 'row center' }, h('button', { class: 'btn green', 'data-collect': '', onclick: () => { g.collectJobs(o); draw(); } }, t('bld.collect', { n: ready }))) : null,
      h('div', { class: 'list' }, RECIPES.filter((r) => r.building === id).map((r) => {
        const locked = g.level < r.level;
        const can = !locked && g.hasInputs(r.inputs) && (o.jobs ?? []).length < 3;
        return h('div', { class: 'list-row' + (locked ? ' locked' : ''), 'data-recipe': r.id },
          h('span', { class: 'ico', style: 'font-size:28px' }, r.emoji),
          h('div', { class: 'grow' },
            h('b', null, name('recipe', r.id)),
            h('div', { class: 'inputs' }, Object.entries(r.inputs).map(([iid, n]) => {
              const have = g.s.cellar[iid] ?? 0;
              return h('span', { class: 'inp' + (have >= n ? ' ok' : ' miss'), title: itemName(iid) }, itemIcon(iid, 20), ` ${have}/${n}`);
            })),
            h('div', { class: 'sub' }, `⏱ ${fmtHours(r.hours)}`, r.output.kind === 'item' ? h('span', null, ' · ', coin(ITEMS[r.output.id].price)) : t('shop.toStorage'))),
          locked ? lock(r.level) : h('button', { class: 'btn small green', disabled: !can, onclick: () => { g.startJob(o, r.id); draw(); } }, t('bld.make')));
      })),
      h('div', { class: 'row center' }, h('button', { class: 'btn small', 'data-store': '', onclick: () => { g.toStorage(o); m.close(); } }, t('bld.toStorage'))),
    );
  };
  draw();
  return m;
}

function greenhouseBody(ctx: AppCtx, o: FarmObject, redraw: () => void): Node {
  const g = ctx.game;
  const now = g.now();
  const slots = o.slots ?? [];
  const empty = slots.filter((s) => !s.crop).length;
  const ready = g.greenReady(o);
  return h('div', null,
    h('p', { class: 'hint' }, t('gh.hint')),
    h('div', { class: 'slots' }, slots.map((s) => {
      if (!s.crop) return h('div', { class: 'slot empty' }, '—');
      const left = s.plantedAt + cropById[s.crop].hours * HOUR - now;
      return h('div', { class: 'slot' + (left <= 0 ? ' done' : '') }, itemIcon(s.crop, 26), h('div', { class: 'sub' }, left <= 0 ? t('gh.ready') : fmtTime(left)));
    })),
    ready ? h('div', { class: 'row center' }, h('button', { class: 'btn green', 'data-gh-harvest': '', onclick: () => { g.greenHarvest(o); redraw(); } }, t('gh.collect', { n: ready }))) : null,
    empty ? h('div', null,
      h('p', null, t('gh.plantOn', { n: empty })),
      h('div', { class: 'grid small' }, CROPS.filter((c) => c.level <= g.level).map((c) => card({
        icon: itemIcon(c.id, 30), title: name('crop', c.id), lines: [h('span', null, coin(c.cost * empty)), `⏱ ${fmtHours(c.hours)}`],
        dim: g.s.gold < c.cost, onClick: () => { g.greenPlant(o, c.id); redraw(); },
      })))) : null,
    h('div', { class: 'row center' }, h('button', { class: 'btn small', onclick: () => { g.toStorage(o); redraw(); } }, t('bld.toStorage'))));
}

/* ---------------- orders ---------------- */

export function openOrders(ctx: AppCtx) {
  const g = ctx.game;
  g.fillOrders();
  const m = openModal(t('orders.title'), { wide: true });
  const draw = () => {
    const canReplace = g.s.orderRefreshAt <= g.now();
    m.setBody(
      h('p', { class: 'hint' }, t('orders.hint')),
      h('div', { class: 'orders' }, g.s.orders.map((o) => {
        const npc = npcById[o.from];
        const can = g.hasInputs(o.items);
        return h('div', { class: 'order', 'data-order': o.id },
          h('div', { class: 'order-from' }, h('span', { class: 'face', style: `background:${npc?.color ?? '#eee'}` }, npc?.face ?? '🙂'), npc ? personName(npc.name) : t('orders.neighbor')),
          h('div', { class: 'inputs' }, Object.entries(o.items).map(([id, n]) => {
            const have = g.s.cellar[id] ?? 0;
            return h('span', { class: 'inp' + (have >= n ? ' ok' : ' miss'), title: itemName(id) }, itemIcon(id, 24), ` ${Math.min(have, n)}/${n}`);
          })),
          h('div', { class: 'reward' }, coin(o.gold), ` ⭐ ${o.exp}`, o.diamonds ? h('span', null, ' ', gem(o.diamonds)) : null, o.material ? h('span', null, ' + ', itemIcon(o.material, 18)) : null),
          h('div', { class: 'row' },
            h('button', { class: 'btn small green', 'data-give': '', disabled: !can, onclick: () => { g.completeOrder(o); draw(); } }, t('orders.give')),
            h('button', { class: 'btn small', 'data-replace': '', disabled: !canReplace, title: canReplace ? t('orders.replace') : t('orders.replaceLater'), onclick: () => { g.replaceOrder(o); draw(); } }, '🔄')));
      })));
  };
  draw();
  return m;
}

/* ---------------- neighbours ---------------- */

export function openNeighbors(ctx: AppCtx, tab: 'friends' | 'village' = ctx.api ? 'friends' : 'village') {
  const m = openModal(t('nb.title'), {
    wide: true, tab,
    tabs: [{ id: 'friends', label: t('nb.tabFriends') }, { id: 'village', label: t('nb.tabVillage') }],
    onTab: (tb) => draw(tb as 'friends' | 'village'),
  });
  let refreshList: (() => void) | null = null;
  const draw = (tb: 'friends' | 'village') => {
    refreshList = null;
    if (tb === 'village') return m.setBody(villageBody(ctx, m, () => draw('village')));
    const fb = friendsBody(ctx);
    refreshList = fb.refresh;
    m.setBody(fb.el);
  };
  draw(tab);
  // a fresh list from the server redraws only the list, so the search box and typed text survive
  if (ctx.api) void ctx.refreshFriends().then(() => { if (m.el.isConnected) refreshList?.(); });
  return m;
}

function friendRow(ctx: AppCtx, f: Friend, redraw: () => void) {
  const g = ctx.game;
  return h('div', { class: 'list-row', 'data-friend': f.id },
    h('span', { class: 'face' }, f.face),
    h('div', { class: 'grow' }, h('b', null, f.name), h('div', { class: 'sub' }, t('nb.friendInfo', { login: f.login, level: f.level, left: f.helpLeft, max: HELP_LIMIT }))),
    h('button', { class: 'btn small green', 'data-visit': '', onclick: () => void ctx.visitFriend(f) }, t('nb.visit')),
    h('button', { class: 'btn small', 'data-gift': '', disabled: f.giftSent, onclick: () => openGiftPicker((k) => { void g.sendFriendGift(f, k).then(redraw); }) }, f.giftSent ? '🎁 ✓' : '🎁'),
    h('button', { class: 'btn small red', 'data-remove': '', title: t('nb.removeTitle'), onclick: () => confirmBox(t('nb.removeConfirm', { name: f.name }), t('nb.remove'), async () => { await ctx.api!.remove(f.id); await ctx.refreshFriends(); redraw(); }) }, '✕'));
}

/** The showcase farms every player has, to look at for ideas. */
function showcaseList(ctx: AppCtx) {
  return h('div', { class: 'showcases' },
    h('h3', null, t('showcase.title')),
    h('p', { class: 'sub' }, t('showcase.hint')),
    h('div', { class: 'list' }, SHOWCASES.map((sc) => h('div', { class: 'list-row showcase', 'data-showcase': sc.id },
      h('span', { class: 'face', style: `background:${sc.color}` }, sc.face),
      h('div', { class: 'grow' }, h('b', null, t(`showcase.${sc.id}`)), h('div', { class: 'sub' }, t(`showcase.${sc.id}About`))),
      h('button', { class: 'btn small green', 'data-visit': '', onclick: () => ctx.visitShowcase(sc.id) }, t('showcase.look'))))));
}

function friendsBody(ctx: AppCtx): { el: Node; refresh: (() => void) | null } {
  const g = ctx.game;
  if (!ctx.api) return { el: h('div', null, showcaseList(ctx), h('p', { class: 'hint center' }, t('nb.offline'))), refresh: null };
  const api = ctx.api;
  const listBox = h('div', { class: 'friend-lists' });
  const redraw = () => listBox.replaceChildren(
    ctx.incoming.length ? h('div', null, h('h3', null, t('nb.wantFriends')), h('div', { class: 'list' }, ctx.incoming.map((u) => h('div', { class: 'list-row', 'data-incoming': u.id },
      h('span', { class: 'face' }, u.face),
      h('div', { class: 'grow' }, h('b', null, u.name), h('div', { class: 'sub' }, t('nb.userInfo', { login: u.login, level: u.level }))),
      h('button', { class: 'btn small green', 'data-accept': '', onclick: async () => { await api.accept(u.id); await ctx.refreshFriends(); g.stat('neighbors'); redraw(); } }, t('nb.accept')),
      h('button', { class: 'btn small', 'data-decline': '', onclick: async () => { await api.remove(u.id); await ctx.refreshFriends(); redraw(); } }, t('nb.decline')))))) : '',
    h('h3', null, t('nb.friends', { n: g.friends.length })),
    g.friends.length ? h('div', { class: 'list' }, g.friends.map((f) => friendRow(ctx, f, redraw))) : h('p', { class: 'hint' }, t('nb.noFriends')),
    ctx.outgoing.length ? h('p', { class: 'sub' }, t('nb.waiting'), ctx.outgoing.map((u) => '@' + u.login).join(', ')) : '',
  );
  redraw();
  const results = h('div', { class: 'list search-results' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const runSearch = async (q: string) => {
    const { users } = q.trim().length >= 2 ? await api.search(q) : { users: [] };
    clear(results);
    for (const u of users) {
      results.appendChild(h('div', { class: 'list-row', 'data-user': u.id },
        h('span', { class: 'face' }, u.face),
        h('div', { class: 'grow' }, h('b', null, u.name), h('div', { class: 'sub' }, t('nb.userInfo', { login: u.login, level: u.level }))),
        u.status === 'accepted' ? h('span', { class: 'sub' }, t('nb.friend')) :
          u.status === 'pending' ? h('span', { class: 'sub' }, t('nb.pending')) :
            h('button', { class: 'btn small green', 'data-add': '', onclick: async (ev: Event) => {
              const btn = ev.currentTarget as HTMLButtonElement;
              const r = await api.request(u.id);
              btn.replaceWith(h('span', { class: 'sub' }, r.status === 'accepted' ? t('nb.nowFriends') : t('nb.pending')));
              await ctx.refreshFriends();
              redraw();
            } }, t('nb.add'))));
    }
    if (!users.length && q.trim().length >= 2) results.appendChild(h('p', { class: 'hint' }, t('nb.notFound')));
  };
  const search = h('input', {
    class: 'input', placeholder: t('nb.search'), 'aria-label': t('nb.search'),
    oninput: (e: Event) => {
      clearTimeout(timer);
      const q = (e.target as HTMLInputElement).value;
      timer = setTimeout(() => void runSearch(q), 250);
    },
  });
  const el = h('div', null,
    ctx.user ? h('p', { class: 'hint' }, t('nb.yourLogin'), h('b', null, '@' + ctx.user.login)) : null,
    showcaseList(ctx),
    listBox,
    h('h3', null, t('nb.find')),
    search,
    results);
  return { el, refresh: redraw };
}

function villageBody(ctx: AppCtx, m: Modal, redraw: () => void): Node {
  const g = ctx.game;
  const mine = g.s.neighbors.map((id) => npcById[id]).filter(Boolean);
  const others = NPCS.filter((n) => !g.s.neighbors.includes(n.id));
  const today = dayIndex();
  return h('div', null,
    h('p', { class: 'hint' }, t('nb.villageHint', { n: g.maxNeighbors() })),
    h('h3', null, t('nb.mine', { n: mine.length })),
    h('div', { class: 'list' }, mine.map((n) => h('div', { class: 'list-row', 'data-npc': n.id },
      h('span', { class: 'face', style: `background:${n.color}` }, n.face),
      h('div', { class: 'grow' }, h('b', null, personName(n.name)), h('div', { class: 'sub' }, t('common.level', { n: n.level }))),
      h('button', { class: 'btn small green', 'data-visit': '', onclick: () => { m.close(); ctx.visitNpc(n.id); } }, t('nb.visit')),
      h('button', { class: 'btn small', 'data-gift': '', disabled: g.s.giftsSent[n.id] === today, onclick: () => { g.sendGift(n.id); redraw(); } }, g.s.giftsSent[n.id] === today ? '🎁 ✓' : '🎁')))),
    h('h3', null, t('nb.invite')),
    h('div', { class: 'list' }, others.slice(0, 40).map((n) => h('div', { class: 'list-row', 'data-invite': n.id },
      h('span', { class: 'face', style: `background:${n.color}` }, n.face),
      h('div', { class: 'grow' }, h('b', null, personName(n.name)), h('div', { class: 'sub' }, t('common.level', { n: n.level }))),
      h('button', { class: 'btn small', onclick: () => { g.invite(n.id); redraw(); } }, t('nb.invite'))))));
}

export function openGiftPicker(pick: (key: string) => void) {
  const m = openModal(t('nb.giftWhat'), { wide: true });
  m.setBody(h('div', { class: 'grid small' }, giftChoices(99).map((gc) => card({
    icon: gc.key.startsWith('item:') ? itemIcon(gc.key.slice(5), 30) : placeIcon(gc.key, 30),
    title: giftName(gc.key), lines: [t('common.free')],
    onClick: () => { m.close(); pick(gc.key); },
  }))));
  return m;
}

/* ---------------- gifts ---------------- */

export function openGifts(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(t('gifts.title'), { wide: true });
  const draw = () => m.setBody(
    g.s.gifts.length
      ? h('div', null,
        h('div', { class: 'list' }, g.s.gifts.map((gift, i) => h('div', { class: 'list-row', 'data-gift': i },
          gift.key.startsWith('item:') ? itemIcon(gift.key.slice(5), 32) : placeIcon(gift.key, 32),
          h('div', { class: 'grow' }, h('b', null, giftName(gift.key)), h('div', { class: 'sub' }, t('gifts.from', { name: gift.npc ? personName(gift.from) : gift.from }))),
          h('button', { class: 'btn small green', onclick: () => { g.acceptGift(i); draw(); } }, t('gifts.accept'))))),
        h('div', { class: 'row center' }, h('button', { class: 'btn green', 'data-accept-all': '', onclick: () => { while (g.s.gifts.length) g.acceptGift(0); draw(); } }, t('gifts.acceptAll'))))
      : h('p', { class: 'hint center' }, t('gifts.none')),
    h('h3', null, t('gifts.wish')),
    h('p', { class: 'hint' }, t('gifts.wishHint')),
    h('div', { class: 'grid small wishes' }, giftChoices(g.level).map((gc) => card({
      icon: gc.key.startsWith('item:') ? itemIcon(gc.key.slice(5), 28) : placeIcon(gc.key, 28),
      title: giftName(gc.key), lines: [g.s.wish === gc.key ? t('gifts.chosen') : ''],
      onClick: () => { g.s.wish = g.s.wish === gc.key ? null : gc.key; g.changed(); draw(); },
    }))));
  draw();
  return m;
}

/* ---------------- achievements ---------------- */

export function openAchievements(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(t('ach.title'), { wide: true });
  m.setBody(h('div', { class: 'list' }, ACHIEVEMENTS.map((a) => {
    const tier = g.s.achievements[a.id] ?? 0;
    const val = g.s.stats[a.stat] ?? 0;
    const next = a.tiers[tier];
    return h('div', { class: 'list-row', 'data-ach': a.id },
      h('span', { class: 'stars' }, '★'.repeat(tier) + '☆'.repeat(a.tiers.length - tier)),
      h('div', { class: 'grow' },
        h('b', null, name('achName', a.id)),
        h('div', { class: 'sub' }, next !== undefined ? t('ach.progress', { verb: name('achVerb', a.id), val: fmt(val), next: fmt(next), d: a.diamonds[tier] }) : t('ach.done')),
        next !== undefined ? h('div', { class: 'bar' }, h('div', { style: `width:${Math.min(100, (val / next) * 100)}%` })) : null));
  })));
  return m;
}

/* ---------------- profile ---------------- */

const HAIR = ['#3a2416', '#f2c75a', '#a8401a', '#1a1a1a', '#e8e0d0'];
const SHIRT = ['#f2efe6', '#e84a5f', '#4a90d9', '#f2c14a', '#7a5ab0', '#5ab06a'];
const PANTS = ['#3f7a3a', '#3a5a9a', '#7a4a2a', '#2a2a3a', '#c0392b'];

export function langPicker(onPick?: () => void): HTMLElement {
  return h('div', { class: 'langs', role: 'group', 'aria-label': t('common.language') }, LANGS.map((l) => h('button', {
    type: 'button', class: 'lang-btn' + (getLang() === l.id ? ' active' : ''), 'data-lang': l.id, title: l.label,
    onclick: () => { setLang(l.id); onPick?.(); },
  }, `${l.flag} ${l.id.toUpperCase()}`)));
}

export function openProfile(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(t('prof.title'), { wide: true });
  const swatches = (field: keyof Look, list: string[]) => h('div', { class: 'swatches' }, list.map((c) => h('button', {
    class: 'sw' + (g.s.look[field] === c ? ' active' : ''), style: `background:${c}`, 'aria-label': c, 'data-color': c,
    onclick: () => { (g.s.look as any)[field] = c; g.changed(); draw(); },
  })));
  const draw = () => m.setBody(
    h('h3', null, t('common.language')),
    langPicker(() => { m.close(); openProfile(ctx); }),
    h('div', { class: 'row center' },
      h('button', { class: 'btn' + (g.s.look.gender === 'girl' ? ' green' : ''), 'data-gender': 'girl', onclick: () => { g.s.look.gender = 'girl'; g.changed(); draw(); } }, t('prof.girl')),
      h('button', { class: 'btn' + (g.s.look.gender === 'boy' ? ' green' : ''), 'data-gender': 'boy', onclick: () => { g.s.look.gender = 'boy'; g.changed(); draw(); } }, t('prof.boy'))),
    h('div', { class: 'look' },
      h('span', null, t('prof.hair')), swatches('hair', HAIR),
      h('span', null, t('prof.shirt')), swatches('shirt', SHIRT),
      h('span', null, g.s.look.gender === 'boy' ? t('prof.overalls') : t('prof.skirt')), swatches('pants', PANTS)),
    h('h3', null, t('prof.stats')),
    h('div', { class: 'stats' },
      h('div', null, t('prof.level', { n: g.level })), h('div', null, t('prof.exp', { n: fmt(g.s.exp) })),
      h('div', null, t('prof.size', { n: g.s.size })), h('div', null, t('prof.harvested', { n: fmt(g.s.stats.harvested ?? 0) })),
      h('div', null, t('prof.earned', { n: fmt(g.s.stats.earned ?? 0) })), h('div', null, t('prof.helped', { n: fmt(g.s.stats.helped ?? 0) }))),
    ctx.dev ? h('div', null, h('h3', null, t('prof.speed')), h('div', { class: 'row center' },
      [1, 60, 600].map((sp) => h('button', { class: 'btn small' + (g.s.clock.speed === sp ? ' green' : ''), 'data-speed': sp, onclick: () => { g.setSpeed(sp); draw(); } }, `×${sp}`)))) : null,
    ctx.user ? h('div', { class: 'row center' }, h('span', { class: 'sub' }, t('prof.loggedAs', { login: ctx.user.login })), h('button', { class: 'btn small red', 'data-logout': '', onclick: () => ctx.logout() }, t('prof.logout'))) : null,
  );
  draw();
  return m;
}

/* ---------------- pet ---------------- */

/** Choosing the pet's name: once, with a confirmation. */
function petNaming(ctx: AppCtx, done: () => void) {
  const g = ctx.game;
  const input = h('input', { class: 'input', value: g.s.pet.name, maxlength: 16, 'aria-label': t('pet.nameLabel'), 'data-pet-name': '' }) as HTMLInputElement;
  const save = () => {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!PET_NAME_RE.test(name)) { toast(t('pet.badName'), '🐶'); return; }
    // the confirmation replaces this window; either answer brings the pet's window back
    confirmBox(t('pet.nameConfirm', { name }), t('pet.saveName'), () => { g.renamePet(name); done(); }, done);
  };
  return h('div', { class: 'pet-naming' },
    h('p', { class: 'sub center' }, t('pet.nameOnce')),
    h('div', { class: 'row center' }, input, h('button', { class: 'btn green', 'data-pet-save': '', onclick: save }, t('pet.saveName'))));
}

export function openPet(ctx: AppCtx) {
  const g = ctx.game;
  const m = openModal(g.s.pet.name);
  const draw = () => m.setBody(
    h('div', { class: 'center big-emoji' }, '🐶'),
    h('p', { class: 'center' }, g.petHappy()
      ? t('pet.happy', { name: g.s.pet.name, time: fmtTime(8 * HOUR - (g.now() - g.s.pet.fedAt)) })
      : t('pet.hungry', { name: g.s.pet.name })),
    h('div', { class: 'row center' },
      h('button', { class: 'btn green', 'data-feed': '', disabled: g.petHappy(), onclick: () => { g.feedPet(); draw(); } }, t('pet.feed')),
      h('button', { class: 'btn', 'data-pet': '', onclick: () => { g.petPet(); toast(t('pet.wag', { name: g.s.pet.name }), '🐾'); } }, t('pet.pet'))),
    g.s.pet.renamed ? null : petNaming(ctx, () => openPet(ctx)),
  );
  draw();
  return m;
}

/* ---------------- level up and daily bonus ---------------- */

export function unlocksAt(level: number): string[] {
  return [
    ...CROPS.filter((c) => c.level === level).map((c) => `🌱 ${name('crop', c.id)}`),
    ...TREES.filter((tr) => tr.level === level && !tr.giftOnly).map((tr) => `🌳 ${name('tree', tr.id)}`),
    ...ANIMALS.filter((a) => a.level === level && !a.giftOnly).map((a) => `${a.emoji} ${name('animal', a.id)}`),
    ...BUILDINGS.filter((b) => b.level === level && !b.craftOnly).map((b) => `${b.emoji} ${name('building', b.id)}`),
    ...DECOR.filter((d) => d.level === level && !d.craftOnly).map((d) => `${d.emoji} ${name('decor', d.id)}`),
  ];
}

export function openLevelUp(level: number) {
  const m = openModal(t('lvl.title'));
  const items = unlocksAt(level);
  m.setBody(
    h('div', { class: 'center levelup' }, h('div', { class: 'star-big' }, String(level))),
    h('p', { class: 'center' }, t('lvl.reward', { gold: fmt(50 * level), exp: fmt(expToNext(level)) })),
    items.length ? h('div', null, h('h3', null, t('lvl.unlocked')), h('div', { class: 'unlocks' }, items.map((x) => h('span', { class: 'chip' }, x)))) : null,
    h('div', { class: 'row center' }, h('button', { class: 'btn green', onclick: () => m.close() }, t('lvl.ok'))));
  return m;
}

export function openDaily(ctx: AppCtx, d: { bonus: number; streak: number; gifts: number }) {
  const m = openModal(t('daily.title'));
  m.setBody(
    h('p', { class: 'center' }, t('daily.bonus'), coin(d.bonus), t('daily.streak', { n: d.streak })),
    d.gifts ? h('p', { class: 'center' }, t('daily.gifts', { n: d.gifts })) : null,
    h('div', { class: 'row center' },
      d.gifts ? h('button', { class: 'btn', 'data-open-gifts': '', onclick: () => { m.close(); openGifts(ctx); } }, t('daily.open')) : null,
      h('button', { class: 'btn green', onclick: () => m.close() }, t('daily.go'))));
  return m;
}

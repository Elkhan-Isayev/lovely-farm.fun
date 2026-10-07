// Game startup: sign-in, loading the farm from the server, wiring renderer, UI and sync together.
import { Game, type Friend } from './core/game';
import { npcById } from './core/neighbors';
import { GameAudio } from './audio/audio';
import { TOOL_SOUND } from './audio/sfx';
import { projectFarm } from './core/project';
import { showcaseById, type ShowcaseId } from './core/showcase';
import { getLang, onLangChange, t, tErr } from './i18n';
import { ApiError, type Api, type PublicUser } from './net/api';
import { Sync } from './net/sync';
import { Renderer } from './render/renderer';
import { showAuth } from './ui/auth';
import { Controller } from './ui/controller';
import type { AppCtx } from './ui/ctx';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import { currentModal, openModal, toast } from './ui/modal';
import { openBuilding, openDaily, openLevelUp, openPet, openProfile, openSeeds } from './ui/panels';

export interface Running {
  game: Game;
  renderer: Renderer;
  ctrl: Controller;
  hud: Hud;
  sync: Sync;
  ctx: AppCtx;
  frame(time: number): void;
  stop(): void;
}

export interface BootEnv {
  canvas: HTMLCanvasElement;
  dev?: boolean;
  raf?: (fn: (t: number) => void) => number;
  width?: () => number;
  height?: () => number;
  reload?: () => void;
  audio?: GameAudio;
}

/** Entry point: show the sign-in screen if needed, then start the game. */
export async function boot(api: Api, env: BootEnv): Promise<Running | null> {
  let me;
  try {
    me = await api.me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return new Promise((resolve) => { showAuth(api, () => resolve(boot(api, env))); });
    }
    showFatal(t('app.serverDown'));
    return null;
  }
  return start(api, env, me.user, me.farm, me.events);
}

export function start(
  api: Api,
  env: BootEnv,
  user: PublicUser,
  farm: { state: Game['s']; rev: number } | null,
  events: Parameters<Game['applyEvents']>[0],
): Running {
  const game = new Game(farm?.state ?? null);
  // the server sends error codes; translate them here
  game.social = {
    help: async (id, x, y, kind) => { const r = await api.help(id, x, y, kind); return r.error ? { ...r, error: tErr(r.error) } : r; },
    gift: async (id, key) => { const r = await api.gift(id, key); return r.error ? { ...r, error: tErr(r.error) } : r; },
  };
  if (game.isNew) game.s.look.gender = user.face.includes('👨') || user.face.includes('👦') || user.face.includes('👴') ? 'boy' : 'girl';
  game.applyEvents(events);

  const renderer = new Renderer(env.canvas, game);
  const width = env.width ?? (() => window.innerWidth);
  const height = env.height ?? (() => window.innerHeight);
  const resize = () => renderer.resize(width(), height(), Math.min(window.devicePixelRatio || 1, 2));
  resize();
  renderer.centerOn(game.s.size);

  const audio = env.audio ?? new GameAudio();
  const ctx: AppCtx = {
    game, api, user, incoming: [], outgoing: [], dev: !!env.dev, audio,
    ctrl: null as unknown as Controller,
    refreshFriends: async () => {
      try {
        const r = await api.friends();
        game.friends = r.friends;
        ctx.incoming = r.incoming;
        ctx.outgoing = r.outgoing;
        game.changed();
      } catch { /* offline: keep the old list */ }
    },
    visitFriend: async (f: Friend) => {
      try {
        const data = await api.farm(f.id);
        currentModal()?.close();
        renderer.farmer.clear();
        f.helpLeft = data.owner.helpLeft;
        game.startVisit({ type: 'friend', friend: f }, projectFarm(data.farm, Date.now()));
        renderer.centerOn(data.farm.size);
      } catch (e) {
        toast((e as Error).message, '⚠️');
      }
    },
    visitNpc: (id: string) => {
      currentModal()?.close();
      renderer.farmer.clear();
      game.startVisit({ type: 'npc', npc: npcById[id] });
      renderer.centerOn(game.visit!.farm.size);
    },
    visitShowcase: (id: ShowcaseId) => {
      currentModal()?.close();
      renderer.farmer.clear();
      game.startVisit({ type: 'showcase', showcase: showcaseById[id] });
      renderer.centerOn(game.visit!.farm.size);
    },
    goHome: () => {
      renderer.farmer.clear();
      game.endVisit();
      renderer.centerOn(game.s.size);
      void ctx.refreshFriends();
    },
    logout: async () => {
      await sync.flush();
      await api.logout().catch(() => {});
      (env.reload ?? (() => location.reload()))();
    },
  };

  const ctrl = new Controller(game, renderer, {
    openBuilding: (o) => openBuilding(ctx, o),
    openPet: () => openPet(ctx),
    openHouse: () => openProfile(ctx),
    openSeeds: () => openSeeds(ctx),
  });
  ctx.ctrl = ctrl;
  const hud = new Hud(ctx);
  const input = new Input(env.canvas, renderer, ctrl, hud, () => !!currentModal());

  const sync = new Sync(game, api, farm?.rev ?? 0, () => user.face);
  sync.onConflict = () => {
    const m = openModal(t('conflict.title'));
    m.setBody(
      h('p', { class: 'center' }, t('conflict.text')),
      h('div', { class: 'row center' }, h('button', { class: 'btn green', 'data-reload': '', onclick: () => (env.reload ?? (() => location.reload()))() }, t('conflict.reload'))),
    );
  };
  sync.onError = () => toast(t('net.offline'), '📡');

  // redraw the HUD at most once per frame
  let hudDirty = true;
  game.on('change', () => { hudDirty = true; });
  game.on('toast', (t) => toast(t.text, t.icon));
  game.on('levelup', (l) => { openLevelUp(l); hudDirty = true; });
  game.on('achievement', (a) => { toast(t('g.achievement', { name: a.name, n: a.diamonds }), '🏆'); audio.play('sparkle'); });

  // sound: effects from the game and the farmer's tools; audio may only start after a user gesture
  game.on('sound', (name) => audio.play(name));
  game.on('levelup', () => audio.play('levelup'));
  game.on('float', (f) => { if (f.icon === '🪙') audio.play('coin'); });
  renderer.farmer.onAct = (tool) => audio.play(TOOL_SOUND[tool]);
  const onGesture = (e: Event) => {
    audio.unlock();
    if (e.type === 'pointerdown' && (e.target as Element | null)?.closest?.('button')) audio.play('click');
  };
  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);
  onLangChange(() => { hudDirty = true; document.title = t('app.title'); });
  document.title = t('app.title');
  document.documentElement.lang = getLang();
  game.on('visit', () => { hudDirty = true; ctrl.setTool('hand'); });

  const daily = game.daily();
  if (daily) openDaily(ctx, daily);
  if (game.isNew) welcome(ctx);
  game.fillOrders();
  void sync.flush();
  sync.start();
  void ctx.refreshFriends();
  const friendTimer = setInterval(() => void ctx.refreshFriends(), 60_000);

  const onResize = () => resize();
  const onHide = () => {
    audio.pause(document.visibilityState === 'hidden');
    if (document.visibilityState === 'hidden') { saveCharPos(); void sync.flush(); }
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onHide);
  const saveCharPos = () => {
    if (!game.visit) game.s.charPos = { x: renderer.farmer.x, y: renderer.farmer.y };
  };

  let last = 0, tickAcc = 0, hudAcc = 0, stopped = false;
  const frame = (time: number) => {
    const t = time / 1000;
    const dt = last ? Math.min(0.1, t - last) : 0;
    last = t;
    tickAcc += dt;
    hudAcc += dt;
    if (tickAcc >= 0.25 || !dt) { game.tick(tickAcc); tickAcc = 0; }
    if (hudAcc >= 1) { hudAcc = 0; hudDirty = true; } // timers in modals and tooltips
    renderer.render(t, dt);
    if (hudDirty) { hudDirty = false; hud.update(); }
  };
  const raf = env.raf ?? ((fn) => requestAnimationFrame(fn));
  const loop = (time: number) => { if (stopped) return; frame(time); raf(loop); };
  raf(loop);

  return {
    game, renderer, ctrl, hud, sync, ctx, frame,
    stop: () => {
      stopped = true;
      sync.stop();
      input.dispose();
      clearInterval(friendTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('keydown', onGesture);
      audio.music.stop();
      audio.ambient?.stop();
    },
  };
}

function welcome(ctx: AppCtx) {
  const m = openModal(t('welcome.title'));
  m.setBody(
    h('div', { class: 'center big-emoji' }, '🏡'),
    h('ul', { class: 'howto' }, (['welcome.1', 'welcome.2', 'welcome.3', 'welcome.4', 'welcome.5'] as const).map((k) => h('li', null, t(k)))),
    h('div', { class: 'row center' }, h('button', { class: 'btn green big', 'data-start': '', onclick: () => { ctx.game.s.tutorialDone = true; m.close(); } }, t('welcome.start'))),
  );
}

function showFatal(text: string) {
  document.getElementById('ui')?.appendChild(h('div', { class: 'auth' }, h('div', { class: 'auth-card' }, h('p', { class: 'center' }, text))));
}

# CLAUDE.md

A fan remake of *Lyubimaya Ferma* ("Lovely Farm", Mail.ru, 2010–2016) as a multiplayer browser game. It is published on **GitHub Pages** (https://elkhan-isayev.github.io/lovely-farm.fun/) as a static, single-player build (`VITE_STATIC=1`: `src/net/local.ts` keeps the farm in `localStorage` instead of calling the server); the Node server and multiplayer stay in the code for self-hosting.

**Before any task, read `.ai/README.md` and the latest file in `.ai/changelog/`.** They hold the context, the decisions and where the previous session stopped. `.ai/` is the owner's **local working notes**: it is git-ignored and never committed (a fresh clone does not have it — then skip this step).

## Communication

- Talk to the owner **in Russian**.
- **Everything is English** — code, comments, **all documentation** (README, `docs/`, `CLAUDE.md`, `scripts/art/prompts.md`, the local `.ai/` notes), test titles and assertions, commit messages.
- **Russian text lives only in localization** (`src/i18n/`). No exceptions: tests run in English (`tests/setup.ts`), Russian output is checked against the dictionaries (`MESSAGES.ru[...]`), deliberate Cyrillic test inputs are written as `\u` escapes. `tests/repo.test.ts` fails on any Cyrillic outside `src/i18n/`.
- The repository is **public**: never commit secrets, `.env` files, databases or the `.ai/` notes. CI needs no secrets.
- The owner gives big tasks and expects a finished result: built, checked in a browser, covered by tests, documented.

## Commands

```bash
npm run dev          # API :3000 + Vite :5173 (open /?dev for window.__farm and time speed-up)
npm test             # Vitest, ~300 tests, ~3 s
npm run coverage     # with coverage thresholds
npm run test:e2e     # Playwright (first: npx playwright install chromium)
npm run test:all     # typecheck + coverage + e2e — required before committing
npm run typecheck    # tsc: client, server, tests
npm run screenshots  # refresh docs/screenshots/*.png
```

## Hard rules

1. **Everything is tested, from the UI down to the database.** New code comes with tests in the same change. Never lower the thresholds in `vite.config.ts`. Server tests run against a real SQLite database (`tests/server.test.ts`), not mocks.
2. **Four languages: ru, en, de, az.** No player-facing strings in code — only `t('key')`. A new key goes into `src/i18n/ru.ts` and all three other dictionaries; content names go into `ru-names.ts` and the `*Names` dictionaries. TypeScript and `tests/i18n.test.ts` catch omissions.
3. **No display names in `src/data/`.** Data holds ids and numbers; names live in `src/i18n/` (a test enforces "no Cyrillic in data").
4. **Server errors are codes** (`'help_limit'`), never text. Translations are `err.<code>` in the dictionaries.
5. **The original's numbers** in `src/data/items.ts` (crops, trees, animals, expansions) come from sources (`docs/RESEARCH.md`) — don't change them "for balance" without the owner's decision. Invented values are marked `// invented`.
6. **Zero-dependency server.** Node 24 runs `.ts` directly: in `server/` imports **include the `.ts` extension** and only erasable syntax is allowed (no `enum`, `namespace`, constructor parameter properties). In `src/` imports have no extension (Vite).
7. **`src/core/` has no DOM.** The game logic may have to move to the server (to protect the economy).
8. Game time only via `game.now()`. No `Date.now()` in game logic (except real calendar days for gifts and bonuses: `dayIndex()`).
9. Commit and push only when the owner asks. Branch `main`; remote `github.com/Elkhan-Isayev/lovely-farm.fun` (public). A green push to `main` publishes to GitHub Pages.
10. Both builds must work: anything that calls the server needs a static-mode answer in `src/net/local.ts` (`api.local` is true there), and asset URLs go through `import.meta.env.BASE_URL` (Pages serves the game from a sub-path). `tests/e2e/static.spec.ts` checks the static build.

## After finishing work

- Add an entry to `.ai/changelog/YYYY-MM-DD.md` (today's file; create it from the template in `.ai/changelog/README.md` if missing).
- Architecture, protocol or DB schema changed — update `.ai/architecture.md` and the README.
- A new agreement with the owner — `.ai/context.md`.

## Where things are

| You need… | Look at |
|---|---|
| game rules, economy | `src/core/game.ts`, `src/data/items.ts` |
| a UI window | `src/ui/panels.ts` (all windows), `src/ui/hud.ts` (persistent bars) |
| what happens on a field click | `src/ui/controller.ts` → tasks in `src/render/farmer.ts` → `Game.do*` methods |
| graphics | `src/render/sprites.ts`, `src/render/renderer.ts`, painted art `src/render/art.ts` + `public/art/` |
| making new art | `scripts/art/prompts.md`, `scripts/art/sheets.json`, `scripts/art/slice.py` |
| an API route | `server/app.ts`; client side `src/net/api.ts`, static build `src/net/local.ts` |
| DB schema and migrations | `server/db.ts` |
| texts and names | `src/i18n/` |
| game ↔ code glossary | `.ai/glossary.md` (local) |

# knobs

The marketing site for the `devknobs` npm package. <https://knobs.dev>

A copy of [mertbuilds/web-starter](https://github.com/mertbuilds/web-starter) stripped to the
layers a landing page needs: no api, no database, no auth, no billing. Keep it that way:
nothing gets added until the site needs it.

## Architecture

```
apps/
  web/    TanStack Start (React 19, React Compiler) → Cloudflare Workers.
          Client-first: SSR, routes, Paraglide i18n. No auth, no database.
          One server route: `/api/op/$`, the OpenPanel analytics proxy.
packages/
  ui/     StyleX tokens + Base UI wrappers + Storybook. The devknobs panel's tokens.
  env/    Zod-validated client env schema. All env access goes through here.
  config/ Shared tsconfig base.
```

## Commands

| Command             | What                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `pnpm dev`          | Web + storybook via mprocs                                         |
| `pnpm lint`         | oxlint, type-aware + TS compiler errors (tsgolint)                 |
| `pnpm format`       | oxfmt (write mode); `pnpm format:check` in CI                      |
| `pnpm typecheck`    | `tsc --noEmit` per package via turbo                               |
| `pnpm test`         | Storybook story tests in Chromium via turbo                        |
| `pnpm build`        | turbo build                                                        |
| `pnpm bad-day`      | Nuke node_modules + all caches, reinstall (`DRY_RUN=1` to preview) |
| `pnpm skills:check` | Verify installed agent skills match dep majors                     |

Web app (`apps/web`): `pnpm --filter @knobs/web dev` (:3000 standalone, or portless-assigned `PORT` under `pnpm dev`), `build` (Workers bundle), `deploy` (build + `wrangler deploy`), `cf-typegen` (binding types).

## Local URLs (portless)

`pnpm dev` serves both apps behind [portless](https://portless.sh): stable named HTTPS URLs instead of ports:

| Service   | URL                               | Without portless |
| --------- | --------------------------------- | ---------------- |
| web       | https://knobs.localhost           | :3000            |
| storybook | https://storybook.knobs.localhost | :6006            |

- First run needs one-time setup in a terminal: `sudo pnpm exec portless proxy start --https` (binds 443, generates + trusts a local CA). After that the proxy auto-starts. `pnpm exec portless service install` makes it start on boot.
- portless injects `PORT` (4000-4999 pool) into each app; vite reads it in `vite.config.ts`, storybook takes it as `--port`. If TLS is in the way, `--no-tls` on portless or curl `-k`.

## UI (`packages/ui`)

- Components come from the [shadcn-cssinjs](https://www.shadcn-cssinjs.com) registry (StyleX on Base UI, copy-paste-own) into `src/ui/`, then adapted to this repo. The shadcn CLI currently fails on this registry's cross-registry deps; fetch item JSON from `https://www.shadcn-cssinjs.com/r/<name>.json` and write the files (see the `shadcn-cssinjs` skill for the exact adaptation checklist: relative imports, named stylex imports, `| undefined` on optional props for exactOptionalPropertyTypes).
- Two token layers, both ours: `src/lib/tokens.stylex.ts` (component tokens: shadcn CSS variables from `src/theme.css`, dark via `prefers-color-scheme`) and `src/tokens.stylex.ts` (app-level: `colors`, `shadow`, `radius`, `spacing`, `font`, raw `palette`). Components use the lib tokens; app layout uses the app tokens. Never raw color values.
- The site wears the devknobs panel's tokens, so page and panel look like one thing. Source of truth: the panel's stylesheet (`src/ui/styles.ts` in mertbuilds/devknobs). Its warm neutrals (ground, ink, hairline, card, track, raised, faint as `muted`, a step darker in light for 4.5:1 on a card) follow the visitor's scheme as the panel does; grab's blue is `colors.accent`. Radii are the panel's concentric scale: 13 panel, 8 rows and fields, 4 controls, 6 grab's label bar. Font is the panel's system stack (`font.family`), with `font.mono` for code and readouts; no font files ship. Components inherit the font from the app body; they set none themselves.
- Icons: `lucide-react` (named `*Icon` imports, so it tree-shakes) at 16px, stroke 1.5, `currentColor`, `aria-hidden`, 8px from their label, only where they help scanning (group titles, buttons, outbound links). Brand marks (GitHub, npm) are inline Simple Icons paths (CC0) in `apps/web/src/lib/brand-marks.tsx`, not a package.
- Current set: Button, Input, Field (label/error composition), Dialog, Select, Table, Label, Separator, Skeleton, Toaster (sonner, next-themes dropped). Grow on demand from the registry.
- A story is the test: every component has colocated `*.stories.tsx` with `play` interaction tests. `pnpm --filter @knobs/ui test` runs them in real Chromium via the Storybook Vitest addon (Vitest browser mode). `pnpm storybook` serves them on :6006.

## Web (`apps/web`)

- TanStack Start on Cloudflare Workers. Custom entry `src/server.ts` (wrangler `main`) wraps the Start handler with `canonicalRedirect`, `paraglideMiddleware` and an evlog wide event per request (Axiom drain when `AXIOM_TOKEN`+`AXIOM_DATASET` set); wrangler `observability` stays disabled so logs are not duplicated.
- React Compiler is on (`react({ compiler: true })` via `oxc-transform-react`).
- i18n: Paraglide v2, `messages/en.json` only. Generated `src/paraglide/` and `src/routeTree.gen.ts` are gitignored build output: never edit them, they regenerate on `vite dev`/`build`. All user-facing strings go through `m.*()`.
- Env: `apps/web/.env` (copy `apps/web/.env.example`). Vite reads it, and the Cloudflare vite plugin also hands it to the Worker as local dev vars. `VITE_*` vars are validated in `packages/env`, all of them optional, so the site runs with no env at all.
- StyleX in routes: import `../app.css` (build injection target); there is no importable `virtual:stylex.css` module; in dev the plugin middleware serves the CSS itself.
- No tests live here: `packages/ui` stories cover the components, and the routes are a static page. Add a vitest project back if that changes.

### Local devknobs in dev

- The dev server runs devknobs from a local checkout, so the site is its test bed: `vite.config.ts` aliases `devknobs` to that checkout's `src/index.ts` (only under `vite dev`), and edits there reload the page. `node_modules` is never touched, so `pnpm install` cannot undo it.
- The checkout is `DEVKNOBS_PATH` (shell env; absolute, or relative to the repo root), else `../devknobs` beside the repo, which also fits the `knobs.dev.<branch>` worktrees. To test a devknobs worktree: `DEVKNOBS_PATH=../devknobs.<branch> pnpm dev`.
- Dev start prints which one is in use: `devknobs: local <path>`, or `devknobs: npm <version>` when no checkout is there.
- Types, `vite build`, CI and prod use the pinned npm `devknobs` only. Device images come from the checkout's `assets/bezels` (a dev middleware maps the source's `src/engine/bezels/` URLs there).
- The early script (`devknobs/early?raw`) goes first in `<head>` through `src/server.ts` (HTMLRewriter, into the empty `script[data-devknobs-early]` slot `__root.tsx` renders so hydration lines up). Builds inline the npm package's `dist/early.global.js`; under `vite dev` the plugin bundles the checkout's `src/early.ts` instead and rebuilds it when its sources change.

### Analytics

- Self-hosted OpenPanel at `analytics.vinena.studio`. Page views plus six events: `trackOutgoingLinks` and `trackAttributes` stay off, and one delegated `click` listener on `document` (`src/routes/index.tsx`, through `track` in `src/lib/analytics.ts`) sends `link_click` for the page's anchors and `knob_click` for the devknobs panel's buttons and search results, read off `composedPath()` because the panel's shadow root is open. The code boxes' copy buttons send `copy_click` from their own handler. The guided tour (`src/tour/`), a frame around the real control to use next, sends `tour_step` with the stop id (`open`, `duo`, `scroll`, `unfold`, `iphone`, `grab`, `mat`) when a visitor does that stop in the real panel while the tour is on, `tour_done` once all seven are done, and `tour_close` with the stop it was closed at. The inline loader in `__root.tsx` skips automated browsers (`navigator.webdriver`) and the copy of the page devknobs loads in a device's frame (`window.top !== window`), so a device pick is not a second page view. The tour has one owner, the top page, which alone draws it: the copy in the frame reads it from, and reports its scroll and its grab picks to, the page above through `window.knobsTour`, so the events go out from the top page only. A closed or finished tour is remembered in `localStorage` (`knobs:tour`), except with `devknobs=fresh` in the address, where nothing is read or written. Every devknobs selector the tour depends on is in `src/tour/targets.ts`.
- The client id comes from `VITE_OPENPANEL_CLIENT_ID`. Unset means the script is never injected. The id is public; the secret half never leaves the analytics host. CI reads the repo variable `OPENPANEL_CLIENT_ID` for production builds, and leaves it unset on PR previews.
- The OpenPanel project allows `knobs.dev` only, so local events answer `401 Ingestion: Invalid cors or secret`; dev traffic cannot reach the numbers even with the id in `apps/web/.env`. A 401 from `https://knobs.localhost` means the proxy works, not that it is broken.
- `src/routes/api.op.$.ts` reverse-proxies the vendor so a blocker that knows its host does not drop the page views: `/api/op/op1.js` serves the script, everything else goes to `<host>/api/*`. It forwards `cf-connecting-ip` as `openpanel-client-ip` **and** `x-client-ip`; without those OpenPanel counts every visit as the same device. It answers crawler POSTs with a bare 200 instead of forwarding them.

### Deploy

- `pnpm --filter @knobs/web deploy` = `pnpm build`, then `wrangler deploy`. The Cloudflare vite plugin writes the deploy-time config to `dist/server/wrangler.json` and points `.wrangler/deploy/config.json` at it, so wrangler ships the built config rather than `wrangler.jsonc` itself. Push to main does the same from CI (`deploy.yml`); the command is for a one-off.
- `wrangler.jsonc` carries `account_id` and two custom domains: `knobs.dev` (canonical) and `www.knobs.dev`. `canonicalRedirect` (`src/lib/canonical.ts`, called from `src/server.ts`) answers `www` with a 301 to the apex, path and query kept.

### i18n lint

- All user-facing strings go through Paraglide (`m.*()`). `react/jsx-no-literals` (oxlint, error) forbids hardcoded JSX text and text-bearing attributes (label/placeholder/title/alt/aria-\*); stories and scripts are exempt via overrides. `packages/ui` components take all text as props. Inline `oxlint-disable` only with a justification comment.

## Dev workflow

- `pnpm dev` runs mprocs with two panes: web and storybook. Quit with `q`; panes restart individually with `r`.
- When everything is broken for no reason: `pnpm bad-day` (kills dev processes, removes every node_modules/cache/generated dir, prunes the pnpm store, reinstalls). Preview with `DRY_RUN=1 pnpm bad-day`.
- Claude Code hooks (`.claude/settings.json`): every Write/Edit is auto-formatted (oxfmt) and auto-fixed (oxlint) on save; a Stop hook runs `pnpm typecheck` and blocks the stop if types are broken.
- Agent skills for the stack live in `.claude/skills/` (committed, pinned by `skills-lock.json`). Maintenance: `npx skills update` refreshes them; `pnpm skills:check` warns when a dep's installed major drifts from what its skill was last verified against (`skills.versions.json`); after a major dep bump, update the skill, re-verify, bump `checkedMajor`. MCP servers are pinned by exact version in `.mcp.json`.
- Renovate bumps deps (minor/patch grouped weekly, majors gated behind the dependency dashboard).

## CI/CD

- **CI** (`.github/workflows/ci.yml`, PRs + main): `checks` job = turbo lint/typecheck/build + `format:check` + `skills:check` + react-doctor; `test` job = Chromium story tests. Turbo remote cache activates when `TURBO_TOKEN`/`TURBO_TEAM` are configured.
- **Deploy** (`deploy.yml`, push to main): wrangler-action builds and deploys `apps/web` to Cloudflare Workers.
- **Previews** (`preview.yml`): every PR uploads a Workers preview version and comments the URL. Previews build without the analytics client id, so preview traffic stays out of the numbers.
- Required repo config lives in README's "Going to production" checklist. CI must be green before merge.

## Rules

- Never edit generated directories: `apps/web/src/paraglide/`, `apps/web/src/routeTree.gen.ts`.
- No new dependencies, components, or abstractions without a concrete current need.
- Secrets never enter git. Local uses `apps/web/.env` (from `.env.example`); prod uses wrangler secrets.
- Conventional commits, enforced by commitlint. PRs only against `main`; CI must be green.
- Stack decisions are recorded in `docs/adr/`. Change of direction = new ADR. ADR-0001 is the founding record of the full boilerplate; this repo keeps only the web half of it.

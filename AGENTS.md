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
          Three server routes: `/api/op/$`, the OpenPanel analytics proxy,
          `/api/demo/$`, what the demo request buttons ask for, and
          `/api/frameable`, the check behind "test on your website".
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
| `pnpm test`         | Storybook story tests in Chromium, web logic tests in node         |
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
- Logo: the master is `apps/web/src/assets/logo.svg` (200 viewBox; its colors are its own, the same on both grounds). `public/favicon.svg` is a copy of it and `KnobsMark` in `brand-marks.tsx` is the same drawing inline, 20px beside the hero's wordmark; change all three together. The PNGs in `apps/web/public` come from the master through headless Chrome, then `sips` (Chrome will not open a window as small as an icon): `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --default-background-color=00000000 --window-size=512,512 --screenshot=logo-512.png file://$PWD/apps/web/src/assets/logo.svg`, then `sips -z 32 32 logo-512.png --out apps/web/public/favicon-32.png` (and `-z 16 16` for `favicon-16.png`). `apple-touch-icon.png` is the same at `--window-size=720,720` from a copy with the panel's corners square (`sed 's/ rx="44"//'`), then `sips -z 180 180`: iOS rounds the corners itself. The logo study and the other candidates are in the owner's wiki, not in this repo.
- Current set: Button, Input, Field (label/error composition), Dialog, Select, Table, Label, Separator, Skeleton, Toaster (sonner, next-themes dropped). Grow on demand from the registry.
- A story is the test: every component has colocated `*.stories.tsx` with `play` interaction tests. `pnpm --filter @knobs/ui test` runs them in real Chromium via the Storybook Vitest addon (Vitest browser mode). `pnpm storybook` serves them on :6006.

## Web (`apps/web`)

- TanStack Start on Cloudflare Workers. Custom entry `src/server.ts` (wrangler `main`) wraps the Start handler with `canonicalRedirect`, `paraglideMiddleware` and an evlog wide event per request (Axiom drain when `AXIOM_TOKEN`+`AXIOM_DATASET` set); wrangler `observability` stays disabled so logs are not duplicated.
- React Compiler is on (`react({ compiler: true })` via `oxc-transform-react`).
- i18n: Paraglide v2, `messages/en.json` only. Generated `src/paraglide/` and `src/routeTree.gen.ts` are gitignored build output: never edit them, they regenerate on `vite dev`/`build`. All user-facing strings go through `m.*()`.
- Env: `apps/web/.env` (copy `apps/web/.env.example`). Vite reads it, and the Cloudflare vite plugin also hands it to the Worker as local dev vars. `VITE_*` vars are validated in `packages/env`, all of them optional, so the site runs with no env at all.
- StyleX in routes: import `../app.css` (build injection target); there is no importable `virtual:stylex.css` module; in dev the plugin middleware serves the CSS itself.
- Logic with no page in it is tested with node's own runner, no dependency: `pnpm --filter @knobs/web test` runs `src/**/*.test.ts` (`node --test`, types stripped by node). Today that is `src/try/address.test.ts`. `packages/ui` stories cover the components. Add a vitest project back when a test needs a DOM.

### Local devknobs in dev

- The dev server runs devknobs from a local checkout, so the site is its test bed: `vite.config.ts` aliases `devknobs` to that checkout's `src/index.ts` (only under `vite dev`), and edits there reload the page. `node_modules` is never touched, so `pnpm install` cannot undo it.
- The checkout is `DEVKNOBS_PATH` (shell env; absolute, or relative to the repo root), else `../devknobs` beside the repo, which also fits the `knobs.dev.<branch>` worktrees. To test a devknobs worktree: `DEVKNOBS_PATH=../devknobs.<branch> pnpm dev`.
- Dev start prints which one is in use: `devknobs: local <path>`, or `devknobs: npm <version>` when no checkout is there.
- Types, `vite build`, CI and prod use the pinned npm `devknobs` only. Device images come from the checkout's `assets/bezels` (a dev middleware maps the source's `src/engine/bezels/` URLs there).
- The early script (`devknobs/early?raw`) goes first in `<head>` through `src/server.ts` (HTMLRewriter, in place of the `script[data-devknobs-early]` slot `__root.tsx` renders, so each head script hydrates onto its own). The slot needs both `dangerouslySetInnerHTML={{ __html: '' }}` and `suppressHydrationWarning`: without the first, React finds the server's script text in an element it expects empty, fails hydration and renders the whole document again on the client; the second silences the dev warning that the text differs. Builds inline the npm package's `dist/early.global.js`; under `vite dev` the plugin bundles the checkout's `src/early.ts` instead and rebuilds it when its sources change.

### Tuning the fold (dev)

- `https://knobs.localhost/?tune` adds a small card in the window's bottom left corner (`src/dev/foldtune.tsx`), with one slider per constant of devknobs' fold (the iPhone Duo: mostly how much the turning half of the screen is blurred). It draws them from the hook devknobs puts on the top page's window under `Symbol.for("devknobs.foldtune")`, which is there once a Duo has folded, so no key is written here. Each change is live. Under the head, one muted line says what drew the last fold (`drawn by webgl`, `drawn by layers`, `not drawn yet`) and why, from the hook's `info()`; a build without it shows no line, and "copy" and "save" carry it as `info`. "compare" shows the defaults while it is held. The card can be dragged by its head, and the values last a reload of the tab (`sessionStorage`, `knobs:foldtune`).
- "save" posts the values to `/__tune/fold`, a `vite dev` middleware (`vite.tune.ts`) that writes them to `apps/web/.tune/fold.json` (gitignored). "load last saved" reads that file back. The values are then baked into devknobs' fold constants by hand, from that file.
- The card shows more where the hook has it, each part only then. "presets": one button per named value set from the hook's `presets()` (such as `ours`, `jadon`, `jadon blur`); a press sets every key of it the spec has, and the one the values now equal shows as on. "angle 92.0": the hinge's angle from `angle()`, 0 shut to 180 open flat, with its own "copy". "page picture" downloads the PNG the fold draws on the turning screen (`shot()`) as `knobs-page-<width>x<height>.png`; with none, the hook's `shotWhy()` shows for a moment. That picture goes into the "Custom" mode of jadon's open demo of the same fold (<https://iphone-duo-tawny.vercel.app/>), its fold slider (0 to 180, 180 open) set to the same angle, to compare the two side by side. "copy" and "save" carry `preset`, `angle` and `ref` too.
- Reference pages show Apple's own screen images in our fold. `?tune&ref=<name>` (the card's "reference" row: one button per name, and "page" to go back) makes the index route draw `src/dev/reference.tsx` in place of the landing page: one image over the whole viewport on black, `<name>-inner.*` when the viewport is wider than it is tall or wider than 600px (the Duo open), `<name>-outer.*` otherwise (the cover screen). The frame loads the window's address, so its copy of the page draws the same. The panel mounts there; the tour does not. The images are in `apps/web/.tune/ref/` (gitignored, fetched by hand from Apple's public URLs, never committed, never shipped), named `[a-z0-9-]+` with `png`, `avif`, `jpg` or `webp`. `vite.tune.ts` lists them at `GET /__tune/ref` and serves each at `GET /__tune/ref/<file>`, from the page's own origin so the fold's picture of the page can hold them.
- Dev only: `__root.tsx` loads the card and `routes/index.tsx` the reference view behind `import.meta.env.DEV`, so a build has none of it and reads no `ref`, and the copy of the page in a device's frame never shows the card. Its words are plain literals, not Paraglide messages (`apps/web/src/dev/**` is exempt from `react/jsx-no-literals`).
- The rule: these tools are for local development only. Nothing of them goes into a build (the card, the reference view, the `/__tune/*` endpoints, which are `vite dev` only), and the images in `apps/web/.tune/` are never committed and never copied into `public/` or `src/`. A new import of `src/dev/*` is a dynamic `import()` behind `import.meta.env.DEV`. `scripts/dev-tools-check.ts` runs at the end of the web app's `build` and fails it when the output holds one of the tools' strings.

### Analytics

- Self-hosted OpenPanel at `analytics.vinena.studio`. Page views plus nine events: `trackOutgoingLinks` and `trackAttributes` stay off, and one delegated `click` listener on `document` (`src/routes/index.tsx`, through `track` in `src/lib/analytics.ts`) sends `link_click` for the page's anchors and `knob_click` for the devknobs panel's buttons and search results, read off `composedPath()` because the panel's shadow root is open. The code boxes' copy buttons send `copy_click` from their own handler. The guided tour (`src/tour/`), a frame around the real control to use next, sends `tour_step` with the stop id (`open`, `duo`, `scroll`, `unfold`, `iphone`, `mat`, `grab`) when a visitor does that stop in the real panel while the tour is on, `tour_done` once all seven are done (`grab` is always the last: a pick counts only once the other six are done), `tour_close` with the stop it was closed at, and `tour_explore` when the final bubble's "Explore other knobs" button is pressed (it ends the tour and opens the panel's list of every knob). The inline loader in `__root.tsx` skips automated browsers (`navigator.webdriver`) and the copy of the page devknobs loads in a device's frame (`window.top !== window`), so a device pick is not a second page view. The tour has one owner, the top page, which alone draws it: the copy in the frame reads it from, and reports its scroll and its grab picks to, the page above through `window.knobsTour`, so the events go out from the top page only. A closed or finished tour is remembered in `localStorage` (`knobs:tour`), except with `devknobs=fresh` in the address, where nothing is read or written. Every devknobs selector the tour depends on is in `src/tour/targets.ts`. The "test on your website" field sends `outside_show` with one word for how it went (`ok`, `refused`, `unchecked`, `local`, `unreachable`) and `outside_back`, through `trackAbove`, so a field used in a device's frame reports from the top page. The address and its host are never sent.
- The client id comes from `VITE_OPENPANEL_CLIENT_ID`. Unset means the script is never injected. The id is public; the secret half never leaves the analytics host. CI reads the repo variable `OPENPANEL_CLIENT_ID` for production builds, and leaves it unset on PR previews.
- The OpenPanel project allows `knobs.dev` only, so local events answer `401 Ingestion: Invalid cors or secret`; dev traffic cannot reach the numbers even with the id in `apps/web/.env`. A 401 from `https://knobs.localhost` means the proxy works, not that it is broken.
- `src/routes/api.op.$.ts` reverse-proxies the vendor so a blocker that knows its host does not drop the page views: `/api/op/op1.js` serves the script, everything else goes to `<host>/api/*`. It forwards `cf-connecting-ip` as `openpanel-client-ip` **and** `x-client-ip`; without those OpenPanel counts every visit as the same device. It answers crawler POSTs with a bare 200 instead of forwarding them.

### The stage

- `src/demo/stage.tsx` is the "See it react" section of the landing page: one card per knob row and per view of the panel, in a two column grid (`Cards` and `Card` in `src/lib/card.tsx`, which the feature cards lower on the page use too). A card never sets a knob. It shows what the page reads (`matchMedia`, `Intl`, `Date`, `navigator`, the viewport, storage), so a knob moved in the real panel shows there. The only buttons are for what a page has to start itself: a request, a write to storage, a dialog or popover, a question to geolocation, a box pushed past the edge for the overflow knob.
- The cards import nothing from devknobs, so the pinned npm package and a local checkout draw the same stage. A new knob in devknobs' catalog (`src/ui/catalog.ts` there) gets a card or a row here.
- Readouts go through `src/lib/live.ts`: `live(read, watch)` with `useLive` (a `useSyncExternalStore` whose server value is null, so the server and the first client render draw the same empty rows), and `held` for answers that come later. They listen where the browser has an event (media query `change`, `online`, `languagechange`, `resize`, a `ResizeObserver` for text size and safe areas) and look again on a timer only where it has none: the clock, the user agent, and storage while its card is in view.
- Every font size on the page is in rem, so the text size knob moves it. Spacing and radii stay in px.
- The motion card holds the stage's one animation, which starts when its card scrolls into view.

### Demo requests

- `src/demo/requests.tsx` is the stage's requests card: chips in five groups, one request each, so the devknobs requests view has every kind to show: fetch and XHR in each method and outcome, streams, and an image, stylesheet, script and font. The chips send no analytics events (the delegated listener reports anchors and the panel only), and nothing of theirs goes through `/api/op`. Three leave the site on purpose: `network error` and `xhr error` ask `https://demo.invalid/`, which never resolves, and `cors blocked` and `no-cors` ask `https://example.com/`.
- `src/routes/api.demo.$.ts` serves them under `/api/demo/*`: `json`, `echo` (GET, POST 201, PUT, PATCH, DELETE 204), `status/:code` (a fixed set of error codes), `redirect` (302 to `json`), `slow?ms=`, `big?kb=`, `text`, `html`, `bin`, `stream`, `events`, `asset.css`, `asset.js`, `asset.png`, `asset.woff2`. Every path but `echo` is GET only; another method gets a 405. It holds no state and makes no outbound request. Caps: `slow` 3000 ms, `big` 512 KB (one row repeated), `echo` reads 16 KB of the body, `stream` is 10 lines over 3 seconds, `events` is 4 events over 3 seconds. Every answer is `cache-control: no-store` and `x-robots-tag: noindex`. The echo names a fixed list of request headers and sends back a value only for `content-type`, `accept`, the demo's own fake token (`src/demo/fake.ts`) and `x-devknobs-now` when it is an ISO instant (the clock's "send to server" knob, which the time card asks about); any other value comes back as `sent`. The `html` answer has no `<head>`, so `server.ts` adds no early script to it.

### Test on your website

- `src/try/try.tsx` is the field in the hero, under the hint: a visitor types an address and that site shows in the device's frame. It uses devknobs' `frame` (`show`, `refuse`, `own`, `get`, `subscribe`), which the pinned npm package does not have yet. `src/tour/knobs.ts` types it locally, looks for it with a guard when the panel mounts and holds it in `outsideFrame`; the field is drawn only where it was found, so the server and the first client render draw nothing, and a build on a devknobs without `frame` never shows it. Never import `frame` from `devknobs` while the pin lacks it.
- A device's frame covers the top page, so two things reach across. The copy of the page in the frame asks the top page's `frame` through `window.knobsOutside`. While an outside page shows, the top page puts a small bubble at the window's bottom (on the body, in the top layer, marked `data-devknobs="outside"` so devknobs does not hide it): the site's host, "Back to this site" (`frame.own()`), one line on what works, and for a site that refuses, one line and the install command. Showing an outside page closes the tour, which points into the page in the frame.
- `src/try/address.ts` holds the rules, with no page and no network in it, tested in `address.test.ts`: what a typed address becomes (`https` for a bare name, `http` for a local one; only `http` and `https`, no user name or password), which sites are local (localhost, `*.localhost`, `*.local`, loopback, private and link local ranges; shown with no check, as the server cannot reach them), which addresses the server asks, and how `x-frame-options` and `frame-ancestors` are read (as the browsers do: `frame-ancestors` decides where it is set, and only `*` or a whole scheme lets any site in).
- `src/routes/api.frameable.ts` is `GET /api/frameable?url=`, which answers `{ ok, reason? }` with `refused`, `unreachable` or `invalid`, and nothing of the site asked. It asks public DNS names only: no IP address in any form, no single label, none of the private endings (`local`, `localhost`, `internal`, `lan` and the like), ports 80, 443, 8080 and 8443, no user name or password, 2048 characters at most. It follows up to 3 redirects by hand and checks each address again, stops after 4 seconds in all, and never reads a body. It answers only this site's own pages (`sec-fetch-site: same-origin`, else a referrer of this origin; a 403 otherwise). A verdict is cached for 5 minutes in the visitor's browser (`private`), `unreachable` is not. There is no rate limit: that needs a Workers rate limiting binding or a WAF rule on the path.
- The field does what the verdict says: `ok` shows the site, `refused` shows it as refused (`frame.show(url, { refused: true })`, the page is not asked for), `unreachable` says so under the field, and no verdict (an address the server does not ask, or a check that failed) shows the site unchecked.

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

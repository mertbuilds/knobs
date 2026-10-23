# devknobs

a dev-only panel for flipping browser preferences from inside the page. one
script tag and the knobs are there. no css to add, no code to change. zero
runtime dependencies.

## install

with an ai agent: paste this setup prompt into claude code, codex or cursor, and
it installs devknobs and mounts it in development only. it is the copy setup
prompt button on https://knobs.dev too.

<!-- the same text is the install_prompt message in apps/web/messages/en.json; change both together. -->

```
Install devknobs in this project. It is a dev-only panel that emulates browser preferences from inside the page. Docs: https://knobs.dev/docs

1. Detect the package manager from the lockfile and add devknobs as a dev dependency (npm i -D devknobs, or the pnpm, yarn or bun equivalent).
2. Mount it once, on the client, in development only:
- Next.js: make a small client component (the file starts with "use client"). In it, import dynamic from "next/dynamic", then const DevKnobs = process.env.NODE_ENV === "development" ? dynamic(() => import("devknobs/react").then((m) => m.DevKnobs), { ssr: false }) : null; and render {DevKnobs && <DevKnobs />}. Render that component once in app/layout (App Router) or pages/_app (Pages Router).
- Everything else with a bundler (Vite, TanStack Start, React Router, SvelteKit): call if (import.meta.env.DEV) import("devknobs").then(({ mount }) => mount()); in the client entry, or in a mount effect of the root component in an SSR app. Use the bundler's own dev flag where import.meta.env.DEV does not exist.
- A plain page with no bundler: skip the npm install and add <script src="//unpkg.com/devknobs/dist/index.global.js"></script> to the page. It mounts itself. Keep it out of the deployed page.
3. Keep devknobs out of production builds. A static import stays in the bundle even behind a dev check, so gate the import itself as above. If the project has a build script, run it and check that the output has no devknobs.
4. If the app reads media queries, the time or the user agent while it boots, or renders with React, add the early script as the first element in <head>, in development only: <script src="//unpkg.com/devknobs/dist/early.global.js"></script>
5. Change nothing else in the project.
6. Then tell me what you changed and how to open the panel: press Shift+K or click the handle on the right edge of the window. In the open panel, / searches the knobs. Shift+G grabs an element.
```

or by hand:

```
npm i -D devknobs
```

## usage

all of it is for dev only, so gate it yourself:

```js
import { mount } from "devknobs";

if (import.meta.env.DEV) mount();
```

or with no bundler, a script tag that mounts itself:

```html
<script src="//unpkg.com/devknobs/dist/index.global.js"></script>
```

press `⇧K`, or click the handle on the right edge of the window, to open the
panel. react, next.js and the early script are in the docs.

## docs

- [start](https://knobs.dev/docs/start): install, usage, the api, options and
  the early script
- [the panel](https://knobs.dev/docs/panel): rows, search, keys, pinning,
  settings, shortcuts and fresh mode
- [knobs](https://knobs.dev/docs/knobs): every knob and how it is emulated, the
  frame, and the clock on your server
- [devices](https://knobs.dev/docs/devices): presets, mocks and bezels, the
  phone's browser, touch, and how the iphone duo folds
- [grab and inspect](https://knobs.dev/docs/grab): copy an element for an
  agent, migrate from react-grab, see an element's css
- [requests and storage](https://knobs.dev/docs/requests-and-storage): what
  the page asks for and what it keeps, and storage presets
- [agents](https://knobs.dev/docs/agents): drive the knobs from a coding agent,
  and the agent skill
- [chrome extension](https://knobs.dev/docs/extension): the panel on any site,
  with some knobs set for real
- [limits and faq](https://knobs.dev/docs/limits): what cannot be faked from
  inside a page
- [privacy](https://knobs.dev/docs/privacy): what is kept and what is sent

## development

to try a local build in an app:

```
bun run link ../my-app
bun run unlink ../my-app
```

a relative path is from the devknobs folder; absolute and `~` paths work too.
the app may use any package manager: a pnpm app's link into its store is kept
and put back as it was.

`link` builds, then copies the package into the app's `node_modules/devknobs`
and keeps the installed one beside it for `unlink` to put back. it is a copy,
not a symlink: Turbopack refuses a package linked from outside the app, and
other bundlers treat the real path as app source. restart the app's dev server
after each.

the controls for tuning the iphone duo fold's look by hand, `src/engine/foldtune.ts`,
are for development and never in the package: the build passes
`--define DEVKNOBS_TUNE=false` to every bundle and `scripts/tunefree.ts` fails
a build that has any of them. an app gets them by loading devknobs from source,
a bundler alias from `devknobs` to this repo's `src`, where the constant is not
defined and the table is on `window` under `Symbol.for("devknobs.foldtune")`.
an app that builds from source for production defines `DEVKNOBS_TUNE` false too.

## license

MIT, except the bezel images in `dist/bezels`. bippy and the code adapted
from react-grab are MIT too, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for them and for the images' own terms.

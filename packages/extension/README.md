# @knobs/extension

A Chrome extension that puts the devknobs panel on any page, the same panel as the npm package, with some of its knobs set for real through the Chrome DevTools Protocol (`chrome.debugger`) in place of devknobs' emulation in the page.

## Knobs

Every knob, key and view of the panel is devknobs' own. These go to the browser instead, through devknobs' `native` option:

- **Text size**: `Page.setFontSizes` changes the browser's default font size (monospace scales with it), so `rem`, `em` and `em` media queries all follow, with no rewrite of the page and no jump after paint.
- **Offline** (the network knob's `online` field): `Network.emulateNetworkConditions` with `offline: true`. Requests fail and `navigator.onLine` is false. The connection type and save data stay in the page.
- **Preferences**: color scheme, contrast, reduced motion and reduced transparency, through `Emulation.setEmulatedMedia`.
- **Viewport**: a plain width, height or ratio, or a device with nothing drawn around the page (mock off, browser off, not a foldable, no vision filter, zoom at fit, frame knob off, not docked), is the tab's own viewport with no frame: `Emulation.setDeviceMetricsOverride` (the size, the ratio, `mobile` for a phone or tablet, whose screen is its viewport), `Emulation.setTouchEmulationEnabled` (5 touch points) and `Emulation.setEmitTouchEventsForMouse` for the touch pointer knob. The page keeps its state: nothing reloads. One bigger than the tab is scaled down to fit it, and redrawn when the window resizes. Anything drawn around the page keeps devknobs' frame exactly as before, and the override is cleared meanwhile (`Emulation.clearDeviceMetricsOverride`), so the two never stack. The ua knob, a device's browser too, stays in the page as with the npm package.

The debugger attaches to a tab when one of these leaves its default and detaches when all are back (Reset in the panel does that). Overrides survive navigation in the tab while attached, so a reload paints with them from the first frame.

## Real or in-page

While the debugger is on a tab, Chrome shows its "devknobs started debugging this browser" bar. No extension can hide it. The panel's settings have a switch for it, "real browser settings", on at first:

- **On (real)**: the knobs above go through the debugger, as described. The bar shows while one of them is set.
- **Off (in-page)**: every knob is devknobs' own emulation in the page, exactly as the npm package does it, and the debugger leaves every tab. No bar. The framing rule stays, so the width knob's frame still loads pages that refuse frames.

The switch is kept for every tab and site (`chrome.storage.local`). Flipping it keeps every knob's value and moves it live, with no reload: off, the tab's overrides are cleared and the page emulates the same knobs; on, the page's emulation goes and the debugger takes them back.

Closing the bar (its x or Cancel) detaches the debugger. The extension takes that as a choice: the switch goes off for every tab, the knobs stay as they are in the page, and the switch says why ("switched to in-page: Chrome's debugger bar was closed"). The tab keeps Chrome's font size from the debugger until its next load; in-page text size counts it as the browser's default, so it is not applied twice.

What in-page costs, as with the npm package:

- Text size rewrites the page's root size after it starts, so text can jump on load, and `em` media queries only follow where devknobs rewrites them.
- Offline only flips `navigator.onLine` and fires its `offline` event. Requests still go out.
- The emulated scheme and the rest patch `matchMedia` and the page's stylesheets, which a server-rendered page can see as a hydration mismatch.
- A plain size or device is devknobs' frame, which loads the page a second time.

## How it fits together

- `src/content.ts` runs in the page's own world (`world: "MAIN"`, at `document_start`, in the top frame and in devknobs' width frame), so `window.devknobs` is there for agents as with the npm package. It mounts devknobs with a native driver that sends those knobs on, and with no handle on the page's edge, since the toolbar button opens the panel (the panel's settings can show it again).
- `src/bridge.ts` runs in the extension's world in the top frame and carries them between the page and the service worker, as json on `document` events (the page world cannot reach `chrome.runtime`).
- `src/background.ts` keeps each tab's knobs, maps them to commands (`src/knobs.ts`) and attaches or detaches the debugger. On each page load the bridge asks for the tab's knobs, and those win over the page's stored ones, so a page on another origin shows what the tab has. The toolbar button opens or closes the panel in the tab. Closing Chrome's debugging bar switches every tab to in-page mode, see above; the debugger leaving a tab for another reason, such as the tab closing, puts the panel's knobs back to their defaults.
- The panel keeps the user's own look. The emulated scheme and motion reach every media query in the tab, the panel's too, so `src/offscreen.ts`, an offscreen document outside every tab, reads the real ones. The service worker hands them out with each page load's knobs and sends each change to every tab, and the bridge passes them to devknobs' `setSystemMedia`.
- Framing. The width knob, or a docked panel, loads the tab's own page in a frame, which `X-Frame-Options` or a `frame-ancestors` policy refuses. Before each page load in the tab (`webNavigation.onBeforeNavigate`), and again as it loads, the service worker sets one session rule for the tab (`declarativeNetRequest`, its id the tab id): frame loads in that tab, to and from the page's host, lose `X-Frame-Options` and `Content-Security-Policy`. The rule goes with the tab. It is set again when the page commits (`webNavigation.onCommitted`), so a redirect to another host, such as `www` to the bare one, moves the rule along.
- A service worker's frame. Where the page's service worker answers the frame's load, the load the rule sees is the worker's own `fetch`, which belongs to no tab, so the rule above misses it. While a tab has devknobs' frame open on a host (the page tells the service worker as the frame opens and goes), one more session rule takes `X-Frame-Options` and `Content-Security-Policy` off what that host's service worker fetches from it: no tab (`tabIds: [-1]`), the host as request and initiator, type `xmlhttprequest` (the type a worker's `fetch` has; `sub_frame` and `other` do not match it). One rule per host, its id from the host's name, gone once no tab has a frame open on the host, a tab closing or loading another page included. The cost: meanwhile, every answer that host's service worker fetches from the network loses those two headers, not only the frame's page. The frame can start loading before the rule is set, so the first refusal on a page with a service worker loads the frame again once, at once, after the rule is in.
- Why a frame was refused. While the debugger is on a tab, the service worker keeps the last few document loads of the tab's frames under the top one (`src/refusal.ts`): the address asked for and where it ended (another host, or Chrome's error page), each redirect, the status, the headers that bear on framing (`X-Frame-Options`, the `frame-ancestors` part of the CSP, `Cross-Origin-*`, `Location`), `Sec-Fetch-Dest` and `Sec-Fetch-Site` as sent, whether a service worker answered and from where, how the load failed (`blockedReason`, the CORS error), and Chrome's own issues (`Audits`) and console lines (`Log`) about it. When devknobs shows its refusal notice, the panel asks for the frame's latest load and says why under the notice in a line, such as `x.com/i/flow/login answered 200 with X-Frame-Options: DENY (from a service worker)` or `redirected to another site: accounts.google.com`, with a "copy details" button for the whole record as json. A service worker's scope comes from the page's own registrations, since the protocol does not give it to an extension. With no knob keeping the debugger on, as for a mocked phone, the line says it was not watching, and "find out why" puts it on, loads the frame again and takes it off once it has the answer. In-page, the line says to turn real browser settings on.
- Past the service worker. A service worker that answers the frame from its own cache sends the refused page itself, which no rule reaches. On a page with a service worker, the notice then offers "load without the service worker (shows Chrome's bar)": the debugger goes on the tab, `Network.setBypassServiceWorker` has the tab's loads, the frame's and the page's own, go to the network, and the frame loads again. It stays so while the frame is open, and through a load of the tab's page on the same host, such as a page that reloads itself once the frame's copy updates its service worker: the page's stored knobs open the frame again, and the bypass waits 15 seconds for it. Once the frame goes, service workers answer again and the debugger leaves, unless a knob keeps it.
- Leaving the frame. A link, form or script in the frame that goes to another origin (a sign-in provider, say, which refuses frames anyway) takes the whole tab there, as it would with no frame; the knobs wait on the page's origin for the way back. A server's redirect to another host still gets devknobs' notice, whose button closes the frame. With the panel closed and no handle, the toolbar button opens it on any page, a framed one too.

## Build and load

```sh
pnpm --filter devknobs build
pnpm --filter @knobs/extension build
```

The content script bundles devknobs' built package, and `dist/` gets its device images. Then in Chrome: `chrome://extensions`, turn on Developer mode, Load unpacked, pick `packages/extension/dist`.

## Checks

- `pnpm --filter @knobs/extension test`: the knob to CDP command mapping (`src/knobs.ts`), what a detach tells the tab (`src/messages.ts`) and the record of a frame's load and the line it gives (`src/refusal.ts`), with `bun test`.
- `pnpm --filter @knobs/extension smoke`: loads `dist/` into Playwright's Chromium, drives the panel through `window.devknobs` on a local page and checks what the page sees, in the width knob's frame too, then resets and checks the debugger is off. Then a page themed from `matchMedia` change events and `light-dark()` flips with the scheme knob, docked too, while the panel keeps the system's look; a page that sends `X-Frame-Options: DENY` and `frame-ancestors 'none'` loads in the frame, in a new tab opened straight to it too, and the framing rule stays with its tab and host. The panel shows no handle while closed, where the npm build does. In a window of its own, a plain size and a phone with nothing drawn are the tab's own viewport (its width, ratio and touch screen, no frame, no reload), a mock or a browser drawn around the phone brings the frame back with the override cleared, and reset detaches. In-page mode in a window of its own: the switch off detaches the debugger and the page emulates text size (inline on `<html>`) and frames a plain phone, every knob kept; on again, the debugger is back and the inline size gone; closing Chrome's bar, run through the service worker's handler since a test cannot click the bar, turns it off for every tab with the knobs kept. A link in a frame to another origin moves the tab there. A page whose app takes devknobs' nodes out of `<body>` as it starts, or puts a new `<body>` in, keeps its frame and panel. Why a frame was refused, in a profile of its own: a page that refuses frames, with the framing rule taken off, shows that the debugger was not watching, and "find out why" names its `frame-ancestors` and copies a record with the status, headers and `Sec-Fetch-*`, then the debugger leaves; a frame redirected to another host names that host; a service worker's `X-Frame-Options` answer says it came from one, with its scope; in-page, it says to turn real browser settings on. It shoots that notice to `smoke-out/refusal-cause.png`. Service workers, in a profile of their own: a page whose worker fetches it from a server that refuses frames loads in the frame with no notice, real and in-page, with the worker rule on its host while the frame is open, gone once the frame closes and once the tab closes; a worker that answers from its cache says so under the notice, and its button loads the page past the worker, with a knob on and with none, then closing the frame turns the bypass off and the debugger leaves. The same with a mocked phone on pages whose app clears `<body>` as it starts, puts a new one in, or reloads the tab once the frame's copy loads past the worker: the frame ends up showing the page with the bypass on and the debugger attached, and both go with the frame. It also shoots the open panel with the extension and with the npm build, and the settings with the switch, into `smoke-out/`. Build first. `bun scripts/build.ts <dir>` and `node scripts/smoke.ts <dir>` build and check another directory than `dist/`, so a work in progress never lands in the one Chrome loads. Needs Playwright's Chromium (`pnpm exec playwright install chromium`); branded Chrome ignores `--load-extension`.

## Permissions

- `debugger`: the knobs above, through the DevTools protocol, and a frame's load past a service worker.
- `declarativeNetRequestWithHostAccess` and `host_permissions: <all_urls>`: the framing rule. It removes response headers, which needs host access.
- `offscreen`: the document that reads the user's own scheme and motion.
- `storage`: each tab's knobs and which tabs have a frame open on which host, in session storage, and the real or in-page switch, in local storage.
- `webNavigation`: sets the framing rule before a page loads, so a frame it opens at once loads the first time.

## Limits

- Chrome and Edge only (`chrome.debugger`).
- While a knob is on in real mode, Chrome shows its "started debugging this browser" bar. In-page mode has none, with the trade-offs above.
- Pages Chrome does not let extensions reach (`chrome://`, the Web Store) get no panel. Tabs open before the install get it at their next load.
- The panel lives in the page, so the real scheme and motion settings reach it too: with the scheme knob on dark, the panel is dark as well.
- A page whose Content Security Policy blocks inline styles gets the panel unstyled.
- The framed copy of a page loses its whole Content Security Policy, not only `frame-ancestors`: a rule cannot edit part of a header. The page in the tab itself keeps it.
- A frame led to another host, a subdomain of the page's host aside, is refused.
- While a frame is open on a host, what that host's service worker fetches loses `X-Frame-Options` and its CSP, in every tab. A service worker that answers from its cache needs the debugger, and with it Chrome's bar, to be passed by.
- Under a native viewport the panel lives in the page, so it is fixed within the emulated viewport: as narrow as the phone, and scaled with it when the tab is smaller. Docking it beside the page is a later step.
- A phone's viewport is Chrome's mobile layout: a page with no `<meta name="viewport">` lays out at 980px, as on a real phone, where devknobs' frame gives it the device's width. `ontouchstart` is set in the page, since Chrome adds it only on a load.
- A tab's viewport follows the page's own size knobs: it is not carried to a page on another origin the way text size and preferences are.
- A page that tries to break out of the frame (`top.location = location`) cannot: devknobs' sandbox lets the frame move the tab only on a click.
- The panel and grab keep the system's scheme and motion. The panel has no styles for contrast or transparency, so those knobs do not change it either. Inside a device's frame, the cursor dot and grab's box still follow the motion knob.

---
title: chrome extension
description: The devknobs panel on any site, with some knobs set for real by Chrome.
order: 8
---

## what it does

the same devknobs panel on any page you open, with no change to the site's code. the toolbar button opens and closes it. Chrome and Edge only.

## install

it is coming to the chrome web store. until then, build it from a clone of the repo and load it unpacked. you need node 24 or later, pnpm and [bun](https://bun.sh).

```sh
git clone https://github.com/mertbuilds/knobs.git
cd knobs
pnpm install
pnpm --filter devknobs build
pnpm --filter @knobs/extension build
```

then open `chrome://extensions`, turn on developer mode, press load unpacked and pick `packages/extension/dist`. tabs open before the install get the panel at their next load.

## what Chrome sets for real

the npm package fakes every knob inside the page. the extension hands these to Chrome instead:

- text size: `rem`, `em` and em media queries all follow, with no jump after paint.
- offline: requests really fail.
- the preferences: color scheme, contrast, reduced motion and reduced transparency.
- viewport: a plain size, or a device with no mock or browser drawn around it, becomes the tab's own viewport, with no reload.
- user agent: every request of the tab carries it, so servers see it too.

while text size, offline, a preference or the viewport is set, Chrome shows its "started debugging this browser" bar. to avoid it, turn off "real browser settings" in the panel's settings, and those knobs work in the page as with the npm package. the user agent still reaches servers.

if the page runs devknobs too, the extension's panel wins, and the page's calls such as `setState` go to it.

## permissions

- `debugger`: the knobs set for real.
- `declarativeNetRequestWithHostAccess` and `<all_urls>`: the user agent and framing rules.
- `offscreen`: reads your own scheme and motion.
- `storage`: each tab's knobs and the real or in-page switch.
- `webNavigation`: drops framing rules when a tab loads another page.

pages that refuse frames still load in the width knob's frame: while it is open, the extension removes `X-Frame-Options` and `Content-Security-Policy` from that tab's frame loads of the page's host.

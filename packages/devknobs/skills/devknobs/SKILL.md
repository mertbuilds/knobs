---
name: devknobs
description: Test a web page under different conditions with devknobs and fix what breaks. Use when an agent needs to check a page in dark mode, with reduced motion or more contrast, in another locale or right to left, with larger text, offline or on a slow connection, on another device or width, in another time zone or at another time, and then find and fix the code behind anything that looks wrong.
---

# devknobs

devknobs is a dev panel that emulates browser conditions from inside the page.
You drive it from any browser tool that can run JavaScript in the page:
Playwright `page.evaluate`, Chrome DevTools MCP `evaluate_script`, or similar.

## Before you start

devknobs must be installed in the app. See the install section of the
devknobs README (`node_modules/devknobs/README.md`).

Check that the api is on the page:

```js
typeof window.devknobs?.describe === "function";
```

Every way of mounting devknobs puts the api on `window.devknobs`: the script
tag, `mount()` and `<DevKnobs />`. Inside the width knob's frame the frame's own
copy has it too. If the check fails, devknobs is not mounted on this page.

## Learn the knobs

Call `describe()` first. Never guess a key or a value.

```js
window.devknobs.describe();
```

It returns one entry per knob:

- `key`: the key in a `setState` patch.
- `description`: what the knob does.
- `value`: the values it takes. `enum` lists them. `number` has `min`, `max`
  and keywords in `or`. `string` has `examples` and keywords in `or`. `object`
  lists its `fields`, and you can patch one field at a time.
- `default`: the value `reset()` goes back to.
- `reload`: what applying it takes. `none`, `frame` or `page`.

## Set a condition

1. Call `setState(patch)`. It is sync and returns the new state.
2. Wait for it to apply:
   - `reload` is `none` or `frame`: `await window.devknobs.ready()`.
   - `reload` is `page`: the page may reload, or it may not. devknobs skips a
     reload that comes less than 5 seconds after the last one. Call
     `await window.devknobs.ready()` either way. If the page navigates
     instead, wait for the load in your browser tool and call
     `await window.devknobs.ready()` on the new page. A `ready()` from the old
     page never settles.

`ready()` resolves with the state once devknobs is mounted and the device frame
has caught up. After 10 seconds it rejects with the error
`devknobs: not settled after 10 seconds`. A rejection is not success: check the
page before you trust it.

```js
window.devknobs.setState({ scheme: "dark", motion: "reduce" });
await window.devknobs.ready();
```

```js
window.devknobs.setState({ device: "iphone-17", locale: { lang: "ar", dir: "rtl" } });
await window.devknobs.ready();
// If the page navigates, the evaluate ends with it. Wait for the load, then on the new page:
await window.devknobs.ready();
```

## Check the page

1. Close the panel, so it stays out of screenshots:
   `window.devknobs.setState({ panel: { open: false } })`.
2. Take a screenshot, or read the DOM.
3. A numeric width or height, a device, a numeric dpr, a vision other than
   `none`, `frame: true`, or a panel pinned to its side (`panel.docked`) render
   the page in an iframe. `ua` does not bring
   the frame up. It only reloads the frame while one is up. The iframe is in
   a shadow root, so reach it through its host:

   ```js
   const frame = document
     .querySelector('[data-devknobs="viewport"]')
     ?.shadowRoot?.querySelector("iframe[data-devknobs-frame]");
   frame?.contentDocument;
   ```

   Read the DOM there. The page in the frame runs its own devknobs, so call
   `grab` on `frame.contentWindow.devknobs` there.

## Find the code

For an element that looks wrong, call `grab`:

```js
const el = document.querySelector("header nav");
const payload = await window.devknobs.grab([el]);
payload?.content;
```

`content` is one line per element: its html, the components that rendered it
and their source files with line and column. `entries[i].source?.filePath`
holds the file. `source` is null when devknobs cannot find one. Open that file and fix the code. `grab` also copies the
result to the clipboard. The payload comes back even when the copy fails, as it
often does in headless browsers; `copied` says whether it reached the
clipboard. `grab` returns `null` only when the elements give nothing.

After a fix, reload the page. The knobs stay set across reloads. Call
`await window.devknobs.ready()` and check again.

## Loop over conditions

```js
const conditions = [
  { scheme: "dark" },
  { motion: "reduce" },
  { contrast: "more" },
  { text: 24 },
  { spacing: true },
  { network: { online: "offline" } },
  { timeZone: "Asia/Kathmandu" },
  { width: 390 },
];
```

For each condition:

1. `window.devknobs.reset()`.
2. `window.devknobs.setState({ ...condition, panel: { open: false } })`.
3. Wait as in "Set a condition".
4. Screenshot or read the DOM. Note what breaks.
5. `grab` the broken elements, fix the code, check again.

Test locale apart, as it can reload the page: `{ locale: { lang: "ar" } }`. The
`reset()` after it can reload the page too, so wait for the load. Also try
`{ pseudo: true }` to find text that is cut off or not translated.

## Finish

Call `window.devknobs.reset()` when you are done. The knobs are kept in
`sessionStorage` and stay set across reloads in the tab until a reset.

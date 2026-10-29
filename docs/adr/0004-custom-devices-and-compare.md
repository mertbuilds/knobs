# ADR-0004: Custom device mockups and multi-device compare

Date: 2026-10-29. Status: accepted.

## Goals

- Anyone adds a device of their own from a PNG or SVG picture of its body: knobs finds the screen hole, the user corrects it with handles, and the device lists next to the built-in ones.
- Two or more devices side by side, each running the page with its own knobs. The headline case is the same iPhone at the default text size and at XXL.
- Both reachable from `window.devknobs`, so an agent can set them up without the panel.

## Custom devices

### Data model

One JSON document per device. `image` is a `data:` URL, or an `http(s):` URL that the import fetches and turns into one. All geometry is in the image's own px, except `viewport` and `safe`, which are css px of the screen.

```json
{
  "v": 1,
  "id": "custom:my-phone",
  "label": "My phone",
  "kind": "phone",
  "image": "data:image/png;base64,...",
  "imageSize": [1200, 2400],
  "screen": { "x": 60, "y": 60, "width": 1080, "height": 2280, "radius": 120 },
  "cutout": { "x": 440, "y": 90, "width": 320, "height": 90 },
  "safe": { "top": 59, "right": 0, "bottom": 34, "left": 0 },
  "viewport": { "width": 360, "height": 760 },
  "dpr": 3,
  "chrome": "none"
}
```

- `id` always starts with `custom:`, so it can never shadow a built-in id. `kind` is `phone`, `tablet`, `laptop` or `desktop`. `chrome` is `none`, `ios-safari` or `android`. `cutout` and `safe` are optional.
- `validateDevice()` checks every field and throws a `TypeError` that names the first bad one, the way `setState` does.
- A custom device becomes a `DevicePreset` (touch for phones and tablets, the ua preset its chrome implies) and a `Mock` whose `image` is the picture, so the frame, fit, mock knob, screen size and touch all treat it as any built-in phone.
- Chrome: `ios-safari` and `android` borrow a generic Safari or Chrome bar spec (status bar height from `safe.top`, else 62 or 24), so the bars draw. `none` draws no bars.
- Safe areas are kept and drawn in the editor. knobs does not emulate `env(safe-area-inset-*)` for any device yet, so they are metadata for now.

### Detection

`detectScreen()` takes raw RGBA pixels. It flood fills from the image's center over pixels that are transparent (alpha under 16) or within a small distance of the center's color, takes the filled region's bounding box as the screen, and the radius from how far the first filled pixel sits along the top left diagonal (`r = d / (1 - 1/sqrt 2)`). An SVG is rasterized through a canvas first. The default viewport is the screen's size over the chosen dpr (3 for phones, 2 otherwise), rounded.

### Storage

`localStorage` under `devknobs:devices`, one versioned JSON list (`stamped`, as every other key). Not IndexedDB, because:

- the device id is resolved synchronously everywhere: `parse()` of the stored state, the early script, `deviceOf()` in `merge()`, and the copy of the page inside the frame, which must know the device before its first paint;
- the frame shares the origin's `localStorage`, so it sees the same devices with no message.

The cost is the quota (about 5 MB per origin). The editor downsizes any picture whose data URL passes 1.5 MB (canvas, longest side 1600 px, PNG), and a save that still hits the quota throws a clear error instead of failing silently.

### UI flow

The device row gets a `custom…` chip. It opens the editor over the page: drop or pick a PNG or SVG, see the detected screen as a rectangle with corner handles (drag to move or resize), a radius slider, an optional cutout rectangle, safe area fields, label, kind, dpr, viewport (filled from the rect and dpr, editable) and chrome style. Save adds it to the `custom` group of the device list and selects it. The editor also exports one JSON (image embedded) and imports a JSON, with a separate image file when the JSON has none.

### Agent API

```ts
devknobs.devices.list(): CustomDevice[]
devknobs.devices.add(device: CustomDeviceInput, image?: string): Promise<CustomDevice>
devknobs.devices.fromImage(image: string, options?: Partial<CustomDeviceInput>): Promise<CustomDevice>  // URL or data URL, detects the screen
devknobs.devices.remove(id: string): boolean
devknobs.devices.select(id: string): DevknobsState
devknobs.devices.export(id: string): string
devknobs.devices.import(json: string, image?: string): Promise<CustomDevice>
```

`describe()` lists the custom ids in the `device` knob's values. A file path is not readable from a page, the extension included (its copy runs in the page). An agent in Node reads the file and passes a data URL.

## Compare

### Architecture

The smallest design that gives each frame its own knobs reuses what the device frame already does. The page in the width knob's frame runs its own copy of devknobs, which takes the knobs the page above posts to it (`{type: "state"}`) and emulates them inside its own window: `matchMedia`, the root font size, `Intl`, `Date`, `navigator`, `fetch`. Every one of those patches is per window.

So compare is one more module, `engine/compare.ts`, loaded on first use, that lays N iframes side by side in an overlay. Each iframe is marked as a devknobs frame, loads the page's address, and on its `ready` gets its own state: the base state (the panel's) merged with that frame's patch, run through `framed()`. A change in the panel reposts every frame; a change to one frame's chip reposts that frame. The main width frame and its module are untouched.

- Layout: one row, each cell an equal share of the window. `fit()` places each frame in its cell with its mock, so every device is drawn at its own fitted scale and the row fits the canvas. Below about 360 px per cell the row scrolls.
- Each cell has a chip over it that names the frame's diff from the base (`text 20 · dark`), or `base`. Clicking it opens a small editor for that frame: device (custom ones too), text size, scheme, motion, contrast, locale, network. `+` adds a frame (a copy of the last), `×` removes one; one frame left exits compare.
- Scroll sync: on by default, proportional (each frame scrolls to the same fraction of its scrollable height, so two text sizes stay on the same content). Modes `proportional`, `pixel`, `off`. A frame that a sync moved does not echo its scroll back.
- Text sizes take numbers, or Dynamic Type names mapped to a root size from iOS body sizes over Large (17 pt), times 16: `xs` 13, `s` 14, `m` 15, `l` 16, `xl` 18, `xxl` 20, `xxxl` 22, `ax1` 26, `ax2` 31, `ax3` 38, `ax4` 44, `ax5` 50.

### Per frame and global

Per frame: device (built-in and custom), orientation, mock, dpr, text size and spacing, color scheme (through the frame element's `color-scheme`, so even `prefers-color-scheme` in CSS is real), motion, contrast, transparency, locale and direction, pseudo, time zone and clock, geolocation, network (`onLine`, `connection`), ua, touch and the touch pointer, vision.

Global:

- Storage: `localStorage`, cookies, IndexedDB and caches are per origin, so every frame shares them. A frame that writes is seen by the others.
- The `native` driver (the extension's DevTools protocol) sets knobs for the whole tab. In compare every frame emulates in page, so the extension's real ua, throttling and media do not split per frame.
- The panel, its keys, grab and inspect stay with the page above and the main width frame: inspect does not reach into compare frames.
- The requests view records the page above and the main frame, not the compare frames.
- Browser bars (Safari, Chrome) are not drawn in compare frames: each frame is the device's whole screen.

### Agent API

```ts
devknobs.compare(frames: CompareFrameInput[], options?: { sync?: "proportional" | "pixel" | "off" }): CompareState
devknobs.exitCompare(): void
devknobs.compareState(): CompareState | null  // per frame: patch, full state, and once loaded the computed root font size
```

`CompareFrameInput` is a `setState` patch plus `textSize` (a number or a Dynamic Type name). Patches are checked as `setState` checks them. `describe()` adds one entry, `compare`, that is not a `setState` knob: it says how to call `compare()` and whether it is on.

## Test plan

- `bun test`: schema validation (good document, each bad field), detection on a synthetic RGBA frame made in the test (rect and radius within 2 px), export and import round trip (embedded and separate image), registry add, list, remove and select through the api, the device list and `describe()` showing custom ids, compare state building (base plus patch, diff chip text, Dynamic Type names), scroll sync math and echo guard.
- A Playwright test in real Chromium on a local page: compare with the iPhone 17 Pro at default and `xxl` reports different computed root font sizes inside each iframe, and scrolling frame A moves frame B proportionally.
- Proof renders (headless): the editor with a drawn sample frame, the custom device on the knobs site, compare default vs XXL, three frames with a custom device and dark vs light.

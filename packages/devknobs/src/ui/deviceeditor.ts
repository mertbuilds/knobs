import {
  addDevice,
  type ChromeStyle,
  CHROME_STYLES,
  type CustomDevice,
  type CustomDeviceInput,
  exportDevice,
  importDevice,
  KINDS,
  removeDevice,
  type ScreenHole,
} from "../engine/custom";
import { dataUrlOf, dprFor, shrunk } from "../engine/customload";
import { detectScreen, pixelsOf, viewportFor } from "../engine/detect";
import type { DeviceKind } from "../engine/devices";
import type { Rect, Sides } from "../engine/mock";

/** The picture types the editor takes. */
const PICTURES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];

function kindOf(value: string): DeviceKind {
  return KINDS.find((known) => known === value) ?? "phone";
}

function chromeOf(value: string): ChromeStyle {
  return CHROME_STYLES.find((known) => known === value) ?? "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An error as the editor says it, without the package's prefix. */
function sayError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/^devknobs: /, "");
}

/**
 * The custom device editor: a picture of a device's body in, its screen hole
 * found and shown as a box with handles to correct, an optional cutout, safe
 * areas, the viewport and the browser to draw, and a device out. It sits over
 * the page in a shadow root of its own, over the panel too, and goes once it
 * saves or is closed.
 */

const SVG = "http://www.w3.org/2000/svg";

const CSS = `
:host { all: initial; }
.veil {
  position: fixed; inset: 0; display: grid; place-items: center; padding: 16px;
  background: rgb(0 0 0 / 0.45); color-scheme: light dark;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  --bg: #fbfbf9; --fg: #1b1b19; --faint: #646460; --line: #e6e6e0; --card: #f1f1ec; --raised: #fff; --key: #1a65ad; --hot: #c4363b;
}
@media (prefers-color-scheme: dark) {
  .veil { --bg: #151513; --fg: #e9e9e3; --faint: #8c8c85; --line: #2b2b28; --card: #1f1f1c; --raised: #383833; --key: #8cbcec; --hot: #ff6369; }
}
.card {
  box-sizing: border-box; width: min(920px, 100%); max-height: calc(100vh - 32px); overflow: auto;
  display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; padding: 16px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 13px;
}
@media (max-width: 680px) { .card { grid-template-columns: 1fr; } }
h2 { grid-column: 1 / -1; margin: 0; font-size: 15px; font-weight: 500; }
.art {
  position: relative; display: grid; place-items: center; min-height: 320px; border-radius: 8px;
  background: repeating-conic-gradient(var(--card) 0 25%, var(--bg) 0 50%) 0 0 / 16px 16px;
}
.stage { position: relative; line-height: 0; }
.stage img { display: block; max-width: 100%; max-height: 62vh; user-select: none; -webkit-user-drag: none; }
.stage svg { touch-action: none; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.hole { fill: rgb(26 101 173 / 0.18); stroke: #1a65ad; stroke-width: 1.5; cursor: move; }
.notch { fill: rgb(229 72 77 / 0.25); stroke: #e5484d; stroke-width: 1.5; cursor: move; }
.safe { fill: none; stroke: #18794e; stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
.grip { fill: #fff; stroke: #1a65ad; stroke-width: 1.5; }
.grip.notch-grip { stroke: #e5484d; }
.grip[data-at="nw"], .grip[data-at="se"] { cursor: nwse-resize; }
.grip[data-at="ne"], .grip[data-at="sw"] { cursor: nesw-resize; }
.empty { color: var(--faint); text-align: center; padding: 24px; line-height: 1.5; }
form { display: grid; gap: 8px; align-content: start; }
label { display: grid; gap: 4px; color: var(--faint); }
.line { display: flex; gap: 8px; align-items: center; }
.line > label { flex: 1; }
.check { display: flex; gap: 6px; align-items: center; color: var(--fg); }
input, select {
  box-sizing: border-box; width: 100%; min-width: 0; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--raised); color: var(--fg); font: inherit;
}
input[type="checkbox"] { width: auto; }
input[type="range"] { padding: 0; }
input[type="file"] { padding: 4px; }
.sides { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
button {
  padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); font: inherit; cursor: pointer;
}
button.primary { background: var(--key); border-color: var(--key); color: var(--bg); }
button.danger { color: var(--hot); }
.said { min-height: 1.4em; color: var(--hot); }
.note { color: var(--faint); }
`;

/** Where the editor's box and handles are, in the picture's px. */
interface Draft {
  image: string | null;
  imageSize: [number, number];
  screen: ScreenHole | null;
  cutout: Rect | null;
  safe: Sides;
  /** The viewport follows the screen and the dpr until it is typed. */
  viewport: { width: number; height: number } | null;
  typed: boolean;
}

export interface DeviceEditor {
  /** Fill the editor from a picture, as the file picker does. */
  load(src: string | Blob): Promise<void>;
  /** The device the editor would save now, or the reason it cannot. */
  draft(): CustomDeviceInput | string;
  save(): CustomDevice | null;
  close(): void;
  readonly host: HTMLElement;
}

let open: DeviceEditor | null = null;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function svg(tag: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function labeled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = node("label", {}, text);
  label.append(control);
  return label;
}

function download(name: string, text: string): void {
  const link = node("a", { download: name, href: URL.createObjectURL(new Blob([text], { type: "application/json" })) });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * Open the editor, on `device` to change one already kept, or empty.
 * `saved` hears the device once kept, to pick it. One editor at a time.
 */
export function openDeviceEditor(
  options: { device?: CustomDevice; saved?: (device: CustomDevice) => void; removed?: (id: string) => void } = {},
): DeviceEditor {
  open?.close();
  const known = options.device;
  const draft: Draft = {
    image: known?.image ?? null,
    imageSize: known?.imageSize ?? [0, 0],
    screen: known ? { ...known.screen } : null,
    cutout: known?.cutout ? { ...known.cutout } : null,
    safe: known?.safe ? { ...known.safe } : { top: 0, right: 0, bottom: 0, left: 0 },
    viewport: known ? { ...known.viewport } : null,
    typed: known !== undefined,
  };

  const host = node("div", { "data-devknobs-editor": "" });
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647";
  const root = host.attachShadow({ mode: "open" });
  const style = node("style", {}, CSS);
  const veil = node("div", { class: "veil" });
  const card = node("div", { class: "card", role: "dialog", "aria-modal": "true", "aria-label": "custom device" });
  const title = node("h2", {}, known ? `edit ${known.label}` : "add a custom device");

  const art = node("div", { class: "art" });
  const stage = node("div", { class: "stage" });
  const picture = node("img", { alt: "" });
  const layer = svg("svg", {});
  stage.append(picture, layer);
  const empty = node("div", { class: "empty" }, "drop a PNG or SVG of the device here, with its screen cut out or a flat color");
  art.append(empty, stage);

  const form = node("form");
  const file = node("input", { type: "file", accept: "image/png,image/svg+xml,image/webp,image/jpeg", "aria-label": "picture" });
  const label = node("input", { value: known?.label ?? "", placeholder: "My phone", "aria-label": "name" });
  const kind = node("select", { "aria-label": "kind" });
  for (const value of KINDS) kind.append(node("option", { value }, value));
  kind.value = known?.kind ?? "phone";
  const dpr = node("input", { type: "number", min: "0.5", max: "5", step: "0.25", value: String(known?.dpr ?? 3), "aria-label": "dpr" });
  const width = node("input", { type: "number", min: "120", max: "8192", "aria-label": "viewport width" });
  const height = node("input", { type: "number", min: "120", max: "8192", "aria-label": "viewport height" });
  const radius = node("input", { type: "range", min: "0", max: "200", step: "1", "aria-label": "corner radius" });
  const notch = node("input", { type: "checkbox", "aria-label": "cutout" });
  notch.checked = draft.cutout !== null;
  const sides = (["top", "right", "bottom", "left"] as const).map((side) => {
    const input = node("input", { type: "number", min: "0", value: String(draft.safe[side]), "aria-label": `safe ${side}`, title: `safe ${side}` });
    input.addEventListener("input", () => {
      draft.safe[side] = Math.max(0, Number(input.value) || 0);
      draw();
    });
    return input;
  });
  const chrome = node("select", { "aria-label": "browser" });
  for (const value of CHROME_STYLES) chrome.append(node("option", { value }, value === "none" ? "none, plain frame" : value === "ios-safari" ? "iOS Safari" : "Android Chrome"));
  chrome.value = known?.chrome ?? "none";
  const importer = node("input", { type: "file", accept: "application/json,.json", "aria-label": "import json" });
  const said = node("div", { class: "said", role: "status" });
  const notchLine = node("label", { class: "check" });
  notchLine.append(notch, document.createTextNode("mark the island or notch"));
  const safeBox = node("div", { class: "sides" });
  safeBox.append(...sides);
  const sizeLine = node("div", { class: "line" });
  sizeLine.append(labeled("viewport width", width), labeled("height", height));
  const kindLine = node("div", { class: "line" });
  kindLine.append(labeled("kind", kind), labeled("dpr", dpr));
  const buttons = node("div", { class: "buttons" });
  const save = node("button", { type: "submit", class: "primary" }, "save");
  const exporter = node("button", { type: "button" }, "export json");
  const detect = node("button", { type: "button" }, "detect again");
  const cancel = node("button", { type: "button" }, "cancel");
  buttons.append(save, exporter, detect, cancel);
  if (known) {
    const remove = node("button", { type: "button", class: "danger" }, "remove");
    remove.addEventListener("click", () => {
      removeDevice(known.id);
      options.removed?.(known.id);
      editor.close();
    });
    buttons.append(remove);
  }
  form.append(
    labeled("picture", file),
    labeled("name", label),
    kindLine,
    sizeLine,
    labeled("screen corner radius", radius),
    notchLine,
    labeled("safe areas in css px: top, right, bottom, left", safeBox),
    labeled("browser drawn over the page", chrome),
    labeled("import a device json", importer),
    node("div", { class: "note" }, "drag the blue box and its corners onto the screen"),
    said,
    buttons,
  );
  card.append(title, art, form);
  veil.append(card);
  root.append(style, veil);
  document.documentElement.append(host);

  /** Picture px per drawn px. */
  const scale = () => (picture.clientWidth > 0 ? draft.imageSize[0] / picture.clientWidth : 1);

  function autoViewport(): void {
    if (draft.typed || !draft.screen) return;
    draft.viewport = viewportFor(draft.screen, Number(dpr.value) || dprFor(kindOf(kind.value)));
  }

  function fill(): void {
    sides.forEach((input, at) => {
      const side = (["top", "right", "bottom", "left"] as const)[at];
      if (side) input.value = String(draft.safe[side]);
    });
    notch.checked = draft.cutout !== null;
    if (draft.viewport) {
      width.value = String(draft.viewport.width);
      height.value = String(draft.viewport.height);
    }
    if (draft.screen) {
      radius.max = String(Math.floor(Math.min(draft.screen.width, draft.screen.height) / 2));
      radius.value = String(draft.screen.radius);
    }
  }

  /** A box with four corner handles, `change` taking the box as dragged. */
  function boxOf(rect: Rect, className: string, rx: number, change: (next: Rect) => void): SVGElement[] {
    const k = 1 / scale();
    const at = (value: number) => value * k;
    const box = svg("rect", { class: className, x: at(rect.x), y: at(rect.y), width: at(rect.width), height: at(rect.height), rx: at(rx) });
    drag(box, (dx, dy) => change({ ...rect, x: rect.x + dx, y: rect.y + dy }));
    const corners = { nw: [rect.x, rect.y], ne: [rect.x + rect.width, rect.y], se: [rect.x + rect.width, rect.y + rect.height], sw: [rect.x, rect.y + rect.height] } as const;
    const grips = Object.entries(corners).map(([name, [x, y]]) => {
      const grip = svg("circle", { class: `grip${className === "notch" ? " notch-grip" : ""}`, "data-at": name, cx: at(x), cy: at(y), r: 6 });
      drag(grip, (dx, dy) => {
        const left = name.includes("w") ? rect.x + dx : rect.x;
        const top = name.includes("n") ? rect.y + dy : rect.y;
        const right = name.includes("e") ? rect.x + rect.width + dx : rect.x + rect.width;
        const bottom = name.includes("s") ? rect.y + rect.height + dy : rect.y + rect.height;
        change({ x: Math.min(left, right - 4), y: Math.min(top, bottom - 4), width: Math.max(4, right - left), height: Math.max(4, bottom - top) });
      });
      return grip;
    });
    return [box, ...grips];
  }

  /** Ends the drag under way, so a close never leaves its listeners behind. */
  let stopDrag: (() => void) | null = null;

  /** Follow a drag of `target`, in picture px from where it started. */
  function drag(target: SVGElement, move: (dx: number, dy: number) => void): void {
    target.addEventListener("pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const k = scale();
      const start = { x: event.clientX, y: event.clientY };
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // A pointer already gone: the window's listeners still follow it.
      }
      const onMove = (next: PointerEvent) => move(Math.round((next.clientX - start.x) * k), Math.round((next.clientY - start.y) * k));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (stopDrag === onUp) stopDrag = null;
      };
      stopDrag?.();
      stopDrag = onUp;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  /** Keep a rect inside the picture. */
  function inside(rect: Rect): Rect {
    const [w, h] = draft.imageSize;
    const width = Math.min(rect.width, w);
    const height = Math.min(rect.height, h);
    return { x: Math.min(Math.max(0, rect.x), w - width), y: Math.min(Math.max(0, rect.y), h - height), width, height };
  }

  function draw(): void {
    const ready = draft.image !== null;
    empty.hidden = ready;
    stage.hidden = !ready;
    layer.replaceChildren();
    if (!ready || !draft.screen) return;
    const k = 1 / scale();
    const screen = draft.screen;
    layer.append(
      ...boxOf(screen, "hole", screen.radius, (next) => {
        const rect = inside(next);
        draft.screen = { ...rect, radius: Math.min(screen.radius, Math.floor(Math.min(rect.width, rect.height) / 2)) };
        autoViewport();
        fill();
        draw();
      }),
    );
    // The safe areas, in css px of the viewport, drawn in the hole.
    const viewport = draft.viewport;
    if (viewport && Object.values(draft.safe).some((value) => value > 0)) {
      const sx = screen.width / viewport.width;
      const sy = screen.height / viewport.height;
      layer.append(
        svg("rect", {
          class: "safe",
          x: (screen.x + draft.safe.left * sx) * k,
          y: (screen.y + draft.safe.top * sy) * k,
          width: Math.max(0, screen.width - (draft.safe.left + draft.safe.right) * sx) * k,
          height: Math.max(0, screen.height - (draft.safe.top + draft.safe.bottom) * sy) * k,
        }),
      );
    }
    const cutout = draft.cutout;
    if (cutout) {
      layer.append(
        ...boxOf(cutout, "notch", Math.min(cutout.width, cutout.height) / 2, (next) => {
          draft.cutout = inside(next);
          draw();
        }),
      );
    }
  }

  function tell(text: string): void {
    said.textContent = text;
  }

  async function detectNow(): Promise<void> {
    if (!draft.image) return;
    commitDetect(draft.image, await pixelsOf(draft.image));
  }

  /** Take a picture read and its screen found, or a box to drag where none is. */
  function commitDetect(image: string, pixels: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): void {
    draft.image = image;
    draft.imageSize = [pixels.width, pixels.height];
    const found = detectScreen(pixels);
    const [w, h] = draft.imageSize;
    // Nothing found: a box in the middle to drag onto the screen.
    draft.screen = found ?? { x: Math.round(w * 0.1), y: Math.round(h * 0.1), width: Math.round(w * 0.8), height: Math.round(h * 0.8), radius: 0 };
    tell(found ? "" : "no screen hole found: drag the box onto the screen");
    draft.typed = false;
    autoViewport();
    fill();
  }

  /** Read a picture, and only once it has decoded put it in place of the last. */
  async function load(src: string | Blob): Promise<void> {
    tell("");
    if (typeof src !== "string" && !PICTURES.includes(src.type)) {
      tell("pick a PNG, SVG, JPEG or WebP picture");
      return;
    }
    const { image } = await shrunk(await dataUrlOf(src));
    const pixels = await pixelsOf(image);
    picture.src = image;
    await picture.decode().catch(() => {});
    commitDetect(image, pixels);
    if (!label.value && typeof src !== "string" && "name" in src) label.value = String(src.name).replace(/\.[a-z]+$/i, "");
    draw();
  }

  function input(): CustomDeviceInput | string {
    if (!draft.image || !draft.screen) return "pick a picture first";
    if (!draft.viewport) return "set the viewport";
    const device: CustomDeviceInput = {
      label: label.value.trim() || "custom device",
      kind: kindOf(kind.value),
      image: draft.image,
      imageSize: draft.imageSize,
      screen: draft.screen,
      viewport: draft.viewport,
      dpr: Number(dpr.value),
      chrome: chromeOf(chrome.value),
    };
    if (known) device.id = known.id;
    if (draft.cutout) device.cutout = draft.cutout;
    if (Object.values(draft.safe).some((value) => value > 0)) device.safe = draft.safe;
    return device;
  }

  function saveNow(): CustomDevice | null {
    const device = input();
    if (typeof device === "string") {
      tell(device);
      return null;
    }
    try {
      const kept = addDevice(device);
      options.saved?.(kept);
      editor.close();
      return kept;
    } catch (error) {
      tell(error instanceof Error ? error.message.replace(/^devknobs: /, "") : String(error));
      return null;
    }
  }

  file.addEventListener("change", () => {
    const picked = file.files?.[0];
    if (picked) load(picked).catch((error: unknown) => tell(sayError(error)));
  });
  art.addEventListener("dragover", (event: DragEvent) => event.preventDefault());
  art.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    const dropped = event.dataTransfer?.files[0];
    if (dropped) load(dropped).catch((error: unknown) => tell(sayError(error)));
  });
  importer.addEventListener("change", async () => {
    const picked = importer.files?.[0];
    if (!picked) return;
    try {
      const text = await picked.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new TypeError("devknobs: this file is not json");
      }
      const own = isRecord(parsed) ? Reflect.get(parsed, "image") : undefined;
      const source = typeof own === "string" ? own : draft.image;
      if (source === null) {
        tell("this json has no picture: pick the picture first, then import");
        return;
      }
      const device = importDevice(text, await dataUrlOf(source));
      Object.assign(draft, { image: device.image, imageSize: device.imageSize, screen: device.screen, cutout: device.cutout ?? null, viewport: device.viewport, typed: true });
      draft.safe = device.safe ? { ...device.safe } : { top: 0, right: 0, bottom: 0, left: 0 };
      label.value = device.label;
      kind.value = device.kind;
      dpr.value = String(device.dpr);
      chrome.value = device.chrome;
      picture.src = device.image;
      await picture.decode().catch(() => {});
      fill();
      draw();
      tell("");
    } catch (error) {
      tell(sayError(error));
    }
  });
  radius.addEventListener("input", () => {
    if (!draft.screen) return;
    draft.screen = { ...draft.screen, radius: Number(radius.value) };
    draw();
  });
  dpr.addEventListener("input", () => {
    autoViewport();
    fill();
    draw();
  });
  for (const field of [width, height]) {
    field.addEventListener("input", () => {
      draft.typed = true;
      draft.viewport = { width: Number(width.value) || 0, height: Number(height.value) || 0 };
      draw();
    });
  }
  notch.addEventListener("change", () => {
    const screen = draft.screen;
    draft.cutout = notch.checked && screen ? { x: Math.round(screen.x + screen.width * 0.35), y: Math.round(screen.y + screen.height * 0.015), width: Math.round(screen.width * 0.3), height: Math.round(screen.height * 0.04) } : null;
    draw();
  });
  detect.addEventListener("click", () => {
    detectNow()
      .then(draw)
      .catch((error: unknown) => tell(sayError(error)));
  });
  exporter.addEventListener("click", () => {
    const device = input();
    if (typeof device === "string") return tell(device);
    try {
      const kept = importDevice(JSON.stringify(device));
      download(`${kept.id.replace("custom:", "")}.json`, exportDevice(kept));
    } catch (error) {
      tell(sayError(error));
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNow();
  });
  cancel.addEventListener("click", () => editor.close());
  // Only a press that starts on the veil closes: a drag let go over it does not.
  let pressedOnVeil = false;
  veil.addEventListener("pointerdown", (event) => {
    pressedOnVeil = event.target === veil;
  });
  veil.addEventListener("click", (event) => {
    if (pressedOnVeil && event.target === veil) editor.close();
    pressedOnVeil = false;
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") editor.close();
  };
  window.addEventListener("keydown", onKey, true);
  const onResize = () => draw();
  window.addEventListener("resize", onResize);

  const editor: DeviceEditor = {
    host,
    load,
    draft: input,
    save: saveNow,
    close() {
      stopDrag?.();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      host.remove();
      if (open === editor) open = null;
    },
  };
  open = editor;
  if (draft.image) {
    picture.src = draft.image;
    picture.decode().then(() => {
      fill();
      draw();
    }, () => {});
  }
  fill();
  draw();
  return editor;
}

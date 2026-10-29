import type { DevknobsState, DevknobsStatePatch } from "../types";
import { bezelUrl, bodyOf } from "./bezels";
import { checkPatch } from "./check";
import { customDevices } from "./custom";
import { DEVICES, formOf } from "./devices";
import { fit } from "./fit";
import { FRAME_ATTRIBUTE, FRAME_NAME, framed, handsSchemeDown, post, readMessage, SANDBOX } from "./frame";
import { fresh, FRESH_ATTRIBUTE } from "./fresh";
import * as engine from "./index";
import type { Mock } from "./mock";
import { corners, drawMock, MOCK_CSS } from "./mockdraw";
import { FRAME_STATE_ATTRIBUTE, merge, STATE_VERSION } from "./store";
import { stamped } from "./stored";
import { TEXT_MAX, TEXT_MIN } from "./text";

/**
 * Two or more devices side by side, each running the page in its own frame
 * with knobs of its own: the panel's, with the frame's patch on top. Each
 * frame's copy of devknobs emulates its knobs in its own window, as the page
 * in the width knob's frame does, so the knobs that patch the window split
 * per frame. ADR-0004 lists what stays shared.
 */

/** How a scroll in one frame moves the others. */
export type SyncMode = "proportional" | "pixel" | "off";
export const SYNC_MODES: readonly SyncMode[] = ["proportional", "pixel", "off"];

/**
 * Dynamic Type's sizes as a root font size: iOS's body size at each, over
 * its size at Large (17 pt), times 16.
 */
export const TEXT_SIZES: Readonly<Record<string, number>> = {
  xs: 13,
  s: 14,
  m: 15,
  l: 16,
  xl: 18,
  xxl: 20,
  xxxl: 22,
  ax1: 26,
  ax2: 31,
  ax3: 38,
  ax4: 44,
  ax5: 50,
};

/** A frame as an agent asks for it: a `setState` patch, and the text size by a Dynamic Type name too. */
export type CompareFrameInput = DevknobsStatePatch & { textSize?: number | string };

export interface CompareFrameState {
  index: number;
  /** What the frame sets over the panel's knobs. */
  patch: DevknobsStatePatch;
  /** What the chip says: the frame's knobs off the panel's, or `base`. */
  diff: string;
  /** The knobs the frame runs with. */
  state: DevknobsState;
  /** The root font size the page in the frame computes, in px, once it has loaded. */
  fontSize: number | null;
  loaded: boolean;
}

export interface CompareState {
  sync: SyncMode;
  frames: CompareFrameState[];
}

/** A text size by its number or its Dynamic Type name. Throws a TypeError for anything else. */
export function textSizeOf(value: number | string): number {
  const size = typeof value === "number" ? value : TEXT_SIZES[value.toLowerCase()];
  if (size === undefined || !Number.isFinite(size) || size < TEXT_MIN || size > TEXT_MAX) {
    throw new TypeError(`devknobs: bad textSize: ${JSON.stringify(value)}`);
  }
  return size;
}

/** A frame's input as a checked patch: its text size as the text knob. */
export function framePatch(input: CompareFrameInput): DevknobsStatePatch {
  const { textSize, ...patch } = input;
  const out: DevknobsStatePatch = textSize === undefined ? patch : { ...patch, text: textSizeOf(textSize) };
  checkPatch(out);
  return out;
}

/** The knobs a frame runs with: the panel's with its patch on top. */
export function frameState(base: DevknobsState, patch: DevknobsStatePatch): DevknobsState {
  return merge(base, patch);
}

/** The knobs the chips read, in the order they say them. */
const SAID: readonly (keyof DevknobsState)[] = [
  "device",
  "orientation",
  "text",
  "scheme",
  "motion",
  "contrast",
  "transparency",
  "locale",
  "network",
  "timeZone",
  "vision",
  "dpr",
];

function valueText(key: keyof DevknobsState, state: DevknobsState): string {
  if (key === "device") return formOf(state.device, state.posture)?.label ?? "no device";
  if (key === "locale") return state.locale.lang;
  if (key === "network") return state.network.online === "offline" ? "offline" : state.network.type;
  if (key === "text") return state.text === "system" ? "text system" : `text ${state.text}`;
  if (key === "dpr") return state.dpr === "system" ? "dpr system" : `${state.dpr}x`;
  const value = state[key];
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** What a frame's chip says: each knob it runs off the panel's, or `base`. */
export function diffOf(base: DevknobsState, state: DevknobsState): string {
  const parts = SAID.filter((key) => JSON.stringify(base[key]) !== JSON.stringify(state[key])).map((key) =>
    valueText(key, state),
  );
  return parts.length > 0 ? parts.join(" · ") : "base";
}

/** Where a scroll in one frame puts another, in px. */
export function syncTarget(mode: SyncMode, from: { y: number; max: number }, to: { max: number }): number | null {
  if (mode === "off") return null;
  if (mode === "pixel") return Math.min(from.y, to.max);
  return from.max > 0 ? Math.round((from.y / from.max) * to.max) : 0;
}

/** A frame that a sync moved stays quiet this long, so its scroll is not echoed back. */
export const ECHO_MS = 120;

interface Cell {
  patch: DevknobsStatePatch;
  node: HTMLElement;
  chip: HTMLButtonElement;
  stage: HTMLElement;
  screen: HTMLElement;
  glass: HTMLElement;
  frame: HTMLIFrameElement;
  mock: SVGSVGElement | null;
  mockKey: string;
  loaded: boolean;
  /** Until when its scroll events come from a sync, not the user. */
  quietUntil: number;
  stopScroll: (() => void) | null;
}

const CSS = `
:host { all: initial; }
.compare {
  position: fixed; inset: 0; display: flex; flex-direction: column; color-scheme: light dark;
  background: #0d3c8c; font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  --bg: #fbfbf9; --fg: #1b1b19; --faint: #646460; --line: #e6e6e0; --card: #f1f1ec; --key: #1a65ad;
}
@media (prefers-color-scheme: dark) {
  .compare { --bg: #151513; --fg: #e9e9e3; --faint: #8c8c85; --line: #2b2b28; --card: #1f1f1c; --key: #8cbcec; }
}
.bar { display: flex; gap: 8px; align-items: center; padding: 8px 16px; flex-wrap: wrap; }
.bar .title { color: #fff; margin-right: auto; }
button, select, input {
  font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px;
}
button { cursor: pointer; }
.row { flex: 1; display: flex; gap: 0; min-height: 0; overflow-x: auto; }
.cell { flex: 1 0 var(--cell-min, 0px); display: flex; flex-direction: column; align-items: center; min-width: 0; padding: 0 8px 12px; }
.head { display: flex; gap: 4px; align-items: center; max-width: 100%; padding: 4px 0 8px; }
.chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip[data-base] { color: var(--faint); }
.stage { position: relative; flex: 1; width: 100%; min-height: 0; }
.screen { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.glass { position: absolute; overflow: hidden; background: #000; }
.glass iframe { display: block; border: 0; background: #fff; }
.edit {
  position: absolute; z-index: 2; top: 40px; display: grid; gap: 6px; width: 220px; padding: 8px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 13px;
}
.edit label { display: grid; gap: 2px; color: var(--faint); }
${MOCK_CSS}
`;

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let row: HTMLElement | null = null;
let syncSelect: HTMLSelectElement | null = null;
let cells: Cell[] = [];
let sync: SyncMode = "proportional";
let stopBase: (() => void) | null = null;
let editing: HTMLElement | null = null;

function base(): DevknobsState {
  return engine.getState();
}

function stateOf(cell: Cell): DevknobsState {
  return frameState(base(), cell.patch);
}

/** Hand a frame its knobs. Its copy of devknobs emulates every one of them: the host's driver stays with the tab. */
function share(cell: Cell): void {
  const state = framed(stateOf(cell));
  // For the page's next load, a reload for a locale say, which starts with them.
  cell.frame.setAttribute(FRAME_STATE_ATTRIBUTE, JSON.stringify(stamped(state, STATE_VERSION)));
  if (cell.loaded) post(cell.frame.contentWindow, { source: "devknobs", type: "state", state, native: false });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Draw a cell's device in its stage, fitted, its body round it where it has one. */
function layout(cell: Cell): void {
  const state = stateOf(cell);
  const device = formOf(state.device, state.posture);
  const size = { width: cell.stage.clientWidth, height: cell.stage.clientHeight };
  const knobs = device
    ? { width: Number(state.width) || device.width, height: Number(state.height) || device.height, zoom: "fit" as const }
    : { width: Number(state.width) || 390, height: Number(state.height) || 844, zoom: "fit" as const };
  const body: Mock | null = device ? bodyOf({ ...state, mock: state.mock }, () => layout(cell)) : null;
  const zoom = typeof state.dpr === "number" && window.devicePixelRatio > 0 ? state.dpr / window.devicePixelRatio : 1;
  const place = fit(knobs, { width: size.width, height: size.height + 32 }, { frameZoom: zoom, ...(body ? { mock: body.inset } : {}) });
  const href = body?.image ? bezelUrl(body.image.file) : null;
  const key = body ? `${state.device}|${state.orientation}|${href}` : "";
  if (key !== cell.mockKey) {
    cell.mockKey = key;
    cell.mock?.remove();
    cell.mock = body ? drawMock(body, place, href) : null;
    if (cell.mock) cell.screen.prepend(cell.mock);
  }
  const inset = body?.inset ?? { top: 0, left: 0, right: 0, bottom: 0 };
  const width = place.width + inset.left + inset.right;
  const height = place.height + inset.top + inset.bottom;
  cell.screen.style.width = `${width * zoom}px`;
  cell.screen.style.height = `${height * zoom}px`;
  cell.screen.style.transform = `translate(${(size.width - width * place.scale) / 2}px, ${Math.max(0, (size.height - height * place.scale) / 2)}px) scale(${place.transform})`;
  if (cell.mock) {
    cell.mock.style.width = `${width * zoom}px`;
    cell.mock.style.height = `${height * zoom}px`;
  }
  cell.glass.style.left = `${inset.left * zoom}px`;
  cell.glass.style.top = `${inset.top * zoom}px`;
  cell.glass.style.borderRadius = body ? corners(body.screenRadius).map((radius) => `${radius * zoom}px`).join(" ") : "0";
  cell.frame.style.width = `${place.width}px`;
  cell.frame.style.height = `${place.height}px`;
  cell.frame.style.zoom = zoom === 1 ? "" : String(zoom);
  // The scheme as the page's real preference, where the browser hands it down.
  if (state.scheme !== "system" && handsSchemeDown(cell.frame.getRootNode())) cell.frame.style.colorScheme = state.scheme;
  else cell.frame.style.removeProperty("color-scheme");
  const diff = diffOf(base(), state);
  cell.chip.textContent = diff;
  cell.chip.toggleAttribute("data-base", diff === "base");
}

/** Under this many px a cell, the row keeps them this wide and scrolls. */
const CELL_MIN = 300;

function layoutAll(): void {
  if (row) row.style.setProperty("--cell-min", row.clientWidth / Math.max(1, cells.length) < CELL_MIN ? `${CELL_MIN}px` : "0px");
  for (const cell of cells) layout(cell);
}

/** Follow a frame's scroll into the others, once its page is in. */
function watchScroll(cell: Cell): void {
  cell.stopScroll?.();
  const view = cell.frame.contentWindow;
  if (!view) return;
  const onScroll = () => {
    if (performance.now() < cell.quietUntil) return;
    const doc = view.document.scrollingElement ?? view.document.documentElement;
    const from = { y: view.scrollY, max: doc.scrollHeight - view.innerHeight };
    for (const other of cells) {
      if (other === cell || !other.loaded) continue;
      const target = other.frame.contentWindow;
      if (!target) continue;
      const otherDoc = target.document.scrollingElement ?? target.document.documentElement;
      const y = syncTarget(sync, from, { max: otherDoc.scrollHeight - target.innerHeight });
      if (y === null) continue;
      other.quietUntil = performance.now() + ECHO_MS;
      target.scrollTo({ top: y, behavior: "instant" });
    }
  };
  try {
    view.addEventListener("scroll", onScroll, { passive: true });
    cell.stopScroll = () => view.removeEventListener("scroll", onScroll);
  } catch {
    cell.stopScroll = null;
  }
}

function onMessage(event: MessageEvent): void {
  for (const cell of cells) {
    const message = readMessage(event, cell.frame.contentWindow, window.location.origin);
    if (message?.type !== "ready") continue;
    // A page that reloads itself, for a locale say, says ready again, and takes its knobs again.
    cell.loaded = true;
    share(cell);
    watchScroll(cell);
  }
}

/** The editor of one frame's knobs, under its chip. */
function openEditor(cell: Cell): void {
  editing?.remove();
  const box = el("div", "edit");
  const state = stateOf(cell);
  const choice = (label: string, values: readonly [string, string][], value: string, patch: (value: string) => DevknobsStatePatch) => {
    const select = el("select");
    for (const [option, text] of values) {
      const node = el("option", "", text);
      node.value = option;
      select.append(node);
    }
    select.value = value;
    select.setAttribute("aria-label", label);
    select.addEventListener("change", () => setFrame(cells.indexOf(cell), { ...cell.patch, ...patch(select.value) }));
    const wrap = el("label", "", label);
    wrap.append(select);
    return wrap;
  };
  const devices: [string, string][] = [
    ["none", "no device"],
    ...DEVICES.map((device): [string, string] => [device.id, device.label]),
    ...customDevices().map((device): [string, string] => [device.id, `${device.label} (custom)`]),
  ];
  const texts: [string, string][] = [["system", "system"], ...Object.entries(TEXT_SIZES).map(([name, px]): [string, string] => [String(px), `${name} · ${px}px`])];
  const lang = el("input");
  lang.value = state.locale.lang;
  lang.placeholder = "system, ar, de-DE";
  lang.setAttribute("aria-label", "locale");
  lang.addEventListener("change", () => setFrame(cells.indexOf(cell), { ...cell.patch, locale: { ...cell.patch.locale, lang: lang.value.trim() || "system" } }));
  const langWrap = el("label", "", "locale");
  langWrap.append(lang);
  const done = el("button", "", "done");
  done.addEventListener("click", () => box.remove());
  box.append(
    choice("device", devices, state.device, (device) => ({ device })),
    choice("text size", texts, String(state.text), (text) => ({ text: text === "system" ? "system" : Number(text) })),
    choice("scheme", [["system", "system"], ["light", "light"], ["dark", "dark"]], state.scheme, (scheme) => ({ scheme: scheme as DevknobsState["scheme"] })),
    choice("motion", [["system", "system"], ["reduce", "reduce"]], state.motion, (motion) => ({ motion: motion as DevknobsState["motion"] })),
    choice("contrast", [["system", "system"], ["more", "more"]], state.contrast, (contrast) => ({ contrast: contrast as DevknobsState["contrast"] })),
    langWrap,
    choice(
      "network",
      [["system", "system"], ["offline", "offline"], ["slow-2g", "slow 2g"], ["3g", "3g"], ["4g", "4g"]],
      state.network.online === "offline" ? "offline" : state.network.type,
      (value) => (value === "offline" ? { network: { online: "offline" } } : { network: { online: "system", type: value as DevknobsState["network"]["type"] } }),
    ),
    done,
  );
  cell.node.style.position = "relative";
  cell.node.append(box);
  editing = box;
}

function makeCell(patch: DevknobsStatePatch): Cell {
  const node = el("div", "cell");
  const head = el("div", "head");
  const chip = el("button", "chip");
  chip.title = "this frame's knobs";
  const remove = el("button", "", "×");
  remove.setAttribute("aria-label", "remove frame");
  head.append(chip, remove);
  const stage = el("div", "stage");
  const screen = el("div", "screen");
  const glass = el("div", "glass");
  const frame = el("iframe");
  frame.setAttribute(FRAME_ATTRIBUTE, "");
  frame.setAttribute("data-devknobs-compare", "");
  if (fresh()) frame.setAttribute(FRESH_ATTRIBUTE, "");
  frame.name = FRAME_NAME;
  frame.title = "devknobs compare frame";
  frame.setAttribute("sandbox", SANDBOX);
  glass.append(frame);
  screen.append(glass);
  stage.append(screen);
  node.append(head, stage);
  const cell: Cell = { patch, node, chip, stage, screen, glass, frame, mock: null, mockKey: "", loaded: false, quietUntil: 0, stopScroll: null };
  share(cell);
  chip.addEventListener("click", () => openEditor(cell));
  remove.addEventListener("click", () => removeFrame(cells.indexOf(cell)));
  frame.src = window.location.href;
  return cell;
}

function build(): void {
  host = document.createElement("div");
  host.setAttribute("data-devknobs-compare", "");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483643";
  shadow = host.attachShadow({ mode: "open" });
  const style = el("style", "", CSS);
  const wrap = el("div", "compare");
  const bar = el("div", "bar");
  const title = el("span", "title", "compare");
  const add = el("button", "", "+ frame");
  add.addEventListener("click", () => addFrame(cells.at(-1)?.patch ?? {}));
  syncSelect = el("select");
  syncSelect.setAttribute("aria-label", "scroll sync");
  for (const mode of SYNC_MODES) {
    const option = el("option", "", mode === "off" ? "scroll sync off" : `scroll sync: ${mode}`);
    option.value = mode;
    syncSelect.append(option);
  }
  syncSelect.value = sync;
  syncSelect.addEventListener("change", () => {
    sync = (syncSelect?.value as SyncMode | undefined) ?? "proportional";
  });
  const exit = el("button", "", "exit");
  exit.addEventListener("click", exitCompare);
  bar.append(title, add, syncSelect, exit);
  row = el("div", "row");
  wrap.append(bar, row);
  shadow.append(style, wrap);
  document.documentElement.append(host);
  window.addEventListener("message", onMessage);
  window.addEventListener("resize", layoutAll);
  stopBase = engine.subscribe(() => {
    for (const cell of cells) share(cell);
    layoutAll();
  });
}

function addFrame(patch: DevknobsStatePatch): void {
  if (!row) return;
  const cell = makeCell(patch);
  cells.push(cell);
  row.append(cell.node);
  layoutAll();
}

function removeFrame(index: number): void {
  const [cell] = cells.splice(index, 1);
  if (!cell) return;
  cell.stopScroll?.();
  cell.node.remove();
  if (cells.length <= 1) exitCompare();
  else layoutAll();
}

/** Change one frame's patch, and hand it its knobs. */
export function setFrame(index: number, input: CompareFrameInput): CompareState | null {
  const cell = cells[index];
  if (!cell) throw new RangeError(`devknobs: no compare frame ${index}`);
  cell.patch = framePatch(input);
  editing?.remove();
  share(cell);
  layout(cell);
  return compareState();
}

/**
 * Lay out a frame for each entry, side by side, each with the panel's knobs
 * and its own patch on top. Takes over from a compare already up. Every
 * patch is checked before any frame comes up.
 */
export function compare(frames: readonly CompareFrameInput[], options: { sync?: SyncMode } = {}): CompareState {
  if (!Array.isArray(frames) || frames.length < 2) throw new TypeError("devknobs: compare takes two frames or more");
  if (options.sync !== undefined && !SYNC_MODES.includes(options.sync)) throw new TypeError(`devknobs: bad sync: ${JSON.stringify(options.sync)}`);
  const patches = frames.map(framePatch);
  exitCompare();
  sync = options.sync ?? "proportional";
  build();
  for (const patch of patches) addFrame(patch);
  return compareState() as CompareState;
}

export function exitCompare(): void {
  editing = null;
  for (const cell of cells) cell.stopScroll?.();
  cells = [];
  stopBase?.();
  stopBase = null;
  window.removeEventListener("message", onMessage);
  window.removeEventListener("resize", layoutAll);
  host?.remove();
  host = null;
  shadow = null;
  row = null;
  syncSelect = null;
}

/** Each frame's patch, knobs and computed root font size, or null with no compare up. */
export function compareState(): CompareState | null {
  if (!host) return null;
  const now = base();
  return {
    sync,
    frames: cells.map((cell, index) => {
      const state = stateOf(cell);
      let fontSize: number | null = null;
      try {
        const doc = cell.loaded ? cell.frame.contentDocument : null;
        if (doc) fontSize = Number.parseFloat(doc.defaultView?.getComputedStyle(doc.documentElement).fontSize ?? "") || null;
      } catch {
        fontSize = null;
      }
      return { index, patch: cell.patch, diff: diffOf(now, state), state, fontSize, loaded: cell.loaded };
    }),
  };
}

/** Set how a scroll in one frame moves the others. */
export function setSync(mode: SyncMode): void {
  if (!SYNC_MODES.includes(mode)) throw new TypeError(`devknobs: bad sync: ${JSON.stringify(mode)}`);
  sync = mode;
  if (syncSelect) syncSelect.value = mode;
}

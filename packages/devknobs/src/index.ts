import * as engine from "./engine";
import { checkPatch } from "./engine/check";
import { type CustomDevice, type CustomDeviceInput, customDevice, customDevices, exportDevice, removeDevice } from "./engine/custom";
import type { CompareFrameInput, CompareState, SyncMode } from "./engine/compare";
import { compareLoaded, loadCompare } from "./engine/compares";
import { describe as describeKnobs, type KnobDescription, type KnobShape, type KnobValue } from "./engine/describe";
import { DEVICES } from "./engine/devices";
import { isDevknobsFrame } from "./engine/frame";
import { GEO_PRESETS } from "./engine/geo";
import { LOCALE_PRESETS } from "./engine/locale";
import { TIME_ZONE_PRESETS } from "./engine/time";
import { UA_PRESETS } from "./engine/ua";
import { createGrab, type GrabControl } from "./grab/control";
import { createInspect, type InspectControl, oneAtATime } from "./grab/inspect";
import type { GrabOptions, GrabResult } from "./grab/types";
import { pageChoices } from "./host";
import { claim, expose, free, type Host, hostOf, owned, superseded, withdraw } from "./instance";
import { applyOnLoad } from "./storage/onload";
import type { DevknobsState, DevknobsStatePatch, GrabColorValue } from "./types";
import { createKeys, type LiveKeys } from "./ui/bindings";
import { forwardKeys } from "./ui/keys";
import { createPanel, type Panel } from "./ui/panel";

export type {
  BarsValue,
  BrowserValue,
  ClockMode,
  ClockValue,
  ConnectionValue,
  ContrastValue,
  DevknobsState,
  DevknobsStatePatch,
  DevIconValue,
  DirValue,
  DprValue,
  EdgeValue,
  GeoErrorValue,
  GeoValue,
  GrabColorValue,
  HeightValue,
  Knob,
  LocaleValue,
  MotionValue,
  NetworkValue,
  OnlineValue,
  OrientationValue,
  PanelValue,
  SaveDataValue,
  SchemeValue,
  SideValue,
  SpeedValue,
  TextValue,
  TimeZoneValue,
  TransparencyValue,
  UaValue,
  VisionValue,
  WidthValue,
  ZoomValue,
} from "./types";
export type {
  KnobDescription,
  KnobField,
  KnobReload,
  KnobShape,
  KnobValue,
} from "./engine/describe";
export type { DeviceKind, DevicePreset } from "./engine/devices";
export type { CompareFrameInput, CompareFrameState, CompareState, SyncMode } from "./engine/compare";
export type { ChromeStyle, CustomDevice, CustomDeviceInput, ScreenHole } from "./engine/custom";
export type { GeoPreset } from "./engine/geo";
export type { UaBrand, UaHints, UaPreset } from "./engine/ua";
export type { EngineOptions } from "./engine";
export type { FrameRefusal, NativeDriver, NativeMedia, NativeSetting, NativeUa, NativeViewport } from "./engine/native";
export type { SystemMedia } from "./engine/system";
export type {
  GrabEntry,
  GrabFrame,
  GrabOptions,
  GrabPayload,
  GrabResult,
  ResolvedSource,
} from "./grab/types";

export interface MountOptions extends engine.EngineOptions {
  /**
   * The letter that with shift toggles the panel. Defaults to `k`. A key the
   * user sets in the panel wins over it.
   */
  hotkey?: string;
  /** Start the panel open or closed. Defaults to the stored state, closed at first. */
  open?: boolean;
  /** Press a key to grab elements for an agent. Defaults to true. */
  grab?: boolean;
  /**
   * The key that grabs, such as `alt+shift+g`. Defaults to `shift+g`. A key
   * the user sets in the panel wins over it.
   */
  grabKey?: string;
  /**
   * The color grab draws its boxes in. Defaults to the stored one, `auto` at
   * first: blue, and green where the page behind the element is blue.
   */
  grabColor?: GrabColorValue;
  /**
   * Show the handle on the window's edge while the panel is closed. Defaults
   * to true. With false, the panel key opens it. What the user sets in the
   * panel's settings wins over it.
   */
  handle?: boolean;
  /**
   * Mount as the page's host, as the devknobs extension does. A copy the page
   * mounts later does not take over: its `hotkey`, `grabKey`, `grab`, `open`
   * and `grabColor` go to this one, and its `unmount` leaves this one up.
   * Defaults to false.
   */
  host?: boolean;
}

export const PRESETS = {
  locale: LOCALE_PRESETS,
  geo: GEO_PRESETS,
  timeZone: TIME_ZONE_PRESETS,
  ua: UA_PRESETS,
  device: DEVICES,
};

let panel: Panel | null = null;
let stopKeys: (() => void) | null = null;
let grabControl: GrabControl | null = null;
let inspectControl: InspectControl | null = null;
let keys: LiveKeys | null = null;
/** The options of the mount in force, with what a host took from the page's on top. Null unmounted. */
let mounted: MountOptions | null = null;
/** The host this copy's mount deferred to. Its calls go there while that host holds the page. */
let hostedBy: Host | null = null;

/** How often a host takes the page back from copies that know no hosts, before it lets them have it. */
const RETAKES = 3;
let retaken = 0;

/**
 * Start the knobs and put the panel on the page. Patches go in right away, even
 * mid-parse, so that a theme script running before `DOMContentLoaded` sees the
 * emulated values. The panel host waits for the body. Inside the width knob's
 * frame there is no panel: the page above has it, and gets the frame's keys.
 * A second copy of devknobs on the page, such as a hot update loads, takes
 * over from the first, which unmounts. Where a host holds the page, such as
 * the extension's copy, it takes this mount's choices instead.
 */
export function mount(options: MountOptions = {}): void {
  if (panel || stopKeys) return;
  const host = options.host ? null : hostOf(window);
  if (host) {
    hostedBy = host;
    host.adopt(options);
    return;
  }
  // Before anything else: the presets marked to apply on load, unless the early script did.
  applyOnLoad();
  if (options.host) claim(window, unmount, adopt, api);
  else claim(window, unmount);
  expose(window, api);
  engine.start(options);
  mounted = options;
  attach(options);
}

/** The panel, its keys, grab and inspect, for the engine that runs. */
function attach(options: MountOptions): void {
  // The mount's keys, with the ones the user set in the panel on top.
  const live = createKeys({
    hotkey: options.hotkey,
    grabKey: options.grabKey,
    grab: options.grab !== false,
  });
  keys = live;
  // Ahead of the panel's keys, so escape ends grab before it closes the panel.
  // A key the panel records is never grab's.
  if (options.grab !== false) {
    grabControl = createGrab({ key: () => (live.recording ? null : live.get().grab) });
  }
  // Inspect is the same picking with another end, so one of the two is on at a time.
  const inspect = createInspect({ key: () => (live.recording ? null : live.get().inspect) });
  inspectControl = inspect;
  if (grabControl) oneAtATime(grabControl, inspect);
  if (isDevknobsFrame()) {
    stopKeys = forwardKeys(live.get, () => engine.getState().panel.open);
    return;
  }
  choose(options);
  panel = createPanel({ keys: live, grab: grabControl, inspect, handle: options.handle });
}

/** Open or close the panel and set grab's color, where the options say. */
function choose(options: MountOptions): void {
  if (options.open !== undefined) engine.setState({ panel: { open: options.open } });
  if (options.grabColor !== undefined) engine.setState({ grabColor: options.grabColor });
}

function detach(): void {
  panel?.destroy();
  panel = null;
  grabControl?.destroy();
  grabControl = null;
  inspectControl?.destroy();
  inspectControl = null;
  stopKeys?.();
  stopKeys = null;
  keys?.destroy();
  keys = null;
}

/** A host's side of a page's mount: take its choices, with a new panel where the keys or grab change. */
function adopt(options: object): void {
  if (!mounted) return;
  const chosen = pageChoices(options);
  const rebuild = (["hotkey", "grabKey", "grab"] as const).some(
    (key) => chosen[key] !== undefined && chosen[key] !== mounted?.[key],
  );
  mounted = { ...mounted, ...chosen };
  if (!rebuild) {
    if (!isDevknobsFrame()) choose(chosen);
    return;
  }
  detach();
  attach(mounted);
}

/** Remove the panel and undo every knob. A copy that was taken over has done so already. */
export function unmount(): void {
  hostedBy = null;
  compareLoaded()?.exitCompare();
  if (superseded(window, unmount)) return;
  detach();
  // A host keeps its switch's choice through a take-back: off stays off.
  const native = mounted?.host ? engine.nativeSwitch() : null;
  engine.stop();
  withdraw(window, api);
  free(window, unmount);
  const was = mounted;
  mounted = null;
  // A host taken over by a copy that knows no hosts, such as an older one the
  // page loads, takes the page back once that copy is in.
  if (was?.host) queueMicrotask(() => retake(was, native));
}

function retake(options: MountOptions, native: { on: boolean; note: string | null } | null): void {
  if (mounted || !owned(window) || hostOf(window)) return;
  if (retaken++ >= RETAKES) {
    if (retaken === RETAKES + 1) {
      console.warn("devknobs: this page runs its own copy of devknobs, which does not know hosts; it keeps the page");
    }
    return;
  }
  // Before the mount, so the driver is never handed the knobs the page emulates.
  if (native && !native.on) engine.setNative(false, native.note);
  mount(options);
}

/**
 * The host's own `name`, while this copy's mount deferred to a host that still
 * holds the page, so the page's calls move the host's knobs. Null otherwise.
 */
function hosted<K extends keyof DevknobsApi>(name: K): DevknobsApi[K] | null {
  if (!hostedBy) return null;
  const host = hostOf(window);
  if (!host?.api || host.release !== hostedBy.release) return null;
  const found: unknown = Reflect.get(host.api, name);
  return typeof found === "function" ? (found as DevknobsApi[K]) : null;
}

/**
 * The user's own scheme and motion, for the panel and grab, from a host whose
 * `native` media hides them from every media query in the tab. Null goes back
 * to those queries.
 */
export { setSystemMedia } from "./engine/system";

/**
 * Turn the `native` driver off or on, every knob kept: off, the page emulates
 * them as with no driver. For a host that keeps the choice of its `setting`
 * switch. `note` shows on that switch, such as why it went off.
 */
export const setNative = engine.setNative;

export function getState(): DevknobsState {
  return (hosted("getState") ?? engine.getState)();
}

/**
 * Apply a patch of knobs. A knob or a field the state does not have, or a
 * value it does not take, throws a TypeError, and then nothing changes. The
 * whole of `getState()` goes back in.
 */
export function setState(patch: DevknobsStatePatch): DevknobsState {
  const host = hosted("setState");
  if (host) return host(patch);
  checkPatch(patch);
  return engine.setState(patch);
}

export function reset(): void {
  (hosted("reset") ?? engine.reset)();
}

export function replay(): void {
  (hosted("replay") ?? engine.replay)();
}

export function ready(): Promise<DevknobsState> {
  return (hosted("ready") ?? engine.ready)();
}

/**
 * Not a knob: the compare layout, which `compare()` sets up and `setState`
 * does not take. `describe()` lists it after the knobs, with its state.
 */
export interface CompareDescription {
  key: "compare";
  description: string;
  value: KnobShape;
  default: KnobValue;
  reload: "frame";
}

export function describe(): (KnobDescription | CompareDescription)[] {
  // A host's describe says its own compare, where it has one.
  const host = hosted("describe");
  if (host) return host();
  const knobs = describeKnobs();
  const now = compareLoaded()?.compareState() ?? null;
  const on = now
    ? `On: ${now.frames.length} frames (${now.frames.map((frame) => frame.diff).join("; ")}), scroll sync ${now.sync}.`
    : "Off.";
  return [
    ...knobs,
    {
      key: "compare",
      description: `Devices side by side, each frame with its own knobs over these. Not a setState knob: call devknobs.compare([{ device: "iphone-17-pro" }, { device: "iphone-17-pro", textSize: "xxl" }], { sync: "proportional" }), devknobs.compareState() and devknobs.exitCompare(). textSize takes px or xs, s, m, l, xl, xxl, xxxl, ax1 to ax5. ${on}`,
      value: {
        type: "object",
        fields: {
          frames: {
            description: "How many frames are up, 0 with compare off. compare() takes an array of two or more setState patches, one per frame, each with textSize too.",
            value: { type: "number", min: 0 },
          },
          sync: { description: "How a scroll in one frame moves the others.", value: { type: "enum", values: ["proportional", "pixel", "off"] } },
        },
      },
      default: { frames: now?.frames.length ?? 0, sync: now?.sync ?? "proportional" },
      reload: "frame",
    },
  ];
}

/**
 * Lay two or more frames side by side, each running the page with the
 * panel's knobs and its own patch on top: a `setState` patch, with
 * `textSize` as px or a Dynamic Type name such as `xxl`. Loads on first use.
 */
export async function compare(
  frames: CompareFrameInput[],
  options?: { sync?: SyncMode },
): Promise<CompareState> {
  const host = hosted("compare");
  if (host) return host(frames, options);
  return (await loadCompare()).compare(frames, options);
}

/** Change one compare frame's patch. */
export async function setCompareFrame(index: number, frame: CompareFrameInput): Promise<CompareState | null> {
  const host = hosted("setCompareFrame");
  if (host) return host(index, frame);
  return (await loadCompare()).setFrame(index, frame);
}

export function exitCompare(): void {
  const host = hosted("exitCompare");
  if (host) return host();
  compareLoaded()?.exitCompare();
}

/** Each frame's patch, knobs and computed root font size, or null with no compare up. */
export function compareState(): CompareState | null {
  const host = hosted("compareState");
  if (host) return host();
  return compareLoaded()?.compareState() ?? null;
}

/**
 * Copy what an agent needs to find the elements in the code: their html, the
 * components that rendered them and where. Takes an element, an array or a
 * NodeList of them. Loads on first use, so the page never pays for it until
 * then. The payload comes back even when the copy fails, with `copied` false. Entries that are
 * not elements, such as a `querySelector` that found nothing, are skipped.
 * Null when the elements gave nothing.
 */
export async function grab(
  elements?: Element | Iterable<Element | null | undefined> | null,
  options?: GrabOptions,
): Promise<GrabResult | null> {
  const host = hosted("grab");
  if (host) return host(elements, options);
  const loaded = await import("./grab");
  return loaded.grab(elements, options);
}

/** The host's own `devices.<name>`, as `hosted` hands its other calls. Null otherwise. */
function hostedDevice<K extends keyof typeof devices>(name: K): (typeof devices)[K] | null {
  if (!hostedBy) return null;
  const host = hostOf(window);
  if (!host?.api || host.release !== hostedBy.release) return null;
  const own: unknown = Reflect.get(host.api, "devices");
  const found: unknown = typeof own === "object" && own !== null ? Reflect.get(own, name) : undefined;
  return typeof found === "function" ? (found.bind(own) as (typeof devices)[K]) : null;
}

/**
 * The devices the user added from a picture of the body, kept in this
 * origin's localStorage. Pictures are data urls; a url is fetched, so one
 * on another origin needs CORS. A page cannot read a file path, the
 * extension's copy included: read the file in Node and pass a data url.
 */
export const devices = {
  list(): CustomDevice[] {
    const host = hostedDevice("list");
    if (host) return host();
    return [...customDevices()];
  },
  /** Add a device from its json or object, its picture from `image` where given. Replaces one with the same id. */
  async add(device: string | object, image?: string): Promise<CustomDevice> {
    const host = hostedDevice("add");
    if (host) return host(device, image);
    const { addFrom } = await import("./engine/customload");
    return addFrom(device, image);
  },
  /** Add a device from a picture alone: its screen hole found, the rest from `options` or defaults. */
  async fromImage(image: string, options?: Partial<CustomDeviceInput>): Promise<CustomDevice> {
    const host = hostedDevice("fromImage");
    if (host) return host(image, options);
    const { deviceFromImage } = await import("./engine/customload");
    return deviceFromImage(image, options);
  },
  /** Take a device away. One in use goes back to none first. */
  remove(id: string): boolean {
    const host = hostedDevice("remove");
    if (host) return host(id);
    if (getState().device === id) setState({ device: "none", width: "full", height: "full", dpr: "system" });
    return removeDevice(id);
  },
  select(id: string): DevknobsState {
    const host = hostedDevice("select");
    if (host) return host(id);
    if (!customDevice(id)) throw new TypeError(`devknobs: no custom device ${id}`);
    return setState({ device: id });
  },
  /** One json with the picture in it. */
  export(id: string): string {
    const host = hostedDevice("export");
    if (host) return host(id);
    const device = customDevice(id);
    if (!device) throw new TypeError(`devknobs: no custom device ${id}`);
    return exportDevice(device);
  },
  import(json: string, image?: string): Promise<CustomDevice> {
    return devices.add(json, image);
  },
};

const api = {
  mount,
  unmount,
  getState,
  setState,
  reset,
  replay,
  grab,
  describe,
  ready,
  devices,
  compare,
  setCompareFrame,
  exitCompare,
  compareState,
};

/** What `mount` puts at `window.devknobs`, for agents that run code in the page. */
export type DevknobsApi = typeof api;

declare global {
  interface Window {
    devknobs?: DevknobsApi;
  }
}

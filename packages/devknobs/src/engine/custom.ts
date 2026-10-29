import type { DeviceKind, DevicePreset } from "./devices";
import type { Mock, Rect, Sides } from "./mock";
import { newer, stamped } from "./stored";

/**
 * Devices the user adds from a picture of the body: the picture, where its
 * screen hole is, and the viewport the page gets in it. Kept in localStorage,
 * read in sync, so the stored state, the early script and the copy of the
 * page in the frame all know a custom id as they start. See ADR-0004.
 */

/** Where the list is kept. */
export const DEVICES_KEY = "devknobs:devices";
export const DEVICES_VERSION = 1;

/** Every custom id starts with this, so none can stand for a built-in one. */
export const CUSTOM_PREFIX = "custom:";

/** The browser drawn round the page: none, or a generic Safari or Chrome. */
export type ChromeStyle = "none" | "ios-safari" | "android";

export const CHROME_STYLES: readonly ChromeStyle[] = ["none", "ios-safari", "android"];
export const KINDS: readonly DeviceKind[] = ["phone", "tablet", "laptop", "desktop"];

/** The screen hole in the picture, in its px, with its corner radius. */
export interface ScreenHole extends Rect {
  radius: number;
}

export interface CustomDevice {
  v: number;
  id: string;
  label: string;
  kind: DeviceKind;
  /** A `data:` url of the picture. */
  image: string;
  /** The picture's size in its own px. */
  imageSize: [number, number];
  screen: ScreenHole;
  /** The island or notch, in the picture's px. */
  cutout?: Rect;
  /** Safe area insets in css px of the screen. Kept and shown, not emulated. */
  safe?: Sides;
  /** The css size the page gets, held upright. */
  viewport: { width: number; height: number };
  dpr: number;
  chrome: ChromeStyle;
}

/** What `add` takes: the id comes from the label where none is given. */
export type CustomDeviceInput = Omit<CustomDevice, "v" | "id"> & { id?: string; v?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bad(path: string, value: unknown): TypeError {
  let shown: string;
  try {
    shown = typeof value === "string" && value.length > 60 ? `${JSON.stringify(value.slice(0, 60))}...` : String(JSON.stringify(value));
  } catch {
    shown = String(value);
  }
  return new TypeError(`devknobs: bad custom device ${path}: ${shown}`);
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function rectOf(value: unknown, path: string, size: [number, number]): Rect {
  if (!isRecord(value)) throw bad(path, value);
  const { x, y, width, height } = value;
  if (!nonNegative(x)) throw bad(`${path}.x`, x);
  if (!nonNegative(y)) throw bad(`${path}.y`, y);
  if (!positive(width) || x + width > size[0] + 0.5) throw bad(`${path}.width`, width);
  if (!positive(height) || y + height > size[1] + 0.5) throw bad(`${path}.height`, height);
  return { x, y, width, height };
}

/** A label as an id: `My phone` is `custom:my-phone`. */
export function slugOf(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${CUSTOM_PREFIX}${slug || "device"}`;
}

/**
 * A custom device read from json, every field checked. Throws a TypeError
 * that names the first bad field, as `setState` does.
 */
export function validateDevice(input: unknown): CustomDevice {
  if (!isRecord(input)) throw new TypeError("devknobs: a custom device is an object");
  const { label, kind, image, imageSize, screen, cutout, safe, viewport, dpr, chrome } = input;
  if (typeof label !== "string" || label.trim() === "" || label.length > 80) throw bad("label", label);
  const id = input.id === undefined ? slugOf(label) : input.id;
  if (typeof id !== "string" || !/^custom:[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw bad("id", id);
  if (typeof kind !== "string" || !KINDS.includes(kind as DeviceKind)) throw bad("kind", kind);
  if (typeof image !== "string" || !/^data:image\/(png|svg\+xml|jpeg|webp)[;,]/.test(image)) throw bad("image", image);
  if (!Array.isArray(imageSize) || imageSize.length !== 2 || !imageSize.every(positive)) throw bad("imageSize", imageSize);
  const size: [number, number] = [imageSize[0] as number, imageSize[1] as number];
  const hole = rectOf(screen, "screen", size);
  const radius = isRecord(screen) ? screen.radius : undefined;
  if (!nonNegative(radius) || radius > Math.min(hole.width, hole.height) / 2) throw bad("screen.radius", radius);
  if (!isRecord(viewport) || !positive(viewport.width) || viewport.width > 8192) throw bad("viewport.width", isRecord(viewport) ? viewport.width : viewport);
  if (!positive(viewport.height) || viewport.height > 8192) throw bad("viewport.height", viewport.height);
  if (!positive(dpr) || dpr > 5) throw bad("dpr", dpr);
  if (typeof chrome !== "string" || !CHROME_STYLES.includes(chrome as ChromeStyle)) throw bad("chrome", chrome);
  const device: CustomDevice = {
    v: DEVICES_VERSION,
    id,
    label: label.trim(),
    kind: kind as DeviceKind,
    image,
    imageSize: size,
    screen: { ...hole, radius },
    viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height) },
    dpr,
    chrome: chrome as ChromeStyle,
  };
  if (cutout !== undefined) device.cutout = rectOf(cutout, "cutout", size);
  if (safe !== undefined) {
    if (!isRecord(safe)) throw bad("safe", safe);
    const sides = {} as Sides;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const value = safe[side] ?? 0;
      if (!nonNegative(value)) throw bad(`safe.${side}`, value);
      sides[side] = value;
    }
    device.safe = sides;
  }
  return device;
}

let devices: CustomDevice[] | null = null;
let listening = false;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The list as kept, each device that no longer reads dropped. */
export function parseDevices(json: string | null): CustomDevice[] {
  if (!json) return [];
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (newer(value, DEVICES_VERSION) || !isRecord(value) || !Array.isArray(value.devices)) return [];
  return value.devices.flatMap((device: unknown) => {
    try {
      return [validateDevice(device)];
    } catch {
      return [];
    }
  });
}

/** The custom devices, read once from storage. */
export function customDevices(): readonly CustomDevice[] {
  // Another tab's change reads again on the next lookup.
  if (!listening && typeof globalThis.addEventListener === "function") {
    listening = true;
    globalThis.addEventListener("storage", (event: StorageEvent) => {
      if (event.key === DEVICES_KEY || event.key === null) reloadDevices();
    });
  }
  if (devices === null) {
    let json: string | null = null;
    try {
      json = storage()?.getItem(DEVICES_KEY) ?? null;
    } catch {
      // Storage refused: no custom devices.
    }
    devices = parseDevices(json);
  }
  return devices;
}

/**
 * A custom device by its id. One not in the list read is looked for again in
 * storage, as another window of the origin, such as the page above a frame,
 * may have added it since.
 */
export function customDevice(id: string): CustomDevice | undefined {
  if (!id.startsWith(CUSTOM_PREFIX)) return undefined;
  const found = customDevices().find((device) => device.id === id);
  if (found) return found;
  devices = null;
  return customDevices().find((device) => device.id === id);
}

function keep(next: CustomDevice[]): void {
  const store = storage();
  if (store) {
    try {
      store.setItem(DEVICES_KEY, JSON.stringify(stamped({ devices: next }, DEVICES_VERSION)));
    } catch (error) {
      const quota = error instanceof Error && /quota/i.test(`${error.name} ${error.message}`);
      throw new Error(
        quota
          ? "devknobs: no room left in localStorage for this device's picture; use a smaller image"
          : "devknobs: the custom devices could not be saved",
      );
    }
  }
  devices = next;
}

/** `id`, or with -2, -3 and on after it while a device has it. */
function freeId(id: string): string {
  const taken = new Set(customDevices().map((device) => device.id));
  let next = id;
  for (let n = 2; taken.has(next); n++) next = `${id}-${n}`;
  return next;
}

/**
 * Add a device. One with an id of its own replaces the device with that id,
 * as the editor saves an edit; one without takes its label's id, numbered
 * where a device has it already. Returns it as kept.
 */
export function addDevice(input: unknown): CustomDevice {
  const named = validateDevice(input);
  const own = isRecord(input) && input.id !== undefined;
  const device = own ? named : { ...named, id: freeId(named.id) };
  keep([...customDevices().filter((known) => known.id !== device.id), device]);
  return device;
}

export function removeDevice(id: string): boolean {
  const list = customDevices();
  if (!list.some((device) => device.id === id)) return false;
  keep(list.filter((device) => device.id !== id));
  return true;
}

/** For tests and another tab's change: read the list again from storage. */
export function reloadDevices(): void {
  devices = null;
}

/** One json with the picture in it. */
export function exportDevice(device: CustomDevice): string {
  return JSON.stringify(device, null, 2);
}

/**
 * A device from its json, with the picture from `image` where the json has
 * none or `image` is given. The picture is a data url here; see `api` for urls.
 */
export function importDevice(json: string, image?: string): CustomDevice {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new TypeError("devknobs: a custom device's json does not parse");
  }
  if (!isRecord(value)) throw new TypeError("devknobs: a custom device is an object");
  return validateDevice(image === undefined ? value : { ...value, image });
}

/** The ua preset a chrome style brings. */
function uaOf(device: CustomDevice): string {
  if (device.chrome === "ios-safari") return device.kind === "tablet" ? "ipad-safari" : "iphone-safari";
  if (device.chrome === "android") return "android-chrome";
  return "system";
}

/** The device as a preset, which the frame, the knobs and the readout take as any other. */
export function presetOf(device: CustomDevice): DevicePreset {
  const handheld = device.kind === "phone" || device.kind === "tablet";
  return {
    id: device.id,
    label: device.label,
    width: device.viewport.width,
    height: device.viewport.height,
    dpr: device.dpr,
    ua: uaOf(device),
    touch: handheld,
    kind: device.kind,
  };
}

/**
 * The picture as the device's mock, upright, in css px of the screen. As with
 * a maker's bezel, the picture is drawn at one density, never stretched, and
 * the viewport sits in the middle of its hole. A device held across turns the
 * picture a quarter, its top to the left.
 */
export function customMock(device: CustomDevice, landscape: boolean): Mock {
  const { screen, viewport, imageSize } = device;
  const scale = (screen.width + screen.height) / (viewport.width + viewport.height);
  const width = imageSize[0] / scale;
  const height = imageSize[1] / scale;
  const left = (screen.x + (screen.width - viewport.width * scale) / 2) / scale;
  const top = (screen.y + (screen.height - viewport.height * scale) / 2) / scale;
  const inset: Sides = {
    top,
    left,
    right: width - left - viewport.width,
    bottom: height - top - viewport.height,
  };
  const radius = screen.radius / scale;
  const upright: Mock = {
    width,
    height,
    inset,
    body: { x: 0, y: 0, width, height },
    screenRadius: radius,
    continuous: false,
    bodyRadius: 0,
    parts: [],
    image: { file: device.image, x: 0, y: 0, width, height, turn: null },
  };
  if (!landscape) return upright;
  return {
    ...upright,
    width: height,
    height: width,
    inset: { top: inset.right, right: inset.bottom, bottom: inset.left, left: inset.top },
    body: { x: 0, y: 0, width: height, height: width },
    image: { file: device.image, x: 0, y: 0, width, height, turn: width },
  };
}

/** The safari or chrome spec a custom device borrows for its bars, null for none. */
export function chromeSpecOf(id: string): { platform: "safari" | "chrome"; top: number } | null {
  const device = customDevice(id);
  if (!device || device.chrome === "none") return null;
  const top = device.safe?.top;
  if (device.chrome === "ios-safari") return { platform: "safari", top: top && top > 0 ? top : 62 };
  return { platform: "chrome", top: top && top > 0 ? top : 24 };
}

import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import { platformOf, viewportOf } from "../src/engine/browserui";
import {
  addDevice,
  customDevices,
  customMock,
  DEVICES_KEY,
  exportDevice,
  importDevice,
  reloadDevices,
  removeDevice,
  validateDevice,
} from "../src/engine/custom";
import { describe as describeKnobs } from "../src/engine/describe";
import { detectScreen, viewportFor } from "../src/engine/detect";
import { deviceOf, screenOf } from "../src/engine/devices";
import { mockOf } from "../src/engine/mock";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import * as devknobs from "../src/index";
import { DEVICE } from "../src/ui/deviceknobs";
import { decodePng, drawFrame, encodePng, pngDataUrl } from "./png";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const FRAME = { width: 120, height: 240, hole: { x: 10, y: 12, width: 100, height: 216, radius: 14 } };
const PNG = encodePng(FRAME.width, FRAME.height, drawFrame(FRAME));
const IMAGE = pngDataUrl(PNG);

const DEVICE_JSON = {
  label: "Test phone",
  kind: "phone",
  image: IMAGE,
  imageSize: [120, 240],
  screen: { x: 10, y: 12, width: 100, height: 216, radius: 14 },
  viewport: { width: 50, height: 108 },
  dpr: 2,
  chrome: "none",
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  reloadDevices();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
  reloadDevices();
});

describe("validateDevice", () => {
  test("takes a good device and gives it an id from its label", () => {
    const device = validateDevice(DEVICE_JSON);
    expect(device.id).toBe("custom:test-phone");
    expect(device.v).toBe(1);
    expect(device.screen.radius).toBe(14);
  });

  test("names the first bad field", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ label: "" }, "label"],
      [{ id: "iphone-17-pro" }, "id"],
      [{ kind: "watch" }, "kind"],
      [{ image: "https://example.com/a.png" }, "image"],
      [{ imageSize: [120] }, "imageSize"],
      [{ screen: { x: 10, y: 12, width: 200, height: 216, radius: 4 } }, "screen.width"],
      [{ screen: { x: 10, y: 12, width: 100, height: 216, radius: 80 } }, "screen.radius"],
      [{ viewport: { width: 0, height: 100 } }, "viewport.width"],
      [{ dpr: 9 }, "dpr"],
      [{ chrome: "firefox" }, "chrome"],
      [{ cutout: { x: 0, y: 0, width: 500, height: 4 } }, "cutout.width"],
      [{ safe: { top: -1 } }, "safe.top"],
    ];
    for (const [patch, path] of cases) {
      expect(() => validateDevice({ ...DEVICE_JSON, ...patch })).toThrow(`custom device ${path}`);
    }
    expect(() => validateDevice("nope")).toThrow(TypeError);
  });

  test("keeps the optional cutout and safe areas", () => {
    const device = validateDevice({
      ...DEVICE_JSON,
      cutout: { x: 40, y: 16, width: 40, height: 10 },
      safe: { top: 20, bottom: 10 },
    });
    expect(device.cutout).toEqual({ x: 40, y: 16, width: 40, height: 10 });
    expect(device.safe).toEqual({ top: 20, right: 0, bottom: 10, left: 0 });
  });
});

describe("detectScreen", () => {
  test("finds the clear hole and its corner in a real PNG frame", () => {
    const pixels = decodePng(PNG);
    const hole = detectScreen(pixels);
    expect(hole).not.toBeNull();
    if (!hole) return;
    expect(Math.abs(hole.x - 10)).toBeLessThanOrEqual(1);
    expect(Math.abs(hole.y - 12)).toBeLessThanOrEqual(1);
    expect(Math.abs(hole.width - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(hole.height - 216)).toBeLessThanOrEqual(2);
    expect(Math.abs(hole.radius - 14)).toBeLessThanOrEqual(2);
  });

  test("finds a flat colored hole", () => {
    const frame = { ...FRAME, hole: { x: 20, y: 30, width: 80, height: 160, radius: 0 }, flat: [255, 255, 255] as [number, number, number] };
    const hole = detectScreen(decodePng(encodePng(frame.width, frame.height, drawFrame(frame))));
    expect(hole).toEqual({ x: 20, y: 30, width: 80, height: 160, radius: 0 });
  });

  test("gives nothing where the center is the body or the hole runs off the edge", () => {
    const solid = new Uint8Array(40 * 40 * 4).fill(255);
    expect(detectScreen({ width: 40, height: 40, data: solid })).toBeNull();
    const clear = new Uint8Array(40 * 40 * 4);
    expect(detectScreen({ width: 40, height: 40, data: clear })).toBeNull();
  });

  test("works the viewport out from the hole and a dpr", () => {
    expect(viewportFor({ width: 1206, height: 2622 }, 3)).toEqual({ width: 402, height: 874 });
  });
});

describe("export and import", () => {
  test("round trips one json with the picture in it", () => {
    const device = validateDevice(DEVICE_JSON);
    expect(importDevice(exportDevice(device))).toEqual(device);
  });

  test("takes the picture from a separate image", () => {
    const { image: _, ...bare } = DEVICE_JSON;
    const device = importDevice(JSON.stringify(bare), IMAGE);
    expect(device.image).toBe(IMAGE);
    expect(() => importDevice(JSON.stringify(bare))).toThrow("custom device image");
    expect(() => importDevice("{oops")).toThrow("does not parse");
  });
});

describe("the registry", () => {
  test("keeps devices in localStorage and lists them as presets and in the device knob", () => {
    addDevice(DEVICE_JSON);
    expect(storage.getItem(DEVICES_KEY)).toContain("custom:test-phone");
    reloadDevices();
    expect(customDevices().map((device) => device.id)).toEqual(["custom:test-phone"]);
    expect(deviceOf("custom:test-phone")).toMatchObject({ width: 50, height: 108, dpr: 2, kind: "phone", touch: true });
    expect(screenOf("custom:test-phone")?.label).toBe("Test phone");
    expect(DEVICE.options.some((option) => option.value === "custom:test-phone" && option.group === "custom")).toBe(true);
    const device = describeKnobs().find((knob) => knob.key === "device");
    expect(device?.value.type === "enum" && device.value.values.includes("custom:test-phone")).toBe(true);
  });

  test("a second device with the same label gets a numbered id, and only an explicit id replaces", () => {
    expect(addDevice(DEVICE_JSON).id).toBe("custom:test-phone");
    expect(addDevice(DEVICE_JSON).id).toBe("custom:test-phone-2");
    expect(addDevice(DEVICE_JSON).id).toBe("custom:test-phone-3");
    addDevice({ ...DEVICE_JSON, id: "custom:test-phone", label: "Renamed" });
    expect(customDevices().map((device) => [device.id, device.label])).toEqual([
      ["custom:test-phone-2", "Test phone"],
      ["custom:test-phone-3", "Test phone"],
      ["custom:test-phone", "Renamed"],
    ]);
  });

  test("another tab's change reads again on the next lookup", () => {
    expect(customDevices()).toEqual([]);
    storage.setItem(DEVICES_KEY, JSON.stringify({ v: 1, devices: [validateDevice(DEVICE_JSON)] }));
    globalThis.dispatchEvent(Object.assign(new Event("storage"), { key: DEVICES_KEY }));
    expect(customDevices().map((device) => device.id)).toEqual(["custom:test-phone"]);
  });

  test("a stored state and a merge keep a custom device", () => {
    addDevice(DEVICE_JSON);
    const state = merge(DEFAULT_STATE, { device: "custom:test-phone" });
    expect(state).toMatchObject({ device: "custom:test-phone", width: 50, height: 108, dpr: 2 });
    expect(parse(JSON.stringify(state)).device).toBe("custom:test-phone");
    removeDevice("custom:test-phone");
    expect(parse(JSON.stringify(state)).device).toBe("none");
  });

  test("finds a device another window added since the list was read", () => {
    expect(customDevices()).toEqual([]);
    const other = validateDevice(DEVICE_JSON);
    storage.setItem(DEVICES_KEY, JSON.stringify({ v: 1, devices: [other] }));
    expect(deviceOf("custom:test-phone")?.label).toBe("Test phone");
  });

  test("drops a stored device that no longer reads, and a list from a newer devknobs", () => {
    storage.setItem(DEVICES_KEY, JSON.stringify({ v: 1, devices: [DEVICE_JSON, { label: 4 }] }));
    expect(customDevices().length).toBe(1);
    storage.setItem(DEVICES_KEY, JSON.stringify({ v: 9, devices: [DEVICE_JSON] }));
    reloadDevices();
    expect(customDevices()).toEqual([]);
  });
});

describe("the mock and the bars", () => {
  test("draws the picture at one density with the viewport in its hole", () => {
    addDevice(DEVICE_JSON);
    const mock = mockOf("custom:test-phone", "portrait");
    expect(mock?.image?.file).toBe(IMAGE);
    // 100 x 216 image px over 50 x 108 css px: a density of 2.
    expect(mock).toMatchObject({ width: 60, height: 120, inset: { top: 6, left: 5, right: 5, bottom: 6 }, screenRadius: 7 });
    const across = customMock(validateDevice(DEVICE_JSON), true);
    expect(across).toMatchObject({ width: 120, height: 60, inset: { top: 5, right: 6, bottom: 5, left: 6 } });
    expect(across.image?.turn).toBe(60);
  });

  test("draws no bars with no chrome, and generic ones for a chrome style", () => {
    addDevice(DEVICE_JSON);
    expect(platformOf("custom:test-phone")).toBeNull();
    addDevice({ ...DEVICE_JSON, label: "Safari phone", chrome: "ios-safari", safe: { top: 40 } });
    expect(platformOf("custom:safari-phone")).toBe("safari");
    expect(deviceOf("custom:safari-phone")?.ua).toBe("iphone-safari");
    const screen = { id: "custom:safari-phone", width: 50, height: 108 };
    expect(viewportOf(screen, "portrait", "off", false)).toEqual({ x: 0, y: 0, width: 50, height: 108 });
    expect(viewportOf(screen, "portrait", "compact", false).y).toBe(40);
    addDevice({ ...DEVICE_JSON, label: "Droid", chrome: "android" });
    expect(platformOf("custom:droid")).toBe("chrome");
  });
});

describe("devknobs.devices", () => {
  let setState: Mock<typeof engine.setState>;
  let current = DEFAULT_STATE;

  beforeEach(() => {
    current = DEFAULT_STATE;
    setState = spyOn(engine, "setState").mockImplementation((patch) => {
      current = merge(current, patch);
      return current;
    });
    spyOn(engine, "getState").mockImplementation(() => current);
  });

  afterEach(() => {
    setState.mockRestore();
    (engine.getState as Mock<typeof engine.getState>).mockRestore();
  });

  test("adds, lists, selects, exports and removes", async () => {
    const added = await devknobs.devices.add(DEVICE_JSON);
    expect(added.id).toBe("custom:test-phone");
    expect(devknobs.devices.list().map((device) => device.id)).toEqual(["custom:test-phone"]);
    expect(devknobs.devices.select("custom:test-phone")).toMatchObject({ device: "custom:test-phone", width: 50 });
    expect(JSON.parse(devknobs.devices.export("custom:test-phone")).image).toBe(IMAGE);
    expect(() => devknobs.devices.select("custom:nope")).toThrow("no custom device");
    expect(devknobs.devices.remove("custom:test-phone")).toBe(true);
    expect(current.device).toBe("none");
    expect(devknobs.devices.list()).toEqual([]);
    expect(devknobs.devices.remove("custom:test-phone")).toBe(false);
  });

  test("imports json with a separate picture, and setState takes a custom id", async () => {
    const { image: _, ...bare } = DEVICE_JSON;
    await devknobs.devices.import(JSON.stringify({ ...bare, label: "Bare" }), IMAGE);
    expect(devknobs.setState({ device: "custom:bare" }).device).toBe("custom:bare");
    expect(() => devknobs.setState({ device: "custom:missing" })).toThrow("bad value for device");
  });
});

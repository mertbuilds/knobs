import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { holdInTopLayer, LAYER, placeOf } from "../src/engine/toplayer";

/** What went in and out of the top layer, as `in:name` and `out:name`, in order. */
let log: string[] = [];
/** The top layer, the last in painting over the rest. */
let layer: FakeHost[] = [];
let listeners: { type: string; fn: (event: unknown) => void }[] = [];
let styles: string[] = [];

/** A page's own element that goes in the top layer. */
class FakeElement {
  tagName: string;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
}

class FakeHost extends FakeElement {
  name: string;
  attributes = new Map<string, string>();
  constructor(name: string) {
    super("DIV");
    this.name = name;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  matches(selector: string): boolean {
    return selector === ":popover-open" && layer.includes(this);
  }
  showPopover(): void {
    if (layer.includes(this)) throw new Error("shown already");
    layer.push(this);
    log.push(`in:${this.name}`);
  }
  hidePopover(): void {
    layer = layer.filter((other) => other !== this);
    log.push(`out:${this.name}`);
  }
}

const saved = new Map<string, PropertyDescriptor | undefined>();

function install(name: string, value: unknown): void {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function hold(name: string, rank: number): { host: FakeHost; release(): void; raise(): void } {
  const host = new FakeHost(name);
  return { host, ...holdInTopLayer(host as unknown as HTMLElement, rank) };
}

/** A page's popover opens: its `toggle` reaches the window's capture listeners. */
function pageOpens(target: unknown): { stopped: boolean } {
  const event = {
    type: "toggle",
    newState: "open",
    stopped: false,
    composedPath: () => [target],
    stopImmediatePropagation() {
      event.stopped = true;
    },
  };
  if (target instanceof FakeHost) layer.push(target);
  for (const entry of [...listeners]) if (entry.type === "toggle") entry.fn(event);
  return event;
}

beforeEach(() => {
  log = [];
  layer = [];
  listeners = [];
  styles = [];
  install("HTMLElement", FakeHost);
  install("Element", FakeElement);
  install("window", {
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners.push({ type, fn });
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners = listeners.filter((entry) => entry.type !== type || entry.fn !== fn);
    },
  });
  install("document", {
    documentElement: {},
    head: {
      appendChild(style: { name: string }) {
        styles.push(style.name);
      },
    },
    querySelector(selector: string) {
      const name = /"(.+)"/.exec(selector)?.[1];
      if (!name || !styles.includes(name)) return null;
      return {
        remove() {
          styles = styles.filter((other) => other !== name);
        },
      };
    },
    createElement() {
      return {
        name: "",
        textContent: "",
        setAttribute(_attribute: string, value: string) {
          this.name = value;
        },
      };
    },
  });
  install("MutationObserver", undefined);
});

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  saved.clear();
});

describe("place among the hosts", () => {
  test("goes after every host of its rank or lower, before every higher one", () => {
    expect(placeOf([], LAYER.panel)).toBe(0);
    expect(placeOf([0, 1, 2], 1)).toBe(2);
    expect(placeOf([1, 2], 0)).toBe(0);
    expect(placeOf([0, 1], 2)).toBe(2);
  });

  test("puts grab's boxes under the panel, a guide over it, and the touch cursor over all", () => {
    expect(LAYER.overlay).toBeLessThan(LAYER.panel);
    expect(LAYER.panel).toBeLessThan(LAYER.guide);
    expect(LAYER.guide).toBeLessThan(LAYER.touch);
  });
});

describe("hosts in the top layer", () => {
  test("a box that comes after the panel goes under it", () => {
    const panel = hold("panel", LAYER.panel);
    const overlay = hold("overlay", LAYER.overlay);
    expect(layer.map((host) => host.name)).toEqual(["overlay", "panel"]);
    expect(log).toEqual(["in:panel", "in:overlay", "out:panel", "in:panel"]);
    expect(panel.host.attributes.get("popover")).toBe("manual");
    expect(overlay.host.attributes.get("popover")).toBe("manual");
    overlay.release();
    panel.release();
  });

  test("a popover the page opens goes under every host, in their order", () => {
    const panel = hold("panel", LAYER.panel);
    const overlay = hold("overlay", LAYER.overlay);
    const touch = hold("touch", LAYER.touch);
    const page = new FakeHost("page");
    layer.length = 0;
    layer.push(overlay.host, panel.host, touch.host);
    log = [];
    const event = pageOpens(page);
    expect(event.stopped).toBe(false);
    expect(layer.map((host) => host.name)).toEqual(["page", "overlay", "panel", "touch"]);
    touch.release();
    overlay.release();
    panel.release();
  });

  test("keeps its own way in and out from the page, and is not raised by it", () => {
    const panel = hold("panel", LAYER.panel);
    log = [];
    const event = pageOpens(panel.host);
    expect(event.stopped).toBe(true);
    expect(log).toEqual([]);
    panel.release();
  });

  test("raised again, a host goes over those below it and under those above it", () => {
    const panel = hold("panel", LAYER.panel);
    const touch = hold("touch", LAYER.touch);
    log = [];
    panel.raise();
    expect(log).toEqual(["out:panel", "in:panel", "out:touch", "in:touch"]);
    touch.release();
    panel.release();
  });

  test("watches the page, and hides the hosts' backdrop, only while it holds a host", () => {
    const panel = hold("panel", LAYER.panel);
    const overlay = hold("overlay", LAYER.overlay);
    expect(listeners.map((entry) => entry.type)).toContain("toggle");
    expect(styles).toEqual(["top-layer"]);
    overlay.release();
    expect(listeners.length).toBeGreaterThan(0);
    panel.release();
    expect(listeners).toEqual([]);
    expect(styles).toEqual([]);
    log = [];
    panel.raise();
    expect(log).toEqual([]);
  });

  test("a guide stays over the panel when the page opens a popover", () => {
    const panel = hold("panel", LAYER.panel);
    const guide = hold("guide", LAYER.guide);
    pageOpens(new FakeHost("page"));
    expect(layer.map((host) => host.name)).toEqual(["page", "panel", "guide"]);
    guide.release();
    panel.release();
  });

  test("lets go of a host the browser will not show, and leaves it no popover", () => {
    const host = new FakeHost("refused");
    host.showPopover = () => {
      throw new Error("not in the page");
    };
    holdInTopLayer(host as unknown as HTMLElement, LAYER.panel);
    expect(host.attributes.has("popover")).toBe(false);
    expect(listeners).toEqual([]);
    expect(styles).toEqual([]);
  });

  test("stays a plain layer, watching nothing, where the browser has no popovers", () => {
    install("HTMLElement", class {});
    const panel = hold("panel", LAYER.panel);
    expect(panel.host.attributes.has("popover")).toBe(false);
    expect(listeners).toEqual([]);
    panel.release();
  });
});

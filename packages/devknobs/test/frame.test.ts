import { afterEach, describe, expect, test } from "bun:test";
import {
  EXITED,
  FRAME_ATTRIBUTE,
  FRAME_NAME,
  frameForced,
  framed,
  isDevknobsFrame,
  knobFrame,
  leaveFor,
  nativeScheme,
  needsFrame,
  plainFrame,
  post,
  readMessage,
  UNFRAMED,
} from "../src/engine/frame";
import { DEFAULT_STATE, merge, parse } from "../src/engine/store";
import { DEVICE } from "../src/ui/deviceknobs";

const ORIGIN = "http://localhost:3000";

function setWindow(frameElement: () => unknown, name = ""): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      name,
      get frameElement() {
        return frameElement();
      },
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("framed", () => {
  test("keeps the width full inside the frame", () => {
    expect(framed({ ...DEFAULT_STATE, scheme: "dark", width: 390 })).toEqual({
      ...DEFAULT_STATE,
      scheme: "dark",
      width: "full",
    });
  });

  test("leaves the frame knobs off inside the frame", () => {
    expect(framed({ ...DEFAULT_STATE, frame: true })).toEqual(DEFAULT_STATE);
    expect(framed({ ...DEFAULT_STATE, vision: "tritanopia" })).toEqual(DEFAULT_STATE);
    expect(framed({ ...DEFAULT_STATE, dpr: 3 })).toEqual(DEFAULT_STATE);
    expect(framed({ ...DEFAULT_STATE, height: 874 })).toEqual(DEFAULT_STATE);
  });

  test("keeps the device inside the frame, for its touch screen", () => {
    const phone = { ...DEFAULT_STATE, width: 402, height: 874, dpr: 3, device: "iphone-16-pro" };
    expect(framed(phone)).toEqual({ ...DEFAULT_STATE, device: "iphone-16-pro" });
  });

  test("hands back a state that is already full", () => {
    const state = { ...DEFAULT_STATE, text: 20 };
    expect(framed(state)).toBe(state);
  });
});

describe("the frame leaving on its own", () => {
  const exit = (state: typeof DEFAULT_STATE) => merge(state, EXITED);
  // Picking none for the device, then the other knobs the exit turns off.
  const none = (state: typeof DEFAULT_STATE) =>
    merge(merge(state, DEVICE.write("none", state)), { ...UNFRAMED, panel: { docked: false } });

  test("takes the device off and the browser it brought, as picking none does", () => {
    const phone = merge(DEFAULT_STATE, { device: "iphone-17", frame: true, panel: { docked: true } });
    expect(phone.ua.preset).toBe("iphone-safari");
    const exited = exit(phone);
    expect(exited.device).toBe("none");
    expect(exited.ua.preset).toBe("system");
    expect(needsFrame(exited)).toBe(false);
    expect(exited).toEqual(none(phone));
    expect(parse(JSON.stringify(exited))).toEqual(parse(JSON.stringify(none(phone))));
  });

  test("keeps a browser picked since the device, as picking none does", () => {
    const phone = merge(DEFAULT_STATE, { device: "iphone-17" });
    const picked = merge(phone, { ua: { preset: "android-chrome" } });
    expect(exit(picked).ua.preset).toBe("android-chrome");
    expect(exit(picked)).toEqual(none(picked));
  });
});

describe("a panel pinned to its side", () => {
  const pinned = { ...DEFAULT_STATE, panel: { ...DEFAULT_STATE.panel, docked: true } };

  test("puts the page in the frame with every frame knob off, open or closed", () => {
    expect(needsFrame(DEFAULT_STATE)).toBe(false);
    expect(needsFrame(pinned)).toBe(true);
    const open = { ...pinned, panel: { ...pinned.panel, open: true } };
    expect(needsFrame(open)).toBe(true);
    expect(needsFrame({ ...UNFRAMED, panel: { docked: true } })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, panel: { docked: false } })).toBe(false);
  });

  test("is no knob: the zoom and the mat wait for one", () => {
    expect(knobFrame(pinned)).toBe(false);
    expect(knobFrame({ ...pinned, width: 390 })).toBe(true);
  });

  test("has a plain frame alone, and a knob's frame with a knob", () => {
    expect(plainFrame(pinned)).toBe(true);
    expect(plainFrame(DEFAULT_STATE)).toBe(false);
    expect(plainFrame(UNFRAMED)).toBe(false);
    for (const knob of [{ width: 390 }, { height: 700 }, { frame: true }, { dpr: 2 }] as const) {
      expect(plainFrame({ ...pinned, ...knob })).toBe(false);
      expect(needsFrame({ ...pinned, ...knob })).toBe(true);
    }
    expect(plainFrame({ ...pinned, vision: "blur" })).toBe(false);
  });

  test("holds the frame up whatever the frame knob says", () => {
    expect(frameForced(pinned)).toBe(true);
    expect(frameForced({ ...pinned, frame: true })).toBe(true);
  });

  test("never frames the page inside the frame again, and floats there", () => {
    const inside = framed({ ...pinned, scheme: "dark" });
    expect(inside.panel.docked).toBe(false);
    expect(needsFrame(inside)).toBe(false);
    expect(inside).toEqual({ ...DEFAULT_STATE, scheme: "dark" });
    const phone = framed({ ...pinned, width: 402, height: 874, device: "iphone-16-pro" });
    expect(phone).toEqual({ ...DEFAULT_STATE, device: "iphone-16-pro" });
  });
});

describe("needsFrame", () => {
  test("is true for a width, a height, the frame knob, a ratio or a vision deficiency", () => {
    expect(needsFrame({ ...UNFRAMED, width: 390 })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, height: 700 })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, frame: true })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, vision: "blur" })).toBe(true);
    expect(needsFrame({ ...UNFRAMED, dpr: 2 })).toBe(true);
  });

  test("is false with every frame knob off, or for a width that is no size", () => {
    expect(needsFrame(UNFRAMED)).toBe(false);
    expect(needsFrame({ ...UNFRAMED, width: 0 })).toBe(false);
    expect(needsFrame({ ...UNFRAMED, dpr: 0 })).toBe(false);
  });
});

describe("frameForced", () => {
  test("is true where a size, a ratio or a vision deficiency holds the frame up", () => {
    expect(frameForced({ ...UNFRAMED, width: 390 })).toBe(true);
    expect(frameForced({ ...UNFRAMED, height: 700 })).toBe(true);
    expect(frameForced({ ...UNFRAMED, dpr: 2 })).toBe(true);
    expect(frameForced({ ...UNFRAMED, vision: "blur" })).toBe(true);
    expect(frameForced({ ...UNFRAMED, width: 390, frame: true })).toBe(true);
  });

  test("is false where only the frame knob could bring it up", () => {
    expect(frameForced(UNFRAMED)).toBe(false);
    expect(frameForced({ ...UNFRAMED, frame: true })).toBe(false);
    expect(frameForced({ ...UNFRAMED, width: 0, dpr: 0 })).toBe(false);
  });
});

describe("readMessage", () => {
  const parent = {};

  function from(data: unknown, source: unknown = parent, origin = ORIGIN) {
    return readMessage({ data, origin, source }, parent, ORIGIN);
  }

  test("reads a state, falling back to the defaults field by field", () => {
    expect(
      from({ source: "devknobs", type: "state", state: { scheme: "dark", width: 390 } }),
    ).toEqual({
      source: "devknobs",
      type: "state",
      state: { ...DEFAULT_STATE, scheme: "dark", width: 390 },
    });
    expect(
      from({ source: "devknobs", type: "state", state: { scheme: "loud", stray: 1 } }),
    ).toEqual({ source: "devknobs", type: "state", state: DEFAULT_STATE });
  });

  test("reads whether the driver above is on, and only a boolean", () => {
    const state = { scheme: "dark" };
    expect(from({ source: "devknobs", type: "state", state, native: false })).toEqual({
      source: "devknobs",
      type: "state",
      state: { ...DEFAULT_STATE, scheme: "dark" },
      native: false,
    });
    expect(from({ source: "devknobs", type: "state", state, native: "no" })).not.toHaveProperty("native");
  });

  test("reads where the frame's page leaves for, a web address only", () => {
    expect(from({ source: "devknobs", type: "leave", url: "https://github.com/login" })).toEqual({
      source: "devknobs",
      type: "leave",
      url: "https://github.com/login",
    });
    expect(from({ source: "devknobs", type: "leave", url: "javascript:alert(1)" })).toBeNull();
    expect(from({ source: "devknobs", type: "leave", url: 7 })).toBeNull();
  });

  test("reads the zoom keys", () => {
    for (const action of ["zoom-in", "zoom-out", "zoom-fit"] as const) {
      expect(from({ source: "devknobs", type: "key", action })).toEqual({
        source: "devknobs",
        type: "key",
        action,
      });
    }
    expect(from({ source: "devknobs", type: "key", action: "zoom-max" })).toBeNull();
  });

  test("reads keys, ready and replay", () => {
    expect(from({ source: "devknobs", type: "key", action: "toggle" })).toEqual({
      source: "devknobs",
      type: "key",
      action: "toggle",
    });
    expect(from({ source: "devknobs", type: "key", action: "close" })).toEqual({
      source: "devknobs",
      type: "key",
      action: "close",
    });
    for (const action of ["replay", "requests", "reset", "search"] as const) {
      expect(from({ source: "devknobs", type: "key", action })).toEqual({
        source: "devknobs",
        type: "key",
        action,
      });
    }
    expect(from({ source: "devknobs", type: "ready" })).toEqual({
      source: "devknobs",
      type: "ready",
    });
    expect(from({ source: "devknobs", type: "replay" })).toEqual({
      source: "devknobs",
      type: "replay",
    });
  });

  test("reads inspect going on and off as it reads grab, and a pick and an outline with nothing in them", () => {
    expect(from({ source: "devknobs", type: "inspect", on: true, scheme: "dark" })).toEqual({
      source: "devknobs",
      type: "inspect",
      on: true,
      scheme: "dark",
    });
    expect(from({ source: "devknobs", type: "inspect", on: false })).toEqual({
      source: "devknobs",
      type: "inspect",
      on: false,
    });
    expect(from({ source: "devknobs", type: "inspect" })).toBeNull();
    // An element cannot ride a message: whatever else is sent along is dropped.
    expect(from({ source: "devknobs", type: "picked", element: "button" })).toEqual({
      source: "devknobs",
      type: "picked",
    });
    expect(from({ source: "devknobs", type: "outline" })).toEqual({
      source: "devknobs",
      type: "outline",
    });
  });

  test("reads the area of the box the frame is to tint alone, and nothing for an area it does not know", () => {
    for (const ring of ["margin", "border", "padding", "content", null] as const) {
      expect(from({ source: "devknobs", type: "area", ring })).toEqual({
        source: "devknobs",
        type: "area",
        ring,
      });
    }
    expect(from({ source: "devknobs", type: "area", ring: "outline" })).toBeNull();
    expect(from({ source: "devknobs", type: "area" })).toBeNull();
  });

  test("reads the overflow count the frame reports", () => {
    expect(from({ source: "devknobs", type: "overflow", count: 3 })).toEqual({
      source: "devknobs",
      type: "overflow",
      count: 3,
    });
    expect(from({ source: "devknobs", type: "overflow", count: -1 })).toBeNull();
    expect(from({ source: "devknobs", type: "overflow", count: 1.5 })).toBeNull();
    expect(from({ source: "devknobs", type: "overflow", count: "3" })).toBeNull();
    expect(from({ source: "devknobs", type: "overflow" })).toBeNull();
  });

  test("reads grab going on and off, and the scheme to draw it in", () => {
    expect(from({ source: "devknobs", type: "grab", on: true, scheme: "dark" })).toEqual({
      source: "devknobs",
      type: "grab",
      on: true,
      scheme: "dark",
    });
    expect(from({ source: "devknobs", type: "grab", on: false, scheme: "blue" })).toEqual({
      source: "devknobs",
      type: "grab",
      on: false,
    });
    expect(from({ source: "devknobs", type: "grab", on: "yes" })).toBeNull();
  });

  test("refuses another origin or another window", () => {
    const message = { source: "devknobs", type: "ready" };
    expect(from(message, parent, "http://evil.test")).toBeNull();
    expect(from(message, {})).toBeNull();
    expect(from(message, null)).toBeNull();
    expect(readMessage({ data: message, origin: ORIGIN, source: null }, null, ORIGIN)).toBeNull();
  });

  test("refuses anything that is not a devknobs message", () => {
    expect(from(null)).toBeNull();
    expect(from("devknobs")).toBeNull();
    expect(from({ type: "ready" })).toBeNull();
    expect(from({ source: "other", type: "ready" })).toBeNull();
    expect(from({ source: "devknobs", type: "unknown" })).toBeNull();
    expect(from({ source: "devknobs", type: "state" })).toBeNull();
    expect(from({ source: "devknobs", type: "state", state: "dark" })).toBeNull();
    expect(from({ source: "devknobs", type: "key", action: "open" })).toBeNull();
    expect(from({ source: "devknobs", type: "key" })).toBeNull();
  });
});

describe("leaveFor", () => {
  test("sends the window above where the frame's page sets off for another origin, but not a form's post", () => {
    const go = {
      navigationType: "push",
      hashChange: false,
      cancelable: true,
      downloadRequest: null,
      formData: null,
      destination: { url: "https://github.com/login" },
    };
    expect(leaveFor(go, ORIGIN)).toBe("https://github.com/login");
    expect(leaveFor({ ...go, destination: { url: `${ORIGIN}/next` } }, ORIGIN)).toBeNull();
    expect(leaveFor({ ...go, navigationType: "traverse" }, ORIGIN)).toBeNull();
    expect(leaveFor({ ...go, cancelable: false }, ORIGIN)).toBeNull();
    expect(leaveFor({ ...go, destination: { url: "mailto:a@b.c" } }, ORIGIN)).toBeNull();
    expect(leaveFor({ ...go, formData: new FormData() }, ORIGIN)).toBeNull();
  });
});

describe("isDevknobsFrame", () => {
  test("knows its frame by the attribute", () => {
    setWindow(() => ({ hasAttribute: (name: string) => name === FRAME_ATTRIBUTE }));
    expect(isDevknobsFrame()).toBe(true);
  });

  test("is false at the top and in other frames", () => {
    setWindow(() => null);
    expect(isDevknobsFrame()).toBe(false);
    setWindow(() => ({ hasAttribute: () => false }));
    expect(isDevknobsFrame()).toBe(false);
  });

  test("falls back to the window name when the frame element is out of reach", () => {
    setWindow(() => {
      throw new Error("cross-origin");
    }, FRAME_NAME);
    expect(isDevknobsFrame()).toBe(true);
    setWindow(() => null, FRAME_NAME);
    expect(isDevknobsFrame()).toBe(true);
    setWindow(() => {
      throw new Error("cross-origin");
    });
    expect(isDevknobsFrame()).toBe(false);
  });
});

describe("nativeScheme", () => {
  /** A frame element with this inline `color-scheme`. */
  function owner(colorScheme: string) {
    return {
      style: { getPropertyValue: (name: string) => (name === "color-scheme" ? colorScheme : "") },
    };
  }

  test("is true when the frame element carries the same scheme", () => {
    setWindow(() => owner("dark"));
    expect(nativeScheme("dark")).toBe(true);
    setWindow(() => owner("light"));
    expect(nativeScheme("light")).toBe(true);
  });

  test("is false for system, another scheme or none at all", () => {
    setWindow(() => owner("dark"));
    expect(nativeScheme("system")).toBe(false);
    expect(nativeScheme("light")).toBe(false);
    setWindow(() => owner(""));
    expect(nativeScheme("dark")).toBe(false);
    setWindow(() => null);
    expect(nativeScheme("dark")).toBe(false);
  });

  test("is false when the frame element is out of reach", () => {
    setWindow(() => {
      throw new Error("cross-origin");
    });
    expect(nativeScheme("dark")).toBe(false);
  });
});

describe("post", () => {
  const message = { source: "devknobs", type: "ready" } as const;

  function target(location: () => unknown) {
    const posted: [unknown, string][] = [];
    const view = {
      get location() {
        return location();
      },
      postMessage: (data: unknown, origin: string) => posted.push([data, origin]),
    };
    return { posted, view: view as unknown as Window };
  }

  test("posts to a window on this origin", () => {
    const { posted, view } = target(() => ({ origin: ORIGIN }));
    post(view, message);
    expect(posted).toEqual([[message, "/"]]);
  });

  test("posts nothing, and throws nothing, to a frame on another origin or holding an error page", () => {
    const { posted, view } = target(() => ({
      get origin() {
        throw new Error("SecurityError");
      },
    }));
    expect(() => post(view, message)).not.toThrow();
    expect(posted).toEqual([]);
  });

  test("posts nothing with no window", () => {
    expect(() => post(null, message)).not.toThrow();
  });
});

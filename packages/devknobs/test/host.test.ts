import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import * as engine from "../src/engine";
import * as geo from "../src/engine/geo";
import * as header from "../src/engine/header";
import * as locale from "../src/engine/locale";
import * as media from "../src/engine/media";
import * as network from "../src/engine/network";
import * as outlines from "../src/engine/outlines";
import * as overflow from "../src/engine/overflow";
import * as pseudo from "../src/engine/pseudo";
import * as scrollbars from "../src/engine/scrollbars";
import * as scrollkeep from "../src/engine/scrollkeep";
import * as spacing from "../src/engine/spacing";
import * as speed from "../src/engine/speed";
import * as text from "../src/engine/text";
import * as time from "../src/engine/time";
import * as touch from "../src/engine/touch";
import * as touchPointer from "../src/engine/touchpointer";
import * as ua from "../src/engine/ua";
import * as width from "../src/engine/frames";
import * as control from "../src/grab/control";
import * as inspect from "../src/grab/inspect";
import * as devknobs from "../src/index";
import { claim, free, hostOf, owned } from "../src/instance";
import * as requests from "../src/requests";
import * as onload from "../src/storage/onload";
import { DEFAULT_STATE } from "../src/engine/store";
import * as bindings from "../src/ui/bindings";
import * as panel from "../src/ui/panel";

/**
 * The real `mount`, `unmount` and the host's `adopt` and take-back, on a window
 * with just what they read, the engine's patches and the panel's parts quiet.
 */
let spies: Mock<(...args: never[]) => unknown>[] = [];
let createPanel: Mock<typeof panel.createPanel>;
let createKeys: Mock<typeof bindings.createKeys>;

const quiet = <T extends object>(target: T, ...names: (keyof T & string)[]) => {
  for (const name of names) {
    spies.push(spyOn(target, name as never).mockImplementation((() => {}) as never));
  }
};
const destroyable = () => ({ destroy() {} });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      name: "",
      frameElement: null,
      addEventListener() {},
      removeEventListener() {},
      parent: { postMessage() {} },
    },
  });
  spies = [];
  quiet(media, "apply", "destroy");
  quiet(network, "apply", "reset");
  quiet(text, "apply", "reset");
  quiet(touch, "apply", "reset");
  quiet(touchPointer, "apply", "reset");
  quiet(scrollbars, "apply", "reset");
  quiet(speed, "apply", "reset");
  quiet(locale, "apply", "reset");
  quiet(pseudo, "apply", "reset");
  quiet(geo, "apply", "reset");
  quiet(time, "apply", "reset");
  quiet(header, "apply", "reset");
  quiet(spacing, "apply", "reset");
  quiet(ua, "apply", "reset");
  quiet(width, "apply", "sync", "reset", "onExit", "onZoom", "onRefused", "onFramed");
  quiet(overflow, "apply", "reset");
  quiet(outlines, "apply", "reset");
  quiet(requests, "start", "stop");
  quiet(scrollkeep, "resume");
  quiet(onload, "applyOnLoad");
  quiet(inspect, "oneAtATime");
  spies.push(spyOn(control, "createGrab").mockImplementation((() => destroyable()) as never) as never);
  spies.push(spyOn(inspect, "createInspect").mockImplementation((() => destroyable()) as never) as never);
  createKeys = spyOn(bindings, "createKeys").mockImplementation(
    (() => ({ ...destroyable(), recording: false, get: () => ({}) })) as never,
  );
  createPanel = spyOn(panel, "createPanel").mockImplementation((() => destroyable()) as never);
});

afterEach(async () => {
  devknobs.unmount();
  // A host's take-back looks in, a microtask on.
  await settle();
  for (const spy of [createKeys, createPanel, ...spies]) spy.mockRestore();
  Reflect.deleteProperty(globalThis, "window");
});

describe("a page copy under a host", () => {
  /** A host as the extension leaves one, its api noting the calls. */
  function host(api?: object) {
    const release = () => {};
    const adopted: object[] = [];
    claim(window, release, (options) => adopted.push(options), api);
    return { adopted, release };
  }

  test("hands the host its options and starts nothing of its own", () => {
    const { adopted } = host({});
    devknobs.mount({ hotkey: "j" });
    expect(adopted).toEqual([{ hotkey: "j" }]);
    expect(createPanel).not.toHaveBeenCalled();
    expect(createKeys).not.toHaveBeenCalled();
  });

  test("sends its module api's calls to the host's", async () => {
    const state = { ...DEFAULT_STATE, scheme: "dark" as const };
    const patches: object[] = [];
    const calls: string[] = [];
    host({
      getState: () => state,
      setState: (patch: object) => {
        patches.push(patch);
        return state;
      },
      ready: () => Promise.resolve(state),
      reset: () => calls.push("reset"),
      replay: () => calls.push("replay"),
      describe: () => [],
      grab: () => Promise.resolve(null),
    });
    devknobs.mount();
    expect(devknobs.setState({ scheme: "dark" })).toBe(state);
    expect(patches).toEqual([{ scheme: "dark" }]);
    expect(devknobs.getState()).toBe(state);
    expect(await devknobs.ready()).toBe(state);
    devknobs.reset();
    devknobs.replay();
    expect(calls).toEqual(["reset", "replay"]);
    expect(devknobs.describe()).toEqual([]);
    expect(await devknobs.grab()).toBeNull();
  });

  test("keeps its own api once the host lets go, or once it unmounts", async () => {
    const getState = () => ({ ...DEFAULT_STATE, scheme: "dark" as const });
    const first = host({ getState });
    devknobs.mount();
    expect(devknobs.getState().scheme).toBe("dark");
    free(window, first.release);
    expect(devknobs.getState().scheme).toBe("system");
    await expect(devknobs.ready()).rejects.toThrow();
    host({ getState });
    devknobs.unmount();
    expect(devknobs.getState().scheme).toBe("system");
  });

  test("with an older host that leaves no api, keeps its own", () => {
    host();
    devknobs.mount();
    expect(devknobs.getState().scheme).toBe("system");
  });
});

describe("a host", () => {
  test("takes a page copy's keys with a new panel, and stays when that copy goes", () => {
    devknobs.mount({ host: true });
    expect(createPanel).toHaveBeenCalledTimes(1);
    hostOf(window)?.adopt({ hotkey: "j", grabColor: "green" });
    expect(createKeys).toHaveBeenLastCalledWith({ hotkey: "j", grabKey: undefined, grab: true });
    expect(createPanel).toHaveBeenCalledTimes(2);
    expect(devknobs.getState().grabColor).toBe("green");
    expect(hostOf(window)?.api).toBe(window.devknobs);
  });

  test("takes the page back from a copy that knows no hosts three times, its switch kept, then warns once", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const setting = { label: "real", hint: "a bar", change: () => {} };
    const driven: unknown[] = [];
    devknobs.mount({ host: true, native: { setting, text: (value) => driven.push(value) } });
    devknobs.setNative(false, "closed");
    devknobs.setState({ text: 48 });
    driven.length = 0;
    let released = 0;
    // As 0.3.0 claims: the way out and nothing more, once each load of the page's own copy.
    const old = () => {
      const release = () => {
        released++;
        free(window, release);
      };
      claim(window, release);
      return release;
    };
    for (let i = 0; i < 3; i++) {
      old();
      await settle();
      expect(hostOf(window)?.release).toBe(devknobs.unmount);
    }
    expect(released).toBe(3);
    expect(engine.nativeSwitch()).toEqual({ setting, on: false, note: "closed" });
    // Off, the driver is never handed a knob, the size either: the page emulates them.
    expect(driven).toEqual([]);
    const last = old();
    await settle();
    expect(hostOf(window)).toBeNull();
    expect(owned(window)).toBe(true);
    expect(released).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toStartWith("devknobs:");
    last();
    warn.mockRestore();
  });
});

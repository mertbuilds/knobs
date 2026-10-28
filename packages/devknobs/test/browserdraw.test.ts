import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createBrowser, readLook, screenFill } from "../src/engine/browserdraw";
import type { Look } from "../src/engine/browserkit";
import { MORPH } from "../src/engine/browserkit";
import { barsOf, type Screen, viewportOf } from "../src/engine/browserui";
import { screenOf } from "../src/engine/devices";

const PRO = screenOf("iphone-17-pro") as Screen;
const WHITE = "rgb(255, 255, 255)";
const BLUE = "rgb(30, 91, 215)";
const RED = "rgb(224, 24, 45)";
const GREEN = "rgb(19, 165, 56)";
const DARK = "rgb(17, 17, 17)";

/** A node of the frame's page: its computed style, its parent and its box in the viewport. */
interface PageNode {
  style: { backgroundColor: string; position: string; colorScheme?: string };
  parentElement: PageNode | null;
  box: { top: number; bottom: number };
  getBoundingClientRect(): { top: number; bottom: number };
}

function node(backgroundColor: string, parent: PageNode | null, position = "static", box = { top: 0, bottom: 0 }): PageNode {
  return {
    style: { backgroundColor, position },
    parentElement: parent,
    box,
    getBoundingClientRect: () => box,
  };
}

/**
 * The frame's page: an html and a body, and what lies at each height of the
 * viewport, top first. `at` reads what is at `y`.
 */
function page(height: number, at: (y: number) => PageNode[], body = BLUE) {
  const html = node(body, null);
  const bodyNode = node(body, html);
  const scroll: (() => void)[] = [];
  const doc = {
    documentElement: html,
    body: bodyNode,
    elementFromPoint: (_x: number, y: number) => at(y)[0] ?? null,
    elementsFromPoint: (_x: number, y: number) => [...at(y), bodyNode, html],
  };
  const view = {
    innerWidth: 402,
    innerHeight: height,
    scrollY: 0,
    location: { host: "127.0.0.1:8765", href: "http://127.0.0.1:8765/" },
    history: { length: 1 },
    getComputedStyle: (target: PageNode) => target.style,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: (type: string, listener: () => void) => {
      if (type === "scroll") scroll.push(listener);
    },
    removeEventListener: () => {},
  };
  const frame = { contentWindow: view, contentDocument: doc, style: { background: "" } };
  return { frame: frame as unknown as HTMLIFrameElement, html, body: bodyNode, view, doc, scroll };
}

/** A blue page with a fixed red header 100 tall and, if asked, a fixed green footer 100 tall. */
function headerPage(height: number, footer: boolean) {
  let built: ReturnType<typeof page> | null = null;
  const parts: { header?: PageNode; footer?: PageNode } = {};
  built = page(height, (y) => {
    if (y < 100 && parts.header) return [parts.header];
    if (footer && y >= height - 100 && parts.footer) return [parts.footer];
    return [];
  });
  parts.header = node(RED, built.body, "fixed", { top: 0, bottom: 100 });
  parts.footer = node(GREEN, built.body, "fixed", { top: height - 100, bottom: height });
  return built;
}

describe("readLook", () => {
  test("a fixed bar across the top and the bottom gives the strip and the fill under the frame", () => {
    const { frame } = headerPage(714, true);
    const look = readLook(frame);
    expect(look.background).toBe(BLUE);
    expect(look.top).toBe(RED);
    expect(look.bottom).toBe(GREEN);
  });

  test("with no fixed bar at the bottom, the fill is the content at the page's bottom edge", () => {
    const dark = page(714, () => []);
    const wrapper = node(DARK, dark.body);
    Object.assign(dark.doc, {
      elementFromPoint: () => wrapper,
      elementsFromPoint: () => [wrapper, dark.body, dark.html],
    });
    dark.html.style.backgroundColor = WHITE;
    dark.body.style.backgroundColor = WHITE;
    const look = readLook(dark.frame);
    expect(look.background).toBe(WHITE);
    // The wrapper is not fixed: the strip keeps the body's color.
    expect(look.top).toBe(WHITE);
    expect(look.bottom).toBe(DARK);
  });

  test("a translucent bar or section shows what is under it", () => {
    const built = page(714, (y) => (y < 100 ? [veil] : y > 600 ? [glaze, wrapper] : []));
    const veil = node("rgba(224, 24, 45, 0.6)", built.body, "fixed", { top: 0, bottom: 100 });
    const wrapper = node(DARK, built.body);
    const glaze = node("rgba(255, 255, 255, 0.5)", wrapper);
    const look = readLook(built.frame);
    // 0.6 of red over the blue page, and half white over the dark wrapper.
    expect(look.top).toBe("rgb(146, 51, 113)");
    expect(look.bottom).toBe("rgb(136, 136, 136)");
  });

  test("a bar that does not touch the edge does not count", () => {
    const built = page(714, (y) => (y < 100 ? [floating] : []));
    const floating = node(RED, built.body, "fixed", { top: 20, bottom: 100 });
    expect(readLook(built.frame).top).toBe(BLUE);
  });

  test("samples above the page read the strip, below it the fill, inside it the content", () => {
    const { frame } = headerPage(714, true);
    const probe = {
      page: { x: 0, y: 62, width: 402, height: 714 },
      points: [
        { x: 201, y: 30 },
        { x: 201, y: 63 },
        { x: 201, y: 400 },
        { x: 201, y: 816 },
      ],
    };
    const colors = readLook(frame, probe).under.map((sample) => sample.color);
    expect(colors).toEqual([RED, RED, BLUE, GREEN]);
  });

  test("samples beside the page, in the Duo cover's column, read the page's own color", () => {
    const { frame } = headerPage(580, true);
    const probe = {
      page: { x: 0, y: 0, width: 382, height: 580 },
      points: [
        { x: 419.5, y: 50 },
        { x: 419.5, y: 622 },
        { x: 191, y: 622 },
      ],
    };
    const colors = readLook(frame, probe).under.map((sample) => sample.color);
    expect(colors).toEqual([BLUE, BLUE, GREEN]);
    const across = { ...probe, page: { x: 84, y: 0, width: 594, height: 368 }, points: [{ x: 46.5, y: 50 }] };
    expect(readLook(frame, across).under.map((sample) => sample.color)).toEqual([BLUE]);
  });
});

function look(over: Partial<Look> = {}): Look {
  return {
    background: WHITE,
    top: WHITE,
    bottom: WHITE,
    footer: false,
    under: [],
    dark: false,
    scheme: "light",
    host: "",
    canBack: false,
    canForward: false,
    ...over,
  };
}

describe("screenFill", () => {
  const expanded = barsOf(PRO, "portrait", "compact", false, true);
  const minimized = barsOf(PRO, "portrait", "compact", true, true);
  const pageOf = (mini: boolean) => viewportOf(PRO, "portrait", "compact", mini, true);
  if (!expanded || !minimized) throw new Error("no bars");

  test("one color where the strip, the page and the fill are all the page's", () => {
    expect(screenFill(look(), expanded, pageOf(false), 874)).toBe(WHITE);
  });

  test("the strip over the page and the fill under it, split at the page's edges", () => {
    const fill = screenFill(look({ top: RED, background: BLUE, bottom: GREEN }), expanded, pageOf(false), 874);
    const top = (62 / 874) * 100;
    const end = (776 / 874) * 100;
    expect(fill).toBe(
      `linear-gradient(to bottom, ${RED} ${top}%, ${BLUE} ${top}%, ${BLUE} ${end}%, ${GREEN} ${end}%)`,
    );
  });

  test("minimized, the strip shows the content at the page's top, unless a bar holds the top", () => {
    const under = [{ x: 201, y: 63, color: DARK }];
    const free = screenFill(look({ under }), minimized, pageOf(true), 874);
    expect(free.startsWith(`linear-gradient(to bottom, ${DARK} `)).toBe(true);
    const held = screenFill(look({ under, top: RED }), minimized, pageOf(true), 874);
    expect(held.startsWith(`linear-gradient(to bottom, ${RED} `)).toBe(true);
    // Expanded, the strip is the page's even over dark content.
    expect(screenFill(look({ under }), expanded, pageOf(false), 874)).toBe(WHITE);
  });

  test("turned across, or with no page, the page's color fills it all", () => {
    const across = barsOf(PRO, "landscape", "compact", false, true);
    if (!across) throw new Error("no bars");
    expect(screenFill(look({ top: RED }), across, pageOf(false), 402)).toBe(WHITE);
    expect(screenFill(look({ top: RED }), expanded, null, 874)).toBe(WHITE);
  });

  test("on the Duo's cover screen, the column takes the page's color all the way down, over the fill under the page", () => {
    const cover = screenOf("iphone-duo-closed") as Screen;
    const bars = barsOf(cover, "portrait", "compact", false);
    const at = viewportOf(cover, "portrait", "compact", false);
    if (!bars) throw new Error("no bars");
    const fill = screenFill(look({ top: RED, background: BLUE, bottom: GREEN }), bars, at, 678);
    const right = (at.width / 466) * 100;
    const end = (at.height / 678) * 100;
    expect(fill).toBe(
      `linear-gradient(to right, ${BLUE} 0%, transparent 0%, transparent ${right}%, ${BLUE} ${right}%), ` +
        `linear-gradient(to bottom, ${RED} 0%, ${BLUE} 0%, ${BLUE} ${end}%, ${GREEN} ${end}%)`,
    );
  });

  test("held across, the Duo's cover keeps the strip's color over its page, with no status", () => {
    const cover = screenOf("iphone-duo-closed") as Screen;
    const bars = barsOf(cover, "landscape", "compact", false);
    const at = viewportOf(cover, "landscape", "compact", false);
    if (!bars) throw new Error("no bars");
    const start = (80 / 466) * 100;
    expect(screenFill(look({ top: RED, background: BLUE, bottom: GREEN }), bars, at, 466)).toBe(
      `linear-gradient(to bottom, ${RED} ${start}%, ${BLUE} ${start}%, ${BLUE} 100%, ${GREEN} 100%)`,
    );
  });
});

/** Just enough of an element for the bars to be built and placed. */
class FakeElement {
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void } = Object.assign(
    Object.create(null) as Record<string, string>,
    { setProperty: () => {} },
  );
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  className = "";
  textContent = "";
  hidden = false;
  offsetWidth = 0;
  readonly classList = {
    add: () => {},
    toggle: () => {},
    contains: () => false,
  };

  setAttribute(): void {}
  removeAttribute(): void {}
  addEventListener(): void {}
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }
  remove(): void {}
  querySelectorAll(): FakeElement[] {
    return [];
  }
  getAnimations(): never[] {
    return [];
  }
}

interface Timer {
  id: number;
  delay: number;
  run: () => void;
}

let timers: Timer[];
/** The animation frames asked for and not yet run or cancelled, by id. */
let frames: Map<number, () => void>;
let cleared: number[];
let clearSpy: { mockRestore(): void } | null = null;
const saved = { window: globalThis.window, document: globalThis.document };

beforeEach(() => {
  timers = [];
  frames = new Map();
  cleared = [];
  let next = 1;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: (run: () => void, delay: number) => {
        const id = next++;
        timers.push({ id, delay, run });
        return id;
      },
      requestAnimationFrame: (run: () => void) => {
        const id = next++;
        frames.set(id, run);
        return id;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => (tag === "canvas" ? { getContext: () => null } : new FakeElement()),
      createElementNS: () => new FakeElement(),
    },
  });
  clearSpy = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) => {
    cleared.push(id);
    timers = timers.filter((timer) => timer.id !== id);
  }) as typeof clearTimeout);
});

afterEach(() => {
  clearSpy?.mockRestore();
  Object.defineProperty(globalThis, "window", { configurable: true, value: saved.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: saved.document });
});

/** The bars over a page that changes color as it scrolls, the frame's box each time it is given one. */
function browserOver(color: () => string) {
  const built = page(754, () => [], BLUE);
  const section = node(BLUE, built.body);
  Object.assign(built.doc, {
    elementsFromPoint: () => [Object.assign(section, { style: { ...section.style, backgroundColor: color() } })],
  });
  const sized: number[] = [];
  const glass = new FakeElement();
  const browser = createBrowser(glass as unknown as HTMLElement, built.frame, () => {});
  const show = (
    minimized: boolean,
    platform: "iphone-17-pro" | "pixel-10" = "iphone-17-pro",
    layout: "compact" | "top" = platform === "pixel-10" ? "top" : "compact",
  ) => {
    const screen = screenOf(platform) as Screen;
    const box = viewportOf(screen, "portrait", layout, minimized, true);
    browser.show({
      bars: barsOf(screen, "portrait", layout, minimized, true),
      page: box,
      size: { width: screen.width, height: screen.height },
      zoom: 1,
      follow: true,
      sizeFrame: () => {
        built.view.innerHeight = box.height;
        sized.push(box.height);
      },
    });
  };
  const scroll = () => {
    for (const listener of built.scroll) listener();
    const pending = [...frames.values()];
    frames.clear();
    for (const run of pending) run();
  };
  return { browser, show, scroll, sized, glass, view: built.view };
}

const shrinks = () => timers.filter((timer) => timer.delay === MORPH.expand);

describe("createBrowser", () => {
  test("a page changing color under the glass leaves a pending shrink to land", () => {
    let color = BLUE;
    const { browser, show, scroll, sized } = browserOver(() => color);
    show(true);
    expect(sized.at(-1)).toBe(754);
    show(false);
    // The bars come back: the frame waits for them before it shrinks.
    expect(sized.at(-1)).toBe(754);
    const [pending] = shrinks();
    expect(pending).toBeDefined();
    for (const next of [RED, GREEN, DARK]) {
      color = next;
      scroll();
    }
    browser.refresh();
    expect(browser.look()?.under.some((sample) => sample.color === DARK)).toBe(true);
    // The same wait is still there, never restarted.
    expect(shrinks()).toEqual(pending ? [pending] : []);
    expect(cleared).not.toContain(pending?.id);
    pending?.run();
    expect(sized.at(-1)).toBe(714);
  });

  test("a scroll repaints only for a change, and never while a page loads or under Chrome", () => {
    let color = BLUE;
    const { browser, show, scroll, glass } = browserOver(() => color);
    show(false);
    const first = browser.look();
    scroll();
    expect(browser.look()).toBe(first);
    color = RED;
    browser.startLoading(null);
    scroll();
    expect(browser.look()).toBe(first);
    browser.stopLoading();
    // Done loading, nothing waits for the page to paint any more.
    expect(frames.size).toBe(0);
    const loaded = browser.look();
    color = GREEN;
    scroll();
    expect(browser.look()).not.toBe(loaded);
    expect(glass.style.background).toBeDefined();
    show(false, "pixel-10");
    const chrome = browser.look();
    color = DARK;
    scroll();
    expect(browser.look()).toBe(chrome);
  });

  test("top bars that minimize or expand scroll the page as far as its top moves, so it stays put", () => {
    const { show, view } = browserOver(() => BLUE);
    const scrolled: number[] = [];
    Object.assign(view, { scrollY: 300, scrollBy: ({ top }: { top: number }) => scrolled.push(top) });
    const top = (minimized: boolean) => viewportOf(PRO, "portrait", "top", minimized, true).y;
    show(false, "iphone-17-pro", "top");
    expect(scrolled).toEqual([]);
    show(true, "iphone-17-pro", "top");
    // Minimized, the frame grows up at once, and the page scrolls up as far.
    expect(scrolled).toEqual([top(true) - top(false)]);
    expect(scrolled[0]).toBeLessThan(0);
    show(false, "iphone-17-pro", "top");
    for (const timer of shrinks()) timer.run();
    expect(scrolled.at(-1)).toBe(top(false) - top(true));
    // At the top of the page the bars come back above it, which shows from its start.
    show(true, "iphone-17-pro", "top");
    view.scrollY = 0;
    const count = scrolled.length;
    show(false, "iphone-17-pro", "top");
    for (const timer of shrinks()) timer.run();
    expect(scrolled.length).toBe(count);
  });

  test("bars at the bottom never scroll the page, as its top stays", () => {
    const { show, view } = browserOver(() => BLUE);
    const scrolled: number[] = [];
    Object.assign(view, { scrollBy: ({ top }: { top: number }) => scrolled.push(top) });
    show(false);
    show(true);
    show(false);
    for (const timer of shrinks()) timer.run();
    expect(scrolled).toEqual([]);
  });
});

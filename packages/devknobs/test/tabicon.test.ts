import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { IconSource } from "../src/engine/devicon";
import { ADDED_ICON, createTabIcon, ORIGINAL_HREF, type TabIcon } from "../src/engine/tabicon";

/**
 * A head of links that tells its observers what changes, as a page's does:
 * a write of a watched attribute, a link put in or taken out. The records
 * arrive on a microtask, as the browser's do.
 */
class Head {
  links: Link[] = [];
  observers: Observer[] = [];

  notify(record: object): void {
    for (const observer of this.observers) observer.queue(record);
  }

  append(link: Link): void {
    link.head = this;
    this.links.push(link);
    this.notify({ type: "childList", addedNodes: [link], removedNodes: [] });
  }
}

class Link {
  readonly nodeType = 1;
  readonly localName = "link";
  head: Head | null = null;
  attrs = new Map<string, string>();

  constructor(attrs: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(attrs)) this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    this.head?.notify({ type: "attributes", target: this, attributeName: name });
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  remove(): void {
    const head = this.head;
    if (!head) return;
    head.links = head.links.filter((link) => link !== this);
    this.head = null;
    head.notify({ type: "childList", addedNodes: [], removedNodes: [this] });
  }

  querySelectorAll(): Link[] {
    return [];
  }
}

const WATCHED = ["href", "rel", "sizes"];

class Observer {
  pending: object[] = [];
  connected = false;

  constructor(
    readonly head: Head,
    readonly callback: (records: object[]) => void,
  ) {}

  observe(): void {
    this.connected = true;
    this.head.observers.push(this);
  }

  disconnect(): void {
    this.connected = false;
    this.pending = [];
    this.head.observers = this.head.observers.filter((one) => one !== this);
  }

  queue(record: object): void {
    if (Reflect.get(record, "type") === "attributes" && !WATCHED.includes(Reflect.get(record, "attributeName"))) return;
    if (this.pending.push(record) > 1) return;
    queueMicrotask(() => {
      const records = this.pending;
      this.pending = [];
      if (this.connected && records.length) this.callback(records);
    });
  }
}

/** A source that remembers where it was loaded from. */
type Loaded = IconSource & { href: string };

interface Page {
  head: Head;
  icon: TabIcon;
  /** Every address loaded, in order. */
  loads: string[];
  observer(): Observer | undefined;
}

/**
 * A page with these links, whose loads of the addresses in `broken` fail
 * and whose render is the address and the size, so a test reads both off
 * the link.
 */
function page(links: Link[], broken: string[] = []): Page {
  const head = new Head();
  for (const link of links) head.append(link);
  const loads: string[] = [];
  let made: Observer | undefined;
  const doc = {
    head,
    documentElement: head,
    querySelectorAll: () => [...head.links],
    createElement: () => new Link(),
  };
  const icon = createTabIcon({
    document: doc as unknown as Document,
    load: async (href) => {
      loads.push(href);
      return broken.includes(href) ? null : ({ width: 64, height: 64, href } as unknown as Loaded);
    },
    render: (source, size) => `data:image/png;base64,${(source as Loaded).href}@${size}`,
    Observer: class {
      constructor(callback: (records: object[]) => void) {
        made = new Observer(head, callback);
        return made as unknown as object;
      }
    } as unknown as typeof MutationObserver,
  });
  return { head, icon, loads, observer: () => made };
}

/** Let the loads and the observer's records run their course. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

const png = (href: string, size: number) => `data:image/png;base64,${href}@${size}`;

let running: TabIcon | null = null;
afterEach(() => {
  running?.stop();
  running = null;
});

describe("the dev ribbon on the page's icons", () => {
  test("draws every icon link, each at its size, and keeps its address", async () => {
    const icon = new Link({ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" });
    const sized = new Link({ rel: "icon", sizes: "16x16", href: "/favicon-16.png" });
    const shortcut = new Link({ rel: "shortcut icon", href: "/favicon.ico" });
    const touch = new Link({ rel: "apple-touch-icon", href: "/apple-touch-icon.png" });
    const style = new Link({ rel: "stylesheet", href: "/app.css" });
    const mask = new Link({ rel: "mask-icon", href: "/mask.svg" });
    const at = page([icon, sized, shortcut, touch, style, mask]);
    running = at.icon;
    at.icon.start();
    await settle();
    expect(icon.getAttribute("href")).toBe(png("/favicon.svg", 32));
    expect(sized.getAttribute("href")).toBe(png("/favicon-16.png", 16));
    expect(shortcut.getAttribute("href")).toBe(png("/favicon.ico", 32));
    expect(touch.getAttribute("href")).toBe(png("/apple-touch-icon.png", 180));
    expect(touch.getAttribute(ORIGINAL_HREF)).toBe("/apple-touch-icon.png");
    expect(style.getAttribute("href")).toBe("/app.css");
    expect(mask.getAttribute("href")).toBe("/mask.svg");
  });

  test("its own writes start no new draw", async () => {
    const at = page([new Link({ rel: "icon", href: "/a.png" }), new Link({ rel: "apple-touch-icon", href: "/b.png" })]);
    running = at.icon;
    at.icon.start();
    await settle();
    await settle();
    expect(at.loads).toEqual(["/a.png", "/b.png"]);
  });

  test("off, every link has its own address back, and the head is no longer watched", async () => {
    const icon = new Link({ rel: "icon", href: "https://cdn.example.com/icon.png?v=3" });
    const touch = new Link({ rel: "apple-touch-icon", href: "/apple-touch-icon.png" });
    const at = page([icon, touch]);
    at.icon.start();
    await settle();
    at.icon.stop();
    expect(icon.getAttribute("href")).toBe("https://cdn.example.com/icon.png?v=3");
    expect(touch.getAttribute("href")).toBe("/apple-touch-icon.png");
    expect(icon.hasAttribute(ORIGINAL_HREF)).toBe(false);
    expect(at.observer()?.connected).toBe(false);
    at.head.append(new Link({ rel: "icon", href: "/later.png" }));
    await settle();
    expect(at.loads).not.toContain("/later.png");
  });

  test("draws the links a framework puts in on a navigation, and the address it gives one", async () => {
    const icon = new Link({ rel: "icon", href: "/home.png" });
    const at = page([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    // The router swaps the head's icon for its own.
    icon.remove();
    const next = new Link({ rel: "icon", href: "/docs.png" });
    at.head.append(next);
    await settle();
    expect(next.getAttribute("href")).toBe(png("/docs.png", 32));
    // Or points the one it kept somewhere else.
    next.setAttribute("href", "/blog.png");
    await settle();
    expect(next.getAttribute("href")).toBe(png("/blog.png", 32));
    at.icon.stop();
    running = null;
    expect(next.getAttribute("href")).toBe("/blog.png");
  });

  test("draws a link again from its own address when its size changes", async () => {
    const icon = new Link({ rel: "icon", href: "/icon.png" });
    const at = page([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    icon.setAttribute("sizes", "64x64");
    await settle();
    expect(icon.getAttribute("href")).toBe(png("/icon.png", 64));
    expect(at.loads).toEqual(["/icon.png", "/icon.png"]);
  });

  test("leaves an icon it cannot read as it is, and says so once", async () => {
    const debug = spyOn(console, "debug").mockImplementation(() => {});
    const a = new Link({ rel: "icon", href: "https://other.example/a.png" });
    const b = new Link({ rel: "apple-touch-icon", href: "https://other.example/b.png" });
    const at = page([a, b], ["https://other.example/a.png", "https://other.example/b.png"]);
    running = at.icon;
    at.icon.start();
    await settle();
    expect(a.getAttribute("href")).toBe("https://other.example/a.png");
    expect(b.hasAttribute(ORIGINAL_HREF)).toBe(false);
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  test("turned off before a load is in, writes nothing", async () => {
    const icon = new Link({ rel: "icon", href: "/icon.png" });
    const at = page([icon]);
    at.icon.start();
    at.icon.stop();
    await settle();
    expect(icon.getAttribute("href")).toBe("/icon.png");
  });

  test("a page with no icon link gets its /favicon.ico, drawn, and loses it when off", async () => {
    const at = page([]);
    at.icon.start();
    await settle();
    const [added] = at.head.links;
    expect(added?.hasAttribute(ADDED_ICON)).toBe(true);
    expect(added?.getAttribute(ORIGINAL_HREF)).toBe("/favicon.ico");
    expect(added?.getAttribute("href")).toBe(png("/favicon.ico", 32));
    at.icon.stop();
    expect(at.head.links).toEqual([]);
  });

  test("adds no link where the page has no /favicon.ico either", async () => {
    const at = page([], ["/favicon.ico"]);
    running = at.icon;
    at.icon.start();
    await settle();
    expect(at.head.links).toEqual([]);
  });

  test("takes its own link out once the page puts an icon in", async () => {
    const at = page([]);
    running = at.icon;
    at.icon.start();
    await settle();
    const own = new Link({ rel: "icon", href: "/own.png" });
    at.head.append(own);
    await settle();
    expect(at.head.links).toEqual([own]);
    expect(own.getAttribute("href")).toBe(png("/own.png", 32));
  });
});

interface SlowPage {
  head: Head;
  icon: TabIcon;
  /** Every address loaded, in order. */
  loads: string[];
  /** Let the first pending load of an address finish. */
  resolve(href: string): Promise<void>;
}

/** A page whose loads wait until the test lets each one in. */
function slowPage(links: Link[]): SlowPage {
  const head = new Head();
  for (const link of links) head.append(link);
  const pending: { href: string; done: () => void }[] = [];
  const loads: string[] = [];
  const doc = {
    head,
    documentElement: head,
    querySelectorAll: () => [...head.links],
    createElement: () => new Link(),
  };
  const icon = createTabIcon({
    document: doc as unknown as Document,
    load: (href) =>
      new Promise((done) => {
        loads.push(href);
        pending.push({ href, done: () => done({ width: 64, height: 64, href } as unknown as Loaded) });
      }),
    render: (source, size) => png((source as Loaded).href, size),
    Observer: class {
      constructor(callback: (records: object[]) => void) {
        return new Observer(head, callback) as unknown as object;
      }
    } as unknown as typeof MutationObserver,
  });
  return {
    head,
    icon,
    loads,
    async resolve(href) {
      const at = pending.findIndex((one) => one.href === href);
      expect(at).toBeGreaterThanOrEqual(0);
      const [one] = pending.splice(at, 1);
      one?.done();
      await settle();
    },
  };
}

describe("the dev ribbon while icons load", () => {
  test("a link pointed elsewhere while it loads gets the new address's ribbon, and keeps that address when off", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = slowPage([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    icon.setAttribute("href", "/b.png");
    await settle();
    await at.resolve("/b.png");
    await at.resolve("/a.png");
    expect(icon.getAttribute("href")).toBe(png("/b.png", 32));
    expect(icon.getAttribute(ORIGINAL_HREF)).toBe("/b.png");
    at.icon.stop();
    running = null;
    expect(icon.getAttribute("href")).toBe("/b.png");
  });

  test("the old load coming in last starts no second load of the new address", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = slowPage([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    icon.setAttribute("href", "/b.png");
    await settle();
    await at.resolve("/a.png");
    icon.setAttribute("sizes", "64x64");
    await settle();
    expect(at.loads).toEqual(["/a.png", "/b.png"]);
    await at.resolve("/b.png");
    expect(icon.getAttribute("href")).toBe(png("/b.png", 64));
  });

  test("a link that stops being an icon while it loads keeps the page's address", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = slowPage([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    icon.setAttribute("rel", "stylesheet");
    icon.setAttribute("href", "/app.css");
    await settle();
    await at.resolve("/a.png");
    expect(icon.getAttribute("href")).toBe("/app.css");
    expect(icon.hasAttribute(ORIGINAL_HREF)).toBe(false);
  });

  test("a drawn link the page points elsewhere keeps the page's address when off, its load still out", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = slowPage([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    await at.resolve("/a.png");
    expect(icon.getAttribute("href")).toBe(png("/a.png", 32));
    icon.setAttribute("href", "/c.png");
    await settle();
    at.icon.stop();
    running = null;
    expect(icon.getAttribute("href")).toBe("/c.png");
  });

  test("a link taken out while it loads has its own address back when off", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = slowPage([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    icon.remove();
    await at.resolve("/a.png");
    at.icon.stop();
    running = null;
    expect(icon.getAttribute("href")).toBe("/a.png");
    expect(icon.hasAttribute(ORIGINAL_HREF)).toBe(false);
  });

  test("a drawn link taken out of the page has its own address back at once", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = page([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    expect(icon.getAttribute("href")).toBe(png("/a.png", 32));
    icon.remove();
    await settle();
    expect(icon.getAttribute("href")).toBe("/a.png");
    expect(icon.hasAttribute(ORIGINAL_HREF)).toBe(false);
  });

  test("a drawn link that stops being an icon has its own address back", async () => {
    const icon = new Link({ rel: "icon", href: "/a.png" });
    const at = page([icon]);
    running = at.icon;
    at.icon.start();
    await settle();
    icon.setAttribute("rel", "preload");
    await settle();
    expect(icon.getAttribute("href")).toBe("/a.png");
    expect(icon.hasAttribute(ORIGINAL_HREF)).toBe(false);
  });
});

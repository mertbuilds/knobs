import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BURST, BURST_SPAN, CALM, createGuard, keepMounted, LONGEST_WAIT } from "../src/engine/remount";

describe("createGuard", () => {
  test("puts a node back at once for a burst", () => {
    const guard = createGuard();
    for (let i = 0; i < BURST; i++) expect(guard.next(i)).toBe(0);
  });

  test("waits longer each time past the burst, up to the longest", () => {
    const guard = createGuard();
    for (let i = 0; i < BURST; i++) guard.next(i);
    const waits: number[] = [];
    let now = BURST;
    for (let i = 0; i < 6; i++) {
      const wait = guard.next(now);
      waits.push(wait);
      now += wait;
    }
    expect(waits).toEqual([BURST_SPAN, BURST_SPAN * 2, BURST_SPAN * 4, LONGEST_WAIT, LONGEST_WAIT, LONGEST_WAIT]);
  });

  test("keeps backing off while the page keeps at it, even past the burst's span", () => {
    const guard = createGuard();
    for (let i = 0; i <= BURST; i++) guard.next(i);
    expect(guard.next(BURST_SPAN * 3)).toBeGreaterThan(0);
  });

  test("a calm page gets its node back at once again", () => {
    const guard = createGuard();
    for (let i = 0; i <= BURST; i++) guard.next(i);
    expect(guard.next(BURST + CALM)).toBe(0);
  });
});

/** A page with just what `keepMounted` reads: parents, `isConnected` and mutation observers. */
class Node {
  parentNode: Node | null = null;
  children: Node[] = [];
  constructor(readonly name: string) {}
  get isConnected(): boolean {
    let at: Node | null = this;
    while (at.parentNode) at = at.parentNode;
    return at === doc;
  }
  appendChild(child: Node): Node {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    notify(this);
    return child;
  }
  removeChild(child: Node): Node {
    this.children = this.children.filter((one) => one !== child);
    child.parentNode = null;
    notify(this);
    return child;
  }
}

class Doc extends Node {
  get documentElement(): Node {
    return html;
  }
  get body(): Node | null {
    return html.children.find((one) => one.name === "BODY") ?? null;
  }
}

let doc: Doc;
let html: Node;
let body: Node;
let observers: Observer[] = [];
let timers: (() => void)[] = [];
let clock = 0;

class Observer {
  targets = new Set<Node>();
  queued = false;
  constructor(readonly callback: () => void) {
    observers.push(this);
  }
  observe(target: Node): void {
    this.targets.add(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
}

function notify(target: Node): void {
  for (const observer of observers) {
    if (!observer.targets.has(target) || observer.queued) continue;
    observer.queued = true;
    queueMicrotask(() => {
      observer.queued = false;
      observer.callback();
    });
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const saved = { ...globalThis };

beforeEach(() => {
  doc = new Doc("#document");
  html = doc.appendChild(new Node("HTML"));
  body = html.appendChild(new Node("BODY"));
  observers = [];
  timers = [];
  clock = 0;
  Object.assign(globalThis, {
    MutationObserver: Observer,
    document: doc,
    performance: { now: () => clock },
    window: {
      setTimeout: (run: () => void) => timers.push(run),
    },
  });
});

afterEach(() => {
  Object.assign(globalThis, {
    document: saved.document,
    MutationObserver: saved.MutationObserver,
    performance: saved.performance,
    window: saved.window,
  });
});

function keep(node: Node, options?: Parameters<typeof keepMounted>[1]): () => void {
  return keepMounted(node as unknown as Element, options);
}

describe("keepMounted", () => {
  test("puts a node the page took out back in the body", async () => {
    const panel = body.appendChild(new Node("DIV"));
    let restored = 0;
    keep(panel, { restored: () => restored++ });
    body.removeChild(panel);
    await settle();
    expect(panel.parentNode).toBe(body);
    expect(restored).toBe(1);
  });

  test("follows a body the page replaced", async () => {
    const panel = body.appendChild(new Node("DIV"));
    keep(panel);
    html.removeChild(body);
    const next = html.appendChild(new Node("BODY"));
    await settle();
    expect(panel.parentNode).toBe(next);
  });

  test("follows a node moved on purpose, and keeps it there", async () => {
    body.parentNode?.removeChild(body);
    const panel = html.appendChild(new Node("DIV"));
    keep(panel);
    const late = html.appendChild(new Node("BODY"));
    late.appendChild(panel);
    await settle();
    late.removeChild(panel);
    await settle();
    expect(panel.parentNode).toBe(late);
  });

  test("leaves a node alone once stopped", async () => {
    const panel = body.appendChild(new Node("DIV"));
    const stop = keep(panel);
    stop();
    body.removeChild(panel);
    await settle();
    expect(panel.parentNode).toBeNull();
  });

  test("a page that keeps taking it out gets it back later, and one warning", async () => {
    const panel = body.appendChild(new Node("DIV"));
    const warnings: unknown[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      keep(panel);
      for (let i = 0; i < BURST; i++) {
        body.removeChild(panel);
        await settle();
        expect(panel.parentNode).toBe(body);
      }
      body.removeChild(panel);
      await settle();
      expect(panel.parentNode).toBeNull();
      expect(timers).toHaveLength(1);
      timers.shift()?.();
      expect(panel.parentNode).toBe(body);
      body.removeChild(panel);
      await settle();
      expect(timers).toHaveLength(1);
      expect(warnings).toHaveLength(1);
    } finally {
      console.warn = warn;
    }
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { grab } from "../src/grab";

/** An element with no fiber, and a document that finds it by its test id. */
function plain(tag: string, testId: string, text: string): Element {
  const attrs: Record<string, string> = { "data-testid": testId };
  const doc = {
    scripts: [],
    baseURI: "http://localhost/",
    body: null,
    documentElement: null,
    defaultView: null,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector: string) => (selector.includes(testId) ? [element] : []),
  };
  const element = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: doc,
    attributes: [{ name: "data-testid", value: testId }],
    childNodes: [{ nodeType: 3, textContent: text }],
    children: [],
    parentElement: null,
    parentNode: null,
    assignedSlot: null,
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
    getRootNode: () => doc,
    matches: (query: string) => query.includes("[data-testid]"),
    getElementsByTagName: () => [],
  };
  return element as unknown as Element;
}

/** A text node, which a caller may hand in where an element belongs. */
function textNode(text: string): Element {
  return { nodeType: 3, textContent: text } as unknown as Element;
}

describe("grab", () => {
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  /** A page whose copy command and clipboard api work or fail as `copies` says. */
  function setGlobals(copies: boolean): void {
    const textarea = { value: "", style: {}, setAttribute() {}, select() {}, remove() {} };
    const doc = {
      body: { append() {} },
      createElement: () => textarea,
      addEventListener() {},
      removeEventListener() {},
      execCommand: () => copies,
    };
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: async () => {
            if (!copies) throw new Error("denied");
          },
        },
      },
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
    if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
  });

  test("hands back the payload when the copy works", async () => {
    setGlobals(true);
    const result = await grab([plain("button", "save", "Save")]);
    expect(result?.copied).toBe(true);
    expect(result?.content).toBe(
      '[<button data-testid="save">Save</button> selector: [data-testid="save"]]',
    );
  });

  test("hands back the payload when the copy fails, marked not copied", async () => {
    setGlobals(false);
    const result = await grab([plain("button", "save", "Save")]);
    expect(result?.copied).toBe(false);
    expect(result?.entries.map((entry) => entry.tagName)).toEqual(["button"]);
  });

  test("is null when there is nothing to grab", async () => {
    setGlobals(true);
    expect(await grab([])).toBeNull();
  });

  test("skips what is not an element, and is null when nothing is left", async () => {
    setGlobals(true);
    expect(await grab([null, undefined])).toBeNull();
    expect(await grab([textNode("x")])).toBeNull();
    const result = await grab([null, plain("button", "save", "Save"), undefined]);
    expect(result?.entries.map((entry) => entry.tagName)).toEqual(["button"]);
  });

  test("takes one element as a list of one, and is null with none", async () => {
    setGlobals(true);
    const result = await grab(plain("button", "save", "Save"));
    expect(result?.entries.map((entry) => entry.tagName)).toEqual(["button"]);
    expect(await grab()).toBeNull();
    expect(await grab(undefined)).toBeNull();
    expect(await grab(null)).toBeNull();
    expect(await grab(textNode("x"))).toBeNull();
  });

  test("takes a NodeList, and is null for what is not a list", async () => {
    setGlobals(true);
    const button = plain("button", "save", "Save");
    const nodeList = {
      0: button,
      length: 1,
      item: () => button,
      *[Symbol.iterator]() {
        yield button;
      },
    };
    const result = await grab(nodeList);
    expect(result?.entries.map((entry) => entry.tagName)).toEqual(["button"]);
    for (const value of [5, {}, "h1", globalThis]) {
      expect(await Reflect.apply(grab, undefined, [value])).toBeNull();
    }
  });
});

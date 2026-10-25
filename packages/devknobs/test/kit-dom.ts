/** A small page, with just what the panel's rows, heads and view controls build and drive. */

type Listener = (event: FakeEvent) => void;

/** An event as the fake page sends one. */
export interface FakeEvent {
  type: string;
  target: FakeNode;
  key?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** Whether a listener took the event's default away. */
  prevented: boolean;
  preventDefault(): void;
  /** Whether a listener kept the event from going on to the next node. */
  stopped: boolean;
  stopPropagation(): void;
}

/** Whether a listener hears an event on its way down, before the node it was sent to. */
type ListenOptions = boolean | { capture?: boolean };

function capturing(options?: ListenOptions): boolean {
  return typeof options === "boolean" ? options : options?.capture === true;
}

/** What has the focus in the fake page. */
let active: FakeNode | null = null;

export function focused(): FakeNode | null {
  return active;
}

/** A node's inline style, the custom properties set on it. */
class FakeStyle {
  transform = "";
  properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }

  removeProperty(name: string): void {
    this.properties.delete(name);
  }
}

export class FakeNode {
  className = "";
  textContent = "";
  type = "";
  title = "";
  value = "";
  placeholder = "";
  autocomplete = "";
  spellcheck = true;
  tabIndex = 0;
  hidden = false;
  inert = false;
  rows = 0;
  scrollTop = 0;
  isConnected = true;
  shadowRoot = null;
  dataset: Record<string, string> = {};
  style = new FakeStyle();
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  captures = new Map<string, Set<Listener>>();
  classList = {
    contains: (name: string) => this.classes().includes(name),
    add: (name: string) => this.classList.toggle(name, true),
    remove: (name: string) => this.classList.toggle(name, false),
    toggle: (name: string, on?: boolean) => {
      const rest = this.classes().filter((entry) => entry !== name);
      const next = on ?? rest.length === this.classes().length;
      this.className = (next ? [...rest, name] : rest).join(" ");
      return next;
    },
  };

  constructor(readonly tag: string) {}

  classes(): string[] {
    return this.className.split(" ").filter((name) => name !== "");
  }

  append(...nodes: (FakeNode | string)[]): void {
    for (const node of nodes) {
      if (typeof node === "string") this.textContent += node;
      else {
        this.children.push(node);
        node.parent = this;
      }
    }
  }

  replaceChildren(...nodes: FakeNode[]): void {
    this.children = [...nodes];
    for (const node of nodes) node.parent = this;
  }

  /** Put a node before another of this one's, or last, taking it from where it stood here. */
  insertBefore(node: FakeNode, before: FakeNode | null): void {
    this.children = this.children.filter((child) => child !== node);
    const at = before ? this.children.indexOf(before) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    node.parent = this;
  }

  removeChild(node: FakeNode): void {
    this.children = this.children.filter((child) => child !== node);
    node.parent = null;
  }

  /** A fake node holds no pointer: a touch there takes none. */
  hasPointerCapture(): boolean {
    return false;
  }

  releasePointerCapture(): void {}

  /** The node at the top of the tree this one stands in. */
  getRootNode(): FakeNode {
    return this.parent ? this.parent.getRootNode() : this;
  }

  getClientRects(): unknown[] {
    return [{}];
  }

  /** All the text under this node, in the order it stands. */
  text(): string {
    return [this.textContent, ...this.children.map((child) => child.text())].join(" ").trim();
  }

  contains(node: FakeNode): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }

  setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener, options?: ListenOptions): void {
    const all = capturing(options) ? this.captures : this.listeners;
    const set = all.get(type) ?? new Set();
    set.add(listener);
    all.set(type, set);
  }

  removeEventListener(type: string, listener: Listener, options?: ListenOptions): void {
    (capturing(options) ? this.captures : this.listeners).get(type)?.delete(listener);
  }

  /**
   * Send an event here. It is heard on its way down the tree by the nodes
   * that capture it, then here and up the tree, as one that bubbles is.
   */
  fire(type: string, more: Partial<FakeEvent> = {}, root?: FakeNode): FakeEvent {
    const event: FakeEvent = {
      type,
      target: this,
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
      stopped: false,
      stopPropagation() {
        event.stopped = true;
      },
      ...more,
    };
    const path = root ? pathTo(root, this) : [this];
    const heard = [
      ...path.map((node) => node.captures),
      ...[...path].reverse().map((node) => node.listeners),
    ];
    for (const listeners of heard) {
      if (event.stopped) break;
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    }
    return event;
  }

  focus(): void {
    active = this;
  }

  /** The nodes under this one a class selector finds, as `.items` is. */
  querySelectorAll(selector: string): FakeNode[] {
    return this.children.flatMap((child) => child.find(selector.replace(/^\./, "")));
  }

  querySelector(selector: string): FakeNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /** Every node under this one with a class, itself included, in the order they stand. */
  find(className: string): FakeNode[] {
    const own = this.classes().includes(className) ? [this] : [];
    return [...own, ...this.children.flatMap((child) => child.find(className))];
  }
}

/** The nodes from `root` down to `node`, or the node alone where it is not under the root. */
function pathTo(root: FakeNode, node: FakeNode): FakeNode[] {
  if (root === node) return [root];
  for (const child of root.children) {
    const path = pathTo(child, node);
    if (path[path.length - 1] === node && path[0] === child) return [root, ...path];
  }
  return [node];
}

export function fake(node: unknown): FakeNode {
  if (!(node instanceof FakeNode)) throw new Error("not a fake node");
  return node;
}

const GLOBALS = ["document", "HTMLElement"];

/** Put a page up for a test to build in, with nothing focused. */
export function page(): void {
  active = null;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => new FakeNode(tag),
      createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      get activeElement(): FakeNode | null {
        return active;
      },
    },
  });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeNode });
}

/** Take the page down again. */
export function leave(): void {
  active = null;
  for (const name of GLOBALS) Reflect.deleteProperty(globalThis, name);
}

interface Rule {
  selector: string;
  body: string;
}

/** Every rule in a stylesheet. At-rules fall away and leave the rules inside. */
export function rules(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    body: match[2] ?? "",
  }));
}

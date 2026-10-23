/**
 * The DOM tree of the elements view, as the browsers' own Elements panel
 * shows it: a line for each node, `<tag attr="value">` in its colors, a
 * triangle on what opens, text in quotes, comments, the doctype, an open
 * shadow root, and the `::marker`, `::before` and `::after` that have
 * content. An open element ends on a line of its own, `</tag>`, and a closed
 * one in the same line, after a `…`. devknobs' own nodes are never in it.
 *
 * It costs what shows of it. What a node holds is read the first time the
 * node opens, nothing is walked but the way down to the node revealed, and
 * past `CHILD_CAP` children a line says how many more there are, which shows
 * them all. Only the lines that show are built, each once, and built again
 * when its node changes. One observer watches what shows, and a node that
 * changed lights for a moment. To use it:
 *
 *   const tree = createDomTree({ outline, select, copy });
 *   body.append(tree.node); tree.reveal(element); tree.destroy();
 */

import { el } from "./dom";
import { icon } from "./icons";
import { actButton } from "./kit";
import { middle } from "./stylesformat";

const ELEMENT = 1;
const TEXT = 3;
const COMMENT = 8;
const DOCUMENT = 9;
const DOCTYPE = 10;
const FRAGMENT = 11;

/** How many children of a node show before the line that shows the rest, as in the browser's tools. */
export const CHILD_CAP = 500;

/** The longest text that stands inside its element's line, as in the browser's tools. */
export const INLINE_MAX = 80;

/** The most characters an attribute's value and a data url show, cut in the middle. */
export const VALUE_MAX = 100;
export const DATA_URL_MAX = 60;

/** The most characters a text or a comment shows, cut at the end. */
export const TEXT_MAX = 200;

/** How long the page is left to settle before the lines are built again after a change, in ms. */
export const SETTLE = 100;

/** The pseudo-elements a line is shown for, in the tree's order: the marker and before ahead of the children, after behind them. */
export const PSEUDOS = ["::marker", "::before", "::after"] as const;

/** Tags with no end tag. */
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** What the tree reads of the page beyond its nodes, so a test can stand in for it. */
export interface TreePage {
  /** The pseudo-elements of an element that have content, of `PSEUDOS`. */
  pseudos(element: Element): string[];
}

/** Whether a pseudo-element's content draws something. */
function hasContent(content: string): boolean {
  return content !== "" && content !== "none" && content !== "normal";
}

/** The pseudo-elements of an element the page draws: a marker on a list item, a before or after with content. */
export function readPseudos(element: Element): string[] {
  const view = element.ownerDocument.defaultView;
  if (!view) return [];
  const found: string[] = [];
  try {
    if (view.getComputedStyle(element).display.includes("list-item")) {
      if (view.getComputedStyle(element, "::marker").content !== "none") found.push("::marker");
    }
    for (const name of ["::before", "::after"]) {
      const style = view.getComputedStyle(element, name);
      if (hasContent(style.content) && style.display !== "none") found.push(name);
    }
  } catch {
    // An element whose window went has no styles to read.
  }
  return found;
}

const PAGE: TreePage = { pseudos: readPseudos };

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT;
}

/** devknobs' own: its panel, its boxes, its frame's letterbox, the styles it puts on the page. */
export function isOwnNode(node: Node): boolean {
  return isElement(node) && node.hasAttribute("data-devknobs");
}

/** An attribute devknobs puts on a node of the page. */
export function isOwnAttribute(name: string): boolean {
  return name.startsWith("data-devknobs");
}

/** The node above in the tree: the element or document above, and for a shadow root its host. */
export function parentOf(node: Node): Node | null {
  if (node.nodeType === FRAGMENT && "host" in node) return (node as ShadowRoot).host;
  return node.parentNode;
}

/** A text as a line shows it: its runs of white space one space, and its ends trimmed. */
export function shownText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A text cut short at its end. */
export function cut(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

/** An attribute's value as its line shows it: a long one cut in its middle, a data url shorter. */
export function shownValue(value: string): string {
  return middle(value, value.startsWith("data:") ? DATA_URL_MAX : VALUE_MAX);
}

/** An element's tag as the tree writes it: lower case for html, as written for svg. */
export function tagOf(element: Element): string {
  return element.localName || element.nodeName.toLowerCase();
}

/** The doctype as the browser's tools write it. */
export function doctypeText(node: DocumentType): string {
  const pub = node.publicId ? ` PUBLIC "${node.publicId}"` : "";
  const system = node.systemId ? `${pub ? "" : " SYSTEM"} "${node.systemId}"` : "";
  return `<!DOCTYPE ${node.name}${pub}${system}>`;
}

/** What a line of the tree stands for: a node of the page, or a pseudo-element of an element. */
export interface Entry {
  node: Node;
  pseudo: string | null;
}

export type RowKind = "open" | "close" | "text" | "comment" | "doctype" | "shadow" | "pseudo" | "more";

/** A line of the tree. */
export interface Row {
  kind: RowKind;
  node: Node;
  pseudo: string | null;
  depth: number;
  /** For `more`: how many children it shows. */
  more: number;
}

/** What a piece of a line is, which picks its color. */
export type PieceKind = "tag" | "attr" | "val" | "text" | "com" | "doc" | "";

/** A piece of a line and what it is. `name` is the attribute a piece is of, to light it when it changes. */
export type Piece = [kind: PieceKind, text: string, name?: string];

/** A key the tree acts on, and what it does. */
export type Step =
  | { kind: "select"; at: number }
  | { kind: "expand"; node: Node }
  | { kind: "collapse"; node: Node };

export interface TreeModel {
  /** The document shown, or null. */
  root(): Document | null;
  /** Show another document, with nothing open but its `<html>` and `<body>`. */
  setRoot(doc: Document | null): void;
  /** What a node holds, as lines of the tree: devknobs' own and blank text left out. */
  children(node: Node): Entry[];
  /** The element's one short text, which stands in its line, or null. */
  inlineText(element: Element): string | null;
  /** Whether a node's line has a triangle. */
  expandable(node: Node): boolean;
  isExpanded(node: Node): boolean;
  setExpanded(node: Node, open: boolean): void;
  /** Show all the node's children, past `CHILD_CAP`. */
  showAll(node: Node): void;
  /** Read a node's children and pseudo-elements again, the next time they are asked for. */
  forget(node: Node): void;
  /** Open every node on the way down to one, and show the children up to it. Says whether it is in the tree. */
  reveal(node: Node): boolean;
  /** The lines that show, in order. */
  rows(): Row[];
  /** The pieces of a line. */
  pieces(row: Row): Piece[];
}

export function createTreeModel(page: TreePage = PAGE): TreeModel {
  let doc: Document | null = null;
  let kids = new WeakMap<Node, Entry[]>();
  let marks = new WeakMap<Element, string[]>();
  let open = new WeakSet<Node>();
  let all = new WeakSet<Node>();

  function pseudosOf(element: Element): string[] {
    let found = marks.get(element);
    if (!found) {
      found = page.pseudos(element);
      marks.set(element, found);
    }
    return found;
  }

  /** Whether a child node has a line: blank text, devknobs' own and the rarer kinds do not. */
  function shows(node: Node): boolean {
    switch (node.nodeType) {
      case ELEMENT:
        return !isOwnNode(node);
      case TEXT:
        return shownText(node.nodeValue ?? "") !== "";
      case COMMENT:
      case DOCTYPE:
        return true;
      default:
        return false;
    }
  }

  function children(node: Node): Entry[] {
    const had = kids.get(node);
    if (had) return had;
    const list: Entry[] = [];
    const element = isElement(node) ? node : null;
    const pseudos = element ? pseudosOf(element) : [];
    if (element?.shadowRoot) list.push({ node: element.shadowRoot, pseudo: null });
    if (element) for (const name of pseudos) if (name !== "::after") list.push({ node: element, pseudo: name });
    for (const child of Array.from(node.childNodes)) if (shows(child)) list.push({ node: child, pseudo: null });
    if (element && pseudos.includes("::after")) list.push({ node: element, pseudo: "::after" });
    kids.set(node, list);
    return list;
  }

  function inlineText(element: Element): string | null {
    if (element.shadowRoot) return null;
    const nodes = element.childNodes;
    const only = nodes[0];
    if (nodes.length !== 1 || !only || only.nodeType !== TEXT) return null;
    const text = shownText(only.nodeValue ?? "");
    if (text === "" || text.length > INLINE_MAX) return null;
    return pseudosOf(element).length === 0 ? text : null;
  }

  function expandable(node: Node): boolean {
    if (isElement(node) && inlineText(node) !== null) return false;
    return children(node).length > 0;
  }

  function walk(node: Node, depth: number, out: Row[]): void {
    const list = children(node);
    const limit = all.has(node) ? list.length : Math.min(list.length, CHILD_CAP);
    for (let at = 0; at < limit; at++) {
      const entry = list[at];
      if (entry) push(entry, depth, out);
    }
    if (limit < list.length) out.push({ kind: "more", node, pseudo: null, depth, more: list.length - limit });
  }

  function push({ node, pseudo }: Entry, depth: number, out: Row[]): void {
    const row = (kind: RowKind): Row => ({ kind, node, pseudo, depth, more: 0 });
    if (pseudo !== null) {
      out.push(row("pseudo"));
      return;
    }
    switch (node.nodeType) {
      case ELEMENT:
        out.push(row("open"));
        if (open.has(node) && expandable(node)) {
          walk(node, depth + 1, out);
          out.push(row("close"));
        }
        return;
      case FRAGMENT:
        out.push(row("shadow"));
        if (open.has(node)) walk(node, depth + 1, out);
        return;
      case TEXT:
        out.push(row("text"));
        return;
      case COMMENT:
        out.push(row("comment"));
        return;
      case DOCTYPE:
        out.push(row("doctype"));
    }
  }

  function openPieces(element: Element): Piece[] {
    const tag = tagOf(element);
    const pieces: Piece[] = [["tag", `<${tag}`]];
    for (const attr of Array.from(element.attributes)) {
      if (isOwnAttribute(attr.name)) continue;
      pieces.push(["", " "], ["attr", attr.name, attr.name]);
      if (attr.value !== "") pieces.push(["tag", '="', attr.name], ["val", shownValue(attr.value), attr.name], ["tag", '"', attr.name]);
    }
    if (VOID.has(tag) && element.namespaceURI === "http://www.w3.org/1999/xhtml") {
      pieces.push(["tag", ">"]);
      return pieces;
    }
    const text = inlineText(element);
    if (text !== null) pieces.push(["tag", ">"], ["text", text], ["tag", `</${tag}>`]);
    else if (!expandable(element)) pieces.push(["tag", `></${tag}>`]);
    else if (open.has(element)) pieces.push(["tag", ">"]);
    else pieces.push(["tag", ">"], ["", "…"], ["tag", `</${tag}>`]);
    return pieces;
  }

  function pieces(row: Row): Piece[] {
    const { node } = row;
    switch (row.kind) {
      case "open":
        return isElement(node) ? openPieces(node) : [];
      case "close":
        return isElement(node) ? [["tag", `</${tagOf(node)}>`]] : [];
      case "text":
        return [["text", `"${cut(shownText(node.nodeValue ?? ""), TEXT_MAX)}"`]];
      case "comment":
        return [["com", `<!--${cut(node.nodeValue ?? "", TEXT_MAX)}-->`]];
      case "doctype":
        return [["doc", doctypeText(node as DocumentType)]];
      case "shadow":
        return [["", "#shadow-root (open)"]];
      case "pseudo":
        return [["tag", row.pseudo ?? ""]];
      case "more":
        return [["", `Show all nodes (${row.more} more)`]];
    }
  }

  function setRoot(next: Document | null): void {
    doc = next;
    kids = new WeakMap();
    marks = new WeakMap();
    open = new WeakSet();
    all = new WeakSet();
    const html = next?.documentElement;
    if (html) open.add(html);
    if (next?.body) open.add(next.body);
  }

  function reveal(node: Node): boolean {
    const path: Node[] = [];
    let at: Node | null = node;
    while (at && at.nodeType !== DOCUMENT) {
      if (isOwnNode(at)) return false;
      path.unshift(at);
      at = parentOf(at);
    }
    if (!at || at !== doc) return false;
    let above: Node = at;
    for (const step of path) {
      const index = children(above).findIndex((entry) => entry.node === step && entry.pseudo === null);
      if (index < 0) return false;
      if (index >= CHILD_CAP) all.add(above);
      if (step !== node) open.add(step);
      above = step;
    }
    return true;
  }

  return {
    root: () => doc,
    setRoot,
    children,
    inlineText,
    expandable,
    isExpanded: (node) => open.has(node),
    setExpanded(node, next) {
      if (next) open.add(node);
      else open.delete(node);
    },
    showAll: (node) => all.add(node),
    forget(node) {
      kids.delete(node);
      if (isElement(node)) marks.delete(node);
    },
    reveal,
    rows() {
      const out: Row[] = [];
      if (doc) walk(doc, 0, out);
      return out;
    },
    pieces,
  };
}

/** Whether a line can be selected: every one but an end tag and the line that shows more. */
export function selectable(row: Row): boolean {
  return row.kind !== "close" && row.kind !== "more";
}

/** The line of the node a line is in: the one a level up, before it. */
export function parentRow(rows: readonly Row[], at: number): number | null {
  const row = rows[at];
  if (!row) return null;
  for (let up = at - 1; up >= 0; up--) {
    const above = rows[up];
    if (above && above.depth === row.depth - 1 && selectable(above)) return up;
  }
  return null;
}

/**
 * What a key does on the line at `at`, as in the browser's tools: up and down
 * to the line before and after, Home and End to the ends, right opens a line
 * and on an open one goes in, left closes an open one and on another goes to
 * its parent. Null for any other key.
 */
export function stepFor(key: string, rows: readonly Row[], at: number, model: Pick<TreeModel, "expandable" | "isExpanded">): Step | null {
  const lines = rows.map((row, index) => (selectable(row) ? index : -1)).filter((index) => index >= 0);
  const here = lines.indexOf(at);
  const row = rows[at];
  const to = (index: number | undefined): Step | null => (index === undefined || index === at ? null : { kind: "select", at: index });
  switch (key) {
    case "ArrowDown":
      return to(lines[here < 0 ? 0 : here + 1]);
    case "ArrowUp":
      return to(lines[here < 0 ? 0 : here - 1]);
    case "Home":
      return to(lines[0]);
    case "End":
      return to(lines[lines.length - 1]);
    case "ArrowRight":
      if (!row || !model.expandable(row.node) || row.kind === "pseudo") return null;
      if (!model.isExpanded(row.node)) return { kind: "expand", node: row.node };
      return to(lines[here + 1]);
    case "ArrowLeft":
      if (!row) return null;
      if (row.kind !== "pseudo" && model.expandable(row.node) && model.isExpanded(row.node)) return { kind: "collapse", node: row.node };
      return to(parentRow(rows, at) ?? undefined);
    default:
      return null;
  }
}

/** The element a line stands for on the page: its own, or the one it is in. */
export function elementOf(node: Node): Element | null {
  for (let at: Node | null = node; at; at = parentOf(at)) if (isElement(at)) return at;
  return null;
}

/** A node as markup, as "Copy element" copies it: its outer html, devknobs' own nodes and attributes left out. */
export function markupOf(node: Node): string {
  if (isElement(node)) {
    const copy = node.cloneNode(true) as Element;
    for (const own of Array.from(copy.querySelectorAll("[data-devknobs]"))) own.remove();
    for (const one of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
      for (const attr of Array.from(one.attributes)) if (isOwnAttribute(attr.name)) one.removeAttribute(attr.name);
    }
    return copy.outerHTML;
  }
  if (node.nodeType === TEXT) return node.nodeValue ?? "";
  if (node.nodeType === COMMENT) return `<!--${node.nodeValue ?? ""}-->`;
  if (node.nodeType === DOCTYPE) return doctypeText(node as DocumentType);
  return "";
}

/** What the tree needs from the view it is in. */
export interface DomTreeContext {
  /** Box an element on the page while the pointer is on its line, or with null take the box off. */
  outline(element: Element | null): void;
  /** A line was selected, by a click or a key: the node, or the element and its pseudo-element. */
  select(node: Node, pseudo: string | null): void;
  /** Put a text on the clipboard. */
  copy(text: string): void;
}

export interface DomTree {
  node: HTMLElement;
  /** Show the tree of the node's document, with the node selected and in view. Null shows no tree. */
  reveal(node: Node | null, pseudo?: string | null): void;
  /** The node selected, or null. */
  selected(): Node | null;
  destroy(): void;
}

/** What a line was built for, to tell when it has to be built again. */
interface Built {
  node: HTMLElement;
  depth: number;
  open: boolean;
  more: number;
}

let treesMade = 0;

/** The key a line is kept by among its node's lines. */
function slot(row: Row): string {
  return row.kind === "pseudo" ? (row.pseudo ?? "") : row.kind;
}

export function createDomTree(context: DomTreeContext, model: TreeModel = createTreeModel()): DomTree {
  const id = `dk-dom-${++treesMade}`;
  const node = el("div", "dom");
  const list = el("div", "dom-tree");
  list.setAttribute("role", "tree");
  list.setAttribute("aria-label", "DOM tree");
  list.tabIndex = 0;
  node.append(list);
  node.hidden = true;
  let rows: Row[] = [];
  let built = new WeakMap<Node, Map<string, Built>>();
  let selection: Entry | null = null;
  /** Nodes that changed since the last build, and the attributes of each, to light. */
  let lit = new Map<Node, Set<string> | null>();
  let made = 0;
  let timer = 0;
  const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(onRecords);

  function drop(target: Node): void {
    built.delete(target);
  }

  function isSelected(row: Row): boolean {
    if (!selection) return false;
    if (row.kind === "close") return false;
    return row.node === selection.node && (row.kind === "pseudo" ? row.pseudo === selection.pseudo : selection.pseudo === null);
  }

  function pieceNodes(row: Row): HTMLElement {
    const code = el("span", "dom-code");
    const changed = lit.get(row.node);
    for (const [kind, text, name] of model.pieces(row)) {
      const piece = kind === "" ? el("span", "", text) : el("span", `tok-${kind}`, text);
      if (name !== undefined && changed?.has(name)) piece.classList.add("dom-flash");
      code.append(piece);
    }
    return code;
  }

  function build(row: Row): HTMLElement {
    const line = el("div", `dom-row dom-${row.kind}`);
    line.style.paddingLeft = `calc(var(--view-start) + ${row.depth} * var(--col-icon))`;
    if (row.kind === "more") {
      line.setAttribute("role", "none");
      line.append(
        actButton(model.pieces(row)[0]?.[1] ?? "", () => {
          model.showAll(row.node);
          drop(row.node);
          render();
        }),
      );
      return line;
    }
    const turn = el("span", "sect-turn dom-turn");
    turn.setAttribute("aria-hidden", "true");
    const opens = row.kind !== "close" && row.kind !== "pseudo" && model.expandable(row.node);
    if (opens) {
      turn.append(icon("chevron-left", 12));
      turn.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        toggle(row.node);
      });
    }
    const code = pieceNodes(row);
    line.append(turn, code);
    if (row.kind === "close") {
      // An end tag is the element's, and no line of its own for assistive tech.
      line.setAttribute("aria-hidden", "true");
    } else {
      line.id = `${id}-${++made}`;
      line.setAttribute("role", "treeitem");
      line.setAttribute("aria-level", String(row.depth + 1));
      if (opens) line.setAttribute("aria-expanded", model.isExpanded(row.node) ? "true" : "false");
    }
    const on = isSelected(row);
    line.setAttribute("aria-selected", on ? "true" : "false");
    if (on) {
      line.classList.add("on");
      const ref = el("span", "dom-ref", " == $0");
      ref.setAttribute("aria-hidden", "true");
      const copy = actButton("copy", () => context.copy(markupOf(row.node)));
      copy.setAttribute("aria-label", "Copy element");
      // At the end of the line's text, as the browser's tools put it.
      code.append(ref, copy);
    }
    if (lit.has(row.node) && lit.get(row.node) === null) line.classList.add("dom-flash");
    const element = elementOf(row.node);
    line.addEventListener("pointerenter", () => context.outline(element));
    line.addEventListener("click", () => choose(row));
    return line;
  }

  function lineOf(row: Row): HTMLElement {
    let lines = built.get(row.node);
    if (!lines) {
      lines = new Map();
      built.set(row.node, lines);
    }
    const key = slot(row);
    const had = lines.get(key);
    const open = model.isExpanded(row.node);
    if (had && had.depth === row.depth && had.open === open && had.more === row.more) return had.node;
    const made = { node: build(row), depth: row.depth, open, more: row.more };
    lines.set(key, made);
    return made.node;
  }

  /** Watch what shows: each line's node for its attributes or text, and what each element and open root holds. */
  function observe(): void {
    if (!observer) return;
    observer.disconnect();
    const root = model.root();
    if (!root) return;
    const watch = new Map<Node, MutationObserverInit>([[root, { childList: true }]]);
    const add = (target: Node, options: MutationObserverInit) => watch.set(target, { ...watch.get(target), ...options });
    for (const row of rows) {
      if (row.kind === "open") {
        add(row.node, { attributes: true, childList: true });
        // The one text that stands in an element's line.
        const first = row.node.firstChild;
        if (first && first.nodeType === TEXT && first === row.node.lastChild) add(first, { characterData: true });
      } else if (row.kind === "shadow" && model.isExpanded(row.node)) add(row.node, { childList: true });
      else if (row.kind === "text" || row.kind === "comment") add(row.node, { characterData: true });
    }
    for (const [target, options] of watch) {
      try {
        observer.observe(target, options);
      } catch {
        // A node of a window that went.
      }
    }
  }

  function render(): void {
    clearTimeout(timer);
    timer = 0;
    rows = model.rows();
    list.replaceChildren(...rows.map(lineOf));
    lit = new Map();
    const at = selectedIndex();
    const line = at < 0 ? null : lineOf(rows[at] as Row);
    list.setAttribute("aria-activedescendant", line?.id ?? "");
    observe();
  }

  function selectedIndex(): number {
    return rows.findIndex((row) => isSelected(row));
  }

  /** Bring the selected line into the tree's sight, without moving the view around it. In its middle when it was far. */
  function bringIntoView(middleOf: boolean): void {
    const at = selectedIndex();
    const row = rows[at];
    if (!row) return;
    const line = lineOf(row);
    const top = line.offsetTop;
    const height = line.offsetHeight;
    const seen = node.clientHeight;
    if (typeof top !== "number" || typeof height !== "number" || typeof seen !== "number") return;
    if (top >= node.scrollTop && top + height <= node.scrollTop + seen) return;
    if (middleOf) node.scrollTop = Math.max(0, top - (seen - height) / 2);
    else node.scrollTop = top < node.scrollTop ? top : top + height - seen;
  }

  function setSelection(next: Entry | null): void {
    if (selection) drop(selection.node);
    selection = next;
    if (next) drop(next.node);
  }

  /** A line chosen by a click or a key: it is selected, and the view is told. */
  function choose(row: Row): void {
    const target = row.kind === "close" ? { node: row.node, pseudo: null } : { node: row.node, pseudo: row.pseudo };
    setSelection(target);
    render();
    bringIntoView(false);
    context.select(target.node, target.pseudo);
  }

  function toggle(target: Node): void {
    model.setExpanded(target, !model.isExpanded(target));
    drop(target);
    render();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.altKey) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      if (!selection) return;
      event.preventDefault();
      context.copy(markupOf(selection.node));
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    const step = stepFor(event.key, rows, selectedIndex(), model);
    if (!step) return;
    event.preventDefault();
    if (step.kind === "select") {
      const row = rows[step.at];
      if (row) choose(row);
      return;
    }
    model.setExpanded(step.node, step.kind === "expand");
    drop(step.node);
    render();
  }

  function onLeave(): void {
    context.outline(null);
  }

  list.addEventListener("keydown", onKeydown);
  list.addEventListener("pointerleave", onLeave);

  /** What changed on the page: the lines of those nodes are built again, lit, once it settles. */
  function onRecords(records: MutationRecord[]): void {
    let any = false;
    const light = (target: Node, name: string | null) => {
      if (name === null) {
        lit.set(target, null);
        return;
      }
      const names = lit.get(target);
      if (names === null) return;
      lit.set(target, new Set([...(names ?? []), name]));
    };
    for (const record of records) {
      const target = record.target;
      if (record.type === "childList") {
        const nodes = [...Array.from(record.addedNodes ?? []), ...Array.from(record.removedNodes ?? [])];
        if (nodes.length > 0 && nodes.every(isOwnNode)) continue;
        model.forget(target);
        drop(target);
        for (const added of Array.from(record.addedNodes ?? [])) if (!isOwnNode(added)) light(added, null);
        any = true;
      } else if (record.type === "attributes") {
        const name = record.attributeName ?? "";
        if (isOwnAttribute(name)) continue;
        model.forget(target);
        drop(target);
        light(target, name);
        any = true;
      } else if (record.type === "characterData") {
        drop(target);
        const parent = target.parentNode;
        if (parent) {
          model.forget(parent);
          drop(parent);
        }
        light(target, null);
        any = true;
      }
    }
    if (any && !timer) timer = window.setTimeout(render, SETTLE);
  }

  function reveal(target: Node | null, pseudo: string | null = null): void {
    if (!target) {
      observer?.disconnect();
      clearTimeout(timer);
      timer = 0;
      model.setRoot(null);
      built = new WeakMap();
      selection = null;
      rows = [];
      list.replaceChildren();
      node.hidden = true;
      return;
    }
    const doc = target.nodeType === DOCUMENT ? (target as Document) : target.ownerDocument;
    if (doc !== model.root()) {
      model.setRoot(doc);
      built = new WeakMap();
    }
    node.hidden = false;
    for (let at = parentOf(target); at; at = parentOf(at)) drop(at);
    model.reveal(target);
    setSelection({ node: target, pseudo });
    render();
    bringIntoView(true);
  }

  return {
    node,
    reveal,
    selected: () => selection?.node ?? null,
    destroy(): void {
      observer?.disconnect();
      clearTimeout(timer);
      list.removeEventListener("keydown", onKeydown);
      list.removeEventListener("pointerleave", onLeave);
      context.outline(null);
      selection = null;
    },
  };
}


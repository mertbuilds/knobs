/**
 * A stylesheet of devknobs'. Where the browser adopts constructed sheets it is
 * one of those, which a page's Content Security Policy does not block, as it
 * blocks a `<style>` without `'unsafe-inline'`; elsewhere it is a `<style>`.
 */
export interface OwnStyle {
  textContent: string | null;
  readonly sheet: CSSStyleSheet | null;
  remove(): void;
}

type Root = Document | ShadowRoot;

/** The named sheets on a document, shared by every copy of devknobs that styles it. */
const NAMED = Symbol.for("devknobs.styles");
/** Marks a constructed sheet as devknobs' own. */
const OWN = Symbol.for("devknobs.own");

function named(doc: Document): Map<string, OwnStyle> {
  const had: unknown = Reflect.get(doc, NAMED);
  if (had instanceof Map) return had as Map<string, OwnStyle>;
  const made = new Map<string, OwnStyle>();
  Reflect.set(doc, NAMED, made);
  return made;
}

function isDocument(root: Root): root is Document {
  return root.nodeType === 9;
}

function documentOf(root: Root): Document {
  return isDocument(root) ? root : (root.ownerDocument ?? document);
}

/** The constructor of sheets `root` can adopt, from its own window, or null where it cannot. */
function constructable(root: Root): typeof CSSStyleSheet | null {
  const doc = isDocument(root) ? root : (root.ownerDocument as Document | undefined);
  const Sheet = doc?.defaultView?.CSSStyleSheet;
  if (typeof Sheet !== "function" || typeof Sheet.prototype.replaceSync !== "function") return null;
  return "adoptedStyleSheets" in root ? Sheet : null;
}

/** The `<style>` a sheet is, or null for a constructed one. */
export function styleNode(style: OwnStyle): HTMLStyleElement | null {
  return "nodeType" in style ? (style as HTMLStyleElement) : null;
}

/** Is `sheet` one devknobs constructed? */
export function isOwnSheet(sheet: CSSStyleSheet): boolean {
  return Reflect.get(sheet, OWN) === true;
}

function adopt(root: Root, Sheet: typeof CSSStyleSheet, gone: () => void): OwnStyle {
  const sheet = new Sheet();
  Reflect.set(sheet, OWN, true);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  let text: string | null = "";
  return {
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = value;
      sheet.replaceSync(value ?? "");
    },
    sheet,
    remove() {
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((other) => other !== sheet);
      gone();
    },
  };
}

/**
 * Style `root` with `css`: the document, or a shadow root of devknobs'. A
 * `<style>` in its place goes at the end of the document's head or of the
 * shadow root, before what the shadow root gets next.
 */
export function addStyle(root: Root, css: string): OwnStyle {
  const Sheet = constructable(root);
  if (Sheet) {
    const style = adopt(root, Sheet, () => {});
    style.textContent = css;
    return style;
  }
  const style = documentOf(root).createElement("style");
  style.textContent = css;
  if (isDocument(root)) (root.head ?? root.documentElement).appendChild(style);
  else root.append(style);
  return style;
}

/** The sheet devknobs keeps on the page under `name`, if it has one. */
export function findStyle(name: string, doc: Document = document): OwnStyle | null {
  return named(doc).get(name) ?? doc.querySelector<HTMLStyleElement>(`style[data-devknobs="${name}"]`);
}

/** Every node devknobs adds to the page carries `data-devknobs`. */
export function ensureStyle(name: string, doc: Document = document): OwnStyle {
  const existing = findStyle(name, doc);
  if (existing) return existing;
  const Sheet = constructable(doc);
  if (Sheet) {
    const sheets = named(doc);
    const style = adopt(doc, Sheet, () => sheets.delete(name));
    sheets.set(name, style);
    return style;
  }
  const style = doc.createElement("style");
  style.setAttribute("data-devknobs", name);
  (doc.head ?? doc.documentElement).appendChild(style);
  return style;
}

export function removeStyle(name: string, doc: Document = document): void {
  findStyle(name, doc)?.remove();
}

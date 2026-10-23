import { NativeDate } from "../engine/clock";
import type { BodyRecord, HeaderList, RequestEntry } from "../requests/types";
import { button, el } from "./dom";
import { glyph, icon } from "./icons";
import {
  actButton,
  codeBlock,
  codeView,
  group,
  jsonTree,
  noteLine,
  pairs,
  rowButton,
  section,
  splitBar,
  tabBar,
  toolbar,
} from "./kit";
import { bodyText, clockTime, durationLabel, hasText, type Lead, LIGHT_WHY, middle, STATUS_TONES } from "./requestformat";
import {
  bodyShape,
  cookieLines,
  cutNote,
  decodeForm,
  encodedLines,
  type Frame,
  generalLines,
  isTab,
  noResponse,
  otherLines,
  pathRoom,
  payloadOf,
  PROVISIONAL,
  queryLines,
  queryString,
  rawHeaders,
  stackFile,
  stackLines,
  startTab,
  summary,
  type Tab,
  TABS,
  tabsOf,
  timingLines,
  timingParts,
} from "./requestparts";
import { langOf } from "./syntax";

/**
 * One request in full, in place of the list, laid out as the browsers' own
 * network panel lays it out, in its words, so nothing about it is new to
 * learn. A summary stays on top, the method and the path and how it went,
 * and under it the tabs: Headers, Payload, Preview, Response, Initiator,
 * Timing, Cookies and EventStream, the ones the request has. The way back is
 * the view's head.
 *
 * A part is built once and drawn again only when what it shows has changed,
 * so a request that changes while it shows keeps its tab, its scroll and
 * what the user opened. Which tab is on, which sections are open and how
 * each shows are kept from one request to the next, as the browsers' tools
 * keep them.
 */

/** What the detail says once, the first time a request is copied. */
export const HIDES_NOTE =
  "header values and address parameters that look like secrets are copied as <hidden>. bodies are copied as they are: check before you paste";

/** What the detail says of a request the log let go while it showed. */
export const GONE_NOTE = "this request is no longer in the log, and shows as it last was";

/** What the detail keeps from one request to the next: the tab picked, and how each section was left. */
export interface DetailMemory {
  tab: Tab | null;
  /** By a section's name and a toggle's: whether it is open, or on. */
  open: Map<string, boolean>;
}

export function detailMemory(): DetailMemory {
  return { tab: null, open: new Map() };
}

/** What the detail needs from the view it shows in. */
export interface DetailContext {
  /** Copy a text, and say how that went. */
  copy(text: string): void;
  /** The user picked another tab, which starts at its top. */
  picked?(): void;
  /** What the detail keeps between requests. One of its own where left out. */
  memory?: DetailMemory;
  /** The file devknobs runs from, as a stack names it. Read from a stack of its own where left out. */
  own?: string;
  /** The page's own referrer policy, where it sets one. Read from the page where left out. */
  policy?: string;
}

export interface Detail {
  node: HTMLElement;
  /** The request changed: draw what is new of it. */
  update(entry: RequestEntry): void;
  /** The log let the request go: say that what shows will not change again. */
  gone(): void;
  /** Say what a copy leaves out. */
  hides(): void;
  /** Escape came: say whether the detail had anything of its own to undo. It has not: escape goes back. */
  escape(): boolean;
  /** The detail left the view. */
  destroy(): void;
}

/** One part of a tab: what it shows, and its node while that is the same. */
interface Block {
  /** What the block shows. A new one of any of them means it is built again. */
  of(entry: RequestEntry): readonly unknown[];
  /** The block, or null where it has nothing to show. */
  build(entry: RequestEntry): HTMLElement | null;
  shown: readonly unknown[] | null;
  node: HTMLElement | null;
}

function block(of: Block["of"], build: Block["build"]): Block {
  return { of, build, shown: null, node: null };
}

function same(one: readonly unknown[] | null, other: readonly unknown[]): boolean {
  return one !== null && one.length === other.length && one.every((each, at) => each === other[at]);
}

/** Set a node's text, unless it says so already. */
function put(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** The referrer policy the page sets for itself in its head, or empty. */
function pagePolicy(): string {
  if (typeof document.querySelector !== "function") return "";
  return document.querySelector('meta[name="referrer"]')?.getAttribute("content")?.trim() ?? "";
}

export function createDetail(entry: RequestEntry, context: DetailContext): Detail {
  const own = context.own ?? stackFile(new Error().stack);
  const memory = context.memory ?? detailMemory();
  const policy = context.policy ?? pagePolicy();
  let now = entry;

  const verb = el("span", "req-verb");
  let verbShown: Lead | null = null;
  const path = button("req-url", "");
  path.addEventListener("click", () => context.copy(now.url));
  const first = el("div", "req-first");
  first.append(verb, path);
  const status = el("span", "req-stat");
  const took = el("span", "req-took");
  const host = el("span", "req-host");
  const second = el("div", "req-second");
  second.append(status, took, host);
  const top = el("div", "req-sum");
  top.append(first, second);

  const tabs = tabBar({
    options: TABS.map((each) => ({ value: each, label: each })),
    label: "what of the request shows",
    onChange(value: string): void {
      if (!isTab(value) || value === shown()) return;
      memory.tab = value;
      draw();
      context.picked?.();
    },
  });

  const hides = noteLine(HIDES_NOTE);
  hides.hidden = true;
  const left = noteLine(GONE_NOTE);
  left.hidden = true;
  const region = tabs.panel;
  region.classList.add("req-body");
  const node = el("div", "req-detail");
  node.append(toolbar([top, tabs.node]), hides, left, region);

  function shown(): Tab {
    return startTab(now, memory.tab);
  }

  /** Whether a section or a toggle is open, or on, as it was left, else as it starts. */
  function isOpen(name: string, start = true): boolean {
    return memory.open.get(name) ?? start;
  }

  /** A section of a tab, open or closed as it was left. */
  function part(name: string, count?: string, ends?: readonly HTMLElement[]): ReturnType<typeof section> {
    return section({
      label: name,
      count,
      ends,
      open: isOpen(name),
      onToggle: (open) => memory.open.set(name, open),
    });
  }

  /**
   * A section whose body shows one of two ways, as `view source` and `view
   * parsed` switch it, or with `Raw`: each press draws its body again, the
   * section kept. `toggles` are the switches, each a name, its two labels,
   * and whether it starts on.
   */
  function switched(
    name: string,
    count: string | undefined,
    toggles: readonly { name: string; on: string; off: string; start: boolean }[],
    draw: (on: (toggle: string) => boolean) => HTMLElement[],
    more: readonly HTMLElement[] = [],
  ): HTMLElement {
    const key = (toggle: string): string => `${name}/${toggle}`;
    const on = (toggle: string): boolean => {
      const found = toggles.find((each) => each.name === toggle);
      return isOpen(key(toggle), found?.start ?? false);
    };
    const buttons = toggles.map((toggle) => {
      // A switch names what a press shows, `Raw` alone says whether it is on, as it is a checkbox there.
      const raw = toggle.on === toggle.off;
      const label = (): string => (on(toggle.name) ? toggle.off : toggle.on);
      const control = actButton(label(), () => {
        memory.open.set(key(toggle.name), !on(toggle.name));
        control.textContent = label();
        if (raw) control.setAttribute("aria-pressed", on(toggle.name) ? "true" : "false");
        control.classList.toggle("on", raw && on(toggle.name));
        fill();
      }, raw ? on(toggle.name) : undefined);
      return control;
    });
    const box = part(name, count, [...buttons, ...more]);
    function fill(): void {
      box.body.replaceChildren(...draw(on));
    }
    fill();
    return box.node;
  }

  /** The copy at the end of a section's head: just that text, as it was kept. */
  function copyOf(text: string, what: string): HTMLButtonElement {
    const copy = rowButton("req-copy", icon("copy"), `copy the ${what}`);
    copy.addEventListener("click", () => context.copy(text));
    return copy;
  }

  /** The summary, changed in place. */
  function drawTop(): void {
    const said = summary(now);
    const was = verbShown;
    const next = said.verb;
    if (!was || was.text !== next.text || was.icon !== next.icon || was.tone !== next.tone) {
      verbShown = next;
      verb.className = ["req-verb", next.icon ? "mark" : "", next.tone].filter(Boolean).join(" ");
      if (next.icon) {
        verb.replaceChildren(glyph(next.icon));
        verb.setAttribute("role", "img");
        verb.setAttribute("aria-label", next.text);
        verb.title = next.text;
      } else {
        verb.textContent = next.text;
        verb.removeAttribute("role");
        verb.removeAttribute("aria-label");
        verb.title = "";
      }
    }
    put(path, middle(said.path, pathRoom(path.clientWidth)));
    if (path.title !== now.url) path.title = now.url;
    path.setAttribute("aria-label", `copy the address ${now.url}`);
    put(status, said.status);
    for (const each of STATUS_TONES) status.classList.toggle(each, each === said.tone);
    put(took, said.time);
    put(host, said.host);
  }

  /** General, as the browsers' tools have it: a dot in the status's tone before the Status Code. */
  function general(at: RequestEntry): HTMLElement {
    const box = part("General");
    const lines = generalLines(at, policy).map(({ label, value, tone }): [string, string | HTMLElement] => {
      if (tone === undefined) return [label, value];
      const code = el("span", "req-code");
      const dot = el("span", `req-dot req-stat${tone ? ` ${tone}` : ""}`, "●");
      dot.setAttribute("aria-hidden", "true");
      code.append(dot, value);
      return [label, code];
    });
    box.body.append(pairs(lines).node);
    return box.node;
  }

  /** A set of headers, as the browsers' tools show it: a name and a value a line, or as text with Raw. */
  function headers(name: string, list: HeaderList, warn: boolean): HTMLElement {
    return switched(name, `(${list.length})`, [{ name: "raw", on: "Raw", off: "Raw", start: false }], (on) => {
      const nodes: HTMLElement[] = [];
      if (warn) {
        const line = el("div", "req-warn");
        line.append(el("span", "req-warn-mark", "⚠"), PROVISIONAL);
        nodes.push(line);
      }
      if (on("raw")) nodes.push(codeView({ text: rawHeaders(list) }));
      else if (list.length > 0) nodes.push(pairs(list).node);
      return nodes;
    });
  }

  /** The query, as Query String Parameters: parsed or as written, and decoded or not. */
  function query(at: RequestEntry): HTMLElement | null {
    const written = queryString(at.url);
    if (written === "") return null;
    return switched(
      "Query String Parameters",
      `(${queryLines(at.url).length})`,
      [
        { name: "source", on: "view source", off: "view parsed", start: false },
        { name: "encoded", on: "view URL-encoded", off: "view decoded", start: false },
      ],
      (on) => [
        on("source")
          ? codeView({ text: on("encoded") ? written : decodeForm(written) })
          : pairs(queryLines(at.url, !on("encoded"))).node,
      ],
      [copyOf(written, "query string")],
    );
  }

  /** What was sent, as Form Data or Request Payload: parsed by default, or as it was kept. */
  function payload(record: BodyRecord): HTMLElement {
    const shape = payloadOf(record);
    const cut = cutNote(record);
    const notes = cut ? [noteLine(cut)] : [];
    const copy = hasText(record) && record.text !== "" ? [copyOf(record.text, "request payload")] : [];
    if (shape.kind === "form") {
      const toggles = [{ name: "source", on: "view source", off: "view parsed", start: false }];
      if (shape.encoded) toggles.push({ name: "encoded", on: "view URL-encoded", off: "view decoded", start: false });
      return switched("Form Data", `(${shape.lines.length})`, toggles, (on) => {
        // Only a urlencoded form reads two ways. Any other is shown as it was kept.
        const decoded = shape.encoded && !on("encoded");
        if (on("source")) return [...notes, codeView({ text: decoded ? decodeForm(shape.source) : shape.source })];
        const lines = shape.encoded && !decoded ? encodedLines(shape.source) : shape.lines;
        return [...notes, pairs(lines).node];
      }, copy);
    }
    if (shape.kind === "json") {
      return switched("Request Payload", undefined, [{ name: "source", on: "view source", off: "view parsed", start: false }], (on) => [
        ...notes,
        on("source") ? codeView({ text: shape.source, lang: "json" }) : jsonTree(shape.value),
      ], copy);
    }
    const box = part("Request Payload", undefined, copy);
    box.body.append(...notes, shape.kind === "text" ? codeView({ text: shape.text, lang: langOf(record.type) }) : noteLine(shape.text));
    return box.node;
  }

  /** The response's body as text, numbered and colored, or the line that says why there is none. */
  function response(at: RequestEntry): HTMLElement {
    const record = at.responseBody;
    const box = el("div", "req-response");
    if (!record) {
      box.append(noteLine(noResponse(at)));
      return box;
    }
    const shape = bodyShape(record, at.contentType);
    const type = record.type || at.contentType;
    const cut = cutNote(record);
    if (shape.kind === "line") {
      box.append(noteLine(shape.text));
      return box;
    }
    const head = group({ label: type.split(";", 1)[0] || "response", ends: [copyOf(record.text, "response")] });
    box.append(head);
    if (cut) box.append(noteLine(cut));
    box.append(codeView({ text: bodyText(record, at.contentType), lang: record.kind === "form" ? "text" : langOf(type) }));
    return box;
  }

  /** A stack, a frame a line, as the detail showed it before Initiator had its own. */
  function stack(text: string): HTMLElement {
    const box = el("div", "req-stack");
    const frameLine = (frame: Frame): HTMLElement => {
      const row = el("div", "req-frame");
      row.append(el("span", "req-fn", frame.name));
      if (frame.where !== "") {
        const where = button("req-where", frame.short);
        where.title = frame.where;
        where.setAttribute("aria-label", `copy ${frame.where}`);
        where.addEventListener("click", () => context.copy(frame.where));
        row.append(where);
      }
      return row;
    };
    for (const each of stackLines(text, own)) {
      if (each.kind === "frame") box.append(frameLine(each.frame));
      else {
        // The frames that are not the page's own show once they are asked for.
        const more = button("chip req-skipped", `${each.frames.length} more`);
        const row = el("div", "req-frame");
        row.append(more);
        more.addEventListener("click", () => {
          for (const frame of each.frames) box.insertBefore(frameLine(frame), row);
          row.remove();
        });
        box.append(row);
      }
    }
    return box;
  }

  const light = (at: RequestEntry): HTMLElement | null => (at.detail === "light" ? noteLine(LIGHT_WHY) : null);

  const blocks: Record<Tab, Block[]> = {
    Headers: [
      block((at) => [at.detail], light),
      block((at) => [at.url, at.finalUrl, at.method, at.state, at.status, at.statusText, at.error, at.referrerPolicy], general),
      block(
        (at) => [at.detail, at.responseHeaders],
        (at) => (at.detail === "light" || at.responseHeaders.length === 0 ? null : headers("Response Headers", at.responseHeaders, false)),
      ),
      block(
        (at) => [at.detail, at.requestHeaders],
        (at) => (at.detail === "light" ? null : headers("Request Headers", at.requestHeaders, true)),
      ),
    ],
    Payload: [
      block((at) => [at.url], query),
      block((at) => [at.requestBody], (at) => (at.requestBody ? payload(at.requestBody) : null)),
    ],
    // Until Preview has its own, it shows the answer as the detail did before: json laid out, a form as its fields.
    Preview: [
      block(
        (at) => [at.responseBody, at.contentType, at.state],
        (at) => {
          const record = at.responseBody;
          if (!record) return noteLine(noResponse(at));
          const shape = bodyShape(record, at.contentType);
          if (shape.kind === "line") return noteLine(shape.text);
          if (shape.kind === "fields") return pairs(shape.lines).node;
          return codeBlock({ text: shape.text }).node;
        },
      ),
    ],
    Response: [block((at) => [at.responseBody, at.contentType, at.state], response)],
    Initiator: [
      block(
        (at) => [at.initiator, at.initiatorType],
        (at) => {
          if (at.initiator !== "") return stack(at.initiator);
          return pairs([["loaded by", at.initiatorType]]).node;
        },
      ),
    ],
    Timing: [
      block((at) => [at.detail], light),
      block(
        (at) => [at.timing],
        (at) => {
          const box = part("Timing");
          const parts = timingParts(at.timing);
          if (parts.shares) {
            const label = `waiting ${durationLabel(parts.waiting)}, download ${durationLabel(parts.download)}`;
            box.body.append(splitBar(parts.shares, label));
          }
          box.body.append(pairs(timingLines(at.timing, clockTime(new NativeDate(at.timing.start)))).node);
          return box.node;
        },
      ),
      block(
        (at) => [at.contentType, at.sizes, at.protocol, at.kind, at.initiatorType, at.source],
        (at) => {
          const box = part("Request");
          box.body.append(pairs(otherLines(at)).node);
          return box.node;
        },
      ),
    ],
    Cookies: [block((at) => [at.requestHeaders, at.responseHeaders], (at) => pairs(cookieLines(at)).node)],
    EventStream: [block(() => [], () => noteLine("not read: a stream"))],
  };

  /** Which blocks the region holds now. */
  let held: readonly HTMLElement[] = [];

  /** Show the request as it stands: the summary, the tabs it has, and the one that is on. */
  function draw(): void {
    drawTop();
    const has = tabsOf(now);
    for (const item of tabs.items) item.node.hidden = !isTab(item.value) || !has.includes(item.value);
    const tab = shown();
    tabs.set(tab);
    const nodes: HTMLElement[] = [];
    for (const each of blocks[tab]) {
      const what = each.of(now);
      if (!same(each.shown, what)) {
        each.shown = what;
        each.node = each.build(now);
      }
      if (each.node) nodes.push(each.node);
    }
    // What is the same stays where it is, so nothing the user scrolled to or opened moves.
    if (nodes.length !== held.length || nodes.some((each, at) => each !== held[at])) {
      region.replaceChildren(...nodes);
      held = nodes;
    }
  }

  draw();

  // The path is cut to the two lines it has, which are as wide as the panel is dragged.
  const sized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(drawTop);
  sized?.observe(path);

  return {
    node,
    update(next: RequestEntry): void {
      now = next;
      draw();
    },
    gone(): void {
      left.hidden = false;
    },
    hides(): void {
      hides.hidden = false;
    },
    escape: () => false,
    destroy(): void {
      sized?.disconnect();
    },
  };
}

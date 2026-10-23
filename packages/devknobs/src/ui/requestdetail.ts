import { NativeDate } from "../engine/clock";
import { hushOnce } from "../requests/quiet";
import type { BodyRecord, HeaderList, RequestEntry } from "../requests/types";
import { button, el } from "./dom";
import { glyph, icon } from "./icons";
import {
  actButton,
  codeView,
  group,
  jsonTree,
  noteLine,
  pairs,
  rowButton,
  section,
  tabBar,
  toolbar,
} from "./kit";
import { bodyText, bytesLabel, clockTime, hasText, type Lead, LIGHT_WHY, middle, STATUS_TONES } from "./requestformat";
import {
  barOf,
  bodyShape,
  type Cookie,
  cookieFields,
  cutNote,
  decodeForm,
  encodedLines,
  FAILED_RESPONSE,
  FETCH_STREAM,
  type Frame,
  generalLines,
  initiatorChain,
  initiatorWords,
  isTab,
  NO_MESSAGES,
  noResponse,
  NOT_FINISHED,
  pathRoom,
  payloadOf,
  preciseDuration,
  previewDocument,
  previewOf,
  PROVISIONAL,
  queryLines,
  queryString,
  rawHeaders,
  requestCookies,
  requestLines,
  responseCookies,
  stackFile,
  stackLines,
  startTab,
  summary,
  type Tab,
  TABS,
  tabsOf,
  timingTable,
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
  /** The page's address, which heads the initiator chain. Read from the page where left out. */
  page?: string;
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
  const page = context.page ?? (typeof location === "undefined" ? "" : location.href);
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

  /**
   * A stack, a frame a line, as the browsers' Request call stack has it: the
   * function, then where it is, which a press copies. Frames of
   * `node_modules` and of devknobs are ignore-listed, a run of them one line
   * that shows them.
   */
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
        const count = each.frames.length;
        const more = button("chip req-skipped", `Show ${count} ignore-listed frame${count === 1 ? "" : "s"}`);
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

  /** An image as the browsers' Preview shows it: itself, loaded from its address, and its size under it. */
  function image(url: string): HTMLElement {
    const box = el("div", "req-shot");
    const picture = document.createElement("img");
    picture.className = "req-picture";
    picture.alt = "";
    const size = el("div", "req-natural");
    picture.addEventListener("load", () => put(size, `${picture.naturalWidth} × ${picture.naturalHeight}`));
    picture.addEventListener("error", () => put(size, FAILED_RESPONSE));
    // Loaded again for the preview, which is devknobs' own load and not the page's.
    hushOnce(url);
    picture.src = url;
    box.append(picture, size);
    return box;
  }

  /** Html as the browsers' Preview draws it: in a frame that runs none of its scripts and loads nothing but its inline styles and data images. */
  function html(text: string): HTMLElement {
    const frame = document.createElement("iframe");
    frame.className = "req-html";
    frame.setAttribute("sandbox", "");
    frame.setAttribute("title", "the response, drawn");
    frame.setAttribute("srcdoc", previewDocument(text));
    return frame;
  }

  function preview(at: RequestEntry): HTMLElement {
    const shape = previewOf(at);
    if (shape.kind === "json") return jsonTree(shape.value);
    if (shape.kind === "image") return image(shape.url);
    if (shape.kind === "html") return html(shape.html);
    if (shape.kind === "fields") return pairs(shape.lines).node;
    if (shape.kind === "code") return codeView({ text: shape.text, lang: shape.lang });
    return noteLine(shape.text);
  }

  /** What an image preview says under its size: how big it is, and its type. */
  function imageFacts(at: RequestEntry): HTMLElement | null {
    if (previewOf(at).kind !== "image") return null;
    const facts: string[] = [];
    if (at.sizes && !at.sizes.hidden && at.sizes.decoded > 0) facts.push(bytesLabel(at.sizes.decoded));
    const type = at.contentType || at.responseBody?.type || "";
    if (type) facts.push(type.split(";", 1)[0] ?? type);
    return facts.length === 0 ? null : noteLine(facts.join(", "));
  }

  /** Where the request came from, a link a line, each a step in from the one that loaded it. */
  function chain(at: RequestEntry): HTMLElement {
    const box = part("Request initiator chain");
    const tree = el("div", "req-chain");
    for (const link of initiatorChain(at, page, own)) {
      const line = el("div", `req-link${link.self ? " self" : ""}`, link.url);
      line.style.paddingLeft = `${link.depth * 2}ch`;
      tree.append(line);
    }
    box.body.append(tree);
    if (at.initiator === "" && at.initiatorType !== "") box.body.append(pairs([["Initiator", initiatorWords(at.initiatorType)]]).node);
    return box.node;
  }

  /** The Timing tab: when it was queued and started, its phases in their sections with a bar each, and the whole. */
  function timing(at: RequestEntry): HTMLElement {
    const table = timingTable(at);
    const box = el("div", "req-timing");
    const when = el("div", "req-when");
    when.append(el("div", "", `Queued at ${preciseDuration(table.queuedAt)}`));
    if (table.startedAt !== null) when.append(el("div", "", `Started at ${preciseDuration(table.startedAt)}`));
    box.append(when);
    if (table.pending) box.append(noteLine(NOT_FINISHED));
    const row = (label: string, ms: number | null, bar: HTMLElement | null): HTMLElement[] => [
      el("span", "req-phase", label),
      bar ?? el("span", "req-track"),
      el("span", "req-ms", ms === null ? "" : preciseDuration(ms)),
    ];
    for (const each of table.sections) {
      const sect = part(each.name, undefined, [el("span", "req-dur", "DURATION")]);
      const grid = el("div", "req-phases");
      for (const one of each.phases) {
        const track = el("span", "req-track");
        const { left, width } = barOf(table, one);
        const bar = el("span", `req-span ${one.tone}`);
        bar.style.left = `${(left * 100).toFixed(2)}%`;
        bar.style.width = `${(width * 100).toFixed(2)}%`;
        track.append(bar);
        grid.append(...row(one.label, one.end - one.start, track));
      }
      sect.body.append(grid);
      box.append(sect.node);
    }
    const total = el("div", "req-phases req-total");
    total.append(...row("Total", table.total, null));
    box.append(total);
    if (table.note) box.append(noteLine(table.note));
    return box;
  }

  /** Request Cookies or Response Cookies, a cookie under another, each a line a field in the table's words. */
  function cookies(name: string, list: readonly Cookie[]): HTMLElement | null {
    if (list.length === 0) return null;
    const box = part(name);
    for (const each of list) {
      const fields = pairs(cookieFields(each)).node;
      fields.classList.add("req-cookie");
      box.body.append(fields);
    }
    return box.node;
  }

  /** The messages of an event stream, as the browsers' EventStream table lists them: Id, Type, Data and Time. */
  function events(at: RequestEntry): HTMLElement {
    if (at.kind !== "eventsource") return noteLine(FETCH_STREAM);
    const table = el("div", "req-events");
    table.setAttribute("role", "table");
    const cells = (head: boolean, values: string[]): HTMLElement => {
      const line = el("div", head ? "req-event req-event-head" : "req-event");
      line.setAttribute("role", "row");
      for (const value of values) {
        const cell = el("span", "req-cell", value);
        cell.setAttribute("role", head ? "columnheader" : "cell");
        line.append(cell);
      }
      return line;
    };
    table.append(cells(true, ["Id", "Type", "Data", "Time"]));
    for (const each of at.messages) {
      table.append(cells(false, [each.id, each.type, each.truncated ? `${each.data}…` : each.data, clockTime(new NativeDate(each.time))]));
    }
    if (at.messages.length > 0) return table;
    const box = el("div", "req-response");
    box.append(table, noteLine(NO_MESSAGES));
    return box;
  }

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
    Preview: [
      block(
        (at) => {
          const shape = previewOf(at);
          // An image is loaded again only where its address changes.
          return shape.kind === "image" ? [shape.kind, shape.url] : [at.responseBody, at.contentType, at.state];
        },
        preview,
      ),
      block((at) => [at.sizes, at.contentType, at.responseBody, at.state], imageFacts),
    ],
    Response: [block((at) => [at.responseBody, at.contentType, at.state], response)],
    Initiator: [
      block(
        (at) => [at.initiator],
        (at) => {
          if (at.initiator === "") return null;
          const box = part("Request call stack");
          box.body.append(stack(at.initiator));
          return box.node;
        },
      ),
      block((at) => [at.url, at.kind, at.initiator, at.initiatorType], chain),
    ],
    Timing: [
      block((at) => [at.timing, at.phases, at.state, at.detail], timing),
      block(
        (at) => [at.contentType, at.sizes, at.protocol, at.kind, at.initiatorType, at.source, at.detail],
        (at) => {
          const box = part("Request");
          box.body.append(pairs(requestLines(at)).node);
          return box.node;
        },
      ),
    ],
    Cookies: [
      block((at) => [at.requestHeaders], (at) => cookies("Request Cookies", requestCookies(at))),
      block((at) => [at.responseHeaders, at.timing.start, at.timing.response], (at) => cookies("Response Cookies", responseCookies(at))),
    ],
    EventStream: [block((at) => [at.kind, at.messages], events)],
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

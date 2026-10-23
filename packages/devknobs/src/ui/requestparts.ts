import { READ_MS } from "../requests/body";
import { BODY_CAP, type BodyRecord, type HeaderList, type RequestEntry } from "../requests/types";
import {
  bodyJson,
  bodyNote,
  bodyText,
  bytesLabel,
  durationLabel,
  hasText,
  isJson,
  kindLabel,
  type Lead,
  lead,
  statusLine,
  type StatusTone,
  statusTone,
} from "./requestformat";
import { type Lang, langOf } from "./syntax";

/**
 * What one request's detail reads, part by part: its summary, which of its
 * tabs there are, and what each of them lists. All of it from the row
 * alone, so none of it needs a page.
 */

/** How many characters of a path show where nothing tells how wide its lines are. */
export const PATH_CHARS = 72;

/** How wide a character of the path is, in px: mono at 11px. */
const CHAR_WIDTH = 6.7;

/** How many characters of a path fit its two lines, the lines `width` px wide. */
export function pathRoom(width: number): number {
  if (!(width > 0)) return PATH_CHARS;
  // One short of two full lines, as the mark of the cut may be wider than a letter.
  return Math.max(8, 2 * Math.floor(width / CHAR_WIDTH) - 1);
}

/** An address in two: the host that answers, and the path asked of it, its query and hash included. */
export function urlParts(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    const start = `${parsed.protocol}//${parsed.host}`;
    // An address that holds its own content, or one that reads another way, is all path.
    if (parsed.host === "" || !url.startsWith(start)) return { host: "", path: url };
    return { host: parsed.host, path: url.slice(start.length) || "/" };
  } catch {
    return { host: "", path: url };
  }
}

/** The top of a request's detail: what was asked, and how it went. */
export interface Summary {
  /** The method in full, or the kind where the browser gives no method. */
  verb: Lead;
  /** The path and its query, as written. */
  path: string;
  /** The status and its text, or empty where the browser does not say. */
  status: string;
  tone: StatusTone | null;
  /** How long it took, or empty while it runs. */
  time: string;
  host: string;
}

export function summary(entry: RequestEntry): Summary {
  const first = lead(entry);
  const { host, path } = urlParts(entry.url);
  return {
    verb: first.icon ? first : { ...first, text: entry.method },
    path,
    status: entry.status === null && entry.state === "ok" ? "" : statusLine(entry),
    tone: statusTone(entry),
    time: durationLabel(entry.timing.duration),
    host,
  };
}

/** How a body shows: as text, as a list of fields, or as a line that says why there is none to show. */
export type BodyShape =
  | { kind: "code"; text: string }
  | { kind: "fields"; lines: [name: string, value: string][] }
  | { kind: "line"; text: string };

/** A form as the log keeps it, a field a line, back as its fields. A line with no `=` goes on with the value before it. */
function formLines(text: string): [string, string][] {
  const lines: [string, string][] = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    const last = lines[lines.length - 1];
    if (at < 0 && last) last[1] = `${last[1]}\n${line}`;
    else lines.push(at < 0 ? [line, ""] : [line.slice(0, at), line.slice(at + 1)]);
  }
  return lines;
}

/**
 * How a body shows. Json is laid out where that changes none of it, a form
 * is its fields, other text is as it was kept, and what has no text says in
 * a line what it is. `type` stands in where the body does not know its own.
 */
export function bodyShape(record: BodyRecord, type = ""): BodyShape {
  if (record.kind === "stream") return { kind: "line", text: "not read: a stream" };
  if (record.kind === "opaque") return { kind: "line", text: "hidden by the browser: an opaque answer" };
  if (!hasText(record)) return { kind: "line", text: [bodyNote(record), record.type].filter(Boolean).join(", ") };
  if (record.text === "") return { kind: "line", text: "empty" };
  if (record.kind === "form") return { kind: "fields", lines: formLines(record.text) };
  if (!record.truncated && /x-www-form-urlencoded/i.test(record.type || type)) {
    return { kind: "fields", lines: [...new URLSearchParams(record.text)] };
  }
  return { kind: "code", text: bodyText(record, type) };
}

/** What is missing of a body that was cut, at the cap or by time. Empty for one that is whole. */
export function cutNote(record: BodyRecord): string {
  if (record.timedOut) return `cut after ${READ_MS / 1000} seconds`;
  if (!record.truncated) return "";
  return `first ${bytesLabel(BODY_CAP)}${record.size === null ? "" : ` of ${bytesLabel(record.size)}`}`;
}

/** The words the browsers' tools give a kind of thing in their Type column, by the short word `kindLabel` has for it. */
const TYPE_WORDS = new Map([
  ["doc", "document"],
  ["js", "script"],
  ["css", "stylesheet"],
  ["img", "image"],
]);

/**
 * What the browsers' tools write in the Type column: the api for a script's
 * request, `document` for the page, and for an image the kind of image.
 */
export function typeWord(entry: RequestEntry): string {
  if (entry.kind !== "resource") return entry.kind === "navigation" ? "document" : entry.kind;
  const kind = kindLabel(entry);
  const image = /^image\/([\w.+-]+)/i.exec(entry.contentType)?.[1];
  if (kind === "img" && image) return image.toLowerCase();
  return TYPE_WORDS.get(kind) ?? kind;
}

/**
 * The tabs of a request's detail, in the words and the order of the browsers'
 * own network panel, so nothing about them is new to learn.
 */
export const TABS = ["Headers", "Payload", "Preview", "Response", "Initiator", "Timing", "Cookies", "EventStream"] as const;

export type Tab = (typeof TABS)[number];

export function isTab(value: string): value is Tab {
  return TABS.some((each) => each === value);
}

/** A response that comes a piece at a time for as long as the page listens. */
export function isEventStream(entry: RequestEntry): boolean {
  return /^text\/event-stream\b/i.test(entry.contentType.trim());
}

/**
 * The tabs a request has. Headers and Timing always; Payload where it sent a
 * query or a body; Preview and Response where the browser lets the page see
 * the answer, and Preview for an image the page loaded too, as it can be
 * shown from its address; Initiator where something is known of what made
 * it; Cookies and EventStream only where there are some.
 */
export function tabsOf(entry: RequestEntry): Tab[] {
  const full = entry.detail === "full";
  const has: Record<Tab, boolean> = {
    Headers: true,
    Payload: full && (entry.requestBody !== null || queryString(entry.url) !== ""),
    Preview: full || isImage(entry),
    Response: full,
    Initiator: entry.initiator !== "" || entry.initiatorType !== "",
    Timing: true,
    Cookies: requestCookies(entry).length + responseCookies(entry).length > 0,
    EventStream: full && isEventStream(entry),
  };
  return TABS.filter((each) => has[each]);
}

/** The tab a request opens on: the one picked last where it has it, else Headers. */
export function startTab(entry: RequestEntry, picked: Tab | null): Tab {
  return picked !== null && tabsOf(entry).includes(picked) ? picked : "Headers";
}

/** An address's query, as written, without its `?`. */
export function queryString(url: string): string {
  try {
    return new URL(url).search.slice(1);
  } catch {
    return "";
  }
}

/**
 * The parameters of an address's query, a name and a value each: as they
 * read once decoded, or as written with `decoded` false.
 */
export function queryLines(url: string, decoded = true): [name: string, value: string][] {
  const query = queryString(url);
  if (decoded) return query === "" ? [] : [...new URLSearchParams(query)];
  return encodedLines(query);
}

/** The fields of a urlencoded text as written, a name and a value each, none of it decoded. */
export function encodedLines(text: string): [name: string, value: string][] {
  return text
    .split("&")
    .filter((part) => part !== "")
    .map((part) => {
      const at = part.indexOf("=");
      return at < 0 ? [part, ""] : [part.slice(0, at), part.slice(at + 1)];
    });
}

/** A urlencoded text decoded, its `+` a space, and left as it is where it does not decode. */
export function decodeForm(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

/** The standard text of the common statuses, for an answer that gave none, as HTTP/2 never does. */
const STATUS_TEXTS = new Map([
  [100, "Continue"],
  [101, "Switching Protocols"],
  [200, "OK"],
  [201, "Created"],
  [202, "Accepted"],
  [203, "Non-Authoritative Information"],
  [204, "No Content"],
  [205, "Reset Content"],
  [206, "Partial Content"],
  [300, "Multiple Choices"],
  [301, "Moved Permanently"],
  [302, "Found"],
  [303, "See Other"],
  [304, "Not Modified"],
  [307, "Temporary Redirect"],
  [308, "Permanent Redirect"],
  [400, "Bad Request"],
  [401, "Unauthorized"],
  [402, "Payment Required"],
  [403, "Forbidden"],
  [404, "Not Found"],
  [405, "Method Not Allowed"],
  [406, "Not Acceptable"],
  [408, "Request Timeout"],
  [409, "Conflict"],
  [410, "Gone"],
  [411, "Length Required"],
  [412, "Precondition Failed"],
  [413, "Content Too Large"],
  [414, "URI Too Long"],
  [415, "Unsupported Media Type"],
  [416, "Range Not Satisfiable"],
  [418, "I'm a teapot"],
  [422, "Unprocessable Content"],
  [425, "Too Early"],
  [426, "Upgrade Required"],
  [428, "Precondition Required"],
  [429, "Too Many Requests"],
  [431, "Request Header Fields Too Large"],
  [451, "Unavailable For Legal Reasons"],
  [500, "Internal Server Error"],
  [501, "Not Implemented"],
  [502, "Bad Gateway"],
  [503, "Service Unavailable"],
  [504, "Gateway Timeout"],
  [505, "HTTP Version Not Supported"],
]);

/**
 * The Status Code line of General, as the browsers' tools write it: the code
 * and its text, the answer's own or the standard one, or in brackets what
 * happened in place of one. Empty where the browser does not say.
 */
export function statusCode(entry: RequestEntry): string {
  if (entry.state === "pending") return "(pending)";
  if (entry.state === "aborted") return "(canceled)";
  if (entry.status === null) {
    if (entry.state !== "failed") return "";
    return entry.error ? `(failed) ${entry.error}` : "(failed)";
  }
  if (entry.status === 0) return "(opaque)";
  return `${entry.status} ${entry.statusText || STATUS_TEXTS.get(entry.status) || ""}`.trim();
}

/** A line of General: its label, its value, and the tone of the dot before a status. */
export interface GeneralLine {
  label: string;
  value: string;
  tone?: StatusTone | null;
}

/**
 * The General section of Headers, in the browsers' words. Remote Address is
 * left out, as a page cannot know it, and Referrer Policy shows only where it
 * is known: the request's own, else the page's, `documentPolicy`. A request
 * that was redirected shows where it ended, and the address it was asked for
 * after it.
 */
export function generalLines(entry: RequestEntry, documentPolicy = ""): GeneralLine[] {
  const moved = entry.finalUrl !== null && entry.finalUrl !== entry.url;
  const lines: GeneralLine[] = [{ label: "Request URL", value: moved && entry.finalUrl ? entry.finalUrl : entry.url }];
  if (moved) lines.push({ label: "Redirected From", value: entry.url });
  if (entry.method !== "") lines.push({ label: "Request Method", value: entry.method });
  const code = statusCode(entry);
  if (code !== "") lines.push({ label: "Status Code", value: code, tone: statusTone(entry) });
  const policy = entry.referrerPolicy || documentPolicy;
  if (policy !== "") lines.push({ label: "Referrer Policy", value: policy });
  return lines;
}

/** The note under Request Headers: the page knows the headers it set, and not the ones the browser adds. */
export const PROVISIONAL = "Provisional headers are shown";

/** Headers as the Raw view shows them, a `name: value` a line. */
export function rawHeaders(headers: HeaderList): string {
  return headers.map(([name, value]) => `${name}: ${value}`).join("\n");
}

/** What the Response tab says where there is no body: the browsers' words, or that one may still come. */
export const NO_RESPONSE_DATA = "This request has no response data available.";
export const FAILED_RESPONSE = "Failed to load response data";
export const WAITING_RESPONSE = "waiting for the response";

/** What stands in an answer's body's place while there is none. */
export function noResponse(entry: RequestEntry): string {
  if (entry.state === "pending") return WAITING_RESPONSE;
  return entry.state === "failed" && entry.status === null ? FAILED_RESPONSE : NO_RESPONSE_DATA;
}

/** What a body of a form shows a file as, as the browsers' tools do. */
export const BINARY = "(binary)";

/** The boundary a multipart content type names, or empty. */
export function boundaryOf(type: string): string {
  const found = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  return found?.[1] ?? found?.[2] ?? "";
}

/**
 * The fields of a multipart body, a name and a value each, a file as
 * `(binary)`. A part that is cut short is kept as far as it came.
 */
export function multipartFields(text: string, boundary: string): [name: string, value: string][] {
  if (boundary === "") return [];
  const fields: [string, string][] = [];
  const parts = text.split(`--${boundary}`).slice(1);
  for (const part of parts) {
    if (part.startsWith("--")) break;
    const body = part.replace(/^\r?\n/, "");
    const split = /\r?\n\r?\n/.exec(body);
    const head = split ? body.slice(0, split.index) : body;
    const value = split ? body.slice(split.index + split[0].length).replace(/\r?\n$/, "") : "";
    const disposition = /^content-disposition:(.*)$/im.exec(head)?.[1] ?? "";
    const name = /\bname="([^"]*)"/i.exec(disposition)?.[1] ?? /\bname=([^;\s]+)/i.exec(disposition)?.[1] ?? "";
    fields.push([name, /\bfilename\*?=/i.test(disposition) ? BINARY : value]);
  }
  return fields;
}

/** What `formText` in the recorder writes for a file. */
const FILE_LINE = /^\(file .*, \d+ bytes\)$/;

/**
 * What a request sent, as the Payload tab shows it: the fields of a form, json
 * as a tree, other text as it was kept, or a line that says why there is
 * none to show. A form's `source` is its text as it was kept, and `encoded`
 * says it is urlencoded, which can show as written or decoded.
 */
export type Payload =
  | { kind: "form"; lines: [name: string, value: string][]; source: string; encoded: boolean }
  | { kind: "json"; value: unknown; source: string }
  | { kind: "text"; text: string }
  | { kind: "line"; text: string };

export function payloadOf(record: BodyRecord): Payload {
  if (record.kind === "stream") return { kind: "line", text: "not read: a stream" };
  if (!hasText(record)) return { kind: "line", text: [bodyNote(record), record.type].filter(Boolean).join(", ") };
  if (record.text === "") return { kind: "line", text: "empty" };
  if (record.kind === "form") {
    const lines = formLines(record.text).map(([name, value]): [string, string] => [name, FILE_LINE.test(value) ? BINARY : value]);
    return { kind: "form", lines, source: record.text, encoded: false };
  }
  if (/x-www-form-urlencoded/i.test(record.type)) {
    return { kind: "form", lines: [...new URLSearchParams(record.text)], source: record.text, encoded: true };
  }
  if (/^multipart\/form-data/i.test(record.type)) {
    const lines = multipartFields(record.text, boundaryOf(record.type));
    if (lines.length > 0) return { kind: "form", lines, source: record.text, encoded: false };
  }
  const json = bodyJson(record);
  return json ? { kind: "json", value: json.value, source: record.text } : { kind: "text", text: record.text };
}

/** A size in the browsers' words: as many bytes as they are, `B`, `kB` and `MB` counted in thousands. */
export function devtoolsBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

/**
 * What the Timing tab shows under the timing: what the browsers' tools have
 * as columns of the list, Type, Size and Protocol, as the list here has none
 * of them, in the words of their tooltips. And whether it came from the
 * device frame.
 */
export function requestLines(entry: RequestEntry): [label: string, value: string][] {
  const lines: [string, string][] = [["Type", typeWord(entry)]];
  if (entry.contentType && entry.detail === "light") lines.push(["Content-Type", entry.contentType]);
  const sizes = entry.sizes;
  if (sizes?.hidden) lines.push(["Size", "hidden: the server sends no Timing-Allow-Origin"]);
  else if (sizes) {
    const over = sizes.transfer === 0 && sizes.decoded > 0 ? "(cache)" : `${devtoolsBytes(sizes.transfer)} transferred over network`;
    lines.push(["Size", `${over}, resource size: ${devtoolsBytes(sizes.decoded)}`]);
  }
  if (entry.protocol) lines.push(["Protocol", entry.protocol]);
  if (entry.source === "frame") lines.push(["Frame", "the device frame"]);
  return lines;
}

/** A time span as the Timing tab writes it: in µs under a ms, to two places in ms under a second, else in s. */
export function preciseDuration(ms: number): string {
  if (ms < 1) return `${Math.round(ms * 1000)} µs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** A phase of a request, from and to, in ms since its page began to load, and the tone of its bar. */
export interface Phase {
  label: string;
  start: number;
  end: number;
  tone: "queue" | "stall" | "dns" | "connect" | "ssl" | "wait" | "download";
}

/** The Timing tab in the browsers' words: when it was queued and started, its phases in their sections, and the whole. */
export interface TimingTable {
  /** When the page asked for it, in ms since its page began to load. */
  queuedAt: number;
  /** When the browser started it, where that is known. */
  startedAt: number | null;
  sections: { name: string; phases: Phase[] }[];
  /** Where the bars start and end, in ms since its page began to load. */
  from: number;
  to: number;
  /** From the ask to the last byte, in ms, or null while it runs. */
  total: number | null;
  /** The request has not ended: the browsers' `CAUTION: request is not finished yet!`. */
  pending: boolean;
  /** Why some phases are not shown, or empty. */
  note: string;
}

/** The browsers' warning over the timing of a request that has not ended. */
export const NOT_FINISHED = "CAUTION: request is not finished yet!";

/** Why the timing has no connection phases: a server on another origin keeps them. */
export const TIMING_HIDDEN =
  "The server on another origin sends no Timing-Allow-Origin, so the browser shows a page only the start and the end";

/** Why a script's request that ended has no phases: Resource Timing has none for it. */
export const TIMING_MISSING = "The browser gave no Resource Timing for this request, so only what the page saw is shown";

function phase(phases: Phase[], label: string, tone: Phase["tone"], start: number, end: number): void {
  if (end >= start) phases.push({ label, start, end, tone });
}

/**
 * A request's timing as the browsers' Timing tab lays it out, from Resource
 * Timing where it has the request and from what the page saw where it has
 * not. Resource Scheduling has Queueing, from the call to the browser's
 * start, which only a script's request knows. Connection Start has Stalled,
 * DNS Lookup, Initial connection and SSL, each where it took time: a
 * connection used again has none. Request/Response has Waiting for server
 * response and Content Download. Request sent is not there: Resource Timing
 * does not say when the request was all sent.
 */
export function timingTable(entry: RequestEntry): TimingTable {
  const { at, response, duration } = entry.timing;
  const p = entry.phases;
  // An open stream, or a body still coming, has its headers and no end yet.
  const running = entry.state === "pending" || entry.timing.end === null;
  const scheduling: Phase[] = [];
  const connection: Phase[] = [];
  const exchange: Phase[] = [];
  let note = "";
  if (p && entry.detail === "full" && p.startTime > at) phase(scheduling, "Queueing", "queue", at, p.startTime);
  if (p && p.requestStart > 0) {
    const dns = p.domainLookupEnd > p.domainLookupStart;
    const connect = p.connectEnd > p.connectStart;
    const from = p.fetchStart || p.startTime;
    const stalled = dns ? p.domainLookupStart : connect ? p.connectStart : p.requestStart;
    phase(connection, "Stalled", "stall", from, stalled);
    if (dns) phase(connection, "DNS Lookup", "dns", p.domainLookupStart, p.domainLookupEnd);
    if (connect) phase(connection, "Initial connection", "connect", p.connectStart, p.connectEnd);
    if (connect && p.secureConnectionStart > p.connectStart) phase(connection, "SSL", "ssl", p.secureConnectionStart, p.connectEnd);
    if (p.responseStart > 0) {
      phase(exchange, "Waiting for server response", "wait", p.requestStart, p.responseStart);
      phase(exchange, "Content Download", "download", p.responseStart, p.responseEnd);
    }
  } else if (entry.detail === "full" && response !== null) {
    // What the page saw: the headers came, then the body was all in.
    const start = p?.startTime ?? at;
    const headers = Math.max(start, at + response);
    phase(exchange, "Waiting for server response", "wait", start, headers);
    if (duration !== null) phase(exchange, "Content Download", "download", headers, Math.max(headers, at + duration));
    if (!running) note = p ? TIMING_HIDDEN : TIMING_MISSING;
  } else if (!running) note = p ? TIMING_HIDDEN : TIMING_MISSING;
  const all = [...scheduling, ...connection, ...exchange];
  const to = Math.max(at + (duration ?? 0), p?.responseEnd ?? 0, ...all.map((each) => each.end));
  const sections = [
    { name: "Resource Scheduling", phases: scheduling },
    { name: "Connection Start", phases: connection },
    { name: "Request/Response", phases: exchange },
  ].filter((each) => each.phases.length > 0);
  return {
    queuedAt: at,
    startedAt: p ? p.startTime : null,
    sections,
    from: Math.min(at, p?.startTime ?? at),
    to,
    total: duration,
    pending: running,
    note,
  };
}

/** A phase's bar on the track of the whole: where it starts and how wide it is, each a share of 1. */
export function barOf(table: Pick<TimingTable, "from" | "to">, each: Pick<Phase, "start" | "end">): { left: number; width: number } {
  const span = table.to - table.from;
  if (!(span > 0)) return { left: 0, width: 0 };
  const left = Math.min(1, Math.max(0, (each.start - table.from) / span));
  return { left, width: Math.min(1 - left, Math.max(0, (each.end - each.start) / span)) };
}

/** A cookie as the browsers' Cookies tab lists it. What is not known of it is empty, or false. */
export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** An instant in ISO, `Session`, or empty where it is not known, as for a cookie sent. */
  expires: string;
  /** How long it is: `name=value` sent, or the whole of the line that set it. */
  size: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  partitioned: boolean;
}

function cookie(name: string, value: string, size: number): Cookie {
  return { name, value, domain: "", path: "", expires: "", size, httpOnly: false, secure: false, sameSite: "", partitioned: false };
}

/** The cookies of a `Cookie` header: a `name=value` each, split at `;`. */
export function parseCookieHeader(header: string): Cookie[] {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const at = part.indexOf("=");
      return at < 0 ? cookie("", part, part.length) : cookie(part.slice(0, at).trim(), part.slice(at + 1).trim(), part.length);
    });
}

/**
 * The cookie a `Set-Cookie` line sets, with its attributes. Max-Age wins over
 * Expires, and is counted from `at`, when the answer came, in epoch ms.
 */
export function parseSetCookie(line: string, at: number): Cookie {
  const [first = "", ...attributes] = line.split(";");
  const [set] = parseCookieHeader(first);
  const found = { ...(set ?? cookie("", "", 0)), size: line.trim().length, expires: "Session" };
  let maxAge: number | null = null;
  for (const attribute of attributes) {
    const cut = attribute.indexOf("=");
    const key = (cut < 0 ? attribute : attribute.slice(0, cut)).trim().toLowerCase();
    const value = cut < 0 ? "" : attribute.slice(cut + 1).trim();
    if (key === "domain") found.domain = value;
    else if (key === "path") found.path = value;
    else if (key === "httponly") found.httpOnly = true;
    else if (key === "secure") found.secure = true;
    else if (key === "partitioned") found.partitioned = true;
    else if (key === "samesite") found.sameSite = value;
    else if (key === "max-age" && /^-?\d+$/.test(value)) maxAge = Number(value);
    else if (key === "expires" && maxAge === null) {
      const when = Date.parse(value);
      found.expires = Number.isFinite(when) ? new Date(when).toISOString() : value;
    }
  }
  if (maxAge !== null) found.expires = new Date(at + maxAge * 1000).toISOString();
  return found;
}

/** The cookies a request carried, as far as a script sees them: the ones it set itself in a `Cookie` header. */
export function requestCookies(entry: RequestEntry): Cookie[] {
  return entry.requestHeaders.filter(([name]) => name.toLowerCase() === "cookie").flatMap(([, value]) => parseCookieHeader(value));
}

/** The cookies its answer set, as far as a script sees them, which is most often none: browsers hide `Set-Cookie`. */
export function responseCookies(entry: RequestEntry): Cookie[] {
  const at = entry.timing.start + (entry.timing.response ?? 0);
  return entry.responseHeaders
    .filter(([name]) => name.toLowerCase() === "set-cookie")
    .flatMap(([, value]) => value.split("\n"))
    .filter((line) => line.trim() !== "")
    .map((line) => parseSetCookie(line, at));
}

/** A cookie's fields as the browsers' table names its columns, the ones known of it. */
export function cookieFields(each: Cookie): [label: string, value: string][] {
  const fields: [string, string][] = [
    ["Name", each.name],
    ["Value", each.value],
  ];
  if (each.domain) fields.push(["Domain", each.domain]);
  if (each.path) fields.push(["Path", each.path]);
  if (each.expires) fields.push(["Expires / Max-Age", each.expires]);
  fields.push(["Size", String(each.size)]);
  if (each.httpOnly) fields.push(["HttpOnly", "✓"]);
  if (each.secure) fields.push(["Secure", "✓"]);
  if (each.sameSite) fields.push(["SameSite", each.sameSite]);
  if (each.partitioned) fields.push(["Partitioned", "✓"]);
  return fields;
}

/** Whether a request is for an image, which Preview can show from its address. */
export function isImage(entry: RequestEntry): boolean {
  if (entry.method !== "" && entry.method !== "GET") return false;
  if (/^image\//i.test(entry.contentType)) return true;
  return entry.detail === "light" && kindLabel(entry) === "img";
}

/** What Preview says where it has nothing to show, in the browsers' words. */
export const NO_PREVIEW = "This request has no preview available";

/**
 * What the Preview tab shows, as the browsers' tools have it: json as a
 * tree, an image as itself, html drawn, a form as its fields, other text
 * as it is, and a line where there is nothing to show.
 */
export type PreviewShape =
  | { kind: "json"; value: unknown }
  | { kind: "image"; url: string }
  | { kind: "html"; html: string }
  | { kind: "fields"; lines: [name: string, value: string][] }
  | { kind: "code"; text: string; lang: Lang }
  | { kind: "line"; text: string };

export function previewOf(entry: RequestEntry): PreviewShape {
  const record = entry.responseBody;
  if (isImage(entry) && entry.state !== "pending" && entry.state !== "failed") return { kind: "image", url: entry.finalUrl ?? entry.url };
  if (!record) return { kind: "line", text: noResponse(entry) };
  if (!hasText(record)) return { kind: "line", text: NO_PREVIEW };
  if (record.text === "") return { kind: "line", text: NO_RESPONSE_DATA };
  const type = record.type || entry.contentType;
  if (record.kind === "text" && !record.truncated && isJson(type)) {
    try {
      return { kind: "json", value: JSON.parse(record.text) };
    } catch {
      // Not json after all: it shows as text.
    }
  }
  if (record.kind === "text" && /^text\/html\b/i.test(type.trim())) return { kind: "html", html: record.text };
  const shape = bodyShape(record, entry.contentType);
  if (shape.kind === "fields") return shape;
  if (shape.kind === "line") return shape;
  return { kind: "code", text: record.text, lang: record.kind === "form" ? "text" : langOf(type) };
}

/** What the html preview lets its document load: its inline styles and data images, and nothing from the network. */
export const PREVIEW_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`;

/** Recorded html made ready to draw: the policy first, after a doctype where it has one. */
export function previewDocument(text: string): string {
  return text.replace(/^(\s*<!doctype[^>]*>)?/i, (lead) => lead + PREVIEW_POLICY);
}

/** Where a request came from, a link a line, as the browsers' Request initiator chain has it. */
export interface ChainLink {
  url: string;
  /** How far in it stands, the page at 0. */
  depth: number;
  /** The request the detail shows. */
  self: boolean;
}

/**
 * The Request initiator chain: the page, the script that made the request
 * where its stack names one other than the page and devknobs, and the
 * request.
 */
export function initiatorChain(entry: RequestEntry, page: string, own = ""): ChainLink[] {
  const links: ChainLink[] = [];
  const add = (url: string): void => {
    if (links.some((link) => link.url === url)) return;
    links.push({ url, depth: links.length, self: false });
  };
  if (page !== "" && entry.kind !== "navigation") add(page);
  const first = stackLines(entry.initiator, own).find((line) => line.kind === "frame");
  const file = first?.kind === "frame" ? fileOf(first.frame.where) : "";
  if (/^https?:/i.test(file)) add(file);
  links.push({ url: entry.url, depth: links.length, self: true });
  return links;
}

/** What Resource Timing says loaded a thing, in the words a page knows it by. */
const INITIATOR_WORDS = new Map([
  ["img", "an <img> element"],
  ["image", "an <image> in SVG"],
  ["link", "a <link> element"],
  ["script", "a <script> element"],
  ["css", "a stylesheet"],
  ["iframe", "an <iframe> element"],
  ["frame", "a <frame> element"],
  ["video", "a <video> element"],
  ["audio", "an <audio> element"],
  ["track", "a <track> element"],
  ["input", "an <input type=image>"],
  ["object", "an <object> element"],
  ["embed", "an <embed> element"],
  ["body", "the <body> background"],
  ["fetch", "fetch()"],
  ["xmlhttprequest", "XMLHttpRequest"],
  ["beacon", "navigator.sendBeacon()"],
  ["navigation", "Navigation"],
  ["early-hints", "Early Hints"],
  ["other", "Other"],
]);

/** The initiator Resource Timing names, in words, as the browsers' Initiator column has `Other`. */
export function initiatorWords(type: string): string {
  return INITIATOR_WORDS.get(type) ?? type;
}

/** Why a stream read through `fetch` lists no messages. */
export const FETCH_STREAM = "Messages of a stream read through fetch are not recorded: reading a copy would keep the stream open after the page lets it go";

/** What EventStream says before the first message. */
export const NO_MESSAGES = "No messages yet";

/** One frame of a stack: the function, where it is in full, and that place in short. */
export interface Frame {
  name: string;
  where: string;
  /** The file's name with its line and column, without the way to it. */
  short: string;
}

/** A line of the initiator: a frame, or a run of frames that are not the page's own. */
export type StackLine = { kind: "frame"; frame: Frame } | { kind: "more"; frames: Frame[] };

/** Where a frame's address ends: its line and column. */
const PLACE = /(?::\d+){1,2}$/;

/** The file of a frame's address, without its line and column. */
function fileOf(where: string): string {
  return where.replace(PLACE, "");
}

function shortOf(where: string): string {
  const place = PLACE.exec(where)?.[0] ?? "";
  const file = fileOf(where).split(/[?#]/, 1)[0] ?? "";
  const name = file.split("/").filter((part) => part !== "").pop();
  return name === undefined ? where : `${name}${place}`;
}

/** A frame, as V8 writes one (`at fn (file:1:2)`) or as the others do (`fn@file:1:2`). */
function frameOf(line: string): Frame {
  const named = /^at (.*?) \((.*)\)$/.exec(line);
  const bare = /^at (.*)$/.exec(line);
  const other = /^(.*?)@(.*)$/.exec(line);
  const [name = "", where = ""] = named
    ? [named[1], named[2]]
    : bare
      ? ["", bare[1]]
      : other
        ? [other[1], other[2]]
        : [line, ""];
  return { name: name || "(anonymous)", where, short: shortOf(where) };
}

/** The file a stack starts in: of devknobs' own stack, the file devknobs runs from. */
export function stackFile(stack: unknown): string {
  if (typeof stack !== "string") return "";
  const first = stack
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^at |@/.test(line));
  return first === undefined ? "" : fileOf(frameOf(first).where);
}

/**
 * The call that made a request, a frame a line. Frames from `node_modules`,
 * and from `own`, the file devknobs runs from, are not the page's own: a run
 * of them is one line that says how many.
 */
export function stackLines(stack: string, own = ""): StackLine[] {
  const lines: StackLine[] = [];
  for (const text of stack.split("\n")) {
    if (text.trim() === "") continue;
    const frame = frameOf(text.trim());
    const quiet = /[\\/]node_modules[\\/]/.test(frame.where) || (own !== "" && fileOf(frame.where) === own);
    const last = lines[lines.length - 1];
    if (!quiet) lines.push({ kind: "frame", frame });
    else if (last?.kind === "more") last.frames.push(frame);
    else lines.push({ kind: "more", frames: [frame] });
  }
  return lines;
}

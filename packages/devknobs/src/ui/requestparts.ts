import { READ_MS } from "../requests/body";
import { BODY_CAP, type BodyRecord, type HeaderList, type RequestEntry, type RequestTiming } from "../requests/types";
import {
  bodyJson,
  bodyNote,
  bodyText,
  bytesLabel,
  durationLabel,
  hasText,
  kindLabel,
  type Lead,
  lead,
  sizeLabel,
  statusLine,
  type StatusTone,
  statusTone,
} from "./requestformat";

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

function kindWords(entry: RequestEntry): string {
  if (entry.kind === "fetch") return "fetch";
  if (entry.kind === "xhr") return "XMLHttpRequest";
  if (entry.kind === "navigation") return "the document";
  const by = entry.initiatorType ? `, loaded by ${entry.initiatorType}` : "";
  return `${kindLabel(entry)}${by}`;
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

/** The cookies a request carries or its answer sets, as far as a script sees them. */
export function cookieLines(entry: RequestEntry): [name: string, value: string][] {
  return [
    ...entry.requestHeaders.filter(([name]) => name.toLowerCase() === "cookie"),
    ...entry.responseHeaders.filter(([name]) => name.toLowerCase() === "set-cookie"),
  ];
}

/**
 * The tabs a request has. Headers and Timing always; Payload where it sent a
 * query or a body; Preview and Response where the browser lets the page see
 * the answer; Initiator where something is known of what made it; Cookies
 * and EventStream only where there are some.
 */
export function tabsOf(entry: RequestEntry): Tab[] {
  const full = entry.detail === "full";
  const has: Record<Tab, boolean> = {
    Headers: true,
    Payload: full && (entry.requestBody !== null || queryString(entry.url) !== ""),
    Preview: full,
    Response: full,
    Initiator: entry.initiator !== "" || entry.initiatorType !== "",
    Timing: true,
    Cookies: cookieLines(entry).length > 0,
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

/**
 * What the Timing tab shows besides the timing, until it has its own: what
 * the request is, how big, and where it came from.
 */
export function otherLines(entry: RequestEntry): [label: string, value: string][] {
  const lines: [string, string][] = [];
  if (entry.contentType) lines.push(["type", entry.contentType]);
  if (entry.sizes) lines.push(["size", sizeLabel(entry.sizes)]);
  if (entry.protocol) lines.push(["protocol", entry.protocol]);
  lines.push(["kind", kindWords(entry)]);
  if (entry.source === "frame") lines.push(["from", "the device frame"]);
  return lines;
}

/** A request's time in its two parts, in ms: to the answer's headers, and from them to the end. */
export interface TimingParts {
  waiting: number | null;
  download: number | null;
  total: number | null;
  /** How much of the whole each of the two is, or null while either is unknown. */
  shares: [waiting: number, download: number] | null;
}

export function timingParts(timing: RequestTiming): TimingParts {
  const { response, duration } = timing;
  if (response === null || duration === null) {
    return { waiting: response, download: null, total: duration, shares: null };
  }
  const waiting = Math.min(Math.max(0, response), duration);
  const download = duration - waiting;
  return {
    waiting,
    download,
    total: duration,
    shares: duration > 0 ? [waiting / duration, download / duration] : null,
  };
}

/** The timing as lines: when it started, its two parts where they are known, and the whole. */
export function timingLines(timing: RequestTiming, started: string): [label: string, value: string][] {
  const parts = timingParts(timing);
  const lines: [string, string][] = [["started at", started]];
  if (parts.waiting !== null) lines.push(["waiting", durationLabel(parts.waiting)]);
  if (parts.download !== null) lines.push(["download", durationLabel(parts.download)]);
  lines.push(["total", durationLabel(parts.total) || "still going"]);
  return lines;
}

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

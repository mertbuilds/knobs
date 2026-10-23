import { blank, type Clock } from "./record";
import type { RequestEntry, RequestPhases, RequestSizes, RequestSource } from "./types";

/**
 * How far before the browser's own start of a request the patch may have
 * noted it, in ms: the time the call takes to reach the network.
 */
export const MATCH_BEFORE = 250;

/** How far after, in ms: the two clocks round apart. */
export const MATCH_AFTER = 5;

function number(entry: object, key: string): number {
  const value: unknown = Reflect.get(entry, key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(entry: object, key: string): string {
  const value: unknown = Reflect.get(entry, key);
  return typeof value === "string" ? value : "";
}

function bare(url: string): string {
  return url.split("#", 1)[0] ?? url;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * The sizes of a timing entry. A server on another origin that does not allow
 * timing has all three read 0: those are hidden, not empty.
 */
export function sizesOf(entry: PerformanceEntry, origin: string): RequestSizes {
  const transfer = number(entry, "transferSize");
  const encoded = number(entry, "encodedBodySize");
  const decoded = number(entry, "decodedBodySize");
  const hidden = transfer + encoded + decoded === 0 && originOf(entry.name) !== origin;
  return { transfer, encoded, decoded, hidden };
}

/** The phases of a timing entry, as Resource Timing gives them. */
export function phasesOf(entry: PerformanceEntry): RequestPhases {
  return {
    startTime: entry.startTime,
    workerStart: number(entry, "workerStart"),
    redirectStart: number(entry, "redirectStart"),
    redirectEnd: number(entry, "redirectEnd"),
    fetchStart: number(entry, "fetchStart"),
    domainLookupStart: number(entry, "domainLookupStart"),
    domainLookupEnd: number(entry, "domainLookupEnd"),
    connectStart: number(entry, "connectStart"),
    secureConnectionStart: number(entry, "secureConnectionStart"),
    connectEnd: number(entry, "connectEnd"),
    requestStart: number(entry, "requestStart"),
    responseStart: number(entry, "responseStart"),
    responseEnd: number(entry, "responseEnd") || entry.startTime + entry.duration,
  };
}

/** The status, where the browser gives one. */
function statusOf(entry: PerformanceEntry): number | null {
  return number(entry, "responseStatus") || null;
}

/** A row for something the page loaded on its own, from the browser's timing of it. */
export function lightEntry(
  entry: PerformanceEntry,
  id: string,
  source: RequestSource,
  clock: Clock,
  origin: string,
): RequestEntry {
  const row = blank(id, entry.entryType === "navigation" ? "navigation" : "resource", source, clock, entry.startTime);
  const status = statusOf(entry);
  const end = number(entry, "responseEnd") || entry.startTime + entry.duration;
  const responseStart = number(entry, "responseStart");
  const duration = Math.max(0, end - entry.startTime);
  return {
    ...row,
    url: entry.name,
    state: status !== null && status >= 400 ? "failed" : "ok",
    status,
    contentType: text(entry, "contentType"),
    sizes: sizesOf(entry, origin),
    timing: {
      ...row.timing,
      response: responseStart > 0 ? Math.max(0, responseStart - entry.startTime) : null,
      end: row.timing.start + duration,
      duration,
    },
    phases: phasesOf(entry),
    initiatorType: text(entry, "initiatorType") || entry.entryType,
    protocol: text(entry, "nextHopProtocol"),
  };
}

/** The api a full row was made by, by what Resource Timing says loaded it. Chromium says `other` for an `EventSource`. */
const KINDS: Record<string, RequestEntry["kind"]> = { fetch: "fetch", xmlhttprequest: "xhr", other: "eventsource" };

/**
 * The full row the browser timed with `entry`, if any: the same address, made
 * by the same api, noted just before the browser started it, and not timed
 * yet. With several, the nearest in time.
 */
export function matchFull(
  rows: readonly RequestEntry[],
  entry: PerformanceEntry,
  source: RequestSource,
): RequestEntry | null {
  const kind = KINDS[text(entry, "initiatorType")];
  if (!kind) return null;
  const url = bare(entry.name);
  let best: RequestEntry | null = null;
  for (const row of rows) {
    if (row.kind !== kind || row.source !== source || row.sizes !== null) continue;
    const gap = entry.startTime - row.timing.at;
    if (gap < -MATCH_AFTER || gap > MATCH_BEFORE || bare(row.url) !== url) continue;
    if (!best || Math.abs(gap) < Math.abs(entry.startTime - best.timing.at)) best = row;
  }
  return best;
}

/** What the browser's timing adds to the full row it belongs to. */
export function mergeTiming(row: RequestEntry, entry: PerformanceEntry, origin: string): Partial<RequestEntry> {
  const end = number(entry, "responseEnd") || entry.startTime + entry.duration;
  const duration = Math.max(0, end - row.timing.at);
  return {
    sizes: sizesOf(entry, origin),
    phases: phasesOf(entry),
    protocol: text(entry, "nextHopProtocol"),
    initiatorType: text(entry, "initiatorType"),
    status: row.status || statusOf(entry),
    contentType: row.contentType || text(entry, "contentType"),
    // The browser knows when the last byte came. The patch may have stopped reading.
    timing: { ...row.timing, end: row.timing.start + duration, duration },
  };
}

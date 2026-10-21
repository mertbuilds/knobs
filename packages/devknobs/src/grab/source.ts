import type { Fiber } from "bippy";
import {
  getDefinitionFrameFromOwnedChild,
  getOwnerStack,
  getRawOwnerStack,
  getRawSource,
  getSource,
  getSourceMap,
  type StackFrame,
} from "bippy/source";
import { quietFetch } from "../requests/quiet";
import { displayName, isComposite } from "./fiber";
import { locateCall, locateJsx, type Place as SourcePlace } from "./locate";
import { classifySourcePath, normalizeFilePath, packageName, rememberRoot, rootOf } from "./paths";
import { isUsefulName, sourceName } from "./stack";
import type { ResolvedSource } from "./types";

/** How long a grab waits on bundles and source maps before it goes without them. */
export const TIMEOUT = 1500;

export interface Resolution {
  fiberSource: ResolvedSource | null;
  stack: StackFrame[];
}

export const EMPTY: Resolution = { fiberSource: null, stack: [] };

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/**
 * The fetch bippy reads bundles and source maps with. It only reaches the
 * page's own origin, a dev server, and never anything else. A package's file
 * is not read: its path already names it, and its bundle and map are large.
 * One function for every grab, so bippy keeps its source map cache across
 * them. The requests log leaves these out.
 */
export function sourceFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!sameOrigin(url) || packageName(url) !== null) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  const timeout = AbortSignal.timeout(TIMEOUT);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return quietFetch(url, { ...init, signal });
}

/** Resolves to `fallback` once `ms` pass or `signal` aborts, whichever is first. */
export function settle<T>(
  work: Promise<T>,
  fallback: T,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const done = (value: T) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => done(fallback);
    const timer = setTimeout(abort, ms);
    signal?.addEventListener("abort", abort, { once: true });
    work.then(done, abort);
  });
}

/** The parts of a frame a source map rewrites. */
interface Place {
  fileName?: string;
  functionName?: string;
  columnNumber?: number;
}

const ROOTED = /^(?:[a-z][a-z0-9+.-]*:|[/\\])/i;

/** An inline source map names its file next to its script. The path from the server's root. */
function scriptPath(fileName: string | undefined, script: string | undefined): string | undefined {
  if (!fileName || !script || ROOTED.test(fileName) || !/^https?:\/\//.test(script)) {
    return fileName;
  }
  try {
    const path = new URL(fileName, script).pathname;
    return path.startsWith("/@fs/") ? path.slice(4) : path.slice(1);
  } catch {
    return fileName;
  }
}

/** The function a frame names, a helper's lowercase name too, and not a minifier's one letter. */
function frameName(name: string | undefined, next: boolean): string | null {
  return name && name.length > 1 && isUsefulName(name, next) ? name : null;
}

/**
 * A place a source map gave, set right against the frame it came from. The
 * map's column counts from 0, where a stack and an editor count from 1. Its
 * path can be relative to the script. And its name is the token at the call,
 * `map` in `list.map(...)`, where the frame names the function itself.
 */
export function mapped<T extends Place>(place: T, raw: Place | null | undefined, next = false): T {
  return {
    ...place,
    fileName: scriptPath(place.fileName, raw?.fileName),
    functionName: frameName(raw?.functionName, next) ?? place.functionName,
    columnNumber:
      typeof place.columnNumber === "number" ? place.columnNumber + 1 : place.columnNumber,
  };
}

function ownerFiber(fiber: Fiber): Fiber | null {
  const owner: unknown = fiber._debugOwner;
  if (typeof owner !== "object" || owner === null || !("tag" in owner)) return null;
  return owner as Fiber;
}

/** The element a frame of the raw owner stack made, where its fiber is known. */
export interface Site {
  tag: string;
  host: boolean;
}

/**
 * The raw owner stack is every fiber's own stack, the element's first and its
 * owners' after. A fiber's first frame is where its jsx is written. The sites
 * by their place in the stack.
 */
function sites(fiber: Fiber, total: number): Map<number, Site> {
  const found = new Map<number, Site>();
  for (let current: Fiber | null = fiber; current; current = ownerFiber(current)) {
    const type: unknown = current.type;
    const tag = typeof type === "string" ? type : displayName(type);
    const start = total - getRawOwnerStack(current).length;
    if (tag && start < total) found.set(start, { tag, host: typeof type === "string" });
  }
  return found;
}

/** A module's text, for the jsx calls in it. A failed read leaves, so the next grab tries again. */
const codeCache = new Map<string, Promise<string | null>>();

function moduleCode(url: string): Promise<string | null> {
  let pending = codeCache.get(url);
  if (!pending) {
    pending = sourceFetch(url).then(
      (response) => (response.ok ? response.text() : null),
      () => null,
    );
    codeCache.set(url, pending);
    const own = pending;
    void own.then((code) => {
      if (code === null && codeCache.get(url) === own) codeCache.delete(url);
    });
  }
  return pending;
}

/** A source map's one source, with its text, to check a place against. */
export interface MappedSource {
  name: string;
  content: string;
}

/** Where the raw frame's call is in the transformed code, the column from 0. */
function callOf(raw: StackFrame): SourcePlace | null {
  return typeof raw.lineNumber === "number" && typeof raw.columnNumber === "number"
    ? { line: raw.lineNumber, column: raw.columnNumber - 1 }
    : null;
}

function placedAt(frame: StackFrame, source: MappedSource, place: SourcePlace): StackFrame {
  return {
    ...frame,
    fileName: source.name,
    lineNumber: place.line,
    columnNumber: place.column,
    isSymbolicated: true,
  };
}

/**
 * A frame set on the place its element is written, by a search of the source.
 * The map can leave a frame without a place, or put it on another element's
 * tag, even one of the same name. With nothing found, the frame stays as the
 * map left it.
 */
export function relocated(
  frame: StackFrame,
  raw: StackFrame,
  site: Site,
  source: MappedSource,
  code: string | null,
): StackFrame {
  const place = locateJsx(source.content, site.tag, site.host, code, callOf(raw));
  return place ? placedAt(frame, source, place) : frame;
}

/**
 * A frame that calls a function among the jsx, as `{list()}`, set on that
 * call in the source when the function is called there once, or once in the
 * frame's own function. Otherwise the frame stays as the map left it.
 */
export function recalled(
  frame: StackFrame,
  raw: StackFrame,
  source: MappedSource,
  code: string,
): StackFrame {
  const call = callOf(raw);
  const place = call && locateCall(source.content, code, call, raw.functionName ?? null);
  return place ? placedAt(frame, source, place) : frame;
}

/** Only a map of one source with its text, as a dev server's is, can be checked. */
async function mappedSource(url: string): Promise<MappedSource | null> {
  const map = await getSourceMap(url, true, sourceFetch);
  if (!map) return null;
  rememberRoot(rootOf(map.file, url));
  const [name] = map.sources;
  const content = map.sourcesContent?.[0];
  if (!name || !content || map.sources.length !== 1) return null;
  return { name, content };
}

async function siteFrame(frame: StackFrame, raw: StackFrame, site: Site): Promise<StackFrame> {
  const url = raw.fileName;
  const source = url ? await mappedSource(url) : null;
  if (!url || !source) return frame;
  const alone = relocated(frame, raw, site, source, null);
  return alone === frame ? relocated(frame, raw, site, source, await moduleCode(url)) : alone;
}

async function callFrame(frame: StackFrame, raw: StackFrame): Promise<StackFrame> {
  const url = raw.fileName;
  const source = url ? await mappedSource(url) : null;
  const code = url && source ? await moduleCode(url) : null;
  return source && code ? recalled(frame, raw, source, code) : frame;
}

/** A site's frame against its tag, any other but the definition's against the call it makes. */
function placeFrame(
  frame: StackFrame,
  raw: StackFrame | null | undefined,
  site: Site | undefined,
  index: number,
): Promise<StackFrame> {
  if (!raw) return Promise.resolve(frame);
  if (site) return siteFrame(frame, raw, site);
  return index > 0 ? callFrame(frame, raw) : Promise.resolve(frame);
}

/**
 * The owner stack with its mapped frames set right. bippy maps the frame of
 * the fiber's own definition first, then the raw owner stack, one for one.
 */
async function ownerStack(fiber: Fiber, stack: StackFrame[], next: boolean): Promise<StackFrame[]> {
  const raw = getRawOwnerStack(fiber);
  if (stack.length !== raw.length + 1) {
    return stack.map((frame) => (frame.isSymbolicated ? mapped(frame, null, next) : frame));
  }
  const first = getDefinitionFrameFromOwnedChild(fiber);
  const found = sites(fiber, raw.length);
  return Promise.all(
    stack.map(async (frame, index) => {
      const rawFrame = index === 0 ? first : raw[index - 1];
      const placed = await placeFrame(frame, rawFrame, found.get(index - 1), index);
      return placed.isSymbolicated ? mapped(placed, rawFrame, next) : placed;
    }),
  );
}

function ownerName(fiber: Fiber, next: boolean): string | null {
  const owner = ownerFiber(fiber);
  return owner && isComposite(owner) ? sourceName(displayName(owner.type), next) : null;
}

/**
 * An app frame as a source. A frame no map moved points into the transformed
 * module, past the file's own lines, so it keeps its file and drops its line.
 */
export function appSource(
  frame: StackFrame,
  fileName: string,
  componentName: string | null,
  next: boolean,
): ResolvedSource {
  const placed = next || frame.isSymbolicated === true;
  return {
    filePath: normalizeFilePath(fileName),
    lineNumber: placed ? (frame.lineNumber ?? null) : null,
    columnNumber: placed ? (frame.columnNumber ?? null) : null,
    componentName,
    origin: "app",
    symbolicated: frame.isSymbolicated === true,
  };
}

/**
 * Where the element itself is written: the first app frame of its own stack,
 * which is its owner at the line and column of the element's jsx.
 */
function ownSource(fiber: Fiber, stack: StackFrame[], next: boolean): ResolvedSource | null {
  const raw = getRawOwnerStack(fiber);
  if (stack.length !== raw.length + 1) return null;
  const owner = ownerFiber(fiber);
  const own = raw.length - (owner ? getRawOwnerStack(owner).length : 0);
  const frame = stack
    .slice(1, 1 + own)
    .find((item) => classifySourcePath(item.fileName).origin === "app");
  if (!frame?.fileName) return null;
  return appSource(frame, frame.fileName, sourceName(frame.functionName, next) ?? ownerName(fiber, next), next);
}

async function fiberSource(fiber: Fiber, next: boolean): Promise<ResolvedSource | null> {
  const found = await getSource(fiber, true, sourceFetch);
  if (!found?.fileName) return null;
  // React's own debug source is exact. Otherwise the line counts only when a source map moved it.
  const raw = fiber._debugSource ? null : getRawSource(fiber);
  const moved = !fiber._debugSource && found.fileName !== raw?.fileName;
  const source = moved ? mapped(found, raw, next) : found;
  const symbolicated = Boolean(fiber._debugSource) || moved;
  const placed = next || symbolicated;
  return {
    filePath: normalizeFilePath(source.fileName),
    lineNumber: placed ? (source.lineNumber ?? null) : null,
    columnNumber: placed ? (source.columnNumber ?? null) : null,
    componentName: sourceName(source.functionName, next) ?? ownerName(fiber, next),
    origin: classifySourcePath(source.fileName).origin,
    symbolicated,
  };
}

async function resolveFiber(fiber: Fiber, next: boolean): Promise<Resolution | null> {
  try {
    const stack = await ownerStack(fiber, await getOwnerStack(fiber, true, sourceFetch), next);
    const source = ownSource(fiber, stack, next) ?? (await fiberSource(fiber, next));
    return { fiberSource: source, stack };
  } catch {
    return null;
  }
}

/** Per fiber. A failed or timed out lookup leaves, so the next grab tries again. */
const cache = new WeakMap<Fiber, Promise<Resolution | null>>();

/**
 * The fiber's own source and its owner stack, both symbolicated through the
 * page's source maps where it serves them. Gives up after `TIMEOUT`, or when
 * `signal` aborts, with an empty resolution.
 */
export async function resolve(
  fiber: Fiber,
  next: boolean,
  signal?: AbortSignal,
): Promise<Resolution> {
  let pending = cache.get(fiber);
  if (!pending) {
    pending = resolveFiber(fiber, next);
    cache.set(fiber, pending);
    const own = pending;
    void own.then((value) => {
      if (value === null && cache.get(fiber) === own) cache.delete(fiber);
    });
  }
  const result = await settle<Resolution | null>(pending, null, TIMEOUT, signal);
  return result ?? EMPTY;
}

/**
 * Where a jsx element is written, found in the source itself. A dev server can
 * hand out a source map that is off, as a route split from its file is, and
 * then the map has no place for the call, or a wrong one.
 */

/** A place in a text. The line counts from 1 and the column from 0, as a source map's do. */
export interface Place {
  line: number;
  column: number;
}

const NAME_CHAR = /[\w$.-]/;

/** Characters a type argument follows, as in `useState<Row>`, and a jsx tag never does. */
const BEFORE_TYPE = /[\w$.)\]]/;

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function offsetOf(starts: number[], place: Place): number {
  const start = starts[place.line - 1];
  return start === undefined ? -1 : start + place.column;
}

function placeOf(starts: number[], offset: number): Place {
  let line = starts.length;
  while (line > 1 && (starts[line - 1] ?? 0) > offset) line -= 1;
  return { line, column: offset - (starts[line - 1] ?? 0) };
}

function opens(content: string, offset: number, tag: string): boolean {
  if (content[offset] !== "<") return false;
  const after = content[offset + 1 + tag.length];
  return content.startsWith(tag, offset + 1) && (after === undefined || !NAME_CHAR.test(after));
}

const WORD_CHAR = /\w/;

/**
 * The source with its comments and the insides of its strings blanked, every
 * line where it was. A quote or double quote right after a letter is an
 * apostrophe in jsx text, as is one with no closing quote on its line, and is
 * blanked too, so the quotes left are all closed. A backtick after a letter
 * is a tagged template's. `//` after a colon is a url's.
 */
export function codeOnly(content: string): string {
  const blanks: Array<[number, number]> = [];
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    const next = content[index + 1];
    let end = -1;
    if (char === "/" && next === "/" && content[index - 1] !== ":") {
      end = content.indexOf("\n", index);
      if (end === -1) end = content.length;
      blanks.push([index, end]);
    } else if (char === "/" && next === "*") {
      const close = content.indexOf("*/", index + 2);
      end = close === -1 ? content.length : close + 2;
      blanks.push([index, end]);
    } else if (char === '"' || char === "'" || char === "`") {
      const opensString = char === "`" || !WORD_CHAR.test(content[index - 1] ?? "");
      const close = opensString ? stringEnd(content, index) : -1;
      if (close === -1) {
        blanks.push([index, index + 1]);
        continue;
      }
      end = close + 1;
      blanks.push([index + 1, close]);
    }
    if (end !== -1) index = end - 1;
  }
  let code = "";
  let from = 0;
  for (const [start, end] of blanks) {
    code += content.slice(from, start) + content.slice(start, end).replace(/[^\n]/g, " ");
    from = end;
  }
  return code + content.slice(from);
}

/** Every place `<tag` is written in the source's code, in its order. Not in comments or strings. */
export function tagPlaces(content: string, tag: string): Place[] {
  const code = codeOnly(content);
  const starts = lineStarts(code);
  const places: Place[] = [];
  const open = `<${tag}`;
  for (let at = code.indexOf(open); at !== -1; at = code.indexOf(open, at + 1)) {
    const before = code[at - 1];
    if (!opens(code, at, tag) || (before !== undefined && BEFORE_TYPE.test(before))) continue;
    places.push(placeOf(starts, at));
  }
  return places;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Call {
  start: number;
  /** Just past the tag, inside the call's parentheses. */
  end: number;
  open: number;
  /** A `createElement` call, which carries its place in its props. */
  created: boolean;
}

/**
 * The calls that make `tag` in transformed code: `jsxDEV("h1", ...)` or `jsxDEV(Row, ...)`,
 * and `createElement("span", ...)`, which the dev transform writes for a key
 * after a spread. A call's name starts where a run of name characters does, so
 * the scan does not try again inside one, as in a long inline source map.
 */
export function jsxCalls(code: string, tag: string, host: boolean): Call[] {
  const name = host ? `["']${escape(tag)}["']` : escape(tag);
  const pattern = new RegExp(
    `(?<![\\w$.])[\\w$.]*(jsxs?(?:DEV)?|createElement)\\(\\s*${name}\\s*,`,
    "g",
  );
  return Array.from(code.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    open: match.index + match[0].indexOf("("),
    created: match[1] === "createElement",
  }));
}

/** Any jsx call, with the name of the component it makes. A host tag is a string and has none. */
const COMPONENT_CALL = /(?<![\w$.])[\w$.]*(?:jsxs?(?:DEV)?|createElement)\(\s*([\w$.]+)\s*,/g;

/**
 * The name the jsx call at `call` in transformed code makes its component
 * under, as written in the source: `CopyIcon` in `jsxDEV(CopyIcon, ...)`,
 * where the component's own name is `Copy`.
 */
export function jsxCallee(code: string, call: Place): string | null {
  const starts = lineStarts(code);
  const start = starts[call.line - 1];
  if (start === undefined) return null;
  const offset = start + call.column;
  const end = code.indexOf("\n", start);
  for (const match of code.slice(start, end === -1 ? undefined : end).matchAll(COMPONENT_CALL)) {
    const at = start + match.index;
    if (at <= offset && offset < at + match[0].length) return match[1] ?? null;
  }
  return null;
}

const IDENTIFIER_CHAR = /[\w$]/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const OPENS_CALL = /\s*\(/y;

/** The function a plain call at `call` in transformed code names: `list` in `list()`. */
export function calleeAt(code: string, call: Place): string | null {
  const offset = offsetOf(lineStarts(code), call);
  if (offset < 0) return null;
  let start = offset;
  while (start > 0 && IDENTIFIER_CHAR.test(code[start - 1] ?? "")) start -= 1;
  let end = offset;
  while (end < code.length && IDENTIFIER_CHAR.test(code[end] ?? "")) end += 1;
  const name = code.slice(start, end);
  OPENS_CALL.lastIndex = end;
  return IDENTIFIER.test(name) && OPENS_CALL.test(code) ? name : null;
}

function callOffsets(code: string, name: string): number[] {
  const pattern = new RegExp(`(?<![\\w$])(function\\s*\\*?\\s*)?${escape(name)}\\s*\\(`, "g");
  return Array.from(code.matchAll(pattern))
    .filter((match) => match[1] === undefined)
    .map((match) => match.index);
}

/** Every place `name(` is called in the source's code, in its order. Not where it is declared. */
export function callPlaces(content: string, name: string): Place[] {
  const starts = lineStarts(content);
  return callOffsets(codeOnly(content), name).map((offset) => placeOf(starts, offset));
}

/** From a function's parameters to its body's opening bracket, past a return type and an arrow. */
const BODY = /\s*(?::[^={}()]*)?(?:=>)?\s*[{(]/y;

/** Where `function name(...) {...}` or `name = (...) => ...` is written, from its name to its body's end. */
function bodyOf(code: string, name: string): [number, number] | null {
  const pattern = new RegExp(
    `(?<![\\w$])(?:function\\s*\\*?\\s*${escape(name)}\\s*|${escape(name)}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\*?\\s*)?)\\(`,
    "g",
  );
  const found = Array.from(code.matchAll(pattern));
  const [match] = found;
  if (!match || found.length !== 1) return null;
  const params = closeOf(code, match.index + match[0].length - 1);
  if (params === -1) return null;
  BODY.lastIndex = params + 1;
  const body = BODY.exec(code);
  if (!body) return null;
  const close = closeOf(code, body.index + body[0].length - 1);
  return close === -1 ? null : [match.index, close];
}

/**
 * The place a plain call, as `list()` among the jsx, is written in `content`,
 * for the call at `call` in the transformed `code`. A function called once in
 * the source has a place, and one called more than once has the place in the
 * body of `within`, the function that makes the call, when it calls it once.
 */
export function locateCall(
  content: string,
  code: string,
  call: Place,
  within: string | null = null,
): Place | null {
  const name = calleeAt(code, call);
  if (!name) return null;
  const source = codeOnly(content);
  let offsets = callOffsets(source, name);
  if (offsets.length > 1 && within) {
    const body = bodyOf(source, within);
    offsets = body ? offsets.filter((offset) => body[0] < offset && offset < body[1]) : [];
  }
  const [offset] = offsets;
  return offsets.length === 1 && offset !== undefined ? placeOf(lineStarts(content), offset) : null;
}

function stringEnd(code: string, start: number): number {
  const quote = code[start];
  for (let index = start + 1; index < code.length; index++) {
    const char = code[index];
    if (char === "\\") index += 1;
    else if (char === quote) return index;
    else if (quote === "`" && char === "$" && code[index + 1] === "{") {
      index = closeOf(code, index + 1);
      if (index === -1) return -1;
    } else if (quote !== "`" && char === "\n") return -1;
  }
  return -1;
}

/** The bracket that closes the one at `open`, past strings and comments. */
function closeOf(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index++) {
    const char = code[index];
    if (char === '"' || char === "'" || char === "`") {
      index = stringEnd(code, index);
    } else if (char === "/" && code[index + 1] === "/") {
      index = code.indexOf("\n", index);
    } else if (char === "/" && code[index + 1] === "*") {
      const end = code.indexOf("*/", index + 2);
      index = end === -1 ? -1 : end + 1;
    } else if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
    if (index === -1) return -1;
  }
  return -1;
}

/** The dev transform's own note of where the element is, the call's last argument but one. */
const DECLARED = /lineNumber:\s*(\d+)\s*,\s*columnNumber:\s*(\d+)\s*,?\s*\}\s*,\s*[\w$.]+\s*$/;

/** The same note in a `createElement` call's props, as their last one. */
const DECLARED_PROP =
  /__source:\s*\{[^{}]*lineNumber:\s*(\d+)\s*,\s*columnNumber:\s*(\d+)\s*,?\s*\}\s*,?\s*$/;

function noted(pattern: RegExp, text: string): Place | null {
  const match = pattern.exec(text);
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
}

function declaredPlace(code: string, call: Call): Place | null {
  if (!call.created) {
    const close = closeOf(code, call.open);
    return close === -1 ? null : noted(DECLARED, code.slice(call.end, close));
  }
  const props = code.indexOf("{", call.end);
  if (props === -1 || code.slice(call.end, props).trim() !== "") return null;
  const close = closeOf(code, props);
  return close === -1 ? null : noted(DECLARED_PROP, code.slice(props + 1, close));
}

/**
 * The place `<tag` is written in `content`, for the jsx call at `call` in the
 * transformed `code`. A tag written once is that one. Among several, the dev
 * transform's notes of line and column put the calls in the source's order,
 * even when the lines they name are off, and the call's rank picks the place.
 * A component can be written under another name than its own, as an import
 * alias is, and the call in the code gives that name. Null when the calls
 * and the tags do not pair up.
 */
export function locateJsx(
  content: string,
  tag: string,
  host: boolean,
  code: string | null,
  call: Place | null,
): Place | null {
  const name = (!host && code && call ? jsxCallee(code, call) : null) ?? tag;
  const places = tagPlaces(content, name);
  if (places.length === 1) return places[0] ?? null;
  if (places.length === 0 || !code || !call) return null;
  const calls = jsxCalls(code, name, host);
  if (calls.length !== places.length) return null;
  const offset = offsetOf(lineStarts(code), call);
  const own = calls.findIndex((item) => item.start <= offset && offset < item.end);
  if (own === -1) return null;
  const declared = calls.map((item) => declaredPlace(code, item));
  const mine = declared[own];
  if (!mine || declared.some((place) => place === null)) return null;
  const rank = declared.filter(
    (place) =>
      place !== null &&
      (place.line < mine.line || (place.line === mine.line && place.column < mine.column)),
  ).length;
  return places[rank] ?? null;
}

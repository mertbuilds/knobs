/**
 * Code as the browsers' own tools color it, small and with no parser: a
 * scan that tells strings, numbers, keywords, names and comments apart,
 * enough to read a body by. And json as a tree, a node at a time. All of it
 * from text alone, so none of it needs a page.
 */

/** What a piece of code is, which picks its color. */
export type TokenKind = "key" | "str" | "num" | "kw" | "tag" | "attr" | "com";

/** A piece of code and what it is, or "" for plain text. */
export type Token = [kind: TokenKind | "", text: string];

/** The kinds of code that are colored. Any other text is plain. */
export type Lang = "json" | "html" | "css" | "js" | "text";

/** The kind of code a content type holds. */
export function langOf(type: string): Lang {
  if (/[/+]json\b/i.test(type)) return "json";
  if (/html|[/+]xml\b|\/svg/i.test(type)) return "html";
  if (/\/css\b/i.test(type)) return "css";
  return /(java|ecma)script/i.test(type) ? "js" : "text";
}

/** One rule of a scan: what it matches at the place it is tried, and what that is. */
type Rule = [pattern: RegExp, kind: TokenKind | "" | ((text: string, rest: string) => TokenKind | "")];

const STRING = /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/y;
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/y;

const JSON_RULES: Rule[] = [
  [/"(?:[^"\\\n]|\\.)*"?/y, (_, rest) => (/^\s*:/.test(rest) ? "key" : "str")],
  [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, "num"],
  [/\b(?:true|false|null)\b/y, "kw"],
];

const KEYWORDS =
  "const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|null|undefined|true|false|void|delete|yield|super|static";

const JS_RULES: Rule[] = [
  [/\/\/[^\n]*/y, "com"],
  [BLOCK_COMMENT, "com"],
  [STRING, "str"],
  [/`(?:[^`\\]|\\[\s\S])*`?/y, "str"],
  [/\b(?:0x[0-9a-f]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)n?\b/iy, "num"],
  [new RegExp(`\\b(?:${KEYWORDS})\\b`, "y"), "kw"],
  [/[A-Za-z_$][\w$]*/y, ""],
];

const CSS_OUT: Rule[] = [
  [BLOCK_COMMENT, "com"],
  [STRING, "str"],
  [/@[\w-]+/y, "kw"],
  [/[^\s{},;/"'@]+/y, "tag"],
];

const CSS_IN: Rule[] = [
  [BLOCK_COMMENT, "com"],
  [STRING, "str"],
  // A selector inside a block, as in an at-rule, is what opens a block of its own.
  [/[^\s{};"']+(?=\s*\{)/y, "tag"],
  [/--[\w-]+|[a-zA-Z-]+(?=\s*:)/y, "key"],
  [/#[0-9a-fA-F]{3,8}\b|-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/y, "num"],
  [/![a-z]+/y, "kw"],
  [/[\w-]+/y, ""],
];

const HTML_OUT: Rule[] = [
  [/<!--[\s\S]*?(?:-->|$)/y, "com"],
  [/<![^>]*>?/y, "tag"],
  [/<\/?[\w:-]+/y, "tag"],
  [/[^<]+/y, ""],
];

const HTML_IN: Rule[] = [
  [/\/?>/y, "tag"],
  [STRING, "str"],
  [/[^\s=>/"']+/y, "attr"],
];

/** Pieces of one kind and the plain text between them, run together where they are of a kind. */
function push(tokens: Token[], kind: TokenKind | "", text: string): void {
  const last = tokens[tokens.length - 1];
  if (last && last[0] === kind) last[1] += text;
  else tokens.push([kind, text]);
}

/** The first rule that matches at `at`, and what it matched. */
function match(text: string, at: number, rules: readonly Rule[]): [kind: TokenKind | "", text: string] | null {
  for (const [pattern, kind] of rules) {
    pattern.lastIndex = at;
    const found = pattern.exec(text);
    if (!found || found[0] === "") continue;
    const piece = found[0];
    return [typeof kind === "function" ? kind(piece, text.slice(at + piece.length, at + piece.length + 64)) : kind, piece];
  }
  return null;
}

/** The rules that hold at a place in a text: css and html have one set inside a block or a tag and one outside. */
type Mode = (piece: string, inside: boolean) => boolean;

function scan(text: string, rules: readonly Rule[], inner?: readonly Rule[], turns?: Mode): Token[] {
  const tokens: Token[] = [];
  let inside = false;
  let at = 0;
  while (at < text.length) {
    const found = match(text, at, inside && inner ? inner : rules);
    const [kind, piece] = found ?? ["", text.charAt(at)];
    push(tokens, kind, piece);
    if (turns) inside = turns(piece, inside);
    at += piece.length;
  }
  return tokens;
}

/** The pieces of a text, in order, colored for its kind of code. */
export function tokens(text: string, lang: Lang): Token[] {
  if (lang === "json") return scan(text, JSON_RULES);
  if (lang === "js") return scan(text, JS_RULES);
  if (lang === "css") {
    let depth = 0;
    return scan(text, CSS_OUT, CSS_IN, (piece) => {
      if (piece === "{") depth++;
      else if (piece === "}") depth = Math.max(0, depth - 1);
      return depth > 0;
    });
  }
  if (lang === "html") return scan(text, HTML_OUT, HTML_IN, (piece, inside) => (inside ? !/>$/.test(piece) : /^<[\w/]/.test(piece)));
  return text === "" ? [] : [["", text]];
}

/** A text's pieces a line at a time, a piece over lines cut where they end. */
export function tokenLines(text: string, lang: Lang): Token[][] {
  const lines: Token[][] = [[]];
  for (const [kind, piece] of tokens(text, lang)) {
    const parts = piece.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part !== "") lines[lines.length - 1]?.push([kind, part]);
    });
  }
  return lines;
}

/** How far in a line starts, in characters, a tab as two. */
export function indentOf(line: string): number {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
  return lead.length + (lead.split("\t").length - 1);
}

/** A value of json as a leaf of a tree shows it: its text and what it is. */
export function jsonLeaf(value: unknown): Token {
  if (typeof value === "string") return ["str", JSON.stringify(value)];
  if (typeof value === "number") return ["num", String(value)];
  if (value === null || typeof value === "boolean") return ["kw", String(value)];
  return ["", String(value)];
}

/** Whether a value of json opens to more: an object or an array. */
export function jsonOpens(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** What a node of json holds, a key and a value each: an array's by index. */
export function jsonEntries(value: object): [key: string, value: unknown][] {
  return Array.isArray(value) ? value.map((each, index) => [String(index), each]) : Object.entries(value);
}

/** How much of a node a preview shows, in characters. */
export const PREVIEW_CHARS = 100;

/** A value inside a preview: a leaf as it is, a node in short. */
function inner(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  return jsonOpens(value) ? "{…}" : jsonLeaf(value)[1];
}

/**
 * A node of json in a line, as the browsers' tools show it before it opens:
 * `{id: 7, name: "Ada"}` and `[1, 2, 3]`, what is inside a level down in
 * short, and cut with `…` past `PREVIEW_CHARS`.
 */
export function jsonPreview(value: object, max = PREVIEW_CHARS): string {
  const list = Array.isArray(value);
  const [open, close] = list ? ["[", "]"] : ["{", "}"];
  let text = "";
  for (const [key, each] of jsonEntries(value)) {
    const part = `${text === "" ? "" : ", "}${list ? "" : `${key}: `}${inner(each)}`;
    if (open.length + text.length + part.length + close.length > max) return `${open}${text}${text === "" ? "" : ", "}…${close}`;
    text += part;
  }
  return `${open}${text}${close}`;
}

/**
 * The colours a site names for itself, read from the start of its HTML, for
 * the device's own screen around the page: the status bar and the browser's
 * bars. Nothing here touches the page or the network. Every colour that leaves
 * this file is one this file wrote, as `#rrggbb` or `#rrggbbaa`, so no text of
 * the site asked goes out with it.
 */

/** A colour for each scheme of the device, where the site names one. */
export type Look = { dark?: string; light?: string };

// The 16 colours of CSS 1, and the second spelling of gray.
const NAMED: Record<string, string> = {
  aqua: '#00ffff',
  black: '#000000',
  blue: '#0000ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  lime: '#00ff00',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  purple: '#800080',
  red: '#ff0000',
  silver: '#c0c0c0',
  teal: '#008080',
  white: '#ffffff',
  yellow: '#ffff00',
};

// No colour a page writes by hand is longer than this.
const MAX_COLOR = 64;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/u;
const FUNCTION = /^(rgb|hsl)a?\(([^()]*)\)$/u;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/u;

function clamp(value: number, most: number): number {
  return Math.min(Math.max(value, 0), most);
}

function pair(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

/** A number, or a share of `whole` where it is a percentage. Null for anything else. */
function amount(part: string, whole: number): number | null {
  const percent = part.endsWith('%');
  const digits = percent ? part.slice(0, -1) : part;
  if (!NUMBER.test(digits)) {
    return null;
  }
  return percent ? (Number(digits) * whole) / 100 : Number(digits);
}

/** The parts of `rgb()` or `hsl()`, in the form with commas or the one with spaces and a slash. */
function parts(inside: string): Array<string> | null {
  if (inside.includes(',')) {
    const all = inside.split(',').map((part) => part.trim());
    return all.length === 3 || all.length === 4 ? all : null;
  }
  const [channels = '', alpha, ...rest] = inside.split('/').map((part) => part.trim());
  const all = channels.split(/\s+/u);
  if (rest.length > 0 || all.length !== 3) {
    return null;
  }
  return alpha === undefined ? all : [...all, alpha];
}

/** Hue, saturation and lightness as red, green and blue, each from 0 to 255. */
function fromHsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const turn = (((hue % 360) + 360) % 360) / 30;
  const reach = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const step = (offset + turn) % 12;
    return (lightness - reach * Math.max(-1, Math.min(step - 3, 9 - step, 1))) * 255;
  };
  return [channel(0), channel(8), channel(4)];
}

function fromFunction(name: string, inside: string): string | null {
  const [first, second, third, fourth] = parts(inside) ?? [];
  if (first === undefined || second === undefined || third === undefined) {
    return null;
  }
  const alpha = fourth === undefined ? 1 : amount(fourth, 1);
  if (alpha === null) {
    return null;
  }
  let channels: [number | null, number | null, number | null];
  if (name === 'rgb') {
    channels = [amount(first, 255), amount(second, 255), amount(third, 255)];
  } else {
    const hue = NUMBER.test(first.replace(/deg$/u, '')) ? Number.parseFloat(first) : null;
    // Saturation and lightness are percentages; the form with spaces may leave the sign out.
    const saturation = amount(second.replace(/%$/u, ''), 1);
    const lightness = amount(third.replace(/%$/u, ''), 1);
    if (hue === null || saturation === null || lightness === null) {
      return null;
    }
    channels = fromHsl(hue, clamp(saturation, 100) / 100, clamp(lightness, 100) / 100);
  }
  const [red, green, blue] = channels;
  if (red === null || green === null || blue === null) {
    return null;
  }
  const opacity = pair(clamp(alpha, 1) * 255);
  return `#${pair(clamp(red, 255))}${pair(clamp(green, 255))}${pair(clamp(blue, 255))}${opacity === 'ff' ? '' : opacity}`;
}

/**
 * A CSS colour as `#rrggbb`, or `#rrggbbaa` where it is not opaque. It reads
 * hex in its four lengths, `rgb()` and `rgba()` with numbers or percentages,
 * `hsl()` and `hsla()` with a hue in degrees, and the names in `NAMED`. Null
 * for all else: `var()`, a gradient, `transparent`, `currentcolor`, a system
 * colour.
 */
export function normalizeColor(value: string): string | null {
  const color = value.trim().toLowerCase();
  if (color.length > MAX_COLOR) {
    return null;
  }
  if (HEX.test(color)) {
    const digits = color.slice(1);
    const long = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
    return `#${long.length === 8 && long.endsWith('ff') ? long.slice(0, 6) : long}`;
  }
  const named = Object.hasOwn(NAMED, color) ? NAMED[color] : undefined;
  if (named !== undefined) {
    return named;
  }
  const called = FUNCTION.exec(color);
  return called === null ? null : fromFunction(called[1] ?? '', called[2] ?? '');
}

/** A colour that can be seen. One with no opacity at all says nothing of the page. */
function seen(value: string | undefined): string | null {
  const color = value === undefined ? null : normalizeColor(value);
  return color === null || (color.length === 9 && color.endsWith('00')) ? null : color;
}

/** Splits at `mark` where it is not inside brackets, as in `url(data:a;b)`. */
function split(text: string, mark: RegExp): Array<string> {
  const all: Array<string> = [];
  let depth = 0;
  let part = '';
  for (const char of text) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(depth - 1, 0);
    }
    if (depth === 0 && mark.test(char)) {
      all.push(part);
      part = '';
    } else {
      part += char;
    }
  }
  all.push(part);
  return all;
}

/**
 * The background colour of an inline `style`. The last `background` or
 * `background-color` in it decides, as in CSS, so one that cannot be read
 * (`var()`, an image, a gradient) leaves no colour and an earlier one does not
 * stand in for it.
 */
export function backgroundOf(style: string | undefined): string | null {
  let found: string | null = null;
  for (const declaration of split(style ?? '', /;/u)) {
    const colon = declaration.indexOf(':');
    const name = declaration.slice(0, colon).trim().toLowerCase();
    if (colon !== -1 && (name === 'background' || name === 'background-color')) {
      found = seen(declaration.slice(colon + 1).replace(/!\s*important\s*$/iu, ''));
    }
  }
  return found;
}

type Tag = { attrs: Map<string, string>; closing: boolean; end: number; name: string };

const TAG = /<(\/?)([a-z][^\s/>]*)/iuy;
// One attribute, with what comes before it: its name, and a value in either quote or in none.
const ATTR = /[\s/]*(?:([^\s/>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?)?/uy;

/** The tag that starts at `at`, null where there is none, and `cut` where the text ends inside it. */
function readTag(html: string, at: number): Tag | 'cut' | null {
  TAG.lastIndex = at;
  const open = TAG.exec(html);
  if (open === null) {
    return null;
  }
  const attrs = new Map<string, string>();
  let index = TAG.lastIndex;
  while (index < html.length) {
    ATTR.lastIndex = index;
    const [, name, double, single, bare] = ATTR.exec(html) ?? [];
    index = ATTR.lastIndex;
    if (name !== undefined) {
      // The first attribute of a name is the one that counts, as in the browsers.
      if (!attrs.has(name.toLowerCase())) {
        attrs.set(name.toLowerCase(), double ?? single ?? bare ?? '');
      }
    } else if (html[index] === '>') {
      return {
        attrs,
        closing: open[1] === '/',
        end: index + 1,
        name: (open[2] ?? '').toLowerCase(),
      };
    } else {
      // A lone `=`.
      index += 1;
    }
  }
  return 'cut';
}

// Elements whose inside is text, not tags.
const TEXT = new Map([
  ['script', /<\/script/giu],
  ['style', /<\/style/giu],
  ['textarea', /<\/textarea/giu],
  ['title', /<\/title/giu],
]);

const SCHEME = /prefers-color-scheme\s*:\s*(dark|light)/iu;

/**
 * Reads the colours out of the start of a page. This is a look through the
 * head for a few tags, not an HTML parser. It skips comments and the inside of
 * `script`, `style`, `title` and `textarea`, and stops at the `body` tag or
 * where the text ends inside a tag.
 *
 * `<meta name="theme-color">` comes first. One with a `prefers-color-scheme`
 * media gives that scheme its colour, one with no media gives both, less the
 * scheme that has its own, and one with any other media is not read. The first
 * of each kind counts. With no theme colour at all, the inline background of
 * `html` gives both schemes, else that of `body`.
 *
 * `done` says that more of the page would change nothing.
 */
export function scanLook(html: string): { done: boolean; look: Look } {
  let any: string | null = null;
  let dark: string | null = null;
  let light: string | null = null;
  let page: string | null = null;
  let done = false;
  let head = true;
  let at = html.indexOf('<');
  while (at !== -1 && !done) {
    const comment = html.startsWith('<!--', at);
    const tag = comment ? null : readTag(html, at);
    if (tag === 'cut') {
      break;
    }
    let next = tag === null ? at + 1 : tag.end;
    const inside = tag === null || tag.closing ? undefined : TEXT.get(tag.name);
    if (comment) {
      const end = html.indexOf('-->', at + 4);
      next = end === -1 ? html.length : end + 3;
    } else if (tag === null) {
      // A `<` that starts no tag.
    } else if (inside !== undefined) {
      inside.lastIndex = tag.end;
      next = inside.exec(html)?.index ?? html.length;
    } else if (tag.closing) {
      if (tag.name === 'head') {
        head = false;
        done = (any ?? dark ?? light) !== null;
      }
    } else if (tag.name === 'meta' && head) {
      const color =
        tag.attrs.get('name')?.trim().toLowerCase() === 'theme-color'
          ? seen(tag.attrs.get('content'))
          : null;
      const media = tag.attrs.get('media')?.trim() ?? '';
      const scheme = SCHEME.exec(media)?.[1]?.toLowerCase();
      if (color !== null && media === '') {
        any ??= color;
      } else if (color !== null && scheme === 'dark') {
        dark ??= color;
      } else if (color !== null && scheme === 'light') {
        light ??= color;
      }
    } else if (tag.name === 'html') {
      page ??= backgroundOf(tag.attrs.get('style'));
    } else if (tag.name === 'body') {
      page ??= backgroundOf(tag.attrs.get('style'));
      head = false;
      done = true;
    }
    at = html.indexOf('<', next);
  }
  const themed = (any ?? dark ?? light) !== null;
  const look: Look = {};
  const forDark = themed ? (dark ?? any) : page;
  const forLight = themed ? (light ?? any) : page;
  if (forDark !== null) {
    look.dark = forDark;
  }
  if (forLight !== null) {
    look.light = forLight;
  }
  return { done, look };
}

const WRITTEN = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/u;

/**
 * The colours in the check's answer, read with no trust in its shape: only a
 * value this file could have written passes. Null where there is none.
 */
export function readLook(data: unknown): Look | null {
  if (typeof data !== 'object' || data === null || !('look' in data)) {
    return null;
  }
  const from = data.look;
  if (typeof from !== 'object' || from === null) {
    return null;
  }
  const look: Look = {};
  if ('dark' in from && typeof from.dark === 'string' && WRITTEN.test(from.dark)) {
    look.dark = from.dark;
  }
  if ('light' in from && typeof from.light === 'string' && WRITTEN.test(from.light)) {
    look.light = from.light;
  }
  return look.dark === undefined && look.light === undefined ? null : look;
}

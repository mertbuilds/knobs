import type { Actions, Look, Painted, Shapes } from "./browserkit";
import { CHARGE, el, glyphAt, MORPH, place, svgNode, textWidth } from "./browserkit";
import { type Color, luminance, parseColor, parseHex } from "./color";
import {
  alphaAt,
  type Bars,
  type Fade,
  type Glyph,
  type Mark,
  SAFARI_TEXT,
  type Shape,
  type StatusBar,
  type StatusColumn,
} from "./browserui";
import type { Rect } from "./mock";

/**
 * iOS 26 Safari: Liquid Glass capsules over the page's own color and the
 * status bar. No home indicator: it goes once you switch apps, and here none
 * are switched. The glyphs are drawn here from the common ideas
 * (a chevron, a box with an arrow, an open book), not from Apple's symbols.
 * Colors are sampled from the simulator.
 */

/** The domain's weight, medium and untracked as on the iOS 26.5 simulator. */
const DOMAIN_WEIGHT = 500;

export const SAFARI_CSS = `
.safari {
  color: #000;
  /* Minimizing: the shape morphs over --duration-very-slow, the parts that
     leave go in 60% of it, and the address's own glyphs in --duration-quick. */
  --main: ${MORPH.minimize}ms;
  --side: 300ms;
  --side-delay: 0ms;
  --icon: 150ms;
  --icon-delay: 0ms;
}
/* Expanding: --duration-slow, the shape leads and the parts come in after it. */
.safari[data-state="max"] {
  --main: ${MORPH.expand}ms;
  --side: 250ms;
  --side-delay: 120ms;
  --icon: 250ms;
  --icon-delay: 150ms;
}
.safari.dark { color: #f3f3f8; }
.safari .surface > *, .safari .side > *, .safari .field > * { position: absolute; }
/* Glass over the page: a fill in the tone of the page under it, which shows faintly through, blurred. */
.safari .capsule, .safari .surface {
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
.safari [data-tone="light"] { color: #000; }
.safari [data-tone="dark"] { color: #fff; }
/* Light glass has no hairline, only a soft wide shadow. */
.safari [data-rim="none"] { box-shadow: 0 6px 24px rgba(0, 0, 0, 0.065); }
/* Glass in a page's hue: a lighter rim of its own color. */
.safari [data-rim="tint"] {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 6px 24px rgba(0, 0, 0, 0.1);
}
/* Dark glass: a faint rim, brighter along the top, and no shadow. */
.safari [data-rim="highlight"] {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09), inset 0 1px 0.5px rgba(255, 255, 255, 0.14);
}
.safari .field { background: rgba(0, 0, 0, 0.05); }
.safari [data-tone="dark"] .field { background: rgba(0, 0, 0, 0.14); }
.safari .glyph {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.safari .glyph .solid { fill: currentColor; stroke: none; }
/* Reload and stop are a shade lighter than the other glyphs and thinner, as measured. */
.safari .glyph .reload { stroke-width: 1.6; }
.safari .glyph .stop { stroke-width: 1.82; }
.safari [data-tone="light"] .glyph .reload, .safari [data-tone="light"] .glyph .stop { stroke: #191919; }
/* A button that does nothing: its glyph at 30%, #babac7 on white glass, #58585b on dark. */
.safari .glyph.off { stroke-opacity: 0.3; fill-opacity: 0.3; }
.safari .domain {
  left: 50%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  font-size: ${SAFARI_TEXT.field}px;
  font-weight: ${DOMAIN_WEIGHT};
  transform: translate(-50%, -50%);
}
.safari .time { font-weight: 600; transform: translate(-50%, -50%); }
.safari .status { fill: currentColor; }
/* One surface morphs: its box, corners and color, and the domain glides in it. */
.safari .surface {
  overflow: hidden;
  transition:
    left var(--main) ${MORPH.ease},
    top var(--main) ${MORPH.ease},
    width var(--main) ${MORPH.ease},
    height var(--main) ${MORPH.ease},
    border-radius var(--main) ${MORPH.ease},
    background-color var(--main) ${MORPH.ease},
    box-shadow var(--main) ${MORPH.ease};
}
/* A minimized Safari's wash under the status bar comes and goes with the bars. */
.safari .scrim { left: 0; right: 0; opacity: 0; transition: opacity var(--main) ${MORPH.ease}; }
.safari[data-state="min"] .scrim[data-on="true"] { opacity: 1; }
.safari .domain, .safari .fade {
  transition:
    top var(--main) ${MORPH.ease},
    height var(--main) ${MORPH.ease},
    transform var(--main) ${MORPH.ease};
}
/* The parts only the expanded bars have: an icon swap, out early, in late. */
.safari .full {
  transition:
    opacity var(--icon) ease-in-out var(--icon-delay),
    filter var(--icon) ease-in-out var(--icon-delay),
    transform var(--icon) ease-in-out var(--icon-delay);
}
.safari[data-state="min"] .full {
  opacity: 0;
  filter: blur(2px);
  transform: scale(0.9);
  pointer-events: none;
}
/* The capsules beside it fade and drift a few px toward where the bars go. */
.safari .side {
  transition:
    opacity var(--side) ease-in-out var(--side-delay),
    filter var(--side) ease-in-out var(--side-delay),
    transform var(--side) ${MORPH.ease} var(--side-delay);
}
.safari[data-state="min"] .side {
  opacity: 0;
  filter: blur(2px);
  transform: translate(var(--dx, 0px), var(--dy, 0px)) scale(0.96);
}
.safari[data-state="min"] .side *, .safari[data-state="min"] .full * { pointer-events: none; }
.safari[data-state="min"] .surface.tap { pointer-events: auto; cursor: pointer; }
.browser[data-instant] * { transition: none !important; }
/* A page loading: a blue line along the bottom of the address, as wide as the load has come. */
.safari .progress {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 3px;
  transform-origin: 0 50%;
  background: #007aff;
  pointer-events: none;
}
.safari.dark .progress { background: #0a84ff; }
`;

/**
 * How the progress line goes, as Safari's does: a quick start, a long creep
 * that never reaches the end, then the rest of the way and a fade once the
 * page is in, in ms. Still, it stands at a share of the way instead.
 */
const PROGRESS = {
  start: 0.25,
  most: 0.9,
  creep: 8000,
  finish: 200,
  fade: 250,
  still: 0.3,
} as const;

function path(d: string, className?: string): SVGPathElement {
  return svgNode("path", className ? { d, class: className } : { d });
}

/** The glyphs in css px, centered on 0, 0, sized to the boxes measured in the simulator. */
const GLYPHS: Record<Glyph, () => Shapes> = {
  // 10.3 x 18
  back: () => [path("M4.2 -8L-4.2 0L4.2 8")],
  forward: () => [path("M-4.2 -8L4.2 0L-4.2 8")],
  // 19.3 x 24.3, a box open at the top with an arrow out of it
  share: () => [
    path("M-3.2 -2.6H-4.7A3 3 0 0 0 -7.7 0.4V8.3A3 3 0 0 0 -4.7 11.3H4.7A3 3 0 0 0 7.7 8.3V0.4A3 3 0 0 0 4.7 -2.6H3.2"),
    path("M0 4.4V-11.1M-4.1 -7L0 -11.1L4.1 -7"),
  ],
  // 24 x 20, an open book
  bookmarks: () => [
    path(
      "M0 -6.4C-2.6 -8.5 -6.6 -9.1 -11.1 -8.1V7.6C-6.6 6.7 -2.6 7.3 0 9.1C2.6 7.3 6.6 6.7 11.1 7.6V-8.1C6.6 -9.1 2.6 -8.5 0 -6.4ZM0 -6.4V9.1",
    ),
  ],
  // 23 x 22.7, a square over the corner of another
  tabs: () => [
    path("M-5.4 5.2H-7.4A3.2 3.2 0 0 1 -10.6 2V-7.2A3.2 3.2 0 0 1 -7.4 -10.4H2.2A3.2 3.2 0 0 1 5.4 -7.2V-5.2"),
    svgNode("rect", { x: -5.4, y: -5.2, width: 16, height: 15.6, rx: 3.2 }),
  ],
  // 14.9 x 17.6, a circle from 3 o'clock round to just past 12, a right angle arrow at its end
  reload: () => [
    path("M6.66 0.92A6.59 6.59 0 1 1 2.93 -5.02", "reload"),
    path("M-0.15 -8.89L3.26 -5.33L-0.16 -1.93", "reload"),
  ],
  // 15.5 x 18, a page over two lines
  page: () => [
    svgNode("rect", { x: -6.8, y: -8.1, width: 13.6, height: 8.6, rx: 2.4 }),
    path("M-6.8 4.2H6.8M-6.8 8.1H2.6"),
  ],
  // Three dots 4 across, 7.8 apart.
  more: () => [-7.8, 0, 7.8].map((x) => svgNode("circle", { cx: x, cy: 0, r: 2, class: "solid" })),
  plus: () => [path("M0 -8.5V8.5M-8.5 0H8.5")],
  home: () => [],
  tune: () => [],
  switcher: () => [],
  menu: () => [],
};

/** Safari's stop, 13.4 x 13.4, in reload's place while a page loads. */
function stopGlyph(): Shapes {
  return [path("M-5.66 -5.54L5.88 6M5.88 -5.54L-5.66 6", "stop")];
}

/**
 * The status bar's glyphs, measured on the iOS 26.5 simulator in pt, on the
 * 17 Pro and, a size up, on the 17 Pro Max and the Air. Each sits on the
 * island's center line: the time's digits a little under it, the bars and
 * wifi by their bottom and the battery by its middle, `drop` px down.
 */
export const STATUS_GLYPHS = {
  regular: {
    time: { size: 17, spacing: -0.09, drop: 1 },
    /** The gap between the bars, wifi and the battery. */
    gap: 7.67,
    signal: { width: 3.33, pitch: 5.33, heights: [4.67, 7, 9.67, 12.33], radius: 1, drop: 6.4 },
    // Three bands round the bottom corner, their ends rounded by a stroke `round` wide.
    wifi: {
      width: 16.33,
      height: 12.33,
      bands: [0, 2.83, 5.5, 7.07, 9.73, 11.33],
      angle: 42.6,
      round: 1,
      drop: 6.4,
    },
    battery: {
      width: 25,
      height: 13,
      line: 1,
      radius: 4.33,
      inset: 2,
      fill: 2.67,
      cap: [1.33, 4.33],
      drop: 0.17,
    },
  },
  large: {
    time: { size: 18, spacing: -0.09, drop: 0.83 },
    gap: 7.67,
    signal: { width: 3.67, pitch: 6, heights: [5.33, 7.67, 10.67, 13.67], radius: 1.1, drop: 6.67 },
    wifi: {
      width: 19,
      height: 13.67,
      bands: [0, 3.14, 6.09, 7.83, 10.78, 12.57],
      angle: 45.4,
      round: 1.1,
      drop: 6.67,
    },
    battery: {
      width: 28.33,
      height: 14.33,
      line: 1.1,
      radius: 4.67,
      inset: 2.33,
      fill: 3,
      cap: [1.67, 5],
      drop: -0.17,
    },
  },
} as const;

type Glyphs = (typeof STATUS_GLYPHS)[keyof typeof STATUS_GLYPHS];

/** Wifi's size: its box, the bands' radii in pairs, their angle each side of up, and their rounding. */
interface WifiSize {
  width: number;
  height: number;
  bands: readonly number[];
  angle: number;
  round: number;
}

/** A ring sector `from` to `to` px out of the corner, `angle` degrees each side of up. */
function fan(from: number, to: number, angle: number): string {
  const rad = (angle * Math.PI) / 180;
  const at = (r: number, side: number) =>
    `${(side * r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
  const inner = from > 0 ? `L${at(from, 1)}A${from} ${from} 0 0 0 ${at(from, -1)}Z` : "L0 0Z";
  return `M${at(to, -1)}A${to} ${to} 0 0 1 ${at(to, 1)}${inner}`;
}

/** Wifi, its bottom on `bottom`: a dot and two bands fanning out of the bottom corner. */
function wifi(x: number, bottom: number, size: WifiSize): SVGSVGElement {
  const { width, height, bands, angle, round } = size;
  const viewBox = `${-width / 2} ${round / 2 - height} ${width} ${height}`;
  const svg = svgNode("svg", { class: "status", viewBox });
  place(svg, x, bottom - height, width, height);
  const stroke = { "stroke-linejoin": "round", stroke: "currentColor", "stroke-width": round };
  const pairs = [0, 2, 4].map((at) => fan(bands[at] ?? 0, bands[at + 1] ?? 0, angle));
  svg.append(...pairs.map((d) => svgNode("path", { d, ...stroke })));
  return svg;
}

/** Cellular, its bottom on `bottom`: four bars rising left to right. */
function signal(x: number, bottom: number, size: Glyphs["signal"]): SVGSVGElement {
  const { width, pitch, heights, radius } = size;
  const tall = Math.max(...heights);
  const wide = pitch * (heights.length - 1) + width;
  const svg = svgNode("svg", { class: "status", viewBox: `0 0 ${wide} ${tall}` });
  place(svg, x, bottom - tall, wide, tall);
  svg.append(
    ...heights.map((height, at) =>
      svgNode("rect", { x: at * pitch, y: tall - height, width, height, rx: radius }),
    ),
  );
  return svg;
}

/** The battery's whole width: the cell, a 1 px gap and its cap. */
export function batteryWidth(size: Glyphs["battery"]): number {
  return size.width + 1 + size.cap[0];
}

/**
 * iOS 26's battery, in px of its box: a cell outlined at 40% of the glyph's
 * color, a clear gap, a bar inside as wide as the charge, and the cap apart
 * from the cell, at half. No percentage, as iOS shows it by default.
 */
export function batteryParts(size: Glyphs["battery"], charge: number) {
  const { width, height, line, radius, inset, fill, cap } = size;
  const level = ((width - 2 * inset) * charge) / 100;
  const [capWidth, capHeight] = cap;
  return {
    outline: {
      x: line / 2,
      y: line / 2,
      width: width - line,
      height: height - line,
      rx: radius - line / 2,
      "stroke-width": line,
    },
    level: {
      x: inset,
      y: inset,
      width: level,
      height: height - 2 * inset,
      rx: Math.min(fill, level / 2),
    },
    cap: { x: width + 1, y: (height - capHeight) / 2, width: capWidth, height: capHeight },
  };
}

/** The battery, its middle on `middle`. */
function battery(x: number, middle: number, size: Glyphs["battery"]): SVGSVGElement {
  const wide = batteryWidth(size);
  const svg = svgNode("svg", { class: "status", viewBox: `0 0 ${wide} ${size.height}` });
  place(svg, x, middle - size.height / 2, wide, size.height);
  const { outline, level, cap } = batteryParts(size, CHARGE);
  // The cap's outer end is round.
  const r = Math.min(cap.width, cap.height / 2);
  const end = cap.x + cap.width;
  const bottom = cap.y + cap.height;
  svg.append(
    svgNode("rect", { ...outline, fill: "none", stroke: "currentColor", "stroke-opacity": 0.4 }),
    svgNode("rect", level),
    svgNode("path", {
      d:
        `M${cap.x} ${cap.y}H${end - r}A${r} ${r} 0 0 1 ${end} ${cap.y + r}` +
        `V${bottom - r}A${r} ${r} 0 0 1 ${end - r} ${bottom}H${cap.x}Z`,
      "fill-opacity": 0.5,
    }),
  );
  return svg;
}

/** The time at its center, the icons beside the island, or the SE's either side of the time. */
function statusBar(status: StatusBar): Element[] {
  const glyphs = status.large ? STATUS_GLYPHS.large : STATUS_GLYPHS.regular;
  const time = el("div", "time", "04:20");
  time.style.left = `${status.time.x}px`;
  time.style.top = `${status.time.y + glyphs.time.drop}px`;
  time.style.fontSize = `${status.time.size}px`;
  time.style.letterSpacing = `${glyphs.time.spacing}px`;
  const { icons } = status;
  const { signal: bars, wifi: air, battery: cell } = glyphs;
  if (icons.align === "start") {
    // The SE's icons are a size smaller, on the time's line. An estimate from its 2x screenshots.
    const end = status.battery ?? { x: icons.x, y: icons.y };
    const bottom = icons.y + Math.max(...bars.heights) / 2;
    const nodes = [
      signal(icons.x, bottom, bars),
      wifi(icons.x + 23, icons.y + air.height / 2, air),
      battery(end.x - batteryWidth(cell), end.y, cell),
    ];
    for (const node of nodes) node.style.transform = "scale(0.85)";
    return [time, ...nodes];
  }
  const right = icons.x - batteryWidth(cell);
  const middle = right - glyphs.gap - air.width;
  const left = middle - glyphs.gap - (bars.pitch * (bars.heights.length - 1) + bars.width);
  return [
    time,
    signal(left, icons.y + bars.drop, bars),
    wifi(middle, icons.y + air.drop, air),
    battery(right, icons.y + cell.drop, cell),
  ];
}

/**
 * The Duo cover screen's status column, measured on Apple's picture of it in
 * pt: the ring is open at the bottom, its ends 55 degrees each side of
 * straight down, and the signal's four dots, 4.4 round, sit on its circle in
 * the gap, 11 and 32 degrees each side. Wifi in the ring is 17.9 by 14.3,
 * its bands the large set's to that height. The ring's arc is the battery:
 * as much of it as the charge, the rest at 35%.
 */
export const DUO_GLYPHS = {
  time: { spacing: 0, drop: 0.8 },
  ends: 55,
  dots: [-32, -11, 11, 32],
  dot: 2.2,
  rest: 0.35,
  wifi: {
    width: 17.9,
    height: 14.3,
    bands: [0, 3.57, 6.93, 8.91, 12.27, 14.3],
    angle: 38.7,
    round: 1.1,
    drop: 0,
  },
} as const;

/** The point `angle` degrees round from the right, clockwise on screen, `r` out. */
function onCircle(r: number, angle: number): string {
  const rad = (angle * Math.PI) / 180;
  return `${(r * Math.cos(rad)).toFixed(2)} ${(r * Math.sin(rad)).toFixed(2)}`;
}

/** An arc of radius `r` from `from` to `to` degrees, clockwise on screen. */
function arc(r: number, from: number, to: number): string {
  const large = to - from > 180 ? 1 : 0;
  return `M${onCircle(r, from)}A${r} ${r} 0 ${large} 1 ${onCircle(r, to)}`;
}

/** The ring, centered on `x`, `y`: the battery's arc over the top, the signal's dots in its gap. */
function ring(x: number, y: number, size: StatusColumn["ring"]): SVGSVGElement {
  const { radius, stroke } = size;
  const reach = radius + stroke;
  const svg = svgNode("svg", { class: "status ring", viewBox: `${-reach} ${-reach} ${2 * reach} ${2 * reach}` });
  place(svg, x - reach, y - reach, 2 * reach, 2 * reach);
  // Down is 90 degrees: from the left end, over the top, round to the right end.
  const from = 90 + DUO_GLYPHS.ends;
  const to = 450 - DUO_GLYPHS.ends;
  const charged = from + ((to - from) * CHARGE) / 100;
  const line = { fill: "none", stroke: "currentColor", "stroke-width": stroke, "stroke-linecap": "round" };
  svg.append(
    svgNode("path", { d: arc(radius, charged, to), ...line, "stroke-opacity": DUO_GLYPHS.rest }),
    svgNode("path", { d: arc(radius, from, charged), ...line }),
    ...DUO_GLYPHS.dots.map((angle) => {
      const rad = ((90 + angle) * Math.PI) / 180;
      return svgNode("circle", { cx: radius * Math.cos(rad), cy: radius * Math.sin(rad), r: DUO_GLYPHS.dot });
    }),
  );
  return svg;
}

/** The Duo's status column: the time, and under it the ring round wifi. */
function statusColumn(column: StatusColumn): Element[] {
  const time = el("div", "time", "04:20");
  time.style.left = `${column.x}px`;
  time.style.top = `${column.time.y + DUO_GLYPHS.time.drop}px`;
  time.style.fontSize = `${column.time.size}px`;
  time.style.letterSpacing = `${DUO_GLYPHS.time.spacing}px`;
  const air = DUO_GLYPHS.wifi;
  return [
    time,
    ring(column.x, column.ring.y, column.ring),
    wifi(column.x - air.width / 2, column.ring.y + air.height / 2, air),
  ];
}

/** What a glyph does when pressed, where it does anything. */
function pressOf(glyph: Glyph, actions: Actions): (() => void) | undefined {
  if (glyph === "back") return actions.back;
  if (glyph === "forward") return actions.forward;
  if (glyph === "reload") return actions.reload;
  return undefined;
}

/** A glyph at its mark, placed inside a box whose corner is at `origin`. */
function glyphIn(mark: Mark, origin: Rect, className: string, actions: Actions): SVGSVGElement {
  const svg = glyphAt(mark, GLYPHS, 30, className, pressOf(mark.glyph, actions));
  svg.style.left = `${mark.x - origin.x - 15}px`;
  svg.style.top = `${mark.y - origin.y - 15}px`;
  return svg;
}

/** The address as Safari shows it: the host alone, without its port. */
export function domainOf(host: string): string {
  return host.replace(/:\d+$/, "");
}

/**
 * The minimized domain pill's box: 18.5 px either side of its text's ink,
 * measured on the iOS 26.5 simulator, which is 16.5 either side of the
 * text's advance.
 */
export function pillBox(pill: Shape, host: string): Rect {
  const width = Math.round(textWidth(domainOf(host), SAFARI_TEXT.pill, DOMAIN_WEIGHT)) + 33;
  return { x: pill.x - width / 2, y: pill.y, width, height: pill.height };
}

/** A color's hue in degrees, its saturation and its lightness, both from 0 to 1. */
function hslOf({ red, green, blue }: Color): [number, number, number] {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const lightness = (high + low) / 2;
  const span = high - low;
  if (span === 0) return [0, 0, lightness];
  const saturation = span / (1 - Math.abs(2 * lightness - 1));
  const hue = high === r ? (g - b) / span + 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return [(hue * 60) % 360, saturation, lightness];
}

function fromHsl(hue: number, saturation: number, lightness: number): Color {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const at = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((at % 2) - 1));
  const sectors = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const [r = 0, g = 0, b = 0] = sectors[Math.floor(at) % 6] ?? [];
  const m = lightness - chroma / 2;
  return { red: (r + m) * 255, green: (g + m) * 255, blue: (b + m) * 255, alpha: 1 };
}

function hexOf({ red, green, blue }: Color): string {
  const pair = (channel: number) =>
    Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, "0");
  return `#${pair(red)}${pair(green)}${pair(blue)}`;
}

/** How Safari's glass looks over a color of the page. */
export interface Tint {
  /** The glass's color where the page under it is that color all over. */
  fill: string;
  /** The tone of the glyphs and text on it. */
  glyph: "light" | "dark";
  /** Its edge: none and a soft shadow, a rim of its own hue, or dark glass's highlight. */
  rim: "none" | "tint" | "highlight";
}

/**
 * The glass over `under` in a page of `scheme`, from pairs measured on the
 * iOS 26.5 simulator. The glass takes its tone from the page under it, not
 * from the scheme: light content gives near-white glass (#fefefe, a little
 * grayer at #f8f8f8 in dark), dark content #191919 glass, and saturated
 * content glass in its own hue, lighter in light (#1e5bd7 gives #78b8ff with
 * dark glyphs) and deeper in dark (#1661fd with white glyphs). Colors in
 * between mix the two by how saturated they are.
 */
export function glassTint(under: Color, scheme: "light" | "dark"): Tint {
  const [hue, saturation, lightness] = hslOf(under);
  // Light content is the content black text reads better on than white.
  const light = luminance(under.red, under.green, under.blue) > 0.179;
  const gray = light ? (scheme === "light" ? 0xfe : 0xf8) : 0x19;
  const neutral: Color = { red: gray, green: gray, blue: gray, alpha: 1 };
  const hued =
    scheme === "light"
      ? fromHsl(hue - 8, Math.min(1, saturation + 0.245), Math.min(0.9, lightness + 0.255))
      : fromHsl(hue + 1, Math.min(1, saturation + 0.225), Math.min(0.85, lightness + 0.06));
  const chroma = saturation * (1 - Math.abs(2 * lightness - 1));
  const share = Math.min(1, chroma / 0.7);
  const mix = (a: number, b: number) => a + (b - a) * share;
  const fill: Color = {
    red: mix(neutral.red, hued.red),
    green: mix(neutral.green, hued.green),
    blue: mix(neutral.blue, hued.blue),
    alpha: 1,
  };
  const glyph = luminance(fill.red, fill.green, fill.blue) > 0.3 ? "dark" : "light";
  const rim = share > 0.3 ? "tint" : glyph === "light" ? "highlight" : "none";
  return { fill: hexOf(fill), glyph, rim };
}

/** How much of the page under it the glass hides. */
const GLASS_ALPHA = 0.9;

/**
 * The glass's own fill, which shows the page faintly through, so that over
 * a page of `under` all over it reads as `fill`.
 */
function glassFill(fill: Color, under: Color): string {
  const own = (want: number, page: number) =>
    Math.min(255, Math.max(0, Math.round((want - (1 - GLASS_ALPHA) * page) / GLASS_ALPHA)));
  const [r, g, b] = [
    own(fill.red, under.red),
    own(fill.green, under.green),
    own(fill.blue, under.blue),
  ];
  return `rgba(${r}, ${g}, ${b}, ${GLASS_ALPHA})`;
}

const WHITE: Color = { red: 255, green: 255, blue: 255, alpha: 1 };

/** The page's color under the point of the screen nearest `x`, `y`, else the page's own. */
export function underAt(look: Look, x: number, y: number): Color {
  let best: string | null = null;
  let far = Infinity;
  for (const sample of look.under) {
    const distance = Math.hypot(sample.x - x, sample.y - y);
    if (distance < far) {
      far = distance;
      best = sample.color;
    }
  }
  return parseColor(best ?? look.background) ?? WHITE;
}

/** Tint a piece of glass for the page under its middle. */
function tintGlass(node: HTMLElement, box: Rect, look: Look): Color {
  const under = underAt(look, box.x + box.width / 2, box.y + box.height / 2);
  const tint = glassTint(under, look.scheme);
  node.style.backgroundColor = glassFill(parseHex(tint.fill) ?? WHITE, under);
  node.dataset.tone = tint.glyph === "dark" ? "light" : "dark";
  node.dataset.rim = tint.rim;
  return under;
}

/**
 * The scroll edge's tone over content of `under`, as the simulator draws it:
 * a shade darker in the same hue (white to #fcfcfc, #1e5bd7 to #1d54c9 by
 * the bars), and none over dark content.
 */
export function edgeTone(under: Color): Color | null {
  if (luminance(under.red, under.green, under.blue) < 0.03) return null;
  const [, saturation, lightness] = hslOf(under);
  const share = 0.988 - 0.08 * saturation * (1 - Math.abs(2 * lightness - 1));
  return { red: under.red * share, green: under.green * share, blue: under.blue * share, alpha: 1 };
}

function placeBox(node: HTMLElement, box: Rect, radius: number): void {
  place(node, box.x, box.y, box.width, box.height);
  node.style.borderRadius = `${radius}px`;
}

/**
 * The scroll edge's box and its gradient. Over a page drawn to the screen's
 * bottom it darkens the content under the bars a shade, `under`'s tone at
 * its last stop. Over the frame's end it fades the page into the screen's
 * color under it.
 */
function placeFade(node: HTMLElement, fade: Fade | null, look: Look, edge: Color | null): void {
  const last = fade?.stops.at(-1)?.alpha ?? 1;
  const bottom = parseColor(look.bottom) ?? WHITE;
  const tone = edge ? edgeTone(edge) : bottom;
  node.hidden = fade === null || tone === null;
  if (!fade || !tone) return;
  node.style.right = fade.width === undefined ? "0" : "";
  node.style.width = fade.width === undefined ? "" : `${fade.width}px`;
  node.style.top = `${fade.y}px`;
  node.style.height = `${fade.height}px`;
  // Reach the tone at the last stop's opacity: the shade's own color sits that much further from the content.
  const toward = (channel: number, page: number) =>
    edge ? Math.max(0, Math.round(page - (page - channel) / last)) : Math.round(channel);
  const base = edge ?? bottom;
  const [r, g, b] = [
    toward(tone.red, base.red),
    toward(tone.green, base.green),
    toward(tone.blue, base.blue),
  ];
  const stops = fade.stops.map(({ at, alpha }) => `rgba(${r}, ${g}, ${b}, ${alpha}) ${at}px`);
  node.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
}

/** `top` over `under`, `alpha` of the way. */
function over(top: Color, under: Color, alpha: number): Color {
  const mix = (a: number, b: number) => a * alpha + b * (1 - alpha);
  return {
    red: mix(top.red, under.red),
    green: mix(top.green, under.green),
    blue: mix(top.blue, under.blue),
    alpha: 1,
  };
}

/**
 * Lay the minimized bars' scrim in the page's color, and say what the status
 * bar then shows under its glyphs: the content at the top of the page through
 * the scrim. Null where a fixed or sticky bar holds the top, which keeps its
 * color as the strip, and where the bars have no scrim.
 */
export function scrimOver(node: HTMLElement, mini: Bars, look: Look): Color | null {
  const { scrim, status } = mini;
  const held = look.top !== look.background;
  node.dataset.on = String(scrim !== null && !held);
  if (!scrim || held) return null;
  const page = parseColor(look.background) ?? WHITE;
  const { red, green, blue } = page;
  node.style.top = `${scrim.y}px`;
  node.style.height = `${scrim.height}px`;
  const stops = scrim.stops.map(({ at, alpha }) => `rgba(${red}, ${green}, ${blue}, ${alpha}) ${at}px`);
  node.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
  const content = underAt(look, scrim.at.x, scrim.at.y);
  return over(page, content, alphaAt(scrim, status?.time.y ?? 0));
}

/**
 * Safari's bars, drawn once for both states (the plus to menu morph of
 * transitions.dev). The address capsule, Bottom's card or Top's address bar
 * is one surface that becomes the minimized pill: its box and corners tween,
 * the domain glides and scales from 17 to 13 px in it, and the page menu,
 * reload and Bottom's buttons fade out as an icon swap. The capsules beside
 * it fade and drift 10 px. The scroll edge moves on the same curve.
 */
export function buildSafari(full: Bars, mini: Bars, look: Look, actions: Actions): Painted {
  const root = el("div", "safari");
  root.style.inset = "0";
  const fade = el("div", "fade");
  fade.style.left = "0";
  fade.style.right = "0";
  const scrim = el("div", "scrim");
  root.append(scrim, fade);
  if (full.status) root.append(...statusBar(full.status));
  if (full.column) root.append(...statusColumn(full.column));
  const pill = mini.shapes.find((shape) => shape.kind === "pill") ?? null;
  // The shape that becomes the pill: the one with the domain, or Bottom's card.
  const main = pill
    ? (full.shapes.find((shape) => shape.kind === "card") ??
      full.shapes.find((shape) => shape.text !== undefined) ??
      null)
    : null;
  let surface: HTMLElement | null = null;
  let domain: HTMLElement | null = null;
  const glyphs: { node: SVGSVGElement; glyph: Glyph }[] = [];
  const keep = (node: SVGSVGElement, glyph: Glyph) => {
    glyphs.push({ node, glyph });
    return node;
  };
  if (main && pill) {
    surface = el("div", main.kind === "card" ? "surface from-card" : "surface");
    const field = full.shapes.find((shape) => shape.kind === "field");
    if (field) {
      // Bottom: the field inside the card, and the buttons under it, leave.
      const inner = el("div", "field full");
      placeBox(inner, { ...field, x: field.x - main.x, y: field.y - main.y }, field.radius);
      for (const mark of field.marks) {
        inner.append(keep(glyphIn(mark, field, "", actions), mark.glyph));
      }
      surface.append(inner);
    }
    for (const mark of main.marks) {
      const node = keep(glyphIn(mark, main, "full", actions), mark.glyph);
      // Bottom's buttons keep their share of the card's width as it shrinks.
      if (main.kind === "card") {
        node.style.left = `calc(${((mark.x - main.x) / main.width) * 100}% - 15px)`;
      } else if (mark.x > main.x + main.width / 2) {
        // Reload rides the right end.
        node.style.left = "";
        node.style.right = `${main.x + main.width - mark.x - 15}px`;
      }
      surface.append(node);
    }
    domain = el("div", "domain");
    const text = (field ?? main).text;
    // Clear of the page menu and reload at its ends.
    domain.style.maxWidth = `${(field ?? main).width - 96}px`;
    domain.dataset.top = String((text?.y ?? main.y) - main.y);
    surface.append(domain);
    const expand = actions.expand;
    if (expand) {
      surface.classList.add("tap");
      surface.addEventListener("click", () => {
        if (root.dataset.state === "min") expand();
      });
    }
    root.append(surface);
  }
  const progress = el("div", "progress");
  progress.hidden = true;
  surface?.append(progress);
  /** Each load, so a finish that a new load cut short leaves the line alone. */
  let loads = 0;
  const sides: { node: HTMLElement; box: Rect }[] = [];
  // Everything else leaves as a side capsule, toward the surface, or up when turned across.
  for (const shape of full.shapes) {
    if (shape === main || shape.kind === "field") continue;
    const side = el("div", "side capsule");
    placeBox(side, shape, shape.radius);
    sides.push({ node: side, box: shape });
    const middle = shape.x + shape.width / 2;
    const across = full.orientation === "landscape";
    const toward = main ? main.x + main.width / 2 : middle;
    side.style.setProperty("--dx", across ? "0px" : `${Math.sign(toward - middle) * 10}px`);
    // Top's bottom capsule goes down, the turned row up.
    const dy = across ? -12 : main && shape.y > main.y + main.height ? 12 : 0;
    side.style.setProperty("--dy", `${dy}px`);
    for (const mark of shape.marks) {
      side.append(keep(glyphIn(mark, shape, "", actions), mark.glyph));
    }
    if (shape.text) {
      const text = el("div", "domain");
      text.style.top = `${shape.text.y - shape.y}px`;
      text.style.maxWidth = `${shape.width - 96}px`;
      side.append(text);
    }
    root.append(side);
  }
  return {
    root,
    apply(minimized, sight) {
      root.dataset.state = minimized ? "min" : "max";
      const behind = scrimOver(scrim, mini, sight);
      // The status bar's glyphs follow the strip they are on, or minimized the
      // page under them. The Duo's column is the page's own color.
      const own = full.column ? sight.background : sight.top;
      const strip = (minimized ? behind : null) ?? parseColor(own) ?? WHITE;
      const darkStrip = luminance(strip.red, strip.green, strip.blue) < 0.4;
      root.className = darkStrip ? "safari dark" : "safari light";
      const shown = minimized ? mini : full;
      // The scroll edge over a page under the bars takes the tone of the content under the lowest bar.
      const lowest = shown.shapes.reduce<Shape | null>(
        (low, shape) => (!low || shape.y > low.y ? shape : low),
        null,
      );
      const edge =
        shown.edge && lowest
          ? underAt(sight, shown.screen.width / 2, lowest.y + lowest.height / 2)
          : null;
      placeFade(fade, shown.fade, sight, edge);
      for (const text of Array.from(root.querySelectorAll<HTMLElement>(".domain"))) {
        text.textContent = domainOf(sight.host);
      }
      for (const { node, box } of sides) tintGlass(node, box, sight);
      for (const { node, glyph } of glyphs) {
        const off =
          (glyph === "back" && !sight.canBack) || (glyph === "forward" && !sight.canForward);
        node.classList.toggle("off", off);
        node.classList.toggle("press", !off && pressOf(glyph, actions) !== undefined);
      }
      if (surface && domain && main && pill) {
        const box = minimized ? pillBox(pill, sight.host) : main;
        placeBox(surface, box, minimized ? pill.radius : main.radius);
        tintGlass(surface, box, sight);
        const top = minimized ? pill.height / 2 : Number(domain.dataset.top);
        domain.style.top = `${top}px`;
        const scale = minimized ? SAFARI_TEXT.pill / SAFARI_TEXT.field : 1;
        domain.style.transform = `translate(-50%, -50%) scale(${scale})`;
      }
    },
    loading(on, still) {
      const load = ++loads;
      for (const { node, glyph } of glyphs) {
        if (glyph === "reload") node.replaceChildren(...(on ? stopGlyph() : GLYPHS.reload()));
      }
      const moving = !still && typeof progress.animate === "function";
      // Where the line has come to, before what moves it stops.
      const now = moving && !progress.hidden ? getComputedStyle(progress).transform : "none";
      for (const animation of moving ? progress.getAnimations() : []) animation.cancel();
      progress.style.opacity = "";
      if (on) {
        progress.hidden = false;
        progress.style.transform = `scaleX(${moving ? PROGRESS.most : PROGRESS.still})`;
        if (!moving) return;
        progress.animate(
          [
            { transform: "scaleX(0)" },
            { transform: `scaleX(${PROGRESS.start})`, offset: 0.06 },
            { transform: `scaleX(${PROGRESS.most})` },
          ],
          { duration: PROGRESS.creep, easing: "cubic-bezier(0.1, 0.7, 0.3, 1)" },
        );
        return;
      }
      if (progress.hidden) return;
      if (!moving) {
        progress.hidden = true;
        return;
      }
      progress.style.transform = "scaleX(1)";
      progress.animate([{ transform: now === "none" ? "scaleX(0)" : now }, { transform: "scaleX(1)" }], {
        duration: PROGRESS.finish,
        easing: "ease-out",
      });
      const fade = progress.animate([{ opacity: 1 }, { opacity: 0 }], {
        delay: PROGRESS.finish,
        duration: PROGRESS.fade,
        easing: "ease-out",
        fill: "forwards",
      });
      fade.finished.then(
        () => {
          if (load !== loads) return;
          progress.hidden = true;
          fade.cancel();
        },
        () => {},
      );
    },
  };
}

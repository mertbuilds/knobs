import type { Actions, Look, Painted, Shapes } from "./browserkit";
import { CHARGE, el, glyphAt, MORPH, place, svgNode, textWidth } from "./browserkit";
import {
  type Bars,
  type Fade,
  type Glyph,
  type Mark,
  SAFARI_TEXT,
  type Shape,
  type StatusBar,
} from "./browserui";
import type { Rect } from "./mock";

/**
 * iOS 26 Safari: Liquid Glass capsules over the page's own color and the
 * status bar. No home indicator: it goes once you switch apps, and here none
 * are switched. The glyphs are drawn here from the common ideas
 * (a chevron, a box with an arrow, an open book), not from Apple's symbols.
 * Colors are sampled from the simulator.
 */

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
/* Glass over the page: a fill the page shows faintly through, blurred. */
.safari .capsule, .safari .card, .safari .surface {
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1), 0 0 0 0.5px rgba(0, 0, 0, 0.06);
  -webkit-backdrop-filter: blur(10px) saturate(1.8);
  backdrop-filter: blur(10px) saturate(1.8);
}
.safari .card, .safari[data-state="max"] .surface.from-card {
  background: rgba(250, 250, 250, 0.82);
}
.safari .field { background: rgba(0, 0, 0, 0.05); }
/* Sampled from a real iPhone over a dark page. */
.safari.dark .capsule, .safari.dark .surface {
  background: rgba(40, 40, 42, 0.75);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
}
.safari.dark .card, .safari.dark[data-state="max"] .surface.from-card {
  background: rgba(46, 46, 48, 0.8);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.safari.dark .field { background: rgba(0, 0, 0, 0.14); }
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
.safari.light .glyph .reload, .safari.light .glyph .stop { stroke: #191919; }
.safari .glyph.off { color: #babac7; }
.safari.dark .glyph.off { color: #58585b; }
.safari .domain {
  left: 50%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  font-size: ${SAFARI_TEXT.field}px;
  font-weight: 400;
  letter-spacing: -0.2px;
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

/** A ring sector `from` to `to` px out of the corner, `angle` degrees each side of up. */
function fan(from: number, to: number, angle: number): string {
  const rad = (angle * Math.PI) / 180;
  const at = (r: number, side: number) =>
    `${(side * r * Math.sin(rad)).toFixed(2)} ${(-r * Math.cos(rad)).toFixed(2)}`;
  const inner = from > 0 ? `L${at(from, 1)}A${from} ${from} 0 0 0 ${at(from, -1)}Z` : "L0 0Z";
  return `M${at(to, -1)}A${to} ${to} 0 0 1 ${at(to, 1)}${inner}`;
}

/** Wifi, its bottom on `bottom`: a dot and two bands fanning out of the bottom corner. */
function wifi(x: number, bottom: number, size: Glyphs["wifi"]): SVGSVGElement {
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

/** The minimized domain pill's box: as wide as its text and 19 px either side. */
export function pillBox(pill: Shape, host: string): Rect {
  const width = Math.round(textWidth(host, SAFARI_TEXT.pill, 400, -0.2)) + 38;
  return { x: pill.x - width / 2, y: pill.y, width, height: pill.height };
}

function placeBox(node: HTMLElement, box: Rect, radius: number): void {
  place(node, box.x, box.y, box.width, box.height);
  node.style.borderRadius = `${radius}px`;
}

/** The scroll edge's box and its gradient of the page's color. */
function placeFade(node: HTMLElement, fade: Fade | null, look: Look): void {
  node.hidden = fade === null;
  if (!fade) return;
  node.style.top = `${fade.y}px`;
  node.style.height = `${fade.height}px`;
  // The page's color, `rgb(r, g, b)`, at each stop's opacity.
  const color = (alpha: number) => look.background.replace(/^rgb\((.*)\)$/, `rgba($1, ${alpha})`);
  const stops = fade.stops.map(({ at, alpha }) => `${color(alpha)} ${at}px`);
  node.style.background = `linear-gradient(to bottom, ${stops.join(", ")})`;
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
  root.append(fade);
  if (full.status) root.append(...statusBar(full.status));
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
  // Everything else leaves as a side capsule, toward the surface, or up when turned across.
  for (const shape of full.shapes) {
    if (shape === main || shape.kind === "field") continue;
    const side = el("div", "side capsule");
    placeBox(side, shape, shape.radius);
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
      root.className = sight.dark ? "safari dark" : "safari light";
      placeFade(fade, (minimized ? mini : full).fade, sight);
      for (const text of Array.from(root.querySelectorAll<HTMLElement>(".domain"))) {
        text.textContent = sight.host;
      }
      for (const { node, glyph } of glyphs) {
        const off =
          (glyph === "back" && !sight.canBack) || (glyph === "forward" && !sight.canForward);
        node.classList.toggle("off", off);
        node.classList.toggle("press", !off && pressOf(glyph, actions) !== undefined);
      }
      if (surface && domain && main && pill) {
        const box = minimized ? pillBox(pill, sight.host) : main;
        placeBox(surface, box, minimized ? pill.radius : main.radius);
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

import type { BrowserValue, OrientationValue } from "../types";
import { turn } from "./devices";
import type { Rect } from "./mock";
import { BODIES } from "./mockdata";

/**
 * The browser a phone shows the page in, drawn around it inside the screen:
 * Safari on an iPhone, Chrome on an Android phone. The numbers are iOS 26.5
 * Safari measured in the simulator, and Chrome's from the Chromium and AOSP
 * sources, in css px of the screen.
 */

export type Platform = "safari" | "chrome";

/** Where the browser keeps its bars, or none at all. */
export type BrowserLayout = "compact" | "bottom" | "top" | "off";

/** What a layout is offered as, in the order each browser's settings list them. */
const LAYOUTS: Record<Platform, readonly BrowserLayout[]> = {
  safari: ["compact", "bottom", "top", "off"],
  chrome: ["top", "bottom", "off"],
};

/**
 * Safari 27.1 on the iPhone Duo, from WebKit's table of its viewports
 * (webkit.org/blog/18486): on the cover screen the status bar, the camera and
 * Safari's buttons move to a column on the right, which the page never runs
 * under, and the address floats at the bottom of the page, so the page is
 * the screen less the column, 98 off its height expanded and 60 minimized,
 * held either way: 382 by 580 and 618 upright, 594 by 368 and 406 across.
 * The column's parts are measured on Apple's picture of the cover screen in
 * that post, in pt: the time, the ring of the battery round wifi with the
 * signal's four dots in its gap, and under them back and reader, and a
 * capsule of new tab and tabs on the address's line. Across, the camera hole
 * turns to the top left, and the column goes with it to the left side.
 */
export const DUO_COVER = {
  column: 84,
  bottom: 98,
  minimized: 60,
  /** The column's center line, in from the screen's edge on the camera hole's side. */
  axis: 46.5,
  time: { y: 103.5, size: 16 },
  /** The ring's center, the radius of its stroke's middle, and the stroke. */
  ring: { y: 139, radius: 18.9, stroke: 3.5 },
  /** The tops of back and reader, 48 round. */
  buttons: [193.8, 254.2],
  /** New tab and tabs in one capsule 48 wide, and the address 48 high, both 32 off the bottom. */
  capsule: 102,
  gap: 32,
  /** The address's inset from the page's sides. */
  inset: 23,
} as const;

/**
 * The inner screen: the page runs the whole width, under Safari's bars at the
 * top, held either way, 84 of them expanded and 49 minimized (WebKit: 669 by
 * 867 and 902 upright, 951 by 585 and 620 across). Apple shows no picture of
 * them, so the status is the cover's, stacked at the top right as on the
 * concept of jadon7/iphone-duo (its 54 pt in from the edge, scaled to this
 * screen, its time and ring drawn closer to fit the 84), and Safari's row of
 * back, bookmarks, the address and share, new tab and tabs runs left of it.
 * Minimized, the domain pill sits at the top, the status where it was, over
 * the page.
 */
export const DUO_INNER = {
  top: 84,
  minimized: 49,
  axis: 47.9,
  time: { y: 20, size: 15 },
  ring: { y: 57.5, radius: 18.2, stroke: 2.9 },
  /** The room the status keeps at the right of the row. */
  gutter: 96,
  row: 20,
  side: 24,
  pill: 4,
} as const;

/** May the page run under Safari's bars held sideways? Not on the Duo, whose page is never under them. */
export function runsUnderBars(id: string): boolean {
  return !SAFARI[id]?.duo;
}

/** The Duo's Safari has one layout of its own. */
const DUO_LAYOUTS: readonly BrowserLayout[] = ["compact", "off"];

interface SafariSpec {
  /** The status bar's height in portrait. */
  top: number;
  /** The room each side of the page in landscape, around the island. */
  side: number;
  /** A Face ID phone: the island the status bar sits around, and its bars higher off the bottom. */
  faceId: boolean;
  /** The time's center and the right edge of the icons, where measured. */
  status?: { time: number; right: number };
  /** One of the iPhone Duo's screens, whose Safari is laid out its own way. */
  duo?: "cover" | "inner";
}

/**
 * The status bar of the 17, 17 Pro and 16 Pro, of the Pro Max and of the
 * Air, measured on the iOS 26.5 simulator. The 16 Pro Max is the 17 Pro
 * Max's, the same screen round the same island.
 */
const STATUS_PRO = { time: 73.83, right: 366.67 };
const STATUS_MAX = { time: 83.17, right: 399.33 };

/**
 * The 16 family and the SE are measured. The 17 family and the Air have the
 * simulator's insets. Estimates: the 18 Pro's, whose island keeps the 17
 * Pro's top and height, and the 16 Plus's, the 16's. Derived, as no one has
 * measured Safari on a Duo: its screens follow DUO instead.
 */
const SAFARI: Record<string, SafariSpec> = {
  "iphone-18-pro": { top: 62, side: 62, faceId: true },
  "iphone-18-pro-max": { top: 62, side: 62, faceId: true },
  "iphone-duo-closed": { top: 0, side: 0, faceId: true, duo: "cover" },
  "iphone-duo-open": { top: DUO_INNER.top, side: 0, faceId: true, duo: "inner" },
  "iphone-air": { top: 68, side: 68, faceId: true, status: { time: 77.17, right: 385.33 } },
  "iphone-17": { top: 62, side: 62, faceId: true, status: STATUS_PRO },
  "iphone-17-pro": { top: 62, side: 62, faceId: true, status: STATUS_PRO },
  "iphone-17-pro-max": { top: 62, side: 62, faceId: true, status: STATUS_MAX },
  "iphone-16": { top: 59, side: 59, faceId: true },
  "iphone-16-plus": { top: 59, side: 59, faceId: true },
  "iphone-16-pro": { top: 62, side: 62, faceId: true, status: STATUS_PRO },
  "iphone-16-pro-max": { top: 62, side: 62, faceId: true, status: STATUS_MAX },
  "iphone-se": { top: 20, side: 0, faceId: false },
};

interface ChromeSpec {
  /** The status bar's height in portrait, from the device's AOSP overlay. */
  top: number;
  /** The long side Chrome lays out, where the css size rounds it up. */
  tall?: number;
}

/**
 * Derived for the Pixel 10 family, whose overlays are not published: the 9s'
 * status bars are twice their punch hole's center, as their overlays align
 * the bar to the camera cutout, so each 10 gets twice its hole's center as its
 * frame draws it, moved by as much as the 9 of its size is off from its
 * overlay there, to the nearest dp.
 */
const CHROME: Record<string, ChromeSpec> = {
  // 2424 px at 2.625 is 923.4 css px, and the page gets the whole px under it.
  "pixel-10": { top: 69, tall: 923 },
  "pixel-10-pro": { top: 69 },
  // 2992 px at 3 is 997.3 css px.
  "pixel-10-pro-xl": { top: 70, tall: 997 },
  "pixel-10a": { top: 68, tall: 923 },
  "pixel-9": { top: 66, tall: 923 },
  "pixel-9-pro": { top: 68 },
  "pixel-9-pro-xl": { top: 66, tall: 997 },
};

/** Safari's bars, measured from the bottom of the screen or the top inset. */
export const SAFARI_BARS = {
  /** Compact's capsules and the bottom gap under them. */
  compact: 98,
  /** Bottom's card, 152 on the SE. */
  bottom: 158,
  bottomSe: 152,
  /** Top's address capsule and the gap under it, then the bottom capsule. */
  topBar: 60,
  topBottom: 92,
  /** What a minimized bar keeps: the domain pill at the bottom, or at the top. */
  pill: 58,
  topPill: 44,
  /** The single top row in landscape. */
  landscape: 64,
} as const;

/** Chrome's toolbar, the gesture area's chin under it, and the status bar in landscape. */
export const CHROME_BARS = { toolbar: 56, chin: 24, landscapeTop: 24 } as const;

export function platformOf(id: string): Platform | null {
  if (SAFARI[id]) return "safari";
  if (CHROME[id]) return "chrome";
  return null;
}

/** The layouts the device's browser offers, its default first. Empty for one with none. */
export function layoutOptions(id: string): readonly BrowserLayout[] {
  if (SAFARI[id]?.duo) return DUO_LAYOUTS;
  const platform = platformOf(id);
  return platform ? LAYOUTS[platform] : [];
}

/**
 * The layout the knob comes to on a device: its browser's default for auto,
 * or for one the browser does not have. Null for a device without a browser.
 */
export function layoutOf(id: string, browser: BrowserValue): BrowserLayout | null {
  const options = layoutOptions(id);
  const fallback = options[0];
  if (!fallback) return null;
  return browser !== "auto" && options.includes(browser) ? browser : fallback;
}

/** The screen a device shows, held one way. */
export interface Screen {
  id: string;
  width: number;
  height: number;
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/**
 * Where the page's viewport sits in the screen, and its size: what the page
 * reads as `innerWidth` and `innerHeight`. The whole screen without a browser.
 * A frame of this size gives `visualViewport`, `dvh` and a fixed `bottom: 0`
 * as Safari does. Not `svh`, `lvh` and `vh`, which a frame takes from its own
 * height as it goes: Safari keeps `svh` at the expanded height, and `lvh` and
 * `vh` at the minimized one, or the whole screen in Top.
 */
export function viewportOf(
  device: Screen,
  orientation: OrientationValue,
  layout: BrowserLayout | null,
  minimized: boolean,
  edge = false,
): Rect {
  const { width: W, height: H } = turn(device, orientation);
  const whole = rect(0, 0, W, H);
  if (!layout || layout === "off") return whole;
  const safari = SAFARI[device.id];
  if (safari?.duo === "cover") {
    const bottom = minimized ? DUO_COVER.minimized : DUO_COVER.bottom;
    // Across, the column is on the left, with the camera hole.
    const left = orientation === "portrait" ? 0 : DUO_COVER.column;
    return rect(left, 0, W - DUO_COVER.column, H - bottom);
  }
  if (safari?.duo === "inner") {
    const top = minimized ? DUO_INNER.minimized : DUO_INNER.top;
    return rect(0, top, W, H - top);
  }
  if (safari) {
    // Edge to edge turned across, the page runs under the row of bars at the
    // top. Upright, where the switch does nothing, the frame is the viewport
    // Safari gives the page, as measured on the iOS 26.5 simulator, so
    // `innerHeight`, `dvh` and a fixed `bottom: 0` land where they do on the
    // phone, and the screen under it takes the page's color there instead.
    if (edge && orientation === "landscape") return rect(safari.side, 0, W - 2 * safari.side, H);
    if (orientation === "landscape") {
      const top = minimized ? 0 : SAFARI_BARS.landscape;
      return rect(safari.side, top, W - 2 * safari.side, H - top);
    }
    const T = safari.top;
    if (layout === "top") {
      const top = T + (minimized ? SAFARI_BARS.topPill : SAFARI_BARS.topBar);
      const bottom = minimized ? H : H - SAFARI_BARS.topBottom;
      return rect(0, top, W, bottom - top);
    }
    const card = safari.faceId ? SAFARI_BARS.bottom : SAFARI_BARS.bottomSe;
    const bar = minimized ? SAFARI_BARS.pill : layout === "bottom" ? card : SAFARI_BARS.compact;
    return rect(0, T, W, H - bar - T);
  }
  const chrome = CHROME[device.id];
  if (!chrome) return whole;
  const toolbar = minimized ? 0 : CHROME_BARS.toolbar;
  if (orientation === "landscape") {
    // Derived: the research gives the status bar alone, so the toolbar goes over the page.
    const top = CHROME_BARS.landscapeTop + toolbar;
    return rect(0, top, W, H - top);
  }
  const tall = chrome.tall ?? H;
  const chin = minimized ? 0 : CHROME_BARS.chin;
  const height = tall - chrome.top - toolbar - chin;
  return rect(0, chrome.top + (layout === "top" ? toolbar : 0), W, height);
}

/** A glyph the bars draw. */
export type Glyph =
  | "back"
  | "forward"
  | "share"
  | "bookmarks"
  | "tabs"
  | "reload"
  | "page"
  | "more"
  | "plus"
  | "home"
  | "tune"
  | "switcher"
  | "menu";

/** A glyph centered on `x`, `y`. */
export interface Mark {
  glyph: Glyph;
  x: number;
  y: number;
}

/**
 * A shape of a bar: a glass capsule, Bottom's card, the address field inside
 * it, or the minimized domain pill, whose width follows its text. Glyphs and
 * the domain sit in it, in screen coordinates.
 */
export interface Shape extends Rect {
  kind: "glass" | "card" | "field" | "pill" | "toolbar";
  radius: number;
  marks: Mark[];
  /** Where the shape shows the domain: its center in Safari, its start in Chrome. */
  text?: { x: number; y: number; size: number };
}

/** A shape with fully round ends. */
function capsule(kind: Shape["kind"], box: Rect, marks: Mark[] = []): Shape {
  return { kind, ...box, radius: Math.min(box.width, box.height) / 2, marks };
}

function mark(glyph: Glyph, x: number, y: number): Mark {
  return { glyph, x, y };
}

/**
 * The Duo cover screen's status, stacked down its column under the camera
 * hole: the time, then the ring of the battery round wifi, with the signal's
 * dots in its gap.
 */
export interface StatusColumn {
  /** The column's center line. */
  x: number;
  /** Over the strip at the top, as on the inner screen, else on the page's own color. */
  strip: boolean;
  time: { y: number; size: number };
  /** The ring's center, the radius of its stroke's middle, and the stroke's width. */
  ring: { y: number; radius: number; stroke: number };
}

/** The status bar and what is in it. */
export interface StatusBar {
  height: number;
  /** The time's center. */
  time: { x: number; y: number; size: number };
  /** The right edge of the icons and their center line, or their left edge where `start`. */
  icons: { x: number; y: number; align: "end" | "start" };
  /** The SE keeps the battery alone on the right, the bars and wifi on the left. */
  battery?: { x: number; y: number };
  /** iOS draws the time and the icons a size up on the big screens, 420 and wider. */
  large: boolean;
}

export interface Bars {
  platform: Platform;
  layout: BrowserLayout;
  /** The screen and the way it is held, so the bars' other state can be drawn too. */
  screen: Screen;
  orientation: OrientationValue;
  minimized: boolean;
  status: StatusBar | null;
  /** The Duo's cover screen has its status in the column instead. */
  column: StatusColumn | null;
  shapes: Shape[];
  /** Chrome's chin under the toolbar, in the toolbar's color. */
  chin: Rect | null;
  /** Chrome's hairline between the toolbar and the page. */
  hairline: Rect | null;
  /** Safari's scroll edge under its bottom bars. */
  fade: Fade | null;
  /** A minimized Safari's wash over the page under its status bar. */
  scrim: Scrim | null;
  /** Safari's look under its bars: always upright, and turned across with edge to edge on. */
  edge: boolean;
}

/**
 * A fade from clear into the page's background, `y` to the screen's bottom,
 * with how opaque it is `at` px down it.
 */
export interface Fade {
  y: number;
  height: number;
  /** Where it starts across and how far it goes, where not the whole screen. */
  x?: number;
  width?: number;
  stops: { at: number; alpha: number }[];
}

/**
 * What a minimized Safari shows under its status bar: the page scrolled up
 * under it, in a wash of the page's own color that fades from 0.81 opaque at
 * the top of the screen to none 100 px down, measured on the iOS 26.5
 * simulator over #111 content on a white body (#d1d1d1 at 0, #727272 at 40,
 * #111111 at 100). The frame cannot show what scrolled past its top, so `at`
 * is where the content it stands for is read: the top of the page.
 */
export interface Scrim extends Fade {
  at: { x: number; y: number };
}

const SCRIM: readonly [number, number][] = [
  [0, 0.81],
  [20, 0.67],
  [40, 0.41],
  [60, 0.16],
  [80, 0.03],
  [100, 0],
];

/** How opaque a fade is `y` px down the screen, between its stops. */
export function alphaAt(fade: Fade, y: number): number {
  const at = y - fade.y;
  const { stops } = fade;
  const first = stops[0];
  if (!first || at <= first.at) return first?.alpha ?? 0;
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    if (!from || !to || at > to.at) continue;
    return from.alpha + ((to.alpha - from.alpha) * (at - from.at)) / (to.at - from.at || 1);
  }
  return stops.at(-1)?.alpha ?? 0;
}

/**
 * The scroll edge over a page drawn to the bottom of the screen, as a real
 * iPhone shows it: clear 40 px over the top of the bottom bars, rising to
 * 0.55 of the page's color at the bottom, and only over the last 24 px,
 * weaker, while the bars are minimized. Never opaque. Estimates from a
 * screenshot of a real iPhone.
 */
function edgeFade(bars: Bars, H: number, span?: { x: number; width: number }): Fade {
  const [from, to] = span ? [span.x, span.x + span.width] : [-Infinity, Infinity];
  const low = bars.shapes.filter(
    (shape) => shape.kind !== "pill" && shape.y > H / 2 && shape.x >= from && shape.x < to,
  );
  const wide = span ? { x: span.x, width: span.width } : {};
  if (bars.minimized || low.length === 0) {
    const stops = [
      { at: 0, alpha: 0 },
      { at: 12, alpha: 0.12 },
      { at: 24, alpha: 0.35 },
    ];
    return { y: H - 24, height: 24, stops, ...wide };
  }
  const y = Math.min(...low.map((shape) => shape.y)) - 40;
  const height = H - y;
  const eased: [number, number][] = [
    [0, 0],
    [0.33, 0.06],
    [0.6, 0.18],
    [0.8, 0.33],
    [1, 0.55],
  ];
  return { y, height, stops: eased.map(([at, alpha]) => ({ at: Math.round(at * height), alpha })), ...wide };
}

/** The middle of the island or the punch hole, which the status bar lines up with. */
function sensorMiddle(id: string): { x: number; y: number; width: number } | null {
  const sensor = BODIES[id]?.front.find((front) => front.kind === "sensor");
  if (!sensor) return null;
  return { x: sensor.x + sensor.width / 2, y: sensor.y + sensor.height / 2, width: sensor.width };
}

/** The domain's size in Safari's address field and in the minimized pill. */
export const SAFARI_TEXT = { field: 17, pill: 13 } as const;

/** The glyph centers across Bottom's card and Top's bottom capsule, as a share of it (16 Pro). */
const BOTTOM_ROW = [0.1032, 0.3056, 0.4965, 0.6925, 0.8872];
const TOP_ROW = [0.0884, 0.2986, 0.4962, 0.6994, 0.9012];
const ROW: Glyph[] = ["back", "forward", "share", "bookmarks", "tabs"];

/** The domain pill a minimized Safari keeps, its middle at `x`, from `top` down. Its width follows the text. */
function domainPill(x: number, top: number): Shape {
  return {
    kind: "pill",
    x,
    y: top,
    width: 0,
    height: 32,
    radius: 16,
    marks: [],
    text: { x, y: top + 16, size: SAFARI_TEXT.pill },
  };
}

/** The address field: page menu, domain, reload, `page` and `reload` px in from its ends. */
function address(kind: Shape["kind"], box: Rect, page: number, reload: number): Shape {
  const y = box.y + box.height / 2;
  return {
    ...capsule(kind, box, [
      mark("page", box.x + page, y),
      mark("reload", box.x + box.width - reload, y),
    ]),
    text: { x: box.x + box.width / 2, y, size: SAFARI_TEXT.field },
  };
}

/**
 * Safari's row across the top when the phone is held across, `y` down,
 * between `left` and `right`: the address in the middle, 318 wide, or as wide
 * as the room between the buttons leaves.
 */
function acrossRow(left: number, right: number, y: number): Shape[] {
  const s = left;
  const row = (x: number, width: number) => rect(x, y, width, 44);
  const end = row(right - 10 - 132, 132);
  const middle = y + 22;
  const [from, to] = [s + 66 + 44 + 8, end.x - 8];
  const width = Math.min(318, to - from);
  const x = Math.min(Math.max((left + right) / 2 - width / 2, from), to - width);
  return [
    capsule("glass", row(s + 10, 44), [mark("back", s + 32, middle)]),
    capsule("glass", row(s + 66, 44), [mark("bookmarks", s + 88, middle)]),
    address("glass", row(x, width), 24, 22),
    capsule("glass", end, [
      mark("share", end.x + 22, middle),
      mark("plus", end.x + 66, middle),
      mark("tabs", end.x + 110, middle),
    ]),
  ];
}

/** The Duo's cover screen: its status and buttons down the column, the address floating at the page's bottom. */
function duoCover(bars: Bars, W: number, H: number, orientation: OrientationValue, minimized: boolean): Bars {
  const c = DUO_COVER;
  // Upright the column is on the right; across it turns to the left with the camera hole.
  const upright = orientation === "portrait";
  const page = { x: upright ? 0 : c.column, width: W - c.column };
  const x = upright ? W - c.axis : c.axis;
  bars.column = { x, strip: false, time: { ...c.time }, ring: { ...c.ring } };
  if (minimized) {
    bars.shapes = [domainPill(page.x + page.width / 2, H - 46)];
    return bars;
  }
  const button = (y: number, glyph: Glyph) => capsule("glass", rect(x - 24, y, 48, 48), [mark(glyph, x, y + 24)]);
  const [back = 0, reader = 0] = c.buttons;
  const low = H - c.gap - c.capsule;
  bars.shapes = [
    address("glass", rect(page.x + c.inset, H - c.gap - 48, page.width - 2 * c.inset, 48), 24, 22),
    // Reader's glyph is the open book, as Bookmarks' is on the iPhone.
    button(back, "back"),
    button(reader, "bookmarks"),
    capsule("glass", rect(x - 24, low, 48, c.capsule), [mark("plus", x, low + 24), mark("tabs", x, H - c.gap - 24)]),
  ];
  return bars;
}

/** The Duo's inner screen: the status at the top right, and Safari's row left of it, held either way. */
function duoInner(bars: Bars, W: number, minimized: boolean): Bars {
  const d = DUO_INNER;
  bars.column = { x: W - d.axis, strip: true, time: { ...d.time }, ring: { ...d.ring } };
  bars.shapes = minimized ? [domainPill(W / 2, d.pill)] : acrossRow(d.side, W - d.gutter, d.row);
  return bars;
}

function safariBars(
  device: Screen,
  spec: SafariSpec,
  orientation: OrientationValue,
  layout: BrowserLayout,
  minimized: boolean,
): Bars {
  const { width: W, height: H } = turn(device, orientation);
  const bars: Bars = {
    platform: "safari",
    layout,
    screen: device,
    orientation,
    minimized,
    status: null,
    column: null,
    shapes: [],
    chin: null,
    hairline: null,
    fade: null,
    scrim: null,
    edge: false,
  };
  if (spec.duo === "cover") return duoCover(bars, W, H, orientation, minimized);
  if (spec.duo === "inner") return duoInner(bars, W, minimized);
  if (orientation === "landscape") {
    // Measured on the 16 Pro: one row 10 under the top, starting 10 in from the side inset.
    if (!minimized) bars.shapes = acrossRow(spec.side, W - spec.side, 10);
    return bars;
  }
  bars.status = safariStatus(device.id, spec, W);
  const page = viewportOf(device, orientation, layout, minimized);
  const T = spec.top;
  if (minimized) {
    bars.shapes = [domainPill(W / 2, layout === "top" ? T : H - 46)];
    const stops = SCRIM.map(([at, alpha]) => ({ at, alpha }));
    bars.scrim = { y: 0, height: 100, stops, at: { x: W / 2, y: page.y + 1 } };
    return bars;
  }
  if (layout === "compact") {
    const y = H - 82;
    const middle = y + 24;
    bars.shapes = [
      capsule("glass", rect(34, y, 48, 48), [mark("back", 58, middle)]),
      address("glass", rect(90, y, W - 180, 48), 24, 22),
      capsule("glass", rect(W - 82, y, 48, 48), [mark("more", W - 58, middle)]),
    ];
    return bars;
  }
  if (layout === "bottom") {
    const inset = spec.faceId ? 14 : 8;
    const card = rect(inset, H - inset - 128, W - 2 * inset, 128);
    const field = rect(card.x + 22, card.y + 16, card.width - 44, 48);
    const row = card.y + 92;
    bars.shapes = [
      // An estimate: the card's radius, the field's 24 and the 16 around it.
      {
        kind: "card",
        ...card,
        radius: 40,
        marks: ROW.map((glyph, at) => {
          return mark(glyph, card.x + card.width * (BOTTOM_ROW[at] ?? 0), row);
        }),
      },
      address("field", field, 18, 16),
    ];
    return bars;
  }
  const top = rect(16, T, W - 32, 44);
  const bottom = rect(28, H - 76, W - 56, 48);
  const row = bottom.y + 24;
  bars.shapes = [
    address("glass", top, 23, 18),
    capsule(
      "glass",
      bottom,
      ROW.map((glyph, at) => mark(glyph, bottom.x + bottom.width * (TOP_ROW[at] ?? 0), row)),
    ),
  ];
  return bars;
}

/**
 * iOS's status bar: on a Face ID phone the time in the left ear and the
 * icons in the right, both on the island's center line; on the SE the time in
 * the middle, the bars and wifi on the left and the battery on the right.
 */
function safariStatus(id: string, spec: SafariSpec, W: number): StatusBar {
  const island = sensorMiddle(id);
  if (!spec.faceId) {
    return {
      height: spec.top,
      time: { x: W / 2, y: 10, size: 15 },
      icons: { x: 6, y: 10, align: "start" },
      battery: { x: W - 7, y: 10 },
      large: false,
    };
  }
  // The size by the screen's width alone.
  const large = W >= 420;
  const size = large ? 18 : 17;
  if (!island) {
    const y = spec.top / 2 + 2;
    return {
      height: spec.top,
      time: { x: 58, y, size },
      icons: { x: W - 36, y, align: "end" },
      large,
    };
  }
  const left = island.x - island.width / 2;
  if (left > W / 2) {
    return {
      height: spec.top,
      time: { x: 52, y: island.y, size },
      icons: { x: left - 12, y: island.y, align: "end" },
      large,
    };
  }
  // Where not measured: the time a little right of the ear's middle, and the
  // battery as far in from the edge as on the 17 Pro, or on the Pro Max.
  return {
    height: spec.top,
    time: { x: spec.status?.time ?? left * 0.535, y: island.y, size },
    icons: { x: spec.status?.right ?? W - (large ? 40.67 : 35.33), y: island.y, align: "end" },
    large,
  };
}

/** Chrome's status bar: the clock on the left, the icons on the right, on the punch hole's line. */
function chromeStatus(
  id: string,
  height: number,
  W: number,
  orientation: OrientationValue,
): StatusBar {
  const hole = orientation === "portrait" ? sensorMiddle(id) : null;
  const y = hole?.y ?? height / 2;
  // An estimate: the side padding, clear of the screen's round corners, and in
  // landscape of the punch hole on the left too.
  const side = orientation === "portrait" ? 26 : 56;
  return {
    height,
    time: { x: side, y, size: 14 },
    icons: { x: W - side, y, align: "end" },
    large: false,
  };
}

function chromeBars(
  device: Screen,
  spec: ChromeSpec,
  orientation: OrientationValue,
  layout: BrowserLayout,
  minimized: boolean,
): Bars {
  const { width: W, height: H } = turn(device, orientation);
  const portrait = orientation === "portrait";
  const statusHeight = portrait ? spec.top : CHROME_BARS.landscapeTop;
  const page = viewportOf(device, orientation, layout, minimized);
  const bars: Bars = {
    platform: "chrome",
    layout,
    screen: device,
    orientation,
    minimized,
    status: chromeStatus(device.id, statusHeight, W, orientation),
    column: null,
    shapes: [],
    chin: null,
    hairline: null,
    fade: null,
    scrim: null,
    edge: false,
  };
  if (minimized) return bars;
  const atTop = layout === "top" || !portrait;
  const toolbarY = atTop ? statusHeight : page.y + page.height;
  const toolbar = rect(0, toolbarY, W, CHROME_BARS.toolbar);
  const under = toolbarY + CHROME_BARS.toolbar;
  const chin = atTop ? page.y + page.height : under;
  bars.chin = portrait ? rect(0, chin, W, H - chin) : null;
  bars.hairline = rect(0, atTop ? under : toolbarY, W, 1);
  const middle = toolbarY + CHROME_BARS.toolbar / 2;
  // Buttons 48 wide and the menu's 8 of end padding, a 52 wide new tab shortcut.
  const menu = W - 8 - 24;
  const tabs = menu - 48;
  const plus = tabs - 24 - 26;
  const pillLeft = 48 + 4;
  const pillRight = plus - 26 - 4;
  const pill = rect(pillLeft, middle - 20, pillRight - pillLeft, 40);
  bars.shapes = [
    {
      kind: "toolbar",
      ...toolbar,
      radius: 0,
      marks: [
        mark("home", 24, middle),
        mark("plus", plus, middle),
        mark("switcher", tabs, middle),
        mark("menu", menu, middle),
      ],
    },
    {
      ...capsule("field", pill, [mark("tune", pill.x + 4 + 14, middle)]),
      // The url starts after the 28 wide status icon and its margin.
      text: { x: pill.x + 4 + 28 + 4, y: middle, size: 16 },
    },
  ];
  return bars;
}

/** Everything the browser draws around the page, or null for a device without a browser. */
export function barsOf(
  device: Screen,
  orientation: OrientationValue,
  layout: BrowserLayout | null,
  minimized: boolean,
  edge = false,
): Bars | null {
  if (!layout || layout === "off") return null;
  const safari = SAFARI[device.id];
  if (safari) {
    const bars = safariBars(device, safari, orientation, layout, minimized);
    // Upright, Safari's look under its bars is always drawn, and the switch
    // only runs the page under the top row turned across. The Duo's page is
    // under its bars held either way, and never under the cover's column.
    const upright = orientation === "portrait" || safari.duo !== undefined;
    if (!edge && !upright) return bars;
    const { height: H } = turn(device, orientation);
    const page = viewportOf(device, orientation, layout, minimized);
    const span = safari.duo === "cover" ? { x: page.x, width: page.width } : undefined;
    return { ...bars, edge: true, fade: upright ? edgeFade(bars, H, span) : null };
  }
  const chrome = CHROME[device.id];
  if (chrome) return chromeBars(device, chrome, orientation, layout, minimized);
  return null;
}

/**
 * How the bars follow the page's scroll, as Safari and Chrome do: a scroll
 * down minimizes them, a deliberate scroll up or the top of the page brings
 * them back, and so do a tap on the minimized bar and a new page.
 */
export interface BarsMotion {
  minimized: boolean;
  /** The scroll position the travel since the last turn counts from. */
  anchor: number;
  /** The scroll position last seen. */
  y: number;
  /** Until when scrolls are the page settling into a new viewport, not the user's. */
  lockUntil: number;
}

export type BarsEvent =
  | { type: "scroll"; y: number; time: number }
  | { type: "tap" }
  | { type: "navigate" }
  /** The frame was resized for the bars, at `time`. */
  | { type: "resize"; time: number };

/** Downward travel that minimizes, and upward travel that brings the bars back, in css px. */
export const BARS_DOWN = 16;
export const BARS_UP = 40;
/** At or above this the page is at its top, where the bars always show. */
const BARS_TOP = 1;
/** How long the scrolls after a resize of the frame are its own, in ms. */
export const BARS_LOCK = 450;

export const BARS_START: BarsMotion = { minimized: false, anchor: 0, y: 0, lockUntil: 0 };

export function barsStep(state: BarsMotion, event: BarsEvent): BarsMotion {
  if (event.type === "navigate") return BARS_START;
  if (event.type === "tap") return { ...state, minimized: false, anchor: state.y };
  if (event.type === "resize") return { ...state, lockUntil: event.time + BARS_LOCK };
  const { y, time } = event;
  // The page moving under a resize is not the user scrolling: count from here.
  if (time < state.lockUntil) return { ...state, y, anchor: y };
  if (y <= BARS_TOP) return { ...state, minimized: false, y, anchor: y };
  if (state.minimized) {
    const anchor = Math.max(state.anchor, y);
    if (anchor - y >= BARS_UP) return { ...state, minimized: false, y, anchor: y };
    return { ...state, y, anchor };
  }
  const anchor = Math.min(state.anchor, y);
  if (y - anchor >= BARS_DOWN) return { ...state, minimized: true, y, anchor: y };
  return { ...state, y, anchor };
}

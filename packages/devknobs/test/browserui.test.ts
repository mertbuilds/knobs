import { describe, expect, test } from "bun:test";
import {
  BARS_DOWN,
  BARS_LOCK,
  BARS_START,
  BARS_UP,
  type BarsEvent,
  type BarsMotion,
  barsOf,
  alphaAt,
  barsStep,
  type BrowserLayout,
  layoutOf,
  layoutOptions,
  platformOf,
  type Screen,
  viewportOf,
} from "../src/engine/browserui";
import { SCREENS, screenOf } from "../src/engine/devices";
import { mockOf } from "../src/engine/mock";
import type { OrientationValue } from "../src/types";

function device(id: string): Screen {
  const found = screenOf(id);
  if (!found) throw new Error(`no device ${id}`);
  return found;
}

function size(
  screen: Screen,
  layout: BrowserLayout | null,
  minimized: boolean,
  orientation: OrientationValue = "portrait",
): string {
  const page = viewportOf(screen, orientation, layout, minimized);
  return `${page.width}x${page.height}`;
}

/** Expanded and minimized `innerHeight` per layout, measured in iOS 26.5 Safari. */
const SAFARI_TABLE: [string, number, Record<"compact" | "bottom" | "top", [number, number]>][] = [
  ["iphone-16-pro", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-16", 393, { compact: [695, 735], bottom: [635, 735], top: [641, 749] }],
  ["iphone-16-pro-max", 440, { compact: [796, 836], bottom: [736, 836], top: [742, 850] }],
  ["iphone-se", 375, { compact: [549, 589], bottom: [495, 589], top: [495, 603] }],
];

/**
 * Derived, not measured: the same formulas with each device's size and top
 * inset, 62 on the 17 and 18 families, 68 on the Air and 59 on the 16 Plus.
 */
const SAFARI_DERIVED: typeof SAFARI_TABLE = [
  ["iphone-18-pro", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-18-pro-max", 440, { compact: [796, 836], bottom: [736, 836], top: [742, 850] }],
  ["iphone-air", 420, { compact: [746, 786], bottom: [686, 786], top: [692, 800] }],
  ["iphone-17", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-17-pro", 402, { compact: [714, 754], bottom: [654, 754], top: [660, 768] }],
  ["iphone-17-pro-max", 440, { compact: [796, 836], bottom: [736, 836], top: [742, 850] }],
  ["iphone-16-plus", 430, { compact: [775, 815], bottom: [715, 815], top: [721, 829] }],
];

describe("viewportOf", () => {
  test("gives Safari's measured viewport in every layout, expanded and minimized", () => {
    for (const [id, width, layouts] of SAFARI_TABLE) {
      for (const [layout, [expanded, minimized]] of Object.entries(layouts)) {
        const kind = layout as BrowserLayout;
        expect(size(device(id), kind, false)).toBe(`${width}x${expanded}`);
        expect(size(device(id), kind, true)).toBe(`${width}x${minimized}`);
      }
    }
  });

  test("gives the newer iPhones the same viewport formulas with their own top inset", () => {
    for (const [id, width, layouts] of SAFARI_DERIVED) {
      for (const [layout, [expanded, minimized]] of Object.entries(layouts)) {
        const kind = layout as BrowserLayout;
        expect(size(device(id), kind, false)).toBe(`${width}x${expanded}`);
        expect(size(device(id), kind, true)).toBe(`${width}x${minimized}`);
      }
    }
    const tops = SAFARI_DERIVED.map(([id]) => viewportOf(device(id), "portrait", "compact", false).y);
    expect(tops).toEqual([62, 62, 68, 62, 62, 62, 59]);
  });

  test("places Safari's viewport under the status bar, and under Top's address bar", () => {
    const pro = device("iphone-16-pro");
    expect(viewportOf(pro, "portrait", "compact", false)).toEqual({
      x: 0,
      y: 62,
      width: 402,
      height: 714,
    });
    expect(viewportOf(pro, "portrait", "bottom", true).y).toBe(62);
    expect(viewportOf(pro, "portrait", "top", false).y).toBe(122);
    const top = viewportOf(pro, "portrait", "top", true);
    expect(top.y).toBe(106);
    expect(top.y + top.height).toBe(874);
  });

  test("gives Safari's landscape viewport, the same in every layout", () => {
    const landscape: [string, string, string][] = [
      ["iphone-16-pro", "750x338", "750x402"],
      ["iphone-16", "734x329", "734x393"],
      ["iphone-16-pro-max", "832x376", "832x440"],
      ["iphone-se", "667x311", "667x375"],
    ];
    for (const [id, expanded, minimized] of landscape) {
      for (const layout of ["compact", "bottom", "top"] as const) {
        expect(size(device(id), layout, false, "landscape")).toBe(expanded);
        expect(size(device(id), layout, true, "landscape")).toBe(minimized);
      }
    }
    const pro = viewportOf(device("iphone-16-pro"), "landscape", "compact", false);
    expect(pro.x).toBe(62);
    expect(pro.y).toBe(64);
  });

  test("gives the newer iPhones' landscape viewport from their side inset", () => {
    // Derived: the side inset is the top inset.
    const landscape: [string, string, string][] = [
      ["iphone-18-pro", "750x338", "750x402"],
      ["iphone-18-pro-max", "832x376", "832x440"],
      ["iphone-air", "776x356", "776x420"],
      ["iphone-17", "750x338", "750x402"],
      ["iphone-16-plus", "814x366", "814x430"],
    ];
    for (const [id, expanded, minimized] of landscape) {
      expect(size(device(id), "compact", false, "landscape")).toBe(expanded);
      expect(size(device(id), "compact", true, "landscape")).toBe(minimized);
    }
  });

  test("gives the iPhone Duo Safari 27.1's viewports, held either way, as the simulator does", () => {
    // Measured on the iOS 27.1 simulator: width, then the expanded and the minimized height.
    // The cover upright minimized is WebKit's (webkit.org/blog/18486), and across its `lvh`.
    const table: [string, OrientationValue, string, string][] = [
      ["iphone-duo-closed", "portrait", "382x580", "382x618"],
      ["iphone-duo-closed", "landscape", "678x386", "678x440"],
      ["iphone-duo-open", "portrait", "669x871", "669x900"],
      ["iphone-duo-open", "landscape", "951x589", "951x618"],
    ];
    for (const [id, orientation, expanded, minimized] of table) {
      expect(size(device(id), "compact", false, orientation)).toBe(expanded);
      expect(size(device(id), "compact", true, orientation)).toBe(minimized);
      // Edge to edge does not run the page under the Duo's bars.
      const edge = viewportOf(device(id), orientation, "compact", false, true);
      expect(`${edge.width}x${edge.height}`).toBe(expanded);
    }
    // The cover's page is left of the column, from the top; across, and on the inner screen, under the bar at the top.
    expect(viewportOf(device("iphone-duo-closed"), "portrait", "compact", false)).toEqual({ x: 0, y: 0, width: 382, height: 580 });
    expect(viewportOf(device("iphone-duo-closed"), "landscape", "compact", false)).toEqual({ x: 0, y: 80, width: 678, height: 386 });
    expect(viewportOf(device("iphone-duo-open"), "landscape", "compact", true)).toEqual({ x: 0, y: 51, width: 951, height: 618 });
  });

  test("offers the Duo only its own layout, or none", () => {
    expect(layoutOptions("iphone-duo-closed")).toEqual(["compact", "off"]);
    expect(layoutOptions("iphone-duo-open")).toEqual(["compact", "off"]);
    expect(layoutOf("iphone-duo-closed", "bottom")).toBe("compact");
  });

  test("gives Chrome's viewport from its toolbar, chin and status bar", () => {
    expect(size(device("pixel-9"), "top", false)).toBe("412x777");
    expect(size(device("pixel-9"), "top", true)).toBe("412x857");
    expect(size(device("pixel-9-pro"), "top", false)).toBe("427x804");
    expect(size(device("pixel-9-pro"), "top", true)).toBe("427x884");
    // 998 css px on the screen, 997 whole ones for the page.
    expect(size(device("pixel-9-pro-xl"), "top", false)).toBe("448x851");
    expect(size(device("pixel-9-pro-xl"), "top", true)).toBe("448x931");
    expect(size(device("pixel-9"), "bottom", false)).toBe("412x777");
  });

  test("gives the Pixel 10 family a status bar derived from its punch hole", () => {
    // Derived, not measured: 69, 69, 70 and 68 dp.
    const derived: [string, string, string][] = [
      ["pixel-10", "412x774", "412x854"],
      ["pixel-10-pro", "427x803", "427x883"],
      ["pixel-10-pro-xl", "448x847", "448x927"],
      ["pixel-10a", "412x775", "412x855"],
    ];
    for (const [id, expanded, minimized] of derived) {
      expect(size(device(id), "top", false)).toBe(expanded);
      expect(size(device(id), "top", true)).toBe(minimized);
      expect(size(device(id), "bottom", false)).toBe(expanded);
    }
    const tops = derived.map(([id]) => viewportOf(device(id), "portrait", "bottom", false).y);
    expect(tops).toEqual([69, 69, 70, 68]);
  });

  test("puts Chrome's toolbar over the page at the top, and under it at the bottom", () => {
    const pixel = device("pixel-9");
    expect(viewportOf(pixel, "portrait", "top", false).y).toBe(66 + 56);
    expect(viewportOf(pixel, "portrait", "bottom", false).y).toBe(66);
    expect(viewportOf(pixel, "portrait", "top", true).y).toBe(66);
    expect(viewportOf(pixel, "landscape", "bottom", false)).toEqual({
      x: 0,
      y: 80,
      width: 924,
      height: 332,
    });
  });

  test("gives the whole screen with the browser off, and without one", () => {
    expect(size(device("iphone-16-pro"), "off", false)).toBe("402x874");
    expect(size(device("pixel-9"), "off", true)).toBe("412x924");
    expect(size(device("ipad-mini"), null, false)).toBe("744x1133");
    expect(size(device("iphone-16-pro"), "off", false, "landscape")).toBe("874x402");
  });
});

/**
 * Page top and `innerHeight` per layout and state on the 17 Pro, 402 x 874,
 * measured on the iOS 26.5 simulator (minimized by a real swipe). The fixed
 * `bottom: 0` edge, `visualViewport.height` and `100dvh` are the same height.
 */
const SECTION_11: [BrowserLayout, boolean, number, number][] = [
  ["compact", false, 62, 714],
  ["compact", true, 62, 754],
  ["bottom", false, 62, 654],
  ["bottom", true, 62, 754],
  ["top", false, 122, 660],
  ["top", true, 106, 768],
];

describe("edge to edge", () => {
  test("Safari's page is the viewport the phone gives it, upright, in every layout and state", () => {
    const pro = device("iphone-17-pro");
    for (const [layout, minimized, top, height] of SECTION_11) {
      for (const edge of [true, false]) {
        const page = viewportOf(pro, "portrait", layout, minimized, edge);
        expect(page).toEqual({ x: 0, y: top, width: 402, height });
      }
    }
    // The Air's strip is 68: the same bars under it.
    expect(viewportOf(device("iphone-air"), "portrait", "compact", false, true)).toEqual({
      x: 0,
      y: 68,
      width: 420,
      height: 912 - 68 - 98,
    });
  });

  test("turned across, the page runs under Safari's top row in both states", () => {
    for (const layout of ["compact", "bottom", "top"] as const) {
      for (const minimized of [false, true]) {
        const across = viewportOf(device("iphone-16-pro"), "landscape", layout, minimized, true);
        expect(across).toEqual({ x: 62, y: 0, width: 750, height: 402 });
      }
    }
  });

  test("Chrome keeps its true viewport, and off is the whole screen either way", () => {
    expect(size(device("pixel-9"), "top", false)).toBe("412x777");
    const pixel = viewportOf(device("pixel-9"), "portrait", "top", false, true);
    expect(`${pixel.width}x${pixel.height}`).toBe("412x777");
    const off = viewportOf(device("iphone-16-pro"), "portrait", "off", false, true);
    expect(`${off.width}x${off.height}`).toBe("402x874");
  });

  test("a minimized Safari washes the top 100 px in the page's color, read at the page's top", () => {
    const pro = device("iphone-17-pro");
    const mini = barsOf(pro, "portrait", "compact", true, true);
    expect(mini?.scrim).toMatchObject({ y: 0, height: 100, at: { x: 201, y: 63 } });
    expect(barsOf(pro, "portrait", "top", true, true)?.scrim?.at.y).toBe(107);
    // White over #111 at 0, 20, 40, 60, 80 and 100 px: #d1, #b0, #72, #37, #19, #11.
    const scrim = mini?.scrim;
    if (!scrim) throw new Error("no scrim");
    const gray = (y: number) => Math.round(255 * alphaAt(scrim, y) + 17 * (1 - alphaAt(scrim, y)));
    const sim = [0xd1, 0xb0, 0x72, 0x37, 0x19, 0x11];
    [0, 20, 40, 60, 80, 100].forEach((y, at) => {
      expect(Math.abs(gray(y) - (sim[at] ?? 0))).toBeLessThanOrEqual(1);
    });
    expect(alphaAt(scrim, 30)).toBeCloseTo(0.54, 2);
    expect(alphaAt(scrim, 200)).toBe(0);
    expect(barsOf(pro, "portrait", "compact", false, true)?.scrim).toBeNull();
    expect(barsOf(pro, "landscape", "compact", true, true)?.scrim).toBeNull();
    expect(barsOf(device("pixel-9"), "portrait", "top", true)?.scrim).toBeNull();
  });

  test("Safari's look under its bars is drawn upright and with edge to edge on, never in Chrome", () => {
    const pro = device("iphone-16-pro");
    expect(barsOf(pro, "portrait", "compact", false, true)?.edge).toBe(true);
    expect(barsOf(device("pixel-9"), "portrait", "top", false, true)?.edge).toBe(false);
  });
});

describe("layouts", () => {
  test("Safari offers compact, bottom, top and off, Chrome top, bottom and off", () => {
    expect(layoutOptions("iphone-16")).toEqual(["compact", "bottom", "top", "off"]);
    expect(layoutOptions("iphone-se")).toEqual(["compact", "bottom", "top", "off"]);
    expect(layoutOptions("pixel-9")).toEqual(["top", "bottom", "off"]);
    expect(layoutOptions("ipad-mini")).toEqual([]);
    expect(layoutOptions("desktop")).toEqual([]);
    expect(layoutOptions("none")).toEqual([]);
  });

  test("every phone has a browser, and nothing else does", () => {
    for (const preset of SCREENS) {
      expect(platformOf(preset.id) !== null).toBe(preset.kind === "phone");
    }
    expect(platformOf("iphone-16-pro")).toBe("safari");
    expect(platformOf("pixel-9")).toBe("chrome");
  });

  test("auto and a layout the browser lacks come to its default", () => {
    expect(layoutOf("iphone-16-pro", "auto")).toBe("compact");
    expect(layoutOf("pixel-9", "auto")).toBe("top");
    expect(layoutOf("pixel-9", "compact")).toBe("top");
    expect(layoutOf("pixel-9", "bottom")).toBe("bottom");
    expect(layoutOf("iphone-16", "off")).toBe("off");
    expect(layoutOf("ipad-mini", "top")).toBeNull();
  });
});

describe("bars", () => {
  const pro = device("iphone-16-pro");

  test("Compact floats three capsules 34 over the bottom, 8 apart", () => {
    const bars = barsOf(pro, "portrait", "compact", false);
    const [back, field, tabs] = bars?.shapes ?? [];
    expect(back).toMatchObject({ x: 34, y: 792, width: 48, height: 48, radius: 24 });
    expect(field).toMatchObject({ x: 90, width: 222, height: 48, radius: 24 });
    expect(tabs).toMatchObject({ x: 320, width: 48 });
    expect(field?.marks.map((entry) => entry.glyph)).toEqual(["page", "reload"]);
    expect(field?.marks[0]?.x).toBe(114);
    expect(field?.marks[1]?.x).toBe(290);
    // iOS 27's Compact ends in Tabs, where iOS 26 had "...".
    expect(tabs?.marks[0]).toMatchObject({ glyph: "tabs", x: 344, y: 816 });
  });

  test("Bottom draws a card with the address field and five buttons", () => {
    const bars = barsOf(pro, "portrait", "bottom", false);
    const [card, field] = bars?.shapes ?? [];
    expect(card).toMatchObject({ kind: "card", x: 14, y: 732, width: 374, height: 128 });
    expect(field).toMatchObject({ kind: "field", x: 36, y: 748, width: 330, height: 48 });
    expect(card?.marks.map((entry) => entry.glyph)).toEqual([
      "back",
      "forward",
      "share",
      "bookmarks",
      "tabs",
    ]);
    expect(card?.marks[0]?.x).toBeCloseTo(52.6, 0);
    expect(card?.marks[4]?.x).toBeCloseTo(345.8, 0);
    expect(card?.marks[0]?.y).toBe(824);
    const se = barsOf(device("iphone-se"), "portrait", "bottom", false);
    expect(se?.shapes[0]).toMatchObject({ x: 8, y: 531, width: 359 });
  });

  test("Top puts the address under the status bar and the buttons in a capsule", () => {
    const bars = barsOf(pro, "portrait", "top", false);
    const [field, buttons] = bars?.shapes ?? [];
    expect(field).toMatchObject({ x: 16, y: 62, width: 370, height: 44, radius: 22 });
    expect(buttons).toMatchObject({ x: 28, y: 798, width: 346, height: 48 });
    expect(buttons?.marks[0]?.x).toBeCloseTo(58.6, 0);
    expect(buttons?.marks[0]?.y).toBe(822);
  });

  test("minimized leaves the domain pill, at the bottom or under the status bar", () => {
    expect(barsOf(pro, "portrait", "compact", true)?.shapes).toMatchObject([
      { kind: "pill", y: 828, height: 32 },
    ]);
    expect(barsOf(pro, "portrait", "bottom", true)?.shapes).toMatchObject([{ y: 828 }]);
    expect(barsOf(pro, "portrait", "top", true)?.shapes).toMatchObject([{ y: 62 }]);
  });

  test("landscape is one row at the top, and nothing minimized", () => {
    const bars = barsOf(pro, "landscape", "bottom", false);
    expect(bars?.status).toBeNull();
    expect(bars?.shapes.map(({ x, width }) => [x, width])).toEqual([
      [72, 44],
      [128, 44],
      [278, 318],
      [670, 132],
    ]);
    expect(barsOf(pro, "landscape", "top", true)?.shapes).toEqual([]);
  });

  test("the status bar is the top inset, its time on the island's line", () => {
    expect(barsOf(pro, "portrait", "compact", false)?.status).toMatchObject({ height: 62 });
    expect(barsOf(pro, "portrait", "compact", false)?.status?.time.y).toBeCloseTo(32.335);
    expect(barsOf(device("iphone-se"), "portrait", "top", false)?.status).toMatchObject({
      height: 20,
      time: { x: 187.5 },
    });
  });

  test("the status bar goes around each island", () => {
    const status = (id: string) => barsOf(device(id), "portrait", "compact", false)?.status;
    // The 18 Pro's island is narrower, so its left ear is wider and the time further in.
    expect(status("iphone-18-pro")?.time.x).toBeCloseTo(154 * 0.535);
    expect(status("iphone-17-pro")?.time.x).toBeCloseTo(73.83);
    expect(status("iphone-18-pro")?.time.y).toBeCloseTo(14.3 + 36.1 / 2);
    // The Air's island sits 6 lower, and its status bar is 6 taller.
    expect(status("iphone-air")).toMatchObject({ height: 68 });
    expect(status("iphone-air")?.time.y).toBeCloseTo(38.335);
  });

  test("the Duo's cover screen stacks its status and Safari's buttons in the column upright, as the simulator shows it", () => {
    const cover = (orientation: OrientationValue, minimized: boolean) =>
      barsOf(device("iphone-duo-closed"), orientation, "compact", minimized);
    const upright = cover("portrait", false);
    expect(upright?.status).toBeNull();
    // Under the camera hole, on the column's center line 48 in from the right.
    expect(upright?.column).toEqual({
      x: 418,
      strip: false,
      time: { x: 418, y: 91.5, size: 15.75 },
      ring: { y: 129.9, radius: 18.9, stroke: 3.5 },
    });
    const boxes = upright?.shapes.map(({ x, y, width, height }) => [x, y, width, height]);
    expect(boxes).toEqual([
      // The address, floating at the bottom of the page.
      [24, 596, 334, 48],
      [394, 174.2, 48, 48],
      [394, 234.2, 48, 48],
      [394, 542, 48, 102],
    ]);
    expect(upright?.shapes.map((shape) => shape.marks.map((mark) => mark.glyph))).toEqual([
      ["page", "reload"],
      ["back"],
      ["bookmarks"],
      ["plus", "tabs"],
    ]);
    // Minimized, the pill in the middle of the page, the status where it was.
    const mini = cover("portrait", true);
    expect(mini?.shapes.map((shape) => [shape.kind, shape.x, shape.y])).toEqual([["pill", 191, 632]]);
    expect(mini?.column).toEqual(upright?.column ?? null);
  });

  test("held across, the Duo's cover screen has one bar at the top and no status, as the simulator shows it", () => {
    const across = barsOf(device("iphone-duo-closed"), "landscape", "compact", false);
    expect(across?.status).toBeNull();
    expect(across?.column).toBeNull();
    expect(across?.shapes.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
      [17.33, 26, 44, 44],
      [73.33, 26, 44, 44],
      // The address in the middle of the screen.
      [209, 26, 260, 44],
      [528.67, 26, 132, 44],
    ]);
    expect(across?.shapes.map((shape) => shape.marks.map((mark) => mark.glyph))).toEqual([
      ["back"],
      ["bookmarks"],
      ["page", "reload"],
      ["share", "plus", "tabs"],
    ]);
    const mini = barsOf(device("iphone-duo-closed"), "landscape", "compact", true);
    expect(mini?.shapes.map((shape) => [shape.kind, shape.x, shape.y, shape.height])).toEqual([["pill", 339, 3, 20]]);
    // The camera hole turns to the bottom right, clear of the bar.
    const mock = mockOf("iphone-duo-closed", "landscape");
    const hole = mock?.parts.find((part) => part.kind === "sensor");
    if (!mock || !hole) throw new Error("no camera hole");
    const at = { x: hole.x - mock.inset.left, y: hole.y - mock.inset.top };
    expect(at.x).toBeGreaterThan(678 / 2);
    expect(at.y).toBeGreaterThan(466 / 2);
    for (const shape of across?.shapes ?? []) expect(shape.y + shape.height).toBeLessThan(at.y);
  });

  test("the Duo's inner screen keeps Safari's row and its status in one bar at the top, held either way", () => {
    // The address's box, measured on the simulator 951 and 669 wide.
    const fields = { landscape: { x: 295, width: 361 }, portrait: { x: 184, width: 241.5 } };
    for (const orientation of ["portrait", "landscape"] as const) {
      const bars = barsOf(device("iphone-duo-open"), orientation, "compact", false);
      const W = orientation === "portrait" ? 669 : 951;
      expect(bars?.status).toBeNull();
      // The time inline, left of the ring.
      expect(bars?.column).toEqual({
        x: W - 47.67,
        strip: true,
        time: { x: W - 99.83, y: 47.4, size: 15.75 },
        ring: { y: 47.9, radius: 18.9, stroke: 3.5 },
      });
      const shapes = bars?.shapes ?? [];
      expect(shapes.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([
        [16, 26, 44, 44],
        [72, 26, 44, 44],
        [fields[orientation].x, 26, fields[orientation].width, 44],
        [W - 232, 26, 88, 44],
      ]);
      // No share: new tab and tabs alone, and nothing reaches the time.
      expect(shapes.at(-1)?.marks.map((mark) => mark.glyph)).toEqual(["plus", "tabs"]);
      expect(Math.max(...shapes.map((shape) => shape.x + shape.width))).toBeLessThan(W - 99.83 - 20);
      // Minimized, a small domain pill alone, the status gone.
      const mini = barsOf(device("iphone-duo-open"), orientation, "compact", true);
      expect(mini?.shapes.map((shape) => [shape.kind, shape.x, shape.y, shape.height])).toEqual([["pill", W / 2, 23.5, 20]]);
      expect(mini?.column).toBeNull();
    }
  });

  test("the big screens get iOS's larger status bar, each where the simulator has it", () => {
    const status = (id: string) => barsOf(device(id), "portrait", "compact", false)?.status;
    for (const id of ["iphone-17-pro", "iphone-17", "iphone-16-pro", "iphone-16", "iphone-18-pro"]) {
      expect(status(id)?.large).toBe(false);
    }
    for (const id of ["iphone-17-pro-max", "iphone-air", "iphone-16-pro-max", "iphone-16-plus", "iphone-18-pro-max"]) {
      expect(status(id)?.large).toBe(true);
    }
    // The battery's right end on the iOS 27.0 simulator.
    expect(status("iphone-17-pro")).toMatchObject({ time: { x: 73.83, size: 18 }, icons: { x: 369.67 } });
    expect(status("iphone-17-pro-max")).toMatchObject({ time: { x: 83.17, size: 19 }, icons: { x: 401.67 } });
    expect(status("iphone-air")).toMatchObject({ time: { x: 77.17, size: 19 }, icons: { x: 387.67 } });
    // Unmeasured: as far in from the edge as the 17 Pro's, or the Pro Max's.
    expect(status("iphone-18-pro")?.icons.x).toBeCloseTo(402 - 32.33);
    expect(status("iphone-18-pro-max")?.icons.x).toBeCloseTo(440 - 38.33);
    expect(status("iphone-se")?.large).toBe(false);
  });

  test("Chrome draws its toolbar, pill, chin and hairline per layout", () => {
    const pixel = device("pixel-9");
    const top = barsOf(pixel, "portrait", "top", false);
    expect(top?.shapes[0]).toMatchObject({ kind: "toolbar", y: 66, height: 56 });
    expect(top?.shapes[1]).toMatchObject({ kind: "field", height: 40, radius: 20 });
    expect(top?.hairline?.y).toBe(122);
    expect(top?.chin).toMatchObject({ y: 899 });
    const bottom = barsOf(pixel, "portrait", "bottom", false);
    expect(bottom?.shapes[0]).toMatchObject({ y: 843 });
    expect(bottom?.chin).toMatchObject({ y: 899 });
    expect(bottom?.hairline?.y).toBe(843);
    const hidden = barsOf(pixel, "portrait", "top", true);
    expect(hidden?.shapes).toEqual([]);
    expect(hidden?.status?.height).toBe(66);
    expect(barsOf(pixel, "landscape", "bottom", false)?.shapes[0]).toMatchObject({ y: 24 });
  });

  test("upright, Safari's look under its bars is the same with edge to edge off or on", () => {
    for (const layout of ["compact", "bottom", "top"] as const) {
      for (const minimized of [false, true]) {
        const off = barsOf(pro, "portrait", layout, minimized, false);
        expect(off).toEqual(barsOf(pro, "portrait", layout, minimized, true));
        expect(off?.edge).toBe(true);
      }
    }
    // Turned across, the switch still decides.
    expect(barsOf(pro, "landscape", "compact", false, false)?.edge).toBe(false);
    expect(barsOf(pro, "landscape", "compact", false, true)?.edge).toBe(true);
  });

  test("nothing for the browser off or a device without one", () => {
    expect(barsOf(pro, "portrait", "off", false)).toBeNull();
    expect(barsOf(device("ipad-mini"), "portrait", null, false)).toBeNull();
  });
});

describe("barsStep", () => {
  const run = (events: BarsEvent[], from: BarsMotion = BARS_START) =>
    events.reduce((state, event) => barsStep(state, event), from);
  const scroll = (y: number, time = 1000): BarsEvent => ({ type: "scroll", y, time });

  test("minimizes once the page has gone down far enough, not before", () => {
    expect(run([scroll(5), scroll(10)]).minimized).toBe(false);
    expect(run([scroll(5), scroll(10), scroll(BARS_DOWN)]).minimized).toBe(true);
    expect(run([scroll(300)]).minimized).toBe(true);
  });

  test("counts the way down from the lowest point, so jitter does not minimize", () => {
    const jitter = [scroll(100), scroll(95), scroll(102), scroll(97), scroll(104)];
    const expanded = { ...BARS_START, y: 100, anchor: 100 };
    expect(run(jitter, expanded).minimized).toBe(false);
  });

  test("comes back on a deliberate scroll up, not on a small one", () => {
    const down = run([scroll(400)]);
    expect(down.minimized).toBe(true);
    expect(run([scroll(420), scroll(390)], down).minimized).toBe(true);
    expect(run([scroll(420), scroll(420 - BARS_UP + 1)], down).minimized).toBe(true);
    expect(run([scroll(420), scroll(420 - BARS_UP)], down).minimized).toBe(false);
  });

  test("comes back at the top of the page, on a tap and on a new page", () => {
    const down = run([scroll(30)]);
    expect(run([scroll(0)], down).minimized).toBe(false);
    expect(run([{ type: "tap" }], down).minimized).toBe(false);
    expect(run([{ type: "navigate" }], down)).toEqual(BARS_START);
  });

  test("top bars minimize only once the page is far enough down to scroll back by their room", () => {
    const room = 60;
    const near = (y: number): BarsEvent => ({ type: "scroll", y, time: 1000, room });
    expect(run([near(BARS_DOWN), near(room)]).minimized).toBe(false);
    expect(run([near(room + BARS_DOWN - 1)]).minimized).toBe(false);
    expect(run([near(room + BARS_DOWN)]).minimized).toBe(true);
  });

  test("a tap counts the next way down from where the page is", () => {
    const tapped = run([scroll(500), { type: "tap" }]);
    expect(run([scroll(510)], tapped).minimized).toBe(false);
    expect(run([scroll(500 + BARS_DOWN)], tapped).minimized).toBe(true);
  });

  test("the scroll clamped by a frame that grew never brings the bars back", () => {
    // Expanded at the end of the page, which the frame grown by 40 for minimized bars clamps back.
    const end = 2000;
    const tapped = run([scroll(end, 1000), { type: "tap" }]);
    const down = run([scroll(end + 40, 2000)], tapped);
    expect(down.minimized).toBe(true);
    // Unlocked, the clamp back reads as a scroll up of 40.
    expect(run([scroll(end, 2010)], down).minimized).toBe(false);
    const roomed = run([{ type: "resize", time: 2000 }, scroll(end, 2010)], down);
    expect(roomed.minimized).toBe(true);
    expect(roomed.anchor).toBe(end);
    expect(run([scroll(end - 10, 2000 + BARS_LOCK)], roomed).minimized).toBe(true);
  });

  test("the page settling into a resized frame never flips the bars", () => {
    const down = run([scroll(400, 1000), { type: "resize", time: 1000 }]);
    // The taller viewport clamps the scroll up by 100: still minimized.
    const settled = run([scroll(300, 1100), scroll(300, 1300)], down);
    expect(settled.minimized).toBe(true);
    // After the lock the user's way up counts from where the page settled.
    expect(run([scroll(300 - BARS_UP + 1, 1000 + BARS_LOCK)], settled).minimized).toBe(true);
    expect(run([scroll(300 - BARS_UP, 1000 + BARS_LOCK)], settled).minimized).toBe(false);
    const up = run([scroll(10, 1000), { type: "resize", time: 1000 }, scroll(90, 1200)]);
    expect(up.minimized).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { parseHex } from "../src/engine/color";
import {
  batteryParts,
  batteryWidth,
  domainOf,
  edgeTone,
  glassTint,
  STATUS_GLYPHS,
} from "../src/engine/safaridraw";

function hex(value: string) {
  const color = parseHex(value);
  if (!color) throw new Error(`not a color: ${value}`);
  return color;
}

/** Each channel within `levels` of the other's. */
function near(actual: string, expected: string, levels = 3) {
  const a = hex(actual);
  const b = hex(expected);
  for (const key of ["red", "green", "blue"] as const) {
    expect(Math.abs(a[key] - b[key])).toBeLessThanOrEqual(levels);
  }
}

describe("Safari's status bar", () => {
  test("the battery is iOS 27's: a solid body, charged in the glyph's color, the rest gray, a cap apart", () => {
    const { regular, large } = STATUS_GLYPHS;
    // Measured on the iOS 27.0 simulator: 29 x 13.67 on the 17 Pro, 32.33 x 15 on the Pro Max.
    expect(batteryWidth(regular.battery)).toBeCloseTo(29);
    expect(batteryWidth(large.battery)).toBeCloseTo(32.33);
    const small = batteryParts(regular.battery, 69);
    expect(small.body).toMatchObject({ x: 0, y: 0, width: 26.33, height: 13.67, rx: 4.67 });
    expect(small.cap).toMatchObject({ x: 27, width: 2, height: 5 });
    expect(small.cap.y).toBeCloseTo(4.335);
    // The charged part is cut straight at 69% of the body, its left corners the body's.
    expect(small.level.d).toBe("M18.168 0H4.67A4.67 4.67 0 0 0 0 4.67V9A4.67 4.67 0 0 0 4.67 13.67H18.168Z");
    const big = batteryParts(large.battery, 69);
    expect(big.cap).toMatchObject({ x: 30.33, width: 2, height: 5 });
    expect(big.cap.y).toBeCloseTo(5);
  });

  test("a nearly empty or full battery's charged part keeps to the body's round corners", () => {
    const { battery } = STATUS_GLYPHS.regular;
    // 5%: inside the left corner, so it starts and ends on the corner's curve.
    const low = batteryParts(battery, 5).level.d;
    expect(low.startsWith("M1.316 ")).toBe(true);
    expect(low).not.toContain("H");
    // 100%: the whole body, round at all four corners.
    const full = batteryParts(battery, 100).level.d;
    expect(full.match(/A/g)).toHaveLength(4);
    expect(full.startsWith("M26.33 4.67")).toBe(true);
  });

  test("the bars, wifi and battery are the simulator's widths and as far apart", () => {
    const width = (glyphs: (typeof STATUS_GLYPHS)["regular" | "large"]) => {
      const { signal, wifi, battery, gap } = glyphs;
      const bars = signal.pitch * (signal.heights.length - 1) + signal.width;
      return bars + gap + wifi.width + gap + batteryWidth(battery);
    };
    // iOS 27.0, 17 Pro: the bars at 284.67 to the battery's cap at 369.67. Pro Max: 309.67 to 401.67.
    expect(width(STATUS_GLYPHS.regular)).toBeCloseTo(369.67 - 284.67, 1);
    expect(width(STATUS_GLYPHS.large)).toBeCloseTo(401.67 - 309.67, 1);
  });

  test("the glyphs are about 7% bigger than iOS 26's 16.33 x 12.33 wifi and 27.33 x 13 battery", () => {
    const { wifi, signal } = STATUS_GLYPHS.regular;
    expect([wifi.width, wifi.height]).toEqual([18.67, 13.67]);
    expect(Math.max(...signal.heights)).toBe(13.67);
    expect(STATUS_GLYPHS.large.wifi).toMatchObject({ width: 20.33, height: 15 });
  });
});

describe("Safari's glass", () => {
  // Sampled inside the capsules on the iOS 27.0 simulator, 17 Pro.
  test("white content gives near-white glass in light, gray glass with white glyphs in dark", () => {
    expect(glassTint(hex("#ffffff"), "light")).toEqual({ fill: "#f8f8f8", glyph: "dark", rim: "none" });
    expect(glassTint(hex("#ffffff"), "dark")).toEqual({ fill: "#b3b3b3", glyph: "light", rim: "highlight" });
  });

  test("black content gives gray glass with black glyphs in light, #222222 in dark", () => {
    expect(glassTint(hex("#000000"), "light")).toEqual({ fill: "#898989", glyph: "dark", rim: "none" });
    expect(glassTint(hex("#000000"), "dark")).toEqual({ fill: "#222222", glyph: "light", rim: "highlight" });
    // A #111 band on a white page: #8b8b8b in light, #303030 in dark.
    near(glassTint(hex("#111111"), "light").fill, "#8b8b8b", 6);
    near(glassTint(hex("#111111"), "dark").fill, "#303030", 6);
  });

  test("saturated content gives glass in its own hue: lighter in light, a little brighter in dark", () => {
    const light = glassTint(hex("#1e5bd7"), "light");
    near(light.fill, "#7eb1ff", 7);
    expect(light).toMatchObject({ glyph: "dark", rim: "tint" });
    const dark = glassTint(hex("#1e5bd7"), "dark");
    near(dark.fill, "#2a6ef2", 7);
    expect(dark).toMatchObject({ glyph: "light", rim: "tint" });
    near(glassTint(hex("#13a538"), "light").fill, "#5ce37e", 7);
    near(glassTint(hex("#13a538"), "dark").fill, "#0ead37", 7);
  });

  test("a dull dark color stays mostly gray glass, a little in its hue", () => {
    const navy = hex(glassTint(hex("#0a1a40"), "dark").fill);
    expect(navy.blue).toBeGreaterThan(navy.red);
    expect(navy.blue).toBeLessThan(0x80);
  });

  test("the scroll edge shades the content a little in its hue, and not over black", () => {
    const white = edgeTone(hex("#ffffff"));
    expect(Math.round(white?.red ?? 0)).toBe(252);
    const blue = edgeTone(hex("#1e5bd7"));
    expect(Math.round(blue?.blue ?? 0)).toBeGreaterThanOrEqual(0xc4);
    expect(Math.round(blue?.blue ?? 0)).toBeLessThanOrEqual(0xcc);
    expect(edgeTone(hex("#000000"))).toBeNull();
  });

  test("the address is the host alone, as Safari hides the port", () => {
    expect(domainOf("127.0.0.1:8765")).toBe("127.0.0.1");
    expect(domainOf("knobs.dev")).toBe("knobs.dev");
    expect(domainOf("[::1]:3000")).toBe("[::1]");
  });
});

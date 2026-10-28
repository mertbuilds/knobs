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
  test("the battery is iOS 26's: an outline, a gap, a bar as wide as the charge and a cap apart", () => {
    const { regular, large } = STATUS_GLYPHS;
    // Measured on the simulator at 69%: 27.33 x 13 on the 17 Pro, 31 x 14.33 on the Pro Max.
    expect(batteryWidth(regular.battery)).toBeCloseTo(27.33);
    expect(batteryWidth(large.battery)).toBeCloseTo(31);
    const small = batteryParts(regular.battery, 69);
    expect(small.outline).toMatchObject({ x: 0.5, y: 0.5, width: 24, height: 12, "stroke-width": 1 });
    expect(small.level).toMatchObject({ x: 2, y: 2, height: 9 });
    expect(small.level.width).toBeCloseTo(14.49);
    expect(small.cap).toMatchObject({ x: 26, width: 1.33, height: 4.33 });
    expect(small.cap.y).toBeCloseTo(4.335);
    const big = batteryParts(large.battery, 69);
    expect(big.level).toMatchObject({ x: 2.33, y: 2.33 });
    expect(big.level.width).toBeCloseTo(16.33);
    expect(big.level.height).toBeCloseTo(9.67);
    expect(big.cap).toMatchObject({ x: 29.33, width: 1.67, height: 5 });
  });

  test("a nearly empty battery's bar stays round at both ends", () => {
    const { level } = batteryParts(STATUS_GLYPHS.regular.battery, 5);
    expect(level.width).toBeCloseTo(1.05);
    expect(level.rx).toBeCloseTo(0.525);
  });

  test("the bars, wifi and battery are the simulator's widths and as far apart", () => {
    const width = (glyphs: (typeof STATUS_GLYPHS)["regular" | "large"]) => {
      const { signal, wifi, battery, gap } = glyphs;
      const bars = signal.pitch * (signal.heights.length - 1) + signal.width;
      return bars + gap + wifi.width + gap + batteryWidth(battery);
    };
    // 17 Pro: the bars at 288.33 to the battery's cap at 366.67. Pro Max: 312.33 to 399.33.
    expect(width(STATUS_GLYPHS.regular)).toBeCloseTo(366.67 - 288.33, 1);
    expect(width(STATUS_GLYPHS.large)).toBeCloseTo(399.33 - 312.33, 1);
  });
});

describe("Safari's glass", () => {
  // Sampled inside the capsules on the iOS 26.5 simulator, 17 Pro.
  test("white content gives near-white glass, grayer in dark, with no hairline", () => {
    expect(glassTint(hex("#ffffff"), "light")).toEqual({ fill: "#fefefe", glyph: "dark", rim: "none" });
    expect(glassTint(hex("#ffffff"), "dark")).toEqual({ fill: "#f8f8f8", glyph: "dark", rim: "none" });
  });

  test("black content gives #191919 glass with a highlight, whatever the scheme", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(glassTint(hex("#000000"), scheme)).toEqual({
        fill: "#191919",
        glyph: "light",
        rim: "highlight",
      });
    }
    expect(glassTint(hex("#111111"), "light").glyph).toBe("light");
  });

  test("saturated content gives glass in its own hue: lighter in light, deeper in dark", () => {
    const light = glassTint(hex("#1e5bd7"), "light");
    near(light.fill, "#78b8ff");
    expect(light).toMatchObject({ glyph: "dark", rim: "tint" });
    const dark = glassTint(hex("#1e5bd7"), "dark");
    near(dark.fill, "#1661fd");
    expect(dark).toMatchObject({ glyph: "light", rim: "tint" });
  });

  test("a dull dark color stays mostly dark glass, a little in its hue", () => {
    const navy = hex(glassTint(hex("#0a1a40"), "light").fill);
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

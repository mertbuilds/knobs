import { describe, expect, test } from "bun:test";
import { batteryParts, batteryWidth, STATUS_GLYPHS } from "../src/engine/safaridraw";

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

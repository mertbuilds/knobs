import { describe, expect, test } from "bun:test";
import { diffOf, framePatch, frameState, syncTarget, TEXT_SIZES, textSizeOf } from "../src/engine/compare";
import { DEFAULT_STATE } from "../src/engine/store";

describe("compare frames", () => {
  test("text sizes by Dynamic Type name or px", () => {
    expect(textSizeOf("xxl")).toBe(20);
    expect(textSizeOf("AX5")).toBe(50);
    expect(textSizeOf(17)).toBe(17);
    expect(() => textSizeOf("huge")).toThrow("bad textSize");
    expect(() => textSizeOf(500)).toThrow("bad textSize");
    expect(Object.values(TEXT_SIZES)).toEqual([...Object.values(TEXT_SIZES)].sort((a, b) => a - b));
  });

  test("a frame's input becomes a checked patch", () => {
    expect(framePatch({ device: "iphone-17-pro", textSize: "xxl" })).toEqual({ device: "iphone-17-pro", text: 20 });
    expect(() => framePatch({ scheme: "purple" as never })).toThrow("bad value for scheme");
    expect(() => framePatch({ nope: 1 } as never)).toThrow("unknown knob nope");
  });

  test("each frame runs the base knobs with its own patch on top", () => {
    const base = { ...DEFAULT_STATE, scheme: "dark" as const };
    const a = frameState(base, framePatch({ device: "iphone-17-pro" }));
    const b = frameState(base, framePatch({ device: "iphone-17-pro", textSize: "xxl" }));
    expect(a).toMatchObject({ device: "iphone-17-pro", width: 402, height: 874, text: "system", scheme: "dark" });
    expect(b).toMatchObject({ device: "iphone-17-pro", width: 402, height: 874, text: 20, scheme: "dark" });
    expect(base.device).toBe("none");
  });

  test("the chip says what a frame runs off the base", () => {
    const base = frameState(DEFAULT_STATE, { device: "iphone-17-pro" });
    expect(diffOf(base, base)).toBe("base");
    expect(diffOf(base, frameState(base, { text: 20, scheme: "dark" }))).toBe("text 20 · dark");
    expect(diffOf(base, frameState(base, { locale: { lang: "ar" }, network: { online: "offline" } }))).toBe("ar · offline");
    expect(diffOf(DEFAULT_STATE, base)).toBe("iPhone 17 Pro · 3x");
  });
});

describe("scroll sync", () => {
  test("proportional puts the other frame at the same fraction", () => {
    expect(syncTarget("proportional", { y: 500, max: 1000 }, { max: 3000 })).toBe(1500);
    expect(syncTarget("proportional", { y: 0, max: 0 }, { max: 3000 })).toBe(0);
  });

  test("pixel keeps the same offset, as far as the other frame goes", () => {
    expect(syncTarget("pixel", { y: 500, max: 1000 }, { max: 3000 })).toBe(500);
    expect(syncTarget("pixel", { y: 900, max: 1000 }, { max: 600 })).toBe(600);
  });

  test("off moves nothing", () => {
    expect(syncTarget("off", { y: 500, max: 1000 }, { max: 3000 })).toBeNull();
  });
});

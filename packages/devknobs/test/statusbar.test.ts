import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Look } from "../src/engine/browserkit";
import { barsOf, layoutOf, platformOf, type Screen } from "../src/engine/browserui";
import { SCREENS } from "../src/engine/devices";
import { buildSafari, STATUS_GLYPHS } from "../src/engine/safaridraw";
import type { OrientationValue } from "../src/types";
import { fake, type FakeNode, leave, page } from "./kit-dom";

const LOOK: Look = {
  background: "#ffffff",
  top: "#ffffff",
  bottom: "#ffffff",
  under: [],
  dark: false,
  scheme: "light",
  host: "example.com",
  canBack: false,
  canForward: false,
};

const ACTIONS = { back() {}, forward() {}, reload() {} };

/** Every screen Safari draws on, each the way it is held with a status bar. */
const IPHONES = SCREENS.filter((screen) => platformOf(screen.id) === "safari");

/** The status bar's nodes as the viewport draws them: the time and the glyphs. */
function statusOf(screen: Screen, orientation: OrientationValue) {
  const layout = layoutOf(screen.id, "auto");
  const full = barsOf(screen, orientation, layout, false);
  const mini = barsOf(screen, orientation, layout, true);
  if (!full || !mini) throw new Error(`no bars on ${screen.id}`);
  const root = fake(buildSafari(full, mini, LOOK, ACTIONS).root);
  const glyphs = root.children.filter((node) => node.classes().includes("status"));
  return { status: full.status, time: root.find("time"), glyphs };
}

function shapes(node: FakeNode, tag: string): FakeNode[] {
  return node.children.filter((child) => child.tag === tag);
}

beforeEach(page);
afterEach(leave);

describe("every iPhone's status bar", () => {
  test("covers each iPhone, and both of the Duo's screens", () => {
    const ids = IPHONES.map((screen) => screen.id);
    expect(ids).toContain("iphone-se");
    expect(ids).toContain("iphone-duo-closed");
    expect(ids).toContain("iphone-duo-open");
    expect(ids.filter((id) => id.startsWith("iphone"))).toHaveLength(ids.length);
  });

  for (const screen of IPHONES) {
    test(`${screen.id} draws iOS 26's time, bars, wifi and battery, a size by its width`, () => {
      const { status, time, glyphs } = statusOf(screen, "portrait");
      expect(status).not.toBeNull();
      const large = screen.id !== "iphone-se" && screen.width >= 420;
      expect(status?.large).toBe(large);
      const set = large ? STATUS_GLYPHS.large : STATUS_GLYPHS.regular;
      expect(time).toHaveLength(1);
      expect(time[0]?.textContent).toMatch(/^\d\d:\d\d$/);
      // The glyphs are three svgs, each of its own shapes and nothing else.
      expect(glyphs).toHaveLength(3);
      const [signal, wifi, battery] = glyphs as [FakeNode, FakeNode, FakeNode];
      const bars = shapes(signal, "rect");
      expect(signal.children).toHaveLength(4);
      expect(bars.map((bar) => Number(bar.getAttribute("width")))).toEqual(Array(4).fill(set.signal.width));
      expect(bars.map((bar) => Number(bar.getAttribute("height")))).toEqual([...set.signal.heights]);
      expect(wifi.children).toHaveLength(3);
      expect(shapes(wifi, "path")).toHaveLength(3);
      expect(wifi.getAttribute("viewBox")?.split(" ").slice(2).map(Number)).toEqual([set.wifi.width, set.wifi.height]);
      // The battery: an outline, a separate bar inside it and a cap apart, no percentage.
      expect(battery.children.map((child) => child.tag)).toEqual(["rect", "rect", "path"]);
      const [outline, level, cap] = battery.children as [FakeNode, FakeNode, FakeNode];
      expect(outline.getAttribute("fill")).toBe("none");
      expect(outline.getAttribute("stroke-opacity")).toBe("0.4");
      expect(Number(outline.getAttribute("width"))).toBeCloseTo(set.battery.width - set.battery.line);
      expect(level.getAttribute("fill")).toBeNull();
      expect(Number(level.getAttribute("x"))).toBe(set.battery.inset);
      expect(cap.getAttribute("fill-opacity")).toBe("0.5");
      expect(battery.text()).toBe("");
    });
  }

  test("the Duo's screens are big ones, so both take the larger glyphs", () => {
    const duo = IPHONES.filter((screen) => screen.id.startsWith("iphone-duo"));
    expect(duo.map((screen) => statusOf(screen, "portrait").status?.large)).toEqual([true, true]);
  });

  test("held across, an iPhone has no status bar to draw", () => {
    for (const screen of IPHONES) {
      const { status, time, glyphs } = statusOf(screen, "landscape");
      expect(status).toBeNull();
      expect(time).toHaveLength(0);
      expect(glyphs).toHaveLength(0);
    }
  });
});

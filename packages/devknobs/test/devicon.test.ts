import { describe, expect, test } from "bun:test";
import { RIBBON_TEXT_MIN, ribbonGeometry, tileBox } from "../src/engine/devicon";
import { devIconFor, devIconShown, iconSize, localHost } from "../src/engine/tabicon";

/** An S by S rgba bitmap, opaque inside the box given and clear around it. */
function bitmap(size: number, x0: number, y0: number, x1: number, y1: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * size + x) * 4 + 3] = 255;
  return data;
}

const full = (size: number) => ({ x: 0, y: 0, s: size });

describe("the tile box", () => {
  test("is the whole bitmap for an opaque icon, and for one with nothing over half opaque", () => {
    expect(tileBox(bitmap(32, 0, 0, 31, 31), 32)).toEqual(full(32));
    expect(tileBox(new Uint8ClampedArray(16 * 16 * 4).fill(128), 16)).toEqual(full(16));
  });

  test("keeps a macOS icon's margin: the opaque box, made square around its center", () => {
    expect(tileBox(bitmap(100, 10, 10, 89, 89), 100)).toEqual({ x: 10, y: 10, s: 80 });
    // 60 wide, 20 tall: a 60 side, its top moved up by half the 40 it lacks.
    expect(tileBox(bitmap(100, 20, 40, 79, 59), 100)).toEqual({ x: 20, y: 20, s: 60 });
  });
});

describe("the ribbon's geometry", () => {
  test("at 16 px: the band nearer the corner, no text", () => {
    const g = ribbonGeometry(16, full(16));
    expect(g.width).toBeCloseTo(4.8);
    expect(g.distance).toBeCloseTo(3.2);
    expect(g.edge).toBe(1);
    expect(g.text).toBeNull();
    expect(g.origin).toEqual({ x: 16, y: 0 });
    expect(g.angle).toBeCloseTo(Math.PI / 4);
    expect(g.radius).toBeCloseTo(3.6);
    expect(g.reach).toBe(32);
  });

  test("moves out to 0.22 of the tile past 20 px", () => {
    expect(ribbonGeometry(20, full(20)).distance).toBeCloseTo(4);
    expect(ribbonGeometry(21, full(21)).distance).toBeCloseTo(0.22 * 21);
  });

  test("at 32 px: DEV, 0.62 of the band, a little under its middle", () => {
    const g = ribbonGeometry(32, full(32));
    expect(g.width).toBeCloseTo(9.6);
    expect(g.distance).toBeCloseTo(7.04);
    expect(g.edge).toBe(1);
    expect(g.text?.size).toBeCloseTo(5.952);
    expect(g.text?.y).toBeCloseTo(7.04 + 4.8 + 0.04 * 5.952);
    expect(ribbonGeometry(RIBBON_TEXT_MIN - 1, full(31)).text).toBeNull();
  });

  test("at 180 px: the edge a fortieth of the tile", () => {
    const g = ribbonGeometry(180, full(180));
    expect(g.width).toBeCloseTo(54);
    expect(g.distance).toBeCloseTo(39.6);
    expect(g.edge).toBeCloseTo(4.5);
    expect(g.text?.size).toBeCloseTo(33.48);
  });

  test("follows the tile box, not the bitmap, past the size rules", () => {
    const g = ribbonGeometry(180, { x: 18, y: 18, s: 144 });
    expect(g.origin).toEqual({ x: 162, y: 18 });
    expect(g.width).toBeCloseTo(43.2);
    expect(g.edge).toBeCloseTo(3.6);
  });
});

describe("the hosts the ribbon shows on", () => {
  test("by default: this machine and the local network", () => {
    for (const host of [
      "localhost",
      "knobs.localhost",
      "storybook.knobs.localhost",
      "LOCALHOST.",
      "127.0.0.1",
      "[::1]",
      "mini.local",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.20",
      "0.0.0.0",
      "[fd12:3456::1]",
      "[fc00::1]",
      "[fe80::1]",
      "[febf::1]",
    ]) {
      expect([host, localHost(host)]).toEqual([host, true]);
    }
  });

  test("not on a public host or address", () => {
    for (const host of [
      "knobs.dev",
      "example.com",
      "localhost.example.com",
      "local",
      "8.8.8.8",
      "172.15.0.1",
      "172.32.0.1",
      "192.169.0.1",
      "11.0.0.1",
      "300.0.0.1",
      "[2001:db8::1]",
      "[fec0::1]",
      "[ff02::1]",
      "fd.example.com",
      "[fe8::1]",
    ]) {
      expect([host, localHost(host)]).toEqual([host, false]);
    }
  });

  test("on and off win over the host", () => {
    expect(devIconShown("auto", "localhost")).toBe(true);
    expect(devIconShown("auto", "example.com")).toBe(false);
    expect(devIconShown("off", "localhost")).toBe(false);
    expect(devIconShown("on", "example.com")).toBe(true);
  });

  test("the switch keeps auto where it picks what the host does anyway", () => {
    expect(devIconFor(true, "localhost")).toBe("auto");
    expect(devIconFor(false, "localhost")).toBe("off");
    expect(devIconFor(true, "example.com")).toBe("on");
    expect(devIconFor(false, "example.com")).toBe("auto");
  });
});

describe("the size an icon is drawn at", () => {
  const link = (attrs: Record<string, string>) =>
    ({ getAttribute: (name: string) => attrs[name] ?? null }) as unknown as Element;

  test("its first declared size, else 32 for an icon and 180 for a touch icon", () => {
    expect(iconSize(link({ rel: "icon", sizes: "16x16" }))).toBe(16);
    expect(iconSize(link({ rel: "icon", sizes: "48x48 96x96" }))).toBe(48);
    expect(iconSize(link({ rel: "icon", sizes: "any" }))).toBe(32);
    expect(iconSize(link({ rel: "shortcut icon" }))).toBe(32);
    expect(iconSize(link({ rel: "apple-touch-icon" }))).toBe(180);
    expect(iconSize(link({ rel: "apple-touch-icon-precomposed" }))).toBe(180);
    expect(iconSize(link({ rel: "apple-touch-icon", sizes: "152x152" }))).toBe(152);
    expect(iconSize(link({ rel: "icon", sizes: "100000x100000" }))).toBe(512);
    expect(iconSize(link({ rel: "icon", sizes: "1x1" }))).toBe(16);
  });
});

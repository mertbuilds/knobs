import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Browser, chromium, type Page } from "playwright-core";

/**
 * Compare in real Chromium: a local page that loads the self-mounting build,
 * as a page with the script tag does, in the window and in each frame.
 */

const PAGE = (early: boolean) => `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>html{font-size:100%} body{margin:0;font-family:sans-serif} p{font-size:1rem;margin:0;padding:8px}</style>
${early ? '<script src="/early.js"></script><script>window.beforeMount = { screen: screen.width };</script>' : ""}
<script src="/knobs.js"></script>
<script>window.atLoad = { lang: navigator.language, font: getComputedStyle(document.documentElement).fontSize };</script></head><body>${Array.from({ length: 200 }, (_, i) => `<p>line ${i}</p>`).join("")}</body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  const bundle = async (entry: string) => {
    const built = await Bun.build({
      entrypoints: [new URL(entry, import.meta.url).pathname],
      format: "iife",
      define: { "import.meta.url": '""', DEVKNOBS_TUNE: "false" },
    });
    const [output] = built.outputs;
    if (!output) throw new Error(`no bundle for ${entry}`);
    return output.text();
  };
  const scripts: Record<string, string> = { "/knobs.js": await bundle("../src/global.ts"), "/early.js": await bundle("../src/early.ts") };
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      const script = scripts[url.pathname];
      return script
        ? new Response(script, { headers: { "content-type": "text/javascript; charset=utf-8" } })
        : new Response(PAGE(url.searchParams.has("early")), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`http://localhost:${server.port}/`);
  await page.waitForFunction(() => window.devknobs);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

const loaded = () =>
  page.waitForFunction(() => window.devknobs?.compareState()?.frames.every((frame) => frame.loaded), null, { timeout: 20_000 });

describe("compare in Chromium", () => {
  test("the same iPhone at the default and the xxl text size computes two root font sizes", async () => {
    await page.evaluate(() =>
      window.devknobs?.compare([{ device: "iphone-17-pro" }, { device: "iphone-17-pro", textSize: "xxl" }]),
    );
    await loaded();
    const frames = await page.evaluate(() =>
      window.devknobs?.compareState()?.frames.map((frame) => ({ font: frame.fontSize, diff: frame.diff })),
    );
    expect(frames).toEqual([
      { font: 16, diff: "iPhone 17 Pro · 3x" },
      { font: 20, diff: "iPhone 17 Pro · text 20 · 3x" },
    ]);
    // Read inside each frame's own window, not from the state devknobs reports.
    const inside = await page.evaluate(() =>
      Array.from(document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelectorAll("iframe") ?? []).map(
        (frame) => {
          const view = frame.contentWindow as Window;
          return [view.getComputedStyle(view.document.querySelector("p") as Element).fontSize, view.innerWidth];
        },
      ),
    );
    expect(inside).toEqual([
      ["16px", 402],
      ["20px", 402],
    ]);
  }, 30_000);

  test("a scroll in one frame moves the other to the same fraction", async () => {
    await page.evaluate(() =>
      window.devknobs?.compare([{ device: "iphone-17-pro" }, { device: "iphone-17-pro", textSize: "xxl" }]),
    );
    await loaded();
    const result = await page.evaluate(async () => {
      const [a, b] = Array.from(document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelectorAll("iframe") ?? []).map(
        (frame) => frame.contentWindow as Window,
      );
      if (!a || !b) return null;
      const max = (view: Window) => view.document.documentElement.scrollHeight - view.innerHeight;
      a.scrollTo({ top: max(a) / 4, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { a: a.scrollY / max(a), b: b.scrollY / max(b), aMax: max(a), bMax: max(b) };
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.bMax).toBeGreaterThan(result.aMax);
    expect(Math.abs(result.a - 0.25)).toBeLessThan(0.01);
    expect(Math.abs(result.b - result.a)).toBeLessThan(0.01);
  }, 30_000);

  test("pixel sync: a frame the sync moved does not echo its clamped offset back", async () => {
    await page.evaluate(() =>
      window.devknobs?.compare([{ device: "iphone-17-pro" }, { device: "iphone-17-pro", textSize: "xxl" }], { sync: "pixel" }),
    );
    await loaded();
    const result = await page.evaluate(async () => {
      const [a, b] = Array.from(document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelectorAll("iframe") ?? []).map(
        (frame) => frame.contentWindow as Window,
      );
      if (!a || !b) return null;
      const max = (view: Window) => view.document.documentElement.scrollHeight - view.innerHeight;
      b.scrollTo({ top: max(b), behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { a: a.scrollY, aMax: max(a), b: b.scrollY, bMax: max(b) };
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.bMax).toBeGreaterThan(result.aMax);
    expect(result.a).toBe(result.aMax);
    expect(result.b).toBe(result.bMax);
  }, 30_000);

  test("a frame's page starts with its own knobs, before any message", async () => {
    await page.evaluate(() =>
      window.devknobs?.compare([{ locale: { lang: "de-DE" } }, { textSize: "xxl" }]),
    );
    await loaded();
    const atLoad = await page.evaluate(() =>
      Array.from(document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelectorAll("iframe") ?? []).map(
        (frame) => Reflect.get(frame.contentWindow ?? {}, "atLoad"),
      ),
    );
    expect(atLoad[0]?.lang).toBe("de-DE");
    expect(atLoad[1]?.font).toBe("20px");
  }, 30_000);

  test("a picture drawn smaller to keep takes the screen and cutout given with it", async () => {
    const device = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2000;
      canvas.height = 4000;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      const noise = context.createImageData(2000, 4000);
      for (let i = 0; i < noise.data.length; i++) noise.data[i] = (i * 2654435761) % 251;
      context.putImageData(noise, 0, 0);
      const image = canvas.toDataURL("image/png");
      const screen = { x: 100, y: 200, width: 1800, height: 3600, radius: 50 };
      const cutout = { x: 800, y: 300, width: 400, height: 100 };
      return window.devknobs?.devices.fromImage(image, { label: "Big", screen, cutout });
    });
    expect(device?.imageSize).toEqual([800, 1600]);
    expect(device?.screen).toEqual({ x: 40, y: 80, width: 720, height: 1440, radius: 20 });
    expect(device?.cutout).toEqual({ x: 320, y: 120, width: 160, height: 40 });
  }, 30_000);

  test("with the early script, a frame's page reads its device's screen before devknobs mounts", async () => {
    await page.goto(`http://localhost:${server.port}/?early`);
    await page.waitForFunction(() => window.devknobs);
    await page.evaluate(() => window.devknobs?.compare([{ device: "iphone-17-pro" }, { device: "pixel-10" }]));
    await loaded();
    const screens = await page.evaluate(() =>
      Array.from(document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelectorAll("iframe") ?? []).map(
        (frame) => Reflect.get(frame.contentWindow ?? {}, "beforeMount"),
      ),
    );
    expect(screens).toEqual([{ screen: 402 }, { screen: 412 }]);
  }, 30_000);

  test("dark and light frames each see their own scheme, and exit takes the frames away", async () => {
    await page.evaluate(() =>
      window.devknobs?.compare([{ scheme: "light" }, { scheme: "dark" }, { scheme: "dark", textSize: 24 }]),
    );
    await loaded();
    const dark = await page.evaluate(() =>
      Array.from(document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelectorAll("iframe") ?? []).map(
        (frame) => (frame.contentWindow as Window).matchMedia("(prefers-color-scheme: dark)").matches,
      ),
    );
    expect(dark).toEqual([false, true, true]);
    const described = await page.evaluate(() => window.devknobs?.describe().find((knob) => knob.key === "compare")?.description);
    expect(described).toContain("On: 3 frames");
    await page.evaluate(() => window.devknobs?.exitCompare());
    expect(await page.evaluate(() => [window.devknobs?.compareState(), document.querySelector("[data-devknobs-compare]")])).toEqual([null, null]);
  }, 30_000);
});

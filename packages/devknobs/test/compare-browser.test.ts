import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Browser, chromium, type Page } from "playwright-core";
import { drawFrame, encodePng, pngDataUrl } from "./png";

/**
 * Compare in real Chromium: a local page that loads the self-mounting build,
 * as a page with the script tag does, in the window and in each frame.
 */

const PAGE = (early: boolean) => `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>html{font-size:100%} body{margin:0;font-family:sans-serif} p{font-size:1rem;margin:0;padding:8px}</style>
${early ? '<script src="/early.js"></script><script>window.beforeMount = { screen: screen.width };</script>' : ""}
<script src="/knobs.js"></script>
<script type="module">import { openDeviceEditor } from "/editor.js"; window.openDeviceEditor = openDeviceEditor;</script>
<script>window.atLoad = { lang: navigator.language, font: getComputedStyle(document.documentElement).fontSize };</script></head><body>${Array.from({ length: 200 }, (_, i) => `<p>line ${i}</p>`).join("")}</body></html>`;

const FRAME_PNG = encodePng(300, 600, drawFrame({ width: 300, height: 600, hole: { x: 20, y: 24, width: 260, height: 552, radius: 30 } }));

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  const bundle = async (entry: string, format: "iife" | "esm" = "iife") => {
    const built = await Bun.build({
      entrypoints: [new URL(entry, import.meta.url).pathname],
      format,
      define: { "import.meta.url": '""', DEVKNOBS_TUNE: "false" },
    });
    const [output] = built.outputs;
    if (!output) throw new Error(`no bundle for ${entry}`);
    return output.text();
  };
  const scripts: Record<string, string> = { "/knobs.js": await bundle("../src/global.ts"), "/early.js": await bundle("../src/early.ts"),
    "/editor.js": await bundle("../src/ui/deviceeditor.ts", "esm"),
  };
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/frame.png") return new Response(new Blob([Buffer.from(FRAME_PNG)]), { headers: { "content-type": "image/png" } });
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

  test("compare frames never write the locale into the origin's stores", async () => {
    await page.evaluate(() => window.devknobs?.compare([{ locale: { lang: "de-DE" } }, {}]));
    await loaded();
    await page.waitForTimeout(500);
    const stores = await page.evaluate(() => ({
      cookie: document.cookie.includes("PARAGLIDE_LOCALE"),
      local: localStorage.getItem("PARAGLIDE_LOCALE"),
      record: [sessionStorage.getItem("devknobs:locale-stores"), localStorage.getItem("devknobs:locale-stores")],
      lang: (document.querySelector("[data-devknobs-compare]")?.shadowRoot?.querySelector("iframe")?.contentWindow as Window).navigator.language,
    }));
    expect(stores).toEqual({ cookie: false, local: null, record: [null, null], lang: "de-DE" });
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

describe("the custom device editor in Chromium", () => {
  const FRAME = { width: 300, height: 600, hole: { x: 20, y: 24, width: 260, height: 552, radius: 30 } };
  const IMAGE = pngDataUrl(encodePng(FRAME.width, FRAME.height, drawFrame(FRAME)));

  /** Count the window's pointer listeners, as the editor adds and takes them off. */
  const open = async () => {
    await page.evaluate(async (image) => {
      window.devknobs?.exitCompare();
      const counts: Record<string, number> = {};
      Reflect.set(window, "pointerListeners", counts);
      if (!Reflect.get(window, "counting")) {
        Reflect.set(window, "counting", true);
        const add = window.addEventListener.bind(window);
        const remove = window.removeEventListener.bind(window);
        const count = (type: string, by: number) => {
          const now: Record<string, number> = Reflect.get(window, "pointerListeners");
          now[type] = (now[type] ?? 0) + by;
        };
        window.addEventListener = (...args: Parameters<typeof add>) => {
          count(args[0], 1);
          add(...args);
        };
        window.removeEventListener = (...args: Parameters<typeof remove>) => {
          count(args[0], -1);
          remove(...args);
        };
      }
      const editor = Reflect.get(window, "openDeviceEditor")();
      Reflect.set(window, "editor", editor);
      await editor.load(image);
    }, IMAGE);
    return page.locator("[data-devknobs-editor] >> circle[data-at=nw]").boundingBox();
  };

  test("a grip let go over the veil keeps the editor open", async () => {
    const grip = await open();
    if (!grip) throw new Error("no grip");
    await page.mouse.move(grip.x + 6, grip.y + 6);
    await page.mouse.down();
    await page.mouse.move(4, 4, { steps: 5 });
    await page.mouse.up();
    expect(await page.locator("[data-devknobs-editor]").count()).toBe(1);
    await page.mouse.click(4, 400);
    expect(await page.locator("[data-devknobs-editor]").count()).toBe(0);
  }, 30_000);

  test("closed mid-drag, the editor leaves no listeners on the window", async () => {
    const grip = await open();
    if (!grip) throw new Error("no grip");
    await page.mouse.move(grip.x + 6, grip.y + 6);
    await page.mouse.down();
    await page.mouse.move(grip.x + 20, grip.y + 20, { steps: 2 });
    const during = await page.evaluate(() => ({ ...Reflect.get(window, "pointerListeners") }));
    expect(during.pointermove).toBe(1);
    await page.evaluate(() => Reflect.get(window, "editor").close());
    await page.mouse.up();
    const after = await page.evaluate(() => Reflect.get(window, "pointerListeners"));
    expect([after.pointermove, after.pointerup, after.pointercancel, after.keydown ?? 0, after.resize ?? 0]).toEqual([0, 0, 0, 0, 0]);
  }, 30_000);

  test("a json without a picture, with none picked, says so", async () => {
    await page.evaluate(() => {
      window.devknobs?.exitCompare();
      Reflect.get(window, "openDeviceEditor")();
    });
    const json = { label: "No picture", kind: "phone", imageSize: [300, 600], screen: FRAME.hole, viewport: { width: 130, height: 276 }, dpr: 2, chrome: "none" };
    await page.locator("[data-devknobs-editor] >> input[aria-label='import json']").setInputFiles({
      name: "device.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(json)),
    });
    await page.waitForFunction(() => document.querySelector("[data-devknobs-editor]")?.shadowRoot?.querySelector(".said")?.textContent !== "");
    expect(await page.locator("[data-devknobs-editor] >> .said").textContent()).toBe("this json has no picture: pick the picture first, then import");
  }, 30_000);

  test("a json whose picture is an http url imports it", async () => {
    await page.evaluate(() => {
      window.devknobs?.exitCompare();
      Reflect.get(window, "openDeviceEditor")();
    });
    const json = { label: "From url", kind: "phone", image: `http://localhost:${server.port}/frame.png`, imageSize: [300, 600], screen: FRAME.hole, safe: { top: 12, right: 0, bottom: 7, left: 0 }, viewport: { width: 130, height: 276 }, dpr: 2, chrome: "none" };
    await page.locator("[data-devknobs-editor] >> input[aria-label='import json']").setInputFiles({
      name: "device.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(json)),
    });
    await page.waitForFunction(() => document.querySelector("[data-devknobs-editor]")?.shadowRoot?.querySelector("img")?.src.startsWith("data:image/png"));
    const shown = await page.evaluate(() => {
      const root = document.querySelector("[data-devknobs-editor]")?.shadowRoot;
      const value = (label: string) => root?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)?.value;
      return { said: root?.querySelector(".said")?.textContent, name: value("name"), top: value("safe top"), bottom: value("safe bottom") };
    });
    expect(shown).toEqual({ said: "", name: "From url", top: "12", bottom: "7" });
  }, 30_000);
});

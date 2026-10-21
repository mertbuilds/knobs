// End to end: loads dist/ into Playwright's Chromium, drives the devknobs panel the
// extension puts on a page through its own api, and checks that the page sees
// text size, preferences and offline for real, with no rewrite of its own.
// Then shoots the panel next to the npm build's, into smoke-out/. Build first.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DevknobsStatePatch } from 'devknobs';
import { chromium, type Page, type Worker } from 'playwright-core';
import type { KnobState } from '../src/knobs.ts';

const root = join(import.meta.dirname, '..');
// Another build than dist/ with `node scripts/smoke.ts <dir>`.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
const out = join(root, 'smoke-out');
const devknobsDist = join(root, '../devknobs/dist');

// Records the root size as the parser reaches the head, before any paint.
const head = `<meta charset="utf-8"><title>smoke</title>
<script>window.parsedFontSize = getComputedStyle(document.documentElement).fontSize;</script>
<style>body { font-family: system-ui; margin: 32px; } @media (min-width: 60em) { body { background: rgb(1, 2, 3); } }</style>`;
const body = `<h1>devknobs smoke</h1><p>hi <code>x</code></p>`;
// As next-themes resolves "system": the class before paint, then each change event.
const themes = `<script>
const dark = matchMedia('(prefers-color-scheme: dark)');
document.documentElement.classList.toggle('dark', dark.matches);
dark.addListener((event) => document.documentElement.classList.toggle('dark', event.matches));
</script>
<style>html { background: rgb(250, 250, 250); } html.dark { background: rgb(10, 10, 10); }
:root { color-scheme: light dark; } body { background: light-dark(rgb(240, 240, 240), rgb(20, 20, 20)); }</style>`;
const page = (extra = '') =>
  `<!doctype html><html><head>${head}${extra}</head><body>${body}</body></html>`;

const networkWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});`;
const cacheWorker = (kind: string) => `self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open('pages').then((cache) => cache.put('/worker/${kind}/page', new Response(
    '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>from the cache</h1></body></html>',
    { headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } },
  ))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' && event.request.destination === 'iframe') {
    event.respondWith(caches.match('/worker/${kind}/page').then((cached) => cached ?? fetch(event.request)));
  }
});`;
// As an app that renders into <body> as it starts, such as a React root there: it takes out
// every node it did not put there (`clears`) or puts a new <body> in (`replaces`). `reloads`
// clears too, and reloads the tab once its frame's copy loads past the service worker, as a
// page does once its worker updates.
const app = (kind: string) => `<script>
setTimeout(() => {
  const made = '<h1>from the app</h1>';
  if (${JSON.stringify(kind)} === 'replaces') {
    const next = document.createElement('body');
    next.innerHTML = made;
    document.body.replaceWith(next);
  } else {
    for (const node of [...document.body.childNodes]) {
      if (node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') node.remove();
    }
    document.body.insertAdjacentHTML('afterbegin', made);
  }
}, 300);
if (window !== top && !navigator.serviceWorker.controller) parent.postMessage('app-reload', '*');
addEventListener('message', (event) => {
  if (event.data === 'app-reload' && ${JSON.stringify(kind)} === 'reloads' && !sessionStorage.appReloaded) {
    sessionStorage.appReloaded = '1';
    location.reload();
  }
});
</script>`;
// How many times the server sent each kind's page.
const workerLoads = new Map<string, number>();

const server = createServer(async (request, response) => {
  const path = request.url ?? '/';
  if (path === '/ping') {
    response.end('pong');
    return;
  }
  if (path === '/devknobs/index.global.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(join(devknobsDist, 'index.global.js')));
    return;
  }
  // A service worker that answers the frame's load of /sw-deny itself, with a header no rule can strip.
  if (path === '/sw.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'iframe') {
    event.respondWith(new Response('<h1>from the worker</h1>', {
      headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY' },
    }));
  }
});`);
    return;
  }
  // Pages under /worker/<kind>/ that refuse frames, each kind with a service worker of its scope:
  // `network` fetches the page from the server, `cache` answers it from Cache Storage.
  const worker = /^\/worker\/(network|cache|clears|replaces|reloads)\/(sw\.js)?/.exec(path);
  if (worker) {
    const [, kind, script] = worker;
    if (script) {
      response.setHeader('content-type', 'text/javascript');
      response.end(kind === 'network' ? networkWorker : cacheWorker(kind!));
      return;
    }
    workerLoads.set(kind!, (workerLoads.get(kind!) ?? 0) + 1);
    response.setHeader('content-type', 'text/html');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('content-security-policy', "frame-ancestors 'none'");
    response.end(
      page(
        `<script>navigator.serviceWorker.register("/worker/${kind}/sw.js")</script>${kind === 'network' || kind === 'cache' ? '' : app(kind!)}`,
      ).replace('<h1>devknobs smoke</h1>', '<h1>from the network</h1>'),
    );
    return;
  }
  // As a frame, a redirect to another host, which refuses frames.
  if (path === '/bounce' && request.headers['sec-fetch-dest'] === 'iframe') {
    response.statusCode = 302;
    response.setHeader('location', `http://localhost:${port}/deny`);
    response.end();
    return;
  }
  response.setHeader('content-type', 'text/html');
  if (path === '/csp') {
    response.setHeader('content-security-policy', "default-src 'self'");
  }
  if (path === '/deny') {
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('content-security-policy', "frame-ancestors 'none'");
  }
  response.end(
    path === '/npm'
      ? page('<script src="/devknobs/index.global.js"></script>')
      : path === '/themes'
        ? page(themes)
        : path === '/mobile'
          ? page('<meta name="viewport" content="width=device-width, initial-scale=1">')
          : path === '/sw-deny'
            ? page('<script>navigator.serviceWorker.register("/sw.js")</script>')
            : page(),
  );
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;
const url = `http://127.0.0.1:${port}/`;
// The same server under another origin, where the page keeps no devknobs state of its own.
const otherOrigin = `http://localhost:${port}/`;

const viewport = { height: 800, width: 1200 };
const profile = await mkdtemp(join(tmpdir(), 'knobs-smoke-'));
const context = await chromium.launchPersistentContext(profile, {
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    `--window-size=${viewport.width},${viewport.height}`,
  ],
  channel: 'chromium',
  colorScheme: null,
  contrast: null,
  headless: true,
  reducedMotion: null,
  viewport,
});

const log = (label: string, value: unknown) =>
  process.stdout.write(`${label} ${JSON.stringify(value)}\n`);

declare global {
  interface Window {
    parsedFontSize?: string;
  }
}

const report = (tab: Page) =>
  tab.evaluate(async () => {
    let fetched: string;
    try {
      fetched = await (await fetch('/ping', { cache: 'no-store' })).text();
    } catch {
      fetched = 'failed';
    }
    const root = document.documentElement;
    return {
      contrastMore: matchMedia('(prefers-contrast: more)').matches,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      fetched,
      fontSize: getComputedStyle(root).fontSize,
      // What devknobs writes on <html> when it emulates in the page.
      inline: root.getAttribute('style') ?? '',
      monoSize: getComputedStyle(document.querySelector('code')!).fontSize,
      online: navigator.onLine,
      parsedFontSize: window.parsedFontSize,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      wide: matchMedia('(min-width: 60em)').matches,
      wideCss: getComputedStyle(document.body).backgroundColor === 'rgb(1, 2, 3)',
    };
  });

/** The panel's api, once devknobs has mounted and settled. */
const ready = (tab: Page) =>
  tab.waitForFunction(async () => {
    await window.devknobs?.ready();
    return document.querySelector('[data-devknobs="panel"]') !== null;
  });

// The panel's ground in each look (devknobs' ui/styles.ts), and its transitions, which reduced motion stops.
const LIGHT_PANEL = '#fbfbf9';
const DARK_PANEL = '#151513';
const panelLook = (tab: Page) =>
  tab.evaluate(() => {
    const wrap = document
      .querySelector('[data-devknobs="panel"]')
      ?.shadowRoot?.querySelector('.wrap');
    const style = getComputedStyle(wrap!);
    return {
      background: style.getPropertyValue('--bg').trim(),
      transition: style.transitionDuration,
    };
  });

/** The themes page's class, and the grounds it and light-dark() give. */
const theme = (tab: Page) =>
  tab.evaluate(() => ({
    background: getComputedStyle(document.documentElement).backgroundColor,
    dark: document.documentElement.classList.contains('dark'),
    tokens: getComputedStyle(document.body).backgroundColor,
  }));
const isDark = (tab: Page, dark: boolean) =>
  tab.waitForFunction((dark) => document.documentElement.classList.contains('dark') === dark, dark);

/** Set knobs through the panel's own api, as an agent would. */
const set = (tab: Page, patch: DevknobsStatePatch) =>
  tab.evaluate((patch) => {
    window.devknobs!.setState(patch);
  }, patch);

/** Does the closed panel's handle show on the page's edge? */
const handleShown = (tab: Page) =>
  tab.evaluate(() => {
    const handle = document
      .querySelector('[data-devknobs="panel"]')
      ?.shadowRoot?.querySelector<HTMLElement>('.handle');
    if (!handle) {
      return false;
    }
    const box = handle.getBoundingClientRect();
    return (
      getComputedStyle(handle).visibility !== 'hidden' &&
      box.width > 0 &&
      box.right > 0 &&
      box.left < innerWidth
    );
  });

/** Open the panel and wait for it to land. */
const openPanel = (tab: Page) =>
  tab.evaluate(async () => {
    window.devknobs!.setState({ panel: { open: true } });
    await window.devknobs!.ready();
  });

/**
 * A plain size or device is the tab's own viewport, through the DevTools protocol, with no
 * frame; one with something drawn around it is framed, the override cleared. In a context
 * of its own with no viewport of Playwright's, whose emulation would stack with ours.
 */
async function nativeViewport() {
  const size = { height: 800, width: 1200 };
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-native-'));
  const native = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${size.width},${size.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport: null,
  });
  try {
    const worker = native.serviceWorkers()[0] ?? (await native.waitForEvent('serviceworker'));
    const tab = native.pages()[0] ?? (await native.newPage());
    // A phone lays out a page with no viewport tag at 980px, as Chrome's mobile emulation does.
    await tab.goto(`${url}mobile`);
    await ready(tab);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const look = () =>
      tab.evaluate(() => {
        const host = document.querySelector('[data-devknobs="viewport"]');
        return {
          coarse: matchMedia('(pointer: coarse)').matches,
          dpr: devicePixelRatio,
          frame: host?.shadowRoot?.querySelector('iframe[data-devknobs-frame]') != null,
          hoverNone: matchMedia('(hover: none)').matches,
          innerWidth,
          kept: (window as unknown as { kept?: number }).kept,
          maxTouchPoints: navigator.maxTouchPoints,
          outerWidth,
          touchStart: 'ontouchstart' in window,
        };
      });
    const real = await look();
    log('native: real window', real);
    assert.equal(real.frame, false);
    // Kept through every change below: nothing reloads the page.
    await tab.evaluate(() => {
      (window as unknown as { kept: number }).kept = 7;
    });

    // The phone, as the device knob in the frame had it: a coarse pointer that cannot hover, touch
    // points and ontouchstart, at its screen's width and ratio.
    await set(tab, { browser: 'off', device: 'iphone-17', mock: false });
    await tab.waitForFunction(() => innerWidth === 402);
    await tab.evaluate(() => window.devknobs!.ready());
    const phone = await look();
    log('native: iPhone 17, nothing drawn', phone);
    assert.deepEqual(phone, {
      coarse: true,
      dpr: 3,
      frame: false,
      hoverNone: true,
      innerWidth: 402,
      kept: 7,
      maxTouchPoints: 5,
      outerWidth: 402,
      touchStart: true,
    });
    assert.equal(await attached(), true);

    await set(tab, { device: 'none', dpr: 'system', height: 'full', width: 390 });
    await tab.waitForFunction(() => innerWidth === 390);
    const plain = await look();
    log('native: plain 390', plain);
    assert.deepEqual(plain, {
      ...real,
      innerWidth: 390,
      kept: 7,
    });

    // Drawn around the page: the frame, and the tab back to its own size underneath.
    for (const drawn of [
      { browser: 'off', mock: true },
      { browser: 'auto', mock: false },
    ] as const) {
      await set(tab, { device: 'iphone-17', ...drawn });
      await tab.waitForFunction(
        (width) =>
          innerWidth === width &&
          document
            .querySelector('[data-devknobs="viewport"]')
            ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
            ?.contentWindow?.devknobs !== undefined,
        real.innerWidth,
      );
      await tab.evaluate(() => window.devknobs!.ready());
      const framed = await tab.evaluate(() => {
        const inner = document
          .querySelector('[data-devknobs="viewport"]')!
          .shadowRoot!.querySelector<HTMLIFrameElement>(
            'iframe[data-devknobs-frame]',
          )!.contentWindow!;
        return {
          dpr: devicePixelRatio,
          innerCoarse: inner.matchMedia('(pointer: coarse)').matches,
          innerWidth,
          kept: (window as unknown as { kept?: number }).kept,
          pageWidth: inner.innerWidth,
        };
      });
      log(`framed: iPhone 17 ${JSON.stringify(drawn)}`, framed);
      assert.equal(framed.innerWidth, real.innerWidth, 'the override is cleared under the frame');
      assert.equal(framed.dpr, real.dpr);
      assert.equal(framed.kept, 7);
      assert.equal(framed.innerCoarse, true);
      assert.equal(framed.pageWidth, 402);
    }

    await tab.evaluate(() => window.devknobs!.reset());
    await tab.waitForFunction(() => document.querySelector('[data-devknobs="viewport"]') === null);
    for (let tries = 0; (await attached()) && tries < 50; tries++) {
      await tab.waitForTimeout(20);
    }
    const after = await look();
    log('native: after reset', after);
    assert.deepEqual(after, { ...real, kept: 7 });
    assert.equal(await attached(), false);
  } finally {
    await native.close();
    await rm(own, { force: true, recursive: true });
  }
}

const tabKnobsOf = (worker: Worker, tabId: number) =>
  worker.evaluate(
    (tabId) =>
      (
        globalThis as unknown as { knobs: { get: (tabId: number) => Promise<KnobState> } }
      ).knobs.get(tabId),
    tabId,
  );

/**
 * The settings' switch for the debugger. Off, every knob is devknobs' own emulation in the
 * page and the debugger leaves the tab; on again, it comes back, every knob kept. Closing
 * Chrome's bar cannot be clicked here, so its handler runs straight from the service worker,
 * after a detach of our own (which Chrome reports to no listener).
 */
async function inPageMode() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-mode-'));
  const mode = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport: null,
  });
  try {
    const worker = mode.serviceWorkers()[0] ?? (await mode.waitForEvent('serviceworker'));
    const tab = mode.pages()[0] ?? (await mode.newPage());
    await tab.goto(url);
    await ready(tab);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const until = async (want: boolean) => {
      for (let tries = 0; (await attached()) !== want && tries < 100; tries++) {
        await tab.waitForTimeout(20);
      }
      return attached();
    };
    const stored = () =>
      worker.evaluate(async () => (await chrome.storage.local.get('native'))['native']);
    const look = () =>
      tab.evaluate(() => {
        const panel = document.querySelector('[data-devknobs="panel"]')!.shadowRoot!;
        const toggle = panel.querySelector('[aria-describedby="devknobs-native-hint"]');
        return {
          checked: toggle?.getAttribute('aria-checked'),
          fontSize: getComputedStyle(document.documentElement).fontSize,
          frame:
            document
              .querySelector('[data-devknobs="viewport"]')
              ?.shadowRoot?.querySelector('iframe[data-devknobs-frame]') != null,
          hint: panel.querySelector('.row-hint')?.textContent,
          inline: document.documentElement.style.fontSize,
          innerWidth,
          kept: (window as unknown as { kept?: number }).kept,
        };
      });
    const knobs = () =>
      tab.evaluate(() => {
        const { device, text, width } = window.devknobs!.getState();
        return { device, text, width };
      });
    const flip = () =>
      tab.evaluate(() =>
        document
          .querySelector('[data-devknobs="panel"]')!
          .shadowRoot!.querySelector<HTMLElement>('[aria-describedby="devknobs-native-hint"]')!
          .click(),
      );
    await tab.evaluate(() => {
      (window as unknown as { kept: number }).kept = 7;
    });

    // (a) On by default, as ever: the size is the browser's. Again until the tab's knobs,
    // which win over a change made before they arrive, have come in.
    for (let tries = 0; tries < 50; tries++) {
      await set(tab, { text: 48 });
      await tab.waitForTimeout(100);
      if (await attached()) {
        break;
      }
    }
    await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '48px');
    await openPanel(tab);
    await tab.evaluate(() =>
      document
        .querySelector('[data-devknobs="panel"]')!
        .shadowRoot!.querySelector<HTMLElement>('.keys-toggle')!
        .click(),
    );
    await tab.evaluate(() => window.devknobs!.ready());
    await tab.waitForTimeout(300);
    const on = await look();
    log('mode: on', on);
    assert.equal(on.checked, 'true');
    assert.equal(on.hint, "uses Chrome's debugger; shows a bar");
    assert.equal(on.inline, '', 'the size is native');
    assert.equal(await attached(), true);
    await mkdir(out, { recursive: true });
    // The switch's slide settled.
    await tab.waitForTimeout(400);
    await tab.screenshot({ path: join(out, 'settings-mode.png') });

    // (b) Off from the switch: the debugger leaves and the page emulates, the knobs kept.
    await flip();
    assert.equal(await until(false), false, 'the debugger left the tab');
    await tab.waitForFunction(() => document.documentElement.style.fontSize !== '');
    const off = await look();
    log('mode: off', off);
    assert.equal(off.checked, 'false');
    assert.equal(off.fontSize, '48px', 'the page emulates the size itself');
    assert.equal(off.inline, '48px');
    assert.equal(off.kept, 7, 'no reload');
    assert.deepEqual(await knobs(), { device: 'none', text: 48, width: 'full' });
    assert.equal(await stored(), false, 'kept for every tab');
    // A plain phone is devknobs' frame again, the tab its own size.
    await set(tab, { browser: 'off', device: 'iphone-17', mock: false });
    await tab.waitForFunction(
      () =>
        document
          .querySelector('[data-devknobs="viewport"]')
          ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')
          ?.contentWindow?.devknobs !== undefined,
    );
    await tab.evaluate(() => window.devknobs!.ready());
    const framed = await tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')!
        .shadowRoot!.querySelector<HTMLIFrameElement>(
          'iframe[data-devknobs-frame]',
        )!.contentWindow!;
      return {
        innerFontSize: inner.getComputedStyle(inner.document.documentElement).fontSize,
        innerInline: inner.document.documentElement.style.fontSize,
        innerWidth,
        pageWidth: inner.innerWidth,
      };
    });
    log('mode: off, plain iPhone 17', framed);
    assert.equal(framed.innerWidth, on.innerWidth);
    assert.equal(framed.pageWidth, 402);
    assert.equal(framed.innerFontSize, '48px', 'the frame emulates the size too');
    assert.equal(framed.innerInline, '48px');
    assert.equal(await attached(), false);

    // (c) On again: the debugger is back, the in-page size gone, the phone the tab's own viewport.
    await flip();
    // A page with no viewport tag lays out at 980px in a phone's 402.
    await tab.waitForFunction(() => outerWidth === 402);
    await tab.waitForFunction(() => document.documentElement.style.fontSize === '');
    await tab.evaluate(() => window.devknobs!.ready());
    const back = await look();
    log('mode: on again', back);
    assert.equal(back.checked, 'true');
    assert.equal(back.fontSize, '48px');
    assert.equal(back.inline, '');
    assert.equal(back.frame, false);
    assert.equal(back.kept, 7);
    assert.equal(await attached(), true);
    assert.equal(await stored(), true);
    await set(tab, { device: 'none', dpr: 'system', height: 'full', width: 'full' });
    await tab.waitForFunction((width) => innerWidth === width, on.innerWidth);
    for (
      let tries = 0;
      (await tabKnobsOf(worker, tabId)).viewport !== null && tries < 50;
      tries++
    ) {
      await tab.waitForTimeout(20);
    }

    // (d) The user closes Chrome's bar: in-page for every tab, the knobs kept.
    await worker.evaluate(async (tabId) => {
      await chrome.debugger.detach({ tabId });
      (
        globalThis as unknown as {
          knobs: { detached: (tabId: number, reason: string) => void };
        }
      ).knobs.detached(tabId, 'canceled_by_user');
    }, tabId);
    await tab.waitForFunction(() => document.documentElement.style.fontSize === '48px');
    const closed = await look();
    log('mode: bar closed', closed);
    assert.equal(closed.checked, 'false');
    assert.equal(closed.hint, "switched to in-page: Chrome's debugger bar was closed");
    assert.equal(closed.fontSize, '48px');
    assert.equal(closed.kept, 7);
    assert.deepEqual(await knobs(), { device: 'none', text: 48, width: 'full' });
    assert.equal(await stored(), false);
    assert.equal(await attached(), false);
    // The switch's slide settled.
    await tab.waitForTimeout(400);
    await tab.screenshot({ path: join(out, 'settings-mode-bar-closed.png') });
    // Another tab loads in-page from the start, the debugger never on it.
    const other = await mode.newPage();
    await other.goto(url);
    await ready(other);
    await set(other, { text: 24 });
    await other.waitForFunction(() => document.documentElement.style.fontSize === '24px');
    const otherId = await worker.evaluate(
      async (tabId) => (await chrome.tabs.query({})).find((tab) => tab.id !== tabId)!.id!,
      tabId,
    );
    const otherAttached = await worker.evaluate(
      (tabId) =>
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
          () => true,
          () => false,
        ),
      otherId,
    );
    log('mode: another tab while off', { attached: otherAttached });
    assert.equal(otherAttached, false);
    log('screenshots', [join(out, 'settings-mode.png'), join(out, 'settings-mode-bar-closed.png')]);
  } finally {
    await mode.close();
    await rm(own, { force: true, recursive: true });
  }
}

/**
 * Why a frame was refused, as the tab's debugger saw it: under the notice, a line that names
 * the header, the redirect's host or the service worker, and a button that copies the record.
 * With no knob on the debugger, "find out why" puts it on for one more load. In-page, a hint.
 */
async function refusalCauses() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-refusal-'));
  const causes = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport,
  });
  try {
    await causes.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    const worker = causes.serviceWorkers()[0] ?? (await causes.waitForEvent('serviceworker'));
    const tab = causes.pages()[0] ?? (await causes.newPage());
    await tab.goto(`${url}deny`);
    await ready(tab);
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!.id!);
    const attached = () =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const why = tab.locator('[data-devknobs="viewport"] .blocked .why');
    const line = why.locator('div').first();
    const cause = async (match: RegExp) => {
      await line.filter({ hasText: match }).waitFor({ timeout: 10_000 });
      return line.textContent();
    };
    const copied = async () => {
      await why.locator('button.copy').click();
      await why.locator('button.copy', { hasText: 'copied' }).waitFor();
      return JSON.parse(await tab.evaluate(() => navigator.clipboard.readText())) as Record<
        string,
        unknown
      >;
    };
    // The framing rule stays off this tab, so its own frame is refused.
    const dropRule = async () => {
      await tab.waitForTimeout(200);
      await worker.evaluate(
        (tabId) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }),
        tabId,
      );
    };
    const unframe = async () => {
      await set(tab, { frame: false, width: 'full' });
      await tab.evaluate(() => window.devknobs!.ready());
    };

    // (a) No knob has the debugger on, as with a mocked phone: the button watches one more load.
    await dropRule();
    await set(tab, { frame: true, width: 400 });
    const unwatched = await cause(/not watching/);
    log('refusal: unwatched', unwatched);
    assert.equal(await attached(), false);
    await why.locator('button.retry').click();
    const denied = await cause(/frame-ancestors|X-Frame-Options/);
    log('refusal: deny page', denied);
    assert.equal(denied, `blocked by Chrome: frame-ancestors 'none' on 127.0.0.1`);
    const record = await copied();
    log('refusal: deny record', record);
    assert.equal((record.response as { status: number }).status, 200);
    assert.deepEqual((record.response as { headers: unknown }).headers, {
      'content-security-policy': "frame-ancestors 'none'",
      'x-frame-options': 'DENY',
    });
    assert.deepEqual(record.sent, { secFetchDest: 'iframe', secFetchSite: 'same-origin' });
    assert.equal(record.finalUrl, 'chrome-error://chromewebdata/');
    assert.ok((record.issues as Array<unknown>).length > 0, "Chrome's issue is kept");
    assert.ok((record.console as Array<string>).length > 0, "Chrome's console line is kept");
    await mkdir(out, { recursive: true });
    await tab.screenshot({ path: join(out, 'refusal-cause.png') });
    for (let tries = 0; (await attached()) && tries < 50; tries++) {
      await tab.waitForTimeout(20);
    }
    assert.equal(await attached(), false, 'the debugger leaves once it has watched');
    await unframe();

    // (b) A knob keeps the debugger on: a redirect to another host is named.
    await tab.goto(`${url}bounce`);
    await ready(tab);
    await set(tab, { text: 20 });
    await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '20px');
    await set(tab, { frame: true, width: 400 });
    const bounced = await cause(/redirected/);
    log('refusal: redirect', bounced);
    assert.equal(
      bounced,
      `redirected to another site: localhost; blocked by Chrome: frame-ancestors 'none' on localhost`,
    );
    const redirect = await copied();
    assert.equal(
      (redirect.redirects as Array<{ status: number }>)[0]?.status,
      302,
      'the redirect is kept',
    );
    await unframe();

    // (c) A service worker answers the frame with X-Frame-Options, which no rule can strip.
    await tab.goto(`${url}sw-deny`);
    await ready(tab);
    await tab.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await set(tab, { frame: true, width: 400 });
    const fromWorker = await cause(/service worker/);
    log('refusal: service worker', fromWorker);
    assert.equal(
      fromWorker,
      `127.0.0.1:${port}/sw-deny answered 200 with X-Frame-Options: DENY (from a service worker)`,
    );
    const served = (await copied()).response as Record<string, unknown>;
    log('refusal: service worker response', served);
    assert.equal(served.fromServiceWorker, true);
    assert.equal(served.serviceWorkerScope, url);
    await unframe();
    await set(tab, { text: 'system' });

    // (d) In-page, the debugger saw nothing.
    await worker.evaluate(() => chrome.storage.local.set({ native: false }));
    await tab.goto(`${url}deny`);
    await ready(tab);
    await dropRule();
    await set(tab, { frame: true, width: 400 });
    const inPage = await cause(/real browser settings/);
    log('refusal: in-page', inPage);
    assert.equal(inPage, 'turn on real browser settings to see why');
    log('screenshots', [join(out, 'refusal-cause.png')]);
  } finally {
    await causes.close();
    await rm(own, { force: true, recursive: true });
  }
}

/** The text of the frame's heading, null where it holds no page of ours, and whether the notice shows. */
const framedText = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
    const frame = root?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]');
    let text: string | null;
    try {
      text = frame?.contentDocument?.querySelector('h1')?.textContent ?? null;
    } catch {
      text = null;
    }
    const notice = root?.querySelector<HTMLElement>('.blocked');
    return { notice: notice ? !notice.hidden : null, text };
  });

/**
 * A page whose own service worker loads it. One that fetches it from the network gets the
 * framing rule for service workers while the frame is open, real and in-page, with at most one
 * load again and no notice; the rule goes with the frame and with the tab. One that answers from
 * its cache says so under the notice, and its button loads the frame past the service worker,
 * through the debugger, which leaves again with the frame.
 */
async function workerFrames() {
  const own = await mkdtemp(join(tmpdir(), 'knobs-smoke-worker-'));
  const workers = await chromium.launchPersistentContext(own, {
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      `--window-size=${viewport.width},${viewport.height}`,
    ],
    channel: 'chromium',
    colorScheme: null,
    headless: true,
    viewport,
  });
  try {
    const worker = workers.serviceWorkers()[0] ?? (await workers.waitForEvent('serviceworker'));
    const tab = workers.pages()[0] ?? (await workers.newPage());
    const tabIdOf = (page: Page) =>
      worker.evaluate(
        async (at) => (await chrome.tabs.query({})).find((one) => one.url === at)!.id!,
        page.url(),
      );
    const attached = (tabId: number) =>
      worker.evaluate(
        (tabId) =>
          chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
            () => true,
            () => false,
          ),
        tabId,
      );
    const bypassing = (tabId: number) =>
      worker.evaluate(
        (tabId) =>
          (
            globalThis as unknown as { knobs: { bypassing: (tabId: number) => boolean } }
          ).knobs.bypassing(tabId),
        tabId,
      );
    const workerRules = () =>
      worker.evaluate(async () =>
        (await chrome.declarativeNetRequest.getSessionRules())
          .filter(({ condition }) => condition.tabIds?.includes(-1))
          .map(({ condition }) => ({
            hosts: condition.requestDomains,
            tabIds: condition.tabIds,
            types: condition.resourceTypes,
          })),
      );
    const until = async (check: () => Promise<boolean>) => {
      for (let tries = 0; !(await check()) && tries < 100; tries++) {
        await tab.waitForTimeout(20);
      }
      return check();
    };
    // The page with its service worker in control, which takes a second load.
    const controlled = async (page: Page, at: string) => {
      await page.goto(at);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await ready(page);
      assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true);
    };
    const loadsIn = async (page: Page, want: string) => {
      for (let tries = 0; tries < 150; tries++) {
        const seen = await framedText(page);
        if (seen.text === want && seen.notice === false) {
          return seen;
        }
        await page.waitForTimeout(20);
      }
      return framedText(page);
    };
    const unframe = async (page: Page) => {
      await set(page, { frame: false, width: 'full' });
      await page.evaluate(() => window.devknobs!.ready());
    };
    const noWorkerRules = () => until(async () => (await workerRules()).length === 0);

    // (a) The service worker fetches the page from the network: real, then in-page.
    const network = `${url}worker/network/page`;
    await controlled(tab, network);
    const tabId = await tabIdOf(tab);
    for (const native of [true, false]) {
      await worker.evaluate((on) => chrome.storage.local.set({ native: on }), native);
      await tab.reload();
      await ready(tab);
      const before = workerLoads.get('network') ?? 0;
      await set(tab, { frame: true, width: 400 });
      const seen = await loadsIn(tab, 'from the network');
      const rules = await workerRules();
      log(`worker network ${native ? 'real' : 'in-page'}`, {
        ...seen,
        frameLoads: (workerLoads.get('network') ?? 0) - before,
        rules,
      });
      assert.deepEqual(seen, { notice: false, text: 'from the network' });
      assert.deepEqual(rules, [{ hosts: ['127.0.0.1'], tabIds: [-1], types: ['xmlhttprequest'] }]);
      assert.equal(await attached(tabId), false, 'no debugger for a network fetch');
      await unframe(tab);
      assert.equal(await noWorkerRules(), true, 'the rule goes with the frame');
    }
    await worker.evaluate(() => chrome.storage.local.set({ native: true }));

    // (c) The rule goes with the tab too.
    const other = await workers.newPage();
    await controlled(other, network);
    await set(other, { frame: true, width: 400 });
    assert.deepEqual(await loadsIn(other, 'from the network'), {
      notice: false,
      text: 'from the network',
    });
    assert.equal((await workerRules()).length, 1);
    await other.close();
    assert.equal(await noWorkerRules(), true, 'the rule goes with the tab');
    log('worker rule', 'gone with the frame and with the tab');

    // (b) The service worker answers from its cache: the notice says so, and its button loads
    // the page past it. A knob keeps the debugger on, to watch the load.
    const cache = `${url}worker/cache/page`;
    await controlled(tab, cache);
    const why = tab.locator('[data-devknobs="viewport"] .blocked .why');
    const bypass = why.locator('button.retry', { hasText: 'without the service worker' });
    await set(tab, { text: 20 });
    await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '20px');
    await set(tab, { frame: true, width: 400 });
    await why.locator('div', { hasText: /from a service worker/ }).waitFor({ timeout: 10_000 });
    const cached = await why.locator('div').first().textContent();
    log('worker cache', cached);
    assert.equal(
      cached,
      `blocked by Chrome: frame-ancestors 'none' on 127.0.0.1 (from a service worker)`,
    );
    log('worker cache button', await bypass.textContent());
    await bypass.click();
    assert.deepEqual(await loadsIn(tab, 'from the network'), {
      notice: false,
      text: 'from the network',
    });
    assert.equal(await bypassing(tabId), true);
    await unframe(tab);
    assert.equal(
      await until(async () => !(await bypassing(tabId))),
      true,
      'bypass goes with the frame',
    );
    assert.equal(await attached(tabId), true, 'the text knob keeps the debugger');
    await set(tab, { text: 'system' });
    assert.equal(await until(async () => !(await attached(tabId))), true);

    // With no knob on the debugger, the button puts it on, and closing the frame takes it off.
    await set(tab, { frame: true, width: 400 });
    await bypass.waitFor({ timeout: 10_000 }).catch(async (error: unknown) => {
      log('worker cache unwatched, no button', await why.textContent());
      throw error;
    });
    log('worker cache unwatched', await why.locator('div').first().textContent());
    await bypass.click();
    assert.deepEqual(await loadsIn(tab, 'from the network'), {
      notice: false,
      text: 'from the network',
    });
    assert.equal(await attached(tabId), true);
    await unframe(tab);
    assert.equal(await until(async () => !(await attached(tabId))), true, 'the debugger leaves');
    assert.equal(await bypassing(tabId), false);
    assert.equal(await noWorkerRules(), true);
    log('worker cache bypass', 'loaded, then off and detached with the frame');

    // (d) A page whose app takes devknobs' nodes out as it starts, or puts a new <body> in,
    // answered from the worker's cache in the frame: devknobs puts the frame and the panel back,
    // and the button loads it past the worker with a mocked phone. `reloads` reloads the tab
    // then, and the frame its stored knobs open again still skips the worker.
    for (const kind of ['clears', 'replaces', 'reloads']) {
      const at = `${url}worker/${kind}/page`;
      await controlled(tab, at);
      const appId = await tabIdOf(tab);
      await set(tab, { device: 'iphone-18-pro', mock: true });
      // Stored, the knobs open the frame as the page loads, before the app clears it.
      await tab.reload();
      await ready(tab);
      await tab.waitForTimeout(600);
      const kept = await tab.evaluate(() => ({
        body: document.body.querySelector('h1')?.textContent ?? null,
        panel: document.querySelector('[data-devknobs="panel"]')?.parentNode === document.body,
        viewport:
          document.querySelector('[data-devknobs="viewport"]')?.parentNode === document.body,
      }));
      assert.deepEqual(kept, { body: 'from the app', panel: true, viewport: true }, kind);
      const appWhy = tab.locator('[data-devknobs="viewport"] .blocked .why');
      const appBypass = appWhy.locator('button.retry', { hasText: 'without the service worker' });
      await appBypass.waitFor({ timeout: 10_000 });
      const reloaded = kind === 'reloads' ? tab.waitForEvent('load') : null;
      await appBypass.click();
      if (reloaded) {
        await reloaded;
        await ready(tab);
        assert.equal(await tab.evaluate(() => sessionStorage.getItem('appReloaded')), '1');
      }
      const seen = await loadsIn(tab, 'from the app');
      const shown = await tab.evaluate(() => {
        const root = document.querySelector('[data-devknobs="viewport"]')?.shadowRoot;
        return {
          hidden: [...document.body.children]
            .filter((node) => !node.hasAttribute('data-devknobs'))
            .every((node) => node.hasAttribute('inert')),
          mock: root?.querySelector('.drawing svg, .drawing img') != null,
        };
      });
      log(`worker app ${kind}`, { ...kept, ...seen, ...shown });
      assert.deepEqual(seen, { notice: false, text: 'from the app' }, kind);
      assert.deepEqual(shown, { hidden: true, mock: true }, kind);
      assert.equal(await bypassing(appId), true, kind);
      assert.equal(await attached(appId), true, `${kind}: Chrome's bar shows`);
      await set(tab, { device: 'none', dpr: 'system', height: 'full', mock: false, width: 'full' });
      await tab.evaluate(() => window.devknobs!.ready());
      assert.equal(await until(async () => !(await attached(appId))), true, `${kind}: detached`);
      assert.equal(await bypassing(appId), false);
      assert.equal(await noWorkerRules(), true);
      await tab.evaluate(() => sessionStorage.removeItem('appReloaded'));
    }
  } finally {
    await workers.close();
    await rm(own, { force: true, recursive: true });
  }
}

try {
  const worker: Worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const tab = context.pages()[0] ?? (await context.newPage());
  await tab.goto(url);
  await ready(tab);

  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    if (tabs.length !== 1 || tabs[0]?.id === undefined) {
      throw new Error(`expected one tab, got ${tabs.length}`);
    }
    return tabs[0].id;
  });
  const attached = () =>
    worker.evaluate(
      // Playwright is attached too, so getTargets cannot tell; only our own session can send.
      (tabId) =>
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', { expression: '1' }).then(
          () => true,
          () => false,
        ),
      tabId,
    );
  const tabKnobs = () =>
    worker.evaluate(
      (tabId) =>
        (
          globalThis as unknown as { knobs: { get: (tabId: number) => Promise<KnobState> } }
        ).knobs.get(tabId),
      tabId,
    );

  // The toolbar button opens the panel, so a fresh profile shows no handle on the page's edge.
  assert.equal(await handleShown(tab), false, 'no handle while the panel is closed');
  await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'toggle' }), tabId);
  await tab.waitForFunction(() => window.devknobs?.getState().panel.open === true);
  await tab.evaluate(() => window.devknobs!.ready());
  await tab.evaluate(() => window.devknobs!.setState({ panel: { open: false } }));
  await tab.evaluate(() => window.devknobs!.ready());
  assert.equal(await handleShown(tab), false, 'closed again from the toolbar, still no handle');
  log('handle', 'hidden on a closed panel');

  const before = await report(tab);
  log('before', before);
  assert.equal(before.fontSize, '16px');
  assert.equal(before.wide, true, 'viewport must be wider than 60em at 16px');
  assert.equal(before.fetched, 'pong');
  assert.equal(await attached(), false);

  await set(tab, { text: 48 });
  await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '48px');
  const text = await report(tab);
  log('text 48', text);
  assert.equal(text.monoSize, '39px');
  assert.equal(text.wide, false, 'em media query follows the default font size');
  assert.equal(text.wideCss, false, 'em media query in css follows too');
  assert.equal(text.inline, '', 'devknobs wrote nothing on <html>: the size is native');
  assert.equal(await attached(), true);

  // The host's own scheme shows through with no override, so flip whichever it is.
  const scheme = before.dark ? 'light' : 'dark';
  await set(tab, { contrast: 'more', motion: 'reduce', scheme, transparency: 'reduce' });
  await tab.waitForFunction(() => matchMedia('(prefers-contrast: more)').matches);
  const prefs = await report(tab);
  log('preferences', prefs);
  assert.equal(prefs.dark, !before.dark);
  assert.equal(prefs.reducedMotion, true);
  assert.equal(prefs.reducedTransparency, true);
  assert.equal(prefs.inline, '', 'no color-scheme written on <html>: the scheme is native');

  await set(tab, { network: { online: 'offline' } });
  await tab.waitForFunction(() => !navigator.onLine);
  const offline = await report(tab);
  log('offline', offline);
  assert.equal(offline.fetched, 'failed');

  await set(tab, { network: { online: 'system' } });
  await tab.waitForFunction(() => navigator.onLine);
  await tab.reload();
  await ready(tab);
  const reloaded = await report(tab);
  log('after reload', reloaded);
  assert.equal(reloaded.parsedFontSize, '48px', 'the size is there before the first paint');
  assert.equal(reloaded.dark, !before.dark);
  assert.equal(reloaded.fetched, 'pong');
  assert.equal(await tab.evaluate(() => window.devknobs!.getState().text), 48);

  // Another origin keeps no devknobs state: the tab's knobs win, so panel and page agree.
  await tab.goto(otherOrigin);
  await ready(tab);
  await tab.waitForFunction(() => window.devknobs?.getState().text === 48);
  const crossed = await report(tab);
  log('other origin', crossed);
  assert.equal(crossed.parsedFontSize, '48px');
  assert.equal(await tab.evaluate(() => window.devknobs!.getState().scheme), scheme);
  await tab.goto(url);
  await ready(tab);

  // The width knob's frame: its copy of the page runs its own devknobs, and the tab's knobs reach it.
  // A plain width is the tab's own now; the frame knob keeps it in the frame.
  await set(tab, { frame: true, width: 400 });
  // waitForFunction takes a promise as truthy, so it waits for the frame's devknobs first.
  await tab.waitForFunction(
    () =>
      document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow
        ?.devknobs !== undefined,
  );
  const framed = await tab.evaluate(async () => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    await inner!.devknobs!.ready();
    const root = inner!.document.documentElement;
    return {
      fontSize: inner!.getComputedStyle(root).fontSize,
      inline: root.getAttribute('style') ?? '',
      text: inner!.devknobs!.getState().text,
      width: inner!.innerWidth,
    };
  });
  log('frame', framed);
  assert.deepEqual(framed, {
    fontSize: '48px',
    inline: '',
    text: 48,
    width: 400,
  });
  await set(tab, { frame: false, width: 'full' });
  await tab.evaluate(() => window.devknobs!.ready());

  // The toolbar button's message, through the bridge.
  await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'toggle' }), tabId);
  await tab.waitForFunction(() => window.devknobs?.getState().panel.open === true);
  log('toggle', 'panel opened');

  await tab.evaluate(() => window.devknobs!.reset());
  await tab.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '16px');
  await tab.waitForFunction(() => !matchMedia('(prefers-contrast: more)').matches);
  const after = await report(tab);
  log('after reset', after);
  assert.deepEqual(
    { ...after, parsedFontSize: undefined },
    { ...before, parsedFontSize: undefined },
  );
  assert.deepEqual(await tabKnobs(), {
    contrast: 'system',
    motion: 'system',
    offline: false,
    scheme: 'system',
    textSize: 'system',
    transparency: 'system',
    viewport: null,
  });
  for (let tries = 0; (await attached()) && tries < 50; tries++) {
    await tab.waitForTimeout(20);
  }
  assert.equal(await attached(), false);

  // A page that themes itself both ways: a class from matchMedia and its change events,
  // as next-themes does, and light-dark(). The panel keeps the system's look.
  await tab.goto(`${url}themes`);
  await ready(tab);
  const hostTheme = await theme(tab);
  const hostPanel = await panelLook(tab);
  log('themes page', { page: hostTheme, panel: hostPanel });
  assert.equal(hostTheme.dark, before.dark);
  assert.equal(hostPanel.background, before.dark ? DARK_PANEL : LIGHT_PANEL);
  await set(tab, { motion: 'reduce', scheme });
  await isDark(tab, !before.dark);
  const flipped = await theme(tab);
  log('themes page flipped', { page: flipped, panel: await panelLook(tab) });
  assert.notEqual(flipped.background, hostTheme.background);
  assert.notEqual(flipped.tokens, hostTheme.tokens);
  assert.deepEqual(await panelLook(tab), hostPanel, 'the panel keeps the real scheme and motion');
  await tab.reload();
  await ready(tab);
  const flippedReload = await theme(tab);
  log('themes page flipped, reloaded', { page: flippedReload, panel: await panelLook(tab) });
  assert.deepEqual(flippedReload, flipped);
  assert.deepEqual(await panelLook(tab), hostPanel);

  // The user changes their system's scheme: the offscreen document's word reaches the panel.
  const tellSystem = (scheme: 'dark' | 'light') =>
    worker.evaluate(
      ({ scheme, tabId }) =>
        chrome.tabs.sendMessage(
          tabId,
          { media: { motion: 'no-preference', scheme }, type: 'system' },
          { frameId: 0 },
        ),
      { scheme, tabId },
    );
  await tellSystem(before.dark ? 'light' : 'dark');
  await tab.waitForFunction(
    (bg) =>
      getComputedStyle(
        document.querySelector('[data-devknobs="panel"]')!.shadowRoot!.querySelector('.wrap')!,
      )
        .getPropertyValue('--bg')
        .trim() === bg,
    before.dark ? LIGHT_PANEL : DARK_PANEL,
  );
  await tellSystem(before.dark ? 'dark' : 'light');
  log('system scheme change', 'the panel followed it');

  // Docked, the page is the frame's copy, which flips as well.
  const frameTheme = () =>
    tab.evaluate(() => {
      const inner = document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector<HTMLIFrameElement>(
          'iframe[data-devknobs-frame]',
        )?.contentWindow;
      if (!inner?.devknobs || inner.document.readyState !== 'complete') {
        return null;
      }
      return inner.document.documentElement.classList.contains('dark');
    });
  await set(tab, { panel: { docked: true, open: true } });
  for (let tries = 0; (await frameTheme()) !== !before.dark && tries < 100; tries++) {
    await tab.waitForTimeout(20);
  }
  assert.equal(await frameTheme(), !before.dark);
  await set(tab, { scheme: 'system' });
  for (let tries = 0; (await frameTheme()) !== before.dark && tries < 100; tries++) {
    await tab.waitForTimeout(20);
  }
  log('docked themes page', { back: await frameTheme(), flipped: !before.dark });
  assert.equal(await frameTheme(), before.dark);
  await set(tab, { motion: 'system', panel: { docked: false, open: false } });
  await isDark(tab, before.dark);
  assert.deepEqual(await theme(tab), hostTheme);

  // A page whose policy allows nothing inline.
  await tab.goto(`${url}csp`);
  const csp = await tab.evaluate(async () => {
    await window.devknobs?.ready();
    const host = document.querySelector('[data-devknobs="panel"]');
    const wrap = host?.shadowRoot?.querySelector('.wrap');
    return {
      api: window.devknobs !== undefined,
      panel: host !== null,
      styled: wrap ? getComputedStyle(wrap).display === 'flex' : false,
    };
  });
  log('csp page', csp);

  // A page that refuses every frame: the width knob's frame of it loads all the same.
  await tab.goto(`${url}deny`);
  await ready(tab);
  await set(tab, { frame: true, width: 400 });
  const denied = await tab.waitForFunction(() => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    if (!inner?.devknobs || inner.document.readyState !== 'complete') {
      return null;
    }
    return {
      heading: inner.document.querySelector('h1')?.textContent,
      notice: document
        .querySelector('[data-devknobs="viewport"]')
        ?.shadowRoot?.querySelector<HTMLElement>('.blocked')?.hidden,
      width: inner.innerWidth,
    };
  });
  log('framed deny page', await denied.jsonValue());
  assert.deepEqual(await denied.jsonValue(), {
    heading: 'devknobs smoke',
    notice: true,
    width: 400,
  });

  // A link in the frame to another origin, such as a sign-in provider that refuses frames:
  // the tab goes there, as it would with no frame, and the knobs wait on this origin.
  await tab.evaluate((to) => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')!
      .shadowRoot!.querySelector<HTMLIFrameElement>(
        'iframe[data-devknobs-frame]',
      )!.contentDocument!;
    const link = inner.createElement('a');
    link.href = to;
    inner.body.append(link);
    link.click();
  }, `${otherOrigin}deny`);
  await tab.waitForURL(`${otherOrigin}deny`);
  log('frame left for another origin', tab.url());
  await tab.goto(`${url}deny`);
  await ready(tab);

  // A new tab straight to a page that refuses frames, with knobs that frame it at once
  // (window.open copies sessionStorage): the rule is in before the load, so the first frame loads.
  const errors: Array<string> = [];
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    tab.evaluate(() => window.open(location.href)),
  ]);
  opened.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  const firstLoad = await opened.waitForFunction(() => {
    const inner = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>('iframe[data-devknobs-frame]')?.contentWindow;
    try {
      if (!inner?.devknobs || inner.document.readyState !== 'complete') {
        return null;
      }
    } catch {
      return 'refused';
    }
    return inner.document.querySelector('h1')?.textContent;
  });
  log('new tab framed deny page', { errors, heading: await firstLoad.jsonValue() });
  assert.equal(await firstLoad.jsonValue(), 'devknobs smoke');
  assert.deepEqual(
    errors.filter((text) => text.includes('postMessage')),
    [],
  );
  await opened.close();
  await set(tab, { frame: false, width: 'full' });
  await tab.evaluate(() => window.devknobs!.ready());
  // Anything but a frame still gets the headers.
  const fetchedHeaders = await tab.evaluate(async () => {
    const { headers } = await fetch('/deny', { cache: 'no-store' });
    return [headers.get('x-frame-options'), headers.get('content-security-policy')];
  });
  log('fetched deny headers', fetchedHeaders);
  assert.deepEqual(fetchedHeaders, ['DENY', "frame-ancestors 'none'"]);

  const sessionRules = () =>
    worker.evaluate(async () =>
      (await chrome.declarativeNetRequest.getSessionRules()).map(({ condition, id }) => ({
        host: condition.requestDomains,
        id,
        tabIds: condition.tabIds,
      })),
    );
  // Another tab, on another host: its rule is its own, and a frame of a host that is not its own keeps the headers.
  const other = await context.newPage();
  await other.goto(otherOrigin);
  await ready(other);
  const otherId = await worker.evaluate(
    async (tabId) => (await chrome.tabs.query({})).find((tab) => tab.id !== tabId)!.id!,
    tabId,
  );
  const rules = await sessionRules();
  log('session rules', rules);
  assert.deepEqual(
    rules.toSorted((a, b) => a.id - b.id),
    [
      { host: ['127.0.0.1'], id: tabId, tabIds: [tabId] },
      { host: ['localhost'], id: otherId, tabIds: [otherId] },
    ].toSorted((a, b) => a.id - b.id),
  );
  const frameOf = async (src: string) => {
    await other.evaluate(
      (src) =>
        new Promise((resolve) => {
          document.querySelector('#probe')?.remove();
          const frame = document.createElement('iframe');
          frame.id = 'probe';
          frame.addEventListener('load', resolve, { once: true });
          frame.src = src;
          document.body.append(frame);
        }),
      src,
    );
    const frame = other.frames().find((frame) => frame.parentFrame() !== null);
    return frame?.evaluate(() => document.querySelector('h1')?.textContent?.trim());
  };
  const ownHost = await frameOf(`${otherOrigin}deny`);
  const foreignHost = await frameOf(`${url}deny`);
  log('other tab frames', { foreignHost, ownHost });
  assert.equal(ownHost, 'devknobs smoke');
  assert.notEqual(foreignHost, 'devknobs smoke', 'a frame of another host keeps its headers');
  await other.close();
  for (let tries = 0; (await sessionRules()).length > 1 && tries < 50; tries++) {
    await tab.waitForTimeout(20);
  }
  assert.deepEqual(
    (await sessionRules()).map(({ id }) => id),
    [tabId],
    'closing a tab drops its rule',
  );

  // Both shots under the same system scheme, at the same size.
  // A fresh tab: one the debugger was on can keep a stale strip where Chrome's bar was.
  await mkdir(out, { recursive: true });
  const shot = await context.newPage();
  await shot.goto(url);
  await ready(shot);
  await openPanel(shot);
  await shot.screenshot({ path: join(out, 'extension.png') });

  const npmBrowser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const npm = await npmBrowser.newPage({ colorScheme: null, viewport });
    await npm.goto(`${url}npm`);
    await ready(npm);
    assert.equal(await handleShown(npm), true, 'the npm build keeps its handle');
    await openPanel(npm);
    await npm.screenshot({ path: join(out, 'npm.png') });
  } finally {
    await npmBrowser.close();
  }
  log('screenshots', [join(out, 'extension.png'), join(out, 'npm.png')]);

  await nativeViewport();
  await inPageMode();
  await refusalCauses();
  await workerFrames();

  process.stdout.write('smoke passed\n');
} finally {
  await context.close();
  server.close();
  await rm(profile, { force: true, recursive: true });
}

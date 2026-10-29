// Two copies of the extension on one page, as with the store's and a local build both on:
// builds a store (release) and a local copy of this checkout into a folder of its own, loads
// both into Playwright's Chromium, in both orders (Chromium injects by extension id, which
// comes from the folder's path, so each order gets folders named to sort so), and checks the local one holds the page
// with one panel, its footer saying the store's stood down, the store's toolbar button opening
// it, and a page's own copy taking it with prefer set to page. `node scripts/pair.ts <dir>`
// adds an older store build, such as the store's 0.5.1 built from its tag, in both orders too.
// Build devknobs first.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type BrowserContext, chromium, type Page, type Worker } from 'playwright-core';

const root = join(import.meta.dirname, '..');
const devknobsDist = join(root, '../devknobs/dist');
const older = process.argv[2] ? resolve(process.argv[2]) : null;
const work = await realpath(await mkdtemp(join(tmpdir(), 'knobs-pair-')));

type Role = 'store' | 'local' | 'older';

/** Build this checkout into `work/<role>`, a store build or a local one. */
function build(role: 'store' | 'local'): string {
  const dir = join(work, role);
  const env = { ...process.env, CI: '', KNOBS_BUILD_LABEL: 'pair', KNOBS_RELEASE: '' };
  if (role === 'store') {
    env.KNOBS_RELEASE = '1';
  }
  execFileSync('bun', [join(root, 'scripts/build.ts'), dir], { env, stdio: 'inherit' });
  return dir;
}

let copies = 0;

/** Chromium's id for an unpacked extension: the path's sha256, its first 32 hex digits as a to p. */
const idOf = (path: string) =>
  createHash('sha256')
    .update(path)
    .digest('hex')
    .slice(0, 32)
    .replaceAll(/./g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));

/**
 * A copy of `dir` whose id sorts before `than`'s (or after, with `first` false), so Chromium
 * injects it first (or last). Its folder says which it is, for the service worker to read
 * back, and its page world notes as it starts, in `window.pairOrder`.
 */
async function mark(dir: string, role: Role, than: string | null, first: boolean): Promise<string> {
  let copy = '';
  while (!copy || (than !== null && idOf(copy) < idOf(than) !== first)) {
    copy = join(work, `${role}-${++copies}`);
  }
  execFileSync('cp', ['-R', dir, copy]);
  await writeFile(join(copy, 'pair-role.txt'), role);
  const content = join(copy, 'content.js');
  const note = `if (window === top) (window.pairOrder ??= []).push(${JSON.stringify(role)});\n`;
  await writeFile(content, note + (await readFile(content, 'utf8')));
  return copy;
}

const builds: Record<Role, string | null> = {
  local: build('local'),
  older,
  store: build('store'),
};
const label = (
  JSON.parse(await readFile(join(builds.local!, 'manifest.json'), 'utf8')) as {
    version_name: string;
  }
).version_name;
const version = /VERSION = "([^"]+)"/.exec(
  await readFile(join(devknobsDist, 'index.js'), 'utf8'),
)![1]!;

const page = (extra = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><title>pair</title>${extra}</head><body><h1>pair</h1></body></html>`;
// The store's 0.5 builds hear one channel: a page listener on it counts what gets through.
const legacy = `<script>window.legacyHeard = 0;
document.addEventListener('devknobs-extension:tab', () => window.legacyHeard++);</script>`;

const server = createServer(async (request, response) => {
  const path = request.url ?? '/';
  const built = /^\/devknobs\/((?:[\w-]+\/)*[\w.-]+\.js)$/.exec(path)?.[1];
  if (built) {
    response.setHeader('content-type', 'text/javascript');
    response.end(await readFile(join(devknobsDist, built)).catch(() => ''));
    return;
  }
  response.setHeader('content-type', 'text/html');
  if (path === '/own') {
    response.end(
      page(`<script type="module">
import { mount } from '/devknobs/index.js';
mount();
window.pageMounted = true;
</script>`),
    );
    return;
  }
  response.end(page(legacy));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

declare global {
  interface Window {
    legacyHeard?: number;
    pageMounted?: boolean;
    pairOrder?: Array<Role>;
  }
}

const log = (name: string, value: unknown) =>
  process.stdout.write(`${name} ${JSON.stringify(value)}\n`);

const panels = (tab: Page) =>
  tab.evaluate(() =>
    [...document.querySelectorAll('[data-devknobs="panel"]')].map(
      (host) => host.shadowRoot?.querySelector('.runtime')?.textContent ?? null,
    ),
  );

/** The service worker of each copy, by the role its folder names. */
async function workers(context: BrowserContext, count: number): Promise<Map<Role, Worker>> {
  while (context.serviceWorkers().length < count) {
    await context.waitForEvent('serviceworker');
  }
  const found = new Map<Role, Worker>();
  for (const worker of context.serviceWorkers()) {
    const role = await worker.evaluate(
      async () => (await fetch(chrome.runtime.getURL('pair-role.txt'))).text() as Promise<Role>,
    );
    found.set(role, worker);
  }
  return found;
}

/** What a copy's toolbar button sends the tab. */
const toggle = (worker: Worker, at: string) =>
  worker.evaluate(async (at) => {
    const [tab] = await chrome.tabs.query({ url: at });
    await chrome.tabs.sendMessage(tab!.id!, { type: 'toggle' });
  }, at);

const open = (tab: Page) => tab.evaluate(() => window.devknobs!.getState().panel.open);

/** Load the two copies, injected in `order`, and check the local one holds a plain page and a page with its own copy. */
async function pair(order: [Role, Role], other: Role) {
  const firstDir = await mark(builds[order[0]]!, order[0], null, true);
  const dirs = [firstDir, await mark(builds[order[1]]!, order[1], firstDir, false)].join(',');
  const profile = await mkdtemp(join(tmpdir(), 'knobs-pair-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    args: [`--disable-extensions-except=${dirs}`, `--load-extension=${dirs}`],
    channel: 'chromium',
    headless: true,
  });
  try {
    const found = await workers(context, 2);
    const tab = context.pages()[0] ?? (await context.newPage());
    const errors: Array<string> = [];
    tab.on('pageerror', (error) => errors.push(String(error)));
    // Knobs the other copy kept for the tab from an earlier load, which it hands the page as it loads.
    const tabId = await found.get(other)!.evaluate(async () => {
      const [only] = await chrome.tabs.query({});
      await chrome.storage.session.set({ [`tab:${only!.id!}`]: { textSize: 20 } });
      return only!.id!;
    });
    await tab.goto(url);
    await tab.waitForFunction(() => window.devknobs?.ready().then(() => true));
    await tab.waitForTimeout(400);
    assert.deepEqual(await tab.evaluate(() => window.pairOrder), order);
    const held = await panels(tab);
    log(`${order.join(' then ')}: panels`, held);
    const note = other === 'older' ? 'older extension stood down' : 'store extension stood down';
    assert.deepEqual(held, [`extension ${label} · ${note}`]);
    // A copy of this change that stood down sets them back, its debugger with them; an older one cannot.
    if (other === 'store') {
      const kept = await found.get('store')!.evaluate(
        async (id) =>
          (
            await (
              globalThis as unknown as {
                knobs: { get: (id: number) => Promise<{ textSize: unknown }> };
              }
            ).knobs.get(id)
          ).textSize,
        tabId,
      );
      log(`${order.join(' then ')}: the store copy's knobs for the tab`, kept);
      assert.equal(kept, 'system');
    }

    // The local copy's toolbar button, then the other's: one panel, the local one, either way.
    await toggle(found.get('local')!, url);
    await tab.waitForFunction(() => window.devknobs!.getState().panel.open);
    const before = await open(tab);
    await toggle(found.get(other)!, url);
    await tab.waitForTimeout(400);
    const after = {
      legacyHeard: await tab.evaluate(() => window.legacyHeard),
      open: await open(tab),
      panels: await panels(tab),
    };
    log(`${order.join(' then ')}: after the ${other} copy's toolbar button`, after);
    // A stood down copy of this change opens the holder's panel; an older one hears nothing.
    assert.deepEqual(after, {
      legacyHeard: 0,
      open: other === 'older' ? before : !before,
      panels: held,
    });

    // With page preferred in the local copy, a page's own copy of this change holds the page.
    await found.get('local')!.evaluate(() => chrome.storage.local.set({ prefer: 'page' }));
    await tab.goto(`${url}own`);
    await tab.waitForFunction(() => window.pageMounted === true);
    await tab.waitForFunction(() => window.devknobs?.ready().then(() => true));
    await tab.waitForTimeout(400);
    const own = await panels(tab);
    log(`${order.join(' then ')}: a page with its own copy, page preferred`, own);
    assert.deepEqual(own, [`page ${version}`]);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await rm(profile, { force: true, recursive: true });
  }
}

try {
  await pair(['store', 'local'], 'store');
  await pair(['local', 'store'], 'store');
  if (older) {
    await pair(['older', 'local'], 'older');
    await pair(['local', 'older'], 'older');
  }
  process.stdout.write('pair smoke passed\n');
} finally {
  server.close();
  await rm(work, { force: true, recursive: true });
}

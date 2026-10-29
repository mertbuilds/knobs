// End to end: the panel paints over grab's boxes, over the page's highest z-index and over
// its top layer, and grab's boxes paint over the page's open modal dialog. Loads the global
// build into Playwright's Chromium on a local page, turns inspect on and hovers.
// Build first, then: pnpm --filter @vinena/knobs toplayer [index.global.js] [screenshot dir]
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright-core';

const root = join(import.meta.dirname, '..');
// Playwright comes from the ui package, the one that has it.
const require = createRequire(join(root, '../ui/package.json'));
const { chromium } = require('playwright') as typeof import('playwright-core');

const script = resolve(process.argv[2] ?? join(root, 'dist/index.global.js'));
const out = process.argv[3] ? resolve(process.argv[3]) : null;

// The page sets a look on every popover and backdrop, as a page may, which the hosts keep out of.
const style = `<style>
body { margin: 0; font: 16px system-ui; background: rgb(250, 250, 250); }
#max { position: fixed; top: 0; right: 0; width: 520px; height: 100vh; z-index: 2147483647;
  background: rgb(40, 160, 90); }
#page-pop { inset: auto 40px 40px auto; width: 480px; height: 200px; margin: 0;
  background: rgb(200, 60, 160); }
[popover] { padding: 30px; border: 6px solid rgb(255, 0, 0); background: rgb(255, 255, 0);
  width: 280px; height: 140px; min-width: 280px; backdrop-filter: blur(6px); }
::backdrop { background: rgba(0, 0, 255, 0.3); }
dialog { inset: 80px auto auto 80px; margin: 0; width: 360px; padding: 24px; }
#block { margin: 120px 40px; height: 500px; background: rgb(230, 230, 230); }
#inside { height: 120px; margin: 20px; padding: 12px; background: rgb(240, 240, 240); }
</style>`;

const page = (path: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>top layer</title>${style}<script src="/devknobs.js"></script></head><body>
${
  path === '/plain'
    ? '<div id="block">a plain block under the panel</div>'
    : `<div id="max">z-index 2147483647</div>
<div id="page-pop" popover="manual">the page's popover</div>
${path === '/dialog' ? '<dialog id="dialog"><div id="inside">in the modal dialog</div></dialog>' : ''}`
}
</body></html>`;

const code = await readFile(script, 'utf8');
const server = createServer((request, response) => {
  if (request.url === '/devknobs.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(code);
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end(page(request.url ?? '/'));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far apart two shots of the same box are, as the mean difference of a channel, 0 to 255. */
async function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([one, two]) => {
      const read = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no canvas');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [first, second] = await Promise.all([read(one), read(two)]);
      let sum = 0;
      for (let index = 0; index < first.length; index++) {
        sum += Math.abs((first[index] ?? 0) - (second[index] ?? 0));
      }
      return sum / first.length;
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

/** The panel's own box, its handle left out. */
async function panelBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-devknobs="panel"]');
    const panel = host?.shadowRoot?.querySelector('.panel');
    if (!panel) throw new Error('no panel');
    const rect = panel.getBoundingClientRect();
    return { x: rect.x + 4, y: rect.y + 4, width: rect.width - 8, height: rect.height - 8 };
  });
}

async function open(path: string): Promise<Page> {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.goto(`${base}${path}`);
  await tab.evaluate(() => window.devknobs?.ready());
  await tab.evaluate(() => window.devknobs?.setState({ panel: { open: true } }));
  await tab.waitForTimeout(600);
  return tab;
}

async function inspect(tab: Page): Promise<void> {
  await tab.keyboard.press('Shift+C');
  await tab.waitForTimeout(300);
}

/** Hover a point and wait for the box to settle and its fade to end. */
async function hover(tab: Page, x: number, y: number): Promise<void> {
  await tab.mouse.move(x - 20, y - 20);
  await tab.mouse.move(x, y, { steps: 4 });
  await tab.waitForTimeout(900);
}

/** Rest the pointer on the panel's empty top, where nothing is boxed and no tip shows. */
async function rest(tab: Page, box: Box): Promise<void> {
  await hover(tab, box.x + box.width / 2, box.y + 60);
}

/** What grab's layer shows: its box, the tints of inspect and the label. */
async function shown(tab: Page): Promise<string[]> {
  return tab.evaluate(() => {
    const layer = document.querySelector('[data-devknobs="grab"]')?.shadowRoot;
    if (!layer) return [];
    return [...layer.querySelectorAll('.box.on, .tint.on, .pill.on')].map((node) => node.className);
  });
}

async function shoot(tab: Page, name: string): Promise<void> {
  if (out) await tab.screenshot({ path: join(out, `${name}.png`) });
}

if (out) await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: string[] = [];
let failed = false;

function check(name: string, ok: boolean, detail: string): void {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) failed = true;
}

try {
  // A plain page: the box of an element that runs under the panel stays under it.
  const plain = await open('/plain');
  const plainSize = await panelBox(plain);
  await inspect(plain);
  const plainBox = await panelBox(plain);
  await rest(plain, plainBox);
  const plainClean = await plain.screenshot({ clip: plainBox });
  await hover(plain, plainBox.x - 30, plainBox.y + 200);
  const plainHovered = await plain.screenshot({ clip: plainBox });
  await shoot(plain, 'plain');
  const plainTint = await difference(plain, plainClean, plainHovered);
  check('a plain page: the element under the panel is boxed', (await shown(plain)).length > 0, JSON.stringify(await shown(plain)));
  check('a plain page: the box leaves the panel as it was', plainTint < 1, `mean channel change ${plainTint.toFixed(2)}`);
  await plain.close();
  // The same page with the popover rules: the panel keeps its size, the grab layer covers the window.
  const ruled = await open('/');
  const ruledSize = await panelBox(ruled);
  check(
    "the page's popover rules leave the panel its size",
    Math.abs(ruledSize.width - plainSize.width) < 1 && Math.abs(ruledSize.height - plainSize.height) < 1,
    `${ruledSize.width}x${ruledSize.height} against ${plainSize.width}x${plainSize.height}`,
  );
  await ruled.close();

  // The panel goes in again over a popover the page opens, and keeps the focus it had.
  const typing = await open('/plain');
  await typing.keyboard.press('/');
  await typing.keyboard.type('dark');
  const kept = await typing.evaluate(async () => {
    const host = document.querySelector('[data-devknobs="panel"]');
    const before = host?.shadowRoot?.activeElement?.className;
    const pop = document.createElement('div');
    pop.popover = 'auto';
    pop.textContent = 'opened by the page';
    document.body.append(pop);
    pop.showPopover();
    await new Promise((done) => setTimeout(done, 100));
    const field = host?.shadowRoot?.activeElement as HTMLInputElement | null | undefined;
    return { before, after: field?.className, value: field?.value, top: document.activeElement === host };
  });
  check(
    'the panel keeps its focus as it goes in again',
    kept.before === 'search' && kept.after === 'search' && kept.value === 'dark' && kept.top,
    JSON.stringify(kept),
  );
  await typing.close();

  // The page's popover comes in after the panel, over it, until the panel goes in again.
  const tab = await open('/');
  await tab.evaluate(() => document.querySelector<HTMLElement>('#page-pop')?.showPopover());
  await tab.waitForTimeout(200);
  await inspect(tab);
  const box = await panelBox(tab);
  await rest(tab, box);
  const clean = await tab.screenshot({ clip: box });
  check('hovering the panel boxes nothing', (await shown(tab)).length === 0, JSON.stringify(await shown(tab)));
  // On the z-index element, just left of the panel: its box runs on under the panel.
  await hover(tab, box.x - 30, box.y + 200);
  const hovered = await tab.screenshot({ clip: box });
  await shoot(tab, 'under-panel');
  const boxed = await shown(tab);
  const tinted = await difference(tab, clean, hovered);
  check('the element under the panel is boxed', boxed.length > 0, JSON.stringify(boxed));
  check('the box under the panel leaves the panel as it was', tinted < 1, `mean channel change ${tinted.toFixed(2)}`);
  const cover = await tab.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-devknobs="grab"]');
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    const style = getComputedStyle(host);
    return { width: rect.width, height: rect.height, view: [innerWidth, innerHeight], blur: style.backdropFilter };
  });
  check(
    "the page's popover rules leave the grab layer covering the window",
    cover?.width === cover?.view[0] && cover?.height === cover?.view[1] && cover?.blur === 'none',
    JSON.stringify(cover),
  );
  const looks = await tab.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-devknobs="panel"]');
    if (!host) return null;
    const style = getComputedStyle(host);
    const backdrop = getComputedStyle(host, '::backdrop').display;
    return { padding: style.paddingTop, border: style.borderTopWidth, background: style.backgroundColor, backdrop };
  });
  check(
    "the page's popover and backdrop rules leave the panel's host alone",
    looks?.padding === '0px' && looks.border === '0px' && looks.background === 'rgba(0, 0, 0, 0)' && looks.backdrop === 'none',
    JSON.stringify(looks),
  );
  await tab.close();

  // In an open modal dialog: the box paints over it, and the panel over both.
  const modal = await open('/dialog');
  await modal.evaluate(() => document.querySelector<HTMLDialogElement>('#dialog')?.showModal());
  await modal.waitForTimeout(200);
  const inside = await modal.evaluate(() => {
    const rect = document.querySelector('#inside')?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  });
  assert(inside, 'no dialog');
  await inspect(modal);
  const modalBox = await panelBox(modal);
  await rest(modal, modalBox);
  const dialogClean = await modal.screenshot({ clip: inside });
  const panelClean = await modal.screenshot({ clip: modalBox });
  await hover(modal, inside.x + inside.width / 2, inside.y + inside.height / 2);
  const dialogHovered = await modal.screenshot({ clip: inside });
  const panelHovered = await modal.screenshot({ clip: modalBox });
  await shoot(modal, 'in-dialog');
  const inDialog = await difference(modal, dialogClean, dialogHovered);
  check('the box paints over the modal dialog', inDialog > 3 && (await shown(modal)).length > 0, `mean channel change ${inDialog.toFixed(2)}`);
  const modalPanel = await difference(modal, panelClean, panelHovered);
  check('the panel stays over the dialog and the box', modalPanel < 1, `mean channel change ${modalPanel.toFixed(2)}`);
  await modal.close();

  // In a phone frame the page and its boxes are in the frame, the panel beside it on top.
  const framed = await open('/');
  await framed.evaluate(() => window.devknobs?.setState({ device: 'iphone-18-pro' } as never));
  await framed.waitForTimeout(1500);
  const frame = framed.frames().find((one) => one !== framed.mainFrame());
  assert(frame, 'no frame');
  await frame.evaluate(() => document.querySelector<HTMLElement>('#page-pop')?.showPopover());
  const rect = await (await frame.frameElement()).boundingBox();
  assert(rect, 'no frame box');
  await framed.mouse.click(rect.x + rect.width / 2, rect.y + 40);
  await inspect(framed);
  const frameBox = await panelBox(framed);
  await rest(framed, frameBox);
  const frameClean = await framed.screenshot({ clip: frameBox });
  // The z-index element, at the frame's right, runs on under the panel where the two meet.
  await hover(framed, rect.x + rect.width - 30, rect.y + rect.height / 2);
  const frameHovered = await framed.screenshot({ clip: frameBox });
  await shoot(framed, 'phone-frame');
  const framePanel = await difference(framed, frameClean, frameHovered);
  const inFrame = await frame.evaluate(() => {
    const layer = document.querySelector('[data-devknobs="grab"]')?.shadowRoot;
    return layer ? layer.querySelectorAll('.box.on, .tint.on').length : -1;
  });
  check('in a phone frame the box is drawn in the frame', inFrame > 0, `${inFrame} parts on`);
  check('in a phone frame the panel stays on top', framePanel < 1, `mean channel change ${framePanel.toFixed(2)}`);
  await framed.close();
} finally {
  await browser.close();
  server.close();
}

console.log(results.join('\n'));
if (failed) process.exit(1);

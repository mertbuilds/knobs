import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = join(import.meta.dir, '..');
// `dist/` is what Chrome loads; a work in progress builds elsewhere: `bun scripts/build.ts <dir>`.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
// devknobs' built package: run `pnpm --filter devknobs build` first (turbo does).
const devknobs = dirname(Bun.resolveSync('devknobs', root));

await rm(dist, { force: true, recursive: true });

async function build(config: Parameters<typeof Bun.build>[0]) {
  const result = await Bun.build({ outdir: dist, target: 'browser', ...config });
  if (!result.success) {
    for (const log of result.logs) {
      process.stderr.write(`${log}\n`);
    }
    process.exit(1);
  }
}

await build({
  entrypoints: [join(root, 'src/background.ts'), join(root, 'src/offscreen.ts')],
  format: 'esm',
});
// Content scripts are classic scripts, one file each. devknobs finds its device
// images beside `import.meta.url`, which in the page world is the extension's
// root, handed over by the bridge.
await build({
  define: { 'import.meta.url': 'globalThis.devknobsExtensionBase' },
  entrypoints: [join(root, 'src/content.ts'), join(root, 'src/bridge.ts')],
  format: 'iife',
});

// Chrome refuses a content script with a Unicode noncharacter in it as not UTF-8, and
// the bundle carries one raw in a regex. Its escape means the same there and in a string.
const content = join(dist, 'content.js');
await writeFile(
  content,
  (await readFile(content, 'utf8')).replaceAll(
    /[\uFDD0-\uFDEF\uFFFE\uFFFF]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16)}`,
  ),
);

await cp(join(root, 'static'), dist, { recursive: true });
await cp(join(devknobs, 'bezels'), join(dist, 'bezels'), { recursive: true });

import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { buildFacts, localLabel } from './label.ts';

const root = join(import.meta.dir, '..');
// `dist/` is what Chrome loads; a work in progress builds elsewhere: `bun scripts/build.ts <dir>`.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist');
// devknobs' built package: run `pnpm --filter @vinena/knobs build` first (turbo does).
const devknobs = dirname(Bun.resolveSync('@vinena/knobs', root));

const { version } = JSON.parse(await readFile(join(devknobs, '../package.json'), 'utf8')) as {
  version: string;
};
// Null for the store's build and CI's, which keep the manifest's version alone.
const label = localLabel(version, buildFacts(root));

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
// Its page world and bridge share an event channel no other build of the extension has, and the
// page world tells the build's kind, which decides who holds a page two copies of the extension meet on.
await build({
  define: {
    'import.meta.url': 'globalThis.devknobsExtensionBase',
    KNOBS_BUILD: JSON.stringify(label ? 'local' : 'store'),
    KNOBS_CHANNEL: JSON.stringify(crypto.randomUUID().slice(0, 8)),
  },
  entrypoints: [join(root, 'src/content.ts'), join(root, 'src/bridge.ts')],
  format: 'iife',
});

// Chrome refuses a content script with a Unicode noncharacter in it as not UTF-8, and
// the bundle carries one raw in a regex. Its escape means the same there and in a string.
// A local build's panel footer names it as chrome://extensions does.
const content = join(dist, 'content.js');
let code = (await readFile(content, 'utf8')).replaceAll(
  /[\uFDD0-\uFDEF\uFFFE\uFFFF]/g,
  (char) => `\\u${char.charCodeAt(0).toString(16)}`,
);
if (label) {
  code = code.replace(/(?<![\w$])VERSION = "[^"]+"/, `VERSION = ${JSON.stringify(label)}`);
}
await writeFile(content, code);

await cp(join(root, 'static'), dist, { recursive: true });
if (label) {
  const manifest = join(dist, 'manifest.json');
  const json = JSON.parse(await readFile(manifest, 'utf8')) as Record<string, unknown>;
  await writeFile(manifest, `${JSON.stringify({ ...json, version_name: label }, null, 2)}\n`);
}
await cp(join(devknobs, 'bezels'), join(dist, 'bezels'), { recursive: true });

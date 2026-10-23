// The Chrome Web Store upload: builds dist/, then zips it with manifest.json at the root,
// as devknobs-<version>.zip beside this package's package.json.
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const root = join(import.meta.dir, '..');
const dist = join(root, 'dist');

await $`bun ${join(root, 'scripts/build.ts')}`;

const { version } = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8')) as {
  version: string;
};
const zip = join(root, `devknobs-${version}.zip`);
await rm(zip, { force: true });
await $`zip -r -X -q ${zip} . -x '*.DS_Store' '*.map'`.cwd(dist);

process.stdout.write(`${zip}\n`);

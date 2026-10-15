/**
 * Fails when the web app's build output holds any of the fold tuning tools
 * (`apps/web/src/dev/**`, `apps/web/vite.tune.ts`) or their reference images
 * (`apps/web/.tune/ref`). They are for local development only. Runs after
 * `vite build` in the web app's `build` script.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '../apps/web/dist');
const refs = path.resolve(import.meta.dirname, '../apps/web/.tune/ref');

// Strings only the site's own dev tools hold. devknobs' own hook name is not one of them.
const markers = [
  '__tune',
  'knobs:foldtune',
  'knobs:refscreen',
  'arriveAtReference',
  'fold tune',
  'load last saved',
];

// A reference image by its name, or by its content under any name.
const refName = /-(inner|outer)\.(png|avif|jpg|jpeg|webp)$/i;
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const refHashes = new Set<string>();
if (existsSync(refs)) {
  for (const entry of readdirSync(refs, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      refHashes.add(hash(path.join(entry.parentPath, entry.name)));
    }
  }
}

if (!existsSync(dist)) {
  process.stderr.write(`dev-tools-check: no build output at ${dist}\n`);
  process.exit(1);
}

let hits = 0;
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) {
    continue;
  }
  const file = path.join(entry.parentPath, entry.name);
  if (refName.test(entry.name)) {
    hits += 1;
    process.stderr.write(`dev-tools-check: reference image name ${path.relative(dist, file)}\n`);
  }
  if (refHashes.size > 0 && refHashes.has(hash(file))) {
    hits += 1;
    process.stderr.write(
      `dev-tools-check: reference image content in ${path.relative(dist, file)}\n`,
    );
  }
  const content = readFileSync(file, 'latin1');
  for (const marker of markers) {
    if (content.includes(marker)) {
      hits += 1;
      process.stderr.write(`dev-tools-check: '${marker}' in ${path.relative(dist, file)}\n`);
    }
  }
}

if (hits > 0) {
  process.stderr.write('dev-tools-check: the fold tuning tools reached the build output.\n');
  process.exit(1);
}
process.stdout.write('dev-tools-check: no fold tuning tools in the build output.\n');

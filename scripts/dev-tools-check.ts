/**
 * Fails when the web app's build output holds any of the fold tuning tools
 * (`apps/web/src/dev/**`, `apps/web/vite.tune.ts`). They are for local
 * development only. Runs after `vite build` in the web app's `build` script.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '../apps/web/dist');

// Strings only the site's own dev tools hold. devknobs' own hook name is not one of them.
const markers = [
  '__tune',
  'knobs:foldtune',
  'knobs:refscreen',
  'arriveAtReference',
  'fold tune',
  'load last saved',
];

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

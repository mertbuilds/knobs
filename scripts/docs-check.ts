/**
 * Fails when a docs page's frontmatter is missing a key or has a bad one
 * (`title`, `description`, `order`, `updated`). The Worker reads the pages when
 * it first loads them, so without this a bad page would build fine and then
 * fail every `/docs/*` request and `/sitemap.xml`. Runs after `vite build` in
 * the web app's `build` script.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { docFrontmatter } from '../apps/web/src/docs/frontmatter.ts';

const docs = path.resolve(import.meta.dirname, '../apps/web/content/docs');

let bad = 0;
const files = readdirSync(docs).filter((name) => name.endsWith('.md'));
for (const name of files) {
  try {
    docFrontmatter(name.slice(0, -'.md'.length), readFileSync(path.join(docs, name), 'utf8'));
  } catch (error) {
    bad += 1;
    process.stderr.write(`docs-check: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (bad > 0) {
  process.exit(1);
}
process.stdout.write(`docs-check: ${files.length} docs pages have valid frontmatter.\n`);

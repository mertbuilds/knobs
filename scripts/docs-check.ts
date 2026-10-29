/**
 * Fails when a docs page's frontmatter is missing a key or has a bad one
 * (`title`, `description`, `order`, `updated`), or when its description, the
 * page's meta description, is not 120 to 160 characters long. The Worker reads the pages when
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
    const { description } = docFrontmatter(
      name.slice(0, -'.md'.length),
      readFileSync(path.join(docs, name), 'utf8'),
    );
    if (description.length < 120 || description.length > 160) {
      bad += 1;
      process.stderr.write(
        `docs-check: ${name} description is ${description.length} characters, needs 120 to 160\n`,
      );
    }
  } catch (error) {
    bad += 1;
    process.stderr.write(`docs-check: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (bad > 0) {
  process.exit(1);
}
process.stdout.write(`docs-check: ${files.length} docs pages have valid frontmatter.\n`);

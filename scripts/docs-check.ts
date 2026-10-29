/**
 * Fails when a docs page's frontmatter is missing a key or has a bad one
 * (`title`, `description`, `order`, `updated`), or when its description, the
 * page's meta description, is not 120 to 160 characters long. The Worker reads the pages when
 * it first loads them, so without this a bad page would build fine and then
 * fail every `/docs/*` request and `/sitemap.xml`. Runs after `vite build` in
 * the web app's `build` script.
 *
 * It checks the blog posts in `content/blog` the same way: `title`,
 * `description`, `slug` (the file's name), `date` and `updated` (real days),
 * every faq question with an answer, and no draft left in: no `[VERIFY]` mark
 * and no "Notes for the editor".
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { postFrontmatter } from '../apps/web/src/blog/frontmatter.ts';
import { docFrontmatter } from '../apps/web/src/docs/frontmatter.ts';

const docs = path.resolve(import.meta.dirname, '../apps/web/content/docs');
const blog = path.resolve(import.meta.dirname, '../apps/web/content/blog');

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

const postFiles = readdirSync(blog).filter((name) => name.endsWith('.md'));
for (const name of postFiles) {
  try {
    const source = readFileSync(path.join(blog, name), 'utf8');
    postFrontmatter(name.slice(0, -'.md'.length), source);
    if (source.includes('[VERIFY]') || /notes for the editor/i.test(source)) {
      bad += 1;
      process.stderr.write(`docs-check: ${name} is a draft: it has [VERIFY] or editor notes\n`);
    }
  } catch (error) {
    bad += 1;
    process.stderr.write(`docs-check: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (bad > 0) {
  process.exit(1);
}
process.stdout.write(
  `docs-check: ${files.length} docs pages and ${postFiles.length} blog posts have valid frontmatter.\n`,
);

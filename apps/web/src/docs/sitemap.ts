import { posts } from '../blog/posts.ts';
import { CANONICAL_ORIGIN } from '../lib/canonical.ts';
import { pages } from './pages.ts';

/**
 * `/sitemap.xml`: the landing and every docs page, each at its canonical
 * address. `/docs` is left out, since it shows `/docs/start` and points there.
 * A docs page's `<lastmod>` is its frontmatter's `updated`; the landing has no
 * content date, so it has none. `/blog` changes with its newest post, and a post's
 * `<lastmod>` is its `updated`.
 */
const newest = posts
  .map((post) => post.updated)
  .toSorted()
  .at(-1);

const entries: ReadonlyArray<{ lastmod?: string; path: string }> = [
  { path: '/' },
  ...pages.map((page) => ({ lastmod: page.updated, path: `/docs/${page.slug}` })),
  ...(newest === undefined ? [] : [{ lastmod: newest, path: '/blog' }]),
  ...posts.map((post) => ({ lastmod: post.updated, path: `/blog/${post.slug}` })),
];

export const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({ lastmod, path }) =>
      `  <url>\n    <loc>${CANONICAL_ORIGIN}${path}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>`,
  )
  .join('\n')}
</urlset>
`;

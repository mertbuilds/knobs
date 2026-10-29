import { CANONICAL_ORIGIN } from '../lib/canonical.ts';
import { pages } from './pages.ts';

/**
 * `/sitemap.xml`: the landing and every docs page, each at its canonical
 * address. `/docs` is left out, since it shows `/docs/start` and points there.
 * A docs page's `<lastmod>` is its frontmatter's `updated`; the landing's is
 * the day of the build.
 */
const entries = [
  { lastmod: __BUILD_DATE__, path: '/' },
  ...pages.map((page) => ({ lastmod: page.updated, path: `/docs/${page.slug}` })),
];

export const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ({ lastmod, path }) =>
      `  <url>\n    <loc>${CANONICAL_ORIGIN}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
  )
  .join('\n')}
</urlset>
`;

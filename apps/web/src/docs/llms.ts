import { postFrontmatter } from '../blog/frontmatter.ts';
import { CANONICAL_ORIGIN } from '../lib/canonical.ts';
import { type Frontmatter, frontmatter, slugify } from './frontmatter.ts';

/**
 * `/llms.txt` and `/llms-full.txt` (llmstxt.org), for agents. They are built
 * once, when this module loads, from `content/reference`: the full text of the
 * docs, kept apart from the human docs pages so those can stay short.
 */

type Doc = Frontmatter & { slug: string };

const glob = (files: Record<string, string>): Array<Doc> =>
  Object.entries(files)
    .map(([path, source]) => {
      const slug = path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
      return { slug, ...frontmatter(slug, source) };
    })
    .toSorted((a, b) => a.order - b.order);

const references = glob(
  import.meta.glob<string>('../../content/reference/*.md', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
);

/** The short human pages, which the links point at. */
const pages = glob(
  import.meta.glob<string>('../../content/docs/*.md', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
);

/** The blog posts, newest first. */
const posts = Object.entries(
  import.meta.glob<string>('../../content/blog/*.md', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
)
  .map(([path, source]) =>
    postFrontmatter(path.slice(path.lastIndexOf('/') + 1, -'.md'.length), source),
  )
  .toSorted((a, b) => b.date.localeCompare(a.date));

/** The h2 and h3 ids of each human page, outside its code blocks. */
const anchors = new Map(
  pages.map((page) => [
    page.slug,
    new Set(
      Array.from(
        page.body.replaceAll(/^```[\s\S]*?^```/gm, '').matchAll(/^#{2,3} (.+)$/gm),
        (match) => slugify(match[1] ?? ''),
      ),
    ),
  ]),
);

const header = `# knobs

> devknobs is a dev-only panel inside the page that shows your site on an iPhone or a Pixel, tomorrow morning, in Arabic or in dark mode.

It emulates devices, locales, time, color schemes, network and motion settings from inside the page. Grab hands a coding agent an element with its html, components and source places, and an agent api lets a browser tool drive the knobs. A Chrome extension puts the same panel on any site and sets some knobs for real.
`;

/**
 * The reference links at the human pages, with the origin. A fragment stays
 * only where that page still has the heading; a bare `#x` is on the same page.
 */
const absolute = (slug: string, body: string) =>
  body
    .replaceAll(
      /\]\((?:\/docs\/([a-z0-9-]+))?#([a-z0-9-]+)\)/g,
      (_, target: string | undefined, id: string) => {
        const page = target ?? slug;
        const hash = anchors.get(page)?.has(id) === true ? `#${id}` : '';
        return `](${CANONICAL_ORIGIN}/docs/${page}${hash})`;
      },
    )
    .replaceAll('](/', `](${CANONICAL_ORIGIN}/`);

export const llmsTxt = `${header}
## Docs

${pages
  .map((page) => `- [${page.title}](${CANONICAL_ORIGIN}/docs/${page.slug}): ${page.description}`)
  .join('\n')}

## Blog

- [Blog](${CANONICAL_ORIGIN}/blog): every post, newest first
${posts
  .map((post) => `- [${post.title}](${CANONICAL_ORIGIN}/blog/${post.slug}): ${post.description}`)
  .join('\n')}

## Full reference

- [llms-full.txt](${CANONICAL_ORIGIN}/llms-full.txt): every docs page in full, in one file

## Optional

- [npm](https://www.npmjs.com/package/@vinena/knobs): the @vinena/knobs package
- [Chrome Web Store](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj): the knobs extension
- [GitHub](https://github.com/vinenastudio/knobs): the source of the package, the extension and this site
`;

export const llmsFullTxt = `${header}
${references
  .map(
    (page) =>
      `# ${page.title}\n\n${page.description}\n\n${absolute(page.slug, page.body).trim()}\n`,
  )
  .join('\n')}`;

export function textResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

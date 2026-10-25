import { notFound } from '@tanstack/react-router';
import { shareMeta } from '../lib/share.ts';
import { m } from '../paraglide/messages.js';

/** The page `/docs` shows. */
export const FIRST = 'start';

export type DocMeta = { description: string; title: string };

/**
 * The title and description of a docs page, or a not found for a slug with no
 * page. The pages load behind an `import()`: the entry bundle holds every
 * route's loader and head, and the landing should not carry the docs.
 */
export async function loadDoc(slug: string): Promise<DocMeta> {
  const { findPage } = await import('./pages.ts');
  const page = findPage(slug);
  if (page === undefined) {
    throw notFound();
  }
  return { description: page.description, title: page.title };
}

/** The `<head>` of a docs page: its title and its description, from its frontmatter, its share card, and the text for agents. */
export function docHead(doc: DocMeta | undefined, slug: string) {
  return doc === undefined
    ? {}
    : {
        links: [{ href: '/llms.txt', rel: 'alternate', title: 'llms.txt', type: 'text/plain' }],
        meta: [
          { title: m.docs_title({ title: doc.title }) },
          { content: doc.description, name: 'description' },
          ...shareMeta({
            description: doc.description,
            path: `/docs/${slug}`,
            title: m.docs_title({ title: doc.title }),
          }),
        ],
      };
}

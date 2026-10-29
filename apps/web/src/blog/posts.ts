import { blogMarkdown, type Faq, plain, render, type Segment } from '../docs/pages.ts';
import { postFrontmatter } from './frontmatter.ts';

/**
 * The blog posts: one markdown file each in `content/blog`. Each is parsed and
 * rendered once, when this module loads. A post's questions live in its
 * frontmatter and are drawn where `<!-- faq -->` stands in its body, so the
 * FAQPage schema and the page show the same words.
 */

export type Post = {
  date: string;
  description: string;
  faq: Array<Faq>;
  segments: Array<Segment>;
  slug: string;
  title: string;
  updated: string;
};

const FAQ_MARKER = '<!-- faq -->';

function parse(file: string, source: string): Post {
  const { body, date, description, faq, slug, title, updated } = postFrontmatter(file, source);
  const questions =
    faq.length === 0 ? '' : `## FAQ\n\n${faq.map(({ a, q }) => `### ${q}\n\n${a}\n`).join('\n')}`;
  const { segments } = render(
    body.includes(FAQ_MARKER) ? body.replace(FAQ_MARKER, questions) : `${body}\n${questions}`,
    blogMarkdown,
  );
  return {
    date,
    description,
    faq: faq.map(({ a, q }) => ({ answer: plain(a), question: plain(q) })),
    segments,
    slug,
    title,
    updated,
  };
}

const files = import.meta.glob<string>('../../content/blog/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

/** Every post, newest first. */
export const posts: Array<Post> = Object.entries(files)
  .map(([path, source]) => parse(path.slice(path.lastIndexOf('/') + 1, -'.md'.length), source))
  .toSorted((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

const bySlug = new Map(posts.map((post) => [post.slug, post]));

export function findPost(slug: string): Post | undefined {
  return bySlug.get(slug);
}

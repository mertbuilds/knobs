import { CANONICAL_ORIGIN } from './canonical.ts';

type Share = {
  description: string;
  /** The page's path, for `og:url`. */
  path?: string | undefined;
  title: string;
};

/** The site's one share image, drawn by `scripts/og.ts`. */
export const IMAGE = `${CANONICAL_ORIGIN}/og.png`;

/**
 * The Open Graph and X card tags for a page, all with the one image. The root
 * route sets the landing's, and a docs page sets its own: TanStack keeps the
 * deepest route's tag of each name or property, so a page's tags replace the
 * root's rather than repeat them.
 */
export function shareMeta({ description, path, title }: Share) {
  return [
    { content: title, property: 'og:title' },
    { content: description, property: 'og:description' },
    { content: 'website', property: 'og:type' },
    ...(path === undefined ? [] : [{ content: `${CANONICAL_ORIGIN}${path}`, property: 'og:url' }]),
    { content: IMAGE, property: 'og:image' },
    { content: '1200', property: 'og:image:width' },
    { content: '630', property: 'og:image:height' },
    { content: 'summary_large_image', name: 'twitter:card' },
    { content: IMAGE, name: 'twitter:image' },
  ];
}

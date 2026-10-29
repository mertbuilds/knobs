/** The studio behind knobs, the publisher in every page's schema. */
export const ORGANIZATION = {
  '@id': 'https://vinena.studio/#organization',
  '@type': 'Organization',
  logo: 'https://vinena.studio/apple-touch-icon.png',
  name: 'Vinena Studio',
  url: 'https://vinena.studio',
};

type Json = boolean | Array<Json> | null | number | string | { [key: string]: Json };

/**
 * A JSON-LD block for a route's `head().scripts`, which TanStack puts in
 * `<head>`. A `<` is escaped, so no text in it can close the script.
 */
export const jsonLd = (data: { [key: string]: Json }) => ({
  children: JSON.stringify({ '@context': 'https://schema.org', ...data }).replaceAll(
    '<',
    String.raw`\u003c`,
  ),
  type: 'application/ld+json',
});

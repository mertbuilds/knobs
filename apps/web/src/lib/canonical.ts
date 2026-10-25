/** The one host the site answers on. Everything else is sent here. */
export const CANONICAL_ORIGIN = 'https://knobs.dev';
const WWW_HOST = 'www.knobs.dev';

/**
 * `www` is a custom domain on this same Worker, so the move to the apex happens
 * here rather than in DNS. The path and the query ride along: a `www` link keeps
 * pointing at the page it always did.
 */
export function canonicalRedirect(url: URL): Response | null {
  if (url.hostname !== WWW_HOST) {
    return null;
  }
  return Response.redirect(`${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301);
}

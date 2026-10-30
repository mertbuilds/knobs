// devknobs' frame loads the tab's own page. A server can send that load to another origin, such
// as a site that sends a phone's browser to its mobile host: the tab follows it there, as the
// phone would get sent, with its knobs.

/** The address without its fragment, which no load sends, or null for no address. */
function unhashed(url: string): string | null {
  const parsed = URL.parse(url);
  if (!parsed) {
    return null;
  }
  parsed.hash = '';
  return parsed.href;
}

/** Is `url` a load of `page`, the address devknobs' frame was sent to, its fragment aside? */
export function isFramePage(page: string, url: string): boolean {
  const want = unhashed(page);
  return want !== null && want === unhashed(url);
}

/** Where a frame sent to `sent` landed on another origin: `landed`, or null for the same origin or no web page. */
export function movedTo(sent: string, landed: string): string | null {
  const from = URL.parse(sent);
  const to = URL.parse(landed);
  if (!from || !to || (to.protocol !== 'https:' && to.protocol !== 'http:')) {
    return null;
  }
  return from.origin === to.origin ? null : to.href;
}

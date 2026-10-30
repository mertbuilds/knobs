// devknobs' frame loads the tab's own page. A server can send that load to another origin of
// the same site, such as a site that sends a phone's browser to its mobile host: the tab follows
// it there, as the phone would get sent, with its knobs. A load sent to another site, such as a
// sign-in host, is not followed.

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

/**
 * The host's registrable domain, near enough: its last two labels, or three where the second to
 * last is a short public second level under a country (co.uk, com.tr). An address or a host of
 * one label is its own.
 */
function siteOf(host: string): string {
  const labels = host.split('.');
  if (labels.length < 2 || host.includes(':') || /^\d+$/.test(labels.at(-1)!)) {
    return host;
  }
  const tld = labels.at(-1)!;
  const second = labels.at(-2)!;
  const take = tld.length === 2 && second.length <= 3 && labels.length > 2 ? 3 : 2;
  return labels.slice(-take).join('.');
}

/** Are the two hosts of one site? */
export function sameSite(a: string, b: string): boolean {
  return a === b || siteOf(a) === siteOf(b);
}

/**
 * Where a frame sent to `sent` landed on another origin of the same site: `landed`, or null for
 * the same origin, another site, or no web page.
 */
export function movedTo(sent: string, landed: string): string | null {
  const from = URL.parse(sent);
  const to = URL.parse(landed);
  if (!from || !to || (to.protocol !== 'https:' && to.protocol !== 'http:')) {
    return null;
  }
  return from.origin === to.origin || !sameSite(from.hostname, to.hostname) ? null : to.href;
}

/** Knobs a page handed on, for the tab's next page on `origin`, until `until` (ms). */
export type Handoff<T> = { origin: string; state: T; until: number };

/**
 * What becomes of a handoff as the tab's page at `url` asks at `now`: the knobs, once, for a page
 * on its origin in time (`keep` false); nothing for a page elsewhere, the handoff kept; nothing
 * once it is too late, the handoff dropped.
 */
export function takeHandoff<T>(
  handoff: Handoff<T> | undefined,
  url: string | undefined,
  now: number,
): { keep: boolean; state?: T } {
  if (!handoff) {
    return { keep: false };
  }
  if (handoff.until < now) {
    return { keep: false };
  }
  if (URL.parse(url ?? '')?.origin !== handoff.origin) {
    return { keep: true };
  }
  return { keep: false, state: handoff.state };
}

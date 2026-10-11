import { createFileRoute } from '@tanstack/react-router';
import { publicAddress, refusesFraming } from '../try/address.ts';

// Every cap of the endpoint, in one place.
const TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;
const CACHE_SECONDS = 300;

const AGENT = 'knobs.dev frame check (+https://knobs.dev)';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

type Verdict = { ok: boolean; reason?: 'invalid' | 'refused' | 'unreachable' };

const UNREACHABLE: Verdict = { ok: false, reason: 'unreachable' };

/** The verdict and nothing else: no header and no byte of the site asked. */
function answer(verdict: Verdict, status: number, cache: boolean): Response {
  return new Response(JSON.stringify(verdict), {
    headers: {
      'cache-control': cache ? `private, max-age=${CACHE_SECONDS}` : 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
    status,
  });
}

/**
 * Did this page ask? The browser says so itself in `sec-fetch-site`, which a
 * script cannot set. Where a browser sends none, the referrer has to be this
 * origin. Another site's page gets no verdict, so the check is no probe for it.
 */
function fromThisSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) {
    return site === 'same-origin';
  }
  const from = request.headers.get('origin') ?? request.headers.get('referer');
  if (from === null) {
    return false;
  }
  try {
    return new URL(from).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * Asks for the page and reads its headers, never its body. A redirect is
 * followed by hand, `left` times at most, and each address it leads to has to
 * pass the same rules as the first.
 */
async function ask(url: URL, left: number, signal: AbortSignal): Promise<Verdict> {
  const response = await fetch(url, {
    headers: { accept: 'text/html,*/*;q=0.8', 'user-agent': AGENT },
    method: 'GET',
    redirect: 'manual',
    signal,
  });
  await response.body?.cancel();
  const location = response.headers.get('location');
  if (!REDIRECTS.has(response.status) || location === null) {
    return refusesFraming(response.headers) ? { ok: false, reason: 'refused' } : { ok: true };
  }
  const next = left > 0 && URL.canParse(location, url) ? new URL(location, url).href : null;
  const to = next === null ? null : publicAddress(next);
  return to === null ? UNREACHABLE : ask(to, left - 1, signal);
}

/**
 * Says whether a site lets itself be shown inside another page, for the "test
 * on your website" field. It asks public names only, holds nothing, and hands
 * back one of four words.
 */
async function frameable({ request }: { request: Request }): Promise<Response> {
  if (!fromThisSite(request)) {
    return answer({ ok: false, reason: 'invalid' }, 403, false);
  }
  const url = publicAddress(new URL(request.url).searchParams.get('url') ?? '');
  if (url === null) {
    return answer({ ok: false, reason: 'invalid' }, 200, true);
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const verdict = await ask(url, MAX_REDIRECTS, abort.signal);
    return answer(verdict, 200, verdict !== UNREACHABLE);
  } catch {
    // No such name, no answer in time, or a connection that broke.
    return answer(UNREACHABLE, 200, false);
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute('/api/frameable')({
  server: {
    handlers: {
      GET: frameable,
    },
  },
});

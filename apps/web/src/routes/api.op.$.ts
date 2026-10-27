import { createFileRoute } from '@tanstack/react-router';

/** The self-hosted OpenPanel: its API under `/api`, the script at the root. */
const ANALYTICS_HOST = 'https://analytics.vinena.studio';
const SCRIPT = '/op1.js';
/**
 * The session recorder. The self-hosted OpenPanel does not serve it, so it is
 * the npm build pinned to the server's SDK version; bump the two together.
 */
const REPLAY_SCRIPT = '/op1-replay.js';
const REPLAY_URL = 'https://cdn.jsdelivr.net/npm/@openpanel/web@1.4.1/dist/src/replay.global.js';
/** The request headers a script fetch passes on: compression and the cache check, nothing of the visitor's. */
const SCRIPT_HEADERS = ['accept-encoding', 'if-none-match'];
/**
 * Crawlers that run JavaScript reach this proxy too, and their visits inflate
 * every count. Their events are dropped before they reach OpenPanel; 200 so
 * the script does not retry. No user agent counts as a crawler.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|facebookexternalhit|preview|fetch|curl|wget|python|java\b|go-http|okhttp|axios/iu;

/** One of the two scripts, fetched with none of the visitor's headers and served as JavaScript. */
async function script(upstream: string, request: Request): Promise<Response> {
  const headers = new Headers();
  for (const name of SCRIPT_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const response = await fetch(upstream, { headers });
  const served = new Response(response.body, response);
  if (response.ok) {
    served.headers.set('content-type', 'text/javascript');
  }
  return served;
}

/**
 * Reverse proxy for the analytics, so a blocker that knows the vendor's host
 * does not drop the page views. `/api/op/op1.js` is the script and
 * `/api/op/op1-replay.js` the session recorder; everything else is the event API.
 */
async function proxy({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/op/u, '');
  if (request.method === 'POST') {
    const agent = request.headers.get('user-agent') ?? '';
    if (agent === '' || BOT_UA.test(agent)) {
      return new Response(null, { status: 200 });
    }
  }
  if (request.method === 'GET' && path === SCRIPT) {
    return script(`${ANALYTICS_HOST}${SCRIPT}`, request);
  }
  if (request.method === 'GET' && path === REPLAY_SCRIPT) {
    return script(REPLAY_URL, request);
  }
  const upstream = new URL(`${ANALYTICS_HOST}/api${path}${url.search}`);
  const headers = new Headers(request.headers);
  headers.set('host', upstream.host);
  // The site's cookies are not the analytics host's business.
  headers.delete('cookie');
  // The visitor's address, or OpenPanel counts every visit as one device.
  const ip = request.headers.get('cf-connecting-ip');
  if (ip !== null) {
    headers.set('openpanel-client-ip', ip);
    headers.set('x-client-ip', ip);
  }
  return fetch(upstream, {
    body:
      request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer(),
    headers,
    method: request.method,
  });
}

export const Route = createFileRoute('/api/op/$')({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
    },
  },
});

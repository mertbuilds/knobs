import { createFileRoute } from '@tanstack/react-router';

/** The self-hosted OpenPanel: its API under `/api`, the script at the root. */
const ANALYTICS_HOST = 'https://analytics.vinena.studio';
const SCRIPT = '/op1.js';
/**
 * Crawlers that run JavaScript reach this proxy too, and their visits inflate
 * every count. Their events are dropped before they reach OpenPanel; 200 so
 * the script does not retry. No user agent counts as a crawler.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|facebookexternalhit|preview|fetch|curl|wget|python|java\b|go-http|okhttp|axios/iu;

/**
 * Reverse proxy for the analytics, so a blocker that knows the vendor's host
 * does not drop the page views. `/api/op/op1.js` is the script; everything else
 * is the event API.
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
  const upstream = new URL(
    path === SCRIPT ? `${ANALYTICS_HOST}${SCRIPT}` : `${ANALYTICS_HOST}/api${path}${url.search}`,
  );
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

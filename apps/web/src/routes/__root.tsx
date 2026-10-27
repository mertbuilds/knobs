import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { clientEnv } from '../lib/env.ts';
import { shareMeta } from '../lib/share.ts';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import '@knobs/ui/theme.css';
import '../app.css';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Dev-only: StyleX HMR runtime injects styles; production CSS is emitted into app.css at build.
  void import('virtual:stylex:runtime');
}

// Dev-only: the fold tuning panel (`src/dev/foldtune.tsx`), for `?tune` on the
// top page, never on the copy in a device's frame. A build drops all of this
// and the file with it. The address is read once, as the page loads: the panel
// stays for the visit whatever the address turns into after.
const FoldTune = import.meta.env.DEV ? lazy(() => import('../dev/foldtune.tsx')) : null;
const tuning =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  window.top === window &&
  new URLSearchParams(window.location.search).has('tune');
const never = () => () => {};

function DevFoldTune() {
  // False on the server and while hydrating, so the panel never meets the server's markup.
  const tune = useSyncExternalStore(
    never,
    () => tuning,
    () => false,
  );
  return FoldTune !== null && tune ? (
    <Suspense>
      <FoldTune />
    </Suspense>
  ) : null;
}

/** The share of sessions recorded for replay. Inputs are masked; `[data-replay-block]` parts are left out. */
const REPLAY_SAMPLE_RATE = 0.02;
/**
 * How often the recorder sends what it has, in milliseconds. It also takes a
 * full page snapshot each time, so a long interval keeps replays small; it
 * still sends on leaving the page.
 */
const REPLAY_FLUSH_INTERVAL_MS = 60_000;
/**
 * Events per replay chunk. Chunks go out without keepalive, so the flush on
 * leaving the page can be lost; small chunks send a visit's start while it lasts.
 */
const REPLAY_MAX_EVENTS_PER_CHUNK = 50;

/**
 * Loads the analytics through the site's own `/api/op` proxy. Page views only,
 * no link or attribute tracking, and nothing at all from an automated browser
 * or from the copy of the page devknobs loads in a device's frame, which would
 * count every device pick as a second page view. A small share of sessions is
 * recorded; the recorder is a second script, `/api/op/op1-replay.js`.
 * Without a client id the script is never injected, so analytics is simply off.
 */
function analyticsScript(clientId: string): string {
  const replay = `sessionReplay:{enabled:true,sampleRate:${REPLAY_SAMPLE_RATE},flushIntervalMs:${REPLAY_FLUSH_INTERVAL_MS},maxEventsPerChunk:${REPLAY_MAX_EVENTS_PER_CHUNK},maskAllInputs:true,maskAllText:false,blockSelector:'[data-replay-block]',scriptUrl:'/api/op/op1-replay.js'}`;
  return (
    "if(location.hostname==='knobs.dev'&&!navigator.webdriver&&window.top===window){window.op=window.op||function(){(window.op.q=window.op.q||[]).push(arguments)};" +
    `window.op('init',{clientId:'${clientId}',apiUrl:'/api/op',trackScreenViews:true,trackOutgoingLinks:false,trackAttributes:false,${replay}});` +
    "var s=document.createElement('script');s.src='/api/op/op1.js';s.async=true;document.head.appendChild(s)}"
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    links: [
      // The logo is the same on a light and a dark tab; the PNGs are for
      // browsers that take no SVG icon.
      { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
      { href: '/favicon-32.png', rel: 'icon', sizes: '32x32', type: 'image/png' },
      { href: '/favicon-16.png', rel: 'icon', sizes: '16x16', type: 'image/png' },
      { href: '/apple-touch-icon.png', rel: 'apple-touch-icon', sizes: '180x180' },
      // Dev-only: link the unplugin's compiled CSS so SSR HTML is styled on first
      // paint (the virtual:stylex:runtime import only injects after hydration;
      // without this link every refresh flashes unstyled). Production CSS is
      // emitted into app.css at build, so the link is dev-only.
      // `precedence` is required: React 19 hoists SSR stylesheets with
      // data-precedence, and a client link without the prop hydration-mismatches
      // (which silently breaks event wiring on the whole tree).
      ...(import.meta.env.DEV
        ? [{ href: '/virtual:stylex.css', precedence: 'default', rel: 'stylesheet' }]
        : []),
    ],
    meta: [
      // oxlint-disable-next-line text-encoding-identifier-case -- HTML meta charset must be "utf-8"
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { content: m.hero_line(), name: 'description' },
      { title: m.app_name() },
      ...shareMeta({ description: m.hero_line(), title: m.app_name() }),
    ],
  }),
});

function RootComponent() {
  // Marks hydration completion; anything driving the page from React handlers
  // is dead until this flips, so browser checks wait for html[data-hydrated].
  useEffect(() => {
    document.documentElement.dataset['hydrated'] = 'true';
  }, []);
  return (
    <RootDocument>
      <Outlet />
      {import.meta.env.DEV && <DevFoldTune />}
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const clientId = clientEnv.VITE_OPENPANEL_CLIENT_ID;
  return (
    <html lang={getLocale()}>
      <head>
        {/* The slot src/server.ts fills with devknobs' early script, first in head.
            dangerouslySetInnerHTML tells React the script's content is set text, so
            hydration does not fail on the text the server put there.
            suppressHydrationWarning silences the dev warning that the text differs. */}
        <script
          dangerouslySetInnerHTML={{ __html: '' }}
          data-devknobs-early=""
          suppressHydrationWarning
        />
        <HeadContent />
        {clientId === undefined ? null : (
          <script dangerouslySetInnerHTML={{ __html: analyticsScript(clientId) }} />
        )}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

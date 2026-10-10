import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { clientEnv } from '../lib/env.ts';
import { m } from '../paraglide/messages.js';
import { getLocale } from '../paraglide/runtime.js';
import '@knobs/ui/theme.css';
import '../app.css';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Dev-only: StyleX HMR runtime injects styles; production CSS is emitted into app.css at build.
  void import('virtual:stylex:runtime');
}

/**
 * Loads the analytics through the site's own `/api/op` proxy. Page views only,
 * no link or attribute tracking, and nothing at all from an automated browser
 * or from the copy of the page devknobs loads in a device's frame, which would
 * count every device pick as a second page view.
 * Without a client id the script is never injected, so analytics is simply off.
 */
function analyticsScript(clientId: string): string {
  return (
    'if(!navigator.webdriver&&window.top===window){window.op=window.op||function(){(window.op.q=window.op.q||[]).push(arguments)};' +
    `window.op('init',{clientId:'${clientId}',apiUrl:'/api/op',trackScreenViews:true,trackOutgoingLinks:false,trackAttributes:false});` +
    "var s=document.createElement('script');s.src='/api/op/op1.js';s.async=true;document.head.appendChild(s)}"
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    links: [
      // The mark carries its own dark variant, so one file covers both schemes.
      { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
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
      { content: m.tagline(), name: 'description' },
      { title: m.app_name() },
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

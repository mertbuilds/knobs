import { colors, font, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { Chip } from '../lib/chip.tsx';
import { m } from '../paraglide/messages.js';
import { FAKE_SECRET } from './fake.ts';

const API = '/api/demo';
// A reserved top-level domain: no name under it ever resolves, so the request
// fails in the network, with no answer at all.
const NOWHERE = 'https://demo.invalid/';
// A site that sends no CORS headers.
const ELSEWHERE = 'https://example.com/';
const BURST = 20;

const JSON_HEADERS = { 'content-type': 'application/json' };

const styles = create({
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  groupLabel: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
  },
  // Out of sight, still in place: the chip keeps its label's width.
  hidden: {
    visibility: 'hidden',
  },
  line: {
    color: colors.muted,
    fontSize: 13,
    margin: 0,
  },
  requests: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s3,
  },
  // The label and the outcome in one cell, so one takes the other's place.
  stack: {
    display: 'inline-grid',
    justifyItems: 'center',
  },
  stacked: {
    gridArea: '1 / 1',
  },
});

/** What a request came to, as the pressed chip shows it for a moment. */
type Send = () => Promise<string>;

let loads = 0;

/** A demo asset's address, new on every press, so the browser asks for it again. */
function fresh(asset: string): string {
  loads += 1;
  return `${API}/${asset}?t=${Date.now().toString(36)}-${loads}`;
}

/** Sends a fetch, reads the whole answer, and gives its status. */
async function send(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  await response.arrayBuffer();
  return response.type === 'opaque' ? m.requests_opaque() : String(response.status);
}

function withBody(method: string): Send {
  return () =>
    send(`${API}/echo`, {
      body: JSON.stringify({ knob: 'device', value: 'iPhone 18 Pro' }),
      headers: JSON_HEADERS,
      method,
    });
}

function postForm(): Promise<string> {
  const body = new FormData();
  body.set('knob', 'language');
  body.set('value', 'ar');
  return send(`${API}/echo`, { body, method: 'POST' });
}

async function abort(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    return await send(`${API}/slow`, { signal: controller.signal });
  } catch {
    return controller.signal.aborted ? m.requests_aborted() : m.requests_failed();
  } finally {
    clearTimeout(timer);
  }
}

/** Reads on until `mark` shows in the text, or the stream ends. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  mark: string,
  text: string,
): Promise<void> {
  const { done, value } = await reader.read();
  if (done) {
    return;
  }
  const next = text + decoder.decode(value, { stream: true });
  if (!next.includes(mark)) {
    await readUntil(reader, decoder, mark, next);
  }
}

/** A server-sent event stream read with fetch, and closed after its last event. */
async function eventStream(): Promise<string> {
  const response = await fetch(`${API}/events`, { headers: { accept: 'text/event-stream' } });
  const reader = response.body?.getReader();
  if (reader !== undefined) {
    await readUntil(reader, new TextDecoder(), 'event: done', '');
    await reader.cancel();
  }
  return String(response.status);
}

function withSecrets(): Promise<string> {
  return send(`${API}/echo?access_token=${FAKE_SECRET}&page=2`, {
    headers: { authorization: `Bearer ${FAKE_SECRET}`, 'x-api-key': FAKE_SECRET },
  });
}

async function burst(): Promise<string> {
  const outcomes = await Promise.allSettled(
    Array.from({ length: BURST }, (_, index) => fetch(`${API}/json?n=${index + 1}`)),
  );
  const answered = outcomes.filter(
    (outcome) => outcome.status === 'fulfilled' && outcome.value.ok,
  ).length;
  return `${answered}/${BURST}`;
}

function xhr(method: string, url: string, body?: string, timeout = 0): Promise<string> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.timeout = timeout;
    request.addEventListener('load', () => resolve(String(request.status)));
    request.addEventListener('error', () => resolve(m.requests_failed()));
    request.addEventListener('timeout', () => resolve(m.requests_timeout()));
    if (body !== undefined) {
      request.setRequestHeader('content-type', 'application/json');
    }
    request.send(body ?? null);
  });
}

/** Settles when the element has loaded or failed, and takes it off the page. */
function settled(element: HTMLElement): Promise<string> {
  return new Promise((resolve) => {
    const end = (outcome: string) => {
      element.remove();
      resolve(outcome);
    };
    element.addEventListener('load', () => end(m.requests_loaded()), { once: true });
    element.addEventListener('error', () => end(m.requests_failed()), { once: true });
  });
}

function image(): Promise<string> {
  const element = new Image();
  const done = settled(element);
  element.src = fresh('asset.png');
  return done;
}

function stylesheet(): Promise<string> {
  const element = document.createElement('link');
  element.rel = 'stylesheet';
  element.href = fresh('asset.css');
  const done = settled(element);
  document.head.append(element);
  return done;
}

function script(): Promise<string> {
  const element = document.createElement('script');
  element.src = fresh('asset.js');
  const done = settled(element);
  document.head.append(element);
  return done;
}

// Loaded and let go: the face is never added to the document's fonts.
async function fontFace(): Promise<string> {
  await new FontFace('knobs demo', `url(${fresh('asset.woff2')})`).load();
  return m.requests_loaded();
}

/** One request per press. The chip's text is the outcome for a moment, then its label again. */
function RequestChip({ label, send: sendRequest }: { label: string; send: Send }) {
  const [outcome, setOutcome] = useState<string | null>(null);
  useEffect(() => {
    if (outcome === null) {
      return;
    }
    const timer = setTimeout(() => setOutcome(null), 1500);
    return () => clearTimeout(timer);
  }, [outcome]);
  const press = () => {
    // Inside a promise, so a request that throws before it starts fails the same way.
    Promise.resolve()
      .then(sendRequest)
      .then(setOutcome, () => setOutcome(m.requests_failed()));
  };
  return (
    <Chip onClick={press}>
      <span {...props(styles.stack)}>
        <span {...props(styles.stacked, outcome !== null && styles.hidden)}>{label}</span>
        {outcome !== null && <span {...props(styles.stacked)}>{outcome}</span>}
      </span>
    </Chip>
  );
}

/**
 * A button for every kind of request a page makes, so the devknobs requests
 * view has each one to show. Nothing is drawn here but the outcome on the
 * pressed chip: the place to look is the panel.
 */
export function Requests() {
  const groups: Array<{ chips: Array<[string, Send]>; label: string }> = [
    {
      chips: [
        [m.requests_fetch_json(), () => send(`${API}/json`)],
        [m.requests_post_json(), withBody('POST')],
        [m.requests_post_form(), postForm],
        [m.requests_put(), withBody('PUT')],
        [m.requests_patch(), withBody('PATCH')],
        [m.requests_delete(), () => send(`${API}/echo`, { method: 'DELETE' })],
        [m.requests_404(), () => send(`${API}/status/404`)],
        [m.requests_500(), () => send(`${API}/status/500`)],
        [m.requests_redirect(), () => send(`${API}/redirect`)],
        [m.requests_slow(), () => send(`${API}/slow`)],
        [m.requests_abort(), abort],
        // The timeout is a guard: a resolver that answers for every name must not leave it hanging.
        [m.requests_network_error(), () => send(NOWHERE, { signal: AbortSignal.timeout(5000) })],
        [m.requests_cors_blocked(), () => send(ELSEWHERE, { mode: 'cors' })],
        [m.requests_no_cors(), () => send(ELSEWHERE, { mode: 'no-cors' })],
        [m.requests_big_body(), () => send(`${API}/big`)],
        [m.requests_text(), () => send(`${API}/text`)],
        [m.requests_html(), () => send(`${API}/html`)],
        [m.requests_binary(), () => send(`${API}/bin`)],
        [m.requests_stream(), () => send(`${API}/stream`)],
        [m.requests_event_stream(), eventStream],
        [m.requests_headers(), withSecrets],
        [m.requests_burst(), burst],
      ],
      label: m.requests_group_fetch(),
    },
    {
      chips: [
        [m.requests_xhr_get(), () => xhr('GET', `${API}/json`)],
        [m.requests_xhr_post(), () => xhr('POST', `${API}/echo`, JSON.stringify({ knob: 'time' }))],
        [m.requests_xhr_error(), () => xhr('GET', NOWHERE)],
        [m.requests_xhr_timeout(), () => xhr('GET', `${API}/slow`, undefined, 500)],
      ],
      label: m.requests_group_xhr(),
    },
    {
      chips: [
        [m.requests_image(), image],
        [m.requests_stylesheet(), stylesheet],
        [m.requests_script(), script],
        [m.requests_font(), fontFace],
      ],
      label: m.requests_group_loads(),
    },
  ];
  return (
    <div {...props(styles.requests)}>
      <p {...props(styles.line)}>{m.requests_line()}</p>
      {groups.map((group) => (
        <div {...props(styles.group)} key={group.label}>
          <span {...props(styles.groupLabel)}>{group.label}</span>
          <div {...props(styles.chips)}>
            {group.chips.map(([label, sendRequest]) => (
              <RequestChip key={label} label={label} send={sendRequest} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

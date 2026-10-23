import { describe, expect, test } from 'bun:test';
import { describeLoad, frameAncestors, FrameLoads } from '../src/refusal.ts';

const MAIN = 'MAIN';
const FRAME = 'FRAME';

function loads() {
  const record = new FrameLoads();
  record.mainFrame = MAIN;
  return record;
}

const requested = (requestId: string, url: string, extra: Record<string, unknown> = {}) => ({
  frameId: FRAME,
  request: { url },
  requestId,
  type: 'Document',
  wallTime: 1,
  ...extra,
});

const answered = (requestId: string, url: string, headers: Record<string, string>, extra = {}) => ({
  requestId,
  response: { headers, status: 200, url, ...extra },
  type: 'Document',
});

const blocked = (requestId: string) => ({
  blockedReason: 'other',
  canceled: false,
  errorText: 'net::ERR_BLOCKED_BY_RESPONSE',
  requestId,
  type: 'Document',
});

describe('frameAncestors', () => {
  test('takes the frame-ancestors part of a policy', () => {
    expect(frameAncestors("default-src 'self'; frame-ancestors 'self' https://x.com")).toBe(
      "frame-ancestors 'self' https://x.com",
    );
    expect(frameAncestors("default-src 'self'")).toBeNull();
  });
});

describe('FrameLoads', () => {
  test('keeps a frame refused by X-Frame-Options, with the headers as sent', () => {
    const record = loads();
    record.event('Network.requestWillBeSentExtraInfo', {
      headers: { 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Site': 'same-origin' },
      requestId: 'a',
    });
    record.event('Network.requestWillBeSent', requested('a', 'https://x.com/home'));
    record.event(
      'Network.responseReceived',
      answered('a', 'https://x.com/home', {
        'content-security-policy': "default-src 'self'",
        'Content-Type': 'text/html',
        'X-Frame-Options': 'DENY',
      }),
    );
    record.event('Network.loadingFailed', blocked('a'));
    record.event('Log.entryAdded', {
      entry: {
        text: "Refused to display 'https://x.com/' in a frame because it set 'X-Frame-Options' to 'deny'.",
      },
    });
    record.event('Log.entryAdded', { entry: { text: 'something else' } });
    const load = record.pick('https://x.com/home#top');
    expect(load).toMatchObject({
      failed: { blockedReason: 'other', errorText: 'net::ERR_BLOCKED_BY_RESPONSE' },
      finalUrl: 'chrome-error://chromewebdata/',
      response: { headers: { 'x-frame-options': 'DENY' }, status: 200 },
      sent: { secFetchDest: 'iframe', secFetchSite: 'same-origin' },
    });
    expect(load?.console).toHaveLength(1);
    expect(describeLoad(load!)).toBe('x.com/home answered 200 with X-Frame-Options: DENY');
  });

  test('names frame-ancestors over X-Frame-Options, as Chrome does, and keeps its issue', () => {
    const record = loads();
    record.event('Network.requestWillBeSent', requested('a', 'https://accounts.x.com/'));
    record.event(
      'Network.responseReceived',
      answered('a', 'https://accounts.x.com/', {
        'content-security-policy': "frame-ancestors 'none'",
        'x-frame-options': 'DENY',
      }),
    );
    record.event('Network.loadingFailed', blocked('a'));
    record.event('Audits.issueAdded', {
      issue: {
        code: 'ContentSecurityPolicyIssue',
        details: { contentSecurityPolicyIssueDetails: { violatedDirective: 'frame-ancestors' } },
      },
    });
    const load = record.pick('https://accounts.x.com/')!;
    expect(load.issues).toHaveLength(1);
    expect(describeLoad(load)).toBe("blocked by Chrome: frame-ancestors 'none' on accounts.x.com");
  });

  test('follows a redirect to another site', () => {
    const record = loads();
    record.event('Network.requestWillBeSent', requested('a', 'https://x.com/home'));
    record.event(
      'Network.requestWillBeSent',
      requested('a', 'https://accounts.google.com/signin', {
        redirectResponse: {
          headers: { Location: 'https://accounts.google.com/signin' },
          status: 302,
          url: 'https://x.com/home',
        },
      }),
    );
    record.event(
      'Network.responseReceived',
      answered('a', 'https://accounts.google.com/signin', {}),
    );
    const load = record.pick('https://x.com/home')!;
    expect(load.redirects).toEqual([
      {
        fromServiceWorker: false,
        location: 'https://accounts.google.com/signin',
        status: 302,
        url: 'https://x.com/home',
      },
    ]);
    expect(load.finalUrl).toBe('https://accounts.google.com/signin');
    expect(describeLoad(load)).toBe('redirected to another site: accounts.google.com');
  });

  test('says an answer came from a service worker', () => {
    const record = loads();
    record.event('Network.requestWillBeSent', requested('a', 'https://x.com/i/flow/login'));
    record.event(
      'Network.responseReceived',
      answered(
        'a',
        'https://x.com/i/flow/login',
        { 'x-frame-options': 'DENY' },
        { fromServiceWorker: true, serviceWorkerResponseSource: 'cache-storage' },
      ),
    );
    record.event('Network.loadingFailed', blocked('a'));
    const load = record.pick('https://x.com/i/flow/login')!;
    expect(load.response).toMatchObject({
      fromServiceWorker: true,
      serviceWorkerResponseSource: 'cache-storage',
    });
    expect(describeLoad(load)).toBe(
      'x.com/i/flow/login answered 200 with X-Frame-Options: DENY (from a service worker)',
    );
  });

  test('keeps no load of the top frame, nor of what is not a document', () => {
    const record = loads();
    record.event('Network.requestWillBeSent', {
      ...requested('a', 'https://x.com/'),
      frameId: MAIN,
    });
    record.event('Network.requestWillBeSent', {
      ...requested('b', 'https://x.com/a.png'),
      type: 'Image',
    });
    expect(record.pick('https://x.com/')).toBeNull();
  });

  test("answers with the asked frame's newest load", () => {
    const record = loads();
    record.event('Network.requestWillBeSent', requested('a', 'https://x.com/home'));
    record.event('Network.requestWillBeSent', {
      ...requested('b', 'https://ads.example/'),
      frameId: 'AD',
    });
    record.event('Network.requestWillBeSent', requested('c', 'https://x.com/next'));
    expect(record.pick('https://x.com/home')?.requestId).toBe('c');
    expect(record.pick('https://elsewhere/')?.requestId).toBe('c');
  });
});

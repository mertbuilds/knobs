// The extension's own world in the top frame: carries knobs between the page's
// devknobs and the service worker, which only this world can reach.
import {
  type Answer,
  LOAD_FRAME,
  type PageMessage,
  PREFER_KEY,
  type Question,
  readPageMessage,
  readPrefer,
  type Request,
  type Response,
  type TabMessage,
  TO_BRIDGE,
  TO_PAGE,
} from './messages.ts';

const toPage = (message: PageMessage) =>
  document.dispatchEvent(new CustomEvent(TO_PAGE, { detail: JSON.stringify(message) }));

const ask = (request: Request) => chrome.runtime.sendMessage<Request, Response>(request);

const base = chrome.runtime.getURL('content.js');

document.addEventListener(TO_BRIDGE, (event) => {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return;
  }
  // Any script of the page can send this event: only what devknobs sends goes on.
  const request = readPageMessage(parsed);
  if (!request) {
    return;
  }
  if (request.type !== 'set' && request.type !== 'native') {
    void chrome.runtime.sendMessage<Question, Answer>(request).then(
      (answer) => toPage({ ...answer, id: request.id, type: 'answer' }),
      (error: unknown) => toPage({ error: String(error), id: request.id, type: 'answer' }),
    );
    return;
  }
  void ask(request).then(({ error, native = true, state }) => {
    // The tab could not take them, so the panel goes back to what it has. Unless the
    // switch went off meanwhile: the knobs are the page's own then.
    if (error && request.type === 'set' && native) {
      toPage({ base, native, state, type: 'state' });
    }
  });
});

// devknobs names the frame it loads the page in so (`FRAME_NAME` in its engine/frame.ts).
const FRAME_NAME = 'devknobs-frame';

// devknobs' frame loads the page from here: an address set from the extension's world is not
// held to the page's own frame-src policy, which can leave the page itself out. Any script of
// the page can send this event too, so it loads only a frame named as devknobs' frame is, and
// only an address on the page's own origin, which the page could load itself.
document.addEventListener(
  LOAD_FRAME,
  (event) => {
    const frame = event.composedPath()[0] as Partial<HTMLIFrameElement> | undefined;
    const url = (event as CustomEvent<unknown>).detail;
    if (
      frame?.nodeName !== 'IFRAME' ||
      frame.name !== FRAME_NAME ||
      typeof url !== 'string' ||
      URL.parse(url)?.origin !== location.origin
    ) {
      return;
    }
    event.preventDefault();
    frame.src = url;
  },
  true,
);

// Chrome holds every later load of the frame to the page's frame-src too: a link clicked in it,
// or devknobs reloading it. Such a load of the page's own origin, refused by the page's policy,
// is loaded again from here, in devknobs' frame alone. The event is the page's to forge as well,
// so the same checks hold: devknobs' frame, an address on the page's origin.
const FRAME_DIRECTIVES = new Set(['frame-src', 'child-src', 'default-src']);
// The last address loaded so, since when, and how often: one refused even so is not loaded
// again forever, only up to `RELOAD_MAX` times in `RELOAD_MS`.
let reloaded = { at: 0, times: 0, url: '' };
const RELOAD_MAX = 3;
const RELOAD_MS = 2000;

document.addEventListener(
  'securitypolicyviolation',
  ({ blockedURI, effectiveDirective }) => {
    const frame = document
      .querySelector('[data-devknobs="viewport"]')
      ?.shadowRoot?.querySelector<HTMLIFrameElement>(`iframe[name="${FRAME_NAME}"]`);
    if (
      !frame ||
      !FRAME_DIRECTIVES.has(effectiveDirective) ||
      URL.parse(blockedURI)?.origin !== location.origin
    ) {
      return;
    }
    const now = performance.now();
    if (reloaded.url !== blockedURI || now - reloaded.at > RELOAD_MS) {
      reloaded = { at: now, times: 0, url: blockedURI };
    }
    reloaded.times += 1;
    if (reloaded.times > RELOAD_MAX) {
      return;
    }
    frame.src = blockedURI;
  },
  true,
);

chrome.runtime.onMessage.addListener((message: TabMessage) => {
  toPage(message);
});

// A content script is a classic script, with no top-level await.
chrome.runtime.sendMessage<Request, Response>(
  { type: 'get' },
  ({ carry, native = true, state, system }) =>
    toPage({ base, carry, native, state, system, type: 'state' }),
);

// Who runs the panel, straight from storage, which answers sooner than the service
// worker can wake: the extension's copy holds the page until it comes, and steps
// aside for the page's own whenever it says so. Then each change, made in any tab.
chrome.storage.local.get(PREFER_KEY, (stored) =>
  toPage({ prefer: readPrefer(stored[PREFER_KEY]), type: 'prefer' }),
);
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[PREFER_KEY];
  if (area === 'local' && change) {
    toPage({ prefer: readPrefer(change.newValue), type: 'prefer' });
  }
});

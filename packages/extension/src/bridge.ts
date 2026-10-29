// The extension's own world in the top frame: carries knobs between the page's
// devknobs and the service worker, which only this world can reach.
import {
  type Answer,
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

chrome.runtime.onMessage.addListener((message: TabMessage) => {
  toPage(message);
});

// A content script is a classic script, with no top-level await.
chrome.runtime.sendMessage<Request, Response>({ type: 'get' }, ({ native = true, state, system }) =>
  toPage({ base, native, state, system, type: 'state' }),
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

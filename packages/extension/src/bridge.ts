// The extension's own world in the top frame: carries knobs between the page's
// devknobs and the service worker, which only this world can reach.
import {
  type Answer,
  type PageMessage,
  type Question,
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
  const request = JSON.parse(detail) as Request | Question;
  if (request.type === 'get') {
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

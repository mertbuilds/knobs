// The page world: the devknobs panel itself, with text size, offline, the
// prefers knobs, a plain viewport and the user agent handed to the service worker, which sets them for real.
import {
  type DevknobsStatePatch,
  type FrameRefusal,
  getState,
  mount,
  type NativeDriver,
  setNative,
  setState,
  setSystemMedia,
} from 'devknobs';
import { DEFAULT_STATE, type KnobState, patchOf, sameState } from './knobs.ts';
import {
  type Answer,
  type Ask,
  type NativeReason,
  type PageMessage,
  type Question,
  type Request,
  TO_BRIDGE,
  TO_PAGE,
} from './messages.ts';
import { describeLoad } from './refusal.ts';

// What the panel's switch says when it went off by itself.
const NOTES: Record<NativeReason, string> = {
  'bar-closed': "switched to in-page: Chrome's debugger bar was closed",
};

// devknobs names the frame it loads the page in so (`FRAME_NAME` in its engine/frame.ts).
const FRAME_NAME = 'devknobs-frame';

const top = window === window.top;
let knobs: KnobState = { ...DEFAULT_STATE };
// Until the tab says what it has, its knobs win over the page's stored ones.
let synced = false;
let queued = false;

const toBridge = (request: Request | Question) =>
  document.dispatchEvent(new CustomEvent(TO_BRIDGE, { detail: JSON.stringify(request) }));

function send() {
  if (!top || !synced || queued) {
    return;
  }
  queued = true;
  queueMicrotask(() => {
    queued = false;
    toBridge({ state: knobs, type: 'set' });
  });
}

let asked = 0;
const answers = new Map<number, (answer: Answer) => void>();

function ask(question: Ask): Promise<Answer> {
  const id = ++asked;
  return new Promise((resolve) => {
    answers.set(id, resolve);
    toBridge({ ...question, id });
  });
}

// The frame now up: the service worker's word that its framing rule for service workers is set,
// whether it was loaded again for that, and whether its loads skip service workers.
let ruled: Promise<Answer> = Promise.resolve({});
let reloaded = false;
let bypassed = false;

function framed(open: boolean) {
  if (!top) {
    return;
  }
  reloaded = false;
  bypassed = false;
  ruled = ask({ open, type: 'frame' });
}

/** Load the frame again with the tab's loads skipping service workers, which takes the debugger. */
function bypass(): NonNullable<FrameRefusal['retry']> {
  return {
    label: "load without the service worker (shows Chrome's bar)",
    run: async () => {
      const { error } = await ask({ type: 'bypass' });
      if (error !== undefined) {
        throw new Error(error);
      }
      bypassed = true;
    },
  };
}

/** The scope of this origin's service worker for `url`: Chrome's debugger does not tell it. */
async function scopeOf(url: string): Promise<string | null> {
  try {
    return (await navigator.serviceWorker?.getRegistration(url))?.scope ?? null;
  } catch {
    // Another origin's, which this page cannot see.
    return null;
  }
}

/** What the tab's debugger saw of the frame's load, in a line, with the whole record to copy. */
async function refused(url: string): Promise<FrameRefusal | null> {
  if (!top) {
    return null;
  }
  const worker = (await scopeOf(url)) !== null;
  // The service worker's fetch may have beaten the rule that lets it through: once, load again.
  if (worker && !reloaded) {
    reloaded = true;
    return {
      retry: { label: 'load again', now: true, run: async () => void (await ruled) },
      why: 'loading the page again',
    };
  }
  const answer = await ask({ type: 'why', url });
  if (answer.native === false) {
    return {
      why: 'turn on real browser settings to see why',
      ...(worker && !bypassed ? { retry: bypass() } : {}),
    };
  }
  if (answer.error !== undefined) {
    return { why: answer.error };
  }
  if (!answer.record) {
    return {
      retry:
        worker && !bypassed
          ? bypass()
          : {
              label: 'find out why',
              run: async () => {
                const { error } = await ask({ type: 'watch' });
                if (error !== undefined) {
                  throw new Error(error);
                }
              },
            },
      why: "Chrome's debugger was not watching as it loaded",
    };
  }
  const { record } = answer;
  if (record.response?.fromServiceWorker) {
    record.response.serviceWorkerScope = await scopeOf(record.response.url);
  }
  return {
    details: JSON.stringify(record, null, 2),
    why: describeLoad(record),
    ...(record.response?.fromServiceWorker && !bypassed ? { retry: bypass() } : {}),
  };
}

const driver: NativeDriver = {
  framed,
  media: (media) => {
    knobs = { ...knobs, ...media };
    send();
  },
  offline: (offline) => {
    knobs = { ...knobs, offline };
    send();
  },
  refused,
  setting: {
    change: (on) => toBridge({ on, type: 'native' }),
    hint: "uses Chrome's debugger; shows a bar",
    label: 'real browser settings',
  },
  text: (textSize) => {
    knobs = { ...knobs, textSize };
    send();
  },
  ua: async (ua) => {
    if (top) {
      await ask({ type: 'ua', ua });
    }
  },
  viewport: (viewport) => {
    knobs = { ...knobs, viewport };
    send();
  },
};

function onMessage(event: Event) {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') {
    return;
  }
  const message = JSON.parse(detail) as PageMessage;
  if (message.type === 'answer') {
    answers.get(message.id)?.(message);
    answers.delete(message.id);
  } else if (message.type === 'toggle') {
    setState({ panel: { open: !getState().panel.open } });
  } else if (message.type === 'detached') {
    // The tab's own size is back too, so a size the tab had goes with it.
    const sized: DevknobsStatePatch = knobs.viewport
      ? { device: 'none', dpr: 'system', height: 'full', width: 'full' }
      : {};
    setState({ ...patchOf(DEFAULT_STATE), ...sized });
  } else if (message.type === 'native') {
    setNative(message.on, message.reason ? NOTES[message.reason] : undefined);
  } else if (message.type === 'system') {
    setSystemMedia(message.media);
  } else if (message.type === 'state') {
    if (message.system) {
      setSystemMedia(message.system);
    }
    // Where devknobs finds its device images: the build reads `import.meta.url` from here.
    Object.defineProperty(globalThis, 'devknobsExtensionBase', {
      configurable: true,
      value: message.base,
    });
    // Off, the tab has no knobs of its own, so the defaults the driver is handed stay here.
    setNative(message.native);
    const first = !synced;
    synced = true;
    if (!sameState(message.state, knobs)) {
      setState(patchOf(message.state));
    }
    // The viewport is the page's, so a tab that has another one hears the page's
    // as it loads. Not after a refusal, which would only be refused again.
    if (first && !sameState(message.state, knobs)) {
      send();
    }
  }
}

if (top || window.name === FRAME_NAME) {
  if (top) {
    document.addEventListener(TO_PAGE, onMessage);
  }
  // The toolbar button opens and closes the panel, so no handle waits on the page's edge.
  // The user's own choice in the panel's settings still wins.
  mount({ handle: false, native: driver });
}

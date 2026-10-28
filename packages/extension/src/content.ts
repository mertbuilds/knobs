// The page world: the devknobs panel itself, with text size, offline, the
// prefers knobs, a plain viewport and the user agent handed to the service worker, which sets them for real.
import {
  type DevknobsStatePatch,
  type FrameRefusal,
  getState,
  mount,
  type NativeDriver,
  type PreferSetting,
  setNative,
  setPrefer,
  setState,
  setSystemMedia,
} from '@vinena/knobs';
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

// On the top window once the extension's copy let the page's own have the page, so
// devknobs' frame, which loads the page again, leaves it to the page's copy there too.
const YIELDED = Symbol.for('devknobs-extension.yielded');

const top = window === window.top;
// The extension's copy stepped aside for the page's own, which runs the panel now.
let yielded = false;

// In the tab's sessionStorage once the extension's copy stepped aside on this page, read and
// cleared as the next load starts: that load's copy keeps no knobs of its own, so it neither
// reads nor writes the stored ones the page's copy shares, and hands none to Chrome before
// it steps aside again. A load the page's copy does not take goes back to keeping them.
const YIELDED_KEY = 'devknobs-extension.yielded';

function lastYielded(): boolean {
  try {
    const was = sessionStorage.getItem(YIELDED_KEY) === '1';
    sessionStorage.removeItem(YIELDED_KEY);
    return was;
  } catch {
    // Storage the page cannot use: the knobs are kept as on any page.
    return false;
  }
}

function markYielded(on: boolean) {
  try {
    if (on) {
      sessionStorage.setItem(YIELDED_KEY, '1');
    } else {
      sessionStorage.removeItem(YIELDED_KEY);
    }
  } catch {
    // As above.
  }
}
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

// The frame now up: the service worker's word that its framing rules are set,
// whether it was loaded again for that, and whether its loads skip service workers.
let ruled: Promise<Answer> = Promise.resolve({});
let reloaded = false;
let bypassed = false;

/** The frame opened or went. Its first load waits for the rules that let it in. */
async function framed(open: boolean): Promise<void> {
  if (!top) {
    return;
  }
  reloaded = false;
  bypassed = false;
  ruled = ask({ open, type: 'frame' });
  await ruled;
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

/**
 * Who runs the panel on a page with its own devknobs, shown in the panel's settings.
 * The choice is kept for every site; going back to the extension's copy from the
 * page's panel loads the page again, so the extension's holds it from the start.
 */
const prefer: PreferSetting = {
  change: (value) => {
    void ask({ prefer: value, type: 'prefer' }).then(({ error }) => {
      if (yielded && value === 'extension' && error === undefined) {
        markYielded(false);
        location.reload();
      }
    });
  },
  now: () => prefer.value,
  value: 'extension',
  yielded: () => {
    yielded = true;
    Reflect.set(window, YIELDED, true);
    markYielded(true);
  },
};

/** Mount the extension's copy as the page's host, its options as for the first mount. */
function mountHost(persist: boolean) {
  // The toolbar button opens and closes the panel, so no handle waits on the page's edge.
  // The user's own choice in the panel's settings still wins. As the host, a copy of
  // devknobs the page mounts itself hands its keys and grab here and takes no panel,
  // unless the user prefers the page's copy, which then takes the page from this one.
  mount({ handle: false, host: true, native: driver, persist, ...(top ? { prefer } : {}) });
}

/**
 * Once the page's copy runs the panel: the toolbar button opens it, and the tab keeps no
 * knobs of the extension's. A page that unmounted its copy since gets the extension's
 * panel back on the button, open.
 */
function afterYield(message: PageMessage) {
  if (message.type === 'toggle') {
    const api = window.devknobs;
    if (api) {
      api.setState({ panel: { open: !api.getState().panel.open } });
      return;
    }
    yielded = false;
    Reflect.deleteProperty(window, YIELDED);
    markYielded(false);
    mountHost(true);
    setState({ panel: { open: true } });
  } else if (message.type === 'prefer') {
    // Picked in another tab: the next load keeps knobs again only with the extension's.
    prefer.value = message.prefer;
    markYielded(message.prefer === 'page');
    // The page's panel reads it through `now`; an empty patch draws it again.
    window.devknobs?.setState({});
  } else if (message.type === 'state' && !sameState(message.state, DEFAULT_STATE)) {
    toBridge({ state: DEFAULT_STATE, type: 'set' });
  }
}

function onMessage(event: Event) {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'string') {
    return;
  }
  const message = JSON.parse(detail) as PageMessage;
  if (message.type === 'answer') {
    answers.get(message.id)?.(message);
    answers.delete(message.id);
  } else if (yielded) {
    afterYield(message);
  } else if (message.type === 'prefer') {
    // Kept here too, for a mount again once the page's copy has gone.
    prefer.value = message.prefer;
    setPrefer(message.prefer);
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

/** Did the extension's copy on the page above let the page's own have it? */
function yieldedAbove(): boolean {
  try {
    return Reflect.get(window.parent, YIELDED) === true;
  } catch {
    return false;
  }
}

if (top || (window.name === FRAME_NAME && !yieldedAbove())) {
  if (top) {
    document.addEventListener(TO_PAGE, onMessage);
  }
  mountHost(!(top && lastYielded()));
}

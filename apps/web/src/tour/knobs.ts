import { held } from '../lib/live.ts';

type Knobs = typeof import('devknobs');

/** What the device's frame shows in place of the window's own page. */
export type Outside = {
  readonly loaded: boolean;
  /** The outside page's address, or null while the frame shows the window's own page. */
  readonly outside: string | null;
  readonly refused: boolean;
};

/**
 * devknobs' `frame`: an outside page in the device's frame. The pinned npm
 * package has none yet and a local checkout may, so it is typed here and
 * looked for when the panel mounts.
 */
export type OutsideFrame = {
  readonly get: () => Outside;
  readonly own: () => void;
  readonly refuse: () => void;
  readonly show: (url: string, options?: { refused?: boolean }) => boolean;
  readonly subscribe: (listener: (state: Outside) => void) => () => void;
};

declare global {
  interface Window {
    /** The top page's `frame`, which the copy of the page in a device's frame asks through. */
    knobsOutside?: OutsideFrame;
  }
}

const OWN: Outside = { loaded: false, outside: null, refused: false };

/** The `frame` to ask, or null where this devknobs has none, on the server and before the panel mounts. */
export const outsideFrame = held<OutsideFrame | null>(null);

/** What the frame shows now, kept in step with devknobs on the top page. */
export const shown = held<Outside>(OWN);

function isFrame(value: unknown): value is OutsideFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    typeof value.get === 'function' &&
    'own' in value &&
    typeof value.own === 'function' &&
    'refuse' in value &&
    typeof value.refuse === 'function' &&
    'show' in value &&
    typeof value.show === 'function' &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  );
}

/** The frame of the page above, for the copy of the page in a device's frame. */
function frameAbove(): OutsideFrame | null {
  try {
    const above: unknown = window.parent.knobsOutside;
    return isFrame(above) ? above : null;
  } catch {
    // A parent on another origin, such as an embed, answers with an error.
    return null;
  }
}

let stopWatching: (() => void) | undefined;

/**
 * Finds `frame` once the panel is on the page. The top page owns it and hears
 * its changes. The copy in a device's frame asks through the page above, as its
 * own devknobs shows nothing.
 */
function watchFrame(module: Knobs): void {
  if (window.parent !== window) {
    outsideFrame.set(frameAbove());
    return;
  }
  const frame = 'frame' in module && isFrame(module.frame) ? module.frame : null;
  if (frame === null) {
    return;
  }
  window.knobsOutside = frame;
  outsideFrame.set(frame);
  shown.set(frame.get());
  stopWatching = frame.subscribe(shown.set);
}

function leaveFrame(): void {
  stopWatching?.();
  stopWatching = undefined;
  delete window.knobsOutside;
  outsideFrame.set(null);
  shown.set(OWN);
}

let loading: Promise<Knobs> | undefined;
let mounted = false;

/**
 * devknobs is most of the page's JavaScript, so it loads after hydration
 * instead of in the entry chunk. One load for the whole page, and the panel
 * mounts once. Each call queues on the same promise, so mounts and unmounts
 * run in the order they were asked for.
 */
export function mountKnobs(): Promise<Knobs> {
  loading ??= import('devknobs');
  return loading.then((module) => {
    if (!mounted) {
      module.mount();
      mounted = true;
      watchFrame(module);
    }
    return module;
  });
}

export function unmountKnobs(): void {
  void loading?.then((module) => {
    if (mounted) {
      module.unmount();
      mounted = false;
      leaveFrame();
    }
  });
}

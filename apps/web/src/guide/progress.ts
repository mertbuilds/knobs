import { useSyncExternalStore } from 'react';
import { track } from '../lib/analytics.ts';

type Knobs = Pick<typeof import('devknobs'), 'PRESETS' | 'getState'>;

/** The steps of the guide, in the order it asks for them. */
export const STEPS = ['duo', 'scroll', 'unfold', 'iphone', 'grab', 'mat'] as const;

export type StepId = (typeof STEPS)[number];

export type Progress = {
  readonly done: ReadonlyArray<StepId>;
  /** What grab put on the clipboard for the last pick, or null where it could not be read. */
  readonly grabbed: string | null;
  /** The step done last, for the announcement. */
  readonly last: StepId | null;
};

/** What a copy of the page saw happen, which no knob shows. */
type Signal = { text: string | null; type: 'grab' } | { type: 'scroll' };

type Owner = {
  report(signal: Signal): void;
  snapshot(): Progress;
  subscribe(listener: () => void): () => void;
};

declare global {
  interface Window {
    knobsGuide?: Owner;
  }
}

const DUO = 'iphone-duo';
const IPHONE = 'iphone-18-pro';

// devknobs has no public way to hear a knob change, so the page looks a few
// times a second, and only until the guide is finished.
const LOOK_EVERY = 250;

// How far the page in the frame has to travel before it counts as a scroll.
const SCROLL_FAR = 200;

// The field grab copies from: its value is the text that goes to the clipboard.
const GRAB_FIELD = 'textarea[data-devknobs="grab"]';

const START: Progress = { done: [], grabbed: null, last: null };

let progress = START;
let knobs: Knobs | undefined;
let matAtStart: string | undefined;
let looking: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

export function isFinished(now: Progress): boolean {
  return now.done.length === STEPS.length;
}

function stopLooking(): void {
  clearInterval(looking);
  looking = undefined;
}

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {
      // A listener of a frame's page that is gone.
      listeners.delete(listener);
    }
  }
}

function complete(step: StepId): void {
  if (progress.done.includes(step)) {
    return;
  }
  progress = { ...progress, done: [...progress.done, step], last: step };
  track('guide_step', { step });
  if (isFinished(progress)) {
    track('guide_done', {});
    stopLooking();
  }
  emit();
}

/** Is a phone up with its browser's bars around the page? */
function hasBars(): boolean {
  const state = knobs?.getState();
  if (state === undefined || state.browser === 'off') {
    return false;
  }
  return knobs?.PRESETS.device.find(({ id }) => id === state.device)?.kind === 'phone';
}

/** The steps a knob shows, read off the knobs as they stand. */
function look(): void {
  const state = knobs?.getState();
  if (state === undefined) {
    return;
  }
  matAtStart ??= state.mat;
  if (state.device === DUO) {
    complete('duo');
    if (state.posture === 'open') {
      complete('unfold');
    }
  }
  if (state.device === IPHONE) {
    complete('iphone');
  }
  if (state.mat !== matAtStart) {
    complete('mat');
  }
}

// Progress has one owner, the top page. It keeps it in memory, so it outlives
// every page the device's frame loads.
const local: Owner = {
  report(signal) {
    if (signal.type === 'scroll') {
      if (hasBars()) {
        complete('scroll');
      }
      return;
    }
    // A later pick shows its own text.
    if (signal.text !== null && signal.text !== progress.grabbed) {
      progress = { ...progress, grabbed: signal.text };
      if (progress.done.includes('grab')) {
        emit();
      }
    }
    complete('grab');
  },
  snapshot: () => progress,
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

let owner: Owner | undefined;

/**
 * Inside a device's frame this page runs a second time. That copy keeps no
 * progress of its own: it reads the page above, and reports to it.
 */
function ownerOf(): Owner {
  if (owner !== undefined) {
    return owner;
  }
  try {
    owner = window.parent === window ? local : (window.parent.knobsGuide ?? local);
  } catch {
    // A parent on another origin, such as an embed, answers with an error.
    owner = local;
  }
  return owner;
}

/**
 * Grab ends a pick with a `copy` from a field of its own, the one signal of a
 * pick a page can observe. The field's value is the text that was copied.
 */
function onCopy(event: ClipboardEvent): void {
  // The field is on the page only for as long as the copy takes.
  const field = document.querySelector<HTMLTextAreaElement>(GRAB_FIELD);
  if (field !== null && event.target === field) {
    ownerOf().report({ text: field.value === '' ? null : field.value, type: 'grab' });
  }
}

/**
 * Starts the guide in this copy of the page: the top page becomes the owner,
 * and every copy reports the picks it sees. The copy in a device's frame also
 * reports its own scroll, which the page above cannot see. Returns the way to
 * stop.
 */
export function openGuide(): () => void {
  const to = ownerOf();
  const top = to === local;
  if (top) {
    window.knobsGuide = local;
  }
  document.addEventListener('copy', onCopy, true);
  const from = window.scrollY;
  const onScroll = () => {
    if (to.snapshot().done.includes('scroll')) {
      window.removeEventListener('scroll', onScroll);
    } else if (Math.abs(window.scrollY - from) >= SCROLL_FAR) {
      to.report({ type: 'scroll' });
    }
  };
  if (!top) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  return () => {
    document.removeEventListener('copy', onCopy, true);
    window.removeEventListener('scroll', onScroll);
    if (top) {
      stopLooking();
      knobs = undefined;
      delete window.knobsGuide;
    }
  };
}

/** The owner reads the knobs of `module` until the guide is finished. */
export function watchKnobs(module: Knobs): void {
  if (window.knobsGuide !== local || looking !== undefined || isFinished(progress)) {
    return;
  }
  knobs = module;
  look();
  if (!isFinished(progress)) {
    looking = setInterval(look, LOOK_EVERY);
  }
}

/** Progress as the owner has it now, read outside a render. */
export function readProgress(): Progress {
  return ownerOf().snapshot();
}

function subscribe(listener: () => void): () => void {
  const to = ownerOf();
  const stop = to.subscribe(listener);
  if (to === local) {
    return stop;
  }
  // A frame's page that leaves takes its listener off the page above.
  window.addEventListener('pagehide', stop);
  return () => {
    window.removeEventListener('pagehide', stop);
    stop();
  };
}

// Nothing is done for the server and the first client render, so hydration matches.
const atStart = () => START;

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, readProgress, atStart);
}

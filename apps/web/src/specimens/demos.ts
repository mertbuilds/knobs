import type { DevknobsState, DevknobsStatePatch } from 'devknobs';
import { useSyncExternalStore } from 'react';
import { track } from '../lib/analytics.ts';

type Knobs = typeof import('devknobs');

let loading: Promise<Knobs> | undefined;
let loaded: Knobs | undefined;
let mounted = false;

/**
 * devknobs is most of the page's JavaScript, so it loads after hydration
 * instead of in the entry chunk. One load for the whole page: whoever asks
 * first, the idle mount or a chip pressed before it, starts it, and the panel
 * mounts once. Each call queues on the same promise, so mounts and unmounts
 * run in the order they were asked for.
 */
export function mountKnobs(): Promise<Knobs> {
  loading ??= import('devknobs');
  return loading.then((module) => {
    if (!mounted) {
      module.mount();
      mounted = true;
    }
    loaded = module;
    // The knobs a reload kept are on from here, so their chips show it at once.
    refresh();
    return module;
  });
}

export function unmountKnobs(): void {
  void loading?.then((module) => {
    if (mounted) {
      module.unmount();
      mounted = false;
    }
  });
}

/**
 * Real time, not `new Date()`: once a chip has set the clock, the page's
 * `Date` reads the emulated time, and a second press would count from there.
 */
export function realNow(): number {
  return performance.timeOrigin + performance.now();
}

/**
 * A time of day on the day of `instant`, or `days` after it, on the page's own
 * clock face, so it follows the time zone the page reads.
 */
export function dayAt(instant: number, days: number, hours = 0, minutes = 0, seconds = 0): number {
  const date = new Date(instant);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    hours,
    minutes,
    seconds,
  ).getTime();
}

type DemoSpec = {
  /** What a second press of a chip that is on sends, to put its knob back. */
  off?: DevknobsStatePatch;
  /** Is the knob at this chip's value now? Left out for a chip that only steps. */
  on?: (state: DevknobsState) => boolean;
  /** Built at press time, so the clock counts from the moment of the press. */
  patch: (state: DevknobsState) => DevknobsStatePatch;
};

// The mat colors in the order the chip steps through them, blue first as
// devknobs starts.
const MATS = ['blue', 'green', 'magenta', 'purple', 'red', 'graphite'] as const;

const DUO = 'iphone-duo';

/** A language, with the direction left to follow it, so Arabic turns the page. */
function language(lang: string): DemoSpec {
  return {
    off: { locale: { dir: 'system', lang: 'system' } },
    on: ({ locale }) => locale.lang === lang,
    patch: () => ({ locale: { dir: 'system', lang } }),
  };
}

/** One of devknobs' own geolocation presets, reported without an error. */
function place(preset: string): DemoSpec {
  return {
    off: { geo: { error: 'none', preset: 'system' } },
    on: ({ geo }) => geo.preset === preset && geo.error === 'none',
    patch: () => ({ geo: { error: 'none', preset } }),
  };
}

/** A refusal in place of a position. It needs no position to work. */
function refusal(error: 'denied' | 'timeout'): DemoSpec {
  return {
    off: { geo: { error: 'none' } },
    on: ({ geo }) => geo.error === error,
    patch: () => ({ geo: { error } }),
  };
}

const REAL_CLOCK = { clock: { mode: 'system', speed: 1 } } satisfies DevknobsStatePatch;

/**
 * A jump of the clock to a time of day, counted from the real day. It stays on
 * while the clock still runs from that jump: the engine stamps `since` with the
 * real time of the press, so the same day gives the same instant.
 */
function jump(days: number, hours: number, minutes = 0, seconds = 0): DemoSpec {
  return {
    off: REAL_CLOCK,
    on: ({ clock }) =>
      clock.mode === 'offset' && clock.at === dayAt(clock.since, days, hours, minutes, seconds),
    patch: () => ({
      clock: { at: dayAt(realNow(), days, hours, minutes, seconds), mode: 'offset', speed: 1 },
    }),
  };
}

// Each chip and the knobs it turns.
const DEMOS = {
  arabic: language('ar'),
  denied: refusal('denied'),
  duo: { patch: () => ({ device: DUO, posture: 'closed' }) },
  // The clock runs on from where it stands, ten times as fast.
  fast: {
    off: REAL_CLOCK,
    on: ({ clock }) => clock.mode === 'offset' && clock.speed === 10,
    patch: () => ({ clock: { mode: 'offset', speed: 10 } }),
  },
  // Folds the Duo the other way, or picks it open from any other device.
  fold: {
    patch: ({ device, posture }) => ({
      device: DUO,
      posture: device === DUO && posture === 'open' ? 'closed' : 'open',
    }),
  },
  french: language('fr'),
  // The engine stops the clock at the instant it reads when the mode changes.
  frozen: {
    off: REAL_CLOCK,
    on: ({ clock }) => clock.mode === 'frozen',
    patch: () => ({ clock: { mode: 'frozen' } }),
  },
  german: language('de'),
  iphone: { patch: () => ({ device: 'iphone-18-pro' }) },
  istanbul: place('istanbul'),
  japanese: language('ja'),
  // The next mat color. The mat lies under a frame, so with none up an iPhone
  // brings one, and the next press shows the splash.
  mat: {
    patch: ({ device, mat, width }) => {
      const next = MATS[(MATS.indexOf(mat) + 1) % MATS.length] ?? 'blue';
      return device === 'none' && width === 'full'
        ? { device: 'iphone-18-pro', mat: next }
        : { mat: next };
    },
  },
  // Ten seconds before the sale in the time specimen ends.
  midnight: jump(0, 23, 59, 50),
  newYork: place('new-york'),
  pixel: { patch: () => ({ device: 'pixel-10' }) },
  pseudo: {
    off: { pseudo: false },
    on: ({ pseudo }) => pseudo,
    patch: () => ({ pseudo: true }),
  },
  saoPaulo: place('sao-paulo'),
  // The opposite of the scheme in use, so it shows on either system setting.
  scheme: {
    patch: ({ scheme }) => {
      const dark =
        scheme === 'system'
          ? matchMedia('(prefers-color-scheme: dark)').matches
          : scheme === 'dark';
      return { scheme: dark ? 'light' : 'dark' };
    },
  },
  spanish: language('es'),
  timeout: refusal('timeout'),
  tokyo: place('tokyo'),
  tomorrow: jump(1, 9),
  turkish: language('tr'),
} satisfies Record<string, DemoSpec>;

export type Demo = keyof typeof DEMOS | 'reset';

declare global {
  interface Window {
    knobsDemo?: (demo: Demo) => void;
  }
}

function specOf(demo: keyof typeof DEMOS): DemoSpec {
  return DEMOS[demo];
}

const TOGGLES = Object.entries<DemoSpec>(DEMOS).filter(([, spec]) => spec.on !== undefined);

// devknobs has no public way to hear a knob change, so the page looks: after
// each press here, and a few times a second for a change made in the panel or
// sent down to the copy of the page in a device's frame.
const LOOK_EVERY = 250;

const listeners = new Set<() => void>();
let seen: DevknobsState | undefined;
let onNow = '';
let geoNow = '';
let looking: ReturnType<typeof setInterval> | undefined;

function refresh(): void {
  const state = loaded?.getState();
  // The engine makes a new state for every change, so the same one is no news.
  if (state === undefined || state === seen) {
    return;
  }
  seen = state;
  const on = TOGGLES.filter(([, spec]) => spec.on?.(state) === true)
    .map(([id]) => id)
    .join(' ');
  const geo = JSON.stringify(state.geo);
  if (on === onNow && geo === geoNow) {
    return;
  }
  onNow = on;
  geoNow = geo;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  looking ??= setInterval(refresh, LOOK_EVERY);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(looking);
      looking = undefined;
    }
  };
}

// Nothing is on for the server and the first client render, so hydration matches.
const none = () => '';

/**
 * Whether a chip's knob is at its value, for its pressed state. Undefined for
 * a chip that has no value to be at, such as the next mat color.
 */
export function useDemoOn(demo: Demo): boolean | undefined {
  const on = useSyncExternalStore(subscribe, () => onNow, none);
  if (demo === 'reset' || specOf(demo).on === undefined) {
    return undefined;
  }
  return on.split(' ').includes(demo);
}

/**
 * A value that changes whenever the geolocation knob does. A specimen uses it
 * only to know when to ask the browser again, never for what it shows.
 */
export function useGeoKnob(): string {
  return useSyncExternalStore(subscribe, () => geoNow, none);
}

/**
 * Turns the knobs for one chip, through the public API only, and opens the
 * panel so the visitor sees the row it set and its `×`. A chip that is on
 * turns its knob back off.
 */
export function runDemo(demo: Demo): void {
  track('try_click', { demo });
  void mountKnobs().then((module) => {
    if (demo === 'reset') {
      module.reset();
    } else {
      const spec = specOf(demo);
      const state = module.getState();
      const patch =
        spec.off !== undefined && spec.on?.(state) === true ? spec.off : spec.patch(state);
      module.setState({ ...patch, panel: { open: true } });
    }
    refresh();
  });
}

/**
 * Inside a device's frame this page runs a second time, and the copy of
 * devknobs there only follows the page above. So a chip pressed on the phone
 * screen hands the press up to the page that owns the panel.
 */
export function pressDemo(demo: Demo): void {
  let owner: Window['knobsDemo'];
  try {
    owner = window.parent === window ? undefined : window.parent.knobsDemo;
  } catch {
    // A parent on another origin, such as an embed, answers with an error.
    owner = undefined;
  }
  (owner ?? runDemo)(demo);
}

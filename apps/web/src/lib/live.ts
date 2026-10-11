import { type RefObject, useEffect, useState, useSyncExternalStore } from 'react';

/** Calls `update` whenever the value may have changed. Returns the way to stop. */
export type Watch = (update: () => void) => () => void;

/** A value the browser holds, and what tells the page it moved. */
export type Live<T> = { readonly read: () => T; readonly watch: Watch };

/**
 * A live value. `read` runs on every render and after every `update`, so the
 * same answer comes back as the same object: React sees a change only where
 * there is one.
 */
export function live<T>(read: () => T, watch: Watch): Live<T> {
  let last: { key: string; value: T } | undefined;
  return {
    read: () => {
      const value = read();
      const key = JSON.stringify(value);
      if (last?.key !== key) {
        last = { key, value };
      }
      return last.value;
    },
    watch,
  };
}

const none = () => null;

/** The value now, or null on the server and until the page has hydrated. */
export function useLive<T>(source: Live<T>): T | null {
  return useSyncExternalStore<T | null>(source.watch, source.read, none);
}

/** A value the page sets itself, such as an answer that comes later. */
export type Held<T> = Live<T> & { readonly set: (value: T) => void };

export function held<T>(start: T): Held<T> {
  let value = start;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    set: (next) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    watch: (update) => {
      listeners.add(update);
      return () => listeners.delete(update);
    },
  };
}

/** Several watches as one. */
export function all(...watches: Array<Watch>): Watch {
  return (update) => {
    const stops = watches.map((watch) => watch(update));
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  };
}

/** Events on the window. */
export function onWindow(...events: Array<string>): Watch {
  return (update) => {
    for (const event of events) {
      window.addEventListener(event, update);
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, update);
      }
    };
  };
}

/** A change of any of the media queries. */
export function onMedia(...queries: Array<string>): Watch {
  return (update) => {
    const lists = queries.map((query) => window.matchMedia(query));
    for (const list of lists) {
      list.addEventListener('change', update);
    }
    return () => {
      for (const list of lists) {
        list.removeEventListener('change', update);
      }
    };
  };
}

/** For what has no event of its own, such as the clock. */
export function every(ms: number): Watch {
  return (update) => {
    const timer = setInterval(update, ms);
    return () => clearInterval(timer);
  };
}

/** The first of `values` whose media query matches, such as `dark` for `(prefers-color-scheme: dark)`. */
export function mediaValue(feature: string, values: ReadonlyArray<string>): string | null {
  return values.find((value) => window.matchMedia(`(${feature}: ${value})`).matches) ?? null;
}

/** Whether the element is in the viewport, false until it has been seen there. */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      setInView(entries.at(-1)?.isIntersecting === true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

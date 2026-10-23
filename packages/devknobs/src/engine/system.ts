/**
 * The user's own scheme and motion, for devknobs' own surfaces. A host that
 * sets the prefers knobs for real, in the browser, hides them from every
 * media query in the tab, the panel's included, so it reads them where the
 * knobs do not reach and hands them here.
 */
export interface SystemMedia {
  scheme: "light" | "dark";
  motion: "reduce" | "no-preference";
}

let current: SystemMedia | null = null;
const listeners = new Set<(media: SystemMedia | null) => void>();

/** What the host handed, or null where devknobs' own media queries tell. */
export function systemMedia(): SystemMedia | null {
  return current;
}

export function setSystemMedia(media: SystemMedia | null): void {
  current = media ? { scheme: media.scheme, motion: media.motion } : null;
  for (const listener of listeners) listener(current);
}

/** Calls `listener` now and on each change. Returns the way to stop. */
export function watchSystemMedia(listener: (media: SystemMedia | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

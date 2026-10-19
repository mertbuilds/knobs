/** How long a pointer on the move stays on one element before the box goes to it, in ms. */
export const DWELL = 80;

/**
 * How long the pointer stays on an element that holds the boxed one before
 * the box grows to it, in ms. Between two items the pointer is on their
 * parent for a moment, and often slow there.
 */
export const CONTAINER_DWELL = 250;

/** Slower than this, in px a ms, the pointer is coming to rest. */
export const SLOW = 0.3;

/** What the hit test found of an element the box is not on yet. */
export interface Hover {
  /** A box is up: on an element, or still on the last one for a moment. */
  boxed: boolean;
  /** How long the hit test has found this one element, in ms. */
  held: number;
  /** How fast the pointer went since the hit test before, in px a ms. */
  speed: number;
  /** The element holds the one the box is on. */
  inside: boolean;
}

/** How long the pointer stays on an element before the box goes to it, whatever its speed, in ms. */
export function dwellOf(hover: Hover): number {
  return hover.inside ? CONTAINER_DWELL : DWELL;
}

/**
 * Whether the box goes to the element under the pointer now. A pointer that
 * sweeps the page only passes over most of what it crosses, and a box that
 * set off for each of those would never get to one. So the box waits for the
 * pointer to slow down, or to stay on one element for a while. The first
 * box has nothing to leave, and is up at once. A box only grows to what holds
 * it once the pointer has stayed there longer, slow or not, so it does not
 * cover the whole list in the gap between two of its items.
 */
export function settles(hover: Hover): boolean {
  if (!hover.boxed) return true;
  if (hover.inside) return hover.held >= CONTAINER_DWELL;
  return hover.speed < SLOW || hover.held >= DWELL;
}

/** How fast a pointer went from one point to another in `elapsed` ms, in px a ms. */
export function speedOf(
  from: { x: number; y: number },
  to: { x: number; y: number },
  elapsed: number,
): number {
  return Math.hypot(to.x - from.x, to.y - from.y) / Math.max(elapsed, 1);
}

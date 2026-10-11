import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef } from 'react';

/** How far a box stands from where its layout puts it, in px. */
export interface Offset {
  x: number;
  y: number;
}

/** A box where its layout puts it, with no move on it. */
export interface Home {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface View {
  height: number;
  width: number;
}

/** What is kept of a box for the visit: where it was moved to, and whether it is minimized. */
export interface Stored {
  minimized: boolean;
  place: Offset;
}

// How far the pointer travels before a press is a drag, in px.
export const DRAG_AFTER = 4;

// One press of an arrow key, and one with shift, in px.
const STEP = 16;
const STEP_FAR = 64;

// Space the box keeps from the window's edges.
const MARGIN = 8;

// What a press on is never a drag: the controls, and what marks itself.
const NO_DRAG = 'a, button, input, select, textarea, [data-no-drag]';

const ORIGIN: Offset = { x: 0, y: 0 };

const ARROWS: Record<string, Offset> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
};

function within(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/** The offset that keeps the box in the window, `margin` from its edges. A box too large for it stands at the left and the top. */
export function clampOffset(offset: Offset, home: Home, view: View, margin: number): Offset {
  return {
    x: within(offset.x, margin - home.left, view.width - margin - home.width - home.left),
    y: within(offset.y, margin - home.top, view.height - margin - home.height - home.top),
  };
}

export function sameOffset(a: Offset, b: Offset): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Is the box all in the window at this offset? */
export function fitsView(offset: Offset, home: Home, view: View, margin: number): boolean {
  return sameOffset(clampOffset(offset, home, view, margin), offset);
}

/** Has the pointer gone far enough from its press to drag? */
export function dragStarted(dx: number, dy: number, after: number = DRAG_AFTER): boolean {
  return Math.hypot(dx, dy) >= after;
}

/** How far an arrow key moves the box, or null for any other key. */
export function keyStep(key: string, far: boolean): Offset | null {
  const arrow = ARROWS[key];
  if (arrow === undefined) {
    return null;
  }
  const by = far ? STEP_FAR : STEP;
  return { x: arrow.x * by, y: arrow.y * by };
}

/** What storage holds, or the defaults for anything that is not that. */
export function parseStored(raw: string | null): Stored {
  const none: Stored = { minimized: false, place: ORIGIN };
  if (raw === null) {
    return none;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return none;
  }
  if (typeof data !== 'object' || data === null) {
    return none;
  }
  const { minimized, place } = data as Record<string, unknown>;
  const { x, y } = (typeof place === 'object' && place !== null ? place : {}) as Record<
    string,
    unknown
  >;
  return {
    minimized: minimized === true,
    place:
      typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
        ? { x, y }
        : ORIGIN,
  };
}

function homeOf(el: HTMLElement, at: Offset): Home {
  const { height, left, top, width } = el.getBoundingClientRect();
  return { height, left: left - at.x, top: top - at.y, width };
}

function viewOf(): View {
  const root = document.documentElement;
  return { height: root.clientHeight, width: root.clientWidth };
}

function moveTo(el: HTMLElement, at: Offset): void {
  el.style.transform = sameOffset(at, ORIGIN) ? '' : `translate(${at.x}px, ${at.y}px)`;
}

type Press = { from: Offset; home: Home; id: number; moving: boolean; x: number; y: number };

/**
 * Lets a box be moved from where its layout puts it: by a drag that starts
 * anywhere on it but a control, and by the arrow keys while the box itself has
 * focus. The move is a transform, written to the box and never rendered, and
 * the box stays in the window, also when the window or the box changes size.
 * `place` is where it starts, and the default when that is outside the window.
 * `onPlace` hears where it stands after each move. Off, it does nothing.
 */
export function useDrag<T extends HTMLElement>({
  enabled,
  onPlace,
  place,
}: {
  enabled: boolean;
  onPlace?: ((place: Offset) => void) | undefined;
  place?: Offset | undefined;
}): {
  ref: RefObject<T | null>;
  surface: {
    onKeyDown?: (event: KeyboardEvent<T>) => void;
    onPointerCancel?: (event: PointerEvent<T>) => void;
    onPointerDown?: (event: PointerEvent<T>) => void;
    onPointerMove?: (event: PointerEvent<T>) => void;
    onPointerUp?: (event: PointerEvent<T>) => void;
  };
} {
  const ref = useRef<T>(null);
  const at = useRef<Offset>(place ?? ORIGIN);
  const press = useRef<Press | null>(null);
  const told = useRef(onPlace);
  useEffect(() => {
    told.current = onPlace;
  }, [onPlace]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || el === null) {
      return;
    }
    // A place kept from a larger window is not clamped: the box goes back to its own.
    const kept = at.current;
    const first = fitsView(kept, homeOf(el, ORIGIN), viewOf(), MARGIN) ? kept : ORIGIN;
    at.current = first;
    moveTo(el, first);
    if (!sameOffset(first, kept)) {
      told.current?.(first);
    }
    const settle = () => {
      if (press.current?.moving === true) {
        return;
      }
      const next = clampOffset(at.current, homeOf(el, at.current), viewOf(), MARGIN);
      if (!sameOffset(next, at.current)) {
        at.current = next;
        moveTo(el, next);
        told.current?.(next);
      }
    };
    window.addEventListener('resize', settle);
    const sizes = new ResizeObserver(settle);
    sizes.observe(el);
    return () => {
      window.removeEventListener('resize', settle);
      sizes.disconnect();
      el.style.transform = '';
      el.style.cursor = '';
    };
  }, [enabled]);

  if (!enabled) {
    return { ref, surface: {} };
  }

  const onPointerDown = (event: PointerEvent<T>) => {
    const el = ref.current;
    if (el === null || press.current !== null || !event.isPrimary || event.button !== 0) {
      return;
    }
    if ((event.target as Element).closest(NO_DRAG) !== null) {
      return;
    }
    press.current = {
      from: at.current,
      home: homeOf(el, at.current),
      id: event.pointerId,
      moving: false,
      x: event.clientX,
      y: event.clientY,
    };
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is gone already: the press ends with its next event.
    }
  };
  const onPointerMove = (event: PointerEvent<T>) => {
    const el = ref.current;
    const now = press.current;
    if (el === null || now === null || event.pointerId !== now.id) {
      return;
    }
    const dx = event.clientX - now.x;
    const dy = event.clientY - now.y;
    if (!now.moving) {
      if (!dragStarted(dx, dy)) {
        return;
      }
      now.moving = true;
      el.style.cursor = 'grabbing';
    }
    at.current = clampOffset(
      { x: now.from.x + dx, y: now.from.y + dy },
      now.home,
      viewOf(),
      MARGIN,
    );
    moveTo(el, at.current);
  };
  const endPress = (event: PointerEvent<T>) => {
    const now = press.current;
    if (now === null || event.pointerId !== now.id) {
      return;
    }
    press.current = null;
    if (now.moving) {
      event.currentTarget.style.cursor = '';
      told.current?.(at.current);
    }
  };
  const onKeyDown = (event: KeyboardEvent<T>) => {
    const el = ref.current;
    // Only with the box itself in focus: a control inside keeps its own keys.
    if (el === null || event.target !== el) {
      return;
    }
    const step = keyStep(event.key, event.shiftKey);
    if (step === null) {
      return;
    }
    event.preventDefault();
    const next = clampOffset(
      { x: at.current.x + step.x, y: at.current.y + step.y },
      homeOf(el, at.current),
      viewOf(),
      MARGIN,
    );
    at.current = next;
    moveTo(el, next);
    told.current?.(next);
  };

  return {
    ref,
    surface: {
      onKeyDown,
      onPointerCancel: endPress,
      onPointerDown,
      onPointerMove,
      onPointerUp: endPress,
    },
  };
}

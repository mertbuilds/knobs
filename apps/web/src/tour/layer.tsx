import { colors, font } from '@knobs/ui/tokens.stylex';
import { create, keyframes, props } from '@stylexjs/stylex';
import { type ReactNode, useEffect, useEffectEvent, useRef } from 'react';
import type { Aim } from './targets.ts';

const CALM = '@media (prefers-reduced-motion: reduce)';

// How often the target is looked up again, in ms. Its place is read every frame.
const AIM_EVERY = 150;

// The frame stands this far off its target, and its corners round that much more.
const PAD = 4;

// Space between the frame and what is said beside it, as grab keeps it.
const GAP = 6;

// Space the caption keeps from the window's edge.
const MARGIN = 8;

// How far over the window's bottom a caption with no target sits.
const DOCK = 16;

// One short glide from a target to the next. Following a target has none.
const GLIDE = 200;
const FADE = 'opacity 125ms ease-out';
const GLIDING = `transform ${GLIDE}ms ease-out, width ${GLIDE}ms ease-out, height ${GLIDE}ms ease-out, ${FADE}`;

const pulse = keyframes({
  from: {
    boxShadow: `0 0 0 0 color-mix(in srgb, ${colors.accent} 45%, transparent)`,
  },
  to: {
    boxShadow: `0 0 0 12px color-mix(in srgb, ${colors.accent} 0%, transparent)`,
  },
});

const styles = create({
  // grab's own box: half its blue for the line, a tint inside, and a soft
  // ring so it shows on the page, on the mat and on the panel alike.
  box: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${colors.accent} 50%, transparent)`,
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: `0 0 0 3px color-mix(in srgb, ${colors.accent} 20%, transparent)`,
    boxSizing: 'border-box',
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0,
    willChange: 'transform',
  },
  // On a device's dark screen half a blue line is lost: the whole blue, a line of the label
  // bar's text color outside it, which is light on a light page and dark on a dark one, and the
  // soft ring beyond.
  boxStrong: {
    borderColor: colors.accent,
    boxShadow: `0 0 0 1px ${colors.grabBarText}, 0 0 0 4px color-mix(in srgb, ${colors.accent} 35%, transparent)`,
  },
  // Read by screen readers, never drawn.
  hidden: {
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: 1,
  },
  // Over the whole window and over the panel, with none of the look a popover
  // comes with. It takes no pointer: every click reaches the real control.
  layer: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: colors.fg,
    display: 'block',
    fontFamily: font.family,
    fontSize: '0.8125rem',
    height: 'auto',
    inset: 0,
    lineHeight: '20px',
    margin: 0,
    maxHeight: 'none',
    maxWidth: 'none',
    overflow: 'hidden',
    padding: 0,
    pointerEvents: 'none',
    position: 'fixed',
    width: 'auto',
    zIndex: 2_147_483_647,
  },
  // One ring that leaves the frame, once per stop.
  pulse: {
    animationDuration: '1200ms',
    animationFillMode: 'both',
    animationIterationCount: 1,
    animationName: {
      [CALM]: 'none',
      default: pulse,
    },
    animationTimingFunction: 'ease-out',
    borderRadius: 'inherit',
    inset: 0,
    position: 'absolute',
  },
  tip: {
    alignItems: 'flex-start',
    display: 'flex',
    flexDirection: 'column',
    gap: GAP,
    left: 0,
    maxWidth: `min(420px, calc(100vw - ${2 * MARGIN}px))`,
    opacity: 0,
    position: 'absolute',
    top: 0,
    willChange: 'transform',
  },
});

type Box = { bottom: number; left: number; right: number; top: number };
type Side = 'bottom' | 'left' | 'right' | 'top';
type Size = { height: number; width: number };

const SIDES: ReadonlyArray<Side> = ['left', 'right', 'bottom', 'top'];

/** A place for the caption: a side of the target, of the box around it (`out`), or the window's bottom. */
type Seat = Side | `out-${Side}` | 'dock';
type Placed = { seat: Seat; x: number; y: number };

function boxOf(node: Element): Box {
  const { bottom, left, right, top } = node.getBoundingClientRect();
  return { bottom, left, right, top };
}

/** The part of `a` inside `b`, or null where nothing of it is. */
function cut(a: Box, b: Box): Box | null {
  const box = {
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
  };
  return box.right - box.left < 1 || box.bottom - box.top < 1 ? null : box;
}

/** Scroll `box` just enough to show `node` in it. */
function reveal(node: Element, box: Element): void {
  const at = boxOf(node);
  const within = boxOf(box);
  if (at.top < within.top) {
    box.scrollTop -= within.top - at.top;
  } else if (at.bottom > within.bottom) {
    box.scrollTop += at.bottom - within.bottom;
  }
}

/**
 * What of the target shows in the window, a pixel grid apart. A target scrolled
 * out of its list gives the list, and one off the window gives nothing.
 */
function visible(aim: Aim, view: Size, spot: Box | null): Box | null {
  if (aim.el === null) {
    return null;
  }
  let box = spot ?? boxOf(aim.el);
  if (aim.clip !== null) {
    const within = boxOf(aim.clip);
    box = cut(box, within) ?? within;
  }
  const seen = cut(box, { bottom: view.height, left: 0, right: view.width, top: 0 });
  return seen === null
    ? null
    : {
        bottom: Math.round(seen.bottom),
        left: Math.round(seen.left),
        right: Math.round(seen.right),
        top: Math.round(seen.top),
      };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

function meets(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Where the caption goes: on the side of the target with room for it, the one
 * it is on already while that still fits, never off the window. With `outer`,
 * the box around the target such as the phone around its screen, it goes
 * outside that box first, level with the target, and never over `avoid`. With
 * no target, and with `docks` where there is no room outside, it sits at the
 * bottom of the window.
 */
function place(
  around: Box | null,
  size: Size,
  view: Size,
  was: Seat | null,
  outer: Box | null,
  avoid: Box | null,
  docks: boolean,
): Placed {
  const dock: Placed = {
    seat: 'dock',
    x: Math.round((view.width - size.width) / 2),
    y: Math.max(MARGIN, view.height - size.height - DOCK),
  };
  if (around === null) {
    return dock;
  }
  const across = (around.left + around.right - size.width) / 2;
  const along = (around.top + around.bottom - size.height) / 2;
  const high = { x: view.width - MARGIN - size.width, y: view.height - MARGIN - size.height };
  const seatAt = (seat: Seat): { fits: boolean; room: number; spot: Placed } => {
    if (seat === 'dock') {
      return { fits: docks && outer !== null, room: 0, spot: dock };
    }
    const out = seat.startsWith('out-');
    const from = out ? outer : around;
    const side = SIDES.find((name) => seat.endsWith(name)) ?? 'left';
    if (from === null) {
      return { fits: false, room: Number.NEGATIVE_INFINITY, spot: dock };
    }
    const x =
      side === 'left' ? from.left - GAP - size.width : side === 'right' ? from.right + GAP : across;
    const y =
      side === 'top' ? from.top - GAP - size.height : side === 'bottom' ? from.bottom + GAP : along;
    const room =
      side === 'left'
        ? x - MARGIN
        : side === 'right'
          ? high.x - x
          : side === 'top'
            ? y - MARGIN
            : high.y - y;
    const spot = {
      seat,
      x: Math.round(clamp(x, MARGIN, Math.max(MARGIN, high.x))),
      y: Math.round(clamp(y, MARGIN, Math.max(MARGIN, high.y))),
    };
    const box = {
      bottom: spot.y + size.height,
      left: spot.x,
      right: spot.x + size.width,
      top: spot.y,
    };
    return { fits: room >= 0 && (avoid === null || !meets(box, avoid)), room, spot };
  };
  // Outside the box around the target first. A caption with no frame never goes inside it.
  const seats: ReadonlyArray<Seat> =
    outer === null
      ? SIDES
      : [...SIDES.map((name): Seat => `out-${name}`), ...(docks ? (['dock'] as const) : SIDES)];
  const kept = was !== null && seats.includes(was) ? seatAt(was) : null;
  if (kept?.fits === true) {
    return kept.spot;
  }
  const tried = seats.map(seatAt);
  const best = tried.find(({ fits }) => fits) ?? tried.reduce((a, b) => (b.room > a.room ? b : a));
  return best.spot;
}

/** Is the node there and laid out? */
function shown(node: Element | null | undefined): node is Element {
  return node !== null && node !== undefined && node.getClientRects().length > 0;
}

/** The target's own corner radius, which the frame follows from `PAD` out. */
function radiusOf(node: Element | null): number {
  return node === null ? 0 : Number.parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
}

/**
 * Put the layer last in the browser's top layer, over the panel and over
 * anything that joined before it. A manual popover closes no other and no
 * light dismiss closes it. Without popovers it stays a fixed layer on top.
 */
export function raise(layer: HTMLElement): void {
  if (typeof layer.showPopover !== 'function') {
    return;
  }
  try {
    layer.setAttribute('popover', 'manual');
    if (layer.matches(':popover-open')) {
      layer.hidePopover();
    }
    layer.showPopover();
  } catch {
    layer.removeAttribute('popover');
  }
}

/**
 * The tour's layer: a frame around the real control to use next, and what is
 * said beside it. It follows the control every frame, as the panel glides, a
 * row opens and the device turns, and writes only when something moved.
 * `aim` is asked for the control a few times a second.
 */
export function Layer({
  aim,
  boxed,
  children,
  pulseKey,
  said,
  strong,
}: {
  aim: () => Aim;
  /** Draw the frame around the target, or only stand beside it. */
  boxed: boolean;
  children: ReactNode;
  /** A new one sends the ring out once more. */
  pulseKey: string;
  /** What assistive tech is told, once per change. */
  said: string;
  /** The target is on a device's screen, where the frame needs a stronger line to show. */
  strong: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const read = useEffectEvent(() => ({ aim: aim(), boxed }));
  // A new stop is looked up on the next frame, not at the next turn.
  const again = useRef(false);

  useEffect(() => {
    again.current = true;
  }, [boxed, pulseKey]);

  useEffect(() => {
    const host = layer.current;
    const frame = box.current;
    const note = tip.current;
    if (host === null || frame === null || note === null) {
      return;
    }
    raise(host);
    // Something else joined the top layer, and paints over the tour until it goes in again.
    // devknobs' own, such as the touch cursor, belong over the tour, and the tour's own toggle is not news.
    const onToggle = (event: Event) => {
      if (!('newState' in event) || event.newState !== 'open') {
        return;
      }
      const ours = Array.from(document.querySelectorAll('[data-devknobs]'));
      if (!ours.some((node) => node === event.target)) {
        raise(host);
      }
    };
    window.addEventListener('toggle', onToggle, true);

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let size: Size = { height: note.offsetHeight, width: note.offsetWidth };
    let stale = true;
    const sizes = new ResizeObserver(() => {
      size = { height: note.offsetHeight, width: note.offsetWidth };
      stale = true;
    });
    sizes.observe(note);

    let now: ReturnType<typeof read> | null = null;
    let lookedAt = Number.NEGATIVE_INFINITY;
    let target: Element | null = null;
    let radius = 0;
    let revealedIn: Element | null = null;
    let seat: Seat | null = null;
    let framed = false;
    let glideUntil = 0;
    let drawn = '';
    let id = 0;

    const step = (time: number) => {
      id = requestAnimationFrame(step);
      if (
        now === null ||
        again.current ||
        time - lookedAt >= AIM_EVERY ||
        now.aim.el?.isConnected === false
      ) {
        again.current = false;
        now = read();
        lookedAt = time;
        radius = radiusOf(now.aim.el);
      }
      const { clip, el } = now.aim;
      // Once per list: after that the list is the visitor's to scroll.
      if (el !== null && clip !== null && clip !== revealedIn) {
        reveal(el, clip);
      }
      revealedIn = clip;
      const root = document.documentElement;
      const view = { height: root.clientHeight, width: root.clientWidth };
      // A target that moves by itself, such as the browser's bars, says where it is now.
      const spot = el === null ? null : (now.aim.spot?.() ?? null);
      const round = Math.round(spot?.radius ?? radius);
      const at = visible(now.aim, view, spot);
      const outer = at === null || !shown(now.aim.beside) ? null : boxOf(now.aim.beside);
      const avoid = at === null || !shown(now.aim.avoid) ? null : boxOf(now.aim.avoid);
      const bare = now.aim.bare === true;
      const key = [
        at?.left,
        at?.top,
        at?.right,
        at?.bottom,
        outer?.left,
        outer?.top,
        outer?.right,
        outer?.bottom,
        avoid?.left,
        avoid?.top,
        avoid?.right,
        avoid?.bottom,
        bare,
        round,
        view.width,
        view.height,
        size.width,
        size.height,
        now.boxed,
      ].join(' ');
      if (key === drawn && !stale && el === target) {
        return;
      }
      drawn = key;
      stale = false;
      if (el !== target) {
        // A new target: the frame glides there from where it stood, and the caption picks its side anew.
        if (framed && at !== null && !calm.matches) {
          glideUntil = time + GLIDE;
        }
        target = el;
        seat = null;
      }
      const moving = time < glideUntil ? GLIDING : calm.matches ? 'none' : FADE;
      const framing = now.boxed && !bare;
      const around =
        at === null || !framing
          ? at
          : {
              bottom: at.bottom + PAD,
              left: at.left - PAD,
              right: at.right + PAD,
              top: at.top - PAD,
            };
      framed = around !== null && framing;
      frame.style.transition = moving;
      if (around !== null && framed) {
        frame.style.transform = `translate(${around.left}px, ${around.top}px)`;
        frame.style.width = `${around.right - around.left}px`;
        frame.style.height = `${around.bottom - around.top}px`;
        frame.style.borderRadius = `${round + PAD}px`;
      }
      frame.style.opacity = framed ? '1' : '0';
      const put = place(around, size, view, seat, outer, avoid, bare);
      seat = put.seat;
      note.style.transition = moving;
      note.style.transform = `translate(${put.x}px, ${put.y}px)`;
      note.style.opacity = '1';
    };
    id = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(id);
      sizes.disconnect();
      window.removeEventListener('toggle', onToggle, true);
    };
  }, []);

  return (
    <div {...props(styles.layer)} data-devknobs="tour" ref={layer}>
      <div {...props(styles.box, strong && styles.boxStrong)} aria-hidden="true" ref={box}>
        <span {...props(styles.pulse)} key={pulseKey} />
      </div>
      <div {...props(styles.tip)} ref={tip}>
        {children}
      </div>
      <span {...props(styles.hidden)} aria-live="polite">
        {said}
      </span>
    </div>
  );
}

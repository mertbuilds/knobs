import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, firstThatWorks, props } from '@stylexjs/stylex';
import { ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chip } from '../lib/chip.tsx';
import { ICON } from '../lib/icon.ts';

/**
 * A development tool, never in a build: live sliders for the constants of
 * devknobs' fold (the iPhone Duo), drawn from the spec devknobs lists, so the
 * owner tunes the fold by eye and saves what he picked. See `AGENTS.md`,
 * "Tuning the fold (dev)".
 */

interface Entry {
  default: number;
  hint?: string;
  key: string;
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
  value: number;
}

/** The hook devknobs puts on the top page's window once its fold code has run. */
interface FoldTune {
  get(): Record<string, number>;
  reset(): void;
  set(key: string, value: number): void;
  spec: Array<Entry>;
  subscribe(listener: () => void): () => void;
}

type Values = Record<string, number>;

const HOOK = Symbol.for('devknobs.foldtune');
const STORE = 'knobs:foldtune';
const ENDPOINT = '/__tune/fold';

// The card's width, and the gutter it keeps to the window's edges.
const CARD = 300;
const GUTTER = 16;

// Where the card was dragged to, from its corner, for the visit.
const place = { x: 0, y: 0 };

/** The hook that already got this tab's stored values, so they go in once. */
let adopted: FoldTune | null = null;

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9;
}

/** The values that are not their defaults. */
function changedOf(spec: ReadonlyArray<Entry>, values: Values): Values {
  const changed: Values = {};
  for (const entry of spec) {
    const value = values[entry.key];
    if (value !== undefined && differs(value, entry.default)) {
      changed[entry.key] = value;
    }
  }
  return changed;
}

/** Set every value of `values` the spec has a key for. */
function apply(tune: FoldTune, values: unknown): void {
  if (typeof values !== 'object' || values === null) {
    return;
  }
  for (const entry of tune.spec) {
    const value = (values as Record<string, unknown>)[entry.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      tune.set(entry.key, value);
    }
  }
}

/** Keep the changed values for a reload of this tab. With none changed, keep nothing. */
function remember(spec: ReadonlyArray<Entry>, values: Values): void {
  try {
    const changed = changedOf(spec, values);
    if (Object.keys(changed).length === 0) {
      sessionStorage.removeItem(STORE);
    } else {
      sessionStorage.setItem(STORE, JSON.stringify(changed));
    }
  } catch {
    // No storage: the values last as long as the page does.
  }
}

/** The hook, once devknobs has put it there. The first sight of it gets the tab's stored values back. */
function findHook(): FoldTune | null {
  const tune = (window as unknown as Record<symbol, FoldTune | undefined>)[HOOK] ?? null;
  if (tune !== null && tune !== adopted) {
    adopted = tune;
    try {
      apply(tune, JSON.parse(sessionStorage.getItem(STORE) ?? 'null'));
    } catch {
      // Nothing stored that can be read.
    }
  }
  return tune;
}

/** As many decimals as the step has, so the readout does not jump in width. */
function shown(value: number, entry: Entry): string {
  const decimals = String(entry.step).split('.')[1]?.length ?? 0;
  return `${value.toFixed(decimals)}${entry.unit ?? ''}`;
}

/** The values as JSON, then the changed ones against their defaults. */
function copyText(spec: ReadonlyArray<Entry>, values: Values): string {
  const lines = spec
    .filter((entry) => differs(values[entry.key] ?? entry.default, entry.default))
    .map((entry) => `// ${entry.key}: ${entry.default} -> ${values[entry.key]}`);
  const changed = lines.length === 0 ? '// none changed' : lines.join('\n');
  return `${JSON.stringify(values, null, 2)}\n\n// defaults\n${changed}\n`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString([], { hour12: false });
}

/** Into the browser's top layer, over the device's mat and the panel. A manual popover closes no other. */
function raise(card: HTMLElement): void {
  if (typeof card.showPopover !== 'function') {
    return;
  }
  try {
    card.setAttribute('popover', 'manual');
    if (!card.matches(':popover-open')) {
      card.showPopover();
    }
  } catch {
    card.removeAttribute('popover');
  }
}

const styles = create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s1,
    paddingBlock: spacing.s1,
    paddingInline: 6,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
  },
  // A small panel: hairline, 13 round, its rows 4 inside it, so 8 round. It
  // sits in the window's bottom left corner, away from the devknobs panel,
  // and scrolls inside when it is taller than the window.
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    bottom: GUTTER,
    boxShadow: shadow.lift,
    boxSizing: 'border-box',
    color: colors.fg,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.family,
    fontSize: 13,
    gap: spacing.s1,
    height: 'auto',
    left: GUTTER,
    lineHeight: 1.5,
    margin: 0,
    maxHeight: firstThatWorks(`calc(100dvh - ${GUTTER * 2}px)`, `calc(100vh - ${GUTTER * 2}px)`),
    maxWidth: `calc(100vw - ${GUTTER * 2}px)`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    padding: spacing.s1,
    position: 'fixed',
    right: 'auto',
    top: 'auto',
    width: CARD,
    zIndex: 2_147_483_647,
  },
  // The whole head moves the card. No touch scroll starts on it.
  head: {
    alignItems: 'center',
    columnGap: 2,
    cursor: 'grab',
    display: 'flex',
    paddingInlineStart: 6,
    touchAction: 'none',
    userSelect: 'none',
  },
  hint: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
  },
  // The panel's small icon button: faint, and the track ground on hover.
  icon: {
    alignItems: 'center',
    backgroundColor: {
      ':hover': colors.track,
      default: 'transparent',
    },
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    cursor: 'pointer',
    display: 'flex',
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    outlineColor: colors.muted,
    outlineOffset: -1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    padding: 0,
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
    width: 22,
  },
  label: {
    flexGrow: 1,
    minWidth: 0,
  },
  line: {
    color: colors.muted,
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: 6,
  },
  name: {
    color: colors.muted,
    flexGrow: 1,
  },
  note: {
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.4,
    margin: 0,
    paddingBottom: spacing.s1,
    paddingInline: 6,
  },
  range: {
    accentColor: colors.fg,
    boxSizing: 'border-box',
    margin: 0,
    marginBlock: spacing.s1,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    width: '100%',
  },
  // A row's own small word, shown only once its value has left the default.
  reset: {
    backgroundColor: 'transparent',
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: font.sizeXs,
    lineHeight: 1.4,
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: 0,
    paddingInline: spacing.s1,
  },
  // Out of sight and out of the tab order, its room kept, so the readout does not move.
  resetOff: {
    visibility: 'hidden',
  },
  // A panel row, 4 inside the card, so 8 round.
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    paddingBlock: spacing.s1,
    paddingInline: 10,
  },
  rowTop: {
    alignItems: 'baseline',
    columnGap: spacing.s1,
    display: 'flex',
  },
  value: {
    cursor: 'default',
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
});

/** What the save endpoint last wrote, as far as the panel reads it. */
type Saved = { values?: unknown };

function Rows({ tune }: { tune: FoldTune }) {
  const [values, setValues] = useState<Values>(() => tune.get());
  // While the defaults stand in for the tuned values, the hook's are not the panel's.
  const comparing = useRef(false);
  const [held, setHeld] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [said, setSaid] = useState<{ on: 'copy' | 'save'; text: string } | null>(null);

  useEffect(
    () =>
      tune.subscribe(() => {
        if (!comparing.current) {
          const next = tune.get();
          setValues(next);
          remember(tune.spec, next);
        }
      }),
    [tune],
  );

  useEffect(() => {
    let live = true;
    fetch(ENDPOINT)
      .then((response) => (response.ok ? (response.json() as Promise<Saved>) : null))
      .then(
        (last) => {
          if (live && last !== null) {
            setSaved(last);
          }
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (said === null) {
      return;
    }
    const timer = setTimeout(() => setSaid(null), 2500);
    return () => clearTimeout(timer);
  }, [said]);

  // What the hook has after a write, which it may have clamped.
  const take = () => {
    const next = tune.get();
    setValues(next);
    remember(tune.spec, next);
  };
  const set = (key: string, value: number) => {
    tune.set(key, value);
    take();
  };
  const resetAll = () => {
    tune.reset();
    take();
  };
  const load = () => {
    apply(tune, saved?.values);
    take();
  };

  const hold = () => {
    if (comparing.current) {
      return;
    }
    comparing.current = true;
    setHeld(true);
    for (const entry of tune.spec) {
      tune.set(entry.key, entry.default);
    }
  };
  const release = () => {
    if (!comparing.current) {
      return;
    }
    for (const entry of tune.spec) {
      tune.set(entry.key, values[entry.key] ?? entry.default);
    }
    comparing.current = false;
    setHeld(false);
  };
  const holdByPointer = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    hold();
  };
  const holdByKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      hold();
    }
  };

  const copy = () => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(copyText(tune.spec, values)))
      .then(
        () => setSaid({ on: 'copy', text: 'copied' }),
        () => setSaid({ on: 'copy', text: 'copy failed' }),
      );
  };
  const save = () => {
    const changed: Record<string, { from: number; to: number }> = {};
    for (const entry of tune.spec) {
      const value = values[entry.key];
      if (value !== undefined && differs(value, entry.default)) {
        changed[entry.key] = { from: entry.default, to: value };
      }
    }
    const now = new Date();
    const body = {
      changed,
      savedAt: now.toISOString(),
      spec: tune.spec,
      userAgent: navigator.userAgent,
      values,
    };
    fetch(ENDPOINT, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).then(
      (response) => {
        if (response.ok) {
          setSaved(body);
        }
        setSaid({ on: 'save', text: response.ok ? `saved ${clock(now)}` : 'save failed' });
      },
      () => setSaid({ on: 'save', text: 'save failed' }),
    );
  };

  return (
    <>
      {tune.spec.map((entry) => {
        const value = values[entry.key] ?? entry.default;
        const changed = differs(value, entry.default);
        return (
          <div {...props(styles.row)} key={entry.key}>
            <div {...props(styles.rowTop)}>
              <span {...props(styles.label)}>{entry.label}</span>
              <button
                {...props(styles.reset, !changed && styles.resetOff)}
                onClick={() => set(entry.key, entry.default)}
                type="button"
              >
                reset
              </button>
              <span
                {...props(styles.value)}
                onDoubleClick={() => set(entry.key, entry.default)}
                title="double-click to reset"
              >
                {shown(value, entry)}
              </span>
            </div>
            {entry.hint !== undefined && <span {...props(styles.hint)}>{entry.hint}</span>}
            <input
              {...props(styles.range)}
              aria-label={entry.label}
              disabled={held}
              max={entry.max}
              min={entry.min}
              onChange={(event) => set(entry.key, event.currentTarget.valueAsNumber)}
              step={entry.step}
              type="range"
              value={value}
            />
          </div>
        );
      })}
      <div {...props(styles.actions)}>
        <Chip onClick={resetAll}>reset all</Chip>
        <Chip onClick={copy}>{said?.on === 'copy' ? said.text : 'copy'}</Chip>
        <Chip onClick={save}>{said?.on === 'save' ? said.text : 'save'}</Chip>
        <Chip
          aria-pressed={held}
          onBlur={release}
          onKeyDown={holdByKey}
          onKeyUp={release}
          onLostPointerCapture={release}
          onPointerCancel={release}
          onPointerDown={holdByPointer}
          onPointerUp={release}
          title="hold to see the defaults, let go for the tuned values"
        >
          {held ? 'defaults' : 'compare'}
        </Chip>
        {saved !== null && <Chip onClick={load}>load last saved</Chip>}
      </div>
      <p {...props(styles.note)}>Hold the fold slider in the panel at an angle, then drag</p>
    </>
  );
}

export default function FoldTunePanel() {
  const [tune, setTune] = useState(findHook);
  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ grabX: number; grabY: number; left: number; top: number } | null>(null);

  // devknobs puts the hook up when its fold code first runs, which a Duo starts.
  useEffect(() => {
    if (tune !== null) {
      return;
    }
    const timer = setInterval(() => {
      const found = findHook();
      if (found !== null) {
        setTune(found);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [tune]);

  useEffect(() => {
    const el = card.current;
    if (el === null) {
      return;
    }
    el.style.transform = `translate(${place.x}px, ${place.y}px)`;
    raise(el);
  }, []);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (el === null || event.button !== 0 || (event.target as Element).closest('button') !== null) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const { left, top } = el.getBoundingClientRect();
    // The pointer's place on the card, and the card's corner with no move on
    // it, so a move is clamped as a place in the window.
    drag.current = {
      grabX: event.clientX - left,
      grabY: event.clientY - top,
      left: left - place.x,
      top: top - place.y,
    };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    const from = drag.current;
    if (el === null || from === null) {
      return;
    }
    const room = document.documentElement;
    const left = Math.min(event.clientX - from.grabX, room.clientWidth - GUTTER - el.offsetWidth);
    const top = Math.min(event.clientY - from.grabY, room.clientHeight - GUTTER - el.offsetHeight);
    place.x = Math.max(GUTTER, left) - from.left;
    place.y = Math.max(GUTTER, top) - from.top;
    el.style.transform = `translate(${place.x}px, ${place.y}px)`;
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (closed) {
    return null;
  }
  // On the body and marked as devknobs' own, as the tour is: devknobs hides
  // every other child of the body, and every other popover, under a device.
  return createPortal(
    <div {...props(styles.card)} data-devknobs="foldtune" ref={card}>
      <div
        {...props(styles.head)}
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <span {...props(styles.name)}>fold tune</span>
        <button
          {...props(styles.icon)}
          aria-expanded={open}
          aria-label={open ? 'fold the card' : 'unfold the card'}
          onClick={() => setOpen(!open)}
          type="button"
        >
          {open ? <ChevronDownIcon {...ICON} /> : <ChevronUpIcon {...ICON} />}
        </button>
        <button
          {...props(styles.icon)}
          aria-label="close until reload"
          onClick={() => setClosed(true)}
          type="button"
        >
          <XIcon {...ICON} />
        </button>
      </div>
      {open && (
        <div {...props(styles.body)}>
          {tune === null ? (
            <p {...props(styles.line)}>Pick the iPhone Duo in the panel and fold it once</p>
          ) : (
            <Rows tune={tune} />
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

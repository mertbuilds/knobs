import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { ClipboardCheckIcon, XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ICON } from '../lib/icon.ts';
import { Key } from '../lib/keys.tsx';
import { m } from '../paraglide/messages.js';
import { Layer } from './layer.tsx';
import {
  closeTour,
  isTop,
  startTour,
  STOPS,
  takesEscape,
  tourKnobs,
  useProgress,
} from './progress.ts';
import { type Aim, aimAt, aimAtPanel, type Say } from './targets.ts';

// A copied line longer than this loses its middle, so the bubble stays small.
const CLIP_AT = 120;
const CLIP_HEAD = 72;
const CLIP_TAIL = 40;

const LINES: Record<Say, () => string> = {
  addDevice: m.tour_add_device,
  addMat: m.tour_add_mat,
  bars: m.tour_bars,
  duo: m.tour_duo,
  entryDevice: m.tour_entry_device,
  entryMat: m.tour_entry_mat,
  filter: m.tour_filter,
  grab: m.tour_grab,
  iphone: m.tour_iphone,
  mat: m.tour_mat,
  open: m.tour_open,
  rowDevice: m.tour_row_device,
  rowMat: m.tour_row_mat,
  scroll: m.tour_scroll,
  searchDevice: m.tour_search_device,
  searchMat: m.tour_search_mat,
  settings: m.tour_settings,
  unfold: m.tour_unfold,
};

// The key that does the same as the control the caption points at.
const KEYS: Partial<Record<Say, () => string>> = {
  grab: m.hint_grab_key,
  open: m.hint_panel_key,
};

const styles = create({
  // grab's label bar, with what to do next in it.
  bar: {
    alignItems: 'center',
    backgroundColor: colors.grabBar,
    borderRadius: radius.bar,
    color: colors.grabBarText,
    columnGap: 6,
    display: 'flex',
    fontSize: 13,
    lineHeight: '1rem',
    paddingBlock: 6,
    paddingInline: spacing.s2,
    whiteSpace: 'nowrap',
  },
  barClose: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: radius.base,
    borderStyle: 'none',
    color: {
      ':hover': colors.grabBarText,
      default: colors.grabTag,
    },
    cursor: 'pointer',
    display: 'flex',
    outlineColor: colors.grabBarText,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    padding: 0,
    pointerEvents: 'auto',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease-out',
  },
  // A small panel: hairline, 13 round, its rows 4 inside it, so 8 round.
  bubble: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: shadow.lift,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    maxWidth: '100%',
    padding: spacing.s1,
  },
  // The panel's small icon button: faint, and the track ground on hover.
  bubbleClose: {
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
    pointerEvents: 'auto',
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
    width: 22,
  },
  bubbleLine: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: '10px 4px',
  },
  // What grab copied, as the page's code boxes show code.
  copied: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: '18px',
    margin: 0,
    overflowWrap: 'anywhere',
    paddingBlock: 6,
    paddingInline: spacing.s2,
    whiteSpace: 'pre-wrap',
  },
  grow: {
    flexGrow: 1,
    minWidth: 0,
  },
  icon: {
    display: 'flex',
    flexShrink: 0,
  },
  // The page's key chip as a button: a hairline box, nothing else.
  start: {
    alignSelf: 'flex-start',
    backgroundColor: {
      ':hover': colors.card,
      default: 'transparent',
    },
    borderColor: colors.border,
    borderRadius: radius.base,
    borderStyle: 'solid',
    borderWidth: 1,
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.4,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: 2,
    paddingInline: spacing.s2,
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
  },
  // The install command, whose copy button takes the pointer.
  takes: {
    pointerEvents: 'auto',
  },
});

/** A long copied text without its middle, so its start and its end both show. */
function clip(text: string): string {
  return text.length > CLIP_AT ? `${text.slice(0, CLIP_HEAD)} … ${text.slice(-CLIP_TAIL)}` : text;
}

/**
 * The guided tour: a frame around the real control to use next, which moves on
 * by itself as the visitor uses it, and the one button on the page that starts
 * it again. Only the top page draws it. The copy of the page in a device's
 * frame shows the button alone, which starts the tour on the page above.
 * `install` is the install command. Once every stop is done one bubble takes
 * the caption's place: what the last pick copied, and how to install.
 */
export function Tour({ install }: { install: ReactNode }) {
  const progress = useProgress();
  // What the layer last found to say, which follows the page, not only the stop.
  const [say, setSay] = useState<Say | null>(null);
  const ended = progress.phase === 'end';
  const showing = progress.phase !== 'off' && isTop();
  // The scroll just done keeps the screen a moment, to watch the bars move.
  const stop = progress.watching ? 'scroll' : STOPS.find((id) => !progress.done.includes(id));

  useEffect(() => {
    if (!showing) {
      return;
    }
    // After the panel's and grab's own listeners, and only when neither had a use for the key.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && takesEscape()) {
        closeTour();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing]);

  const aim = (): Aim => {
    const knobs = tourKnobs();
    let next: Aim = { clip: null, el: null, say: ended ? null : 'open' };
    if (knobs !== undefined) {
      next = ended || stop === undefined ? aimAtPanel(knobs) : aimAt(stop, knobs);
    }
    if (progress.watching && next.say === 'scroll') {
      next = { ...next, say: 'bars' };
    }
    setSay(next.say);
    return next;
  };

  const line = ended || say === null ? null : LINES[say]();
  const key = ended || say === null ? undefined : KEYS[say]?.();

  return (
    <>
      <button {...props(styles.start)} onClick={startTour} type="button">
        {m.tour_start()}
      </button>
      {showing &&
        createPortal(
          <Layer
            aim={aim}
            boxed={!ended}
            pulseKey={stop ?? 'end'}
            said={ended ? m.tour_copied() : (line ?? '')}
          >
            {line !== null && (
              <div {...props(styles.bar)}>
                {line}
                {key !== undefined && <Key>{key}</Key>}
                <button
                  {...props(styles.barClose)}
                  aria-label={m.tour_close()}
                  onClick={closeTour}
                  type="button"
                >
                  <XIcon {...ICON} />
                </button>
              </div>
            )}
            {ended && (
              <div {...props(styles.bubble)}>
                <p {...props(styles.bubbleLine)}>
                  <span {...props(styles.icon)}>
                    <ClipboardCheckIcon {...ICON} />
                  </span>
                  <span {...props(styles.grow)}>{m.tour_copied()}</span>
                  <button
                    {...props(styles.bubbleClose)}
                    aria-label={m.tour_close()}
                    onClick={closeTour}
                    type="button"
                  >
                    <XIcon {...ICON} />
                  </button>
                </p>
                {progress.grabbed !== null && (
                  <pre {...props(styles.copied)}>{clip(progress.grabbed)}</pre>
                )}
                <p {...props(styles.bubbleLine)}>{m.tour_end()}</p>
                <div {...props(styles.takes)}>{install}</div>
              </div>
            )}
          </Layer>,
          document.body,
        )}
    </>
  );
}

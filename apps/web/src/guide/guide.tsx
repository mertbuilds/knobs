import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ClipboardCheckIcon,
  CrosshairIcon,
  type LucideIcon,
  MouseIcon,
  PaletteIcon,
  SmartphoneIcon,
  UnfoldHorizontalIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ICON } from '../lib/icon.ts';
import { withKeys } from '../lib/keys.tsx';
import { m } from '../paraglide/messages.js';
import { isFinished, readProgress, type StepId, STEPS, useProgress } from './progress.ts';

// The page's one breakpoint: two columns of steps from here, one below it.
const WIDE = '@media (min-width: 640px)';

const CALM = '@media (prefers-reduced-motion: reduce)';

// How long the pinned bar says the guide is done before it goes.
const FAREWELL = 2600;

// A copied line longer than this loses its middle, so the card stays small.
const CLIP_AT = 280;
const CLIP_HEAD = 170;
const CLIP_TAIL = 90;

const VIEWS: Record<StepId, { icon: LucideIcon; line: () => string }> = {
  duo: { icon: SmartphoneIcon, line: m.guide_duo },
  grab: { icon: CrosshairIcon, line: m.guide_grab },
  iphone: { icon: ArrowLeftRightIcon, line: m.guide_iphone },
  mat: { icon: PaletteIcon, line: m.guide_mat },
  scroll: { icon: MouseIcon, line: m.guide_scroll },
  unfold: { icon: UnfoldHorizontalIcon, line: m.guide_unfold },
};

const styles = create({
  // The pinned bar's place: the bottom of the viewport, clear of the phone's
  // own edge and of Safari's bars where devknobs draws the page under them.
  // It takes no pointer and no focus, and lies under the devknobs panel.
  bar: {
    bottom: `calc(${spacing.s3} + env(safe-area-inset-bottom, 0px) + var(--devknobs-end-room, 0px))`,
    display: 'flex',
    insetInline: 0,
    justifyContent: 'center',
    opacity: 0,
    paddingInline: spacing.s4,
    pointerEvents: 'none',
    position: 'fixed',
    transform: 'translateY(8px)',
    visibility: 'hidden',
    zIndex: 10,
  },
  barCount: {
    color: colors.muted,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  barMove: {
    transitionDuration: {
      [CALM]: '0ms',
      default: '200ms',
    },
    transitionProperty: 'opacity, transform, visibility',
    transitionTimingFunction: 'ease-out',
  },
  barOn: {
    opacity: 1,
    transform: 'none',
    visibility: 'visible',
  },
  // A small panel of one row.
  barPanel: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: shadow.lift,
    boxSizing: 'border-box',
    color: colors.fg,
    fontSize: 13,
    lineHeight: '20px',
    maxWidth: 'min(100%, 360px)',
    padding: spacing.s1,
  },
  barRow: {
    alignItems: 'baseline',
    columnGap: spacing.s2,
    display: 'flex',
    paddingBlock: spacing.s1,
    paddingInline: '10px',
  },
  // A step is a small panel: hairline, 13 round, its row 4 inside it, so 8 round.
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    color: colors.muted,
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
    gap: spacing.s1,
    lineHeight: '20px',
    minWidth: 0,
    padding: spacing.s1,
  },
  // The step asked for now: grab's blue around it, at half strength.
  cardCurrent: {
    borderColor: `color-mix(in srgb, ${colors.accent} 50%, ${colors.border})`,
    color: colors.fg,
  },
  // The check is drawn in: its stroke runs from nothing to its whole length.
  check: {
    display: 'flex',
    flexShrink: 0,
    strokeDasharray: 24,
    strokeDashoffset: 24,
  },
  checkMove: {
    transitionDuration: {
      [CALM]: '0ms',
      default: '240ms',
    },
    transitionProperty: 'stroke-dashoffset',
    transitionTimingFunction: 'ease-out',
  },
  checkOn: {
    strokeDashoffset: 0,
  },
  // What grab copied, as the page's code boxes show code.
  copied: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    color: colors.fg,
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: '18px',
    margin: 0,
    overflowWrap: 'anywhere',
    paddingBlock: 6,
    paddingInline: spacing.s2,
    whiteSpace: 'pre-wrap',
  },
  copiedNote: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: '10px 8px',
  },
  finished: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
    gap: spacing.s1,
    lineHeight: '20px',
    padding: spacing.s1,
  },
  finishedLine: {
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: '10px 8px',
  },
  guide: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
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
  line: {
    flexGrow: 1,
    minWidth: 0,
  },
  number: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: font.mono,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  },
  row: {
    alignItems: 'center',
    borderRadius: radius.row,
    columnGap: spacing.s2,
    display: 'flex',
    minHeight: 36,
    paddingBlock: spacing.s2,
    paddingInline: '10px 8px',
  },
  // The current step lies on the card ground. The weight never changes.
  rowCurrent: {
    backgroundColor: colors.card,
  },
  steps: {
    display: 'grid',
    gap: spacing.s2,
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      [WIDE]: 'minmax(0, 1fr) minmax(0, 1fr)',
    },
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  // Small and calm, like the panel's own labels.
  title: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: font.weightRegular,
    margin: 0,
  },
});

/** A long copied text without its middle, so its start and its end both show. */
function clip(text: string): string {
  return text.length > CLIP_AT ? `${text.slice(0, CLIP_HEAD)} … ${text.slice(-CLIP_TAIL)}` : text;
}

function Step({
  current,
  done,
  grabbed,
  id,
  live,
  number,
}: {
  current: boolean;
  done: boolean;
  grabbed: string | null;
  id: StepId;
  live: boolean;
  number: number;
}) {
  const { icon: Icon, line } = VIEWS[id];
  return (
    <li {...props(styles.card, current && styles.cardCurrent)} aria-current={current && 'step'}>
      <div {...props(styles.row, current && styles.rowCurrent)}>
        <span {...props(styles.number)} aria-hidden="true">
          {number}
        </span>
        <Icon {...ICON} />
        <span {...props(styles.line)}>{withKeys(line())}</span>
        <span {...props(styles.check, done && styles.checkOn, live && styles.checkMove)}>
          <CheckIcon {...ICON} />
        </span>
        {done && <span {...props(styles.hidden)}>{m.guide_step_done()}</span>}
      </div>
      {id === 'grab' && done && (
        <>
          <p {...props(styles.copiedNote)}>
            <ClipboardCheckIcon {...ICON} />
            {m.guide_grab_copied()}
          </p>
          {grabbed !== null && <pre {...props(styles.copied)}>{clip(grabbed)}</pre>}
        </>
      )}
    </li>
  );
}

/**
 * Six things to do with the real panel, each ticked the moment the visitor
 * does it. No step is a button: the knobs are only in the panel. `install` is
 * the install command, shown once all six are done.
 */
export function Guide({ install }: { install: ReactNode }) {
  const progress = useProgress();
  const title = useId();
  const steps = useRef<HTMLOListElement>(null);
  // In view until the browser says otherwise, so the bar never shows at load.
  const [inView, setInView] = useState(true);
  // False for the first paint, so what is already done shows without motion.
  const [live, setLive] = useState(false);
  // True once the bar has said the guide is done, or the page came up with it done.
  const [parted, setParted] = useState(false);

  const finished = isFinished(progress);
  const current = STEPS.find((id) => !progress.done.includes(id));

  useEffect(() => {
    const list = steps.current;
    if (list === null) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry !== undefined) {
        setInView(entry.isIntersecting);
      }
    });
    observer.observe(list);
    const frame = requestAnimationFrame(() => {
      setParted(isFinished(readProgress()));
      setLive(true);
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!finished) {
      return;
    }
    const timer = setTimeout(() => setParted(true), FAREWELL);
    return () => clearTimeout(timer);
  }, [finished]);

  const said =
    progress.last === null
      ? ''
      : finished
        ? m.guide_all_done()
        : progress.last === 'grab'
          ? m.guide_said_grab()
          : m.guide_said_step({ step: String(STEPS.indexOf(progress.last) + 1) });

  return (
    <section {...props(styles.guide)}>
      <h2 {...props(styles.title)} id={title}>
        {m.guide_title()}
      </h2>
      <ol {...props(styles.steps)} aria-labelledby={title} ref={steps} role="list">
        {STEPS.map((id, index) => (
          <Step
            current={id === current}
            done={progress.done.includes(id)}
            grabbed={progress.grabbed}
            id={id}
            key={id}
            live={live}
            number={index + 1}
          />
        ))}
      </ol>
      {finished && (
        <div {...props(styles.finished)}>
          <p {...props(styles.finishedLine)}>{m.guide_finished()}</p>
          {install}
        </div>
      )}
      <span {...props(styles.hidden)} aria-live="polite">
        {said}
      </span>
      <div
        {...props(styles.bar, live && styles.barMove, live && !inView && !parted && styles.barOn)}
        aria-hidden="true"
      >
        <div {...props(styles.barPanel)}>
          <div {...props(styles.barRow)}>
            {current === undefined ? (
              m.guide_all_done()
            ) : (
              <>
                <span {...props(styles.barCount)}>
                  {m.guide_count({ step: String(STEPS.indexOf(current) + 1) })}
                </span>
                <span>{withKeys(VIEWS[current].line())}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

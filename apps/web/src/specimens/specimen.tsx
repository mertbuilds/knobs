import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import type { LucideIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { type Demo, pressDemo, useDemoOn } from './demos.ts';

// One icon size and stroke for the page, so they sit with its regular weight.
export const ICON = { 'aria-hidden': true, size: 16, strokeWidth: 1.5 } as const;

// Holds a row's line open before its value is read, so the card never grows.
export const BLANK = ' ';

/**
 * What every specimen card is made of. A small panel: hairline, 13 round, rows
 * 4 inside it, so 8 round. Every edge is a logical one, so a right to left
 * language mirrors the card.
 */
export const cardStyles = create({
  // A state with no rows, such as an empty one, in the room the rows take.
  block: {
    alignContent: 'center',
    display: 'grid',
    paddingBlock: spacing.s1,
    paddingInline: '10px 8px',
  },
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    display: 'grid',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
    gap: 1,
    lineHeight: '20px',
    margin: 0,
    maxWidth: 400,
    padding: spacing.s1,
  },
  end: {
    flexGrow: 1,
    margin: 0,
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'end',
  },
  quiet: {
    color: colors.muted,
  },
  // One line tall with nothing in it yet: 20 of text and 4 above and below.
  row: {
    alignItems: 'baseline',
    borderRadius: radius.row,
    columnGap: spacing.s2,
    display: 'flex',
    minHeight: 28,
    paddingBlock: spacing.s1,
    paddingInline: '10px 8px',
  },
  rule: {
    backgroundColor: colors.border,
    height: 1,
    marginBlock: spacing.s1,
    marginInline: '10px 8px',
  },
  start: {
    margin: 0,
    minWidth: 0,
  },
});

const styles = create({
  // The panel's preset chip: the track ground, raised with its lift on hover.
  chip: {
    backgroundColor: {
      ':hover': colors.raised,
      default: colors.track,
    },
    borderRadius: radius.base,
    borderStyle: 'none',
    boxShadow: {
      ':hover': shadow.lift,
      default: 'none',
    },
    color: colors.fg,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    height: 28,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: 0,
    paddingInline: '10px',
    transitionDuration: '120ms',
    transitionProperty: 'background-color, box-shadow',
    transitionTimingFunction: 'ease-out',
  },
  // A chip whose knob is on stays on the raised ground. The weight never changes.
  chipOn: {
    backgroundColor: colors.raised,
    boxShadow: shadow.lift,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  // An icon sits a step closer to the edge than a letter does.
  chipWithIcon: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'inline-flex',
    paddingInline: '8px 10px',
  },
  head: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
  },
  label: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'inline-flex',
    fontSize: 13,
    fontWeight: font.weightMedium,
    margin: 0,
  },
  scene: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  },
  specimen: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s3,
  },
});

/**
 * A button that turns one knob. Where that knob has a value to be at, the chip
 * says so with its pressed state, and a second press turns the knob back off.
 */
export function Chip({
  demo,
  icon: Icon,
  label,
}: {
  demo: Demo;
  icon?: LucideIcon;
  label: string;
}) {
  const on = useDemoOn(demo);
  return (
    <button
      {...props(
        styles.chip,
        Icon !== undefined && styles.chipWithIcon,
        on === true && styles.chipOn,
      )}
      aria-pressed={on}
      onClick={() => pressDemo(demo)}
      type="button"
    >
      {Icon !== undefined && <Icon {...ICON} />}
      {label}
    </button>
  );
}

/** One line of a card: what it is at the start, and its value at the end. */
export function Row({
  end,
  quiet = false,
  start,
}: {
  end?: ReactNode;
  quiet?: boolean;
  start: ReactNode;
}) {
  return (
    <div {...props(cardStyles.row)}>
      <span {...props(cardStyles.start, quiet && cardStyles.quiet)}>{start}</span>
      {end !== undefined && <span {...props(cardStyles.end)}>{end}</span>}
    </div>
  );
}

/**
 * The frame every use case sits in: a calm label, one sentence that names the
 * real case, the piece of product that reads the browser, and the chips that
 * turn its knob.
 */
export function Specimen({
  children,
  chips,
  icon: Icon,
  label,
  scene,
}: {
  children?: ReactNode;
  chips: ReactNode;
  icon: LucideIcon;
  label: string;
  scene: string;
}) {
  return (
    <div {...props(styles.specimen)}>
      <div {...props(styles.head)}>
        <h3 {...props(styles.label)}>
          <Icon {...ICON} />
          {label}
        </h3>
        <p {...props(styles.scene)}>{scene}</p>
      </div>
      {children}
      <div {...props(styles.chips)} aria-label={label} role="group">
        {chips}
      </div>
    </div>
  );
}

/**
 * The language tag to format the page's own English sentences with: the one
 * the page reads when that is English, so the region still shows, and plain
 * English otherwise. Only the receipt speaks other languages.
 */
export function pageTag(): string {
  const tag = navigator.language;
  return tag.toLowerCase().startsWith('en') ? tag : 'en';
}

/**
 * What a specimen reads from the browser, read again on a timer and when the
 * language changes. Null on the server and on the first client render, so
 * hydration matches. `read` is a function of the module, the same one each
 * render.
 */
export function useReading<T>(read: () => T, every = 1000): T | null {
  const [reading, setReading] = useState<T | null>(null);
  useEffect(() => {
    const update = () => setReading(read());
    update();
    const timer = setInterval(update, every);
    window.addEventListener('languagechange', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('languagechange', update);
    };
  }, [read, every]);
  return reading;
}

import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, keyframes, props } from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { Card, Line, Row, Rows, Swatches } from '../lib/card.tsx';
import { live, mediaValue, onMedia, useInView, useLive } from '../lib/live.ts';
import { m } from '../paraglide/messages.js';

const MORE_CONTRAST = '@media (prefers-contrast: more)';
const LESS_MOTION = '@media (prefers-reduced-motion: reduce)';
const LESS_GLASS = '@media (prefers-reduced-transparency: reduce)';

// The dot's width, which its slide stops short of the track's end by.
const DOT = 12;

const slide = keyframes({
  from: { insetInlineStart: 0 },
  to: { insetInlineStart: `calc(100% - ${DOT}px)` },
});

const styles = create({
  // Muted at rest, the ink where the visitor asks for more contrast.
  contrast: {
    color: {
      default: colors.muted,
      [MORE_CONTRAST]: colors.fg,
    },
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    margin: 0,
  },
  dot: {
    backgroundColor: colors.fg,
    borderRadius: '50%',
    height: DOT,
    insetBlockStart: 0,
    insetInlineStart: 0,
    position: 'absolute',
    width: DOT,
  },
  // Only once the card is in view, and never where less motion is asked for.
  dotMoving: {
    animationDirection: 'alternate',
    animationDuration: '1600ms',
    animationIterationCount: 'infinite',
    animationName: {
      default: slide,
      [LESS_MOTION]: 'none',
    },
    animationTimingFunction: 'ease-in-out',
  },
  // A plate over half of the words: see-through, and solid where less transparency is asked for.
  glass: {
    backdropFilter: {
      default: 'blur(3px)',
      [LESS_GLASS]: 'none',
    },
    backgroundColor: {
      default: `color-mix(in srgb, ${colors.raised} 45%, transparent)`,
      [LESS_GLASS]: colors.raised,
    },
    borderRadius: radius.base,
    insetBlock: 0,
    insetInlineEnd: 0,
    position: 'absolute',
    width: '50%',
  },
  glassWords: {
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    margin: 0,
    paddingBlock: spacing.s2,
    paddingInline: spacing.s2,
  },
  over: {
    position: 'relative',
  },
  sample: {
    fontSize: font.sizeMd,
    lineHeight: 1.2,
    margin: 0,
  },
  // Test colors for the vision filters, not the site's palette: a red and a green that the
  // filters bring together, and the hues between and after them.
  spectrum: {
    backgroundImage:
      'linear-gradient(to right, #e5484d, #f76b15, #ffc53d, #46a758, #12a594, #0090ff, #8e4ec6, #e93d82)',
    borderRadius: radius.base,
    height: 24,
  },
  swatchAccent: { backgroundColor: colors.accent },
  swatchBg: { backgroundColor: colors.bg },
  swatchBorder: { backgroundColor: colors.border },
  swatchFg: { backgroundColor: colors.fg },
  swatchMuted: { backgroundColor: colors.muted },
  swatchRaised: { backgroundColor: colors.raised },
  swatchTrack: { backgroundColor: colors.track },
  track: {
    backgroundColor: colors.track,
    borderRadius: DOT / 2,
    height: DOT,
    position: 'relative',
  },
});

const scheme = live(
  () => mediaValue('prefers-color-scheme', ['dark', 'light']),
  onMedia('(prefers-color-scheme: dark)'),
);

/** The page's own colors, which follow the scheme. */
export function SchemeCard() {
  return (
    <Card title={m.knob_scheme()}>
      <Rows>
        <Row name={m.read_scheme()} value={useLive(scheme)} />
      </Rows>
      <Swatches
        fills={[
          styles.swatchBg,
          styles.swatchRaised,
          styles.swatchTrack,
          styles.swatchBorder,
          styles.swatchMuted,
          styles.swatchFg,
          styles.swatchAccent,
        ]}
      />
    </Card>
  );
}

const contrast = live(
  () =>
    mediaValue('prefers-contrast', ['more', 'less', 'custom', 'no-preference']) ?? m.read_none(),
  onMedia('(prefers-contrast: more)', '(prefers-contrast: less)', '(prefers-contrast: custom)'),
);

export function ContrastCard() {
  return (
    <Card title={m.knob_contrast()}>
      <Rows>
        <Row name={m.read_contrast()} value={useLive(contrast)} />
      </Rows>
      <p {...props(styles.contrast)}>{m.contrast_sample()}</p>
    </Card>
  );
}

const transparency = live(
  // Safari and Firefox do not know this one, and say so by matching neither value.
  () => mediaValue('prefers-reduced-transparency', ['reduce', 'no-preference']) ?? m.read_none(),
  onMedia('(prefers-reduced-transparency: reduce)'),
);

export function TransparencyCard() {
  return (
    <Card title={m.knob_transparency()}>
      <Rows>
        <Row name={m.read_transparency()} value={useLive(transparency)} />
      </Rows>
      <div {...props(styles.over)}>
        <p {...props(styles.glassWords)}>{m.transparency_sample()}</p>
        <span {...props(styles.glass)} aria-hidden="true" />
      </div>
    </Card>
  );
}

/** Nothing to read here: the filter is drawn over the page, and the page never knows. */
export function VisionCard() {
  return (
    <Card title={m.knob_vision()}>
      <div {...props(styles.spectrum)} aria-hidden="true" />
      <Line>{m.vision_line()}</Line>
    </Card>
  );
}

const motion = live(
  () => mediaValue('prefers-reduced-motion', ['reduce', 'no-preference']),
  onMedia('(prefers-reduced-motion: reduce)'),
);

/** One real animation, for the motion and speed knobs and for "replay animations". */
export function MotionCard() {
  const card = useRef<HTMLElement>(null);
  const inView = useInView(card);
  return (
    <Card ref={card} title={m.knob_motion()}>
      <Rows>
        <Row name={m.read_motion()} value={useLive(motion)} />
      </Rows>
      <div {...props(styles.track)} aria-hidden="true">
        <span {...props(styles.dot, inView && styles.dotMoving)} />
      </div>
    </Card>
  );
}

type TextRead = { leading: string; root: string; spacing: string };

/**
 * A line set in rem, and what the browser made of it. Text size moves the root
 * size and text spacing the line's own metrics; either one resizes the line,
 * which is what tells the card to read again.
 */
export function TextCard() {
  const sample = useRef<HTMLParagraphElement>(null);
  const [read, setRead] = useState<TextRead | null>(null);
  useEffect(() => {
    const line = sample.current;
    if (line === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(line);
      setRead({
        leading: style.lineHeight,
        root: getComputedStyle(document.documentElement).fontSize,
        spacing: style.letterSpacing,
      });
    });
    observer.observe(line);
    return () => observer.disconnect();
  }, []);
  return (
    <Card title={m.knob_text()}>
      <p {...props(styles.sample)} ref={sample}>
        {m.text_sample()}
      </p>
      <Rows>
        <Row name={m.read_root_size()} value={read?.root ?? null} />
        <Row name={m.read_line_height()} value={read?.leading ?? null} />
        <Row name={m.read_letter_spacing()} value={read?.spacing ?? null} />
      </Rows>
    </Card>
  );
}

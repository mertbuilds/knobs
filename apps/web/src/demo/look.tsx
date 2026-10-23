import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, keyframes, props } from '@stylexjs/stylex';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Card, Line, Row, Rows } from '../lib/card.tsx';
import { ICON } from '../lib/icon.ts';
import { live, mediaValue, onMedia, useInView, useLive } from '../lib/live.ts';
import { m } from '../paraglide/messages.js';

const DARK = '@media (prefers-color-scheme: dark)';
const MORE_CONTRAST = '@media (prefers-contrast: more)';
const LESS_MOTION = '@media (prefers-reduced-motion: reduce)';
const LESS_GLASS = '@media (prefers-reduced-transparency: reduce)';

// Illustration colors, not the site's palette: the transparency card's picture,
// and the vision card's red and green, which the filters bring together.
const ART = {
  green: '#46a758',
  hill: '#2f8f63',
  hillFar: '#5fb88a',
  red: '#e5484d',
  sky: 'linear-gradient(160deg, #ff9a62, #ff5e8a 50%, #7a5cff)',
  star: '#fff3c4',
  sun: '#ffe08a',
};

const MOON = 12;
const ORBIT = 72;
const PILL = 80;

const orbit = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const breathe = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0.3 },
});

const fill = keyframes({
  '0%': { opacity: 1, width: '0%' },
  '100%': { opacity: 0, width: '100%' },
  '60%': { opacity: 1, width: '100%' },
  '85%': { opacity: 1, width: '100%' },
});

const styles = create({
  actions: {
    display: 'flex',
    gap: spacing.s2,
  },
  // The scheme card's app, in the page's own colors, which follow the scheme.
  app: {
    backgroundColor: colors.bg,
    borderRadius: radius.base,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    padding: spacing.s2,
  },
  appBar: {
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    color: colors.muted,
    display: 'flex',
    gap: spacing.s2,
    paddingBlock: 6,
    paddingInline: spacing.s2,
  },
  arm: {
    inset: 0,
    position: 'absolute',
  },
  // Only once the card is in view. Less motion stills the orbit and lets the moon fade instead.
  armMoving: {
    animationDuration: '2400ms',
    animationIterationCount: 'infinite',
    animationName: { default: orbit, [LESS_MOTION]: 'none' },
    animationTimingFunction: 'linear',
  },
  article: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
  },
  avatar: {
    backgroundColor: colors.accent,
    borderRadius: '50%',
    flexShrink: 0,
    height: 20,
    width: 20,
  },
  bar: {
    borderRadius: 3,
    display: 'block',
    height: 6,
  },
  barInk: { backgroundColor: colors.fg, width: '40%' },
  barLong: { backgroundColor: colors.border, width: '90%' },
  bars: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: spacing.s1,
  },
  barShort: { backgroundColor: colors.border, width: '65%' },
  barSoft: { backgroundColor: colors.muted, width: '25%' },
  body: {
    color: colors.muted,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    margin: 0,
  },
  chart: {
    display: 'block',
    height: 72,
    width: '100%',
  },
  // A button of a scene, not a control: the stage's only buttons start something.
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.base,
    fontSize: font.sizeXs,
    lineHeight: 1.5,
    paddingBlock: 2,
    paddingInline: 10,
  },
  chipInk: { backgroundColor: colors.fg, color: colors.bg },
  chipQuiet: { backgroundColor: colors.track, color: colors.fg },
  fill: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    display: 'block',
    height: '100%',
    width: '60%',
  },
  fillMoving: {
    animationDuration: '2400ms',
    animationIterationCount: 'infinite',
    animationName: { default: fill, [LESS_MOTION]: 'none' },
    animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  frost: {
    alignItems: 'center',
    backdropFilter: { default: 'blur(10px)', [LESS_GLASS]: 'none' },
    backgroundColor: {
      default: `color-mix(in srgb, ${colors.raised} 45%, transparent)`,
      [LESS_GLASS]: colors.raised,
    },
    color: colors.fg,
    display: 'flex',
    fontSize: font.sizeXs,
    gap: spacing.s2,
    insetBlockStart: 0,
    insetInline: 0,
    lineHeight: 1.5,
    paddingBlock: 6,
    paddingInline: spacing.s2,
    position: 'absolute',
  },
  frostDot: {
    backgroundColor: colors.fg,
    borderRadius: '50%',
    height: 6,
    opacity: 0.5,
    width: 6,
  },
  frostTitle: { flexGrow: 1 },
  grid: { stroke: colors.border },
  heading: {
    fontSize: font.sizeSm,
    fontWeight: font.weightMedium,
    lineHeight: 1.4,
    margin: 0,
  },
  helper: {
    color: { default: colors.disabled, [MORE_CONTRAST]: colors.fg },
    fontSize: font.sizeXs,
    lineHeight: 1.5,
    margin: 0,
  },
  inDark: { display: { [DARK]: 'block', default: 'none' } },
  inLight: { display: { [DARK]: 'none', default: 'block' } },
  // The contrast card's form: its quiet parts get stronger where more contrast is asked for.
  input: {
    '::placeholder': {
      color: { default: colors.disabled, [MORE_CONTRAST]: colors.muted },
    },
    backgroundColor: colors.raised,
    borderColor: { default: colors.border, [MORE_CONTRAST]: colors.fg },
    borderRadius: radius.base,
    borderStyle: 'solid',
    borderWidth: 1,
    boxSizing: 'border-box',
    color: colors.fg,
    fontFamily: 'inherit',
    // 16px, so a phone's browser does not zoom in on focus.
    fontSize: font.sizeMd,
    lineHeight: 1.5,
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s1,
    paddingInline: spacing.s2,
    width: '100%',
  },
  key: {
    alignItems: 'center',
    color: colors.muted,
    display: 'flex',
    gap: 6,
  },
  keyGreen: { backgroundColor: ART.green },
  keyMark: {
    borderRadius: '50%',
    height: 8,
    width: 8,
  },
  keyRed: { backgroundColor: ART.red },
  label: {
    color: { default: colors.muted, [MORE_CONTRAST]: colors.fg },
    display: 'flex',
    flexDirection: 'column',
    fontSize: font.sizeXs,
    gap: spacing.s1,
    lineHeight: 1.5,
  },
  legend: {
    columnGap: spacing.s3,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: font.sizeXs,
    lineHeight: 1.5,
  },
  lineGreen: { stroke: ART.green },
  lineRed: { stroke: ART.red },
  moon: {
    backgroundColor: colors.fg,
    borderRadius: '50%',
    height: MOON,
    insetBlockStart: 4,
    insetInlineStart: (ORBIT - MOON) / 2,
    position: 'absolute',
    width: MOON,
  },
  moonMoving: {
    animationDirection: 'alternate',
    animationDuration: '1600ms',
    animationIterationCount: 'infinite',
    animationName: { default: 'none', [LESS_MOTION]: breathe },
    animationTimingFunction: 'ease-in-out',
  },
  motion: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s4,
  },
  // A picture under a frosted bar, which turns solid where less transparency is asked for.
  picture: {
    backgroundColor: ART.hill,
    backgroundImage: [
      `radial-gradient(circle at 28% 16%, ${ART.sun} 0 18px, transparent 19px)`,
      `radial-gradient(circle at 62% 10%, ${ART.star} 0 5px, transparent 6px)`,
      `radial-gradient(circle at 80% 22%, ${ART.star} 0 3px, transparent 4px)`,
      `radial-gradient(ellipse 60% 40% at 15% 100%, ${ART.hill} 0 98%, transparent 100%)`,
      `radial-gradient(ellipse 70% 45% at 85% 100%, ${ART.hillFar} 0 98%, transparent 100%)`,
      ART.sky,
    ].join(', '),
    borderRadius: radius.base,
    height: 112,
    overflow: 'hidden',
    position: 'relative',
  },
  send: {
    backgroundColor: { default: colors.track, [MORE_CONTRAST]: colors.fg },
    color: { default: colors.muted, [MORE_CONTRAST]: colors.bg },
  },
  sky: {
    backgroundColor: colors.track,
    borderRadius: '50%',
    flexShrink: 0,
    height: ORBIT,
    position: 'relative',
    width: ORBIT,
  },
  sun: {
    backgroundColor: colors.accent,
    borderRadius: '50%',
    height: 16,
    insetBlockStart: (ORBIT - 16) / 2,
    insetInlineStart: (ORBIT - 16) / 2,
    position: 'absolute',
    width: 16,
  },
  tag: {
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    color: colors.muted,
    fontSize: font.sizeXs,
    lineHeight: 1.5,
    paddingBlock: 1,
    paddingInline: 6,
  },
  // Set in px, so it holds its width while its words grow, and cuts them off.
  tagFixed: {
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: PILL,
  },
  tags: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.s1,
  },
  track: {
    backgroundColor: colors.track,
    borderRadius: 4,
    flexGrow: 1,
    height: 8,
    overflow: 'hidden',
  },
});

const scheme = live(
  () => mediaValue('prefers-color-scheme', ['dark', 'light']),
  onMedia('(prefers-color-scheme: dark)'),
);

/** A small app in the page's own colors, which follow the scheme. */
export function SchemeCard() {
  return (
    <Card title={m.knob_scheme()}>
      <div {...props(styles.app)} aria-hidden="true">
        <div {...props(styles.appBar)}>
          <span {...props(styles.avatar)} />
          <span {...props(styles.bars)}>
            <span {...props(styles.bar, styles.barInk)} />
            <span {...props(styles.bar, styles.barSoft)} />
          </span>
          <SunIcon {...ICON} {...props(styles.inLight)} />
          <MoonIcon {...ICON} {...props(styles.inDark)} />
        </div>
        <span {...props(styles.bar, styles.barLong)} />
        <span {...props(styles.bar, styles.barShort)} />
        <span {...props(styles.chip, styles.chipInk)}>{m.scheme_follow()}</span>
      </div>
      <Rows>
        <Row name={m.read_scheme()} value={useLive(scheme)} />
      </Rows>
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
      <div {...props(styles.form)}>
        <label {...props(styles.label)}>
          {m.contrast_label()}
          <input
            {...props(styles.input)}
            autoComplete="off"
            placeholder={m.contrast_placeholder()}
            type="email"
          />
        </label>
        <p {...props(styles.helper)}>{m.contrast_helper()}</p>
        <span {...props(styles.chip, styles.send)} aria-hidden="true">
          {m.contrast_send()}
        </span>
      </div>
      <Rows>
        <Row name={m.read_contrast()} value={useLive(contrast)} />
      </Rows>
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
      <div {...props(styles.picture)} aria-hidden="true">
        <div {...props(styles.frost)}>
          <span {...props(styles.frostTitle)}>{m.transparency_title()}</span>
          <span {...props(styles.frostDot)} />
          <span {...props(styles.frostDot)} />
        </div>
      </div>
      <Rows>
        <Row name={m.read_transparency()} value={useLive(transparency)} />
      </Rows>
    </Card>
  );
}

const SALES = '0,40 20,34 40,36 60,24 80,26 100,14 120,10';
const RETURNS = '0,30 20,32 40,22 60,28 80,18 100,22 120,16';

/** Nothing to read here: the filter is drawn over the page, and the page never knows. */
export function VisionCard() {
  return (
    <Card title={m.knob_vision()}>
      <svg
        {...props(styles.chart)}
        aria-hidden="true"
        fill="none"
        preserveAspectRatio="none"
        viewBox="0 0 120 48"
      >
        {[8, 24, 40].map((y) => (
          <line
            {...props(styles.grid)}
            key={y}
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2="120"
            y1={y}
            y2={y}
          />
        ))}
        <polyline
          {...props(styles.lineRed)}
          points={RETURNS}
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          {...props(styles.lineGreen)}
          points={SALES}
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div {...props(styles.legend)}>
        <span {...props(styles.key)}>
          <span {...props(styles.keyMark, styles.keyGreen)} />
          {m.vision_sales()}
        </span>
        <span {...props(styles.key)}>
          <span {...props(styles.keyMark, styles.keyRed)} />
          {m.vision_returns()}
        </span>
      </div>
      <Line>{m.vision_line()}</Line>
    </Card>
  );
}

const motion = live(
  () => mediaValue('prefers-reduced-motion', ['reduce', 'no-preference']),
  onMedia('(prefers-reduced-motion: reduce)'),
);

/**
 * The stage's one animation, for the motion and speed knobs and for "replay
 * animations". The speed knob sets each animation's rate, which has no event,
 * so the card looks again while the animation runs.
 */
export function MotionCard() {
  const card = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const inView = useInView(card);
  const [rate, setRate] = useState<string | null>(null);
  useEffect(() => {
    const element = scene.current;
    if (!inView || element === null) {
      return;
    }
    const read = () => {
      const animation = element.getAnimations({ subtree: true })[0];
      setRate(animation === undefined ? m.read_none() : String(animation.playbackRate));
    };
    read();
    const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  }, [inView]);
  return (
    <Card ref={card} title={m.knob_motion()}>
      <div {...props(styles.motion)} aria-hidden="true" ref={scene}>
        <span {...props(styles.sky)}>
          <span {...props(styles.sun)} />
          <span {...props(styles.arm, inView && styles.armMoving)}>
            <span {...props(styles.moon, inView && styles.moonMoving)} />
          </span>
        </span>
        <span {...props(styles.track)}>
          <span {...props(styles.fill, inView && styles.fillMoving)} />
        </span>
      </div>
      <Rows>
        <Row name={m.read_motion()} value={useLive(motion)} />
        <Row name={m.read_rate()} value={rate} />
      </Rows>
    </Card>
  );
}

type TextRead = { root: string; spacing: string };

/**
 * An article set in rem, and what the browser made of it. Text size moves the
 * root size and text spacing the text's own metrics; either one resizes the
 * article, which is what tells the card to read again.
 */
export function TextCard() {
  const article = useRef<HTMLDivElement>(null);
  const sample = useRef<HTMLParagraphElement>(null);
  const [read, setRead] = useState<TextRead | null>(null);
  useEffect(() => {
    const box = article.current;
    const line = sample.current;
    if (box === null || line === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setRead({
        root: getComputedStyle(document.documentElement).fontSize,
        spacing: getComputedStyle(line).letterSpacing,
      });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <Card title={m.knob_text()}>
      <div {...props(styles.article)} ref={article}>
        <p {...props(styles.heading)}>{m.text_title()}</p>
        <p {...props(styles.body)} ref={sample}>
          {m.text_sample()}
        </p>
        <div {...props(styles.actions)} aria-hidden="true">
          <span {...props(styles.chip, styles.chipInk)}>{m.text_save()}</span>
          <span {...props(styles.chip, styles.chipQuiet)}>{m.text_share()}</span>
        </div>
        <div {...props(styles.tags)}>
          <span {...props(styles.tag)}>{m.text_tag_flexible()}</span>
          <span {...props(styles.tag, styles.tagFixed)}>{m.text_tag_fixed()}</span>
        </div>
      </div>
      <Rows>
        <Row name={m.read_root_size()} value={read?.root ?? null} />
        <Row name={m.read_letter_spacing()} value={read?.spacing ?? null} />
      </Rows>
    </Card>
  );
}

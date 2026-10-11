import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { Card, Line, Swatches } from '../lib/card.tsx';
import { withKeys } from '../lib/keys.tsx';
import { m } from '../paraglide/messages.js';

// The page's one breakpoint, as `routes/index.tsx` has it.
const WIDE = '@media (min-width: 640px)';

const styles = create({
  // A box model worth reading: 12 of margin, a 4 border and 12 of padding, each a different ground.
  box: {
    backgroundColor: colors.raised,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: 4,
    margin: spacing.s3,
    padding: spacing.s3,
  },
  boxGround: {
    backgroundColor: colors.track,
    borderRadius: radius.base,
    display: 'flow-root',
  },
  // Six colors, each written another way. Test colors, not the site's palette.
  colorHex: { backgroundColor: '#e5484d' },
  colorHsl: { backgroundColor: 'hsl(206 100% 50%)' },
  colorMix: { backgroundColor: `color-mix(in srgb, ${colors.accent} 40%, ${colors.fg})` },
  colorNamed: { backgroundColor: 'gold' },
  colorOklch: { backgroundColor: 'oklch(0.7 0.15 300)' },
  colorRgb: { backgroundColor: 'rgb(48 164 108)' },
  // The demo font has one glyph, a box for the capital A. Every other letter falls back.
  fontSample: {
    fontFamily: `'knobs specimen', ${font.mono}`,
  },
  // The font and the spacing are set here, and the span inside inherits them.
  inherits: {
    fontFamily: font.mono,
    letterSpacing: '0.04em',
  },
  // One declaration at rest and another on a wide screen, which overrides it.
  media: {
    color: {
      default: colors.muted,
      [WIDE]: colors.fg,
    },
  },
  pseudo: {
    '::before': {
      color: colors.muted,
      content: '"::before "',
      fontFamily: font.mono,
    },
  },
  specimen: {
    fontSize: '0.8125rem',
    lineHeight: 1.5,
  },
  specimens: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
});

/**
 * Elements worth picking with grab and inspect: a box with margin, border and
 * padding, a web font with a fallback, colors in six formats, a pseudo element,
 * a media query that overrides a declaration, and an inherited value.
 */
export function PickCard() {
  return (
    <Card title={m.knob_pick()}>
      <Line>{withKeys(m.pick_line())}</Line>
      <ul {...props(styles.specimens)}>
        <li {...props(styles.specimen, styles.boxGround)}>
          <div {...props(styles.box)}>{m.pick_box()}</div>
        </li>
        <li {...props(styles.specimen, styles.fontSample)}>{m.pick_font()}</li>
        <li>
          <Swatches
            fills={[
              styles.colorHex,
              styles.colorRgb,
              styles.colorHsl,
              styles.colorOklch,
              styles.colorNamed,
              styles.colorMix,
            ]}
          />
        </li>
        <li {...props(styles.specimen, styles.pseudo)}>{m.pick_pseudo()}</li>
        <li {...props(styles.specimen, styles.media)}>{m.pick_media()}</li>
        <li {...props(styles.specimen, styles.inherits)}>
          {m.pick_inherit_parent()} <span>{m.pick_inherit_child()}</span>
        </li>
      </ul>
    </Card>
  );
}

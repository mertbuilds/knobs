import { colors, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import type { ComponentProps } from 'react';

const styles = create({
  // The page's key chip as a button: a hairline box, nothing else.
  chip: {
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
});

/** The page's small button, the one that starts the tour and opens the demo layers. */
export function Chip({
  style,
  ...rest
}: Omit<ComponentProps<'button'>, 'className' | 'style' | 'type'> & { style?: StyleXStyles }) {
  return <button {...props(styles.chip, style)} type="button" {...rest} />;
}

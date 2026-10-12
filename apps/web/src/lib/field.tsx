import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import type { ComponentProps, ReactNode } from 'react';

const styles = create({
  // A field's control, 4 inside its row, so 4 round.
  control: {
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    borderStyle: 'none',
    boxSizing: 'border-box',
    color: colors.fg,
    fontFamily: 'inherit',
    // 16px, so a phone's browser does not zoom in on focus.
    fontSize: font.sizeMd,
    lineHeight: '1.5rem',
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
  // A panel row, 8 round, with its label over its control.
  field: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    padding: spacing.s1,
  },
  name: {
    color: colors.muted,
    paddingInline: 6,
    paddingTop: 2,
  },
});

/** The page's field: a card row with the label over its control. */
export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label {...props(styles.field)}>
      <span {...props(styles.name)}>{label}</span>
      {children}
    </label>
  );
}

/** A field's text control. */
export function Input(rest: Omit<ComponentProps<'input'>, 'className' | 'style'>) {
  return <input {...props(styles.control)} {...rest} />;
}

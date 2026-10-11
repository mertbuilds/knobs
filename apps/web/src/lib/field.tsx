import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import type { ComponentProps, ReactNode } from 'react';

const styles = create({
  // A field's control, 4 inside its row, so 4 round.
  control: {
    '::placeholder': {
      color: colors.muted,
      opacity: 1,
    },
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    borderStyle: 'none',
    boxSizing: 'border-box',
    color: colors.fg,
    fontFamily: 'inherit',
    // 16px, so a phone's browser does not zoom in on focus.
    fontSize: font.sizeMd,
    lineHeight: '1.5rem',
    minWidth: 0,
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
  // A panel row, 8 round, with its label over its control and what acts on it beside the control.
  field: {
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderRadius: radius.row,
    columnGap: spacing.s1,
    display: 'flex',
    padding: spacing.s1,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: spacing.s1,
    minWidth: 0,
  },
  name: {
    color: colors.muted,
    paddingInline: 6,
    paddingTop: 2,
  },
  // The panel's chip as a button, as tall as the control beside it: the track ground, raised on hover.
  submit: {
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
    flexShrink: 0,
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    lineHeight: '1.5rem',
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    paddingBlock: spacing.s1,
    paddingInline: spacing.s3,
    transitionDuration: '120ms',
    transitionProperty: 'background-color, box-shadow',
    transitionTimingFunction: 'ease-out',
    whiteSpace: 'nowrap',
  },
});

/**
 * The page's field: a card row with the label over its control. `action` sits
 * beside the control, such as the button that sends a form.
 */
export function Field({
  action,
  children,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <div {...props(styles.field)}>
      <label {...props(styles.label)}>
        <span {...props(styles.name)}>{label}</span>
        {children}
      </label>
      {action}
    </div>
  );
}

/** A field's text control. */
export function Input(rest: Omit<ComponentProps<'input'>, 'className' | 'style'>) {
  return <input {...props(styles.control)} {...rest} />;
}

/** The button that sends a field's form. */
export function Submit(rest: Omit<ComponentProps<'button'>, 'className' | 'style' | 'type'>) {
  return <button {...props(styles.submit)} type="submit" {...rest} />;
}

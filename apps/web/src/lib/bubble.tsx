import { colors, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, firstThatWorks, props } from '@stylexjs/stylex';
import type { ReactNode } from 'react';

const styles = create({
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
    maxHeight: firstThatWorks('calc(100dvh - 16px)', 'calc(100vh - 16px)'),
    maxWidth: '100%',
    overflowY: 'auto',
    padding: spacing.s1,
  },
});

/** The page's small panel over a device's mat: the tour's last word. */
export function Bubble({ children }: { children: ReactNode }) {
  return <div {...props(styles.bubble)}>{children}</div>;
}

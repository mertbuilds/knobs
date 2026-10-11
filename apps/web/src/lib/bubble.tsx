import { colors, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, firstThatWorks, props } from '@stylexjs/stylex';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Offset, useDrag } from './drag.ts';
import { ICON } from './icon.ts';

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
    padding: spacing.s1,
  },
  // The whole bubble moves itself. No touch scroll starts on it, and a drag selects no text.
  drag: {
    cursor: 'grab',
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
  },
  // The panel's small icon button: faint, and the track ground on hover.
  toggle: {
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
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
    transitionTimingFunction: 'ease-out',
    width: 22,
  },
});

/**
 * The page's small panel over a device's mat: the tour's last word, and what an outside page in the frame says.
 * With `drag` it can be moved, by a drag on anything in it but a control (or a child marked `data-no-drag`) and
 * by the arrow keys while it has focus itself. `label` is its name as a group, `place` where it starts, and
 * `onPlace` hears where it was moved to.
 */
export function Bubble({
  children,
  drag,
}: {
  children: ReactNode;
  drag?: { label: string; onPlace?: (place: Offset) => void; place?: Offset };
}) {
  const { ref, surface } = useDrag<HTMLDivElement>({
    enabled: drag !== undefined,
    onPlace: drag?.onPlace,
    place: drag?.place,
  });
  return (
    <div
      {...props(styles.bubble, drag !== undefined && styles.drag)}
      {...(drag !== undefined && { 'aria-label': drag.label, role: 'group', tabIndex: 0 })}
      {...surface}
      ref={ref}
    >
      {children}
    </div>
  );
}

/** The bubble's control to minimize it to one row and to expand it again. `label` says which a press does. */
export function BubbleToggle({
  label,
  minimized,
  onToggle,
}: {
  label: string;
  minimized: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      {...props(styles.toggle)}
      aria-expanded={!minimized}
      aria-label={label}
      onClick={onToggle}
      type="button"
    >
      {minimized ? <ChevronUpIcon {...ICON} /> : <ChevronDownIcon {...ICON} />}
    </button>
  );
}

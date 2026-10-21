import { colors, radius } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import type { ReactNode } from 'react';

const styles = create({
  // The panel's key chip: a hairline box around the key, nothing else.
  key: {
    borderColor: colors.border,
    borderRadius: radius.base,
    borderStyle: 'solid',
    borderWidth: 1,
    boxSizing: 'border-box',
    display: 'inline-block',
    fontFamily: 'inherit',
    fontSize: '0.85em',
    lineHeight: 1.4,
    minWidth: '1.6em',
    paddingInline: 3,
    textAlign: 'center',
  },
});

export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd {...props(styles.key)} dir="ltr">
      {children}
    </kbd>
  );
}

/**
 * Text with keys in it, each written `[[key]]` in the message, drawn as the
 * panel's key chips.
 */
export function withKeys(text: string) {
  return text
    .split(/\[\[(.+?)\]\]/)
    .map((part, index) => (index % 2 === 1 ? <Key key={index}>{part}</Key> : part));
}

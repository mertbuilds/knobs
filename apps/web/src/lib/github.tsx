import { colors } from '@knobs/ui/tokens.stylex';
import { create, defaultMarker, props, when } from '@stylexjs/stylex';
import { m } from '../paraglide/messages.js';
import { track } from './analytics.ts';
import { GitHubMark } from './brand-marks.tsx';

export const REPO = 'https://github.com/mertbuilds/knobs';

const styles = create({
  // The header's GitHub button: the chip's hairline box around the mark, and the track ground on hover.
  github: {
    alignItems: 'center',
    backgroundColor: {
      ':hover': colors.track,
      default: 'transparent',
    },
    borderColor: colors.border,
    borderRadius: '0.25rem',
    borderStyle: 'solid',
    borderWidth: 1,
    boxSizing: 'border-box',
    display: 'flex',
    flexShrink: 0,
    height: '1.75rem',
    justifyContent: 'center',
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    transitionDuration: '120ms',
    transitionProperty: 'background-color',
    transitionTimingFunction: 'ease-out',
    width: '1.75rem',
  },
  // The mark's color, here and not on the link: the theme's global `a` rules outrank StyleX's.
  githubMark: {
    color: {
      default: colors.muted,
      [when.ancestor(':hover')]: colors.fg,
    },
    display: 'flex',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease-out',
  },
  // The page's 16px icon, in rem, so it grows with the text.
  glyph: {
    height: '1rem',
    width: '1rem',
  },
});

export const onGitHub = (placement: 'footer' | 'header') => () =>
  track('github_clicked', { placement });

/** The header's way to the code: the GitHub mark in a small hairline box. */
export function GitHubButton() {
  return (
    <a
      aria-label={m.link_github()}
      href={REPO}
      onClick={onGitHub('header')}
      rel="noreferrer"
      target="_blank"
      {...props(styles.github, defaultMarker())}
    >
      <span {...props(styles.githubMark)}>
        <GitHubMark style={styles.glyph} />
      </span>
    </a>
  );
}

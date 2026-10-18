import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import { createFileRoute, useLocation } from '@tanstack/react-router';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Stage } from '../demo/stage.tsx';
import { track } from '../lib/analytics.ts';
import { GitHubMark, KnobsMark, NpmMark } from '../lib/brand-marks.tsx';
import { ICON } from '../lib/icon.ts';
import { withKeys } from '../lib/keys.tsx';
import { m } from '../paraglide/messages.js';
import { mountKnobs, unmountKnobs } from '../tour/knobs.ts';
import { openTour, watchKnobs } from '../tour/progress.ts';
import { Tour } from '../tour/tour.tsx';

export const Route = createFileRoute('/')({
  component: import.meta.env.DEV ? DevPage : Landing,
});

// Dev-only: a reference image in place of the page (`src/dev/reference.tsx`),
// for `ref=<name>` in the address, on the top page and on the copy in a
// device's frame, which loads the same address. The server reads the same
// address, so both draw the same shell. A build drops all of this and the file
// with it, and reads no `ref`.
const Reference = import.meta.env.DEV ? lazy(() => import('../dev/reference.tsx')) : null;

function DevPage() {
  const name = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get('ref'),
  });
  // On the page itself, however it was reached, the top page gives back the
  // browser knob a reference page took.
  useEffect(() => {
    if (name === null && window.top === window) {
      void import('../dev/refscreen.ts').then(({ leaveReference }) => leaveReference());
    }
  }, [name]);
  return Reference !== null && name !== null && /^[a-z0-9-]+$/.test(name) ? (
    <Suspense>
      <Reference name={name} />
    </Suspense>
  ) : (
    <Landing />
  );
}

// The one breakpoint on the page. A device or a width puts the page in a frame
// that size, so these columns collapse the way they do on a real phone.
const WIDE = '@media (min-width: 640px)';

/** True once a visitor has turned a knob in this tab, so the stored state should apply at once. */
function hasStoredKnobs(): boolean {
  try {
    return sessionStorage.getItem('devknobs') !== null;
  } catch {
    return false;
  }
}

/**
 * Runs `task` when the browser is idle, at most a second after it is asked.
 * Safari has no `requestIdleCallback`, so a short timer stands in.
 */
function whenIdle(task: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(task, { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 200);
  return () => clearTimeout(id);
}

// The devknobs host element. Its shadow root is open, so a click inside the
// panel still reaches `document` with the real button in its composed path.
const PANEL = '[data-devknobs="panel"]';

const DOCS = 'https://github.com/mertbuilds/knobs/tree/main/packages/devknobs#readme';

const NOTICES =
  'https://github.com/mertbuilds/knobs/blob/main/packages/devknobs/THIRD_PARTY_NOTICES.md';

const styles = create({
  // A code box is a panel field: the card ground, 8 round, and the copy
  // button 4 inside it, so 4 round.
  code: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.row,
    columnGap: spacing.s1,
    display: 'flex',
    padding: spacing.s1,
  },
  codeText: {
    flexGrow: 1,
    fontFamily: font.mono,
    fontSize: '0.78125rem',
    lineHeight: '1.375rem',
    margin: 0,
    minWidth: 0,
    overflowX: 'auto',
    paddingBlock: 0,
    paddingInline: '8px',
    whiteSpace: 'pre',
  },
  // Words in place of the code: the page's font, not the code's, and a step larger.
  codeLabel: {
    fontFamily: font.family,
    fontSize: font.sizeSm,
  },
  // A second choice beside a first: the faint text, like the copy button.
  codeQuiet: {
    color: colors.muted,
  },
  // A long text, such as the install prompt, breaks instead of scrolling.
  codeWrap: {
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  // The panel's small icon button: faint, and the track ground on hover.
  copy: {
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
  // The maker, at the footer's right end, also on a line of its own where the links fill the width.
  // Only the name is the link; the words around it are muted, plain text.
  credit: {
    color: colors.muted,
    marginInlineStart: 'auto',
  },
  footer: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    columnGap: spacing.s6,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: '0.8125rem',
    paddingTop: spacing.s6,
    rowGap: spacing.s2,
  },
  hint: {
    color: colors.muted,
    fontSize: '0.8125rem',
    margin: 0,
  },
  // The setup prompt, then "or" and the npm command, on one row, centered on it. Each box hugs
  // its line; on a narrow screen the npm command and its "or" go under the prompt.
  install: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: spacing.s2,
  },
  // A box that shrinks to the row, never past it.
  installBox: {
    maxWidth: '100%',
    minWidth: 0,
  },
  // "or" and the npm command, kept together, the box free to shrink to the width.
  installOr: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    maxWidth: '100%',
    minWidth: 0,
  },
  // The footer's links' focus ring. Their color and underline are set in app.css, past the theme's
  // global `a` rules.
  link: {
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
  },
  // Read by screen readers, never drawn.
  live: {
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: 1,
  },
  page: {
    backgroundColor: colors.bg,
    color: colors.fg,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.family,
    fontSize: '0.9375rem',
    gap: spacing.s12,
    lineHeight: 1.6,
    marginInline: 'auto',
    maxWidth: 680,
    paddingBlock: {
      default: spacing.s12,
      [WIDE]: spacing.s16,
    },
    paddingInline: spacing.s4,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
  },
  // Small and calm, like the panel's own labels.
  sectionHeading: {
    color: colors.muted,
    fontSize: '0.8125rem',
    fontWeight: font.weightRegular,
    margin: 0,
  },
  text: {
    margin: 0,
  },
  // An icon beside its label, centered on the line, a fixed gap apart.
  withIcon: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'inline-flex',
  },
  // The mark beside the name, centered on its line.
  wordmark: {
    alignItems: 'center',
    columnGap: 6,
    display: 'flex',
    fontSize: '1.1875rem',
    fontWeight: font.weightMedium,
    letterSpacing: '-0.01em',
    margin: 0,
  },
});

/**
 * A code box with a copy button at its right edge. The code stays plain text,
 * selectable by hand. Where the clipboard refuses the write (an insecure
 * context, an old browser), the code is selected instead, ready to copy.
 * With `label`, the box shows the label in place of code too long to show,
 * and shows the code only where the clipboard refuses it. `quiet` draws it as
 * the second choice beside a first one: its text faint.
 */
function CodeBox({
  code,
  copyLabel,
  label,
  name,
  quiet = false,
  style,
  wrap = false,
}: {
  code: string;
  copyLabel: string;
  label?: string;
  name: string;
  quiet?: boolean;
  style?: StyleXStyles;
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // How many times the clipboard refused the code, each one selecting it once it shows.
  const [refused, setRefused] = useState(0);
  const showCode = label === undefined || refused > 0;
  const text = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (refused > 0 && text.current !== null) {
      getSelection()?.selectAllChildren(text.current);
    }
  }, [refused]);
  const copy = () => {
    track('copy_click', { snippet: name });
    // Inside a promise, so a missing `navigator.clipboard` rejects too.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(
        () => setCopied(true),
        () => setRefused((count) => count + 1),
      );
  };
  return (
    <div {...props(styles.code, style)}>
      <pre
        {...props(
          styles.codeText,
          wrap && styles.codeWrap,
          !showCode && styles.codeLabel,
          quiet && styles.codeQuiet,
        )}
        ref={text}
      >
        {showCode ? code : label}
      </pre>
      <button {...props(styles.copy)} aria-label={copyLabel} onClick={copy} type="button">
        {copied ? <CheckIcon {...ICON} /> : <CopyIcon {...ICON} />}
      </button>
      <span {...props(styles.live)} aria-live="polite">
        {copied ? m.copy_done() : ''}
      </span>
    </div>
  );
}

// The same prompt is in packages/devknobs/README.md under install; change both together.
function promptBox(name: string, style?: StyleXStyles) {
  return (
    <CodeBox
      code={m.install_prompt()}
      copyLabel={m.copy_install_prompt()}
      label={m.copy_install_prompt()}
      name={name}
      style={style}
      wrap
    />
  );
}

/** How to install, agent first: the setup prompt, then the npm command after a quiet "or". */
function installChoices() {
  return (
    <div {...props(styles.install)}>
      {promptBox('install_prompt', styles.installBox)}
      <div {...props(styles.installOr)}>
        <span {...props(styles.hint)}>{m.install_or()}</span>
        <CodeBox
          code={m.install_command()}
          copyLabel={m.copy_install()}
          name="install"
          quiet
          style={styles.installBox}
        />
      </div>
    </div>
  );
}

/**
 * A composed path is a list of `EventTarget`s: the shadow root, `document` and
 * `window` ride along with the elements. Only the elements answer `matches` and
 * `closest`, and only they carry a node type of their own.
 */
function asElement(node: EventTarget | undefined): Element | null {
  const element = node as Element | null | undefined;
  return element?.nodeType === Node.ELEMENT_NODE ? element : null;
}

/**
 * Every click on the page, read and reported: the footer links, and which knob
 * of the demo panel a visitor actually turns. It only observes. No
 * `preventDefault`, no `stopPropagation`, so the click behaves as it always did.
 */
function trackClick(event: MouseEvent) {
  const path = event.composedPath();
  const target = asElement(path[0]);
  if (target === null) {
    return;
  }
  if (path.some((node) => asElement(node)?.matches(PANEL) === true)) {
    // Buttons, and the search results, which are options rather than buttons.
    // The fields are inputs, and a click on the panel's own chrome hits nothing.
    const control = target.closest('button, [role="option"]');
    if (control === null) {
      return;
    }
    // A row and a result carry their value in a span of its own; the handle,
    // `×` and the switches carry it as text or an aria-label.
    const text = (control.querySelector('.row-label, .entry-value') ?? control).textContent?.trim();
    track('knob_click', {
      control:
        (text === undefined || text === '' ? control.getAttribute('aria-label') : text) ??
        undefined,
      // The knob inside an open row's editor, or the knob a search result sets.
      group: (
        control.closest('.knob')?.querySelector('.knob-label') ??
        control.querySelector('.entry-knob, .entry-name')
      )?.textContent?.trim(),
    });
    return;
  }
  const link = target.closest('a');
  if (link === null) {
    return;
  }
  track('link_click', { href: link.href, label: link.textContent?.trim() });
}

function Landing() {
  // The panel is the demo, so it runs here in every environment, not gated on
  // dev the way an app embedding devknobs would gate it. Client-only: `mount`
  // touches `document`, and SSR must never reach it. It starts collapsed to its
  // edge tab, and stays open across the reloads the device
  // and locale knobs cause once a visitor opens it. A first visit loads it when
  // the browser is idle; a reload with knobs already set loads it at once, so
  // the stored scheme or language does not wait.
  useEffect(() => {
    // Before the panel, so the copy of this page in a device's frame finds the
    // tour on the page above.
    const closeTour = openTour();
    const start = () => void mountKnobs().then(watchKnobs);
    let cancel: (() => void) | undefined;
    if (hasStoredKnobs()) {
      start();
    } else {
      cancel = whenIdle(start);
    }
    // One delegated listener for the whole page, panel included. Passive: it
    // never cancels the click it is reading.
    document.addEventListener('click', trackClick, { passive: true });
    return () => {
      cancel?.();
      document.removeEventListener('click', trackClick);
      closeTour();
      unmountKnobs();
    };
  }, []);

  return (
    <main {...props(styles.page)}>
      <header {...props(styles.section)}>
        <h1 {...props(styles.wordmark)}>
          <KnobsMark size={20} />
          {m.app_name()}
        </h1>
        <p {...props(styles.text)}>{m.tagline()}</p>
        {installChoices()}
        <p {...props(styles.hint)}>{withKeys(m.hero_hint())}</p>
      </header>

      <Tour install={promptBox('install_prompt_tour')} />

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.stage_title()}</h2>
        <p {...props(styles.text)}>{m.stage_line()}</p>
        <Stage />
      </section>

      <footer {...props(styles.footer)}>
        <a href={DOCS} {...props(styles.link)}>
          {m.link_docs()}
        </a>
        <a href="https://github.com/mertbuilds/knobs" {...props(styles.link, styles.withIcon)}>
          <GitHubMark />
          {m.link_github()}
        </a>
        <a href="https://www.npmjs.com/package/devknobs" {...props(styles.link, styles.withIcon)}>
          <NpmMark />
          {m.link_npm()}
        </a>
        {/* The licenses of grab's sources (react-grab, bippy) and the bezel images. */}
        <a href={NOTICES} {...props(styles.link)}>
          {m.link_notices()}
        </a>
        <span {...props(styles.credit)}>
          {m.link_mertbuilds_before()}{' '}
          <a
            href="https://mertbuilds.com/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=footer"
            {...props(styles.link)}
          >
            {m.link_mertbuilds()}
          </a>{' '}
          {m.link_mertbuilds_after()}
        </span>
      </footer>
    </main>
  );
}

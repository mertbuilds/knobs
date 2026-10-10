import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowUpRightIcon,
  BugIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CrosshairIcon,
  FoldHorizontalIcon,
  LanguagesIcon,
  PaletteIcon,
  PointerIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  SunMoonIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics.ts';
import { GitHubMark, NpmMark } from '../lib/brand-marks.tsx';
import { m } from '../paraglide/messages.js';
import { mountKnobs, runDemo, unmountKnobs } from '../specimens/demos.ts';
import { LanguageSpecimen } from '../specimens/language.tsx';
import { LocationSpecimen } from '../specimens/location.tsx';
import { Chip, ICON, Specimen } from '../specimens/specimen.tsx';
import { TimeSpecimen } from '../specimens/time.tsx';

export const Route = createFileRoute('/')({
  component: Landing,
});

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

const DUO_CREDIT = 'https://github.com/jadon7/iphone-duo';

const NOTICES = 'https://github.com/mertbuilds/devknobs/blob/main/THIRD_PARTY_NOTICES.md';

const styles = create({
  // The feature grid's own gap, so the line below it reads as a new block.
  afterFeatures: {
    marginTop: spacing.s2,
  },
  blocks: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s4,
  },
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
    fontSize: 12.5,
    lineHeight: '1.375rem',
    margin: 0,
    minWidth: 0,
    overflowX: 'auto',
    paddingBlock: 0,
    paddingInline: '8px',
    whiteSpace: 'pre',
  },
  // A long single line, such as a grab line, breaks instead of scrolling.
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
  feature: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    paddingBlock: '10px 12px',
    paddingInline: spacing.s3,
  },
  featureDetail: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  },
  featureName: {
    fontSize: 13,
    fontWeight: font.weightMedium,
  },
  features: {
    display: 'grid',
    gap: spacing.s2,
    gridTemplateColumns: {
      default: '1fr',
      [WIDE]: '1fr 1fr',
    },
    margin: 0,
  },
  footer: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    columnGap: spacing.s6,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: 13,
    paddingTop: spacing.s6,
    rowGap: spacing.s2,
  },
  // grab's own box, drawn still: half its blue for the line, a tint inside.
  grabBox: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${colors.accent} 50%, transparent)`,
    borderRadius: radius.base,
    borderStyle: 'solid',
    borderWidth: 1,
    fontSize: 19,
    fontWeight: font.weightMedium,
    letterSpacing: '-0.01em',
    lineHeight: 1.4,
    paddingBlock: 2,
    paddingInline: spacing.s1,
  },
  grabDemo: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: spacing.s4,
  },
  // grab's label bar: its tag in gray, then the component.
  grabPill: {
    alignItems: 'center',
    backgroundColor: colors.grabBar,
    borderRadius: radius.bar,
    color: colors.grabBarText,
    columnGap: 6,
    display: 'inline-flex',
    fontSize: 13,
    lineHeight: '1rem',
    paddingBlock: 6,
    paddingInline: spacing.s2,
  },
  grabTag: {
    color: colors.grabTag,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    margin: 0,
  },
  hintItem: {
    alignItems: 'center',
    columnGap: spacing.s1,
    display: 'inline-flex',
    whiteSpace: 'nowrap',
  },
  // The panel's footer row of key hints: a key chip and its word.
  hints: {
    alignItems: 'center',
    color: colors.muted,
    columnGap: spacing.s3,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: font.sizeXs,
    lineHeight: 1.4,
    margin: 0,
    padding: 0,
    rowGap: 6,
  },
  // Hugs the one short line instead of stretching an empty box across the hero.
  installCode: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  // The panel's key chip: a hairline box around the key, nothing else.
  kbd: {
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
  limits: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    margin: 0,
    paddingInlineStart: spacing.s4,
  },
  link: {
    color: {
      ':hover': colors.fg,
      default: colors.muted,
    },
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
    transitionDuration: '120ms',
    transitionProperty: 'color',
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
  note: {
    color: colors.muted,
    fontSize: 13,
    margin: 0,
  },
  page: {
    backgroundColor: colors.bg,
    color: colors.fg,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.family,
    fontSize: 15,
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
    fontSize: 13,
    fontWeight: font.weightRegular,
    margin: 0,
  },
  // A small panel: hairline, 13 round, rows 4 inside it, so 8 round.
  seen: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    display: 'grid',
    fontSize: 13,
    gap: 1,
    margin: 0,
    maxWidth: 400,
    padding: spacing.s1,
  },
  seenLabel: {
    color: colors.muted,
    flexShrink: 0,
  },
  seenRow: {
    alignItems: 'baseline',
    backgroundColor: {
      ':hover': colors.card,
      default: 'transparent',
    },
    borderRadius: radius.row,
    columnGap: spacing.s2,
    display: 'flex',
    paddingBlock: spacing.s1,
    paddingInline: '10px 8px',
    transitionDuration: '120ms',
    transitionProperty: 'background-color',
  },
  seenTitle: {
    color: colors.muted,
    fontSize: 13,
    margin: 0,
  },
  seenValue: {
    flexGrow: 1,
    fontVariantNumeric: 'tabular-nums',
    margin: 0,
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'end',
  },
  self: {
    alignSelf: 'flex-start',
  },
  snippet: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  snippetLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  text: {
    margin: 0,
  },
  // The use cases, one under the other, each far enough apart to read alone.
  specimens: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s8,
  },
  // An icon beside its label, centered on the line, a fixed gap apart.
  withIcon: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'inline-flex',
  },
  wordmark: {
    fontSize: 19,
    fontWeight: font.weightMedium,
    letterSpacing: '-0.01em',
    margin: 0,
  },
});

function Feature({ detail, icon: Icon, name }: { detail: string; icon: LucideIcon; name: string }) {
  return (
    <div {...props(styles.feature)}>
      <dt {...props(styles.featureName, styles.withIcon)}>
        <Icon {...ICON} />
        {name}
      </dt>
      <dd {...props(styles.featureDetail)}>{detail}</dd>
    </div>
  );
}

type Seen = {
  language: string;
  pointer: string;
  scheme: string;
  time: string;
  width: string;
  zone: string;
};

/** What the page's own code reads right now, so each knob shows up as a value. */
function readSeen(): Seen {
  const format = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  });
  return {
    language: navigator.language,
    pointer: matchMedia('(pointer: coarse)').matches
      ? m.seen_pointer_touch()
      : m.seen_pointer_mouse(),
    scheme: matchMedia('(prefers-color-scheme: dark)').matches
      ? m.seen_scheme_dark()
      : m.seen_scheme_light(),
    time: format.format(new Date()),
    width: m.seen_width_value({ width: String(window.innerWidth) }),
    zone: format.resolvedOptions().timeZone,
  };
}

function SeenRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div {...props(styles.seenRow)}>
      <dt {...props(styles.seenLabel)}>{label}</dt>
      <dd {...props(styles.seenValue)}>{value}</dd>
    </div>
  );
}

/**
 * Text with keys in it, each written `[[key]]` in the message, drawn as the
 * panel's key chips.
 */
function withKeys(text: string) {
  return text.split(/\[\[(.+?)\]\]/).map((part, index) =>
    index % 2 === 1 ? (
      <kbd {...props(styles.kbd)} key={index}>
        {part}
      </kbd>
    ) : (
      part
    ),
  );
}

/** The five shortcuts the panel's footer lists, in its order, drawn the same way. */
function Hints() {
  const hints = [
    [m.hint_panel_key(), m.hint_panel()],
    [m.hint_search_key(), m.hint_search()],
    [m.hint_grab_key(), m.hint_grab()],
    [m.hint_replay_key(), m.hint_replay()],
    [m.hint_reset_key(), m.hint_reset()],
  ];
  return (
    <ul {...props(styles.hints)}>
      {hints.map(([key, word]) => (
        <li {...props(styles.hintItem)} key={word}>
          <kbd {...props(styles.kbd)}>{key}</kbd>
          {word}
        </li>
      ))}
    </ul>
  );
}

/** grab's box and label bar on the headline, drawn still, as a visitor sees them live. */
function GrabDemo() {
  return (
    <div {...props(styles.grabDemo)} aria-hidden="true">
      <span {...props(styles.grabBox)}>{m.app_name()}</span>
      <span {...props(styles.grabPill)}>
        <span {...props(styles.grabTag)}>{m.grab_demo_tag()}</span>
        {m.grab_demo_component()}
      </span>
    </div>
  );
}

function SeenList() {
  // Empty on the server and on the first client render, so hydration matches.
  const [seen, setSeen] = useState<Seen | null>(null);
  useEffect(() => {
    const update = () => setSeen(readSeen());
    update();
    const timer = setInterval(update, 1000);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <dl {...props(styles.seen)}>
      <SeenRow label={m.seen_width()} value={seen?.width} />
      <SeenRow label={m.seen_time()} value={seen?.time} />
      <SeenRow label={m.seen_zone()} value={seen?.zone} />
      <SeenRow label={m.seen_language()} value={seen?.language} />
      <SeenRow label={m.seen_scheme()} value={seen?.scheme} />
      <SeenRow label={m.seen_pointer()} value={seen?.pointer} />
    </dl>
  );
}

/**
 * A code box with a copy button at its right edge. The code stays plain text,
 * selectable by hand. Where the clipboard refuses the write (an insecure
 * context, an old browser), the code is selected instead, ready to copy.
 */
function CodeBox({
  code,
  copyLabel,
  name,
  style,
  wrap = false,
}: {
  code: string;
  copyLabel: string;
  name: string;
  style?: StyleXStyles;
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const text = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    track('copy_click', { snippet: name });
    // Inside a promise, so a missing `navigator.clipboard` rejects too.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(
        () => setCopied(true),
        () => {
          if (text.current !== null) {
            getSelection()?.selectAllChildren(text.current);
          }
        },
      );
  };
  return (
    <div {...props(styles.code, style)}>
      <pre {...props(styles.codeText, wrap && styles.codeWrap)} ref={text}>
        {code}
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

function Snippet({
  code,
  copyLabel,
  label,
  name,
  wrap = false,
}: {
  code: string;
  copyLabel: string;
  label: string;
  name: string;
  wrap?: boolean;
}) {
  return (
    <div {...props(styles.snippet)}>
      <span {...props(styles.snippetLabel)}>{label}</span>
      <CodeBox code={code} copyLabel={copyLabel} name={name} wrap={wrap} />
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
  // touches `document`, and SSR must never reach it. It starts collapsed to the
  // edge tab the hero points at, and stays open across the reloads the device
  // and locale knobs cause once a visitor opens it. A first visit loads it when
  // the browser is idle; a reload with knobs already set loads it at once, so
  // the stored scheme or language does not wait.
  useEffect(() => {
    let cancel: (() => void) | undefined;
    if (hasStoredKnobs()) {
      void mountKnobs();
    } else {
      cancel = whenIdle(() => void mountKnobs());
    }
    // The copy of this page inside a device's frame hands its buttons up here.
    window.knobsDemo = runDemo;
    // One delegated listener for the whole page, panel included. Passive: it
    // never cancels the click it is reading.
    document.addEventListener('click', trackClick, { passive: true });
    return () => {
      cancel?.();
      document.removeEventListener('click', trackClick);
      delete window.knobsDemo;
      unmountKnobs();
    };
  }, []);

  return (
    <main {...props(styles.page)}>
      <header {...props(styles.section)}>
        <h1 {...props(styles.wordmark)}>{m.app_name()}</h1>
        <p {...props(styles.text)}>{m.tagline()}</p>
        <CodeBox
          code={m.install_command()}
          copyLabel={m.copy_install()}
          name="install"
          style={styles.installCode}
        />
        <p {...props(styles.hint)}>{withKeys(m.hero_hint())}</p>
      </header>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.how_title()}</h2>
        <p {...props(styles.text)}>{m.how_frame()}</p>
        <p {...props(styles.text)}>{m.how_patch()}</p>
        <p {...props(styles.text)}>{m.how_setup()}</p>
      </section>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.try_title()}</h2>
        <p {...props(styles.text)}>{m.try_intro()}</p>
        <div {...props(styles.specimens)}>
          <Specimen
            chips={
              <>
                <Chip demo="duo" icon={SmartphoneIcon} label={m.try_duo()} />
                <Chip demo="fold" icon={FoldHorizontalIcon} label={m.try_fold()} />
                <Chip demo="iphone" icon={SmartphoneIcon} label={m.try_iphone()} />
                <Chip demo="pixel" icon={SmartphoneIcon} label={m.try_pixel()} />
              </>
            }
            icon={SmartphoneIcon}
            label={m.try_device()}
            more={
              <>
                <Chip demo="mat" icon={PaletteIcon} label={m.try_mat()} />
                <Chip demo="scheme" icon={SunMoonIcon} label={m.try_scheme()} />
                <Chip demo="reset" icon={RotateCcwIcon} label={m.try_reset()} />
              </>
            }
            scene={m.try_device_scene()}
          />
          <LanguageSpecimen />
          <LocationSpecimen />
          <TimeSpecimen />
        </div>
        <p {...props(styles.seenTitle)}>{m.seen_title()}</p>
        <SeenList />
      </section>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.new_title()}</h2>
        <ul {...props(styles.limits)}>
          <li>
            {m.new_duo()}{' '}
            <a href={DUO_CREDIT} {...props(styles.link)}>
              {m.new_duo_link()}
            </a>
            {m.new_duo_end()}
          </li>
          <li>{m.new_mat()}</li>
          <li>{m.new_motion()}</li>
          <li>{m.new_settings()}</li>
          <li>{m.new_sides()}</li>
          <li>{withKeys(m.new_keys())}</li>
        </ul>
      </section>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading, styles.withIcon)}>
          <CrosshairIcon {...ICON} />
          {m.grab_title()}
        </h2>
        <p {...props(styles.text)}>{withKeys(m.grab_intro())}</p>
        <p {...props(styles.text)}>{withKeys(m.grab_try())}</p>
        <GrabDemo />
        <Snippet
          code={m.grab_example_code()}
          copyLabel={m.copy_grab_example()}
          label={m.grab_example_label()}
          name="grab_example"
          wrap
        />
        <p {...props(styles.text)}>{m.grab_context()}</p>
        <ul {...props(styles.limits)}>
          <li>{withKeys(m.grab_key_copy())}</li>
          <li>{withKeys(m.grab_key_arrows())}</li>
          <li>{withKeys(m.grab_key_shift())}</li>
          <li>{withKeys(m.grab_key_escape())}</li>
        </ul>
        <p {...props(styles.text)}>{m.grab_lines()}</p>
        <p {...props(styles.text)}>{m.grab_frame()}</p>
        <p {...props(styles.text)}>{m.grab_replace()}</p>
        <Snippet
          code={m.grab_api_code()}
          copyLabel={m.copy_grab_api()}
          label={m.grab_api_label()}
          name="grab_api"
        />
        <p {...props(styles.note)}>
          {m.grab_credit_built()}{' '}
          <a href="https://github.com/aidenybai/react-grab" {...props(styles.link)}>
            {m.grab_credit_react_grab()}
          </a>{' '}
          {m.grab_credit_by()}{' '}
          <a href="https://github.com/aidenybai/bippy" {...props(styles.link)}>
            {m.grab_credit_bippy()}
          </a>
          {', '}
          {m.grab_credit_carries()}{' '}
          <a href="https://github.com/jridgewell/sourcemaps" {...props(styles.link)}>
            {m.grab_credit_sourcemap()}
          </a>{' '}
          {m.grab_credit_end()}{' '}
          <a href={NOTICES} {...props(styles.link)}>
            {m.grab_credit_notices()}
          </a>
        </p>
      </section>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.features_title()}</h2>
        <dl {...props(styles.features)}>
          <Feature
            detail={m.feature_devices_detail()}
            icon={SmartphoneIcon}
            name={m.feature_devices()}
          />
          <Feature detail={m.feature_touch_detail()} icon={PointerIcon} name={m.feature_touch()} />
          <Feature detail={m.feature_time_detail()} icon={ClockIcon} name={m.feature_time()} />
          <Feature
            detail={m.feature_language_detail()}
            icon={LanguagesIcon}
            name={m.feature_language()}
          />
          <Feature detail={m.feature_look_detail()} icon={SunMoonIcon} name={m.feature_look()} />
          <Feature detail={m.feature_debug_detail()} icon={BugIcon} name={m.feature_debug()} />
        </dl>
        <p {...props(styles.text, styles.afterFeatures)}>{m.features_panel()}</p>
        <Hints />
        <a
          href="https://github.com/mertbuilds/devknobs#knobs"
          {...props(styles.link, styles.self, styles.withIcon)}
        >
          {m.features_readme()}
          <ArrowUpRightIcon {...ICON} />
        </a>
      </section>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.usage_title()}</h2>
        <div {...props(styles.blocks)}>
          <Snippet
            code={m.usage_script_code()}
            copyLabel={m.copy_script()}
            label={m.usage_script_label()}
            name="script"
          />
          <Snippet
            code={m.usage_import_code()}
            copyLabel={m.copy_import()}
            label={m.usage_import_label()}
            name="import"
          />
          <Snippet
            code={m.usage_react_code()}
            copyLabel={m.copy_react()}
            label={m.usage_react_label()}
            name="react"
          />
        </div>
        <p {...props(styles.note)}>{m.usage_react_note()}</p>
        <Snippet
          code={m.usage_early_code()}
          copyLabel={m.copy_early()}
          label={m.usage_early_label()}
          name="early"
        />
        <p {...props(styles.note)}>{m.usage_early_note()}</p>
      </section>

      <section {...props(styles.section)}>
        <h2 {...props(styles.sectionHeading)}>{m.limits_title()}</h2>
        <ul {...props(styles.limits)}>
          <li>{m.limits_ua()}</li>
          <li>{m.limits_touch()}</li>
          <li>{m.limits_phone()}</li>
          <li>{m.limits_clock()}</li>
          <li>{m.limits_devtools()}</li>
        </ul>
        <p {...props(styles.note)}>
          {m.limits_bezels()}{' '}
          <a href={NOTICES} {...props(styles.link)}>
            {m.limits_bezels_link()}
          </a>
        </p>
      </section>

      <footer {...props(styles.footer)}>
        <a href="https://github.com/mertbuilds/devknobs" {...props(styles.link, styles.withIcon)}>
          <GitHubMark />
          {m.link_github()}
        </a>
        <a href="https://www.npmjs.com/package/devknobs" {...props(styles.link, styles.withIcon)}>
          <NpmMark />
          {m.link_npm()}
        </a>
        <a
          href="https://mertbuilds.com/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=footer"
          {...props(styles.link)}
        >
          {m.link_mertbuilds()}
        </a>
      </footer>
    </main>
  );
}

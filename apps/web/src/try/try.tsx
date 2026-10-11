import { colors, font, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trackAbove } from '../lib/analytics.ts';
import { Bubble, BubbleToggle } from '../lib/bubble.tsx';
import { Chip } from '../lib/chip.tsx';
import { type Offset, parseStored, type Stored } from '../lib/drag.ts';
import { Field, Input, Submit } from '../lib/field.tsx';
import { useLive } from '../lib/live.ts';
import { m } from '../paraglide/messages.js';
import { type Outside, type OutsideFrame, outsideFrame, shown } from '../tour/knobs.ts';
import { raise } from '../tour/layer.tsx';
import { closeTour, useProgress } from '../tour/progress.ts';
import { isLocal, readVerdict, toAddress, type Verdict } from './address.ts';
import { type Look, readLook } from './look.ts';

// Space the bubble keeps from the window's edges.
const MARGIN = 8;
const DOCK = 16;

// Where the bubble was moved to and whether it is minimized, for the visit.
const KEPT = 'knobs:outside';

function readKept(): Stored {
  try {
    return parseStored(sessionStorage.getItem(KEPT));
  } catch {
    return parseStored(null);
  }
}

function keep(kept: Stored): void {
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(kept));
  } catch {
    // No storage: the bubble starts at the window's bottom each time.
  }
}

const styles = create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  // The site's name, which may be long: it gives way to the button beside it.
  host: {
    flexGrow: 1,
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  // The install command is not a place to drag from: its text can be selected.
  install: {
    cursor: 'auto',
    userSelect: 'text',
  },
  line: {
    margin: 0,
    paddingBlock: 2,
    paddingInline: '10px',
  },
  muted: {
    color: colors.muted,
  },
  // What the form says under the field.
  note: {
    color: colors.muted,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    margin: 0,
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    paddingBlock: spacing.s1,
    paddingInline: '10px 4px',
  },
  // Over the device's mat at the window's bottom, in the top layer, with none
  // of the look a popover comes with. It takes no pointer where the bubble was
  // moved away from; the bubble takes its own.
  shown: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    bottom: DOCK,
    boxSizing: 'border-box',
    color: colors.fg,
    fontFamily: font.family,
    fontSize: '0.8125rem',
    height: 'auto',
    left: 0,
    lineHeight: 1.5,
    margin: 0,
    marginInline: 'auto',
    maxWidth: `min(420px, calc(100vw - ${2 * MARGIN}px))`,
    overflow: 'visible',
    padding: 0,
    pointerEvents: 'none',
    position: 'fixed',
    right: 0,
    top: 'auto',
    width: 'max-content',
    zIndex: 2_147_483_647,
  },
});

type Note = 'checking' | 'invalid' | 'unreachable';

const NOTES: Record<Note, () => string> = {
  checking: m.try_checking,
  invalid: m.try_invalid,
  unreachable: m.try_unreachable,
};

type Answer = { look: Look | null; verdict: Verdict };

/**
 * Asks the server whether the site lets itself be shown, and for the colours
 * it names for itself. Any failure to ask is `unchecked`.
 */
async function frameable(url: URL, signal: AbortSignal): Promise<Answer> {
  try {
    const response = await fetch(`/api/frameable?url=${encodeURIComponent(url.href)}`, { signal });
    const data: unknown = response.ok ? await response.json() : null;
    const verdict = readVerdict(data);
    return { look: verdict === 'ok' ? readLook(data) : null, verdict };
  } catch {
    return { look: null, verdict: 'unchecked' };
  }
}

function hostOf(address: string): string {
  return URL.canParse(address) ? new URL(address).host : address;
}

/**
 * What the top page says while an outside page is in the frame: whose it is,
 * the way back, and what works. On the body and marked as devknobs' own, as the
 * tour is: devknobs hides every other child of the body under a device.
 */
function Shown({
  frame,
  install,
  state,
}: {
  frame: OutsideFrame;
  install: ReactNode;
  state: Outside & { outside: string };
}) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (layer.current !== null) {
      raise(layer.current);
    }
  }, []);
  const back = () => {
    frame.own();
    trackAbove('outside_back', {});
  };
  const [start] = useState(readKept);
  // What a site that refuses says is the point, so it is never minimized at first.
  const [minimized, setMinimized] = useState(start.minimized && !state.refused);
  const toggle = () => {
    setMinimized(!minimized);
    keep({ ...readKept(), minimized: !minimized });
  };
  const moved = (place: Offset) => keep({ ...readKept(), place });
  const local = URL.canParse(state.outside) && isLocal(new URL(state.outside));
  return createPortal(
    <div {...props(styles.shown)} aria-live="polite" data-devknobs="outside" ref={layer}>
      <Bubble drag={{ label: m.try_bubble(), onPlace: moved, place: start.place }}>
        <div {...props(styles.row)}>
          <span {...props(styles.host)}>{hostOf(state.outside)}</span>
          <Chip onClick={back}>{m.try_back()}</Chip>
          <BubbleToggle
            label={minimized ? m.try_expand() : m.try_minimize()}
            minimized={minimized}
            onToggle={toggle}
          />
        </div>
        {!minimized && (
          <>
            {state.refused && (
              <>
                <p {...props(styles.line)}>{m.try_refused()}</p>
                <div {...props(styles.install)} data-no-drag="">
                  {install}
                </div>
              </>
            )}
            {local && !state.refused && (
              <p {...props(styles.line, styles.muted)}>{m.try_local()}</p>
            )}
            <p {...props(styles.line, styles.muted)}>{m.try_works()}</p>
          </>
        )}
      </Bubble>
    </div>,
    document.body,
  );
}

/**
 * "Test on your website": a visitor types an address and that site shows in
 * the device's frame. It is drawn only where devknobs has `frame`, which is
 * known once the panel is on the page, so the server and the first client
 * render draw nothing. `install` is the install command, for a site that
 * refuses to be shown.
 */
export function Try({ install }: { install: ReactNode }) {
  const frame = useLive(outsideFrame);
  const state = useLive(shown);
  const progress = useProgress();
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const asking = useRef<AbortController | null>(null);
  useEffect(() => () => asking.current?.abort(), []);

  if (frame === null) {
    return null;
  }

  // The result goes out as one word. The address and its host never do.
  // The site's colours go with it only to a devknobs that takes them.
  const show = (url: URL, result: Verdict | 'local', look: Look | null = null) => {
    if (progress.phase !== 'off') {
      // The tour points into the page in the frame, which an outside page is not.
      closeTour();
    }
    const done = frame.show(url.href, {
      refused: result === 'refused',
      ...(look !== null && typeof frame.look === 'function' ? { look } : {}),
    });
    setNote(done ? null : 'invalid');
    if (done) {
      trackAbove('outside_show', { result });
    }
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    asking.current?.abort();
    const url = toAddress(typed);
    if (url === null) {
      setNote('invalid');
      return;
    }
    // The server cannot reach a local site, so there is nothing to ask.
    if (isLocal(url)) {
      show(url, 'local');
      return;
    }
    const abort = new AbortController();
    asking.current = abort;
    setNote('checking');
    void frameable(url, abort.signal).then(({ look, verdict }) => {
      if (abort.signal.aborted) {
        return;
      }
      if (verdict === 'unreachable') {
        setNote('unreachable');
        trackAbove('outside_show', { result: verdict });
        return;
      }
      show(url, verdict, look);
    });
  };

  return (
    <>
      <form {...props(styles.form)} noValidate onSubmit={submit}>
        <Field action={<Submit>{m.try_submit()}</Submit>} label={m.try_label()}>
          <Input
            autoCapitalize="none"
            autoComplete="url"
            autoCorrect="off"
            enterKeyHint="go"
            inputMode="url"
            name="url"
            onChange={(event) => setTyped(event.target.value)}
            placeholder={m.try_placeholder()}
            spellCheck={false}
            type="text"
            value={typed}
          />
        </Field>
        <p {...props(styles.note)} aria-live="polite">
          {note === null ? '' : NOTES[note]()}
        </p>
      </form>
      {state !== null && state.outside !== null && (
        <Shown
          frame={frame}
          install={install}
          // A new site, and one that turns out to refuse, starts the bubble anew.
          key={`${state.outside} ${state.refused}`}
          state={{ ...state, outside: state.outside }}
        />
      )}
    </>
  );
}

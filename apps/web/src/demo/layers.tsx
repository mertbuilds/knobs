import { colors, font, palette, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, firstThatWorks, props } from '@stylexjs/stylex';
import { type MouseEvent, type PointerEvent, useId, useRef, useState } from 'react';
import { Chips } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
import { m } from '../paraglide/messages.js';

const DARK = '@media (prefers-color-scheme: dark)';

// The popover card's width, and the gutter both layers keep to the viewport's edges.
const CARD = 264;
const GUTTER = 16;

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
  // The browser's own dialog, with none of its looks: a small panel, hairline
  // and 13 round, 16 from every edge of the viewport, which scrolls inside when
  // it is taller. No `display` here, so it stays hidden while it is closed.
  dialog: {
    '::backdrop': {
      backgroundColor: {
        [DARK]: `color-mix(in srgb, ${colors.track} 70%, transparent)`,
        default: `color-mix(in srgb, ${palette.ink} 40%, transparent)`,
      },
    },
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: shadow.lift,
    boxSizing: 'border-box',
    color: colors.fg,
    fontFamily: font.family,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    margin: 'auto',
    maxHeight: firstThatWorks('calc(100dvh - 32px)', 'calc(100vh - 32px)'),
    maxWidth: 'calc(100vw - 32px)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    // None, so a click on the dialog itself is a click on its backdrop.
    padding: 0,
    width: 360,
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    padding: spacing.s1,
  },
  dialogEnd: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: spacing.s1,
  },
  dialogText: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    paddingBlock: spacing.s1,
    paddingInline: '10px',
  },
  // A panel row, 4 inside the dialog, so 8 round, with its label over its control.
  field: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    padding: spacing.s1,
  },
  fieldLabel: {
    color: colors.muted,
    paddingInline: 6,
    paddingTop: 2,
  },
  muted: {
    color: colors.muted,
    margin: 0,
  },
  // The browser's own popover, with none of its looks. It leaves the middle of
  // the viewport for a place under its button, set when the button is clicked,
  // and it is absolute, so it scrolls with the page. No `display` here either.
  popover: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderRadius: radius.panel,
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: shadow.lift,
    boxSizing: 'border-box',
    color: colors.fg,
    fontFamily: font.family,
    fontSize: '0.8125rem',
    inset: 'auto',
    lineHeight: 1.5,
    margin: 0,
    maxHeight: 'none',
    maxWidth: 'calc(100vw - 32px)',
    overflow: 'visible',
    paddingBlock: spacing.s2,
    paddingInline: spacing.s3,
    position: 'absolute',
  },
  range: {
    accentColor: colors.fg,
    boxSizing: 'border-box',
    margin: 0,
    marginBlock: spacing.s1,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
    width: '100%',
  },
  title: {
    fontSize: '0.9375rem',
    fontWeight: font.weightMedium,
    lineHeight: 1.4,
    margin: 0,
  },
});

/**
 * Two things the page opens in the browser's top layer, a modal `<dialog>` and
 * a `popover`, both native. Inside a phone the mouse is a touch dot, and the
 * dot has to stay above both, so the page has both to try it on.
 */
export function Layers() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // True while a press that began inside the dialog is still down: a slider
  // dragged out and let go over the backdrop is not a click on the backdrop.
  const pressedInside = useRef(false);
  const [popped, setPopped] = useState(false);
  const titleId = useId();
  const cardId = useId();

  const onPress = (event: PointerEvent<HTMLDialogElement>) => {
    pressedInside.current = event.target !== event.currentTarget;
  };
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget && !pressedInside.current) {
      event.currentTarget.close();
    }
    pressedInside.current = false;
  };

  // The click reaches this before the browser opens the popover, so the card is in place when it shows.
  const place = (event: MouseEvent<HTMLButtonElement>) => {
    const el = card.current;
    if (el === null) {
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    const room = document.documentElement.clientWidth;
    const width = Math.min(CARD, room - GUTTER * 2);
    const left = Math.max(GUTTER, Math.min(button.left, room - GUTTER - width));
    el.style.width = `${width}px`;
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${button.bottom + window.scrollY + 6}px`;
  };

  return (
    <>
      <Chips>
        <Chip aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} ref={opener}>
          {m.layers_dialog_open()}
        </Chip>
        <Chip aria-expanded={popped} onClick={place} popoverTarget={cardId}>
          {m.layers_popover_open()}
        </Chip>
      </Chips>
      <dialog
        {...props(styles.dialog)}
        aria-labelledby={titleId}
        onClick={onBackdrop}
        // Safari does not focus a button on a click, so the browser has no opener to go back to.
        onClose={() => opener.current?.focus()}
        onPointerDown={onPress}
        ref={dialog}
      >
        <div {...props(styles.dialogBody)}>
          <div {...props(styles.dialogText)}>
            <h2 {...props(styles.title)} id={titleId}>
              {m.layers_dialog_title()}
            </h2>
            <p {...props(styles.muted)}>{m.layers_dialog_try()}</p>
            <p {...props(styles.muted)}>{m.layers_dialog_fields()}</p>
          </div>
          <label {...props(styles.field)}>
            <span {...props(styles.fieldLabel)}>{m.layers_dialog_text()}</span>
            <input {...props(styles.control)} type="text" />
          </label>
          <label {...props(styles.field)}>
            <span {...props(styles.fieldLabel)}>{m.layers_dialog_range()}</span>
            <input {...props(styles.range)} defaultValue={40} max={100} min={0} type="range" />
          </label>
          <div {...props(styles.dialogEnd)}>
            <Chip onClick={() => dialog.current?.close()}>{m.layers_dialog_close()}</Chip>
          </div>
        </div>
      </dialog>
      <div
        {...props(styles.popover)}
        id={cardId}
        onToggle={(event) => setPopped(event.newState === 'open')}
        popover="auto"
        ref={card}
      >
        {m.layers_popover_text()}
      </div>
    </>
  );
}

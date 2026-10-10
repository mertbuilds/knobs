import type { Knobs, StopId } from './progress.ts';

/**
 * Where the tour points. Every hook into devknobs' own DOM is in this file, so
 * a change there is mended in one place, and so the package can give the tour
 * stable hooks one day. A lookup that finds nothing never throws: the tour
 * then points at the control that leads there.
 */

export const DUO = 'iphone-duo';
export const IPHONE = 'iphone-18-pro';

const HOOKS = {
  // The panel's "add knob" button under the rows, which opens the search. No stable hook: a class.
  add: 'button.add',
  // The device row's fold slider, inside the device knob's line.
  foldSlider: '[role="slider"][aria-label="fold"]',
  // The page in a device's frame, inside the frame host's shadow root.
  frame: 'iframe[data-devknobs-frame]',
  // The device's screen around that page, bars and all. No stable hook: a class.
  glass: '.glass',
  // The footer's grab button.
  grab: 'button[data-command="grab"]',
  // Grab's overlay, on the page for as long as grab is on, in the document grab runs in.
  grabOverlay: 'div[data-devknobs="grab"]',
  // The handle on the window's edge, by the start of its aria-label.
  handle: 'button[aria-label^="devknobs"]',
  // One knob's line inside an open row's editor.
  knob: (id: string) => `[data-knob="${id}"]`,
  // A long list of values, such as the devices, and the mat's swatches.
  listbox: '[role="listbox"]',
  // A value in a list, and an entry of the search results.
  option: '[role="option"]',
  // The panel's host in the page. Its shadow root is open.
  panel: '[data-devknobs="panel"]',
  // The open panel's own box, for the last bubble. No stable hook: a class.
  panelBox: '.panel',
  // The search results' list.
  results: '#devknobs-results',
  // A row's box. It carries `hidden` while the row is not listed.
  row: (id: string) => `[data-row="${id}"]`,
  // A row's line, the button that opens its editor: the first with aria-expanded in the row.
  rowLine: 'button[aria-expanded]',
  // The search field.
  search: 'input[role="combobox"]',
  // The footer's gear, which also leads back from the settings.
  settings: 'button[aria-label="settings"]',
  // The mat's swatches, inside the mat knob's line.
  swatches: '[role="radiogroup"]',
  // The frame host in the page, there for as long as a device or a width is up.
  viewport: '[data-devknobs="viewport"]',
  // The panel's wrapper, which says the view shown: rows, results, browse or keys.
  wrap: '[data-mode]',
} as const;

// The words devknobs itself shows, which the tour finds a control by.
const WORDS = {
  // The device knob's name in the search results.
  device: 'device',
  // The mat knob's name in the search results.
  mat: 'mat',
  // The fold chip of a device that is shut.
  unfold: 'unfold',
} as const;

export type Say = 'bars' | 'duo' | 'grab' | 'iphone' | 'mat' | 'open' | 'scroll' | 'unfold';

export type Aim = {
  /** The box the target scrolls in, which it is cut to, such as an option's list. */
  readonly clip: Element | null;
  /** The control to frame, or null where there is none to show. */
  readonly el: Element | null;
  /** What to say beside it, or null to say and draw nothing. */
  readonly say: Say | null;
};

/** Is the node laid out? A hidden row and a folded editor are not. */
function shown(node: Element | null | undefined): node is Element {
  return node !== null && node !== undefined && node.getClientRects().length > 0;
}

function panelRoot(): ShadowRoot | null {
  return document.querySelector(HOOKS.panel)?.shadowRoot ?? null;
}

function frameRoot(): ShadowRoot | null {
  return document.querySelector(HOOKS.viewport)?.shadowRoot ?? null;
}

/** Is grab on, here or in the page inside the device's frame? */
export function grabbing(): boolean {
  if (document.querySelector(HOOKS.grabOverlay) !== null) {
    return true;
  }
  try {
    const frame = frameRoot()?.querySelector<HTMLIFrameElement>(HOOKS.frame);
    return (frame?.contentDocument?.querySelector(HOOKS.grabOverlay) ?? null) !== null;
  } catch {
    return false;
  }
}

/** A row's open editor, or the control that leads to it. */
type Lead = Pick<Aim, 'clip' | 'el'>;
type Way = { readonly row: Element } | Lead;

function lead(el: Element | null | undefined, clip: Element | null = null): Lead {
  return { clip, el: shown(el) ? el : null };
}

/**
 * The way to a row's editor from wherever the panel is: out of the settings,
 * through the search to the knob's entry, or to "add knob" for a row taken off
 * the list.
 */
function wayTo(root: ShadowRoot, row: string, knob: string, value?: string): Way {
  const mode = root.querySelector(HOOKS.wrap)?.getAttribute('data-mode');
  if (mode === 'keys') {
    return lead(root.querySelector(HOOKS.settings));
  }
  if (mode === 'results' || mode === 'browse') {
    const list = root.querySelector(HOOKS.results);
    // An entry starts with its knob's name, in a span of its own.
    const entries = Array.from(list?.querySelectorAll(HOOKS.option) ?? []).filter(
      (entry) => entry.querySelector('span')?.textContent === knob,
    );
    const entry =
      entries.find((item) => value !== undefined && item.textContent.includes(value)) ?? entries[0];
    return entry === undefined ? lead(root.querySelector(HOOKS.search)) : lead(entry, list);
  }
  const box = root.querySelector(HOOKS.row(row));
  if (!shown(box)) {
    return lead(root.querySelector(HOOKS.add));
  }
  const line = box.querySelector(HOOKS.rowLine);
  return line?.getAttribute('aria-expanded') === 'true'
    ? { row: box }
    : lead(line, box.parentElement);
}

/** A device in the device row's list, or the way to it. */
function atDevice(root: ShadowRoot, knobs: Knobs, id: string, say: Say): Aim {
  const label = knobs.PRESETS.device.find((device) => device.id === id)?.label;
  const way = wayTo(root, 'device', WORDS.device, label);
  if (!('row' in way)) {
    return { ...way, say };
  }
  const list = way.row.querySelector(`${HOOKS.knob('device')} ${HOOKS.listbox}`);
  const option = Array.from(list?.querySelectorAll(HOOKS.option) ?? []).find(
    (item) => item.textContent === label,
  );
  if (shown(option)) {
    return { clip: list, el: option, say };
  }
  // A filter typed in the list hides the device: the list itself is the place.
  return { clip: null, el: shown(list) ? list : way.row, say };
}

function atFold(root: ShadowRoot): Aim {
  const way = wayTo(root, 'device', WORDS.device);
  if (!('row' in way)) {
    return { ...way, say: 'unfold' };
  }
  const line = way.row.querySelector(HOOKS.knob('device'));
  const chip = Array.from(line?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === WORDS.unfold,
  );
  const slider = line?.querySelector(HOOKS.foldSlider);
  const el = shown(chip) ? chip : shown(slider) ? slider : way.row;
  return { clip: way.row.parentElement, el, say: 'unfold' };
}

function atMat(root: ShadowRoot): Aim {
  const way = wayTo(root, 'viewport', WORDS.mat);
  if (!('row' in way)) {
    return { ...way, say: 'mat' };
  }
  const swatches = way.row.querySelector(`${HOOKS.knob('mat')} ${HOOKS.swatches}`);
  return { clip: way.row.parentElement, el: shown(swatches) ? swatches : way.row, say: 'mat' };
}

/** The screen of the device on the mat. */
function atScreen(): Element | null {
  const root = frameRoot();
  const glass = root?.querySelector(HOOKS.glass);
  return shown(glass) ? glass : (root?.querySelector(HOOKS.frame) ?? null);
}

function find(stop: StopId, knobs: Knobs): Aim {
  const state = knobs.getState();
  if (stop === 'grab' && grabbing()) {
    // Grab draws its own box and label: the tour gets out of the way.
    return { clip: null, el: null, say: null };
  }
  if (stop === 'scroll') {
    const phone = knobs.PRESETS.device.find(({ id }) => id === state.device)?.kind === 'phone';
    const screen = phone && state.browser !== 'off' ? atScreen() : null;
    if (shown(screen)) {
      return { clip: null, el: screen, say: 'scroll' };
    }
  }
  const root = panelRoot();
  if (root === null) {
    return { clip: null, el: null, say: 'open' };
  }
  if (!state.panel.open || stop === 'open') {
    return { ...lead(root.querySelector(HOOKS.handle)), say: 'open' };
  }
  if (stop === 'grab') {
    return { ...lead(root.querySelector(HOOKS.grab)), say: 'grab' };
  }
  if (stop === 'iphone') {
    return atDevice(root, knobs, IPHONE, 'iphone');
  }
  // The fold belongs to the Duo and the mat to a frame: without one, back to picking the Duo.
  if (stop === 'unfold' && state.device === DUO) {
    return atFold(root);
  }
  if (stop === 'mat' && document.querySelector(HOOKS.viewport) !== null) {
    return atMat(root);
  }
  return atDevice(root, knobs, DUO, 'duo');
}

/** The control the visitor should use for a stop, as the page stands now. */
export function aimAt(stop: StopId, knobs: Knobs): Aim {
  try {
    return find(stop, knobs);
  } catch {
    return { clip: null, el: null, say: 'open' };
  }
}

/** The open panel, or its handle: where the last bubble sits. */
export function aimAtPanel(knobs: Knobs): Aim {
  try {
    const root = panelRoot();
    const open = knobs.getState().panel.open;
    const el = root?.querySelector(open ? HOOKS.panelBox : HOOKS.handle);
    return { clip: null, el: shown(el) ? el : null, say: null };
  } catch {
    return { clip: null, el: null, say: null };
  }
}

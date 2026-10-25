import { mountKnobs } from '../lib/panel.ts';

type Knobs = typeof import('@vinena/knobs');
type Browser = ReturnType<Knobs['getState']>['browser'];

/**
 * A development tool, never in a build: a reference image is the phone's own
 * screen, a lock screen or a home screen, so the device shows it with no
 * browser around it. The browser knob at `off` takes Safari's bars and the
 * status bar with them, and gives the page the whole glass.
 */

const STORE = 'knobs:refscreen';
const BROWSERS: ReadonlyArray<Browser> = ['auto', 'compact', 'bottom', 'top', 'off'];

/** The browser knob as the visitor had it, while a reference page has it off. */
let before: Browser | null = null;

/** The value kept for this tab: the address loads anew from one reference page to the next. */
function kept(): Browser | null {
  try {
    const value = sessionStorage.getItem(STORE);
    return BROWSERS.find((each) => each === value) ?? null;
  } catch {
    return null;
  }
}

/**
 * Once per arrival, on the top page with devknobs mounted: the browser off,
 * and the iPhone Duo open where no device is up. A reload and the next
 * reference page are the same visit, so a knob set by hand since stays.
 */
export function arriveAtReference(module: Knobs): void {
  before ??= kept();
  if (before !== null) {
    return;
  }
  const state = module.getState();
  before = state.browser;
  try {
    sessionStorage.setItem(STORE, before);
  } catch {
    // No storage: the value lasts as long as the page does.
  }
  module.setState(
    state.device === 'none'
      ? { browser: 'off', device: 'iphone-duo', posture: 'open' }
      : { browser: 'off' },
  );
}

/**
 * On the way to the page itself, by the card, Back or the address: the
 * browser knob back, unless it was set by hand since. Nothing is kept once it
 * is back, so the page's later loads leave the knob alone.
 */
export function leaveReference(): void {
  const was = before ?? kept();
  before = null;
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    // Nothing kept there.
  }
  if (was === null) {
    return;
  }
  void mountKnobs().then((knobs) => {
    if (knobs.getState().browser === 'off') {
      knobs.setState({ browser: was });
    }
  });
}

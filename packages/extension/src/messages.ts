import type { NativeUa, SystemMedia } from 'devknobs';
import type { KnobState } from './knobs.ts';
import type { FrameLoad } from './refusal.ts';

/**
 * From a tab's content script to the service worker, which knows the tab from the sender.
 * `native` is the panel's switch for the debugger, kept for every tab.
 */
export type Request =
  | { type: 'get' }
  | { state: KnobState; type: 'set' }
  | { on: boolean; type: 'native' };

export type Response = {
  error?: string;
  native?: boolean;
  state: KnobState;
  system?: SystemMedia | undefined;
};

/**
 * From the page's devknobs, through the bridge, about its frame: `why` asks
 * what the tab's debugger saw of `url`'s load, `watch` turns the debugger on to
 * see the next one, `frame` says the frame opened or went, `bypass` has the
 * tab's loads skip service workers while it stays open, and `ua` is the user
 * agent the tab's requests carry, null for the browser's own. `id` pairs the answer.
 */
export type Ask =
  | { type: 'why'; url: string }
  | { type: 'watch' }
  | { open: boolean; type: 'frame' }
  | { type: 'bypass' }
  | { type: 'ua'; ua: NativeUa | null };
export type Question = Ask & { id: number };

/** `native` false: the switch is off, so the debugger saw nothing. */
export type Answer = { error?: string; native?: boolean; record?: FrameLoad | null };

/** Why the switch went off by itself: the user closed Chrome's debugging bar. */
export type NativeReason = 'bar-closed';

/** From the service worker to a tab's top frame. */
export type TabMessage =
  | { type: 'detached' }
  | { on: boolean; reason?: NativeReason; type: 'native' }
  | { type: 'toggle' }
  | { media: SystemMedia; type: 'system' };

/** Between the service worker and the offscreen document, which reads the user's own media. */
export type SystemMessage = { type: 'read-system' } | { media: SystemMedia; type: 'system' };

/** From the bridge to the page's devknobs: the tab's knobs once loaded, or a tab message. */
export type PageMessage =
  | TabMessage
  | (Answer & { id: number; type: 'answer' })
  | {
      base: string;
      native: boolean;
      state: KnobState;
      system?: SystemMedia | undefined;
      type: 'state';
    };

/**
 * What the tab hears when the debugger leaves it without the extension asking. The user
 * closing Chrome's bar turns the switch off and the panel keeps its knobs in the page;
 * anything else, such as the tab going away, puts the knobs back to their defaults.
 */
export function detachMessage(reason: `${chrome.debugger.DetachReason}`): TabMessage {
  return reason === 'canceled_by_user'
    ? { on: false, reason: 'bar-closed', type: 'native' }
    : { type: 'detached' };
}

/**
 * Events on `document` between the page world, where devknobs runs, and the
 * bridge in the extension's own world: a `Request` up, a `PageMessage` down.
 * The detail is json: an object would not cross between the worlds.
 */
export const TO_BRIDGE = 'devknobs-extension:native';
export const TO_PAGE = 'devknobs-extension:tab';

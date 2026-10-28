import type { DevknobsState } from "../types";
import { formOf, turn } from "./devices";

/**
 * A phone's or a tablet's screen as the page reads it in `window.screen`:
 * `width`, `height`, `availWidth` and `availHeight` in css px, all of the
 * screen, as iOS 26.5 Safari reports 402 x 874 on the 17 Pro on the
 * simulator. iOS keeps them upright however the phone is held; Android turns
 * them with it. The getters go on the window's own `screen`, over its
 * prototype's, so taking them off hands the browser's back.
 */

export interface ScreenSize {
  width: number;
  height: number;
}

const KEYS = ["width", "height", "availWidth", "availHeight"] as const;

type ScreenKnobs = Pick<DevknobsState, "device" | "posture" | "orientation">;

/** The screen a page in the frame reads for these knobs, null for the window's own. */
export function screenSizeOf(state: ScreenKnobs): ScreenSize | null {
  const device = formOf(state.device, state.posture);
  if (!device || (device.kind !== "phone" && device.kind !== "tablet")) return null;
  const upright = device.ua === "iphone-safari";
  const { width, height } = turn(device, upright ? "portrait" : state.orientation);
  return { width, height };
}

/** Put `size` on the screen of the window `scope`, or null to give it its own. */
export function apply(size: ScreenSize | null, scope: object = globalThis): void {
  const own: unknown = Reflect.get(scope, "screen");
  if (typeof own !== "object" || own === null) return;
  for (const key of KEYS) {
    if (!size) {
      if (Object.hasOwn(own, key)) Reflect.deleteProperty(own, key);
      continue;
    }
    const value = key === "width" || key === "availWidth" ? size.width : size.height;
    Object.defineProperty(own, key, { configurable: true, enumerable: true, get: () => value });
  }
}

export function reset(): void {
  apply(null);
}

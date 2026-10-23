import { checkPatch } from "./engine/check";
import type { MountOptions } from "./index";

/**
 * What a page's own mount may choose on a host's panel: its keys, grab, its
 * color and whether the panel starts open. The rest is the host's to say.
 * Read field by field, as it comes from another copy, maybe of another version.
 */
export function pageChoices(options: object): MountOptions {
  const chosen: MountOptions = {};
  const hotkey: unknown = Reflect.get(options, "hotkey");
  const grabKey: unknown = Reflect.get(options, "grabKey");
  const grab: unknown = Reflect.get(options, "grab");
  const open: unknown = Reflect.get(options, "open");
  const grabColor: unknown = Reflect.get(options, "grabColor");
  if (typeof hotkey === "string") chosen.hotkey = hotkey;
  if (typeof grabKey === "string") chosen.grabKey = grabKey;
  if (typeof grab === "boolean") chosen.grab = grab;
  if (typeof open === "boolean") chosen.open = open;
  if (grabColor !== undefined) {
    const patch = { grabColor };
    try {
      checkPatch(patch);
      if (patch.grabColor !== undefined) chosen.grabColor = patch.grabColor;
    } catch {
      // Not a color grab draws in: the host keeps its own.
    }
  }
  return chosen;
}

import { copyGrab } from "./clipboard";
import { grabContext } from "./context";
import type { GrabOptions, GrabResult } from "./types";

export { startMode } from "./mode";
export { createOutline } from "./outline";

/** Build the elements' context and copy it. Null when the elements gave nothing. */
export async function grab(
  elements: Element[],
  options: GrabOptions = {},
): Promise<GrabResult | null> {
  const payload = await grabContext(elements, options);
  if (!payload.content.trim()) return null;
  return { ...payload, copied: await copyGrab(payload) };
}

import { addDevice, type CustomDevice, type CustomDeviceInput, importDevice } from "./custom";
import { detectScreen, pixelsOf, viewportFor } from "./detect";

/**
 * Bringing a custom device's picture in: from a url or a data url, kept as
 * a data url small enough for localStorage, its screen found where the
 * caller gives none. Browser only: it reads through fetch and a canvas.
 */

/** A data url past this many characters is drawn smaller before it is kept. */
export const IMAGE_MAX = 1_500_000;
/** The longest side a picture is drawn down to. */
const SIDE_MAX = 1600;

function read(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("devknobs: the picture could not be read"));
    reader.readAsDataURL(blob);
  });
}

/** A picture at `src` as a data url. A url is fetched, so it needs CORS where it is on another origin. */
export async function dataUrlOf(src: string | Blob): Promise<string> {
  if (typeof src !== "string") return read(src);
  if (src.startsWith("data:")) return src;
  const response = await fetch(src);
  if (!response.ok) throw new Error(`devknobs: the picture at ${src} answered ${response.status}`);
  return read(await response.blob());
}

/**
 * The picture drawn smaller where it is too big to keep, at the same shape.
 * Hands back the scale it took, so geometry measured on it can follow.
 */
export async function shrunk(dataUrl: string): Promise<{ image: string; scale: number }> {
  if (dataUrl.length <= IMAGE_MAX) return { image: dataUrl, scale: 1 };
  const pixels = await pixelsOf(dataUrl);
  const scale = Math.min(1, SIDE_MAX / Math.max(pixels.width, pixels.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pixels.width * scale);
  canvas.height = Math.round(pixels.height * scale);
  canvas.getContext("2d")?.drawImage(pixels.image, 0, 0, canvas.width, canvas.height);
  return { image: canvas.toDataURL("image/png"), scale };
}

/** The usual dpr of a kind of device, for a viewport worked out from the picture. */
export function dprFor(kind: CustomDevice["kind"]): number {
  return kind === "phone" ? 3 : 2;
}

/**
 * A device from its picture alone: its screen found, its viewport from the
 * screen over the dpr, anything in `options` on top. Throws where no screen
 * hole is found and `options` gives none.
 */
export async function deviceFromImage(
  src: string | Blob,
  options: Partial<CustomDeviceInput> = {},
): Promise<CustomDevice> {
  const { image } = await shrunk(await dataUrlOf(src));
  const pixels = await pixelsOf(image);
  const screen = options.screen ?? detectScreen(pixels);
  if (!screen) throw new Error("devknobs: no screen hole found in the picture; pass screen: { x, y, width, height, radius }");
  const kind = options.kind ?? "phone";
  const dpr = options.dpr ?? dprFor(kind);
  return addDevice({
    label: "custom device",
    chrome: "none",
    ...options,
    kind,
    dpr,
    image,
    imageSize: [pixels.width, pixels.height],
    screen,
    viewport: options.viewport ?? viewportFor(screen, dpr),
  });
}

/** Add a device from its json or object, its picture from `image` where given, fetched where it is a url. */
export async function addFrom(input: string | object, image?: string): Promise<CustomDevice> {
  const json = typeof input === "string" ? input : JSON.stringify(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new TypeError("devknobs: a custom device's json does not parse");
  }
  const own = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "image") : undefined;
  const picture = image ?? (typeof own === "string" ? own : undefined);
  const data = picture === undefined ? undefined : await dataUrlOf(picture);
  return addDevice(importDevice(json, data));
}

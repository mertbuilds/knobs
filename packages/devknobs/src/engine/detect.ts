import type { ScreenHole } from "./custom";

/**
 * Find the screen hole in a picture of a device's body: the transparent, or
 * flat colored, region round the picture's center. ADR-0004 has the method.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, four bytes a pixel, row by row. */
  data: Uint8ClampedArray | Uint8Array;
}

/** Below this alpha a pixel is see-through. */
const CLEAR = 16;
/** How far, summed over r, g and b, a pixel may be from the hole's color and still be the hole. */
const NEAR = 24;

/** `r = d / (1 - 1/sqrt 2)`: a round corner's gap along its diagonal, as a radius. */
const DIAGONAL = 1 / (1 - Math.SQRT1_2);

/** The hole round the picture's center, or null where the center is the body. */
export function detectScreen(pixels: Pixels): ScreenHole | null {
  const { width, height, data } = pixels;
  if (width < 3 || height < 3 || data.length < width * height * 4) return null;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const at = (x: number, y: number) => (y * width + x) * 4;
  const start = at(cx, cy);
  const clear = (data[start + 3] ?? 0) < CLEAR;
  const color = [data[start] ?? 0, data[start + 1] ?? 0, data[start + 2] ?? 0];
  const hole = (x: number, y: number): boolean => {
    const i = at(x, y);
    const alpha = data[i + 3] ?? 0;
    if (clear) return alpha < CLEAR;
    if (alpha < 255 - CLEAR) return false;
    const off = Math.abs((data[i] ?? 0) - (color[0] ?? 0)) + Math.abs((data[i + 1] ?? 0) - (color[1] ?? 0)) + Math.abs((data[i + 2] ?? 0) - (color[2] ?? 0));
    return off <= NEAR;
  };
  // A flood fill over the hole, row spans at a time.
  const seen = new Uint8Array(width * height);
  const stack: number[] = [cx, cy];
  let left = cx;
  let right = cx;
  let top = cy;
  let bottom = cy;
  let count = 0;
  while (stack.length > 0) {
    const y = stack.pop();
    let x = stack.pop();
    if (x === undefined || y === undefined) break;
    if (seen[y * width + x] || !hole(x, y)) continue;
    while (x > 0 && !seen[y * width + x - 1] && hole(x - 1, y)) x--;
    let above = false;
    let below = false;
    for (; x < width && !seen[y * width + x] && hole(x, y); x++) {
      seen[y * width + x] = 1;
      count++;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (y > 0) {
        const open = !seen[(y - 1) * width + x] && hole(x, y - 1);
        if (open && !above) stack.push(x, y - 1);
        above = open;
      }
      if (y < height - 1) {
        const open = !seen[(y + 1) * width + x] && hole(x, y + 1);
        if (open && !below) stack.push(x, y + 1);
        below = open;
      }
    }
  }
  const rect = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  // A hole that reaches the picture's edge is the background, not a screen.
  if (count === 0 || left === 0 || top === 0 || right === width - 1 || bottom === height - 1) return null;
  // The top left corner: how far in along its diagonal the hole starts.
  let gap = 0;
  const most = Math.floor(Math.min(rect.width, rect.height) / 2);
  while (gap < most && !seen[(top + gap) * width + left + gap]) gap++;
  const radius = Math.min(most, Math.round(gap * DIAGONAL));
  return { ...rect, radius };
}

/** The viewport a hole gives at a density: its size over the dpr, rounded. */
export function viewportFor(hole: { width: number; height: number }, dpr: number): { width: number; height: number } {
  return { width: Math.round(hole.width / dpr), height: Math.round(hole.height / dpr) };
}

/** A picture's pixels, drawn through a canvas, an SVG at its own size or `fallback` where it gives none. */
export async function pixelsOf(src: string, fallback = { width: 1200, height: 2400 }): Promise<Pixels & { image: HTMLImageElement }> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  const width = image.naturalWidth || fallback.width;
  const height = image.naturalHeight || fallback.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("devknobs: no canvas to read the picture with");
  context.drawImage(image, 0, 0, width, height);
  return { width, height, data: context.getImageData(0, 0, width, height).data, image };
}

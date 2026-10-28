/**
 * The dev ribbon on the tab's icon: the site's own icon with a yellow band
 * across its top right corner, `DEV` on it where the bitmap is big enough to
 * read. The same rule as the native devicon tool, so the two draw one picture.
 */

export const RIBBON_YELLOW = "#ffd60a";
export const RIBBON_INK = "#111111";

/** The bitmap size from which the band says `DEV`, in px. */
export const RIBBON_TEXT_MIN = 32;

/** The visible tile of an icon, made square: its left, top and side, in px. */
export interface TileBox {
  x: number;
  y: number;
  s: number;
}

/** Where the band goes, in the frame turned 45 degrees at the tile's top right corner. */
export interface RibbonGeometry {
  box: TileBox;
  /** The corner radius of the tile the band is clipped to. */
  radius: number;
  /** The tile's top right corner, the frame's origin. */
  origin: { x: number; y: number };
  /** The frame's turn, in radians, clockwise on screen. */
  angle: number;
  /** The band's width across. */
  width: number;
  /** How far the band's inner edge lies from the corner. */
  distance: number;
  /** The black edge on both long sides of the band. */
  edge: number;
  /** How far the band runs either way along the frame's x. */
  reach: number;
  /** `DEV`'s size and the y of its middle, null on a bitmap too small for it. */
  text: { size: number; y: number } | null;
}

/**
 * The tile box of an S by S bitmap's rgba pixels: the box of those with an
 * alpha over 128, made square around its center. The whole bitmap when none is.
 */
export function tileBox(data: ArrayLike<number>, size: number): TileBox {
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((data[(y * size + x) * 4 + 3] ?? 0) <= 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, s: size };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const s = Math.max(w, h);
  return { x: x0 - (s - w) / 2, y: y0 - (s - h) / 2, s };
}

/** The band for a bitmap of `size` px whose tile is `box`. */
export function ribbonGeometry(size: number, box: TileBox): RibbonGeometry {
  const width = 0.3 * box.s;
  // A tab-sized bitmap brings the band a little nearer the corner, so more of it shows.
  const distance = (size <= 20 ? 0.2 : 0.22) * box.s;
  const textSize = 0.62 * width;
  return {
    box,
    radius: 0.225 * box.s,
    origin: { x: box.x + box.s, y: box.y },
    angle: Math.PI / 4,
    width,
    distance,
    edge: Math.max(1, box.s / 40),
    reach: 2 * box.s,
    text:
      size >= RIBBON_TEXT_MIN ? { size: textSize, y: distance + width / 2 + 0.04 * textSize } : null,
  };
}

/** What the drawing reads an icon from: an image or a canvas, anything `drawImage` takes. */
export type IconSource = CanvasImageSource & { width: number; height: number };

/**
 * Draw `source` into an S by S context with the ribbon over it. The source
 * fits the bitmap, centered, as it is. Throws where the canvas cannot be
 * read back, as with a cross-origin image.
 */
export function drawDevIcon(
  context: CanvasRenderingContext2D,
  size: number,
  source: IconSource,
): void {
  context.clearRect(0, 0, size, size);
  const w = source.width || size;
  const h = source.height || size;
  const scale = size / Math.max(w, h);
  context.drawImage(source, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  const box = tileBox(context.getImageData(0, 0, size, size).data, size);
  const g = ribbonGeometry(size, box);
  context.save();
  context.beginPath();
  context.roundRect(box.x, box.y, box.s, box.s, g.radius);
  context.clip();
  context.translate(g.origin.x, g.origin.y);
  context.rotate(g.angle);
  context.fillStyle = RIBBON_INK;
  context.fillRect(-g.reach, g.distance - g.edge, 2 * g.reach, g.width + 2 * g.edge);
  context.fillStyle = RIBBON_YELLOW;
  context.fillRect(-g.reach, g.distance, 2 * g.reach, g.width);
  if (g.text) {
    context.fillStyle = RIBBON_INK;
    context.font = `700 ${g.text.size}px -apple-system, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("DEV", 0, g.text.y);
  }
  context.restore();
}

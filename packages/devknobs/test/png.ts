import { deflateSync, inflateSync } from "node:zlib";

/**
 * A device frame drawn as a real PNG, and the PNG read back, for the screen
 * detection tests: 8 bit RGBA, no filter, no interlace, nothing more.
 */

export interface Frame {
  width: number;
  height: number;
  /** The screen hole, transparent, with round corners of `radius`. */
  hole: { x: number; y: number; width: number; height: number; radius: number };
  /** Fill the hole with this color instead of leaving it clear. */
  flat?: [number, number, number];
}

/** RGBA pixels: a dark body with a lighter band, the hole cut out of it. */
export function drawFrame(frame: Frame): Uint8Array {
  const { width, height, hole, flat } = frame;
  const data = new Uint8Array(width * height * 4);
  const inHole = (x: number, y: number) => {
    const { x: hx, y: hy, width: hw, height: hh, radius: r } = hole;
    if (x < hx || y < hy || x >= hx + hw || y >= hy + hh) return false;
    const cx = Math.min(Math.max(x + 0.5, hx + r), hx + hw - r);
    const cy = Math.min(Math.max(y + 0.5, hy + r), hy + hh - r);
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (inHole(x, y)) {
        if (flat) data.set([...flat, 255], i);
        continue;
      }
      // Clear outside the body's rounded outline, which a real mockup has too.
      if (edge < 2) continue;
      data.set(edge < 8 ? [90, 90, 96, 255] : [20, 20, 24, 255], i);
    }
  }
  return data;
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Read back a PNG `encodePng` wrote. */
export function decodePng(png: Uint8Array): { width: number; height: number; data: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
    } else if (type === "IDAT") idat.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) data.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  return { width, height, data };
}

export function pngDataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

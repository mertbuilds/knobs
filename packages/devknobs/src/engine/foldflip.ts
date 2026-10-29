import { formOf } from "./devices";
import type { Point } from "./fold";
import type { Face, Picture } from "./foldpage";
import type { Mock, Radius, Rect } from "./mock";

/**
 * The Duo's cover held across turns its top to the right, where the fold's
 * frames have it turned to the left. That fold is the other turned over: the
 * hinge on the cover's top and the camera hole at its bottom right, as the
 * cover lies at rest. So it is laid out and drawn as the other, in a
 * letterbox turned over, its sides, the device and the pictures of the page
 * turned over too, and the whole of it turned back. The frames come out
 * exactly as rendered, half a turn round, and each end lies where the device
 * is drawn.
 */

/** The size of the letterbox a fold is turned over in. */
export interface Room {
  width: number;
  height: number;
}

/** A point of a box `room` big, the box turned half round. */
export function flipPoint(point: Point, room: Room): Point {
  return { x: room.width - point.x, y: room.height - point.y };
}

/** A rect in a box `room` big, the box turned half round. */
export function flipRect<T extends Rect>(rect: T, room: Room): T {
  return { ...rect, x: room.width - rect.x - rect.width, y: room.height - rect.y - rect.height };
}

/** The corners half a turn round: the bottom right one comes to the top left. */
function flipRadius(radius: Radius): Radius {
  if (typeof radius === "number") return radius;
  const [topLeft, topRight, bottomRight, bottomLeft] = radius;
  return [bottomRight, bottomLeft, topLeft, topRight];
}

/** A mock turned half round, its picture too: one turned with the device turns the other way. */
export function flipMock(mock: Mock): Mock {
  const room = { width: mock.width, height: mock.height };
  const { top, right, bottom, left } = mock.inset;
  const flipped: Mock = {
    ...mock,
    inset: { top: bottom, right: left, bottom: top, left: right },
    body: flipRect(mock.body, room),
    screenRadius: flipRadius(mock.screenRadius),
    bodyRadius: flipRadius(mock.bodyRadius),
    parts: mock.parts.map((part) => flipRect(part, room)),
  };
  if (!mock.image) return flipped;
  if (mock.image.turn === null) {
    const { over, ...still } = mock.image;
    return { ...flipped, image: over ? still : { ...still, over: true } };
  }
  // Turned the other way, `turn` is the upright mock's other side.
  const { clockwise, ...image } = mock.image;
  return { ...flipped, image: clockwise ? { ...image, turn: mock.height } : { ...image, turn: mock.width, clockwise: true } };
}

/** Is the shape `device|orientation|posture` a foldable's cover held across, its top to the right? */
function coverAcross(shape: string): boolean {
  const [device = "", held, posture] = shape.split("|");
  return held === "landscape" && posture === "closed" && formOf(device, "closed")?.clockwise === true;
}

/** Is the shape such a foldable open and held upright? */
export function openUpright(shape: string): boolean {
  const [device = "", held, posture] = shape.split("|");
  return held === "portrait" && posture === "open" && formOf(device, "closed")?.clockwise === true;
}

/**
 * Is the case held the other way up, going from the shape `from` to `to`, `over`
 * before? Unfolded from the cover held across, the open phone is the same
 * phone, so its case is half round, its screen's page upright as iOS keeps
 * it. Its cover across keeps it so, and it stays so while it stays open
 * upright. Anything else is the case as it is drawn.
 */
export function caseOver(from: string, to: string, over: boolean): boolean {
  if (coverAcross(to)) return true;
  if (!openUpright(to)) return false;
  return coverAcross(from) || (from === to && over);
}

/** A side of a fold in a letterbox `room` big, turned half round. */
export function flipFace(face: Face, room: Room): Face {
  return { ...face, body: face.body && flipMock(face.body), screen: flipRect(face.screen, room) };
}

const turnedOver = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** A picture turned half round, the same one for the same picture. */
export function flipCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const known = turnedOver.get(canvas);
  if (known) return known;
  const turned = document.createElement("canvas");
  turned.width = canvas.width;
  turned.height = canvas.height;
  const pen = turned.getContext("2d");
  if (pen) {
    pen.translate(canvas.width, canvas.height);
    pen.rotate(Math.PI);
    pen.drawImage(canvas, 0, 0);
  }
  turnedOver.set(canvas, turned);
  return turned;
}

/** The page on a screen `size` css px, turned half round: its pictures and the bars over them. */
export function flipPicture(picture: Picture, size: Room): Picture {
  const { bars } = picture;
  if (bars) {
    bars.style.transformOrigin = "0 0";
    bars.style.transform = `translate(${size.width}px, ${size.height}px) rotate(180deg)`;
  }
  return {
    shot: picture.shot && flipCanvas(picture.shot),
    painted: picture.painted?.then((drawn) => drawn && { ...drawn, shot: flipCanvas(drawn.shot) }) ?? null,
    bars,
  };
}

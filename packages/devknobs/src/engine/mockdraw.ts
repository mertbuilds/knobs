import { svgNode } from "./browserkit";
import type { Mock, Radius, Rect } from "./mock";

/** The front glass of a mock, near black, and the band around it a little lighter. */
const BODY = "#111112";
const EDGE = "#48484a";
/** A home button's ring, a lens's rim and a receiver slot's grille, just off the glass. */
const RIM = "#2a2a2c";

/** How much of the band shows around the front glass, in css px of the screen. */
const BAND = 2.5;

/**
 * How far black runs past the screen's edge under a picture of the body, in
 * css px of the screen. The picture's opening and the screen share an edge,
 * and where it falls between device pixels both are drawn part way, so the
 * mat would show through as a light line. The rim of the body there is black.
 */
export const UNDER = 2;

/**
 * Apple's continuous screen corner, from the iOS 26.5 simulator's screen
 * masks: the edge starts to curve `extent` times the radius from the corner,
 * 84.66 on the 17 Pro, and passes the 45 degree point a circle of the radius
 * would, 18.19 in. A superellipse of exponent 2 to the `shape` draws it.
 */
export const CONTINUOUS = { extent: 1.363, shape: 1.52 } as const;

/** A device's body over the frame, drawn by `drawMock`, in the letterbox's shadow root. */
export const MOCK_CSS = `
/* Clips the frame to the screen's corners in a mock, in the body's color so
   no blue shows at the seam. */
.glass.mocked {
  position: absolute;
  overflow: hidden;
  background: ${BODY};
}
/* A phone with an island: its continuous corners where the browser draws
   them, over the round radius set on it, which the mat still reads. */
@supports (corner-shape: superellipse(2)) {
  .glass.continuous {
    border-radius: var(--continuous) !important;
    corner-shape: superellipse(${CONTINUOUS.shape});
  }
}
/* Over the frame, and never in the way of a pointer. */
.mock {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
  pointer-events: none;
}
.mock .band { fill: ${EDGE}; fill-rule: evenodd; }
.mock .body { fill: ${BODY}; fill-rule: evenodd; }
.mock .button { fill: ${EDGE}; }
.mock .sensor { fill: #000; }
.mock .slot { fill: ${RIM}; }
.mock .lens { fill: #000; stroke: ${RIM}; stroke-width: 1; }
.mock .home { fill: ${RIM}; }
.mock .key { fill: ${BODY}; }`;

/** The radius of each corner, from the top left round by the right, `by` added to each. */
export function corners(radius: Radius, by = 0): [number, number, number, number] {
  const [a, b, c, d] = typeof radius === "number" ? [radius, radius, radius, radius] : radius;
  return [a + by, b + by, c + by, d + by];
}

/** A rounded rect as path data. */
function roundRect(rect: Rect, radius: Radius): string {
  const { x, y, width, height } = rect;
  const [a, b, c, d] = corners(radius).map((r) => Math.max(0, Math.min(r, width / 2, height / 2)));
  const arc = (r = 0) => `A${r} ${r} 0 0 1`;
  return [
    `M${x + a} ${y}H${x + width - b}${arc(b)} ${x + width} ${y + b}`,
    `V${y + height - c}${arc(c)} ${x + width - c} ${y + height}`,
    `H${x + d}${arc(d)} ${x} ${y + height - d}`,
    `V${y + a}${arc(a)} ${x + a} ${y}Z`,
  ].join("");
}

/** A rect with continuous corners as path data, each corner a superellipse traced in 16 steps. */
export function continuousRect(rect: Rect, radius: Radius): string {
  const { x, y, width, height } = rect;
  const power = 2 / 2 ** CONTINUOUS.shape;
  const most = Math.min(width, height) / 2;
  const lengths = corners(radius).map((r) => Math.max(0, Math.min(r * CONTINUOUS.extent, most)));
  // Each corner's point and the way in from it, clockwise from the top left.
  const ends: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + width, y, -1, 1],
    [x + width, y + height, -1, -1],
    [x, y + height, 1, -1],
  ];
  const points = ends.flatMap(([cx, cy, sx, sy], at) => {
    const length = lengths[at] ?? 0;
    return Array.from({ length: 17 }, (_, step) => {
      // The top left and bottom right run from the side to the top or bottom, the others back.
      const t = ((at % 2 === 0 ? step : 16 - step) / 16) * (Math.PI / 2);
      const px = cx + sx * length * (1 - Math.cos(t) ** power);
      const py = cy + sy * length * (1 - Math.sin(t) ** power);
      return `${px.toFixed(2)} ${py.toFixed(2)}`;
    });
  });
  return `M${points.join("L")}Z`;
}

/**
 * The device's body, in css px of the frame: the buttons under it, the band,
 * the front glass inside it with the screen cut out, and the island, holes,
 * lens, slot and home button on top.
 */
export function drawMock(
  mock: Mock,
  screenSize: { width: number; height: number },
  href: string | null,
): SVGSVGElement {
  const svg = svgNode("svg", {
    class: "mock",
    viewBox: `0 0 ${mock.width} ${mock.height}`,
    "aria-hidden": "true",
  });
  const part = (shape: Mock["parts"][number]) =>
    svgNode("rect", {
      class: shape.kind,
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rx: shape.radius,
    });
  // A picture is the whole body, buttons too, and its island goes flat black over it.
  if (mock.image && href) {
    const { x, y, width, height, turn, clockwise } = mock.image;
    const image = svgNode("image", { href, x, y, width, height });
    if (turn !== null) {
      image.setAttribute("transform", clockwise ? `matrix(0 1 -1 0 ${turn} 0)` : `matrix(0 -1 1 0 0 ${turn})`);
    }
    svg.append(image, ...mock.parts.map(part));
    return svg;
  }
  const opening = { x: mock.inset.left, y: mock.inset.top, ...screenSize };
  const { x, y, width, height } = mock.body;
  const screen = mock.continuous ? continuousRect : roundRect;
  const front = { x: x + BAND, y: y + BAND, width: width - 2 * BAND, height: height - 2 * BAND };
  const inside = roundRect(front, corners(mock.bodyRadius, -BAND));
  svg.append(
    ...mock.parts.filter((shape) => shape.kind === "button").map(part),
    svgNode("path", { class: "band", d: roundRect(mock.body, mock.bodyRadius) + inside }),
    svgNode("path", { class: "body", d: inside + screen(opening, mock.screenRadius) }),
    ...mock.parts.filter((shape) => shape.kind !== "button").map(part),
  );
  return svg;
}

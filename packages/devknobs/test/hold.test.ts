import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DEFAULT_PINNED, DEFAULT_STATE, merge } from "../src/engine/store";
import { rowOf } from "../src/ui/catalog";
import { HOLD, holdButton } from "../src/ui/hold";
import { isListed, removePatch, resetRowPatch } from "../src/ui/list";
import { type FakeNode, fake, leave, page } from "./kit-dom";

let x: FakeNode;
let heard: string[];
let released: number[];

beforeEach(() => {
  jest.useFakeTimers();
  page();
  const button = document.createElement("button");
  x = fake(button);
  heard = [];
  released = [];
  // The pointer capture a touch takes, which the hold lets go of.
  Object.assign(x, {
    hasPointerCapture: () => true,
    releasePointerCapture: (id: number) => released.push(id),
  });
  holdButton(button, {
    press: () => heard.push("press"),
    hold: () => heard.push("hold"),
  });
});

afterEach(() => {
  jest.useRealTimers();
  leave();
});

/** A press of the pointer, and the click the browser sends when it lets go on the button. */
function down(): void {
  x.fire("pointerdown", { button: 0, pointerId: 1 } as object);
}

function upAndClick(): void {
  x.fire("pointerup");
  x.fire("click");
}

describe("a button with a hold", () => {
  test("a click presses, and the hold never runs", () => {
    down();
    expect(x.classList.contains("holding")).toBe(true);
    jest.advanceTimersByTime(HOLD - 1);
    upAndClick();
    jest.advanceTimersByTime(HOLD);
    expect(heard).toEqual(["press"]);
    expect(x.classList.contains("holding")).toBe(false);
    expect(x.classList.contains("hold")).toBe(true);
  });

  test("held a second, it holds, and the click as it lets go presses nothing", () => {
    down();
    jest.advanceTimersByTime(HOLD);
    expect(heard).toEqual(["hold"]);
    expect(x.classList.contains("holding")).toBe(false);
    upAndClick();
    expect(heard).toEqual(["hold"]);
    // The next click is a press again.
    down();
    upAndClick();
    expect(heard).toEqual(["hold", "press"]);
  });

  test("let go of a touch's capture, so moving off is heard", () => {
    down();
    expect(released).toEqual([1]);
  });

  test("moving off lets go: no hold, and no press if it comes back to let go", () => {
    down();
    jest.advanceTimersByTime(HOLD / 2);
    x.fire("pointerleave");
    jest.advanceTimersByTime(HOLD);
    expect(x.classList.contains("holding")).toBe(false);
    upAndClick();
    expect(heard).toEqual([]);
  });

  test("a cancelled pointer lets go too", () => {
    down();
    x.fire("pointercancel");
    jest.advanceTimersByTime(HOLD);
    expect(heard).toEqual([]);
  });

  test("another button of the pointer starts nothing", () => {
    x.fire("pointerdown", { button: 2, pointerId: 1 } as object);
    jest.advanceTimersByTime(HOLD);
    expect(heard).toEqual([]);
  });

  test("Enter or Space let go early press once, however many repeats came", () => {
    for (const key of ["Enter", " "]) {
      const first = x.fire("keydown", { key });
      expect(first.prevented).toBe(true);
      x.fire("keydown", { key, repeat: true } as object);
      jest.advanceTimersByTime(HOLD - 1);
      expect(x.fire("keyup", { key }).prevented).toBe(true);
    }
    expect(heard).toEqual(["press", "press"]);
  });

  test("Enter held a second holds, its repeats start no other, and letting go presses nothing", () => {
    x.fire("keydown", { key: "Enter" });
    jest.advanceTimersByTime(HOLD / 2);
    x.fire("keydown", { key: "Enter", repeat: true } as object);
    jest.advanceTimersByTime(HOLD / 2);
    expect(heard).toEqual(["hold"]);
    x.fire("keydown", { key: "Enter", repeat: true } as object);
    jest.advanceTimersByTime(HOLD);
    x.fire("keyup", { key: "Enter" });
    expect(heard).toEqual(["hold"]);
  });

  test("a click with no pointer before it, as assistive tech sends, presses", () => {
    x.fire("click");
    expect(heard).toEqual(["press"]);
  });

  test("the click a hold ends with presses no other button it lands on, as the next row slid under the finger", () => {
    const root = fake(document.createElement("div"));
    const next = document.createElement("button");
    root.append(x, fake(next));
    const nexts: string[] = [];
    holdButton(next, { press: () => nexts.push("press"), hold: () => nexts.push("hold") });
    x.fire("pointerdown", { button: 0, pointerId: 1 } as object, root);
    jest.advanceTimersByTime(HOLD);
    fake(next).fire("pointerup", {}, root);
    const click = fake(next).fire("click", {}, root);
    expect(click.prevented).toBe(true);
    expect(heard).toEqual(["hold"]);
    expect(nexts).toEqual([]);
    // Only that one click: the next press on it presses.
    fake(next).fire("pointerdown", { button: 0, pointerId: 2 } as object, root);
    fake(next).fire("pointerup", {}, root);
    fake(next).fire("click", {}, root);
    expect(nexts).toEqual(["press"]);
  });

  test("a click that never came is not swallowed later: assistive tech's click presses", () => {
    down();
    jest.advanceTimersByTime(HOLD);
    x.fire("pointerup");
    jest.advanceTimersByTime(300);
    x.fire("click");
    expect(heard).toEqual(["hold", "press"]);
  });

  test("moving off swallows that gesture's click alone, not a later one with no pointer", () => {
    down();
    x.fire("pointerleave");
    x.fire("pointerup");
    jest.advanceTimersByTime(300);
    x.fire("click");
    expect(heard).toEqual(["press"]);
  });

  test("a hold from the keys swallows no click after it", () => {
    x.fire("keydown", { key: "Enter" });
    jest.advanceTimersByTime(HOLD);
    x.fire("keyup", { key: "Enter" });
    x.fire("click");
    expect(heard).toEqual(["hold", "press"]);
  });

  test("other keys and losing the focus leave it alone, the focus letting go of a hold", () => {
    expect(x.fire("keydown", { key: "a" }).prevented).toBe(false);
    x.fire("keydown", { key: " " });
    x.fire("blur");
    jest.advanceTimersByTime(HOLD);
    x.fire("keyup", { key: " " });
    expect(heard).toEqual([]);
  });

  test("a long touch opens no menu over it", () => {
    expect(x.fire("contextmenu").prevented).toBe(true);
  });
});

describe("a row's ×", () => {
  const row = rowOf("motion");
  const set = merge(DEFAULT_STATE, { motion: "reduce" });

  test("a click puts its knobs back and keeps the row listed", () => {
    const after = merge(set, resetRowPatch(set, row));
    expect(after.motion).toBe(DEFAULT_STATE.motion);
    expect(after.panel.pinned).toEqual([...DEFAULT_PINNED, row.id]);
    expect(isListed(row, after)).toBe(true);
  });

  test("a click on a row pinned already leaves the list as it is", () => {
    const pinned = merge(set, { panel: { pinned: [...DEFAULT_PINNED, row.id] } });
    expect(merge(pinned, resetRowPatch(pinned, row)).panel.pinned).toEqual([...DEFAULT_PINNED, row.id]);
  });

  test("a hold puts its knobs back and takes the row off", () => {
    const pinned = merge(set, { panel: { pinned: [...DEFAULT_PINNED, row.id] } });
    const after = merge(pinned, removePatch(pinned, row));
    expect(after.motion).toBe(DEFAULT_STATE.motion);
    expect(isListed(row, after)).toBe(false);
  });
});

/**
 * A button that does one thing on a press and another once held: a row's x
 * resets the row on a click and takes it off the list once held. The button
 * takes `hold`, and `holding` while the hold runs. Letting go early presses,
 * and moving off lets go of both. The click that ends a pointer's hold, or
 * one that moved off, is swallowed wherever it lands: a row taken off moves
 * the next one under the finger. Enter and Space are the same press and hold,
 * their repeats ignored.
 */

/** How long after a pointer lets go its click may still come, in ms. */
const CLICK_LATE = 300;

/** How long a press is held to count as a hold, in ms. */
export const HOLD = 1000;

export interface HoldActions {
  press(): void;
  hold(): void;
}

export interface Held {
  /** Let go of a hold under way, as the panel goes. */
  cancel(): void;
}

const KEYS = new Set(["Enter", " "]);

export function holdButton(node: HTMLElement, actions: HoldActions, ms = HOLD): Held {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** The hold under way began with a pointer, not a key. */
  let byPointer = false;
  /** Stop swallowing the gesture's click, where it is. */
  let unswallow: (() => void) | null = null;
  node.classList.add("hold");

  /**
   * Swallow the next click anywhere in the button's root, the one this
   * gesture makes, until the next press or a little after the pointer lets go.
   */
  function swallow(): void {
    unswallow?.();
    const root = node.getRootNode();
    let late: ReturnType<typeof setTimeout> | null = null;
    const eat = (event: Event): void => {
      event.stopPropagation();
      event.preventDefault();
      stop();
    };
    const wait = (): void => {
      late ??= setTimeout(stop, CLICK_LATE);
    };
    function stop(): void {
      if (late !== null) clearTimeout(late);
      root.removeEventListener("click", eat, true);
      root.removeEventListener("pointerdown", stop, true);
      root.removeEventListener("pointerup", wait, true);
      root.removeEventListener("pointercancel", wait, true);
      unswallow = null;
    }
    root.addEventListener("click", eat, true);
    root.addEventListener("pointerdown", stop, true);
    root.addEventListener("pointerup", wait, true);
    root.addEventListener("pointercancel", wait, true);
    unswallow = stop;
  }

  function start(pointer: boolean): void {
    cancel();
    byPointer = pointer;
    node.classList.add("holding");
    timer = setTimeout(() => {
      timer = null;
      node.classList.remove("holding");
      if (byPointer) swallow();
      actions.hold();
    }, ms);
  }

  /** Stop a hold under way, and say whether one was. */
  function cancel(): boolean {
    if (timer === null) return false;
    clearTimeout(timer);
    timer = null;
    node.classList.remove("holding");
    return true;
  }

  node.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    // A touch holds the pointer to where it began, so it would never leave.
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    start(true);
  });
  node.addEventListener("pointerup", () => {
    cancel();
  });
  for (const type of ["pointerleave", "pointercancel"] as const) {
    node.addEventListener(type, () => {
      if (byPointer && cancel()) swallow();
    });
  }
  node.addEventListener("click", () => {
    actions.press();
  });
  node.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!KEYS.has(event.key)) return;
    // The button's own press on the key would come again with every repeat.
    event.preventDefault();
    if (!event.repeat) start(false);
  });
  node.addEventListener("keyup", (event: KeyboardEvent) => {
    if (!KEYS.has(event.key)) return;
    event.preventDefault();
    if (cancel()) actions.press();
  });
  node.addEventListener("blur", () => {
    cancel();
  });
  // A long touch would open the browser's menu over the button.
  node.addEventListener("contextmenu", (event: Event) => event.preventDefault());

  return {
    cancel(): void {
      cancel();
      unswallow?.();
    },
  };
}

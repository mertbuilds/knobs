import { describe, expect, spyOn, test } from "bun:test";
import * as foldrun from "../src/engine/foldrun";
import { frameWindow, loadFrames, watchFold, watchHinge, zoomKey } from "../src/engine/frames";

describe("the frame's kit, loaded when a frame is first needed", () => {
  test("hands a watcher set before it is in to the fold once it is, and its stop takes it off", async () => {
    let listening = 0;
    const { watchFold: watch } = foldrun;
    const fold = spyOn(foldrun, "watchFold").mockImplementation((watcher) => {
      const stop = watch(watcher);
      listening++;
      return () => {
        listening--;
        stop();
      };
    });
    try {
      const unwatch = watchFold(() => {});
      await loadFrames();
      expect(listening).toBe(1);
      unwatch();
      expect(listening).toBe(0);
    } finally {
      fold.mockRestore();
    }
  });

  test("leaves a watcher stopped before it is in off the hinge", async () => {
    let listening = 0;
    const { watchHinge: watch } = foldrun;
    const hinge = spyOn(foldrun, "watchHinge").mockImplementation((watcher) => {
      const stop = watch(watcher);
      listening++;
      return () => {
        listening--;
        stop();
      };
    });
    try {
      watchHinge(() => {})();
      await loadFrames();
      expect(listening).toBe(0);
    } finally {
      hinge.mockRestore();
    }
  });

  test("answers as a frame that is down while there is none", async () => {
    await loadFrames();
    expect(frameWindow()).toBeNull();
    expect(zoomKey("zoom-in")).toBe(false);
  });
});

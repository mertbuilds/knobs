import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MESSAGE_CAP, MESSAGES_KEPT } from "../src/requests/types";
import { FakeEventSource, fakePage, LOADED, leavePage, type Page, record } from "./requests-fakes";

/** The browser's own, before any recorder patched it. */
const CLOSE = FakeEventSource.prototype.close;
const LISTEN = FakeEventSource.prototype.addEventListener;

let page: Page;

beforeEach(() => {
  page = record(fakePage());
});

afterEach(() => {
  page.recorder.uninstall();
  leavePage();
});

/** The browser's own object behind the page's. */
function made(): FakeEventSource {
  const source = FakeEventSource.made.at(-1);
  if (!source) throw new Error("none made");
  return source;
}

describe("an EventSource", () => {
  test("is the browser's own, made by its own class, and a row from the moment it is made", () => {
    const source = new EventSource("/api/events");
    expect(source).toBeInstanceOf(FakeEventSource);
    expect(source).toBeInstanceOf(EventSource);
    expect(EventSource.name).toBe("FakeEventSource");
    expect(EventSource.CLOSED).toBe(2);
    expect(page.row()).toMatchObject({
      kind: "eventsource",
      detail: "full",
      method: "GET",
      url: "http://app.test/api/events",
      state: "pending",
      messages: [],
    });
    expect(page.row().initiator).toContain("requests-eventsource.test.ts");
  });

  test("open is a 200 event stream; each message is kept with its type, data, id and time", () => {
    new EventSource("/api/events");
    page.clock.tick(40);
    made().open();
    expect(page.row()).toMatchObject({ state: "ok", status: 200, contentType: "text/event-stream" });
    expect(page.row().timing.response).toBe(40);
    page.clock.tick(10);
    made().send("message", "hello", "7");
    expect(page.row().messages).toEqual([{ type: "message", data: "hello", id: "7", time: LOADED + 50 }]);
  });

  test("a named type is kept once the page listens for it, as a script hears no other", () => {
    const source = new EventSource("/api/events");
    made().open();
    made().send("tick", "1");
    expect(page.row().messages).toEqual([]);
    const heard: string[] = [];
    source.addEventListener("tick", (event) => heard.push(String((event as MessageEvent).data)));
    source.addEventListener("tick", () => {});
    made().send("tick", "2");
    expect(heard).toEqual(["2"]);
    expect(page.row().messages.map((each) => [each.type, each.data])).toEqual([["tick", "2"]]);
  });

  test("keeps the last messages, each cut to the cap", () => {
    new EventSource("/api/events");
    made().open();
    for (let at = 0; at < MESSAGES_KEPT + 5; at++) made().send("message", String(at));
    made().send("message", "x".repeat(MESSAGE_CAP + 10));
    const messages = page.row().messages;
    expect(messages.length).toBe(MESSAGES_KEPT);
    expect(messages[0]?.data).toBe("6");
    expect(messages.at(-1)?.data.length).toBe(MESSAGE_CAP);
  });

  test("a connection the server closes ends its row, and the next one is a row of its own", () => {
    new EventSource("/api/events");
    made().open();
    page.clock.tick(100);
    made().drop();
    expect(page.row()).toMatchObject({ state: "ok" });
    expect(page.row().timing.duration).toBe(100);
    made().open();
    made().send("message", "again");
    const rows = page.rows();
    expect(rows.length).toBe(2);
    expect(rows[1]?.messages.map((each) => each.data)).toEqual(["again"]);
  });

  test("one that never connects failed; one the page closes ends", () => {
    const failed = new EventSource("/api/a");
    made().drop(true);
    const closed = new EventSource("/api/b");
    made().open();
    closed.close();
    expect(made().readyState).toBe(2);
    expect(page.rows().map((row) => [row.url, row.state, row.error])).toEqual([
      ["http://app.test/api/a", "failed", "EventSource failed to connect"],
      ["http://app.test/api/b", "ok", null],
    ]);
    expect(failed.readyState).toBe(2);
  });

  test("is handed back as it was once the page is", () => {
    const store = page.recorder.store;
    expect(FakeEventSource.prototype.close).not.toBe(CLOSE);
    page.recorder.uninstall();
    const back: unknown = Reflect.get(globalThis, "EventSource");
    expect(back === FakeEventSource).toBe(true);
    expect(FakeEventSource.prototype.close).toBe(CLOSE);
    expect(FakeEventSource.prototype.addEventListener).toBe(LISTEN);
    new EventSource("/api/events");
    expect(store.entries()).toEqual([]);
  });
});

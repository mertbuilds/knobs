import { install, type Patch } from "./patch";
import { absolute, type Log } from "./record";
import { trimStack } from "./stack";

type Source = new (url: string | URL, init?: EventSourceInit) => EventSource;
type Method = (this: EventTarget, ...args: unknown[]) => unknown;

/** What the log follows of one `EventSource`: its row while a connection is up, and the types it listens for. */
interface Followed {
  /** The row of the connection now, or null between two. */
  id: string | null;
  /** Whether that connection opened. */
  open: boolean;
  types: Set<string>;
  listen(type: string): void;
}

/** The events that are not messages. */
const OWN = new Set(["open", "error"]);

/**
 * `EventSource`, with each connection a row in the log and the messages it
 * sends kept on it: `message` always, and every other type once the page
 * listens for it, as a script hears no other. The page's object is the
 * browser's own, made by the browser's own class, and a failure in the
 * note-taking never reaches it.
 *
 * The browser connects again after the server closes a stream. Each
 * connection is a row of its own, as each is a request, started once it is
 * open: the browser says nothing of it before.
 */
export function patchEventSource(patches: Patch[], log: Log): void {
  const Native: unknown = Reflect.get(globalThis, "EventSource");
  if (typeof Native !== "function") return;
  const followed = new WeakMap<object, Followed>();
  const listen = EventTarget.prototype.addEventListener;

  function follow(source: EventSource, initiator: string): void {
    const url = absolute(source.url);
    const start = (): string => log.start("eventsource", { method: "GET", url, headers: [], body: null, initiator });
    const on = (type: string, run: (event: Event) => void): void => {
      listen.call(source, type, (event: Event) => {
        try {
          run(event);
        } catch {
          // The event is the page's, noted or not.
        }
      });
    };
    const row: Followed = {
      id: start(),
      open: false,
      types: new Set(),
      listen(type) {
        if (row.types.has(type) || OWN.has(type)) return;
        row.types.add(type);
        on(type, (event) => {
          if (row.id === null) return;
          const data: unknown = Reflect.get(event, "data");
          const id: unknown = Reflect.get(event, "lastEventId");
          log.message(row.id, { type: event.type, data: String(data ?? ""), id: typeof id === "string" ? id : "" });
        });
      },
    };
    followed.set(source, row);
    row.listen("message");
    on("open", () => {
      if (row.id === null) {
        if (!log.active()) return;
        row.id = start();
      }
      row.open = true;
      // The browser opens a stream only for a 200 with this type, and tells a script neither.
      log.responded(row.id, { status: 200, state: "ok", contentType: "text/event-stream" });
    });
    on("error", () => {
      if (row.id === null) return;
      log.ended(row.id, row.open ? {} : { state: "failed", error: "EventSource failed to connect" });
      row.id = null;
      row.open = false;
    });
  }

  install<Source>(patches, globalThis, "EventSource", (original) => {
    function EventSource(this: unknown, ...args: unknown[]): unknown {
      // Called without new, the browser's own throws as it would.
      if (!new.target) return Reflect.apply(original, this, args);
      const source: EventSource = Reflect.construct(original, args, new.target);
      try {
        if (log.active()) follow(source, trimStack(new Error().stack, 1));
      } catch {
        // Not noted: the stream is the page's all the same.
      }
      return source;
    }
    EventSource.prototype = original.prototype;
    return EventSource as unknown as Source;
  });
  const proto: unknown = Reflect.get(Native, "prototype");
  if (typeof proto !== "object" || proto === null) return;
  install<Method>(
    patches,
    proto,
    "addEventListener",
    (original) =>
      function (this: EventTarget, ...args: unknown[]) {
        try {
          if (typeof args[0] === "string") followed.get(this)?.listen(args[0]);
        } catch {
          // The page's listener goes on all the same.
        }
        return original.apply(this, args);
      },
  );
  install<Method>(
    patches,
    proto,
    "close",
    (original) =>
      function (this: EventTarget, ...args: unknown[]) {
        try {
          const row = followed.get(this);
          if (row && row.id !== null) {
            log.ended(row.id, row.open ? {} : { state: "aborted" });
            row.id = null;
          }
        } catch {
          // Closed, noted or not.
        }
        return original.apply(this, args);
      },
  );
}

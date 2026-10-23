import { describe, expect, test } from "bun:test";
import { BODY_CAP, type BodyRecord, type RequestEntry } from "../src/requests/types";
import {
  BINARY,
  bodyShape,
  boundaryOf,
  cookieLines,
  cutNote,
  decodeForm,
  encodedLines,
  FAILED_RESPONSE,
  generalLines,
  multipartFields,
  NO_RESPONSE_DATA,
  noResponse,
  otherLines,
  PATH_CHARS,
  pathRoom,
  payloadOf,
  queryLines,
  queryString,
  rawHeaders,
  stackFile,
  stackLines,
  startTab,
  statusCode,
  summary,
  TABS,
  tabsOf,
  timingLines,
  timingParts,
  urlParts,
} from "../src/ui/requestparts";
import { fetched, image } from "./requests-entries";

function text(body: string, more: Partial<BodyRecord> = {}): BodyRecord {
  return { kind: "text", text: body, size: body.length, truncated: false, type: "application/json", ...more };
}

/** A request that waits for its answer. */
const PENDING = {
  state: "pending",
  status: null,
  statusText: "",
  responseHeaders: [],
  responseBody: null,
  timing: { start: 0, at: 0, response: null, end: null, duration: null },
} satisfies Partial<RequestEntry>;

describe("the summary", () => {
  test("a fetch: the method and the path with its query, then the status with its text, the time and the host", () => {
    expect(summary(fetched())).toEqual({
      verb: { text: "POST", icon: null, tone: "req-post" },
      path: "/api/users?page=2",
      status: "201 Created",
      tone: "ok",
      time: "123ms",
      host: "app.test",
    });
  });

  test("a method is in full here, where the list keeps it short", () => {
    expect(summary(fetched({ method: "DELETE" })).verb).toEqual({ text: "DELETE", icon: null, tone: "req-delete" });
  });

  test("an XMLHttpRequest that failed says why, hot", () => {
    const said = summary(
      fetched({ kind: "xhr", method: "GET", state: "failed", status: null, statusText: "", error: "network error" }),
    );
    expect(said.verb).toEqual({ text: "GET", icon: null, tone: "req-get" });
    expect(said.status).toBe("failed, network error");
    expect(said.tone).toBe("hot");
  });

  test("a redirect reads as any answer does: where it ended is for the rest", () => {
    const said = summary(
      fetched({ status: 302, statusText: "Found", redirected: true, finalUrl: "http://app.test/v2/users" }),
    );
    expect(said.status).toBe("302 Found");
    expect(said.tone).toBe("moved");
    expect(said.path).toBe("/api/users?page=2");
  });

  test("a light image row: the kind's mark for a method, and its status where the browser says", () => {
    expect(summary(image())).toEqual({
      verb: { text: "img", icon: "image", tone: "req-image" },
      path: "/img/logo.png",
      status: "200",
      tone: "ok",
      time: "45ms",
      host: "cdn.test",
    });
    expect(summary(image({ status: null })).status).toBe("");
  });

  test("a request that still runs says so, with no time yet", () => {
    const said = summary(fetched(PENDING));
    expect([said.status, said.tone, said.time]).toEqual(["pending", "idle", ""]);
  });
});

describe("urlParts and pathRoom", () => {
  test("the host apart from the path, which keeps its query and its hash as written", () => {
    expect(urlParts("https://api.test:8443/a/b?x=1&y=%20#top")).toEqual({
      host: "api.test:8443",
      path: "/a/b?x=1&y=%20#top",
    });
    expect(urlParts("http://app.test")).toEqual({ host: "app.test", path: "/" });
  });

  test("an address that holds its own content, or does not read, is all path", () => {
    expect(urlParts("data:image/png;base64,AAAA")).toEqual({ host: "", path: "data:image/png;base64,AAAA" });
    expect(urlParts("not a url")).toEqual({ host: "", path: "not a url" });
  });

  test("the path has two lines of what fits, one short, and a set length where nothing tells how wide", () => {
    expect(pathRoom(0)).toBe(PATH_CHARS);
    expect(pathRoom(Number.NaN)).toBe(PATH_CHARS);
    expect(pathRoom(67)).toBe(19);
    expect(pathRoom(670)).toBe(199);
    expect(pathRoom(280)).toBeGreaterThan(pathRoom(180));
  });
});

describe("the tabs", () => {
  test("are the browsers' own, in their words and their order", () => {
    expect(TABS).toEqual(["Headers", "Payload", "Preview", "Response", "Initiator", "Timing", "Cookies", "EventStream"]);
  });

  test("a fetch that sent a body has all but Cookies and EventStream, and opens on Headers", () => {
    expect(tabsOf(fetched({ responseHeaders: [["content-type", "application/json"]] }))).toEqual([
      "Headers",
      "Payload",
      "Preview",
      "Response",
      "Initiator",
      "Timing",
    ]);
    expect(startTab(fetched(), null)).toBe("Headers");
  });

  test("Payload is there for a query or a body, and not for a GET with neither", () => {
    expect(tabsOf(fetched({ method: "GET", requestBody: null, url: "http://app.test/a" }))).not.toContain("Payload");
    expect(tabsOf(fetched({ method: "GET", requestBody: null, url: "http://app.test/a?x=1" }))).toContain("Payload");
    expect(tabsOf(fetched({ url: "http://app.test/a" }))).toContain("Payload");
  });

  test("Cookies shows only with a cookie to show, and EventStream only for an event stream", () => {
    expect(tabsOf(fetched({ responseHeaders: [] }))).not.toContain("Cookies");
    expect(tabsOf(fetched())).toContain("Cookies");
    expect(tabsOf(fetched({ responseHeaders: [], requestHeaders: [["Cookie", "a=1"]] }))).toContain("Cookies");
    expect(tabsOf(fetched())).not.toContain("EventStream");
    expect(tabsOf(fetched({ contentType: "text/event-stream; charset=utf-8" }))).toContain("EventStream");
  });

  test("a light row shows what it can: Headers, Initiator and Timing", () => {
    expect(tabsOf(image())).toEqual(["Headers", "Initiator", "Timing"]);
    expect(tabsOf(image({ initiatorType: "" }))).toEqual(["Headers", "Timing"]);
  });

  test("the tab picked last opens again where the request has it, and Headers where it has not", () => {
    expect(startTab(fetched(), "Response")).toBe("Response");
    expect(startTab(image(), "Response")).toBe("Headers");
    expect(startTab(image(), "Timing")).toBe("Timing");
  });
});

describe("General and the headers", () => {
  test("a fetch: the address, the method, the status with its text, in the browsers' words", () => {
    expect(generalLines(fetched())).toEqual([
      { label: "Request URL", value: "http://app.test/api/users?page=2" },
      { label: "Request Method", value: "POST" },
      { label: "Status Code", value: "201 Created", tone: "ok" },
    ]);
  });

  test("an answer with no status text gets the standard one, as HTTP/2 gives none", () => {
    expect(statusCode(fetched({ status: 404, statusText: "" }))).toBe("404 Not Found");
    expect(statusCode(fetched({ status: 299, statusText: "" }))).toBe("299");
    expect(statusCode(fetched({ status: 200, statusText: "Fine" }))).toBe("200 Fine");
  });

  test("what happened in place of a status is in brackets, as the browsers' tools write it", () => {
    expect(statusCode(fetched(PENDING))).toBe("(pending)");
    expect(statusCode(fetched({ state: "aborted", status: null }))).toBe("(canceled)");
    expect(statusCode(fetched({ state: "failed", status: null, error: "TypeError: Failed to fetch" }))).toBe(
      "(failed) TypeError: Failed to fetch",
    );
    expect(statusCode(fetched({ status: 0 }))).toBe("(opaque)");
    expect(statusCode(image({ status: null }))).toBe("");
  });

  test("a redirect shows where it ended, and where it was asked for", () => {
    const lines = generalLines(fetched({ redirected: true, finalUrl: "http://app.test/v2/users" }));
    expect(lines.slice(0, 2)).toEqual([
      { label: "Request URL", value: "http://app.test/v2/users" },
      { label: "Redirected From", value: "http://app.test/api/users?page=2" },
    ]);
    const same = generalLines(fetched({ finalUrl: "http://app.test/api/users?page=2" }));
    expect(same.map((line) => line.label)).not.toContain("Redirected From");
  });

  test("Referrer Policy is the request's own, else the page's, and left out where neither is known", () => {
    const labels = (lines: { label: string }[]) => lines.map((line) => line.label);
    expect(labels(generalLines(fetched()))).not.toContain("Referrer Policy");
    expect(generalLines(fetched(), "origin").at(-1)).toEqual({ label: "Referrer Policy", value: "origin" });
    expect(generalLines(fetched({ referrerPolicy: "no-referrer" }), "origin").at(-1)).toEqual({
      label: "Referrer Policy",
      value: "no-referrer",
    });
  });

  test("a light row has no method, and its status where the browser gives one", () => {
    expect(generalLines(image()).map((line) => line.label)).toEqual(["Request URL", "Status Code"]);
    expect(generalLines(image({ status: null })).map((line) => line.label)).toEqual(["Request URL"]);
  });

  test("Raw is the headers a `name: value` a line, as they were read", () => {
    expect(rawHeaders(fetched().requestHeaders)).toBe("content-type: application/json\nAuthorization: Bearer abc\nX-Api-Key: k1");
    expect(rawHeaders([])).toBe("");
  });

  test("the cookies are the request's Cookie and the answer's Set-Cookie", () => {
    expect(cookieLines(fetched({ requestHeaders: [["Cookie", "a=1"], ["accept", "*/*"]] }))).toEqual([
      ["Cookie", "a=1"],
      ["set-cookie", "sid=1"],
    ]);
  });
});

describe("the query", () => {
  test("is the address's own, without its `?`", () => {
    expect(queryString("http://app.test/a?page=2&q=a%20b#top")).toBe("page=2&q=a%20b");
    expect(queryString("http://app.test/a")).toBe("");
    expect(queryString("not a url")).toBe("");
  });

  test("its parameters decoded, one that comes twice kept twice, or as written", () => {
    expect(queryLines("http://app.test/a?page=2&q=a%20b&tag=x&tag=y")).toEqual([
      ["page", "2"],
      ["q", "a b"],
      ["tag", "x"],
      ["tag", "y"],
    ]);
    expect(queryLines("http://app.test/a?q=a%20b&flag", false)).toEqual([
      ["q", "a%20b"],
      ["flag", ""],
    ]);
    expect(queryLines("http://app.test/a")).toEqual([]);
    expect(queryLines("not a url")).toEqual([]);
  });

  test("decoding reads `+` as a space, and leaves what does not decode as it is", () => {
    expect(decodeForm("q=a+b%26c")).toBe("q=a b&c");
    expect(decodeForm("bad=%E0%A4%A")).toBe("bad=%E0%A4%A");
    expect(encodedLines("a=1&b=x%20y&&c")).toEqual([
      ["a", "1"],
      ["b", "x%20y"],
      ["c", ""],
    ]);
  });
});

describe("the payload", () => {
  test("json is a tree of its value, and its source as it was sent", () => {
    expect(payloadOf(text('{"name":"Ada"}'))).toEqual({ kind: "json", value: { name: "Ada" }, source: '{"name":"Ada"}' });
    // Json that would come back changed, or was cut, is text.
    expect(payloadOf(text('{"a":1,"a":2}'))).toEqual({ kind: "text", text: '{"a":1,"a":2}' });
    expect(payloadOf(text('{"a":', { truncated: true }))).toEqual({ kind: "text", text: '{"a":' });
    expect(payloadOf(text("hi", { type: "text/plain" }))).toEqual({ kind: "text", text: "hi" });
  });

  test("a urlencoded body is Form Data, decoded, and can show as written", () => {
    expect(payloadOf(text("a=1&b=x%20y", { type: "application/x-www-form-urlencoded;charset=UTF-8" }))).toEqual({
      kind: "form",
      lines: [
        ["a", "1"],
        ["b", "x y"],
      ],
      source: "a=1&b=x%20y",
      encoded: true,
    });
  });

  test("a FormData is Form Data, a file as (binary)", () => {
    const form = text("name=Ada\nbio=one\ntwo\nfile=(file a.png, image/png, 12 bytes)", {
      kind: "form",
      type: "multipart/form-data",
    });
    expect(payloadOf(form)).toEqual({
      kind: "form",
      lines: [
        ["name", "Ada"],
        ["bio", "one\ntwo"],
        ["file", BINARY],
      ],
      source: form.text,
      encoded: false,
    });
  });

  test("a multipart body sent as text is parsed into its fields", () => {
    const body = [
      "------WebKitFormBoundaryX",
      'Content-Disposition: form-data; name="name"',
      "",
      "Ada",
      "------WebKitFormBoundaryX",
      'Content-Disposition: form-data; name="photo"; filename="a.png"',
      "Content-Type: image/png",
      "",
      "\u0089PNG",
      "------WebKitFormBoundaryX",
      'Content-Disposition: form-data; name="bio"',
      "",
      "one",
      "two",
      "------WebKitFormBoundaryX--",
      "",
    ].join("\r\n");
    const type = "multipart/form-data; boundary=----WebKitFormBoundaryX";
    expect(boundaryOf(type)).toBe("----WebKitFormBoundaryX");
    expect(boundaryOf('multipart/form-data; boundary="a b"')).toBe("a b");
    expect(boundaryOf("text/plain")).toBe("");
    expect(multipartFields(body, boundaryOf(type))).toEqual([
      ["name", "Ada"],
      ["photo", BINARY],
      ["bio", "one\r\ntwo"],
    ]);
    expect(payloadOf(text(body, { type })).kind).toBe("form");
    // Cut short, it keeps what came.
    expect(multipartFields(body.slice(0, body.indexOf("Ada") + 2), boundaryOf(type))).toEqual([["name", "Ad"]]);
    expect(multipartFields(body, "")).toEqual([]);
  });

  test("what has no text to show says so in a line", () => {
    expect(payloadOf(text("", { kind: "stream", size: null }))).toEqual({ kind: "line", text: "not read: a stream" });
    expect(payloadOf(text("", { kind: "binary", size: 2048, type: "image/png" }))).toEqual({
      kind: "line",
      text: "binary, 2 KB, image/png",
    });
    expect(payloadOf(text(""))).toEqual({ kind: "line", text: "empty" });
  });
});

describe("how a body shows", () => {
  test("json that is all there is laid out, and none of it is changed by that", () => {
    expect(bodyShape(text('{"id":7,"name":"Ada"}'))).toEqual({
      kind: "code",
      text: '{\n  "id": 7,\n  "name": "Ada"\n}',
    });
    // A number too long for the engine would come back another: it stays as it was kept.
    const long = '{"id":12345678901234567890}';
    expect(bodyShape(text(long))).toEqual({ kind: "code", text: long });
    const twice = '{"a":1,"a":2}';
    expect(bodyShape(text(twice))).toEqual({ kind: "code", text: twice });
  });

  test("the answer's type stands in where the body has none", () => {
    expect(bodyShape(text("[1]", { type: "" }), "application/json")).toEqual({ kind: "code", text: "[\n  1\n]" });
    expect(bodyShape(text("[1]", { type: "" }))).toEqual({ kind: "code", text: "[1]" });
  });

  test("a form is its fields, a value of more lines kept whole", () => {
    const form = text("name=Ada\nbio=one\ntwo\nfile=(file a.png, image/png, 12 bytes)", {
      kind: "form",
      type: "multipart/form-data",
    });
    expect(bodyShape(form)).toEqual({
      kind: "fields",
      lines: [
        ["name", "Ada"],
        ["bio", "one\ntwo"],
        ["file", "(file a.png, image/png, 12 bytes)"],
      ],
    });
    expect(bodyShape(text("a=1&b=x%20y", { type: "application/x-www-form-urlencoded;charset=UTF-8" }))).toEqual({
      kind: "fields",
      lines: [
        ["a", "1"],
        ["b", "x y"],
      ],
    });
  });

  test("other text is as it was kept", () => {
    expect(bodyShape(text("<p>hi</p>", { type: "text/html" }))).toEqual({ kind: "code", text: "<p>hi</p>" });
  });

  test("what has no text says so in a line", () => {
    expect(bodyShape(text("", { kind: "stream", size: null }))).toEqual({ kind: "line", text: "not read: a stream" });
    expect(bodyShape(text("", { kind: "opaque", size: null }))).toEqual({
      kind: "line",
      text: "hidden by the browser: an opaque answer",
    });
    expect(bodyShape(text("", { kind: "binary", size: 2048, type: "image/png" }))).toEqual({
      kind: "line",
      text: "binary, 2 KB, image/png",
    });
    expect(bodyShape(text(""))).toEqual({ kind: "line", text: "empty" });
  });

  test("a body that was cut says how, in few words, and one that is whole says nothing", () => {
    expect(BODY_CAP).toBe(64 * 1024);
    expect(cutNote(text("{"))).toBe("");
    expect(cutNote(text("{", { truncated: true, size: null }))).toBe("first 64 KB");
    expect(cutNote(text("{", { truncated: true, size: 2 * 1024 * 1024 }))).toBe("first 64 KB of 2 MB");
    expect(cutNote(text("{", { truncated: true, timedOut: true }))).toBe("cut after 2 seconds");
    // Json that was cut is not laid out.
    expect(bodyShape(text('{"id":7,"na', { truncated: true }))).toEqual({ kind: "code", text: '{"id":7,"na' });
  });

  test("with no answer's body it says whether one may still come", () => {
    expect(noResponse(fetched(PENDING))).toBe("waiting for the response");
    expect(noResponse(fetched({ responseBody: null }))).toBe(NO_RESPONSE_DATA);
    expect(NO_RESPONSE_DATA).toBe("This request has no response data available.");
    expect(noResponse(fetched({ state: "failed", status: null, responseBody: null }))).toBe(FAILED_RESPONSE);
    expect(FAILED_RESPONSE).toBe("Failed to load response data");
  });
});

describe("the rest", () => {
  test("a fetch: what it is, how big, and what made it", () => {
    expect(otherLines(fetched())).toEqual([
      ["type", "application/json"],
      ["size", "1.5 KB over the wire, 21 bytes of body"],
      ["protocol", "h2"],
      ["kind", "fetch"],
    ]);
  });

  test("a light row says what loaded it, and that its size is hidden", () => {
    expect(otherLines(image())).toEqual([
      ["size", "hidden by the server"],
      ["protocol", "h2"],
      ["kind", "img, loaded by img"],
    ]);
  });

  test("says that it is the frame's", () => {
    const lines = otherLines(fetched({ source: "frame", sizes: null, protocol: "" }));
    expect(lines.at(-1)).toEqual(["from", "the device frame"]);
    expect(lines.map(([label]) => label)).not.toContain("size");
  });
});

describe("the timing", () => {
  test("is split at the answer's headers: waiting to them, download from them", () => {
    const parts = timingParts({ start: 0, at: 0, response: 80, end: 100, duration: 100 });
    expect(parts).toEqual({ waiting: 80, download: 20, total: 100, shares: [0.8, 0.2] });
    expect(timingLines({ start: 0, at: 0, response: 80, end: 100, duration: 100 }, "14:03:07.120")).toEqual([
      ["started at", "14:03:07.120"],
      ["waiting", "80ms"],
      ["download", "20ms"],
      ["total", "100ms"],
    ]);
  });

  test("the bar's shares add up to the whole, whatever the two are", () => {
    const { shares } = timingParts(fetched().timing);
    expect(shares?.[0]).toBeCloseTo(80 / 123.4, 10);
    expect((shares?.[0] ?? 0) + (shares?.[1] ?? 0)).toBeCloseTo(1, 10);
    // Headers that read as later than the end fill the bar, and no more.
    expect(timingParts({ start: 0, at: 0, response: 150, end: 100, duration: 100 })).toEqual({
      waiting: 100,
      download: 0,
      total: 100,
      shares: [1, 0],
    });
  });

  test("a light row has what Resource Timing gave, split the same way", () => {
    expect(timingParts(image().timing)).toEqual({ waiting: 30, download: 15, total: 45, shares: [30 / 45, 15 / 45] });
  });

  test("while it runs there is no bar, and the lines say what is known", () => {
    expect(timingParts(PENDING.timing).shares).toBeNull();
    expect(timingLines(PENDING.timing, "now")).toEqual([
      ["started at", "now"],
      ["total", "still going"],
    ]);
    const answered = { start: 0, at: 0, response: 40, end: null, duration: null };
    expect(timingParts(answered).shares).toBeNull();
    expect(timingLines(answered, "now")).toEqual([
      ["started at", "now"],
      ["waiting", "40ms"],
      ["total", "still going"],
    ]);
    expect(timingParts({ start: 0, at: 0, response: 0, end: 0, duration: 0 }).shares).toBeNull();
  });
});

describe("the initiator", () => {
  const STACK = [
    "at save (http://app.test/src/app.js?v=3:10:5)",
    "at dispatch (http://app.test/node_modules/redux/dist/redux.js:200:11)",
    "at http://app.test/node_modules/redux/dist/redux.js:300:1",
    "at devknobsFetch (http://app.test/vendor/devknobs.js:9:9)",
    "at onClick (http://app.test/src/app.js:22:3)",
    "at http://app.test/src/main.js:1:1",
  ].join("\n");

  test("is a frame a line: the function, where it is in full, and that in short", () => {
    expect(stackLines("at save (http://app.test/src/app.js?v=3:10:5)\nat http://app.test/src/main.js:1:1")).toEqual([
      { kind: "frame", frame: { name: "save", where: "http://app.test/src/app.js?v=3:10:5", short: "app.js:10:5" } },
      { kind: "frame", frame: { name: "(anonymous)", where: "http://app.test/src/main.js:1:1", short: "main.js:1:1" } },
    ]);
  });

  test("reads the frames the other engines write", () => {
    expect(stackLines("save@http://app.test/app.js:10:5\n@http://app.test/app.js:1:1")).toEqual([
      { kind: "frame", frame: { name: "save", where: "http://app.test/app.js:10:5", short: "app.js:10:5" } },
      { kind: "frame", frame: { name: "(anonymous)", where: "http://app.test/app.js:1:1", short: "app.js:1:1" } },
    ]);
  });

  test("frames from node_modules and from devknobs' own file are one line that says how many", () => {
    const lines = stackLines(STACK, "http://app.test/vendor/devknobs.js");
    expect(lines.map((each) => (each.kind === "frame" ? each.frame.name : each.frames.length))).toEqual([
      "save",
      3,
      "onClick",
      "(anonymous)",
    ]);
    const run = lines[1];
    expect(run?.kind === "more" && run.frames.map((frame) => frame.short)).toEqual([
      "redux.js:200:11",
      "redux.js:300:1",
      "devknobs.js:9:9",
    ]);
  });

  test("with no file of its own named, only node_modules is set apart, in runs", () => {
    const lines = stackLines(STACK);
    expect(lines.map((each) => (each.kind === "frame" ? each.frame.name : each.frames.length))).toEqual([
      "save",
      2,
      "devknobsFetch",
      "onClick",
      "(anonymous)",
    ]);
  });

  test("the file a stack starts in, in either way of writing one", () => {
    expect(stackFile("Error\n    at make (http://app.test/vendor/devknobs.js:9:9)\n    at x (http://a/b.js:1:1)")).toBe(
      "http://app.test/vendor/devknobs.js",
    );
    expect(stackFile("make@http://app.test/vendor/devknobs.js:9:9")).toBe("http://app.test/vendor/devknobs.js");
    expect(stackFile(undefined)).toBe("");
    expect(stackFile("Error")).toBe("");
  });
});

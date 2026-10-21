import { afterEach, describe, expect, test } from "bun:test";
import type { StackFrame } from "bippy/source";
import { appSource, mapped, recalled, relocated, sourceFetch } from "../src/grab/source";

const SCRIPT = "http://localhost:5173/src/features/Cart.tsx?t=1";

describe("mapped", () => {
  test("counts the column from 1", () => {
    expect(mapped({ fileName: "/src/App.tsx", columnNumber: 4 }, null).columnNumber).toBe(5);
    expect(mapped({ fileName: "/src/App.tsx", columnNumber: undefined }, null).columnNumber).toBe(
      undefined,
    );
  });

  test("puts a path beside its script, and leaves a rooted one alone", () => {
    expect(mapped({ fileName: "Cart.tsx" }, { fileName: SCRIPT }).fileName).toBe(
      "src/features/Cart.tsx",
    );
    expect(mapped({ fileName: "../App.tsx" }, { fileName: SCRIPT }).fileName).toBe("src/App.tsx");
    expect(
      mapped({ fileName: "a.tsx" }, { fileName: "http://localhost:5173/@fs/repo/ui/b.tsx" })
        .fileName,
    ).toBe("/repo/ui/a.tsx");
    expect(mapped({ fileName: "/src/App.tsx" }, { fileName: SCRIPT }).fileName).toBe(
      "/src/App.tsx",
    );
    expect(mapped({ fileName: "webpack://app/./src/App.tsx" }, { fileName: SCRIPT }).fileName).toBe(
      "webpack://app/./src/App.tsx",
    );
    expect(mapped({ fileName: "Cart.tsx" }, null).fileName).toBe("Cart.tsx");
  });

  test("takes the function's name from the frame, over the token at the call", () => {
    expect(mapped({ functionName: "map" }, { functionName: "App" }).functionName).toBe("App");
    expect(mapped({ functionName: "Cart" }, { functionName: "a" }).functionName).toBe("Cart");
    expect(mapped({ functionName: "Cart" }, null).functionName).toBe("Cart");
    expect(mapped({ functionName: "icon" }, { functionName: "promptBox" }).functionName).toBe(
      "promptBox",
    );
  });
});

/** A lazy route's chunk on a Vite dev server, whose source map names the file with its query. */
const CHUNK = "https://app.localhost/src/routes/index.tsx?tsr-split=component";

const ROUTE = {
  name: "index.tsx?tsr-split=component",
  content: [
    "const styles = { title: {} };",
    "",
    "function HomePage() {",
    "  return (",
    "    <main>",
    "      <h1>Stop fighting</h1>",
    "      <Outlet />",
    "    </main>",
    "  );",
    "}",
  ].join("\n"),
};

const H1 = { tag: "h1", host: true };
const RAW: StackFrame = {
  functionName: "HomePage",
  fileName: CHUNK,
  lineNumber: 447,
  columnNumber: 22,
};

describe("relocated", () => {
  test("a frame the map had no place for gets its line and column from the source", () => {
    const frame = mapped(relocated(RAW, RAW, H1, ROUTE, null), RAW);
    expect(frame).toMatchObject({
      functionName: "HomePage",
      fileName: "src/routes/index.tsx",
      lineNumber: 6,
      columnNumber: 7,
      isSymbolicated: true,
    });
  });

  test("a frame the map put on the wrong line moves, and one with nothing found stays", () => {
    const wrong = { ...RAW, fileName: ROUTE.name, lineNumber: 1, isSymbolicated: true };
    expect(relocated(wrong, RAW, H1, ROUTE, null).lineNumber).toBe(6);
    expect(relocated(wrong, RAW, { tag: "h2", host: true }, ROUTE, null)).toBe(wrong);
    expect(relocated(RAW, RAW, { tag: "h2", host: true }, ROUTE, null)).toBe(RAW);
  });

  test("a frame the map put right stays when a tagged template comes before the tag", () => {
    const styled = {
      name: "rows.tsx",
      content: [
        "const Title = styled.h1`",
        "  color: red;",
        "`;",
        "export function A() {",
        '  return <Row id="a" />;',
        "}",
        "const q = css`x`;",
        "export function B() {",
        '  return <Row id="b" />;',
        "}",
      ].join("\n"),
    };
    const right = { ...RAW, fileName: styled.name, lineNumber: 5, columnNumber: 9, isSymbolicated: true };
    expect(relocated(right, RAW, { tag: "Row", host: false }, styled, null)).toBe(right);
  });
});

/** Two list items, one around the samples, one around an image. */
const PICKS = {
  name: "pick.tsx",
  content: [
    "function Picks() {",
    "  return (",
    "    <ul>",
    "      <li>",
    "        <Swatches />",
    "      </li>",
    "      <li>",
    "        <img />",
    "      </li>",
    "    </ul>",
    "  );",
    "}",
  ].join("\n"),
};

const note = (line: number, column: number) =>
  `void 0, false, { lineNumber: ${line}, columnNumber: ${column} }, this)`;

const PICKS_CODE = [
  "function Picks() {",
  `  return _jsxDEV("ul", { children: [_jsxDEV("li", { children: _jsxDEV(Swatches, {}, ${note(5, 9)} }, ${note(4, 7)}, _jsxDEV("li", { children: _jsxDEV("img", {}, ${note(8, 9)} }, ${note(7, 7)}] }, ${note(3, 5)};`,
  "}",
].join("\n");

describe("relocated against the call's rank", () => {
  test("a frame the map put on another element of the same tag moves to its own", () => {
    const column = (PICKS_CODE.split("\n")[1] ?? "").indexOf('_jsxDEV("li"') + 1;
    const raw = { ...RAW, lineNumber: 2, columnNumber: column };
    const sited = { ...raw, fileName: PICKS.name, lineNumber: 7, columnNumber: 6, isSymbolicated: true };
    const li = { tag: "li", host: true };
    expect(relocated(sited, raw, li, PICKS, null)).toBe(sited);
    expect(relocated(sited, raw, li, PICKS, PICKS_CODE)).toMatchObject({ lineNumber: 4, columnNumber: 6 });
  });
});

describe("appSource", () => {
  const frame: StackFrame = {
    functionName: "Group",
    fileName: "https://app.localhost/src/lib/card.tsx?t=1",
    lineNumber: 285,
    columnNumber: 24,
  };

  test("a frame no map moved keeps its file and drops the transformed module's line", () => {
    expect(appSource(frame, frame.fileName ?? "", "Group", false)).toEqual({
      filePath: "src/lib/card.tsx",
      lineNumber: null,
      columnNumber: null,
      componentName: "Group",
      origin: "app",
      symbolicated: false,
    });
  });

  test("a moved frame, or one on Next.js, keeps its line", () => {
    const moved = { ...frame, lineNumber: 160, columnNumber: 7, isSymbolicated: true };
    expect(appSource(moved, "src/lib/card.tsx", "Group", false)).toMatchObject({
      lineNumber: 160,
      columnNumber: 7,
      symbolicated: true,
    });
    expect(appSource(frame, "/repo/app/page.tsx", "Page", true)).toMatchObject({
      lineNumber: 285,
      columnNumber: 24,
      symbolicated: false,
    });
  });
});

/** A route that imports its icon under another name and builds its install box in a helper. */
const ALIASED = {
  name: "index.tsx?tsr-split=component",
  content: [
    "import { CopyIcon } from 'lucide-react';",
    "const styles = { copy: { gap: 4 } };",
    "function installChoices() {",
    "  return <button><CopyIcon /></button>;",
    "}",
    "function HomePage() {",
    "  return <main>{installChoices()}</main>;",
    "}",
  ].join("\n"),
};

/** The chunk as served: the icon's call on line 3, the helper's on line 6. */
const ALIASED_CODE = [
  'import { CopyIcon } from "/node_modules/.vite/deps/lucide-react.js";',
  "function installChoices() {",
  '  return _jsxDEV("button", { children: _jsxDEV(CopyIcon, {}, void 0, false, {}, this) });',
  "}",
  "function HomePage() {",
  '  return _jsxDEV("main", { children: installChoices() });',
  "}",
].join("\n");

describe("relocated under an alias", () => {
  test("a component written under its import's name is found by the name its call gives", () => {
    const raw = { ...RAW, lineNumber: 3, columnNumber: 40 };
    const wrong = { ...raw, fileName: ALIASED.name, lineNumber: 2, isSymbolicated: true };
    const copy = { tag: "Copy", host: false };
    expect(relocated(wrong, raw, copy, ALIASED, null)).toBe(wrong);
    expect(relocated(wrong, raw, copy, ALIASED, ALIASED_CODE)).toMatchObject({
      lineNumber: 4,
      columnNumber: 17,
    });
  });
});

describe("recalled", () => {
  const raw = { ...RAW, lineNumber: 6, columnNumber: 38 };
  const wrong = { ...raw, fileName: ALIASED.name, lineNumber: 2, isSymbolicated: true };

  test("a frame that calls a helper among the jsx moves to its one call", () => {
    expect(recalled(wrong, raw, ALIASED, ALIASED_CODE)).toMatchObject({
      fileName: ALIASED.name,
      lineNumber: 7,
      columnNumber: 16,
      isSymbolicated: true,
    });
  });

  test("a helper called twice is found in the body of the frame's own function", () => {
    const twice = { ...ALIASED, content: `${ALIASED.content}\nconst again = installChoices();` };
    expect(recalled(wrong, raw, twice, ALIASED_CODE)).toMatchObject({
      lineNumber: 7,
      columnNumber: 16,
    });
  });

  test("a helper called twice with no own call, or no call at the frame, leaves the frame as it is", () => {
    const twice = { ...ALIASED, content: `${ALIASED.content}\nconst again = installChoices();` };
    expect(recalled(wrong, { ...raw, functionName: undefined }, twice, ALIASED_CODE)).toBe(wrong);
    expect(recalled(wrong, { ...raw, functionName: "Other" }, twice, ALIASED_CODE)).toBe(wrong);
    expect(recalled(wrong, { ...raw, columnNumber: 1 }, ALIASED, ALIASED_CODE)).toBe(wrong);
    expect(recalled(wrong, { ...raw, lineNumber: undefined }, ALIASED, ALIASED_CODE)).toBe(wrong);
  });
});

describe("sourceFetch", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    Reflect.deleteProperty(globalThis, "location");
  });

  test("reads the app's own files, and not a package's or another origin's", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "http://localhost:5173/", origin: "http://localhost:5173" },
    });
    const asked: string[] = [];
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      return new Response("code");
    }) as unknown as typeof fetch;
    const app = "http://localhost:5173/src/features/Cart.tsx?t=1";
    const packages = [
      "http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=6b0316c7",
      "http://localhost:5173/node_modules/.vite/deps/@tanstack_react-router.js?v=6b0316c7",
      "http://localhost:5173/node_modules/.vite/deps/react-dom_client.js.map",
      "http://localhost:5173/@fs/repo/node_modules/clsx/dist/clsx.mjs",
    ];
    expect((await sourceFetch(app)).status).toBe(200);
    for (const url of packages) expect((await sourceFetch(url)).status).toBe(404);
    expect((await sourceFetch("https://cdn.example.com/src/App.tsx")).status).toBe(404);
    expect(asked).toEqual([app]);
  });
});

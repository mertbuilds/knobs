import { describe, expect, test } from "bun:test";
import {
  callPlaces,
  calleeAt,
  codeOnly,
  jsxCallee,
  jsxCalls,
  locateCall,
  locateJsx,
  tagPlaces,
} from "../src/grab/locate";

/** A route's file as it is written. The page starts on line 9. */
const SOURCE = `import { useState } from 'react';
import { Row } from '../components/row';

const styles = {
  title: { fontSize: 40 },
  lead: { fontSize: 18 },
};

function HomePage() {
  const [rows] = useState<Row[]>([]);
  return (
    <main>
      <section>
        <h1 className="title">Stop fighting</h1>
        <p>first</p>
      </section>
      <section>
        <p>second</p>
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
        <p>third</p>
      </section>
    </main>
  );
}
`;

function call(tag: string, line: number, column: number, children = ""): string {
  const props = children ? `{ children: [${children}] }` : "{}";
  return `/* @__PURE__ */ _jsxDEV(${tag}, ${props}, void 0, false, {
  fileName: _jsxFileName,
  lineNumber: ${line},
  columnNumber: ${column}
}, this)`;
}

/**
 * The same file as a dev server hands it out once a splitter cut the 5 lines
 * of styles: every line the transform noted is 5 short, and the compiler
 * lifted the last paragraph above the others.
 */
const CODE = `var _jsxFileName = "/repo/src/routes/index.tsx";
function HomePage() {
  const t0 = ${call('"p"', 17, 9)};
  return ${call(
    '"main"',
    7,
    5,
    `${call('"section"', 8, 7, `${call('"h1"', 9, 9)}, ${call('"p"', 10, 9, '"a ) b", `c ${"}"} d`')}`)},
    ${call('"section"', 12, 7, `${call('"p"', 13, 9)}, rows.map((row) => ${call("Row", 15, 11)}), t0`)}`,
  )};
}
`;

/** Where the nth call of `tag` starts in the code, as a stack frame's place. */
function callPlace(tag: string, nth: number): { line: number; column: number } {
  let at = -1;
  for (let count = 0; count <= nth; count++) at = CODE.indexOf(`_jsxDEV(${tag},`, at + 1);
  const before = CODE.slice(0, at).split("\n");
  return { line: before.length, column: before[before.length - 1]?.length ?? 0 };
}

describe("codeOnly", () => {
  test("blanks comments and the insides of strings, and keeps every place", () => {
    const content = [
      "/** Opens a <dialog> on click. */",
      'const label = "<b>"; // a <i> here',
      "const note = `<u>${x}`;",
      "<p>Don't stop: https://example.com <b>now</b></p>",
    ].join("\n");
    const code = codeOnly(content);
    expect(code).toHaveLength(content.length);
    expect(code.split("\n")).toEqual([
      " ".repeat(33),
      `const label = "   ";${" ".repeat(14)}`,
      "const note = `       `;",
      "<p>Don t stop: https://example.com <b>now</b></p>",
    ]);
  });

  test("a backtick after a word opens a tagged template", () => {
    const content = ["const Title = styled.h1`", "  <b>", "`;", "const q = css`<i>`;", "<Row />"].join(
      "\n",
    );
    expect(codeOnly(content).split("\n")).toEqual([
      "const Title = styled.h1`",
      "     ",
      "`;",
      "const q = css`   `;",
      "<Row />",
    ]);
  });
});

describe("tagPlaces", () => {
  test("lists every opening of the tag, not its closings, longer names or type arguments", () => {
    expect(tagPlaces(SOURCE, "h1")).toEqual([{ line: 14, column: 8 }]);
    expect(tagPlaces(SOURCE, "p").map((place) => place.line)).toEqual([15, 18, 22]);
    expect(tagPlaces(SOURCE, "Row")).toEqual([{ line: 20, column: 10 }]);
    expect(tagPlaces(SOURCE, "sec")).toEqual([]);
  });

  test("leaves out tags in comments and strings", () => {
    const source = `/**\n * A <dialog> that opens.\n */\nconst tip = "<dialog>";\nconst a = <dialog open />;`;
    expect(tagPlaces(source, "dialog")).toEqual([{ line: 5, column: 10 }]);
  });
});

describe("tagPlaces after tagged templates", () => {
  test("finds every tag past styled and css templates", () => {
    const content = [
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
    ].join("\n");
    expect(tagPlaces(content, "Row")).toEqual([
      { line: 5, column: 9 },
      { line: 9, column: 9 },
    ]);
  });
});

describe("locateJsx", () => {
  test("a tag written once is found without the code", () => {
    expect(locateJsx(SOURCE, "h1", true, null, null)).toEqual({ line: 14, column: 8 });
    expect(locateJsx(SOURCE, "Row", false, null, null)).toEqual({ line: 20, column: 10 });
  });

  test("a tag written more than once needs the code and the call", () => {
    expect(locateJsx(SOURCE, "p", true, null, null)).toBeNull();
    expect(locateJsx(SOURCE, "p", true, CODE, null)).toBeNull();
    expect(locateJsx(SOURCE, "article", true, CODE, callPlace('"p"', 0))).toBeNull();
  });

  test("the transform's notes rank the calls in the source's order, lifted ones too", () => {
    const lines = [0, 1, 2].map(
      (nth) => locateJsx(SOURCE, "p", true, CODE, callPlace('"p"', nth))?.line,
    );
    expect(lines).toEqual([22, 15, 18]);
    expect(locateJsx(SOURCE, "section", true, CODE, callPlace('"section"', 1))).toEqual({
      line: 17,
      column: 6,
    });
  });

  test("gives nothing when the calls and the tags do not pair up", () => {
    const extra = `${CODE}\nconst more = ${call('"p"', 30, 3)};`;
    expect(locateJsx(SOURCE, "p", true, extra, callPlace('"p"', 0))).toBeNull();
    const noted = CODE.replace("lineNumber: 13,", "line: 13,");
    expect(locateJsx(SOURCE, "p", true, noted, callPlace('"p"', 0))).toBeNull();
    expect(locateJsx(SOURCE, "p", true, CODE, { line: 1, column: 0 })).toBeNull();
  });
});

/** A label, and a row of samples whose key comes after a spread. */
const CARD = `export function Group({ label }) {
  return (
    <div>
      <span {...props(styles.groupLabel)}>{label}</span>
    </div>
  );
}

export function Swatches({ fills }) {
  return (
    <div aria-hidden="true">
      {fills.map((fill, index) => (
        <span {...props(styles.swatch, fill)} key={index} />
      ))}
    </div>
  );
}
`;

/**
 * The same file out of the dev server. The transform writes the sample as a
 * `createElement` call, its place in its props, and the compiler lifted it out.
 */
const CARD_CODE = `function _temp(fill, index) {
  return /* @__PURE__ */ _createElement("span", {
    ...props(styles.swatch, fill),
    key: index,
    __self: this,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 13,
      columnNumber: 9
    }
  });
}
function Group(t0) {
  return ${call('"div"', 3, 5, call('"span"', 4, 7))};
}
`;

describe("locateJsx with createElement", () => {
  test("counts a createElement call among the tag's calls and ranks it by its props' note", () => {
    const created = placeIn(CARD_CODE, '_createElement("span"');
    expect(locateJsx(CARD, "span", true, CARD_CODE, created)).toEqual({ line: 13, column: 8 });
    const label = placeIn(CARD_CODE, '_jsxDEV("span"');
    expect(locateJsx(CARD, "span", true, CARD_CODE, label)).toEqual({ line: 4, column: 6 });
  });

  test("gives nothing when the createElement call carries no note", () => {
    const bare = CARD_CODE.replace(/__source: \{[^}]*\}/, "__source: void 0");
    const created = placeIn(bare, '_createElement("span"');
    expect(locateJsx(CARD, "span", true, bare, created)).toBeNull();
  });
});

/** A file that imports its icons under other names, and builds part of its page in a helper. */
const ALIASED = `import { CheckIcon, CopyIcon } from 'lucide-react';

const styles = { copy: { gap: 4 } };

function CopyButton({ copied }) {
  const icon = copied ? <CheckIcon /> : <CopyIcon />;
  return <button>{icon}</button>;
}

/** What \`installChoices()\` gives. */
function installChoices() {
  return <CopyButton copied={false} />;
}

const later = () => {
  trackClick();
};

function HomePage() {
  return <main>{installChoices()}</main>;
}
`;

/** The same file out of the dev server, its icons' calls on one line as the compiler leaves them. */
const ALIASED_CODE = `import { CheckIcon, CopyIcon } from "/node_modules/.vite/deps/lucide-react.js";
function CopyButton(t0) {
  t1 = copied ? ${call("CheckIcon", 1, 25)} : ${call("CopyIcon", 1, 51)};
}
function installChoices() {
  return ${call("CopyButton", 6, 10)};
}
function HomePage() {
  return ${call('"main"', 13, 10, "installChoices()")};
}
`;

function placeIn(code: string, text: string): { line: number; column: number } {
  const before = code.slice(0, code.indexOf(text)).split("\n");
  return { line: before.length, column: before[before.length - 1]?.length ?? 0 };
}

describe("jsxCallee", () => {
  test("is the name a component's call gives, and nothing for a host tag or no call", () => {
    expect(jsxCallee(ALIASED_CODE, placeIn(ALIASED_CODE, "_jsxDEV(CopyIcon"))).toBe("CopyIcon");
    expect(jsxCallee(ALIASED_CODE, placeIn(ALIASED_CODE, "_jsxDEV(CheckIcon"))).toBe("CheckIcon");
    expect(jsxCallee(ALIASED_CODE, placeIn(ALIASED_CODE, '_jsxDEV("main"'))).toBeNull();
    expect(jsxCallee(ALIASED_CODE, { line: 1, column: 0 })).toBeNull();
    expect(jsxCallee(ALIASED_CODE, { line: 99, column: 0 })).toBeNull();
  });
});

describe("locateJsx under an alias", () => {
  test("finds the tag by the name the call gives, where the component's own is not written", () => {
    expect(locateJsx(ALIASED, "Copy", false, null, null)).toBeNull();
    const call = placeIn(ALIASED_CODE, "_jsxDEV(CopyIcon");
    expect(locateJsx(ALIASED, "Copy", false, ALIASED_CODE, call)).toEqual({ line: 6, column: 40 });
    const check = placeIn(ALIASED_CODE, "_jsxDEV(CheckIcon");
    expect(locateJsx(ALIASED, "Check", false, ALIASED_CODE, check)).toEqual({
      line: 6,
      column: 24,
    });
  });
});

describe("calleeAt", () => {
  test("is the function a plain call names, from its name or its parenthesis", () => {
    const at = placeIn(ALIASED_CODE, "installChoices()");
    expect(calleeAt(ALIASED_CODE, at)).toBe("installChoices");
    expect(calleeAt(ALIASED_CODE, { ...at, column: at.column + "installChoices".length })).toBe(
      "installChoices",
    );
    expect(calleeAt(ALIASED_CODE, { line: 1, column: 0 })).toBeNull();
    expect(calleeAt(ALIASED_CODE, { line: 99, column: 0 })).toBeNull();
  });
});

describe("callPlaces", () => {
  test("lists the calls of a function, not its declaration, longer names or comments", () => {
    expect(callPlaces(ALIASED, "installChoices")).toEqual([{ line: 20, column: 16 }]);
    expect(callPlaces(ALIASED, "trackClick")).toEqual([{ line: 16, column: 2 }]);
    expect(callPlaces(ALIASED, "Choices")).toEqual([]);
  });
});

describe("locateCall", () => {
  test("puts a call where the function is called once", () => {
    expect(locateCall(ALIASED, ALIASED_CODE, placeIn(ALIASED_CODE, "installChoices()"))).toEqual({
      line: 20,
      column: 16,
    });
  });

  test("gives nothing for a function called more than once, or no call", () => {
    const twice = `${ALIASED}const again = installChoices();\n`;
    expect(locateCall(twice, ALIASED_CODE, placeIn(ALIASED_CODE, "installChoices()"))).toBeNull();
    expect(locateCall(ALIASED, ALIASED_CODE, { line: 1, column: 0 })).toBeNull();
  });

  test("a function called more than once is found in the body of the function that calls it", () => {
    const at = placeIn(HELPERS_CODE, "promptBox(\"setup\")");
    expect(locateCall(HELPERS, HELPERS_CODE, at, "installChoices")).toEqual({
      line: 13,
      column: 7,
    });
    expect(locateCall(HELPERS, HELPERS_CODE, at, "Tour")).toEqual({ line: 19, column: 19 });
    expect(locateCall(HELPERS, HELPERS_CODE, at)).toBeNull();
    expect(locateCall(HELPERS, HELPERS_CODE, at, "Landing")).toBeNull();
    expect(locateCall(HELPERS, HELPERS_CODE, at, "missing")).toBeNull();
  });

  test("finds the caller's body past an apostrophe in its jsx", () => {
    const content = HELPERS.replace("<div>", "<div>\n      <p>Don't miss</p>");
    const at = placeIn(HELPERS_CODE, "promptBox(\"setup\")");
    expect(locateCall(content, HELPERS_CODE, at, "installChoices")).toEqual({
      line: 14,
      column: 7,
    });
  });
});

/** A helper called from two places: another helper and an arrow component. */
const HELPERS = `// promptBox() makes the setup prompt.
function promptBox(name: string, style?: Style) {
  return <CodeBox name={name} style={style} />;
}

/**
 * The setup prompt, then npm. Calls promptBox("setup").
 */
function installChoices(): ReactNode {
  const note = "promptBox(x)";
  return (
    <div>
      {promptBox("setup")}
    </div>
  );
}

const Tour = ({ install }: { install: ReactNode }) => (
  <aside>{install}{promptBox("tour")}</aside>
);

function Landing() {
  return <main>{installChoices()}<Tour install={null} /></main>;
}
`;

const HELPERS_CODE = `function installChoices() {
  return _jsxDEV("div", { children: promptBox("setup") });
}
`;

/** The scan before it learned where a name starts, to check the new one finds the same calls. */
function oldCalls(code: string, tag: string, host: boolean) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const name = host ? `["']${escaped}["']` : escaped;
  const pattern = new RegExp(`[\\w$.]*(jsxs?(?:DEV)?|createElement)\\(\\s*${name}\\s*,`, "g");
  return Array.from(code.matchAll(pattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    open: match.index + match[0].indexOf("("),
    created: match[1] === "createElement",
  }));
}

/** A dev module's inline source map: one long run of base64, as Vite puts at a module's end. */
const mapOf = (runs: number) =>
  `\n//# sourceMappingURL=data:application/json;base64,${"eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpb".repeat(runs)}\n`;
const MAP = mapOf(1500);

/** The best of several timed runs, in ms, so one slow run on a busy machine does not count. */
function fastest(run: () => void) {
  let best = Infinity;
  for (let round = 0; round < 9; round++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe("jsxCalls", () => {
  test("finds the same calls as a scan that tries every start", () => {
    const code = [
      CODE,
      'React.jsx("p", {}); a.b.jsxs( "p" , {}); $jsxDEV("p", {}); xjsx("p", {}); (jsx)("p", {});',
      "jsxDEV(Row, {}); _jsxs(Rows, {}); jsx(Row,{}); jsx(Row.Item, {});",
      '_createElement("p", {}); React.createElement(Row, {}); xcreateElement("p", {});',
    ].join("\n");
    for (const [tag, host] of [
      ["p", true],
      ["section", true],
      ["Row", false],
      ["Row.Item", false],
    ] as const) {
      expect(jsxCalls(code, tag, host)).toEqual(oldCalls(code, tag, host));
      expect(jsxCalls(`${code}${MAP}`, tag, host)).toEqual(oldCalls(code, tag, host));
    }
    expect(jsxCalls(CODE, "p", true)).toHaveLength(3);
  });

  test("runs in linear time over a long inline source map", () => {
    // Four times the map should take about four times as long; a quadratic scan takes sixteen.
    const short = `${CODE}${mapOf(250)}`;
    const long = `${CODE}${mapOf(1000)}`;
    fastest(() => jsxCalls(short, "p", true));
    const ratio = fastest(() => jsxCalls(long, "p", true)) / fastest(() => jsxCalls(short, "p", true));
    expect(ratio).toBeLessThan(8);
  });
});

import { describe, expect, test } from "bun:test";
import { indentOf, jsonEntries, jsonLeaf, jsonPreview, langOf, tokenLines, tokens } from "../src/ui/syntax";

/** The colored pieces of a text, plain ones left out. */
function colored(text: string, lang: Parameters<typeof tokens>[1]): [string, string][] {
  return tokens(text, lang).filter(([kind]) => kind !== "");
}

describe("the kind of code", () => {
  test("is read from the content type", () => {
    expect(langOf("application/json; charset=utf-8")).toBe("json");
    expect(langOf("application/problem+json")).toBe("json");
    expect(langOf("text/html")).toBe("html");
    expect(langOf("image/svg+xml")).toBe("html");
    expect(langOf("application/xml")).toBe("html");
    expect(langOf("text/css")).toBe("css");
    expect(langOf("text/javascript")).toBe("js");
    expect(langOf("application/ecmascript")).toBe("js");
    expect(langOf("text/plain")).toBe("text");
    expect(langOf("")).toBe("text");
  });
});

describe("the tokens", () => {
  test("json: a key is a string before a colon, the rest are values", () => {
    expect(colored('{"id": 7, "name": "Ada", "ok": true, "none": null, "n": -1.5e3}', "json")).toEqual([
      ["key", '"id"'],
      ["num", "7"],
      ["key", '"name"'],
      ["str", '"Ada"'],
      ["key", '"ok"'],
      ["kw", "true"],
      ["key", '"none"'],
      ["kw", "null"],
      ["key", '"n"'],
      ["num", "-1.5e3"],
    ]);
  });

  test("json: an escaped quote stays inside its string", () => {
    expect(colored('{"a": "say \\"hi\\""}', "json")).toEqual([
      ["key", '"a"'],
      ["str", '"say \\"hi\\""'],
    ]);
  });

  test("js: comments, strings, numbers and keywords, a name that holds one left plain", () => {
    expect(colored("const constant = 'a'; // note\nreturn 0x1f /* b */", "js")).toEqual([
      ["kw", "const"],
      ["str", "'a'"],
      ["com", "// note"],
      ["kw", "return"],
      ["num", "0x1f"],
      ["com", "/* b */"],
    ]);
  });

  test("css: selectors and at-rules outside a block, names and values inside", () => {
    expect(colored("@media print { a:hover { color: #fff; margin: 0 4px !important } }", "css")).toEqual([
      ["kw", "@media"],
      ["tag", "print"],
      ["tag", "a:hover"],
      ["key", "color"],
      ["num", "#fff"],
      ["key", "margin"],
      ["num", "0"],
      ["num", "4px"],
      ["kw", "!important"],
    ]);
  });

  test("html: tags, attribute names, their values and comments, the text plain", () => {
    expect(colored('<!-- c --><a href="/x" hidden>hi</a>', "html")).toEqual([
      ["com", "<!-- c -->"],
      ["tag", "<a"],
      ["attr", "href"],
      ["str", '"/x"'],
      ["attr", "hidden"],
      ["tag", ">"],
      ["tag", "</a>"],
    ]);
    expect(tokens("<p>a > b</p>", "html").map(([, text]) => text).join("")).toBe("<p>a > b</p>");
  });

  test("put together, the pieces are the text, whatever the kind", () => {
    const texts = ['{"a":[1,"x\\n",{}]}', "let a = `x\n${b}`;", "a{b:c}", "<div a='1'>x</div>", "plain"];
    for (const text of texts) {
      for (const lang of ["json", "js", "css", "html", "text"] as const) {
        expect(tokens(text, lang).map(([, piece]) => piece).join("")).toBe(text);
      }
    }
  });

  test("a line at a time: a piece over lines is cut where they end", () => {
    expect(tokenLines("/* a\nb */ x\n", "js")).toEqual([[["com", "/* a"]], [["com", "b */"], ["", " x"]], []]);
    expect(tokenLines("", "text")).toEqual([[]]);
  });

  test("how far in a line starts, a tab as two", () => {
    expect(indentOf('    "a": 1')).toBe(4);
    expect(indentOf("\t\tx")).toBe(4);
    expect(indentOf("x")).toBe(0);
  });
});

describe("json as a tree", () => {
  test("a leaf is its text, colored for what it is", () => {
    expect(jsonLeaf("Ada")).toEqual(["str", '"Ada"']);
    expect(jsonLeaf(7)).toEqual(["num", "7"]);
    expect(jsonLeaf(false)).toEqual(["kw", "false"]);
    expect(jsonLeaf(null)).toEqual(["kw", "null"]);
  });

  test("a node holds its keys, an array's by index", () => {
    expect(jsonEntries({ a: 1, b: [2] })).toEqual([
      ["a", 1],
      ["b", [2]],
    ]);
    expect(jsonEntries(["x", "y"])).toEqual([
      ["0", "x"],
      ["1", "y"],
    ]);
  });

  test("a node's preview is its values in short, a level down only by kind", () => {
    expect(jsonPreview({ id: 7, name: "Ada", tags: ["a", "b"], meta: { x: 1 } })).toBe(
      '{id: 7, name: "Ada", tags: Array(2), meta: {…}}',
    );
    expect(jsonPreview([1, "two", null])).toBe('[1, "two", null]');
    expect(jsonPreview({})).toBe("{}");
    expect(jsonPreview([])).toBe("[]");
  });

  test("a long preview is cut with … before it is too long", () => {
    const preview = jsonPreview({ a: "x".repeat(30), b: "y".repeat(30), c: "z".repeat(30), d: 1 }, 80);
    expect(preview.length).toBeLessThanOrEqual(80);
    expect(preview.endsWith(", …}")).toBe(true);
    expect(jsonPreview({ a: "x".repeat(200) }, 80)).toBe("{…}");
  });
});

describe("a leaf of a json tree", () => {
  test("a string shows quoted, a line break in it as its escape, as the browsers' preview has it", () => {
    expect(jsonLeaf("a\r\nb")).toEqual(["str", '"a\\r\\nb"']);
  });
});

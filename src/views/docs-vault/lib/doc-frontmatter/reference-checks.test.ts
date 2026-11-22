import { describe, expect, it } from "vitest";
import { collectCodeLocations, collectDanglingRefs, collectMisfiledRefs } from "./reference-checks";

const folder = new Set(["capabilities/stock", "elements/cart", "domains/shop"]);
const resolveRef = (token: string) => (folder.has(token) ? token : null);
const KINDS: Record<string, string> = {
  "capabilities/stock": "capability",
  "elements/cart": "element",
  "domains/shop": "domain",
};
const kindOf = (slug: string) => KINDS[slug] ?? null;

describe("collectDanglingRefs", () => {
  it("names each reference the folder has no document for, once", () => {
    const frontmatter = {
      capabilities: ["capabilities/stock", "capabilities/gone"],
      depends_on: ["capabilities/gone", "elements/cart"],
      domain: "domains/missing",
    };
    expect(collectDanglingRefs(frontmatter, resolveRef).sort()).toEqual(["capabilities/gone", "domains/missing"]);
  });

  it("does not accuse a code path listed under elements, nor a key that holds no references", () => {
    expect(
      collectDanglingRefs({ elements: ["src/features/cart/index.ts"], status: "active", title: "x/y" }, resolveRef),
    ).toEqual([]);
  });

  it("finds nothing in a document without frontmatter", () => {
    expect(collectDanglingRefs(undefined, resolveRef)).toEqual([]);
  });
});

describe("collectCodeLocations", () => {
  it("keeps only code paths, trimmed and deduplicated, in the order written", () => {
    expect(
      collectCodeLocations([" src/a/b.ts ", "elements/cart", "src/a/b.ts", 3, "", "src/z/y.tsx"]),
    ).toEqual(["src/a/b.ts", "src/z/y.tsx"]);
  });

  it("is empty for a value that is not a list", () => {
    expect(collectCodeLocations("src/a/b.ts")).toEqual([]);
    expect(collectCodeLocations(undefined)).toEqual([]);
  });
});

describe("collectMisfiledRefs", () => {
  it("reports an entry that resolves to a document of another kind than its list names", () => {
    const frontmatter = {
      capabilities: ["capabilities/stock", "elements/cart"],
      domain: "domains/shop",
    };
    expect(collectMisfiledRefs(frontmatter, resolveRef, kindOf)).toEqual([
      { token: "elements/cart", key: "capabilities", kind: "element" },
    ]);
  });

  it("reports a domain pointing at a non-domain, and each list entry once", () => {
    const frontmatter = { domain: "capabilities/stock", elements: ["capabilities/stock", "capabilities/stock"] };
    expect(collectMisfiledRefs(frontmatter, resolveRef, kindOf)).toEqual([
      { token: "capabilities/stock", key: "elements", kind: "capability" },
      { token: "capabilities/stock", key: "domain", kind: "capability" },
    ]);
  });

  it("skips references nothing answers to, which the dangling check reports", () => {
    expect(collectMisfiledRefs({ capabilities: ["capabilities/gone"] }, resolveRef, kindOf)).toEqual([]);
  });
});

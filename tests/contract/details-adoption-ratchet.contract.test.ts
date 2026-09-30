import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { judgeRatchet } from "./lib/ratchet-base";

const FALLBACK_CEILING = 16;
const OWNER = "src/shared/ui/disclosure.tsx";

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

function countDetails(source: string): number {
  const file = ts.createSourceFile("probe.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  let count = 0;
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === "details") count += 1;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

function scan(root = process.cwd()) {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (rel === OWNER) continue;
      const n = countDetails(readFileSync(file, "utf8"));
      if (n) {
        byFile.set(rel, n);
        total += n;
      }
    }
  }
  return { byFile, total };
}

describe("raw details adoption ratchet", () => {
  const census = scan();

  it("raw <details> elements outside Disclosure do not grow", () => {
    const verdict = judgeRatchet({
      gate: "raw-details-elements",
      measure: (root) => (root === process.cwd() ? census : scan(root)).total,
      reads: ["src", "app"],
      fallback: FALLBACK_CEILING,
    });
    expect(
      verdict.current,
      `Raw <details> elements reached ${verdict.current}, over the ceiling ${verdict.ceiling}.\n${verdict.explain}\n` +
        "Use `Disclosure` from `@/shared/ui/disclosure`: it opens through `RowDisclosure`, so the rows below move instead of jumping.\n" +
        [...census.byFile.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it("counts JSX elements, not the word in strings, comments or selectors", () => {
    expect(countDetails(`const a = <details open><summary>x</summary></details>;`)).toBe(1);
    expect(countDetails(`const b = <details />;`)).toBe(1);
    expect(countDetails(`// <details>\nconst c = "<details>"; const d = el.querySelector('details');`)).toBe(0);
    expect(countDetails(`const e = <Disclosure summary="x">y</Disclosure>;`)).toBe(0);
  });
});

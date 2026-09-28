import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { judgeRatchet } from "./lib/ratchet-base";

const FALLBACK_CEILING = 7;
const TAB_BAR = "src/shared/ui/tab-bar.tsx";

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function attributeValue(attr: ts.JsxAttribute): string | null {
  const init = attr.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) {
    return init.expression.text;
  }
  return null;
}

function countAttributes(source: string, name: string, value: string | null): number {
  const file = ts.createSourceFile("x.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  let n = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === name &&
      (value === null || attributeValue(node) === value)
    ) {
      n += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return n;
}

function rawTabs(root: string): number {
  let total = 0;
  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (rel === TAB_BAR) continue;
      total += countAttributes(readFileSync(file, "utf8"), "role", "tab");
    }
  }
  return total;
}

describe("tab adoption ratchet", () => {
  it("hand-rolled role=tab elements outside TabBar never grow", () => {
    const judged = judgeRatchet({
      gate: "raw-tab-roles",
      measure: rawTabs,
      reads: ["src", "app"],
      fallback: FALLBACK_CEILING,
    });
    expect(judged.current, judged.explain).toBeLessThanOrEqual(judged.ceiling);
  });

  it("counts JSX attributes, not selector strings", () => {
    expect(countAttributes(`const s = '[role="tab"]'; const a = <b role="tab" />; const c = <i role={"tab"} />;`, "role", "tab")).toBe(2);
  });

  it.each([TAB_BAR, "src/shared/ui/segmented-control.tsx"])("%s draws exactly one selection indicator", (file) => {
    expect(countAttributes(readFileSync(file, "utf8"), "data-selection-indicator", null)).toBe(1);
  });
});

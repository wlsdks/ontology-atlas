import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { judgeRatchet } from "./lib/ratchet-base";

const FALLBACK_CEILING = 28;

const CHECK_TAGS = new Set(["Check", "CheckCircle2", "CircleCheck"]);
const OWNERS = ["src/shared/motion/", "src/shared/ui/compact-copy-button.tsx"];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

function isCheckElement(node: ts.Expression): boolean {
  let n: ts.Node = node;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  const tag = ts.isJsxSelfClosingElement(n)
    ? n.tagName
    : ts.isJsxElement(n)
      ? n.openingElement.tagName
      : null;
  return tag !== null && ts.isIdentifier(tag) && CHECK_TAGS.has(tag.text);
}

function countIn(source: string): number {
  const file = ts.createSourceFile("x.tsx", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isConditionalExpression(node) && (isCheckElement(node.whenTrue) || isCheckElement(node.whenFalse))) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

function scan(root = process.cwd()) {
  const byFile = new Map<string, number>();
  let total = 0;
  let scanned = 0;
  for (const file of walk(path.join(root, "src"))) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (OWNERS.some((owner) => rel.startsWith(owner))) continue;
    scanned += 1;
    const n = countIn(readFileSync(file, "utf8"));
    if (n) {
      byFile.set(rel, n);
      total += n;
    }
  }
  return { byFile, total, scanned };
}

describe("action feedback adoption ratchet", () => {
  const census = scan();

  it("scans real files", () => {
    expect(census.scanned).toBeGreaterThan(300);
  });

  it("hand-swapped result checks do not grow", () => {
    const verdict = judgeRatchet({
      gate: "hand-swapped-result-checks",
      measure: (root) => (root === process.cwd() ? census : scan(root)).total,
      reads: ["src"],
      fallback: FALLBACK_CEILING,
    });
    expect(
      verdict.current,
      `Hand-swapped result checks reached ${verdict.current}, over ${verdict.ceiling}.\n${verdict.explain}\n` +
        "A hand-swapped check has no dwell, failure mark or announcement. Use useCopyFeedback with FeedbackGlyph (src/shared/motion/feedback-glyph.tsx) or CompactCopyButton.\n" +
        [...census.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });

  it("probe: catches a hand swap and ignores a plain check or the glyph", () => {
    expect(countIn("const a = copied ? <Check size={12} /> : <Clipboard />;")).toBe(1);
    expect(countIn("const a = ok ? (<CircleCheck />) : null;")).toBe(1);
    expect(countIn("const a = <Check />;")).toBe(0);
    expect(countIn("const a = <FeedbackGlyph state={s} icon={<Clipboard />} size={12} />;")).toBe(0);
    expect(countIn("const a = ok ? <CheckCheck /> : null;")).toBe(0);
  });
});

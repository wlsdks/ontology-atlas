import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";
import { judgeRatchet } from "./lib/ratchet-base";

const FALLBACK_CEILING = 14;

const TRANSFORM_CLAIM = /(?<![\w-])(?:transition-\[[^\]\s]*\btransform\b[^\]\s]*\]|transform-none)(?![\w-])/g;
const INDIVIDUAL = /(?<![\w-])-?(?:translate|rotate|scale)-(?:[xyz]-)?[\w[\]().%/-]+/;

function countMismatches(source: string): number {
  const src = stripComments(source);
  if (!INDIVIDUAL.test(src)) return 0;
  return [...src.matchAll(TRANSFORM_CLAIM)].length;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

function scan(root = process.cwd()) {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(root, dir))) {
      const n = countMismatches(readFileSync(file, "utf8"));
      if (!n) continue;
      byFile.set(path.relative(root, file).split(path.sep).join("/"), n);
      total += n;
    }
  }
  return { byFile, total };
}

describe("transform property mismatch ratchet", () => {
  const census = scan();

  it("catches a planted mismatch and passes the translate form", () => {
    expect(countMismatches(`'transition-[color,transform] active:translate-y-px'`)).toBe(1);
    expect(countMismatches(`'motion-reduce:transform-none hover:-translate-y-0.5'`)).toBe(1);
    expect(countMismatches(`'transition-[color,translate] active:translate-y-px'`)).toBe(0);
    expect(countMismatches(`'transition-[transform] [transform:rotate(180deg)]'`)).toBe(0);
  });

  it("does not grow", () => {
    const verdict = judgeRatchet({
      gate: "transform-property-mismatch",
      measure: (root) => (root === process.cwd() ? census : scan(root)).total,
      reads: ["src", "app"],
      fallback: FALLBACK_CEILING,
    });
    expect(
      verdict.current,
      `Transform-property mismatches reached ${verdict.current}, over ${verdict.ceiling}.\n${verdict.explain}\n` +
        "Transition `translate`/`rotate`/`scale` (CONTROL_TRANSITION) and clear with `translate-none`.\n" +
        [...census.byFile.entries()].map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });
});

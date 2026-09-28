import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";
import { judgeRatchet } from "./lib/ratchet-base";

const FALLBACK_CEILING = 90;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

function callBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/controlClass\(\{/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + "controlClass(".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (!depth) {
          i += 1;
          break;
        }
      }
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

const HOVERLESS = (block: string) => !/hover/.test(block) && !/\bactive:\s*true\b/.test(block);

function scan(root = process.cwd()) {
  const byFile = new Map<string, number>();
  let total = 0;
  let calls = 0;
  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(root, dir))) {
      const blocks = callBlocks(stripComments(readFileSync(file, "utf8")));
      calls += blocks.length;
      const n = blocks.filter(HOVERLESS).length;
      if (!n) continue;
      byFile.set(path.relative(root, file).split(path.sep).join("/"), n);
      total += n;
    }
  }
  return { byFile, total, calls };
}

describe("hover presence ratchet", () => {
  const census = scan();

  it("the census parses real calls and catches a planted hoverless control", () => {
    expect(census.calls).toBeGreaterThan(200);
    expect(callBlocks(`controlClass({ shape: 'chip' })`).filter(HOVERLESS)).toHaveLength(1);
    expect(callBlocks(`controlClass({ shape: 'chip', hoverInk: 'strong' })`).filter(HOVERLESS)).toHaveLength(0);
    expect(callBlocks(`controlClass({ shape: 'row', className: 'hover:bg-x' })`).filter(HOVERLESS)).toHaveLength(0);
  });

  it("pressables without hover do not grow", () => {
    const verdict = judgeRatchet({
      gate: "hoverless-pressables",
      measure: (root) => (root === process.cwd() ? census : scan(root)).total,
      reads: ["src", "app"],
      fallback: FALLBACK_CEILING,
    });
    expect(
      verdict.current,
      `controlClass calls with no hover reached ${verdict.current}, over ${verdict.ceiling}.\n${verdict.explain}\n` +
        "Give the control `hoverInk`, `hoverSurface` or `hoverBorder`.\n" +
        [...census.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });
});

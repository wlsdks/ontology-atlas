import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../scripts/lib/static-surface-census.mjs";
import { judgeRatchet } from "./lib/ratchet-base";

const FALLBACK_CEILING = 20;
const REGISTRIES = ["tests/contract/control-adoption/buttons", "tests/contract/control-adoption/anchors"];
const PRESS_EVIDENCE = /(?<![\w-])active:(?=[\w[-])|\bbuttonVariants\(|\bCONTROL_PRESS_TRAVEL\b/g;

function pressCount(source: string): number {
  return [...stripComments(source).matchAll(PRESS_EVIDENCE)].length;
}

function scan(root = process.cwd()) {
  const short = new Map<string, number>();
  let deficit = 0;
  let records = 0;
  for (const dir of REGISTRIES) {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).filter((n) => n.endsWith(".json"))) {
      const { file, count } = JSON.parse(readFileSync(path.join(abs, name), "utf8")) as { file: string; count: number };
      records += 1;
      const target = path.join(root, file);
      const have = existsSync(target) ? pressCount(readFileSync(target, "utf8")) : 0;
      const missing = Math.max(0, count - have);
      if (!missing) continue;
      short.set(`${dir.split("/").pop()}/${name}`, missing);
      deficit += missing;
    }
  }
  return { short, deficit, records };
}

describe("registered press ratchet", () => {
  const census = scan();

  it("reads the registries and counts press evidence", () => {
    expect(census.records).toBeGreaterThan(20);
    expect(pressCount(`'active:bg-[color:var(--x)] hover:bg-y'`)).toBe(1);
    expect(pressCount(`controlClass({ active: true })`)).toBe(0);
    expect(pressCount(`buttonVariants({ size: 'sm' })`)).toBe(1);
  });

  it("registered positions without press only fall", () => {
    const verdict = judgeRatchet({
      gate: "registered-press-deficit",
      measure: (root) => (root === process.cwd() ? census : scan(root)).deficit,
      reads: ["src", "app", ...REGISTRIES],
      fallback: FALLBACK_CEILING,
    });
    expect(
      verdict.current,
      `Registered positions without press reached ${verdict.current}, over ${verdict.ceiling}.\n${verdict.explain}\n` +
        [...census.short.entries()].map(([f, n]) => `  ${n} ${f}`).join("\n"),
    ).toBeLessThanOrEqual(verdict.ceiling);
  });
});

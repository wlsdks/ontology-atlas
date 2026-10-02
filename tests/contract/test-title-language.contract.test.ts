import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { areaGate, changedPaths, sourceArea } from "../../scripts/quality/source-areas.mjs";
import { nonLatinTestTitles, isTestSourcePath } from "../../scripts/quality/source-language/test-titles.mjs";
import { judgeRatchet, resolveRatchetBase } from "./lib/ratchet-base";

const base = resolveRatchetBase();
const changed = changedPaths(base).filter(isTestSourcePath);

function hangulIn(root: string, path: string) {
  const file = join(root, path);
  return existsSync(file) ? nonLatinTestTitles(path, readFileSync(file, "utf8")) : [];
}

describe("test titles and assertion messages", () => {
  it("add no Han, kana or Hangul in any area this change touches", () => {
    const areas = new Map<string, string[]>();
    for (const path of changed) {
      const area = sourceArea(path)!;
      areas.set(area, [...(areas.get(area) ?? []), path]);
    }
    const failures: string[] = [];
    for (const [area, paths] of areas) {
      const judgement = judgeRatchet({
        gate: areaGate("test-title-hangul", area),
        measure: (root) => paths.reduce((sum, path) => sum + hangulIn(root, path).length, 0),
        reads: changed,
        fallback: Number.POSITIVE_INFINITY,
        base,
      });
      if (judgement.current <= judgement.ceiling) continue;
      const offenders = paths.flatMap((path) =>
        hangulIn(process.cwd(), path).map((entry) => `  ${path}:${entry.line} ${entry.kind} ${entry.text}`),
      );
      failures.push([`${judgement.gate}: ${judgement.current} > ${judgement.ceiling}`, ...offenders, judgement.explain].join("\n"));
    }
    expect(failures, failures.join("\n\n")).toEqual([]);
  });
});

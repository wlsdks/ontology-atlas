import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { areaGate, changedPaths, sourceArea } from "../../scripts/quality/source-areas.mjs";
import { extractCommentTokens, isSupportedSourcePath } from "../../scripts/quality/source-language/inventory.mjs";
import { judgeRatchet, resolveRatchetBase } from "./lib/ratchet-base";

/**
 * Comments carry only current reasons the code cannot show (`.claude/rules/architecture.md`,
 * "Code explains itself"), so comment bytes per area only fall. Only files this change
 * touches are measured, at the merge base and here.
 */

const base = resolveRatchetBase();
const changed = changedPaths(base).filter(isSupportedSourcePath);

function commentBytes(root: string, path: string): number {
  const file = join(root, path);
  if (!existsSync(file)) return 0;
  return extractCommentTokens(path, readFileSync(file, "utf8")).reduce(
    (sum: number, token: { text: string }) => sum + Buffer.byteLength(token.text),
    0,
  );
}

describe("source comment bytes", () => {
  it("do not grow in any area this change touches", () => {
    const areas = new Map<string, string[]>();
    for (const path of changed) {
      const area = sourceArea(path)!;
      areas.set(area, [...(areas.get(area) ?? []), path]);
    }
    const failures: string[] = [];
    for (const [area, paths] of areas) {
      const judgement = judgeRatchet({
        gate: areaGate("comment-bytes", area),
        measure: (root) => paths.reduce((sum, path) => sum + commentBytes(root, path), 0),
        reads: changed,
        fallback: Number.POSITIVE_INFINITY,
        base,
      });
      if (judgement.current > judgement.ceiling) {
        failures.push(`${judgement.gate}: ${judgement.current} > ${judgement.ceiling} bytes\n${judgement.explain}`);
      }
    }
    expect(failures, failures.join("\n\n")).toEqual([]);
  });
});

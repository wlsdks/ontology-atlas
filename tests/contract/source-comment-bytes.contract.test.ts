import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isAttributionMarker } from "../../scripts/lib/attribution-marker.mjs";
import { areaGate, changedPaths, sourceArea } from "../../scripts/quality/source-areas.mjs";
import { extractCommentTokens, isSupportedSourcePath } from "../../scripts/quality/source-language/inventory.mjs";
import { judgeRatchet, resolveRatchetBase } from "./lib/ratchet-base";

const base = resolveRatchetBase();
const changed = changedPaths(base).filter(isSupportedSourcePath);

function sourceCommentBytes(path: string, source: string): number {
  return extractCommentTokens(path, source)
    .filter((token: { text: string }) => !isAttributionMarker(token.text))
    .reduce((sum: number, token: { text: string }) => sum + Buffer.byteLength(token.text), 0);
}

function commentBytes(root: string, path: string): number {
  const file = join(root, path);
  if (!existsSync(file)) return 0;
  return sourceCommentBytes(path, readFileSync(file, "utf8"));
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

  it("leaves out a license attribution marker, which a license requires, and counts any other comment", () => {
    const marker = "// Adapted from https://example.com/noise.js (MIT, © Example Holder)";
    expect(sourceCommentBytes("probe.ts", `${marker}\nexport const value = 1;\n`)).toBe(0);
    expect(sourceCommentBytes("probe.ts", `// Adapted from a blog post\nexport const value = 1;\n`)).toBeGreaterThan(0);
  });
});

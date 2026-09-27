import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  areaGate,
  changedPaths,
  directFilesAtCommit,
  directFilesInWorktree,
  sourceArea,
} from "../../scripts/quality/source-areas.mjs";
import { isSupportedSourcePath } from "../../scripts/quality/source-language/inventory.mjs";
import { judgeRatchet, resolveRatchetBase, type RatchetJudgement } from "./lib/ratchet-base";

const MAX_FILE_LINES = 800;
const MAX_DIRECT_FILES = 30;

const cwd = process.cwd();
const base = resolveRatchetBase();
const changed = changedPaths(base);

function lineCount(root: string, path: string): number {
  const file = join(root, path);
  if (!existsSync(file)) return 0;
  const text = readFileSync(file, "utf8");
  if (text === "") return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function byArea(paths: string[]): Map<string, string[]> {
  const areas = new Map<string, string[]>();
  for (const path of paths) {
    const area = sourceArea(path);
    if (area !== null) areas.set(area, [...(areas.get(area) ?? []), path]);
  }
  return areas;
}

function overCeiling(judgements: RatchetJudgement[], detail: (gate: string) => string[]): string[] {
  return judgements
    .filter((j) => j.current > j.ceiling)
    .map((j) => [`${j.gate}: ${j.current} > ${j.ceiling}`, ...detail(j.gate), j.explain].join("\n"));
}

describe("source shape", () => {
  it("adds no file over 800 lines in any area this change touches", () => {
    const files = changed.filter(isSupportedSourcePath);
    const judgements: RatchetJudgement[] = [];
    const offenders = new Map<string, string[]>();
    for (const [area, paths] of byArea(files)) {
      const gate = areaGate("oversize-files", area);
      offenders.set(gate, paths.filter((p) => lineCount(cwd, p) > MAX_FILE_LINES).map((p) => `  ${p}: ${lineCount(cwd, p)} lines`));
      judgements.push(
        judgeRatchet({
          gate,
          measure: (root) => paths.filter((p) => lineCount(root, p) > MAX_FILE_LINES).length,
          reads: files,
          fallback: Number.POSITIVE_INFINITY,
          base,
        }),
      );
    }
    const failures = overCeiling(judgements, (gate) => offenders.get(gate) ?? []);
    expect(failures, failures.join("\n\n")).toEqual([]);
  });

  it("adds no folder over 30 direct files among the parents of changed paths", () => {
    const folders = [...new Set(changed.map((p) => dirname(p)).map((d) => (d === "." ? "" : d)))];
    const judgements: RatchetJudgement[] = [];
    const offenders = new Map<string, string[]>();
    for (const [area, dirs] of byArea(folders.map((d) => `${d === "" ? "" : `${d}/`}_`))) {
      const gate = areaGate("wide-folders", area);
      const names = dirs.map((d) => d.slice(0, -2));
      const count = (dir: string, atBase: boolean) =>
        atBase ? directFilesAtCommit(dir, base!, cwd) : directFilesInWorktree(dir, cwd);
      offenders.set(gate, names.filter((d) => count(d, false) > MAX_DIRECT_FILES).map((d) => `  ${d || "."}/: ${count(d, false)} files`));
      judgements.push(
        judgeRatchet({
          gate,
          measure: (root) => names.filter((d) => count(d, root !== cwd) > MAX_DIRECT_FILES).length,
          reads: [],
          fallback: Number.POSITIVE_INFINITY,
          base,
        }),
      );
    }
    const failures = overCeiling(judgements, (gate) => offenders.get(gate) ?? []);
    expect(failures, failures.join("\n\n")).toEqual([]);
  });
});

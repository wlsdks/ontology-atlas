import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source files are text: one NUL byte makes git treat a file as binary, so diffs are unreviewable
 * and grep silently skips it. Use `JSON.stringify([...])` for composite keys; compare fields to sort.
 */

const ROOTS = ["src", "app", "cli", "mcp", "scripts", "tests"] as const;
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json", ".css", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "output", ".codegraph"]);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) found.push(path);
    }
  };
  for (const root of ROOTS) walk(root);
  return found;
}

describe("소스는 텍스트다 — git 과 grep 이 볼 수 있어야 한다", () => {
  it("어떤 소스 파일도 NUL 바이트를 갖지 않는다", () => {
    const files = sourceFiles();
    // Idling guard — with an empty list, the "0 violations" below proves nothing.
    expect(files.length, "스캔한 파일이 없다 — 경로 목록이 낡았다").toBeGreaterThan(1_000);

    const offenders = files.filter((file) => readFileSync(file).includes(0x00));
    expect(
      offenders,
      "A single NUL makes git treat the file as binary: the pull request shows no diff " +
        "(it cannot be reviewed) and grep silently answers zero matches. Build composite keys with " +
        "JSON.stringify([...]), and sort by comparing fields in order instead of concatenating them.",
    ).toEqual([]);
  });
});

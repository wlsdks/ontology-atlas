import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".md", ".json"]);
const EXCLUDED_FILES = new Set([
  "cli/src/commands/agent-brief.mjs",
]);
const EXPLICIT_FILES = [
  "package.json",
  "cli/README.md",
  "docs/AGENT-GRAPH-WORKFLOW.md",
  "docs/FEATURES.md",
  "messages/en.json",
  "messages/ko.json",
];

function activeFiles(directory: string): string[] {
  const absolute = join(ROOT, directory);
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => SOURCE_EXTENSIONS.has(extname(file)))
    .filter((file) => !/\.(?:test|spec)\.[^.]+$/.test(file))
    .filter((file) => !file.includes("/src/entities/docs-vault/data/"));
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

describe("agent setup automation JSON gate", () => {
  it("keeps advisory readiness in JSON while real fallback failures stay process failures", () => {
    const files = [
      ...activeFiles("src"),
      ...activeFiles("cli/src"),
      ...activeFiles("cli/templates"),
      ...EXPLICIT_FILES.map((file) => join(ROOT, file)),
    ].filter((file) => !EXCLUDED_FILES.has(relative(ROOT, file)));
    const subjects = new Set<string>();
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/--verify-fallbacks --json/g)) {
        const key = `${relative(ROOT, file)}:${lineNumber(source, match.index ?? 0)}`;
        subjects.add(key);
        const tail = source.slice(match.index ?? 0, (match.index ?? 0) + 80);
        if (!tail.startsWith("--verify-fallbacks --json --exit-zero")) offenders.push(key);
      }
    }

    expect(subjects.size, "automation JSON gate scan measured too few active consumers").toBeGreaterThan(8);
    expect(offenders, "add --exit-zero immediately after --json and read status/readiness from the payload").toEqual([]);
  });
});

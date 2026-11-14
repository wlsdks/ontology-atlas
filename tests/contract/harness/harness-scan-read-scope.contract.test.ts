import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scanHarness, type HarnessScanPort } from "@/entities/agent-files";
import { isReadableHarnessPath } from "@/entities/agent-files/model/harness-read-scope";

/**
 * The Harness scan run over this checkout through a filesystem port that records every text read,
 * so a pass that starts opening files outside the harness allowlist fails here before the app's
 * native commands refuse it.
 */

const ROOT = process.cwd();

function fsPort(reads: string[]): HarnessScanPort {
  return {
    async listDir(relativePath) {
      try {
        const entries = await readdir(join(ROOT, relativePath), { withFileTypes: true });
        return entries.map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        }));
      } catch {
        return null;
      }
    },
    async readText(relativePath) {
      reads.push(relativePath);
      try {
        return { text: await readFile(join(ROOT, relativePath), "utf8"), lastModified: null };
      } catch {
        return null;
      }
    },
    async pathExists(relativePath) {
      try {
        await stat(join(ROOT, relativePath));
        return true;
      } catch {
        return false;
      }
    },
  };
}

describe("the harness scan over this repository", () => {
  it("reads no file outside the harness allowlist", async () => {
    const reads: string[] = [];
    const report = await scanHarness(fsPort(reads), { excludedFolders: ["docs/ontology"] });
    expect(report.analysis.records.length).toBeGreaterThan(0);
    expect(reads.filter((path) => !isReadableHarnessPath(path))).toEqual([]);
  });
});

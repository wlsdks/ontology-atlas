import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyVaultPath, countVaultPaths, replayVaultHistory, weeklyVaultHistory,
  type VaultHistoryCommit,
} from "./vault-history";

const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const VAULT = "docs/ontology";
const rel = (p: string) => (p.startsWith(`${VAULT}/`) ? p.slice(VAULT.length + 1) : p);

function history(limit: number): VaultHistoryCommit[] {
  const raw = git("log", `--max-count=${limit}`, "--pretty=format:\x1e%H\x1f%cI", "--name-status", "--no-renames", "--", VAULT);
  return raw.split("\x1e").filter(Boolean).map((rec) => {
    const [head, ...lines] = rec.split("\n");
    const [hash, isoTime] = head!.split("\x1f");
    const files = lines.filter(Boolean).map((l) => {
      const [code, path] = l.split("\t");
      const status = code?.startsWith("A") ? "added" : code?.startsWith("D") ? "deleted" : "modified";
      return { path: rel(path ?? ""), status } as const;
    });
    return { hash: hash!, isoTime: isoTime!, files };
  });
}

/**
 * Checks the rewind against a direct `git ls-tree` count at each commit of this repository's dogfood
 * vault: `vault-history.test.ts` pins the arithmetic, this pins that it is true. It skips when there is no history to
 * check (shallow clone, no dogfood vault, tarball).
 */
const runnable = (() => {
  if (!existsSync("docs/ontology")) return false;
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * The chart and the summary card must give the same number by different roads: the card counts nodes by
 * frontmatter `kind`, the chart counts paths. The gate is their agreement; the vault README is the node that once
 * split them.
 */
const AUTHORABLE_KINDS = new Set(["project", "domain", "capability", "element"]);

function kindOf(vaultRelativePath: string): string | null {
  const raw = readFileSync(join(VAULT, vaultRelativePath), "utf8");
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  const kind = front ? /^kind:\s*(\S+)/m.exec(front[1] ?? "") : null;
  return kind?.[1] ?? null;
}

describe.skipIf(!runnable)("the chart agrees with the summary card", () => {
  it("counts exactly the nodes the card counts, by a different road", () => {
    const paths = git("ls-tree", "-r", "--name-only", "HEAD", VAULT)
      .trim().split("\n").filter(Boolean).map(rel);
    const byPath = countVaultPaths(paths).concept;
    const byKind = paths.filter((p) => p.endsWith(".md") && AUTHORABLE_KINDS.has(kindOf(p) ?? "")).length;
    expect(byKind).toBeGreaterThan(20);
    expect(byPath).toBe(byKind);
  });

  it("drops the vault README rather than the whole root", () => {
    expect(classifyVaultPath("README.md")).toBeNull();
    expect(classifyVaultPath("readme.md")).toBeNull();
    expect(classifyVaultPath("ontology-atlas.md")).toBe("concept");
    expect(classifyVaultPath("elements/README.md")).toBe("concept");
  });
});

describe.skipIf(!runnable)("the rewind agrees with a direct count of the tree", () => {
  it("matches ls-tree at every week it reports", () => {
    const commits = history(4000);
    const present = countVaultPaths(
      git("ls-tree", "-r", "--name-only", "HEAD", VAULT).trim().split("\n").filter(Boolean).map(rel),
    );
    const weeks = weeklyVaultHistory(replayVaultHistory(present, commits));
    expect(weeks.length).toBeGreaterThan(8);
    for (const w of weeks) {
      const truth = countVaultPaths(
        git("ls-tree", "-r", "--name-only", w.hash, VAULT).trim().split("\n").filter(Boolean).map(rel),
      );
      expect({ week: w.week, ...w.counts }).toEqual({ week: w.week, ...truth });
    }
    console.log(`cross-checked ${weeks.length} weeks`);
    console.log(weeks.map((w) => `${w.week}  concept ${String(w.counts.concept).padStart(3)}  writeUp ${String(w.counts.writeUp).padStart(3)}  document ${String(w.counts.document).padStart(3)}`).join("\n"));
  }, 900_000);
});

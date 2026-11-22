import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The CLI beyond `init` is deleted (docs/specs/2026-11-22-cli-rebuild.md). Its entry file is gone,
 * and init now runs as `node <checkout>/cli init`, so every spelling of the old way in reads as a
 * command that fails or a fallback that does not exist.
 */
const RETIRED_ENTRY = ["cli/src/index.mjs", "$ATLAS/cli", "ATLAS_CLI"] as const;

/**
 * Where the old entry may still be named: history (`docs/records/`, `docs/DECISIONS.md`), the plan
 * that retired it, `cli/` itself (its CHANGELOG), the vault's meaning (rewritten through
 * `/ontology-sync`, never by hand), and the generated copies of those docs.
 */
const MAY_NAME_IT = [
  "docs/records/",
  "docs/DECISIONS.md",
  "docs/specs/2026-11-22-cli-rebuild.md",
  "cli/",
  "docs/ontology/",
  "src/entities/docs-vault/data/",
  "public/docs-vault/",
  "tests/contract/release/old-cli-entry-retired.contract.test.ts",
];

const git = (args: string[]) =>
  execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** `path:line:text` for every tracked text line naming a retired entry. */
function linesNamingTheOldEntry(): string[] {
  const patterns = RETIRED_ENTRY.flatMap((entry) => ["-e", entry]);
  try {
    return git(["grep", "-n", "-I", "-F", ...patterns]).split("\n").filter(Boolean);
  } catch (error) {
    // `git grep` exits 1 when nothing matches.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe("the old CLI entry stays retired", () => {
  const hits = linesNamingTheOldEntry();
  const allowed = (line: string) => MAY_NAME_IT.some((prefix) => line.startsWith(prefix));

  it("scans the tracked tree and finds the history that may name it", () => {
    expect(git(["ls-files"]).split("\n").filter(Boolean).length, "no tracked files, so nothing was scanned").toBeGreaterThan(1000);
    expect(hits.filter(allowed).length, "the search found nothing even where history names it").toBeGreaterThan(0);
  });

  it("no living file points anyone at it", () => {
    const offenders = hits.filter((line) => !allowed(line)).map((line) => line.slice(0, 160));
    expect(
      offenders,
      "Name `node <checkout>/cli init` for init and the MCP server for everything else:\n" + offenders.join("\n"),
    ).toEqual([]);
  });
});

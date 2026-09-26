import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { headingAnchorSlug, stripFencedBlocks } from "../../scripts/lib/doc-links.mjs";
import { githubAnchorSlug } from "../../src/shared/lib/github-anchor-slug";

/**
 * Two copies of GitHub's heading-anchor rule exist on purpose: `scripts/` is
 * plain ESM run by the link gate, `src/` is bundled into the app, and neither
 * imports the other. What must not drift is their output.
 *
 * The rule this pins was measured, not assumed: each expectation below was read
 * off GitHub's rendered `id=` attribute for the same heading. The earlier local
 * copy in the table-of-contents generator collapsed runs of whitespace and
 * dropped `_`, which is why `docs/DESIGN-SYSTEM.md` shipped 13 contents links
 * that resolved nowhere.
 */
const GITHUB_RENDERED_IDS: ReadonlyArray<readonly [string, string]> = [
  ["Library index — readable page titles", "library-index--readable-page-titles"],
  ["Geometry & Type Codex (R5, 2026-07)", "geometry--type-codex-r5-2026-07"],
  ["Page header — English caption + Korean h1", "page-header--english-caption--korean-h1"],
  ["2.2 Direct `is_a` / `broader` test", "22-direct-is_a--broader-test"],
  ["snake_case and ~strike~ and **bold** text", "snake_case-and-strike-and-bold-text"],
  ["한글 제목 — 대시 포함", "한글-제목--대시-포함"],
  ["Trailing spaces   collapse?", "trailing-spaces---collapse"],
];

function docHeadings(): string[] {
  const files = execFileSync("git", ["ls-files", "docs/*.md", "docs/**/*.md"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !file.startsWith("public/"))
    // The index still lists a file deleted in the worktree until the deletion is staged.
    .filter((file) => existsSync(file));
  const headings: string[] = [];
  for (const file of files) {
    for (const line of stripFencedBlocks(readFileSync(file, "utf8")) as string[]) {
      const match = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      if (match) headings.push(match[1]);
    }
  }
  return headings;
}

describe("anchor slug parity", () => {
  it("matches the ids GitHub actually renders", () => {
    for (const [heading, id] of GITHUB_RENDERED_IDS) {
      expect(githubAnchorSlug(heading), `app copy: ${heading}`).toBe(id);
      expect(headingAnchorSlug(heading), `gate copy: ${heading}`).toBe(id);
    }
  });

  it("keeps the app copy and the link gate's copy identical on every heading in docs/", () => {
    const headings = docHeadings();
    expect(headings.length, "an empty sweep would pass vacuously").toBeGreaterThan(500);

    const drift = headings
      .map((heading) => ({ heading, app: githubAnchorSlug(heading), gate: headingAnchorSlug(heading) }))
      .filter((row) => row.app !== row.gate)
      .slice(0, 5);

    expect(drift).toEqual([]);
  });
});

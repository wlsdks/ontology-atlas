import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG_PREVIEW_AS_OF, CHANGELOG_PREVIEW_ENTRIES } from "./changelog-preview";

describe("CHANGELOG_PREVIEW_ENTRIES", () => {
  it("holds exactly 3 entries sorted newest-first", () => {
    expect(CHANGELOG_PREVIEW_ENTRIES).toHaveLength(3);
    const dates = CHANGELOG_PREVIEW_ENTRIES.map((e) => e.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it("has a non-empty title for every entry and a valid ISO as-of date", () => {
    for (const entry of CHANGELOG_PREVIEW_ENTRIES) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(CHANGELOG_PREVIEW_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Drift guard — this is a hand-refreshed build-time constant (not a live
  // build step reading docs/CHANGELOG.md), so if the real changelog moves on
  // without this snapshot being updated, this test fails loudly instead of
  // silently letting /download show stale entries with no signal.
  it("still matches real entries currently in docs/CHANGELOG.md", () => {
    const changelog = readFileSync(join(process.cwd(), "docs/CHANGELOG.md"), "utf8");
    for (const entry of CHANGELOG_PREVIEW_ENTRIES) {
      const headerLine = `## ${entry.date} — ${entry.title}`;
      expect(changelog).toContain(headerLine);
    }
  });
});

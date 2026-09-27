import { describe, expect, it } from "vitest";

import {
  VAULT_LAYERS,
  classifyVaultPath,
  countVaultPaths,
  replayVaultHistory,
  type VaultHistoryCommit,
  type VaultHistoryWeek,
  type VaultLayerCounts,
  vaultHistoryPeak,
  vaultLayerMilestones,
  weeklyVaultHistory,
} from "./vault-history";

/** The present and the past are counted by the same rule, and every number is recomputable from Git. */

const commit = (
  hash: string,
  isoTime: string,
  files: Array<[string, "added" | "modified" | "deleted"]>,
): VaultHistoryCommit => ({
  hash,
  isoTime,
  files: files.map(([path, status]) => ({ path, status })),
});

describe("classifyVaultPath — the three counting rules", () => {
  it("counts anything under sources/ as a document, whatever its format", () => {
    expect(classifyVaultPath("sources/plan.pdf")).toBe("document");
    expect(classifyVaultPath("sources/budget.xlsx")).toBe("document");
    expect(classifyVaultPath("sources/notes.txt")).toBe("document");
  });

  it("counts Markdown under wiki/ as a write-up", () => {
    expect(classifyVaultPath("wiki/quarter-plan.md")).toBe("writeUp");
  });

  it("counts every other Markdown file as a concept", () => {
    expect(classifyVaultPath("capabilities/checkout.md")).toBe("concept");
    expect(classifyVaultPath("project.md")).toBe("concept");
    expect(classifyVaultPath("domains/commerce.md")).toBe("concept");
  });

  // A `wiki/_*` file is the wiki's scaffolding (template, log), not a page.
  it("leaves the wiki's own furniture out of the count", () => {
    expect(classifyVaultPath("wiki/_template.md")).toBeNull();
    expect(classifyVaultPath("wiki/_log.md")).toBeNull();
  });

  it("counts nothing that is not Markdown outside sources/", () => {
    expect(classifyVaultPath("README.png")).toBeNull();
    expect(classifyVaultPath("script.mjs")).toBeNull();
  });

  it("ignores dotfiles and the app's own directory", () => {
    expect(classifyVaultPath(".ontology-atlas/activity.jsonl")).toBeNull();
    expect(classifyVaultPath(".gitignore")).toBeNull();
  });

  it("survives a path that is empty or shaped oddly", () => {
    expect(classifyVaultPath("")).toBeNull();
    expect(classifyVaultPath("sources/")).toBeNull();
    expect(classifyVaultPath("./capabilities/x.md")).toBe("concept");
  });
});

describe("countVaultPaths — the present, by the same rule as the past", () => {
  it("counts each layer separately and never blends them", () => {
    expect(
      countVaultPaths([
        "project.md",
        "capabilities/checkout.md",
        "wiki/quarter-plan.md",
        "wiki/_log.md",
        "sources/plan.pdf",
        "sources/budget.xlsx",
        "logo.png",
      ]),
    ).toEqual({ concept: 2, writeUp: 1, module: 0, document: 2 });
  });

  it("counts an empty folder as zero of everything", () => {
    expect(countVaultPaths([])).toEqual({ concept: 0, writeUp: 0, module: 0, document: 0 });
  });
});

describe("replayVaultHistory — rewound from the present, not accumulated forward", () => {
  const present = { concept: 3, writeUp: 2, module: 0, document: 4 };

  it("returns oldest first, so a reader scans it the way time runs", () => {
    const points = replayVaultHistory(present, [
      commit("c3", "2026-09-03T10:00:00Z", []),
      commit("c2", "2026-09-02T10:00:00Z", []),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points.map((p) => p.hash)).toEqual(["c1", "c2", "c3"]);
  });

  // The newest commit's point is the present: nothing has been undone yet when the walk reaches it.
  it("puts the present at the newest commit", () => {
    const points = replayVaultHistory(present, [
      commit("c2", "2026-09-02T10:00:00Z", [["capabilities/new.md", "added"]]),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points.at(-1)!.counts).toEqual(present);
  });

  it("undoes an addition, so the file is absent before the commit that added it", () => {
    const points = replayVaultHistory(present, [
      commit("c2", "2026-09-02T10:00:00Z", [["capabilities/new.md", "added"]]),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points[0]!.counts.concept).toBe(2);
    expect(points[1]!.counts.concept).toBe(3);
  });

  it("undoes a deletion, so the file is present before the commit that removed it", () => {
    const points = replayVaultHistory(present, [
      commit("c2", "2026-09-02T10:00:00Z", [["wiki/gone.md", "deleted"]]),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points[0]!.counts.writeUp).toBe(3);
    expect(points[1]!.counts.writeUp).toBe(2);
  });

  it("treats a modification as no change at all, because only existence counts", () => {
    const points = replayVaultHistory(present, [
      commit("c2", "2026-09-02T10:00:00Z", [["capabilities/checkout.md", "modified"]]),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points[0]!.counts).toEqual(present);
  });

  it("moves the three layers independently in one commit", () => {
    const points = replayVaultHistory(present, [
      commit("c2", "2026-09-02T10:00:00Z", [
        ["capabilities/new.md", "added"],
        ["wiki/page.md", "added"],
        ["sources/old.pdf", "deleted"],
      ]),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points[0]!.counts).toEqual({ concept: 2, writeUp: 1, module: 0, document: 5 });
  });

  it("ignores a path no rule counts", () => {
    const points = replayVaultHistory(present, [
      commit("c2", "2026-09-02T10:00:00Z", [["wiki/_log.md", "added"], ["logo.png", "added"]]),
      commit("c1", "2026-09-01T10:00:00Z", []),
    ]);
    expect(points[0]!.counts).toEqual(present);
  });

  // A rename arrives as delete plus add (`--no-renames`); split across the window's oldest edge the rewind can pass
  // zero, so it clamps.
  it("never draws a folder holding a negative number of anything", () => {
    const points = replayVaultHistory({ concept: 1, writeUp: 0, module: 0, document: 0 }, [
      commit("c2", "2026-09-02T10:00:00Z", [["a.md", "added"]]),
      commit("c1", "2026-09-01T10:00:00Z", [["b.md", "added"]]),
    ]);
    for (const point of points) expect(point.counts.concept).toBeGreaterThanOrEqual(0);
  });

  it("returns nothing at all when there is no history, rather than a zero point", () => {
    expect(replayVaultHistory(present, [])).toEqual([]);
  });
});

describe("weeklyVaultHistory — what the folder held at the end of each week", () => {
  it("keeps the last commit of a week and drops the ones before it", () => {
    const weeks = weeklyVaultHistory([
      { isoTime: "2026-09-01T09:00:00Z", hash: "mon", counts: { concept: 1, writeUp: 0, module: 0, document: 0 } },
      { isoTime: "2026-09-04T09:00:00Z", hash: "thu", counts: { concept: 4, writeUp: 1, module: 0, document: 2 } },
      { isoTime: "2026-09-09T09:00:00Z", hash: "nextTue", counts: { concept: 6, writeUp: 2, module: 0, document: 3 } },
    ]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ week: "2026-08-31", hash: "thu" });
    expect(weeks[0]!.counts.concept).toBe(4);
    expect(weeks[1]).toMatchObject({ week: "2026-09-07", hash: "nextTue" });
  });

  it("sorts weeks forward whatever order the points arrived in", () => {
    const weeks = weeklyVaultHistory([
      { isoTime: "2026-09-09T09:00:00Z", hash: "b", counts: { concept: 2, writeUp: 0, module: 0, document: 0 } },
      { isoTime: "2026-09-01T09:00:00Z", hash: "a", counts: { concept: 1, writeUp: 0, module: 0, document: 0 } },
    ]);
    expect(weeks.map((w) => w.week)).toEqual(["2026-08-31", "2026-09-07"]);
  });

  // A week without commits is absent, not zero, which would claim the folder was emptied and refilled.
  it("leaves a quiet week out rather than drawing it as empty", () => {
    const weeks = weeklyVaultHistory([
      { isoTime: "2026-08-31T09:00:00Z", hash: "a", counts: { concept: 5, writeUp: 0, module: 0, document: 0 } },
      { isoTime: "2026-09-14T09:00:00Z", hash: "b", counts: { concept: 6, writeUp: 0, module: 0, document: 0 } },
    ]);
    expect(weeks.map((w) => w.week)).toEqual(["2026-08-31", "2026-09-14"]);
  });

  it("drops a point whose timestamp cannot be read", () => {
    const weeks = weeklyVaultHistory([
      { isoTime: "not a date", hash: "bad", counts: { concept: 1, writeUp: 0, module: 0, document: 0 } },
    ]);
    expect(weeks).toEqual([]);
  });
});

describe("vaultHistoryPeak — the shared baseline the three tracks scale to", () => {
  it("takes the largest count any one layer reaches", () => {
    expect(
      vaultHistoryPeak([
        { week: "2026-09-01", hash: "a", counts: { concept: 12, writeUp: 3, module: 0, document: 40 } },
        { week: "2026-09-08", hash: "b", counts: { concept: 60, writeUp: 4, module: 0, document: 41 } },
      ]),
    ).toBe(60);
  });

  it("is zero for no weeks at all", () => {
    expect(vaultHistoryPeak([])).toBe(0);
  });
});

/** The shape a blended score would erase: on this repository's vault the concepts fell while the folder kept growing. */
describe("the divergence a blended score would erase", () => {
  it("keeps the layers apart, so a fall in one is visible beside a rise in another", () => {
    const weeks = weeklyVaultHistory([
      { isoTime: "2026-06-29T10:00:00Z", hash: "a", counts: { concept: 107, writeUp: 0, module: 0, document: 50 } },
      { isoTime: "2026-07-27T10:00:00Z", hash: "b", counts: { concept: 71, writeUp: 0, module: 0, document: 61 } },
    ]);
    expect(weeks[0]!.counts.concept - weeks[1]!.counts.concept).toBe(36);
    expect(weeks[1]!.counts.document - weeks[0]!.counts.document).toBe(11);
    const blended = weeks.map((w) => w.counts.concept + w.counts.writeUp + w.counts.document);
    expect(blended).toEqual([157, 132]);
  });
});

describe("vaultLayerMilestones", () => {
  const week = (w: string, counts: Partial<VaultLayerCounts>): VaultHistoryWeek => ({
    week: w,
    hash: w.replace(/-/g, "").slice(0, 8),
    counts: { concept: 0, writeUp: 0, module: 0, document: 0, ...counts },
  });

  it("names the week a layer first held anything", () => {
    const series = [
      week("2026-06-01", { writeUp: 0 }),
      week("2026-06-08", { writeUp: 0 }),
      week("2026-06-15", { writeUp: 3 }),
      week("2026-06-22", { writeUp: 4 }),
    ];
    expect(vaultLayerMilestones(series, "writeUp").began).toEqual({
      week: "2026-06-15",
      count: 3,
    });
  });

  // A folder older than the window opens holding things, so the window's first week is never a beginning.
  it("never calls the window's own first week a beginning", () => {
    const series = [
      week("2026-06-01", { concept: 40 }),
      week("2026-06-08", { concept: 44 }),
    ];
    expect(vaultLayerMilestones(series, "concept").began).toBeNull();
  });

  it("finds the week that grew the most, not the last week that grew", () => {
    const series = [
      week("2026-06-01", { concept: 10 }),
      week("2026-06-08", { concept: 30 }),
      week("2026-06-15", { concept: 33 }),
    ];
    expect(vaultLayerMilestones(series, "concept").grew).toEqual({
      week: "2026-06-08",
      delta: 20,
    });
  });

  it("reports no growth for a layer that only ever fell", () => {
    const series = [
      week("2026-06-01", { concept: 30 }),
      week("2026-06-08", { concept: 20 }),
    ];
    const m = vaultLayerMilestones(series, "concept");
    expect(m.grew).toBeNull();
    expect(m.latest).toBe(20);
  });

  it("says nothing at all about a layer that never existed", () => {
    const series = [week("2026-06-01", {}), week("2026-06-08", {})];
    expect(vaultLayerMilestones(series, "module")).toEqual({
      layer: "module",
      began: null,
      grew: null,
      latest: 0,
    });
  });
});

describe("classifyVaultPath — a folder is a path segment, not a prefix", () => {
  // The bundled manifest carries repo-relative paths (`samples/storefront/architecture/...`), so layer folders match
  // by segment, not prefix.
  it("counts a layer folder that sits under a prefix", () => {
    expect(classifyVaultPath("samples/storefront/architecture/services.md")).toBe("module");
    expect(classifyVaultPath("samples/storefront/wiki/onboarding.md")).toBe("writeUp");
    expect(classifyVaultPath("samples/storefront/sources/deck.pdf")).toBe("document");
    expect(classifyVaultPath("samples/storefront/capabilities/cart.md")).toBe("concept");
  });

  it("still reads a plain vault-relative path the same way", () => {
    expect(classifyVaultPath("architecture/services.md")).toBe("module");
    expect(classifyVaultPath("wiki/onboarding.md")).toBe("writeUp");
  });

  it("does not mistake a file *named* like a folder for that folder", () => {
    expect(classifyVaultPath("capabilities/architecture.md")).toBe("concept");
    expect(classifyVaultPath("capabilities/wiki.md")).toBe("concept");
  });
});

describe("vaultLayerMilestones — one week, one fact", () => {
  it("does not say the same date twice when a layer began and peaked together", () => {
    const series: VaultHistoryWeek[] = [
      { week: "2026-06-01", hash: "a", counts: { concept: 0, writeUp: 0, module: 0, document: 0 } },
      { week: "2026-06-08", hash: "b", counts: { concept: 0, writeUp: 0, module: 4, document: 0 } },
    ];
    const m = vaultLayerMilestones(series, "module");
    expect(m.began).toEqual({ week: "2026-06-08", count: 4 });
    expect(m.grew).toBeNull();
  });

  it("keeps both when the biggest week came after the beginning", () => {
    const series: VaultHistoryWeek[] = [
      { week: "2026-06-01", hash: "a", counts: { concept: 0, writeUp: 0, module: 0, document: 0 } },
      { week: "2026-06-08", hash: "b", counts: { concept: 0, writeUp: 0, module: 2, document: 0 } },
      { week: "2026-06-15", hash: "c", counts: { concept: 0, writeUp: 0, module: 9, document: 0 } },
    ];
    const m = vaultLayerMilestones(series, "module");
    expect(m.began?.week).toBe("2026-06-08");
    expect(m.grew).toEqual({ week: "2026-06-15", delta: 7 });
  });
});

describe("every aggregate folds over every layer", () => {
  // These pin the property over all layers rather than four names, so a new layer missed by an aggregate fails here.
  const week = (counts: Partial<VaultLayerCounts>): VaultHistoryWeek => ({
    week: "2026-06-01",
    hash: "aaaaaaaa",
    counts: { concept: 0, writeUp: 0, module: 0, document: 0, ...counts },
  });

  it("scales the peak to whichever layer is largest, architecture included", () => {
    for (const layer of VAULT_LAYERS) {
      expect(vaultHistoryPeak([week({ [layer]: 42 })])).toBe(42);
    }
  });

  it("counts a path into every layer the vocabulary has", () => {
    const seen = new Set(
      ["capabilities/a.md", "architecture/b.md", "wiki/c.md", "sources/d.pdf"].map(
        (p) => classifyVaultPath(p),
      ),
    );
    expect([...seen].sort()).toEqual([...VAULT_LAYERS].sort());
  });

  it("clamps a negative count in every layer, not only the first three", () => {
    // Each layer gains a file inside the window that the present (zero) no longer holds, so the rewind passes zero.
    const commits = [
      {
        hash: "c1",
        isoTime: "2026-06-02T00:00:00Z",
        files: VAULT_LAYERS.map((layer) => ({
          path:
            layer === "module"
              ? "architecture/x.md"
              : layer === "writeUp"
                ? "wiki/x.md"
                : layer === "document"
                  ? "sources/x.pdf"
                  : "capabilities/x.md",
          status: "added" as const,
        })),
      },
    ];
    const points = replayVaultHistory(
      { concept: 0, writeUp: 0, module: 0, document: 0 },
      commits,
    );
    for (const point of points) {
      for (const layer of VAULT_LAYERS) expect(point.counts[layer]).toBeGreaterThanOrEqual(0);
    }
  });
});

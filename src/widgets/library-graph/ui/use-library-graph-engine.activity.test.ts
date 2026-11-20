import { describe, expect, it } from "vitest";

import type { LibraryWorkActivity } from "@/features/library";

import { buildLibraryGraph } from "../model/build-library-graph";
import { libraryGraphActivityMarks } from "./library-graph-engine/activity-marks";

const graph = buildLibraryGraph({
  docs: [
    {
      slug: "wiki/plan",
      path: "wiki/plan.md",
      title: "Plan",
      tags: [],
      frontmatter: {},
      updatedAt: "2026-09-08T00:00:00.000Z",
      linksOut: [],
    },
  ],
  wikiPages: [{ slug: "wiki/plan", title: "Plan", sourcePaths: ["sources/plan.pdf"] }],
  sources: [{ path: "sources/plan.pdf", state: "compiled" }],
});

const EMPTY: LibraryWorkActivity = { isActive: false, current: null, recent: [] };

describe("library graph activity marks", () => {
  it("binds only an exact existing source/page target; null and unknown targets cannot light the graph", () => {
    const activity: LibraryWorkActivity = {
      ...EMPTY,
      recent: [
        { id: "unknown", kind: "read", phase: "complete", target: { kind: "source", ref: "sources/missing.pdf" }, at: 1_000 },
        { id: "unbound", kind: "error", phase: "complete", target: null, at: 1_000 },
        { id: "page", kind: "write", phase: "complete", target: { kind: "wiki", ref: "wiki/plan" }, at: 1_000 },
      ],
    };

    const [mark] = libraryGraphActivityMarks(activity, graph, 1_100, 420, 900, false);
    expect(mark).toMatchObject({ nodeId: "page:wiki/plan", kind: "write", phase: "complete" });
    expect(mark?.progress).toBeCloseTo(100 / 420);
  });

  it("keeps a real pending wait static and does not turn it into a timed receipt", () => {
    const activity: LibraryWorkActivity = {
      isActive: true,
      current: {
        id: "permission",
        kind: "waiting",
        phase: "active",
        target: { kind: "source", ref: "sources/plan.pdf" },
        at: 1_000,
      },
      recent: [],
    };

    expect(libraryGraphActivityMarks(activity, graph, 99_999, 420, 900, false)).toEqual([
      { nodeId: "source:sources/plan.pdf", kind: "waiting", phase: "active", progress: 0, turn: 0 },
    ]);
  });

  it("expires completed marks after the shared base-plus-settle trail, while reduced motion settles in one paint", () => {
    const activity: LibraryWorkActivity = {
      ...EMPTY,
      recent: [{ id: "read", kind: "read", phase: "complete", target: { kind: "source", ref: "sources/plan.pdf" }, at: 1_000 }],
    };

    expect(libraryGraphActivityMarks(activity, graph, 1_420, 420, 900, false)).toEqual([]);
    expect(libraryGraphActivityMarks(activity, graph, 1_100, 420, 900, true)).toEqual([
      { nodeId: "source:sources/plan.pdf", kind: "read", phase: "complete", progress: 1, settled: true },
    ]);
  });

  it("moves only an exact active read/proposal on the existing canvas 900ms clock", () => {
    const activity: LibraryWorkActivity = {
      isActive: true,
      current: {
        id: "read",
        kind: "read",
        phase: "active",
        target: { kind: "source", ref: "sources/plan.pdf" },
        at: 1_000,
      },
      recent: [],
    };

    expect(libraryGraphActivityMarks(activity, graph, 1_450, 420, 900, false)).toEqual([
      { nodeId: "source:sources/plan.pdf", kind: "read", phase: "active", progress: 0, turn: 0.5 },
    ]);
    expect(libraryGraphActivityMarks(activity, graph, 1_450, 420, 900, true)).toEqual([
      { nodeId: "source:sources/plan.pdf", kind: "read", phase: "active", progress: 0, turn: 0 },
    ]);
  });
});

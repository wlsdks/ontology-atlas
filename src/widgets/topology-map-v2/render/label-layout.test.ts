import { describe, expect, it } from "vitest";

import {
  bboxesOverlap,
  ellipsizeToWidth,
  greedyPlaceLabels,
  isWithinSafeRect,
  resolveLabelPriority,
  type LabelCandidate,
} from "./label-layout";

const RECT = { left: 344, right: 880, top: 96, bottom: 704 };

describe("isWithinSafeRect", () => {
  it("keeps an anchor inside the visible area", () => {
    expect(isWithinSafeRect(500, 400, RECT)).toBe(true);
  });

  it("rejects an anchor behind the left ReaderLens panel", () => {
    expect(isWithinSafeRect(200, 400, RECT)).toBe(false);
  });

  it("rejects an anchor past the right popover rail", () => {
    expect(isWithinSafeRect(950, 400, RECT)).toBe(false);
  });

  it("rejects an anchor above the top chrome / below the bottom hint", () => {
    expect(isWithinSafeRect(500, 40, RECT)).toBe(false);
    expect(isWithinSafeRect(500, 760, RECT)).toBe(false);
  });
});

describe("bboxesOverlap", () => {
  it("detects overlapping boxes", () => {
    expect(bboxesOverlap({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
  });

  it("treats edge-touching boxes as non-overlapping", () => {
    expect(bboxesOverlap({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
  });

  it("detects fully separate boxes as non-overlapping", () => {
    expect(bboxesOverlap({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 30, minY: 30, maxX: 40, maxY: 40 })).toBe(false);
  });
});

describe("greedyPlaceLabels", () => {
  const box = (minX: number): { minX: number; minY: number; maxX: number; maxY: number } => ({
    minX,
    minY: 0,
    maxX: minX + 20,
    maxY: 10,
  });

  it("keeps the higher-priority label when two overlap (project beats element)", () => {
    const candidates: LabelCandidate<string>[] = [
      { priority: 3, order: 0, bbox: box(0), payload: "element" },
      { priority: 0, order: 1, bbox: box(5), payload: "project" },
    ];
    const placed = greedyPlaceLabels(candidates);
    expect(placed.map((p) => p.payload)).toEqual(["project"]);
  });

  it("places non-overlapping labels regardless of priority", () => {
    const candidates: LabelCandidate<string>[] = [
      { priority: 0, order: 0, bbox: box(0), payload: "a" },
      { priority: 3, order: 1, bbox: box(100), payload: "b" },
    ];
    const placed = greedyPlaceLabels(candidates);
    expect(placed.map((p) => p.payload).sort()).toEqual(["a", "b"]);
  });

  it("is deterministic and uses `order` to break ties within a priority", () => {
    const candidates: LabelCandidate<string>[] = [
      { priority: 2, order: 5, bbox: box(4), payload: "second" },
      { priority: 2, order: 1, bbox: box(0), payload: "first" },
    ];
    const placed = greedyPlaceLabels(candidates);
    // Same priority + overlapping → the lower `order` wins.
    expect(placed.map((p) => p.payload)).toEqual(["first"]);
  });
});

describe("ellipsizeToWidth", () => {
  const measureByLength = (s: string) => s.length;

  it("returns the text unchanged when it fits", () => {
    expect(ellipsizeToWidth("short", 10, measureByLength)).toBe("short");
  });

  it("cuts at a path separator, never mid-word", () => {
    // "src/features/docs" (17) + "…" > 12, "src/features" (12)+"…"=13>12,
    // "src" (3)+"…"=4<=12 fits; longest boundary prefix that fits is "src/features"?
    // length budget 14 lets "src/features"(12)+…=13 fit.
    const out = ellipsizeToWidth("src/features/docs-vault-local/live", 14, measureByLength);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("src/features…");
  });

  it("breaks on whitespace boundaries", () => {
    expect(ellipsizeToWidth("hello world foo", 12, measureByLength)).toBe("hello world…");
  });

  it("falls back to a hard cut only for a single unbreakable token", () => {
    const out = ellipsizeToWidth("superlongtokenwithoutbreaks", 10, measureByLength);
    expect(out).toBe("superlong…"); // 9 chars + ellipsis = 10
  });
});

/**
 * (label-clarity, 2026-07) — collision-culling priority ladder: selected >
 * hovered > project/hub > domain > capability > element. Lower number wins
 * `greedyPlaceLabels`. Pure so the ladder itself (independent of kind, once
 * selected/hovered) is unit-tested without a canvas.
 */
describe("resolveLabelPriority", () => {
  const base = { kind: "element" as const, isSelected: false, isHovered: false, isHub: false };

  it("the selected node always wins, regardless of kind", () => {
    expect(resolveLabelPriority({ ...base, kind: "element", isSelected: true })).toBe(
      resolveLabelPriority({ ...base, kind: "project", isSelected: true }),
    );
    expect(resolveLabelPriority({ ...base, isSelected: true })).toBeLessThan(
      resolveLabelPriority({ ...base, kind: "project" }),
    );
  });

  it("hovered beats every kind but loses to selected", () => {
    const hovered = resolveLabelPriority({ ...base, isHovered: true });
    const selected = resolveLabelPriority({ ...base, isSelected: true });
    const project = resolveLabelPriority({ ...base, kind: "project" });
    expect(selected).toBeLessThan(hovered);
    expect(hovered).toBeLessThan(project);
  });

  it("orders plain (non-selected, non-hovered) kinds project/hub > domain > capability > element", () => {
    const project = resolveLabelPriority({ ...base, kind: "project" });
    const hub = resolveLabelPriority({ ...base, kind: "capability", isHub: true });
    const domain = resolveLabelPriority({ ...base, kind: "domain" });
    const capability = resolveLabelPriority({ ...base, kind: "capability" });
    const element = resolveLabelPriority({ ...base, kind: "element" });
    expect(project).toBe(hub); // a hub capability ranks with project, not with plain capability
    expect(project).toBeLessThan(domain);
    expect(domain).toBeLessThan(capability);
    expect(capability).toBeLessThan(element);
  });
});

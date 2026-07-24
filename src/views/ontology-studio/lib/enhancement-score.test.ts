import { describe, expect, it } from "vitest";
import {
  ENHANCEMENT_AXES,
  ENHANCEMENT_TIER_COUNT,
  type EnhancementInputs,
  isAAxisWeight,
  projectWithIsA,
  scoreEnhancement,
} from "./enhancement-score";

const EMPTY: EnhancementInputs = {
  hasDefinition: false,
  hasEvidence: false,
  containsCount: 0,
  dependsOnCount: 0,
  relatesCount: 0,
  hasIsA: false,
};

describe("scoreEnhancement", () => {
  it("weights sum to exactly 100", () => {
    const total = ENHANCEMENT_AXES.reduce((sum, a) => sum + a.weight, 0);
    expect(total).toBe(100);
  });

  it("scores an empty node as 0% / Lv.0 with the first pip pending", () => {
    const score = scoreEnhancement(EMPTY);
    expect(score.percent).toBe(0);
    expect(score.level).toBe(0);
    expect(score.nextLevel).toBe(1);
    expect(score.pips).toEqual(["next", "off", "off", "off", "off"]);
  });

  it("reproduces the mockup node (definition + evidence + contains + depends) → 65% Lv.3→4", () => {
    const score = scoreEnhancement({
      hasDefinition: true,
      hasEvidence: true,
      containsCount: 1,
      dependsOnCount: 2,
      relatesCount: 0,
      hasIsA: false,
    });
    expect(score.percent).toBe(65);
    expect(score.level).toBe(3);
    expect(score.nextLevel).toBe(4);
    expect(score.pips).toEqual(["on", "on", "on", "next", "off"]);
  });

  it("counts a relation kind once regardless of how many neighbors it has", () => {
    const one = scoreEnhancement({ ...EMPTY, dependsOnCount: 1 });
    const many = scoreEnhancement({ ...EMPTY, dependsOnCount: 9 });
    expect(one.percent).toBe(many.percent);
    expect(one.percent).toBe(15);
  });

  it("caps a fully-complete node at 100% / max tier", () => {
    const score = scoreEnhancement({
      hasDefinition: true,
      hasEvidence: true,
      containsCount: 3,
      dependsOnCount: 3,
      relatesCount: 3,
      hasIsA: true,
    });
    expect(score.percent).toBe(100);
    expect(score.level).toBe(ENHANCEMENT_TIER_COUNT);
    expect(score.nextLevel).toBe(ENHANCEMENT_TIER_COUNT);
    expect(score.pips).toEqual(["on", "on", "on", "on", "on"]);
  });

  it("without is_a a fully-fleshed node tops out at 80% (Slice 1 ceiling)", () => {
    const score = scoreEnhancement({
      hasDefinition: true,
      hasEvidence: true,
      containsCount: 1,
      dependsOnCount: 1,
      relatesCount: 1,
      hasIsA: false,
    });
    expect(score.percent).toBe(80);
    expect(score.axes.find((a) => a.key === "isA")?.met).toBe(false);
  });

  it("marks each axis met/unmet in display order", () => {
    const score = scoreEnhancement({ ...EMPTY, hasDefinition: true });
    expect(score.axes.map((a) => a.key)).toEqual([
      "definition",
      "evidence",
      "contains",
      "dependsOn",
      "relates",
      "isA",
    ]);
    expect(score.axes[0].met).toBe(true);
    expect(score.axes[1].met).toBe(false);
  });
});

describe("projectWithIsA", () => {
  it("previews the gain from filling the empty gold is_a socket", () => {
    const base: EnhancementInputs = {
      hasDefinition: true,
      hasEvidence: true,
      containsCount: 1,
      dependsOnCount: 2,
      relatesCount: 0,
      hasIsA: false,
    };
    const before = scoreEnhancement(base);
    const after = projectWithIsA(base);
    expect(after.percent).toBe(before.percent + isAAxisWeight());
    expect(after.percent).toBe(85);
    expect(after.level).toBe(4);
  });

  it("never exceeds 100 when is_a is already the only missing axis at the cap", () => {
    const after = projectWithIsA({
      hasDefinition: true,
      hasEvidence: true,
      containsCount: 1,
      dependsOnCount: 1,
      relatesCount: 1,
      hasIsA: false,
    });
    expect(after.percent).toBe(100);
  });
});

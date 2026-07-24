/**
 * Pure "강화도(enhancement completeness)" scoring for the Ontology Studio
 * surface. A node is treated like a game item whose "level" rises as its
 * meaning gets more complete: a definition, implementation evidence, and each
 * kind of typed relation are the axes that fill the gauge.
 *
 * The scoring is DETERMINISTIC (same inputs → same percent/level) so the
 * gauge, tier pips, and the green "+delta" preview never disagree and are
 * unit-testable without rendering. Weights sum to exactly 100.
 *
 * `is_a` (상위 개념 — "what kind of thing is this?") is a NEW axis that the
 * vault schema does not yet carry; Slice 1 always reports it as missing, so a
 * fully-fleshed node tops out at 80% until Slice 2 wires the write. That is
 * intentional: the empty gold socket is the surface's call to action.
 */

/** One completeness axis + its weight. Order = display order (top → bottom). */
export const ENHANCEMENT_AXES = [
  { key: "definition", weight: 20 },
  { key: "evidence", weight: 15 },
  { key: "contains", weight: 15 },
  { key: "dependsOn", weight: 15 },
  { key: "relates", weight: 15 },
  { key: "isA", weight: 20 },
] as const;

export type EnhancementAxisKey = (typeof ENHANCEMENT_AXES)[number]["key"];

/** How many discrete tiers the 0–100 gauge is split into (Lv.1 … Lv.5). */
export const ENHANCEMENT_TIER_COUNT = 5;

export interface EnhancementInputs {
  /** Node has a non-empty definition / summary. */
  hasDefinition: boolean;
  /** At least one code-location evidence path resolves for the node. */
  hasEvidence: boolean;
  /** `contains` (담는 것) relation count. */
  containsCount: number;
  /** `depends_on` (기대는 곳) relation count. */
  dependsOnCount: number;
  /** weak `related_to` / `uses` (비슷한 것) relation count. */
  relatesCount: number;
  /** `is_a` (상위 개념) present. Always false in Slice 1. */
  hasIsA: boolean;
}

export type EnhancementPip = "on" | "next" | "off";

export interface EnhancementAxisResult {
  key: EnhancementAxisKey;
  weight: number;
  met: boolean;
}

export interface EnhancementScore {
  /** 0–100, integer. */
  percent: number;
  /** Completed tiers reached, 0–5 (0 = nothing filled yet). */
  level: number;
  /** The tier the item is progressing toward (== level when already maxed). */
  nextLevel: number;
  /** Exactly `ENHANCEMENT_TIER_COUNT` pips: filled tiers `on`, the in-progress
   *  tier `next`, the rest `off`. */
  pips: EnhancementPip[];
  /** Per-axis met/unmet, in display order. */
  axes: EnhancementAxisResult[];
}

function axisMet(key: EnhancementAxisKey, inputs: EnhancementInputs): boolean {
  switch (key) {
    case "definition":
      return inputs.hasDefinition;
    case "evidence":
      return inputs.hasEvidence;
    case "contains":
      return inputs.containsCount > 0;
    case "dependsOn":
      return inputs.dependsOnCount > 0;
    case "relates":
      return inputs.relatesCount > 0;
    case "isA":
      return inputs.hasIsA;
  }
}

/** Map a 0–100 percent to a 1-based tier and the pip pattern. */
function percentToTiers(percent: number): {
  level: number;
  nextLevel: number;
  pips: EnhancementPip[];
} {
  const clamped = Math.max(0, Math.min(100, percent));
  // Number of FULLY completed tiers (each tier spans 100/TIER_COUNT percent).
  const tierSpan = 100 / ENHANCEMENT_TIER_COUNT;
  const completedTiers = Math.min(Math.floor(clamped / tierSpan), ENHANCEMENT_TIER_COUNT);
  const isMaxed = completedTiers >= ENHANCEMENT_TIER_COUNT;
  // `level` = tiers already reached (Lv.0 when nothing is filled); `nextLevel`
  // is the tier in progress. Maxed items report the same value for both.
  const level = completedTiers;
  const nextLevel = isMaxed ? ENHANCEMENT_TIER_COUNT : completedTiers + 1;

  const pips: EnhancementPip[] = [];
  for (let i = 0; i < ENHANCEMENT_TIER_COUNT; i += 1) {
    if (i < completedTiers) pips.push("on");
    else if (i === completedTiers && !isMaxed) pips.push("next");
    else pips.push("off");
  }
  return { level, nextLevel, pips };
}

/** Score a node's meaning completeness. Pure + deterministic. */
export function scoreEnhancement(inputs: EnhancementInputs): EnhancementScore {
  const axes: EnhancementAxisResult[] = ENHANCEMENT_AXES.map(({ key, weight }) => ({
    key,
    weight,
    met: axisMet(key, inputs),
  }));
  const percent = axes.reduce((sum, axis) => (axis.met ? sum + axis.weight : sum), 0);
  const { level, nextLevel, pips } = percentToTiers(percent);
  return { percent, level, nextLevel, pips, axes };
}

/**
 * Projected percent if `is_a` (the always-empty gold socket) were filled — the
 * green "+delta" preview the gauge note shows. Never exceeds 100.
 */
export function projectWithIsA(inputs: EnhancementInputs): EnhancementScore {
  return scoreEnhancement({ ...inputs, hasIsA: true });
}

/** The weight the `is_a` axis would add — the "+N" the 상위 개념 stat previews. */
export function isAAxisWeight(): number {
  return ENHANCEMENT_AXES.find((axis) => axis.key === "isA")?.weight ?? 0;
}

import { describe, expect, it } from "vitest";

import { stepEmphasis } from "./focus-state";
import { effectiveNodeAlpha, nodeTierAlpha, DEFAULT_TIER_REVEAL } from "./tier-visibility";

/**
 * **A node an agent just created surfaces on the map** (owner instruction,
 * 2026-08-17).
 *
 * The appear ramp (`appearRef` — swells from 0.6× while alpha goes 0→1) already
 * existed, but a new capability has **tier alpha 0** at overview zoom, so the
 * staging was multiplied by 0. Measured: when an agent created a capability, the
 * only visible change was the domain's child count going 2→3; no new dot appeared.
 *
 * So a just-born node gets a **tier exemption of the same class** as an ego click
 * or a chip expansion. Nothing new was invented — an existing ramp was given reach
 * where it could not previously land.
 *
 * Screen-recording measurement (30fps, installed app): first-frame share **29.7%**,
 * under `design.md`'s 70% hard-cut threshold; it rises monotonically to ~95% across
 * 300–400 ms with no dip.
 *
 * CI does not record the screen, so that curve is pinned here at the **model
 * level**: visible even at tier 0, no single-frame pop, and no fall back after the
 * rise.
 */

/** A capability at overview zoom (zoomRatio 1) — normally an invisible position. */
const HIDDEN_CAPABILITY = nodeTierAlpha("capability", false, 1, DEFAULT_TIER_REVEAL);

/** Same value as the tau the appear ramp uses (the `--topology-v2-cluster-reveal-tau` family). */
const REVEAL_TAU = 0.12;
const FRAME_DT = 1 / 60;

function revealSeries(frames: number): number[] {
  const out: number[] = [];
  let ramp = 0;
  for (let i = 0; i < frames; i += 1) {
    ramp = stepEmphasis(ramp, true, true, FRAME_DT, REVEAL_TAU, REVEAL_TAU);
    out.push(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, ramp));
  }
  return out;
}

describe("방금 생긴 노드가 지도에 떠오른다", () => {
  it("개요 배율의 역량은 원래 안 보인다 — 아니면 이 검사가 헛돈다", () => {
    expect(HIDDEN_CAPABILITY).toBe(0);
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, false, 0)).toBe(0);
  });

  it("티어가 0 이어도 방금 생긴 노드는 보인다", () => {
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
  });

  it("**한 프레임에 튀지 않는다** — 하드컷이면 결함이다", () => {
    const first = revealSeries(1)[0];
    // The recording measured 29.7%; the model starts lower still (one frame = 13%).
    expect(first).toBeLessThan(0.7);
    expect(first).toBeGreaterThan(0);
  });

  it("단조롭게 오른다 — 오르내리면 그게 깜빡임이다", () => {
    const series = revealSeries(40);
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i], `프레임 ${i} 에서 되떨어졌다`).toBeGreaterThanOrEqual(series[i - 1]);
    }
  });

  it("반 초 안에 다 떠오른다 — 기다리게 하지 않는다", () => {
    const series = revealSeries(30); // 0.5 s @60fps
    expect(series.at(-1)).toBeGreaterThan(0.95);
  });

  it("다 떠오른 뒤에는 티어가 다시 숨기지 못한다 — 사라지면 그게 깜빡임이다", () => {
    // While the ramp sits at 1, alpha is 1. That is why it holds for the session.
    expect(effectiveNodeAlpha(HIDDEN_CAPABILITY, true, 1)).toBe(1);
    expect(effectiveNodeAlpha(0, true, 1)).toBe(1);
  });
});

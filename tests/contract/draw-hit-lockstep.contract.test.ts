import { describe, expect, it } from "vitest";

import {
  HITTABLE_MIN_TIER_ALPHA,
  isNodeHittable,
  type HittableNodeInput,
} from "@/widgets/topology-map-v2/model/tier-visibility";

/**
 * The contract that **draw and hit read the same value**.
 *
 * Background (exhaustive check 2026-07-31): draw had four channels that pierce
 * the tier gate (edge selection, footprint lens, ego focus, recent-change
 * spotlight) while hit had **only ego** — so a node surfaced by the footprint lens
 * was **visible but unclickable**. Meanwhile the draw-side comment claimed *"the
 * same piercing applies to hit testing, so it can be clicked again straight from
 * the map"*. **The very case the comment set out to fix was not fixed** — it was
 * written from the draw side alone.
 *
 * How it is fixed matters: passing one more argument each time means **it drifts
 * again the next time a channel is added** (which is how this defect arose). If
 * hit reads the alpha map draw already builds, they cannot drift structurally.
 *
 * ⚠️ The contract's exact wording is not "if it is drawn it is hittable" but
 * **"if it is at least half revealed it is hittable"** — 0.02–0.5 is the intended
 * "visible but not hittable" band.
 */

const node = (id: string, kind: HittableNodeInput["kind"] = "element"): HittableNodeInput => ({
  id,
  kind,
  isHub: false,
});

/** Overview-entry zoom — the element/capability tiers are not open yet. */
const OVERVIEW_ZOOM = 1;

describe("draw/hit lockstep contract", () => {
  it("드로우가 관통시킨 노드는 **채널이 무엇이든** 잡힌다", () => {
    // Not enumerating channel names is the point — a value in the map is enough. A
    // sixth or seventh channel needs no edit here, and that is the evidence for
    // "cannot drift structurally".
    for (const alpha of [0.5, 0.75, 1]) {
      const drawn = new Map([["n", alpha]]);
      expect(
        isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined, undefined, undefined, null, drawn),
        `alpha=${alpha}`,
      ).toBe(true);
    }
  });

  it("**바닥은 0.5** — 드로우의 0.02 로 갈아타지 않는다", () => {
    // 0.02–0.5 is the intended "drawn but not hittable" band. Making
    // near-transparent marks hittable produces misclicks and contradicts
    // `computeLabelAlpha`'s rule that anything hittable must be readable.
    for (const alpha of [0.03, 0.2, 0.49]) {
      const drawn = new Map([["n", alpha]]);
      expect(
        isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined, undefined, undefined, null, drawn),
        `alpha=${alpha}`,
      ).toBe(false);
    }
    expect(HITTABLE_MIN_TIER_ALPHA).toBe(0.5);
  });

  it("접힌 노드는 알파와 무관하게 안 잡힌다 — 안 그려지는 것은 안 잡힌다", () => {
    const drawn = new Map([["n", 1]]);
    expect(
      isNodeHittable(
        node("n"),
        OVERVIEW_ZOOM,
        null,
        undefined,
        undefined,
        new Set(["n"]),
        null,
        drawn,
      ),
    ).toBe(false);
  });

  it("맵이 비면 종전 계산으로 떨어진다 — 첫 프레임 방어", () => {
    // Before the first paint the map is empty. That one frame must behave as it does
    // today — a defence, not a regression (a user cannot click before paint).
    const empty = new Map<string, number>();
    // In overview the element tier is closed → not hittable (the pre-existing rule).
    expect(
      isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined, undefined, undefined, null, empty),
    ).toBe(false);
    // But ego makes it hittable even under the pre-existing rule.
    expect(
      isNodeHittable(node("n"), OVERVIEW_ZOOM, "n", undefined, undefined, undefined, null, empty),
    ).toBe(true);
  });

  it("맵을 아예 안 넘기면 종전 시그니처와 동작이 같다 — 호출부 회귀 0", () => {
    expect(isNodeHittable(node("n"), OVERVIEW_ZOOM, "n", undefined)).toBe(true);
    expect(isNodeHittable(node("n"), OVERVIEW_ZOOM, null, undefined)).toBe(false);
    // The spine tier is always open.
    expect(isNodeHittable(node("d", "domain"), OVERVIEW_ZOOM, null, undefined)).toBe(true);
  });
});

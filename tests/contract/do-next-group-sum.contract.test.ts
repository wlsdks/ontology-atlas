import { describe, expect, it } from "vitest";

import {
  buildDoNextGroupCounts,
  doNextGroupOrder,
  sumDoNextGroupCounts,
  type DoNextGroupKey,
} from "../../src/views/ontology-insights/lib/do-next-groups";
import {
  buildInsightsVerdict,
  type InsightsSignalCounts,
} from "../../src/views/ontology-insights/lib/insights-verdict";
import type { QueueSectionKey } from "../../src/views/ontology-insights/lib/queue-work-groups";

/**
 * **The "to do" tab's group counts add up to its title count — always.**
 *
 * ## The accident this exists to prevent
 *
 * Measured 2026-08-07 on a sample folder: the tab badge read «to do **7**» directly above a group
 * heading reading **8**. The difference was one duplicate pair, and the cause was two
 * hand-maintained section lists that grew apart. The recorded decision (2026-08-07 (3)) fixed it
 * by making the verdict take one whole `Record<QueueSectionKey, number>`, and the 2026-08-31
 * decision then removed group headings entirely — one flat list, one count, nothing to disagree
 * with.
 *
 * On 2026-09-06 the groups came back, because eight rows repeating one sentence is not a list a
 * person can read. **A number beside a group is safe only while the numbers add up**, so the
 * grouping ships with this check: for any signal counts, the ten group counts sum exactly to
 * `buildInsightsVerdict(...).total`, which is the number the list title and the tab badge print.
 *
 * ## Why it is not covered by the type checker alone
 *
 * `buildDoNextGroupCounts` and `buildInsightsVerdict` take the same argument, so a *missing* group
 * fails type checking. What types cannot see is a group that double-counts, drops a section into
 * the wrong key, or clamps a value one side only — all three are arithmetic, and all three are
 * exactly how the 2026-08-07 gap opened.
 */

const SECTION_KEYS: readonly QueueSectionKey[] = [
  "missing-definition",
  "missing-domain",
  "duplicate",
  "promotion",
  "neglected-hub",
  "orphan",
  "cycle",
];

const ALL_GROUPS: readonly DoNextGroupKey[] = [
  "blocked-document",
  "island",
  "containment",
  "missing-definition",
  "missing-domain",
  "duplicate",
  "promotion",
  "neglected-hub",
  "orphan",
  "cycle",
];

/** A small deterministic generator — no randomness, so a failure is reproducible by its index. */
function signalCountsAt(seed: number): InsightsSignalCounts {
  const at = (offset: number) => (seed * 7 + offset * 13) % 11;
  const sections = Object.fromEntries(
    SECTION_KEYS.map((key, index) => [key, at(index + 3)]),
  ) as Record<QueueSectionKey, number>;
  return {
    islands: at(0),
    missingContainment: at(1),
    blockedDocuments: at(2),
    sections,
  };
}

describe("do-next 묶음 수의 합 = 목록 제목의 수", () => {
  it("probe: 생성기가 0 만 만들지 않는다 — 늘 참인 등식은 게이트가 아니다", () => {
    const totals = Array.from({ length: 40 }, (_, seed) =>
      buildInsightsVerdict(signalCountsAt(seed)).total,
    );
    expect(Math.max(...totals)).toBeGreaterThan(20);
    expect(new Set(totals).size).toBeGreaterThan(3);
  });

  it("어떤 신호 조합에서도 열 묶음의 합이 판정 총계와 같다", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const counts = signalCountsAt(seed);
      const groups = buildDoNextGroupCounts(counts);
      expect(
        sumDoNextGroupCounts(groups),
        `seed ${seed}: 묶음 합이 제목의 수와 다르다 — 한 화면이 같은 일을 두 수로 센다`,
      ).toBe(buildInsightsVerdict(counts).total);
    }
  });

  it("모든 신호가 0 이면 묶음도 총계도 0 이다", () => {
    const zero = buildDoNextGroupCounts({
      islands: 0,
      missingContainment: 0,
      blockedDocuments: 0,
      sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, 0])) as Record<
        QueueSectionKey,
        number
      >,
    });
    expect(sumDoNextGroupCounts(zero)).toBe(0);
  });

  it("묶음 열쇠는 정확히 열 개이고, 순서는 그 열 개를 한 번씩만 낸다", () => {
    const groups = buildDoNextGroupCounts(signalCountsAt(1));
    expect(Object.keys(groups).sort()).toEqual([...ALL_GROUPS].sort());
    for (const abilities of [
      { canWriteVault: true, agentObserved: true },
      { canWriteVault: false, agentObserved: false },
    ]) {
      const order = doNextGroupOrder(abilities);
      expect(order).toHaveLength(ALL_GROUPS.length);
      expect([...order].sort()).toEqual([...ALL_GROUPS].sort());
    }
  });

  /**
   * The planted defect from `/gate-probe`: miscounting one group is arithmetic the type checker
   * cannot see, and this is the assertion that catches it. The defect is a fixed +1 rather than
   * "read another section", because two sections can legitimately hold the same number and a
   * probe that sometimes plants nothing is not a probe.
   */
  it("probe: 한 묶음이 하나라도 더 세면 등식이 깨진다", () => {
    for (const seed of [0, 5, 17]) {
      const counts = signalCountsAt(seed);
      const groups = buildDoNextGroupCounts(counts);
      const wrong = { ...groups, orphan: groups.orphan + 1 };
      expect(sumDoNextGroupCounts(wrong)).not.toBe(buildInsightsVerdict(counts).total);
    }
  });
});

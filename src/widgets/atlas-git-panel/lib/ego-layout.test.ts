import { describe, expect, it } from "vitest";

import type { ConceptEgo, EgoBearing } from "../model/build-concept-ego";
import { EGO_VIEW_H, EGO_VIEW_W, layoutConceptEgo, rectsIntersect, type Rect } from "./ego-layout";

/**
 * **No neighbour's name is drawn through another's.**
 *
 * Measured 2026-09-25 at 1512x949 on a twelve-neighbour concept: the Korean labels "Issue invoice" and
 * "Payment gateway adapter" sat on adjacent slots and their labels overlapped by
 * 33x19px, because each label took a fixed side of its node without looking at the
 * labels already placed. The layout now tries the four sides; this pins the outcome
 * (no two label boxes intersect) across the densities the drawing actually meets.
 */
const NAMES = [
  "청구서 발행",
  "결제 게이트웨이 어댑터",
  "주문",
  "정산 보고서",
  "환불 처리",
  "재고 예약",
  "배송 추적",
  "쿠폰 적용",
  "Checkout flow",
  "payment-gateway-adapter",
  "알림 발송",
  "세금 계산",
  "회원 등급",
  "장바구니",
];

function ego(counts: Partial<Record<EgoBearing, number>>): ConceptEgo {
  let n = 0;
  const make = (count = 0) =>
    Array.from({ length: count }, () => {
      const label = NAMES[n % NAMES.length];
      const kind = ["capability", "element", "domain", "project"][n % 4];
      n += 1;
      return { id: `n${n}`, label, kind };
    });
  const neighbors = {
    belongsTo: make(counts.belongsTo),
    contains: make(counts.contains),
    dependsOn: make(counts.dependsOn),
    usedBy: make(counts.usedBy),
  };
  return {
    id: "self",
    label: "결제 승인",
    kind: "capability",
    domainLabel: null,
    docSlug: "capabilities/pay",
    summary: null,
    agentSlug: "capabilities/pay",
    projectLabels: [],
    total: n,
    neighbors,
  };
}

const CASES: Partial<Record<EgoBearing, number>>[] = [
  { contains: 6 },
  { contains: 7 },
  { contains: 9 },
  { belongsTo: 1, contains: 5 },
  { belongsTo: 1, contains: 4, dependsOn: 3 },
  { belongsTo: 1, contains: 6, dependsOn: 2, usedBy: 3 },
  { belongsTo: 2, contains: 7, dependsOn: 7, usedBy: 7 },
  { contains: 3, usedBy: 4 },
  { dependsOn: 5, usedBy: 5 },
];

describe("layoutConceptEgo — label placement", () => {
  for (const counts of CASES) {
    const label = Object.entries(counts)
      .map(([bearing, count]) => `${bearing} ${count}`)
      .join(", ");
    it(`no two labels intersect (${label})`, () => {
      const layout = layoutConceptEgo(ego(counts));
      expect(layout).not.toBeNull();
      const rects: { name: string; rect: Rect }[] = [{ name: "self", rect: layout!.selfLabel.rect }];
      for (const slot of layout!.slots) {
        if (slot.type === "node") rects.push({ name: slot.label.text, rect: slot.label.rect });
      }
      // A test that measures nothing passes on anything.
      expect(rects.length).toBeGreaterThanOrEqual(6);
      const collisions: string[] = [];
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          if (rectsIntersect(rects[i].rect, rects[j].rect)) collisions.push(`${rects[i].name} × ${rects[j].name}`);
        }
      }
      expect(collisions).toEqual([]);
    });
  }

  /*
   * The drawing is laid out in its cell's own pixels (round three, 2026-09-25): a fixed view
   * scaled into a 740x410 cell used about 40% of it and drew 11px labels at 9-10px. These are
   * the cells measured at 1280 (stacked under the table), 1512 and 1920.
   */
  const VIEWS = [
    { w: 609, h: 280 },
    { w: 468, h: 358 },
    { w: 737, h: 470 },
  ];
  for (const view of VIEWS) {
    it(`fills a ${view.w}x${view.h} cell without two labels meeting`, () => {
      for (const counts of CASES) {
        const layout = layoutConceptEgo(ego(counts), undefined, view)!;
        const rects: Rect[] = [layout.selfLabel.rect];
        let reach = 0;
        for (const slot of layout.slots) {
          reach = Math.max(reach, Math.abs(slot.x - layout.cx) / (view.w / 2), Math.abs(slot.y - layout.cy) / (view.h / 2));
          if (slot.type !== "node") continue;
          rects.push(slot.label.rect);
          expect(slot.label.rect.x).toBeGreaterThanOrEqual(0);
          expect(slot.label.rect.x + slot.label.rect.w).toBeLessThanOrEqual(view.w);
        }
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) expect(rectsIntersect(rects[i], rects[j])).toBe(false);
        }
        // The fan reaches well into the cell on at least one axis rather than huddling in its
        // middle (the old fixed view reached about 0.3 of a 737px cell).
        expect(reach).toBeGreaterThan(0.55);
      }
    });
  }

  it("keeps every label inside the drawing", () => {
    const layout = layoutConceptEgo(ego({ belongsTo: 1, contains: 6, dependsOn: 2, usedBy: 3 }))!;
    for (const slot of layout.slots) {
      if (slot.type !== "node") continue;
      const { x, y, w, h } = slot.label.rect;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(EGO_VIEW_W);
      expect(y + h).toBeLessThanOrEqual(EGO_VIEW_H);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  CLUSTER_CHIP_LABEL_PRIORITY,
  NODE_DISC_LABEL_PRIORITY,
  clampAnchorIntoSafeRect,
  bboxesOverlap,
  overlapsForeignReserved,
  ellipsizeToWidth,
  greedyPlaceLabels,
  isSafeRectProtectedLabel,
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

describe("isSafeRectProtectedLabel — 인셋 밖으로 나간 이름을 버리나 당기나", () => {
  const plain = {
    egoState: "normal" as const,
    isHovered: false,
    trailKept: false,
    kind: "capability" as const,
    isHub: false,
  };

  it("허브와 프로젝트는 아무 상호작용 없이도 살아남는다 (원장 2026-08-08 (3) ②)", () => {
    // 실측 재현: 세션 중 볼트를 열면 최외곽 허브(반경 395)가 상단 인셋(148) 위로
    // 밀려 **그려지는데 이름만 없는** 앰버 링이 됐다. 노드 패스는 뷰포트 전체로
    // 컬하고 이 패스만 안전영역으로 컬해서 생긴 비대칭이다.
    expect(isSafeRectProtectedLabel({ ...plain, isHub: true })).toBe(true);
    expect(isSafeRectProtectedLabel({ ...plain, kind: "project" })).toBe(true);
    // 허브 판정은 kind 와 무관하다 — 허브는 `resolveLabelPriority` 에서도 이미
    // project 와 같은 등급이다(위 「project/hub」 케이스).
    expect(isSafeRectProtectedLabel({ ...plain, kind: "domain", isHub: true })).toBe(true);
  });

  it("사용자가 지금 보고 있는 것은 종전대로 살아남는다", () => {
    for (const state of ["center", "neighbor"] as const) {
      expect(isSafeRectProtectedLabel({ ...plain, egoState: state })).toBe(true);
    }
    expect(isSafeRectProtectedLabel({ ...plain, isHovered: true })).toBe(true);
    expect(isSafeRectProtectedLabel({ ...plain, trailKept: true })).toBe(true);
  });

  it("평범한 구경꾼은 여전히 떨어진다 — 안 그러면 인셋 가장자리에 전부 쌓인다", () => {
    expect(isSafeRectProtectedLabel(plain)).toBe(false);
    expect(isSafeRectProtectedLabel({ ...plain, kind: "domain" })).toBe(false);
    expect(isSafeRectProtectedLabel({ ...plain, kind: "element" })).toBe(false);
    expect(isSafeRectProtectedLabel({ ...plain, egoState: "dim" })).toBe(false);
  });
});

describe("clampAnchorIntoSafeRect (Guardian follow-up A)", () => {
  const rect = { left: 344, right: 1500, top: 0, bottom: 900 };

  it("clamps an anchor under the left chrome inset to the inset edge (+margins)", () => {
    const c = clampAnchorIntoSafeRect(200, 450, rect, 40, 12);
    expect(c).toEqual({ x: 344 + 40, y: 450 });
  });

  it("leaves an in-rect anchor untouched", () => {
    expect(clampAnchorIntoSafeRect(800, 450, rect, 40, 12)).toEqual({ x: 800, y: 450 });
  });

  it("clamps both axes at a corner and never inverts on degenerate rects", () => {
    expect(clampAnchorIntoSafeRect(0, 2000, rect, 40, 12)).toEqual({ x: 384, y: 888 });
    const tiny = { left: 0, right: 10, top: 0, bottom: 10 };
    const c = clampAnchorIntoSafeRect(-5, -5, tiny, 40, 12);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
  });
});

describe("greedyPlaceLabels — 예약 점유(S11 클러스터 칩 겹침)", () => {
  const box = (minX: number, maxX: number): { minX: number; minY: number; maxX: number; maxY: number } => ({
    minX,
    maxX,
    minY: 0,
    maxY: 20,
  });
  const candidate = (priority: number, minX: number, maxX: number, id: string): LabelCandidate<string> => ({
    priority,
    order: 0,
    bbox: box(minX, maxX),
    payload: id,
  });
  const chip = { bbox: box(100, 160), priority: CLUSTER_CHIP_LABEL_PRIORITY };

  it("칩과 겹치는 수동적 라벨(요소·역량·도메인)은 떨어진다", () => {
    for (const priority of [3, 4, 5]) {
      const placed = greedyPlaceLabels([candidate(priority, 120, 200, "overlaps")], undefined, [chip]);
      expect(placed.map((c) => c.payload)).toEqual([]);
    }
  });

  it("선택(0)·호버(1) 라벨은 칩보다 상위라 살아남는다 — 보고 있는 이름을 칩이 침묵시키지 않는다", () => {
    for (const priority of [0, 1]) {
      const placed = greedyPlaceLabels([candidate(priority, 120, 200, "attended")], undefined, [chip]);
      expect(placed.map((c) => c.payload)).toEqual(["attended"]);
    }
  });

  it("같은 우선순위(2)면 칩에 밀리지 않는다 — 엄격히 더 낮을 때만 양보", () => {
    const placed = greedyPlaceLabels([candidate(2, 120, 200, "tie")], undefined, [chip]);
    expect(placed.map((c) => c.payload)).toEqual(["tie"]);
  });

  it("칩과 겹치지 않는 라벨은 그대로 배치된다 — 유령 예약 없음", () => {
    const placed = greedyPlaceLabels([candidate(5, 200, 260, "clear")], undefined, [chip]);
    expect(placed.map((c) => c.payload)).toEqual(["clear"]);
  });

  it("reserved 미지정이면 종전과 동일하다(회귀 0)", () => {
    const cands = [candidate(5, 120, 200, "a"), candidate(4, 130, 210, "b")];
    expect(greedyPlaceLabels(cands).map((c) => c.payload)).toEqual(
      greedyPlaceLabels(cands, undefined, []).map((c) => c.payload),
    );
  });
});

describe("노드 도형 예약 — 라벨이 노드 위에 글자를 얹지 않는다 (진입 검수 E-4)", () => {
  const box = (minX: number, maxX: number, minY = 0, maxY = 20) => ({ minX, maxX, minY, maxY });
  const disc = { bbox: box(100, 160, 0, 60), priority: NODE_DISC_LABEL_PRIORITY, ownerId: "n1" };

  it("자기 노드의 예약에는 굴복하지 않는다 — 안 그러면 모든 라벨이 사라진다", () => {
    // 라벨은 언제나 자기 노드 바로 아래(또는 위)에 붙으므로 자기 예약과 겹친다.
    expect(overlapsForeignReserved(box(110, 150), "n1", 5, [disc])).toBe(false);
  });

  it("남의 노드 도형과 겹치는 수동적 라벨은 비켜선다", () => {
    for (const priority of [2, 3, 4, 5]) {
      expect(overlapsForeignReserved(box(110, 150), "other", priority, [disc])).toBe(true);
    }
  });

  it("선택(0)·호버(1) 라벨은 남의 도형에도 굴복하지 않는다 — 보고 있는 이름이 우선", () => {
    for (const priority of [0, 1]) {
      expect(overlapsForeignReserved(box(110, 150), "other", priority, [disc])).toBe(false);
    }
  });

  it("주인 없는 예약(클러스터 칩)은 주인 없는 후보도 억제한다", () => {
    const chipOnly = { bbox: box(100, 160), priority: CLUSTER_CHIP_LABEL_PRIORITY };
    expect(overlapsForeignReserved(box(120, 200), undefined, 4, [chipOnly])).toBe(true);
  });

  it("겹치지 않으면 통과", () => {
    expect(overlapsForeignReserved(box(200, 260), "other", 5, [disc])).toBe(false);
  });
});

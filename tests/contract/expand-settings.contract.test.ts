import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPAND,
  EXPAND_AFFORDANCES,
  EXPAND_RANGES,
  EXPAND_STRUCTURES,
  resolveExpand,
  type ExpandStructure,
} from "@/shared/lib/appearance-preferences";
import {
  CLUSTER_BADGE_HEIGHT,
  CLUSTER_BAR_HEIGHT,
  CLUSTER_CHIP_HEIGHT,
  clusterBadgeRect,
  clusterBarRect,
  clusterChipOccupancyRect,
  clusterChipRect,
  clusterControlForm,
  drawClusterChip,
  type ClusterChipColors,
} from "@/widgets/topology-map-v2/render/cluster-chips";
import {
  EGO_NEIGHBOR_LIMIT,
  selectiveEgoNeighbors,
} from "@/widgets/topology-map-v2/model/focus-state";
import {
  DISC_LABEL_TOP_K,
  selectDiscLabelEligible,
} from "@/widgets/topology-map-v2/model/label-lod";
import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutRings,
} from "@/widgets/topology-map-v2/model/layout";
import {
  MAX_EXPANDED_PARENTS,
  toggleExpandedParent,
  parseExpandedParentsParam,
} from "@/views/home/model/url-state";

/**
 * 확장 설정 계약 — **설정이 장식이 아니라는 증거**.
 *
 * 시안(`.qa-scratch/proto-expand.html`)의 좌측 패널을 제품에 이식하면서 가장
 * 쉬운 실패 모드는 하나다: **값은 저장되는데 화면이 그대로인 것**. 그러면
 * 설정 화면은 있고 설정은 없다. 그래서 이 파일은 다섯 값 각각에 대해 「바꾸면
 * 그려지는 것이 실제로 달라진다」를 잰다 — 스냅샷이 아니라 **사각형과 개수**로.
 *
 * 두 번째 실패 모드는 **드로우와 히트가 갈라지는 것**이다(칩이 이미 두 번 겪은
 * 결함 — `draw-hit-lockstep.contract.test.ts` 의 교훈). 어포던스는 그리는 형태를
 * 바꾸므로 눌리는 사각형도 같이 바뀌어야 하고, 그 판정은 함수 **하나**
 * (`clusterControlForm`)여야 한다.
 */

const PARENT = { x: 400, y: 300, radius: 17 };
const ANCHOR = { x: 520, y: 300 };

const chipInput = (over: Partial<Parameters<typeof clusterChipOccupancyRect>[0]> = {}) => ({
  screenX: ANCHOR.x,
  screenY: ANCHOR.y,
  count: 31,
  expanded: false,
  hovered: false,
  parentScreenX: PARENT.x,
  parentScreenY: PARENT.y,
  nodeScreenRadius: PARENT.radius,
  ...over,
});

describe("확장 설정 — 기본값", () => {
  /**
   * **소유자 결정 2026-08-01: 기본 어포던스는 「머리 위 막대」다.**
   * 이 한 값만이 오늘 화면을 의도적으로 바꾼다. 값이 조용히 되돌아가면 그
   * 결정이 사라진 것이므로 여기서 못 박는다(배경·반증 조건은 `docs/DECISIONS.md`).
   */
  it("설정을 안 건드린 사람은 「머리 위 막대」를 받는다", () => {
    expect(DEFAULT_EXPAND.affordance).toBe("bar");
    expect(resolveExpand(null).affordance).toBe("bar");
    expect(resolveExpand({}).affordance).toBe("bar");
    // 손으로 편집된 저장값이 모르는 문자열이어도 기본값으로 떨어진다.
    expect(resolveExpand({ affordance: "sparkles" }).affordance).toBe("bar");
  });

  /**
   * 나머지 넷은 **오늘 그려지는 것과 같은 값**이다 — 어포던스 하나만 바뀌고
   * 다른 것은 안 바뀐다는 것이 이 변경의 사정거리다.
   */
  it("어포던스 말고는 오늘의 값 그대로다", () => {
    expect(DEFAULT_EXPAND.structure).toBe<ExpandStructure>("disc");
    expect(DEFAULT_EXPAND.batchSize).toBe(EGO_NEIGHBOR_LIMIT);
    expect(DEFAULT_EXPAND.labelAttempts).toBe(DISC_LABEL_TOP_K);
    expect(DEFAULT_EXPAND.maxOpenParents).toBe(MAX_EXPANDED_PARENTS);
  });

  /**
   * 슬라이더 상·하한은 시안 값 그대로다(임의로 좁히지 않는다). 그리고 세
   * 기본값은 전부 그 범위 **안**이어야 한다 — 밖이면 설정을 여는 순간
   * 슬라이더가 값을 잘라 사용자가 만지지도 않은 화면이 바뀐다.
   */
  it("범위는 시안 값이고 기본값은 그 안에 있다", () => {
    expect(EXPAND_RANGES.batchSize).toMatchObject({ min: 4, max: 24 });
    expect(EXPAND_RANGES.labelAttempts).toMatchObject({ min: 3, max: 40 });
    expect(EXPAND_RANGES.maxOpenParents).toMatchObject({ min: 1, max: 6 });
    for (const key of ["batchSize", "labelAttempts", "maxOpenParents"] as const) {
      expect(DEFAULT_EXPAND[key], key).toBeGreaterThanOrEqual(EXPAND_RANGES[key].min);
      expect(DEFAULT_EXPAND[key], key).toBeLessThanOrEqual(EXPAND_RANGES[key].max);
    }
  });

  it("범위 밖 저장값은 잘라 넣는다(렌더러에 NaN 이 새지 않게)", () => {
    expect(resolveExpand({ batchSize: 999 }).batchSize).toBe(24);
    expect(resolveExpand({ batchSize: -5 }).batchSize).toBe(4);
    expect(resolveExpand({ maxOpenParents: Number.NaN }).maxOpenParents).toBe(
      DEFAULT_EXPAND.maxOpenParents,
    );
  });
});

describe("펼치기 표시 — 셋이 실제로 갈아끼워진다", () => {
  /**
   * 값만 저장되고 화면이 그대로면 그건 설정이 아니라 장식이다. 셋이 **서로 다른
   * 형태**를 내는지부터 잠근다.
   */
  it("접힌 부모: 알약 · 막대(고른 노드) · 배지가 서로 다른 형태다", () => {
    const forms = EXPAND_AFFORDANCES.map((affordance) =>
      clusterControlForm({ affordance, expanded: false, focused: true }),
    );
    expect(forms).toEqual(["pill", "bar", "badge"]);
    expect(new Set(forms).size, "셋이 같은 형태로 붕괴했다").toBe(3);
  });

  /**
   * 「머리 위 막대」는 **고른 노드에만** 있다(시안: *"안 고르면 아무것도 없고"*).
   * 이 성질이 사라지면 막대가 알약처럼 상시로 떠서 셋의 차이가 없어진다.
   */
  it("막대는 고른 노드에만 존재한다", () => {
    expect(clusterControlForm({ affordance: "bar", expanded: false, focused: false })).toBe("none");
    expect(clusterControlForm({ affordance: "bar", expanded: false, focused: true })).toBe("bar");
    // 없다고 판정했으면 **자리도 차지하지 않는다** — 유령 예약은 라벨이 빈 곳을
    // 피하게 만든다(이 파일이 이미 배운 결함).
    expect(
      clusterChipOccupancyRect(chipInput({ affordance: "bar", focused: false })),
    ).toBeNull();
  });

  /** 셋의 사각형이 **다른 자리**에 있어야 화면에서도 갈린다 — px 로 잰다. */
  it("셋의 사각형이 서로 다른 자리에 앉는다", () => {
    const rects = EXPAND_AFFORDANCES.map((affordance) => {
      const rect = clusterChipOccupancyRect(chipInput({ affordance, focused: true }));
      expect(rect, `${affordance} 가 사각형을 안 낸다`).not.toBeNull();
      return rect as NonNullable<typeof rect>;
    });
    const centers = rects.map((r) => `${Math.round(r.x + r.w / 2)},${Math.round(r.y + r.h / 2)}`);
    expect(new Set(centers).size, `셋이 같은 자리다: ${centers.join(" / ")}`).toBe(3);

    const [pill, bar, badge] = rects;
    // 알약은 anchor 중심(노드에서 떨어진 빈 자리).
    expect(pill.x + pill.w / 2).toBeCloseTo(ANCHOR.x, 6);
    // 막대는 부모 **바로 위** — 가로 중심이 부모와 같고, 밑변이 노드 머리 위다.
    expect(bar.x + bar.w / 2).toBeCloseTo(PARENT.x, 6);
    expect(bar.y + bar.h).toBeLessThan(PARENT.y - PARENT.radius);
    // 배지는 우상단 어깨 — 오른쪽이고 위다.
    expect(badge.x + badge.w / 2).toBeGreaterThan(PARENT.x);
    expect(badge.y + badge.h / 2).toBeLessThan(PARENT.y);
  });

  /**
   * **회귀 0** — 「뜬 알약」을 고른 사람은 종전과 한 픽셀도 다르지 않아야 한다.
   * 접힘=알약(anchor), 펼침=어깨 배지라는 종전 짝이 그대로다.
   */
  it("「뜬 알약」은 종전 지오메트리와 같다", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "pill", focused: true }));
    expect(collapsed).toEqual(clusterChipRect(ANCHOR.x, ANCHOR.y, "+31", 1));
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "pill", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(
      clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "−31", 1),
    );
  });

  /** 「머리 위 막대」는 접힘·펼침 둘 다 막대고, 부호만 `+`↔`−` 로 바뀐다. */
  it("「머리 위 막대」의 예약 사각형이 막대 지오메트리와 같다", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "bar", focused: true }));
    expect(collapsed).toEqual(
      clusterBarRect(PARENT.x, PARENT.y, PARENT.radius, "+31", 1),
    );
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "bar", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(
      clusterBarRect(PARENT.x, PARENT.y, PARENT.radius, "− 31", 1),
    );
  });

  /** 「어깨 배지」는 접힘·펼침 **둘 다** 배지고, 부호만 바뀐다. */
  it("「어깨 배지」는 접혀도 배지고 부호만 `+`↔`−` 다", () => {
    const collapsed = clusterChipOccupancyRect(chipInput({ affordance: "badge", focused: true }));
    expect(collapsed).toEqual(clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "+31", 1));
    const expanded = clusterChipOccupancyRect(
      chipInput({ affordance: "badge", expanded: true, focused: true }),
    );
    expect(expanded).toEqual(clusterBadgeRect(PARENT.x, PARENT.y, PARENT.radius, "−31", 1));
  });

  /**
   * 히트테스트(`topology-pointer-handlers.ts`)와 라벨 예약과 드로우가 **같은
   * 판정 함수**를 본다. 그 함수가 없으면 셋이 각자 `if (expanded)` 를 다시 써서
   * 언젠가 갈라진다 — 그게 「보이는데 안 눌리는 버튼」의 생성 경로다.
   */
  it("부모 좌표를 모르면 도킹 형태는 그리지도 예약하지도 않는다", () => {
    for (const affordance of ["bar", "badge"] as const) {
      expect(
        clusterChipOccupancyRect({
          screenX: ANCHOR.x,
          screenY: ANCHOR.y,
          count: 9,
          expanded: false,
          hovered: false,
          affordance,
          focused: true,
        }),
        affordance,
      ).toBeNull();
    }
  });
});

describe("한 번에 여는 개수 — 그려지는 자식 수가 바뀐다", () => {
  const ranked = Array.from({ length: 60 }, (_, i) => `n${i}`);

  it("값을 내리면 보이는 자식이 실제로 줄어든다", () => {
    const wide = selectiveEgoNeighbors(ranked, 1, 24);
    const narrow = selectiveEgoNeighbors(ranked, 1, 4);
    expect(wide.visibleNeighbors.size).toBe(24);
    expect(narrow.visibleNeighbors.size).toBe(4);
    // 나머지는 사라지는 게 아니라 접힌다 — 「N개 펼치기」를 다시 누르면 온다.
    expect(narrow.hiddenCount).toBe(56);
    const second = selectiveEgoNeighbors(ranked, 2, 4);
    expect(second.visibleNeighbors.size).toBe(8);
  });

  it("범위 양 끝이 서로 다른 화면을 만든다", () => {
    const min = selectiveEgoNeighbors(ranked, 1, EXPAND_RANGES.batchSize.min);
    const max = selectiveEgoNeighbors(ranked, 1, EXPAND_RANGES.batchSize.max);
    expect(min.visibleNeighbors.size).toBeLessThan(max.visibleNeighbors.size);
  });
});

describe("이름을 시도할 개수 — 붙는 이름이 바뀐다", () => {
  const disc = [Array.from({ length: 40 }, (_, i) => `c${i}`)];

  it("값이 곧 「몇 개까지 시도하나」다", () => {
    expect(selectDiscLabelEligible(disc, 3).size).toBe(3);
    expect(selectDiscLabelEligible(disc, 8).size).toBe(8);
    expect(selectDiscLabelEligible(disc, 40).size).toBe(40);
  });

  it("기본값에서는 오늘과 같은 예산이다", () => {
    expect(selectDiscLabelEligible(disc, DEFAULT_EXPAND.labelAttempts).size).toBe(DISC_LABEL_TOP_K);
  });
});

describe("동시에 펼쳐 둘 부모 — 상한이 실제로 움직인다", () => {
  it("상한을 낮추면 더 일찍 가장 오래된 것이 닫힌다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id, 2);
    expect(open).toEqual(["c", "d"]);
  });

  it("상한을 올리면 더 많이 열린 채로 남는다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d", "e", "f", "g"]) open = toggleExpandedParent(open, id, 6);
    expect(open).toEqual(["b", "c", "d", "e", "f", "g"]);
  });

  it("접기는 상한과 무관하게 언제나 된다", () => {
    expect(toggleExpandedParent(["a", "b"], "a", 1)).toEqual(["b"]);
  });

  /**
   * **딥링크도 같은 상한을 받는다** — 안 그러면 링크 하나로 상한을 우회해,
   * 받은 사람이 보낸 사람보다 나쁜 화면을 본다.
   */
  it("`?open=` 딥링크도 사용자 상한에 잘린다", () => {
    expect(parseExpandedParentsParam("a,b,c,d,e", 2)).toEqual(["d", "e"]);
    expect(parseExpandedParentsParam("a,b,c,d,e", 5)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("기본값은 오늘 상한 그대로다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id);
    expect(open.length).toBe(MAX_EXPANDED_PARENTS);
  });
});

describe("확장 구조 — 자식 좌표가 실제로 바뀐다", () => {
  const rings: LayoutRings = { domain: 300, capability: 120, element: 70 };
  /** 임계(12) 초과 자식 — 확장 구조가 걸리는 정확히 그 부모다. */
  const nodes: LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      kind: "capability" as const,
      parentId: "d",
    })),
  ];
  const place = (expandStructure: ExpandStructure) =>
    new Map(
      computeConcentricLayout(nodes, rings, { expandStructure, relaxIterations: 0 }).map((p) => [
        p.id,
        p,
      ]),
    );

  it("넷이 서로 다른 배치를 낸다", () => {
    const signatures = EXPAND_STRUCTURES.map((structure) => {
      const points = place(structure);
      return EXPAND_STRUCTURES.length > 0
        ? Array.from({ length: 30 }, (_, i) => {
            const p = points.get(`c${i}`);
            return `${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)}`;
          }).join("|")
        : "";
    });
    expect(new Set(signatures).size, "구조를 바꿔도 좌표가 같다 — 설정이 장식이다").toBe(
      EXPAND_STRUCTURES.length,
    );
  });

  /** **회귀 0** — 설정을 안 건드린 사람의 좌표는 오늘과 바이트 동일하다. */
  it("기본값(나선 원반)은 옵션을 안 넘긴 것과 같다", () => {
    const withOption = computeConcentricLayout(nodes, rings, {
      expandStructure: "disc",
      relaxIterations: 0,
    });
    const withoutOption = computeConcentricLayout(nodes, rings, { relaxIterations: 0 });
    expect(withOption).toEqual(withoutOption);
  });

  /**
   * 각 구조는 시안이 적어 둔 **자기 성질**을 지켜야 한다 — 이름만 다르고 그림이
   * 같으면 고를 이유가 없다.
   */
  it("고리는 부모를 감싼다(사방을 쓴다)", () => {
    const points = place("ring");
    const parent = points.get("d") as { x: number; y: number };
    const angles = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.atan2(p.y - parent.y, p.x - parent.x);
    });
    // 부챗살은 한쪽 쐐기 안에만 있고, 고리는 네 사분면을 전부 쓴다.
    const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
    expect(quadrants.size, "고리가 사방을 안 쓴다").toBe(4);
  });

  it("기둥은 줄이 여럿이고 열마다 바깥으로 나아간다", () => {
    const points = place("column");
    const parent = points.get("d") as { x: number; y: number };
    const dists = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.hypot(p.x - parent.x, p.y - parent.y);
    });
    // 열이 늘어나면 부모에서 멀어진다 — 「대신 길어진다」가 이 안의 대가다.
    expect(Math.max(...dists)).toBeGreaterThan(Math.min(...dists));
  });

  it("부챗살은 한쪽 쐐기 안에 머문다", () => {
    const points = place("fan");
    const parent = points.get("d") as { x: number; y: number };
    const angles = Array.from({ length: 30 }, (_, i) => {
      const p = points.get(`c${i}`) as { x: number; y: number };
      return Math.atan2(p.y - parent.y, p.x - parent.x);
    });
    const quadrants = new Set(angles.map((a) => Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2))));
    expect(quadrants.size, "부챗살이 사방으로 퍼졌다 — 고리와 구별이 없다").toBeLessThan(4);
  });
});

describe("시안의 것 중 옮기지 않은 것", () => {
  /**
   * 시안의 「볼트 규모」(작음/실제/큼)는 **시험 부하**다 — 자기를 재려고 만든
   * 손잡이지 제품 설정이 아니다. 옮기면 사용자가 자기 데이터의 크기를 «고르는»
   * 컨트롤을 보게 된다.
   */
  it("「볼트 규모」는 설정 타입에 없다", () => {
    const keys = Object.keys(DEFAULT_EXPAND);
    expect(keys).toEqual([
      "affordance",
      "structure",
      "batchSize",
      "labelAttempts",
      "maxOpenParents",
    ]);
    expect(keys.some((k) => /scale|vault|size$/i.test(k) && k !== "batchSize")).toBe(false);
  });
});

/* ── 실제로 칠해지는가 — 기록하는 가짜 ctx 로 «그려진 것»을 잰다 ─────────── */

const COLORS: ClusterChipColors = {
  surface: "#15161a",
  border: "#3a3b46",
  plusInk: "#5e6ad2",
  numeralInk: "#8a8a94",
  tether: "#646471",
  hoverSurface: "#17171d",
  hoverBorder: "#5e6ad2",
  hoverInk: "#787ef6",
};

/**
 * 채워진 둥근 사각형/원의 **바운딩 박스**를 모으는 기록용 2D 컨텍스트.
 * jsdom 에는 캔버스가 없으므로, 「무엇이 어디에 칠해졌나」를 경로 좌표로 잰다 —
 * 스냅샷이 아니라 사각형이다.
 */
function recordingCtx() {
  const points: { x: number; y: number }[] = [];
  const ops: string[] = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    setLineDash() {},
    moveTo(x: number, y: number) { points.push({ x, y }); },
    lineTo(x: number, y: number) { points.push({ x, y }); },
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
    },
    arc(x: number, y: number, r: number) {
      points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r });
      ops.push("arc");
    },
    fill() { ops.push("fill"); },
    stroke() { ops.push("stroke"); },
    fillText() { ops.push("text"); },
    measureText(text: string) { return { width: text.length * 7 }; },
  };
  const bbox = () => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, bbox, ops, points };
}

describe("그려진 것 — 기본값에서 지도에 서는 것은 「머리 위 막대」다", () => {
  const drawWith = (affordance: (typeof EXPAND_AFFORDANCES)[number], focused = true) => {
    const rec = recordingCtx();
    drawClusterChip(
      rec.ctx,
      { ...chipInput({ affordance, focused }) },
      COLORS,
    );
    return rec;
  };

  /**
   * 설정을 한 번도 안 건드린 사람의 지도. **기본값으로 그렸을 때 실제로 칠해지는
   * 것**이 부모 머리 위의 막대여야 한다 — 값이 저장만 되고 화면이 그대로면
   * 이 테스트가 잡는다.
   */
  it("기본 어포던스로 그리면 부모 머리 위에 막대가 칠해진다", () => {
    const rec = drawWith(DEFAULT_EXPAND.affordance);
    const box = rec.bbox();
    expect(rec.ops, "아무것도 안 칠해졌다").toContain("fill");
    // 판의 밑변이 노드 머리 **위**에 있다.
    expect(box.maxY).toBeLessThan(PARENT.y - PARENT.radius);
    // 가로 중심이 부모와 같다 — 「자리를 찾지 않는다」.
    expect((box.x + box.maxX) / 2).toBeCloseTo(PARENT.x, 0);
    // 높이는 막대 규격이지 알약·배지 규격이 아니다.
    expect(Math.round(box.maxY - box.y)).toBe(CLUSTER_BAR_HEIGHT);
    // 원을 그리지 않는다 — 배지가 아니다.
    expect(rec.ops).not.toContain("arc");
  });

  it("안 고른 부모에는 기본값에서 아무것도 안 칠해진다", () => {
    const rec = drawWith("bar", false);
    expect(rec.ops).toEqual([]);
  });

  /** 셋을 갈아끼우면 **칠해지는 높이와 자리**가 실제로 달라진다. */
  it("어포던스를 바꾸면 칠해지는 것이 바뀐다", () => {
    const heights = EXPAND_AFFORDANCES.map((affordance) => {
      const box = drawWith(affordance).bbox();
      return Math.round(box.maxY - box.y);
    });
    // 알약(28) · 막대(24) · 배지(18) — 셋 다 다른 규격이다.
    expect(heights[0]).toBe(CLUSTER_CHIP_HEIGHT);
    expect(heights[1]).toBe(CLUSTER_BAR_HEIGHT);
    expect(heights[2]).toBe(CLUSTER_BADGE_HEIGHT);
    expect(new Set(heights).size, "셋이 같은 것을 그린다").toBe(3);
  });
});

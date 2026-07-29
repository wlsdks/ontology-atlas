import { describe, expect, it } from "vitest";

import {
  appendFootprintVisit,
  collapseFootprintTrail,
  FOOTPRINT_TRAIL_MAX,
  formatFootprintTrailAgentPacket,
  graphIdToConceptSlug,
  type FootprintTrailEntry,
  type FootprintTrailPacketLabels,
} from "./footprint-trail";

describe("appendFootprintVisit", () => {
  it("빈 트레일에 첫 방문을 추가", () => {
    expect(appendFootprintVisit([], "capability:a")).toEqual(["capability:a"]);
  });

  it("순서를 보존하며 끝에 추가", () => {
    expect(appendFootprintVisit(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  /**
   * 종전엔 재방문이 기존 위치를 지우고 끝으로 이동했다. 그 구현에서는 노드당
   * 걸음이 최대 1개라 "숫자 여러 개"가 데이터 층에서 불가능했다.
   */
  it("재방문은 지우지 않고 새 걸음으로 쌓인다 — 되돌아온 사실이 경로에 남는다", () => {
    expect(appendFootprintVisit(["a", "b", "c"], "a")).toEqual(["a", "b", "c", "a"]);
  });

  it("연속 중복은 걸음이 아니다 — 같은 노드 재클릭으로 순번이 늘지 않는다", () => {
    expect(appendFootprintVisit(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("상한 초과 시 가장 오래된 방문을 밀어낸다", () => {
    const full = Array.from({ length: FOOTPRINT_TRAIL_MAX }, (_, i) => `n${i}`);
    const next = appendFootprintVisit(full, "new");
    expect(next.length).toBe(FOOTPRINT_TRAIL_MAX);
    expect(next[next.length - 1]).toBe("new");
    expect(next[0]).toBe("n1"); // n0 밀려남
  });

  it("불변 — 입력 배열을 변형하지 않는다", () => {
    const input = ["a", "b"];
    appendFootprintVisit(input, "c");
    expect(input).toEqual(["a", "b"]);
  });
});

describe("collapseFootprintTrail", () => {
  it("같은 노드는 마지막 방문만 남기고 순서를 보존한다", () => {
    expect(collapseFootprintTrail(["a", "b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("중복이 없으면 그대로", () => {
    expect(collapseFootprintTrail(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("graphIdToConceptSlug", () => {
  it("kind 접두를 벗겨 bare 슬러그를 반환", () => {
    expect(graphIdToConceptSlug("capability:ai-agent-partner")).toBe("ai-agent-partner");
    expect(graphIdToConceptSlug("project:atlas")).toBe("atlas");
  });
  it("접두 없는 id 는 그대로", () => {
    expect(graphIdToConceptSlug("plain")).toBe("plain");
  });
});

const LABELS: FootprintTrailPacketLabels = {
  title: "걸어온 길",
  order: "방문 순서:",
  reviewHint: "각 노드 맥락 검토:",
  pathHint: "여정 양 끝 경로 확인:",
};

describe("formatFootprintTrailAgentPacket", () => {
  const entries: FootprintTrailEntry[] = [
    { id: "domain:core", title: "Core", kind: "domain" },
    { id: "capability:x", title: "Cap X", kind: "capability" },
  ];

  it("슬러그 순서 + get_concept 시퀀스 + find_path 힌트를 담는다", () => {
    const text = formatFootprintTrailAgentPacket(entries, LABELS);
    expect(text).toContain("# 걸어온 길");
    expect(text).toContain("1. Core (domain): domain:core");
    expect(text).toContain("2. Cap X (capability): capability:x");
    expect(text).toContain('get_concept("core")');
    expect(text).toContain('get_concept("x")');
    expect(text).toContain('find_path("core", "x")');
  });

  it("방문이 1개면 find_path 힌트를 넣지 않는다", () => {
    const text = formatFootprintTrailAgentPacket([entries[0]], LABELS);
    expect(text).toContain('get_concept("core")');
    expect(text).not.toContain("find_path");
  });
});

import { describe, expect, it } from "vitest";
import { resolveBuilderCanvasSelection } from "./resolve-canvas-selection";

// 토스 #1 — 캔버스 드래프트 노드 클릭 시 인스펙터가 그 노드로 전환됐다가
// 즉시 빈 상태로 되돌아가던 결함의 근본 원인은 xyflow 가 그래프 재빌드
// 프레임에 발화하는 빈 selection 보고를 `selectedId = null` 로 전파한 것.
// 이 순수 판정은 노드 선택만 전파하고 빈 보고는 무시한다.
describe("resolveBuilderCanvasSelection", () => {
  it("노드가 선택되면 그 첫 노드 id 를 전파한다", () => {
    expect(
      resolveBuilderCanvasSelection({ nodes: [{ id: "eph-1" }], edges: [] }),
    ).toEqual({ propagate: true, selectedId: "eph-1" });
  });

  it("여러 노드 중 첫 노드를 선택으로 삼는다", () => {
    expect(
      resolveBuilderCanvasSelection({
        nodes: [{ id: "capability:a" }, { id: "element:b" }],
        edges: [],
      }),
    ).toEqual({ propagate: true, selectedId: "capability:a" });
  });

  it("빈 노드 + 엣지-only 보고(박스 선택 B-3)는 전파하지 않는다", () => {
    expect(
      resolveBuilderCanvasSelection({ nodes: [], edges: [{}, {}] }),
    ).toEqual({ propagate: false });
  });

  it("완전히 빈 보고(그래프 재빌드 잡음)도 전파하지 않는다 — 부모 선택 보존", () => {
    // 이 케이스가 회귀의 핵심: 예전엔 next=null 을 전파해 방금 클릭한
    // 드래프트 선택을 지웠다. 이제는 무시하고 부모 selectedId 를 보존한다.
    expect(resolveBuilderCanvasSelection({ nodes: [], edges: [] })).toEqual({
      propagate: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { resolveCanvasSelectedSlug } from "./resolve-canvas-selection";

const ready = {
  sourceReady: true,
  projectsLoaded: true,
  ontologyLoaded: true,
};

describe("resolveCanvasSelectedSlug", () => {
  it("해석된 노드는 그대로 포커스한다", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        selectedSlug: "capability:checkout",
        resolvedSlug: "capability:checkout",
      }),
    ).toBe("capability:checkout");
  });

  /**
   * 이 한 줄이 「유령 노드」의 수리다. 예전엔 원본 슬러그가 그대로 캔버스로
   * 내려가 ego 포커스가 켜졌고, 이웃이 0이라 **지도의 모든 노드가 dim** 됐다.
   */
  it("이 볼트에 없는 슬러그는 포커스하지 않는다 — 지도가 통째로 흐려지던 자리", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        selectedSlug: "capability:from-another-vault",
        resolvedSlug: null,
      }),
    ).toBeNull();
  });

  it("볼트가 아직 정착 안 했으면 원본을 들고 있는다 — 딥링크가 깜빡이지 않게", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        sourceReady: false,
        selectedSlug: "capability:checkout",
        resolvedSlug: null,
      }),
    ).toBe("capability:checkout");
  });

  it("온톨로지가 아직 안 도착했으면 원본을 들고 있는다", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        ontologyLoaded: false,
        selectedSlug: "capability:checkout",
        resolvedSlug: null,
      }),
    ).toBe("capability:checkout");
  });

  // bare 슬러그는 프로젝트 슬러그일 수 있다 — 목록이 도착하기 전엔 "없다" 를
  // 확정할 수 없다. kind 접두사가 있으면 프로젝트와 절대 충돌하지 않으므로
  // 기다릴 이유가 없다(미해석 토스트와 같은 문법).
  it("bare 슬러그는 프로젝트 목록을 기다린다", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        projectsLoaded: false,
        selectedSlug: "checkout",
        resolvedSlug: null,
      }),
    ).toBe("checkout");
  });

  it("kind 접두사가 있으면 프로젝트 목록을 기다리지 않는다", () => {
    expect(
      resolveCanvasSelectedSlug({
        ...ready,
        projectsLoaded: false,
        selectedSlug: "element:gone",
        resolvedSlug: null,
      }),
    ).toBeNull();
  });

  it("주소에 아무것도 없으면 null", () => {
    expect(
      resolveCanvasSelectedSlug({ ...ready, selectedSlug: null, resolvedSlug: null }),
    ).toBeNull();
  });
});

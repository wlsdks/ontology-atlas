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
   * The ghost-node fix. The raw slug used to reach the canvas and switch on ego
   * focus; with zero neighbours, every node on the map dimmed.
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

  // A bare slug may be a project slug, so absence cannot be certain until the
  // project list arrives. A kind prefix can never collide with a project, so
  // there is nothing to wait for (same grammar as the miss notice).
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

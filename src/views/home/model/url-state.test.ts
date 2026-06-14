import { describe, expect, it } from "vitest";
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
  selectTopologyNodeRouteState,
} from "./url-state";

describe("parseHomeRouteState", () => {
  it("reads supported home query params", () => {
    const params = new URLSearchParams(
      "p=iam&c=in-progress&hub=iam&impact=downstream&pulse=30d&mode=path&pathFrom=domain:views&pathTo=capability:topology-analysis-modes",
    );

    expect(parseHomeRouteState(params)).toEqual({
      selectedSlug: "iam",
      activeCategory: "in-progress",
      focusedHubSlug: "iam",
      impactMode: "downstream",
      pulseMode: "30d",
      analysisMode: "path",
      pathSourceSlug: "domain:views",
      pathTargetSlug: "capability:topology-analysis-modes",
    });
  });

  it("falls back when unknown values are provided", () => {
    const params = new URLSearchParams("impact=weird&pulse=bad");

    expect(parseHomeRouteState(params)).toEqual(DEFAULT_HOME_ROUTE_STATE);
  });

  it("treats a selected-node link without an explicit mode as overview, so the click renders a 1-hop ego focus (not the 2-hop focus neighborhood)", () => {
    // selectedSlug → "focus" 자동 승격은 depthLimit 2(2-hop)를 걸어 1-hop
    // applyFocusOverlay 를 우회시킨다. selectedSlug 만으로는 overview 를 유지하고,
    // "초점" 2-hop 은 명시적 mode=focus 일 때만.
    const params = new URLSearchParams("p=capabilities/topology-analysis-modes");

    expect(parseHomeRouteState(params)).toMatchObject({
      selectedSlug: "capabilities/topology-analysis-modes",
      analysisMode: "overview",
    });
  });

  it("still honors an explicit mode=focus for the 2-hop neighborhood", () => {
    const params = new URLSearchParams(
      "p=capabilities/topology-analysis-modes&mode=focus",
    );

    expect(parseHomeRouteState(params)).toMatchObject({
      selectedSlug: "capabilities/topology-analysis-modes",
      analysisMode: "focus",
    });
  });
});

describe("applyHomeRouteState", () => {
  it("serializes non-default values", () => {
    const params = applyHomeRouteState(new URLSearchParams(), {
      selectedSlug: "pick",
      activeCategory: "planned",
      focusedHubSlug: "reactor",
      impactMode: "network",
      pulseMode: "7d",
      analysisMode: "health",
      pathSourceSlug: null,
      pathTargetSlug: null,
    });

    expect(params.toString()).toBe(
      "p=pick&c=planned&hub=reactor&impact=network&pulse=7d&mode=health",
    );
  });

  it("serializes path endpoints only while Path mode is active", () => {
    const params = applyHomeRouteState(new URLSearchParams(), {
      selectedSlug: null,
      activeCategory: null,
      focusedHubSlug: null,
      impactMode: "none",
      pulseMode: "all",
      analysisMode: "path",
      pathSourceSlug: "domain:views",
      pathTargetSlug: "capability:topology-analysis-modes",
    });

    expect(params.toString()).toBe(
      "mode=path&pathFrom=domain%3Aviews&pathTo=capability%3Atopology-analysis-modes",
    );

    const hidden = applyHomeRouteState(params, {
      selectedSlug: null,
      activeCategory: null,
      focusedHubSlug: null,
      impactMode: "none",
      pulseMode: "all",
      analysisMode: "overview",
      pathSourceSlug: "domain:views",
      pathTargetSlug: "capability:topology-analysis-modes",
    });

    expect(hidden.toString()).toBe("");
  });

  it("drops params when values match defaults", () => {
    const params = applyHomeRouteState(
      new URLSearchParams("p=pick&impact=network&pulse=7d"),
      DEFAULT_HOME_ROUTE_STATE,
    );

    expect(params.toString()).toBe("");
  });
});

describe("selectTopologyNodeRouteState", () => {
  it("promotes overview node selection into Focus mode so click discovery owns the panel", () => {
    // 클릭 discovery 가 drag preview 보다 약하면 사용자가 관계를 보려고 카드를
    // 끌게 된다. 일반 overview 선택은 Focus 패널로 승격해 overview metric
    // surface 를 접고 selected node / linked relation 맥락을 primary 로 만든다.
    expect(
      selectTopologyNodeRouteState(DEFAULT_HOME_ROUTE_STATE, "capabilities/mcp-server"),
    ).toMatchObject({
      selectedSlug: "capabilities/mcp-server",
      analysisMode: "focus",
      impactMode: "none",
    });
  });

  it("preserves active Path and Health workflows while updating the selected node", () => {
    const pathState = selectTopologyNodeRouteState(
      {
        ...DEFAULT_HOME_ROUTE_STATE,
        analysisMode: "path",
        pathSourceSlug: "domains/views",
        pathTargetSlug: "capabilities/topology-analysis-modes",
      },
      "domains/views",
    );

    expect(pathState).toMatchObject({
      selectedSlug: "domains/views",
      analysisMode: "path",
      pathSourceSlug: "domains/views",
      pathTargetSlug: "capabilities/topology-analysis-modes",
    });

    expect(
      selectTopologyNodeRouteState(
        { ...DEFAULT_HOME_ROUTE_STATE, analysisMode: "health" },
        "capabilities/orphan",
      ),
    ).toMatchObject({
      selectedSlug: "capabilities/orphan",
      analysisMode: "health",
    });
  });
});

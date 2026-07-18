import { describe, expect, it } from "vitest";
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
  selectTopologyNodeRouteState,
  selectTopologyPathRouteState,
} from "./url-state";

describe("parseHomeRouteState", () => {
  it("reads supported home query params", () => {
    const params = new URLSearchParams(
      "p=iam&c=in-progress&hub=iam&impact=downstream&pulse=30d&mode=path&pathFrom=domain:views&pathTo=capability:topology-analysis-modes&create=concept",
    );

    expect(parseHomeRouteState(params)).toEqual({
      selectedSlug: null,
      activeCategory: "in-progress",
      focusedHubSlug: null,
      impactMode: "none",
      pulseMode: "30d",
      analysisMode: "path",
      pathSourceSlug: "domain:views",
      pathTargetSlug: "capability:topology-analysis-modes",
      createNodeIntent: true,
      indexState: null,
    });
  });

  it("ignores stale selected node drawer state when a Path result is complete", () => {
    const params = new URLSearchParams(
      "mode=path&p=ontology-atlas&pathFrom=ontology-atlas&pathTo=domain%3Aai-agent-partner",
    );

    expect(parseHomeRouteState(params)).toMatchObject({
      selectedSlug: null,
      analysisMode: "path",
      pathSourceSlug: "ontology-atlas",
      pathTargetSlug: "domain:ai-agent-partner",
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

  it("honors mode=graph as the living-graph exploration mode", () => {
    const params = new URLSearchParams("mode=graph");

    expect(parseHomeRouteState(params)).toMatchObject({
      analysisMode: "graph",
      selectedSlug: null,
    });
  });

  it("keeps overview on node click — selection must not expand the map (explicit focus entry only)", () => {
    // R+ 소유자 피드백: "클릭하면 그냥 [확장+재배치]돼서 헷갈린다".
    // 클릭 = 선택(안전한 탐색), 확장(초점)은 배지/더블클릭/딥링크의 명시적 의도.
    const state = parseHomeRouteState(new URLSearchParams(""));
    expect(selectTopologyNodeRouteState(state, "domain:views")).toMatchObject({
      selectedSlug: "domain:views",
      analysisMode: "overview",
    });
  });

  it("keeps graph mode on node selection instead of promoting to focus", () => {
    const params = new URLSearchParams("mode=graph");
    const state = parseHomeRouteState(params);

    expect(
      selectTopologyNodeRouteState(state, "domain:views"),
    ).toMatchObject({
      selectedSlug: "domain:views",
      analysisMode: "graph",
    });
  });

  it("treats a selected Path route as a fixed source when pathFrom is absent", () => {
    const params = new URLSearchParams("mode=path&p=domain:views");

    expect(parseHomeRouteState(params)).toMatchObject({
      selectedSlug: "domain:views",
      analysisMode: "path",
      pathSourceSlug: "domain:views",
      pathTargetSlug: null,
    });
  });

  it("keeps explicit pathFrom ahead of the selected Path route param", () => {
    const params = new URLSearchParams(
      "mode=path&p=domain:views&pathFrom=domain:agent",
    );

    expect(parseHomeRouteState(params)).toMatchObject({
      selectedSlug: "domain:views",
      analysisMode: "path",
      pathSourceSlug: "domain:agent",
    });
  });

  it("accepts short from/to aliases for shared Path deep links", () => {
    const params = new URLSearchParams(
      "mode=path&from=domain:views&to=capability:topology-analysis-modes",
    );

    expect(parseHomeRouteState(params)).toMatchObject({
      analysisMode: "path",
      pathSourceSlug: "domain:views",
      pathTargetSlug: "capability:topology-analysis-modes",
    });
  });

  it("reads ?index= as the INDEX panel deep-link intent (B3)", () => {
    expect(parseHomeRouteState(new URLSearchParams("index=collapsed"))).toMatchObject({
      indexState: "collapsed",
    });
    expect(parseHomeRouteState(new URLSearchParams("index=expanded"))).toMatchObject({
      indexState: "expanded",
    });
    expect(parseHomeRouteState(new URLSearchParams(""))).toMatchObject({
      indexState: null,
    });
    expect(parseHomeRouteState(new URLSearchParams("index=bogus"))).toMatchObject({
      indexState: null,
    });
  });

  it("keeps canonical pathFrom/pathTo ahead of short Path aliases", () => {
    const params = new URLSearchParams(
      "mode=path&pathFrom=domain:canonical&from=domain:alias&pathTo=capability:canonical&to=capability:alias",
    );

    expect(parseHomeRouteState(params)).toMatchObject({
      analysisMode: "path",
      pathSourceSlug: "domain:canonical",
      pathTargetSlug: "capability:canonical",
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
      createNodeIntent: true,
      indexState: null,
    });

    expect(params.toString()).toBe(
      "p=pick&c=planned&hub=reactor&impact=network&pulse=7d&mode=health&create=concept",
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
      createNodeIntent: false,
      indexState: null,
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
      createNodeIntent: false,
      indexState: null,
    });

    expect(hidden.toString()).toBe("");
  });

  it("canonicalizes short Path aliases away when serializing route state", () => {
    const params = applyHomeRouteState(
      new URLSearchParams("mode=path&from=domain:old&to=capability:old"),
      {
        selectedSlug: null,
        activeCategory: null,
        focusedHubSlug: null,
        impactMode: "none",
        pulseMode: "all",
        analysisMode: "path",
        pathSourceSlug: "domain:views",
        pathTargetSlug: "capability:topology-analysis-modes",
        createNodeIntent: false,
        indexState: null,
      },
    );

    expect(params.toString()).toBe(
      "mode=path&pathFrom=domain%3Aviews&pathTo=capability%3Atopology-analysis-modes",
    );
  });

  it("serializes indexState when set, omits it when null", () => {
    const withIndex = applyHomeRouteState(new URLSearchParams(), {
      ...DEFAULT_HOME_ROUTE_STATE,
      indexState: "collapsed",
    });
    expect(withIndex.toString()).toBe("index=collapsed");

    const withoutIndex = applyHomeRouteState(new URLSearchParams("index=collapsed"), {
      ...DEFAULT_HOME_ROUTE_STATE,
      indexState: null,
    });
    expect(withoutIndex.toString()).toBe("");
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
  it("keeps the analysis mode unchanged on node selection across all modes", () => {
    // 구계약(overview 클릭 → focus 승격)은 클릭 한 번에 지형 재배치까지
    // 겹쳐 폐기됐다 — 클릭은 어느 모드에서든 선택만 바꾼다.
    for (const mode of ["overview", "focus", "health"] as const) {
      const state = { ...DEFAULT_HOME_ROUTE_STATE, analysisMode: mode };
      expect(selectTopologyNodeRouteState(state, "domain:views")).toMatchObject({
        selectedSlug: "domain:views",
        analysisMode: mode,
      });
    }
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

describe("selectTopologyPathRouteState", () => {
  it("keeps the source drawer context while the path target is still missing", () => {
    expect(
      selectTopologyPathRouteState(DEFAULT_HOME_ROUTE_STATE, {
        sourceSlug: "project:ontology-atlas",
        targetSlug: null,
      }),
    ).toMatchObject({
      analysisMode: "path",
      selectedSlug: "project:ontology-atlas",
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: null,
    });
  });

  it("clears stale node drawer state once Path result evidence owns the screen", () => {
    const next = selectTopologyPathRouteState(
      {
        ...DEFAULT_HOME_ROUTE_STATE,
        selectedSlug: "project:ontology-atlas",
        focusedHubSlug: "project:ontology-atlas",
        impactMode: "network",
      },
      {
        sourceSlug: "project:ontology-atlas",
        targetSlug: "domain:ai-agent-partner",
      },
    );

    expect(next).toMatchObject({
      analysisMode: "path",
      selectedSlug: null,
      focusedHubSlug: null,
      impactMode: "none",
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: "domain:ai-agent-partner",
    });

    expect(
      applyHomeRouteState(
        new URLSearchParams("p=project%3Aontology-atlas"),
        next,
      ).toString(),
    ).toBe(
      "mode=path&pathFrom=project%3Aontology-atlas&pathTo=domain%3Aai-agent-partner",
    );
  });
});

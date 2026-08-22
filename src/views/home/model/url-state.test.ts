import { describe, expect, it } from "vitest";
import {
  applyHomeRouteState,
  buildContainmentParentMap,
  DEFAULT_HOME_ROUTE_STATE,
  deriveDeeplinkAncestorExpansion,
  enterRealmRouteState,
  exitRealmRouteState,
  parseHomeRouteState,
  resolveRealmNodeId,
  resolveTopologyNodeClickRouteState,
  selectTopologyNodeRouteState,
  selectTopologyPathRouteState,
  toggleExpandedParent,
  parseExpandedParentsParam,
  MAX_EXPANDED_PARENTS,
  clearVaultScopedRouteState,
  VAULT_SCOPED_HOME_QUERY_KEYS,
  HOME_QUERY_KEYS,
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
      meaningEditorIntent: false,
      meaningEditParam: null,
      indexState: null,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
    });
  });

  it("round-trips the contextual editor and legacy create workbench intents", () => {
    const edit = parseHomeRouteState(
      new URLSearchParams(
        "p=capability%3Acontextual-editing&workbench=edit&edit=dependsOn%3Acapability%3Amcp-server",
      ),
    );
    expect(edit).toMatchObject({
      selectedSlug: "capability:contextual-editing",
      meaningEditorIntent: true,
      meaningEditParam: "dependsOn:capability:mcp-server",
      createNodeIntent: false,
    });
    expect(applyHomeRouteState(new URLSearchParams(), edit).toString()).toContain(
      "workbench=edit",
    );

    expect(parseHomeRouteState(new URLSearchParams("workbench=create"))).toMatchObject({
      createNodeIntent: true,
      meaningEditorIntent: false,
      meaningEditParam: null,
    });
  });

  // Recent-change spotlight (council design 2026-07-23). `?recent=` is the
  // single source driving both the map's sinking and the INDEX lens, so the
  // parsing contract is pinned here.
  it("reads ?recent= as the spotlight window — auto or 1/7/30 presets", () => {
    expect(parseHomeRouteState(new URLSearchParams("recent=auto"))).toMatchObject({
      recentWindow: "auto",
    });
    expect(parseHomeRouteState(new URLSearchParams("recent=7"))).toMatchObject({
      recentWindow: 7,
    });
    expect(parseHomeRouteState(new URLSearchParams("recent=1"))).toMatchObject({
      recentWindow: 1,
    });
    expect(parseHomeRouteState(new URLSearchParams("recent=30"))).toMatchObject({
      recentWindow: 30,
    });
  });

  it("silently demotes invalid ?recent= values to off (no lens-state pollution)", () => {
    expect(parseHomeRouteState(new URLSearchParams("recent=90"))).toMatchObject({
      recentWindow: null,
    });
    expect(parseHomeRouteState(new URLSearchParams("recent=yesterday"))).toMatchObject({
      recentWindow: null,
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
    // Auto-promoting selectedSlug to "focus" would set depthLimit 2 (2-hop)
    // and bypass the 1-hop applyFocusOverlay. selectedSlug alone stays
    // overview; the 2-hop focus needs an explicit mode=focus.
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

  it("falls back to overview for the removed live-graph mode (#19)", () => {
    // With the live-graph (physics) toggle removed, mode=graph is no longer a
    // valid mode — old shared links are demoted quietly to overview.
    const params = new URLSearchParams("mode=graph");

    expect(parseHomeRouteState(params)).toMatchObject({
      analysisMode: "overview",
      selectedSlug: null,
    });
  });

  it("keeps overview on node click — selection must not expand the map (explicit focus entry only)", () => {
    // Owner: "클릭하면 그냥 [확장+재배치]돼서 헷갈린다" (a click just
    // expands and relayouts, which is confusing). Click = selection (safe
    // navigation); expansion (focus) needs the explicit intent of a badge,
    // double click, or deep link.
    const state = parseHomeRouteState(new URLSearchParams(""));
    expect(selectTopologyNodeRouteState(state, "domain:views")).toMatchObject({
      selectedSlug: "domain:views",
      analysisMode: "overview",
    });
  });

  it("keeps the current mode on node selection instead of promoting to focus", () => {
    const params = new URLSearchParams("mode=health");
    const state = parseHomeRouteState(params);

    expect(
      selectTopologyNodeRouteState(state, "domain:views"),
    ).toMatchObject({
      selectedSlug: "domain:views",
      analysisMode: "health",
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
      meaningEditorIntent: false,
      meaningEditParam: null,
      indexState: null,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
    });

    expect(params.toString()).toBe(
      "p=pick&c=planned&hub=reactor&impact=network&pulse=7d&mode=health&workbench=create",
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
      meaningEditorIntent: false,
      meaningEditParam: null,
      indexState: null,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
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
      meaningEditorIntent: false,
      meaningEditParam: null,
      indexState: null,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
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
        meaningEditorIntent: false,
        meaningEditParam: null,
        indexState: null,
        insightsReturnTab: null,
        insightsReturnReviewId: null,
        askIntent: null,
        expandedParents: [],
        realmSlug: null,
        recentWindow: null,
      },
    );

    expect(params.toString()).toBe(
      "mode=path&pathFrom=domain%3Aviews&pathTo=capability%3Atopology-analysis-modes",
    );
  });

  // Spotlight round-trip stability — the shared-link / agent-readable contract.
  it("serializes ?recent= for auto and numeric windows, omits it when off", () => {
    const auto = applyHomeRouteState(new URLSearchParams(), {
      ...DEFAULT_HOME_ROUTE_STATE,
      recentWindow: "auto",
    });
    expect(auto.toString()).toBe("recent=auto");

    const seven = applyHomeRouteState(new URLSearchParams(), {
      ...DEFAULT_HOME_ROUTE_STATE,
      recentWindow: 7,
    });
    expect(seven.toString()).toBe("recent=7");

    const off = applyHomeRouteState(new URLSearchParams("recent=auto"), {
      ...DEFAULT_HOME_ROUTE_STATE,
      recentWindow: null,
    });
    expect(off.toString()).toBe("");
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
    // The old contract (overview click → focus promotion) stacked a terrain
    // relayout onto a single click and was dropped — a click changes only the
    // selection, in every mode.
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

describe("resolveTopologyNodeClickRouteState", () => {
  // Persona QA regression: a second node click drew A→B on the canvas, yet the
  // chip stayed pinned to "pick a target" and the path packet copy button never
  // appeared. Cause: `HomePage.tsx`'s click handler ignored analysisMode and
  // always took the ordinary-selection route.
  it("일반 모드에서는 selectTopologyNodeRouteState 와 동일하게 동작한다", () => {
    for (const mode of ["overview", "focus", "health"] as const) {
      const state = { ...DEFAULT_HOME_ROUTE_STATE, analysisMode: mode };
      expect(resolveTopologyNodeClickRouteState(state, "domain:views")).toEqual(
        selectTopologyNodeRouteState(state, "domain:views"),
      );
    }
  });

  it("path 모드 + 소스 미확정 상태에서 첫 클릭은 소스를 확정한다", () => {
    const state = { ...DEFAULT_HOME_ROUTE_STATE, analysisMode: "path" as const };
    expect(
      resolveTopologyNodeClickRouteState(state, "project:ontology-atlas"),
    ).toMatchObject({
      analysisMode: "path",
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: null,
    });
  });

  it("path 모드 + 소스 확정 상태에서 두 번째 클릭은 대상을 확정한다 (회귀 fix)", () => {
    const state = {
      ...DEFAULT_HOME_ROUTE_STATE,
      analysisMode: "path" as const,
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: null,
    };
    expect(
      resolveTopologyNodeClickRouteState(state, "domain:ai-agent-partner"),
    ).toMatchObject({
      analysisMode: "path",
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: "domain:ai-agent-partner",
    });
  });

  it("path 모드에서 이미 확정된 대상과 다른 세 번째 노드를 클릭하면 대상을 갈아끼운다", () => {
    const state = {
      ...DEFAULT_HOME_ROUTE_STATE,
      analysisMode: "path" as const,
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: "domain:ai-agent-partner",
    };
    expect(
      resolveTopologyNodeClickRouteState(state, "domain:ontology-core"),
    ).toMatchObject({
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: "domain:ontology-core",
    });
  });

  it("path 모드에서 소스 노드 자체를 다시 클릭해도 상태를 그대로 둔다", () => {
    const state = {
      ...DEFAULT_HOME_ROUTE_STATE,
      analysisMode: "path" as const,
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: null,
    };
    expect(
      resolveTopologyNodeClickRouteState(state, "project:ontology-atlas"),
    ).toBe(state);
  });
});

describe("insights return marker (?via=insights:<tab>)", () => {
  it("parses a valid insights origin marker into the return tab", () => {
    const params = new URLSearchParams(
      "p=domain%3Aviews&via=insights%3Ado-next&review=neglected-hub%3Adomain%3Aviews",
    );

    expect(parseHomeRouteState(params)).toMatchObject({
      selectedSlug: "domain:views",
      insightsReturnTab: "do-next",
      insightsReturnReviewId: "neglected-hub:domain:views",
    });
  });

  it("ignores via values that are not the insights marker grammar", () => {
    expect(
      parseHomeRouteState(new URLSearchParams("via=somewhere-else")),
    ).toMatchObject({
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
    });
    // The prefix without a tab names no return destination — no chip.
    expect(
      parseHomeRouteState(
        new URLSearchParams("via=insights&review=promotion:element:x"),
      ),
    ).toMatchObject({
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
    });
  });

  it("survives map interactions and is deleted only by explicit dismiss", () => {
    const params = new URLSearchParams(
      "via=insights:do-next&review=promotion:element:x",
    );
    const state = parseHomeRouteState(params);

    // The marker survives a node click — the chip does not vanish mid-navigation.
    const afterClick = resolveTopologyNodeClickRouteState(state, "domain:views");
    expect(afterClick.insightsReturnTab).toBe("do-next");
    expect(applyHomeRouteState(params, afterClick).get("via")).toBe(
      "insights:do-next",
    );
    expect(applyHomeRouteState(params, afterClick).get("review")).toBe(
      "promotion:element:x",
    );

    // Only an explicit dismiss (the chip's X) clears the marker.
    const dismissed = applyHomeRouteState(params, {
      ...afterClick,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
    });
    expect(dismissed.get("via")).toBeNull();
    expect(dismissed.get("review")).toBeNull();
  });
});

describe("밀도 게이트 확장 상태 (?open=)", () => {
  it("파싱: 콤마 구분 부모 목록을 순서대로 읽는다", () => {
    const state = parseHomeRouteState(
      new URLSearchParams("open=domain:onboarding,capability:huge"),
    );
    expect(state.expandedParents).toEqual([
      "domain:onboarding",
      "capability:huge",
    ]);
  });

  it("무효 무시: 빈 항목·중복·공백은 걸러지고, 다른 파라미터 탐색은 유지된다", () => {
    const state = parseHomeRouteState(
      new URLSearchParams("p=pick&open=,a,,a, b ,&mode=health"),
    );
    // Empty entries and duplicates dropped, values trimmed: b survives trimming.
    expect(state.expandedParents).toEqual(["a", "b"]);
    // Parsing open does not pollute the rest of the route state.
    expect(state.selectedSlug).toBe("pick");
    expect(state.analysisMode).toBe("health");
    // Absent open means an empty array (round-trip safe).
    expect(parseHomeRouteState(new URLSearchParams("p=pick")).expandedParents).toEqual([]);
  });

  it("왕복: 지도 탐색(노드 선택/토글) 후에도 open 이 URL 에 보존된다", () => {
    const params = new URLSearchParams("open=domain:onboarding");
    const state = parseHomeRouteState(params);

    // Expansion survives a node click — navigating does not reset the folding.
    const afterClick = resolveTopologyNodeClickRouteState(state, "domain:views");
    expect(afterClick.expandedParents).toEqual(["domain:onboarding"]);
    expect(applyHomeRouteState(params, afterClick).get("open")).toBe(
      "domain:onboarding",
    );

    // Add a parent through the toggle helper, then round-trip the URL.
    const toggled = {
      ...afterClick,
      expandedParents: toggleExpandedParent(afterClick.expandedParents, "capability:huge"),
    };
    expect(applyHomeRouteState(params, toggled).get("open")).toBe(
      "domain:onboarding,capability:huge",
    );

    // Re-toggling removes it; losing the last one deletes the open parameter.
    const collapsed = {
      ...state,
      expandedParents: toggleExpandedParent(state.expandedParents, "domain:onboarding"),
    };
    expect(applyHomeRouteState(params, collapsed).get("open")).toBeNull();
  });
});

describe("영역 전개 (?realm=)", () => {
  it("round-trips the realm slug through parse ← → apply", () => {
    const state = parseHomeRouteState(new URLSearchParams("realm=capability%3Atopology"));
    expect(state.realmSlug).toBe("capability:topology");
    const params = applyHomeRouteState(new URLSearchParams(), state);
    expect(params.get("realm")).toBe("capability:topology");
    expect(parseHomeRouteState(params).realmSlug).toBe("capability:topology");
  });

  it("defaults to null with no realm param", () => {
    expect(parseHomeRouteState(new URLSearchParams("p=pick")).realmSlug).toBeNull();
    expect(applyHomeRouteState(new URLSearchParams(), DEFAULT_HOME_ROUTE_STATE).get("realm")).toBeNull();
  });

  it("enterRealmRouteState sets realm and clears selection + expanded parents (spec: open/p cleared)", () => {
    const current = {
      ...DEFAULT_HOME_ROUTE_STATE,
      selectedSlug: "domain:x",
      focusedHubSlug: "domain:x",
      expandedParents: ["domain:x", "capability:y"],
    };
    const entered = enterRealmRouteState(current, "capability:y");
    expect(entered.realmSlug).toBe("capability:y");
    expect(entered.selectedSlug).toBeNull();
    expect(entered.focusedHubSlug).toBeNull();
    expect(entered.expandedParents).toEqual([]);
    const params = applyHomeRouteState(new URLSearchParams(), entered);
    expect(params.get("realm")).toBe("capability:y");
    expect(params.get("p")).toBeNull();
    expect(params.get("open")).toBeNull();
  });

  it("exitRealmRouteState clears realm and selection", () => {
    const inRealm = { ...DEFAULT_HOME_ROUTE_STATE, realmSlug: "capability:y", selectedSlug: "element:z" };
    const exited = exitRealmRouteState(inRealm);
    expect(exited.realmSlug).toBeNull();
    expect(exited.selectedSlug).toBeNull();
    expect(applyHomeRouteState(new URLSearchParams("realm=capability:y"), exited).get("realm")).toBeNull();
  });
});

describe("resolveRealmNodeId (패널3-S7 slug alias)", () => {
  const nodeIds = ["project:atlas", "domain:views", "capability:ai-agent-partner", "element:parser"];

  it("정확히 일치하는 canonical id 는 그대로 통과한다", () => {
    expect(resolveRealmNodeId("capability:ai-agent-partner", nodeIds)).toBe(
      "capability:ai-agent-partner",
    );
  });

  it("kind prefix 없는 bare slug 를 <kind>:<slug> canonical id 로 승격한다", () => {
    // A hand-typed `?realm=ai-agent-partner` used to render a raw chip over the whole map.
    expect(resolveRealmNodeId("ai-agent-partner", nodeIds)).toBe(
      "capability:ai-agent-partner",
    );
    expect(resolveRealmNodeId("views", nodeIds)).toBe("domain:views");
  });

  it("어떤 노드와도 안 맞으면 null — 칩 미표시 계약", () => {
    expect(resolveRealmNodeId("does-not-exist", nodeIds)).toBeNull();
    // A wrong kind prefix stays unresolved too — only an exact match counts.
    expect(resolveRealmNodeId("domain:ai-agent-partner", nodeIds)).toBeNull();
  });

  it("빈 값/공백 realm 은 null", () => {
    expect(resolveRealmNodeId(null, nodeIds)).toBeNull();
    expect(resolveRealmNodeId("", nodeIds)).toBeNull();
  });

  it("정확 일치가 bare 별칭보다 우선한다", () => {
    // With two nodes sharing a tail slug, an exact id match still wins.
    const ids = ["capability:parser", "element:parser"];
    expect(resolveRealmNodeId("element:parser", ids)).toBe("element:parser");
    // Bare `parser` takes the first match in iteration order (capability:parser).
    expect(resolveRealmNodeId("parser", ids)).toBe("capability:parser");
  });
});

describe("buildContainmentParentMap", () => {
  it("maps each child to its contains parent, ignoring depends edges", () => {
    const parentOf = buildContainmentParentMap([
      { source: "project:a", target: "domain:d", kind: "contains" },
      { source: "domain:d", target: "capability:c", kind: "contains" },
      { source: "capability:c", target: "capability:other", kind: "depends" },
    ]);
    expect(parentOf.get("domain:d")).toBe("project:a");
    expect(parentOf.get("capability:c")).toBe("domain:d");
    // depends edge must not create a parent link.
    expect(parentOf.has("capability:other")).toBe(false);
  });

  it("keeps the first contains parent when a child has several (deterministic)", () => {
    const parentOf = buildContainmentParentMap([
      { source: "capability:one", target: "element:shared", kind: "contains" },
      { source: "capability:two", target: "element:shared", kind: "contains" },
    ]);
    expect(parentOf.get("element:shared")).toBe("capability:one");
  });
});

describe("deriveDeeplinkAncestorExpansion", () => {
  // project:a ▸ domain:d ▸ capability:c ▸ element:e (a 3-deep contains chain)
  const parentOf = buildContainmentParentMap([
    { source: "project:a", target: "domain:d", kind: "contains" },
    { source: "domain:d", target: "capability:c", kind: "contains" },
    { source: "capability:c", target: "element:e", kind: "contains" },
  ]);

  it("expands every ancestor of a deep-linked node, nearest-first", () => {
    expect(deriveDeeplinkAncestorExpansion("element:e", parentOf, [])).toEqual([
      "capability:c",
      "domain:d",
      "project:a",
    ]);
  });

  it("returns a fresh copy of the current list for a null target", () => {
    const current = ["domain:d"];
    const result = deriveDeeplinkAncestorExpansion(null, parentOf, current);
    expect(result).toEqual(["domain:d"]);
    expect(result).not.toBe(current);
  });

  it("adds nothing for a top-level node with no parent", () => {
    expect(deriveDeeplinkAncestorExpansion("project:a", parentOf, [])).toEqual([]);
  });

  it("does not duplicate an ancestor already expanded, and appends new ones", () => {
    expect(deriveDeeplinkAncestorExpansion("element:e", parentOf, ["domain:d"])).toEqual([
      "domain:d",
      "capability:c",
      "project:a",
    ]);
  });

  it("terminates on a containment cycle instead of looping forever", () => {
    const cyclic = new Map<string, string>([
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
    ]);
    const result = deriveDeeplinkAncestorExpansion("a", cyclic, []);
    // b and c are real ancestors; the walk stops before re-adding a (the target).
    expect(result).toEqual(["b", "c"]);
  });
});

/**
 * **Expansion has an overall cap.**
 *
 * The child count of **one** parent was already limited (a batch of 24 plus
 * `+N more`), but the number of *expanded parents* was not, so nodes on screen
 * multiplied with everything piled into `?open=`. Owner measurement
 * (2026-07-31): expanding 5 parents left ~150 nodes carrying **2 labels**.
 *
 * Three things are measured here: (1) past the cap the oldest closes,
 * (2) collapsing always works, (3) a deep link gets the same cap — bypassing
 * it by link would give the recipient a worse screen.
 */
describe("펼침 부모 상한", () => {
  it("상한 안에서는 그냥 쌓인다", () => {
    let open: string[] = [];
    open = toggleExpandedParent(open, "a");
    open = toggleExpandedParent(open, "b");
    expect(open).toEqual(["a", "b"]);
  });

  it("**상한을 넘으면 가장 오래 펼쳐 둔 것이 닫힌다** — 클릭이 무시되지 않는다", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id);
    expect(open).toHaveLength(MAX_EXPANDED_PARENTS);
    expect(open).toEqual(["b", "c", "d"]);
    // What was pressed **must** be open — that is what "not ignored" means.
    expect(open).toContain("d");
    expect(open).not.toContain("a");
  });

  it("계속 눌러도 상한을 넘지 않는다", () => {
    let open: string[] = [];
    for (let i = 0; i < 20; i += 1) open = toggleExpandedParent(open, `p${i}`);
    expect(open).toHaveLength(MAX_EXPANDED_PARENTS);
    expect(open).toContain("p19");
  });

  it("접기는 상한과 무관하게 언제나 된다", () => {
    let open = ["a", "b", "c"];
    open = toggleExpandedParent(open, "b");
    expect(open).toEqual(["a", "c"]);
  });

  it("이미 열린 것을 다시 눌러도 다른 것이 닫히지 않는다", () => {
    // The toggle reads as "close", so there is no place for an eviction.
    const open = toggleExpandedParent(["a", "b", "c"], "a");
    expect(open).toEqual(["b", "c"]);
  });

  it("딥링크도 같은 상한을 받는다 — 링크로 우회할 수 없다", () => {
    const parsed = parseExpandedParentsParam("a,b,c,d,e");
    expect(parsed).toHaveLength(MAX_EXPANDED_PARENTS);
    // The tail is kept — what was written later is the more recent intent
    // (same direction as the toggle's eviction).
    expect(parsed).toEqual(["c", "d", "e"]);
  });

  it("딥링크의 중복 제거가 상한보다 먼저 일어난다", () => {
    // "a,a,a,b" is really 2 entries — duplicates must not cut a valid one.
    expect(parseExpandedParentsParam("a,a,a,b")).toEqual(["a", "b"]);
  });
});

/**
 * **Vault-scoped address state must not survive a vault change** — the cause
 * fix for out-of-scope state (2026-08-01). What this pins down is not
 * cosmetics: an address pointing at a node that does not exist dimmed the
 * whole map and made the path chip assert a falsehood.
 */
describe("clearVaultScopedRouteState", () => {
  /**
   * ⚠️ A fixture carrying `mode=path` plus both endpoints has **`p` already
   * nulled by the parser** (a complete path clears the selection). Asserting
   * against that state stays green even with the whole clearing removed — it
   * did once (2026-08-01 revert probe). Hence the selection axis and the path
   * axis use **separate fixtures**.
   */
  const SELECTION_SEARCH =
    "p=capability:alpha&c=cat&hub=domain:h&open=domain:x,domain:y&realm=domain:r" +
    "&impact=upstream&pulse=7d&recent=7";
  const PATH_SEARCH = "mode=path&pathFrom=capability:a&pathTo=domain:b&from=capability:a&to=domain:b";

  it("볼트 이름을 담은 선택 상태를 걷어내고 열거값 키는 지킨다", () => {
    const current = parseHomeRouteState(new URLSearchParams(SELECTION_SEARCH));
    expect(current.selectedSlug).toBe("capability:alpha"); // the fixture itself must be valid first

    const next = clearVaultScopedRouteState(current);

    expect(next.selectedSlug).toBeNull();
    expect(next.activeCategory).toBeNull();
    expect(next.focusedHubSlug).toBeNull();
    expect(next.expandedParents).toEqual([]);
    expect(next.realmSlug).toBeNull();
    // Enumerated values mean the same in any vault, so they survive.
    expect(next.impactMode).toBe("upstream");
    expect(next.pulseMode).toBe("7d");
    expect(next.recentWindow).toBe(7);
  });

  it("경로 끝점을 걷어내고 개요로 되돌린다 — 끝점 없는 「경로」 모드는 빈 주장이다", () => {
    const current = parseHomeRouteState(new URLSearchParams(PATH_SEARCH));
    expect(current.pathSourceSlug).toBe("capability:a");
    expect(current.pathTargetSlug).toBe("domain:b");

    const next = clearVaultScopedRouteState(current);

    expect(next.pathSourceSlug).toBeNull();
    expect(next.pathTargetSlug).toBeNull();
    expect(next.analysisMode).toBe("overview");
  });

  it("주소에서도 실제로 사라진다 — 걷어낸 상태를 URL 로 되쓰면 그 키가 없다", () => {
    for (const search of [SELECTION_SEARCH, PATH_SEARCH]) {
      const cleared = clearVaultScopedRouteState(
        parseHomeRouteState(new URLSearchParams(search)),
      );
      const params = applyHomeRouteState(new URLSearchParams(search), cleared);

      for (const key of VAULT_SCOPED_HOME_QUERY_KEYS) {
        expect(params.has(key), `${key} 가 주소에 남았다 (${search})`).toBe(false);
      }
    }
  });

  it("열거값 키는 주소에도 남는다", () => {
    const cleared = clearVaultScopedRouteState(
      parseHomeRouteState(new URLSearchParams(SELECTION_SEARCH)),
    );
    const params = applyHomeRouteState(new URLSearchParams(SELECTION_SEARCH), cleared);
    expect(params.get("pulse")).toBe("7d");
    expect(params.get("impact")).toBe("upstream");
    expect(params.get("recent")).toBe("7");
  });

  it("건드리지 않은 모드는 유지된다 (path 가 아니면 그대로)", () => {
    const current = parseHomeRouteState(new URLSearchParams("mode=health&p=x"));
    expect(clearVaultScopedRouteState(current).analysisMode).toBe("health");
  });
});

/**
 * Keeps the registry's two axes aligned: every vault-scoped key must be a real
 * query key. Whether every key is registered at all is checked by
 * `tests/contract/scope-registry.contract.test.ts`.
 */
describe("VAULT_SCOPED_HOME_QUERY_KEYS", () => {
  it("모두 실제 쿼리 키다", () => {
    const known = new Set<string>(Object.values(HOME_QUERY_KEYS));
    for (const key of VAULT_SCOPED_HOME_QUERY_KEYS) {
      expect(known.has(key), `${key} 는 HOME_QUERY_KEYS 에 없다`).toBe(true);
    }
  });
});

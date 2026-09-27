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
      askBusinessFlow: false,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
      constellationIntent: null,
      mapView: null,
    });
  });

  it("round-trips a vault-scoped saved constellation intent", () => {
    const state = parseHomeRouteState(new URLSearchParams("constellation=11111111-1111-4111-8111-111111111111"));
    expect(state.constellationIntent).toBe("11111111-1111-4111-8111-111111111111");
    expect(applyHomeRouteState(new URLSearchParams(), state).get("constellation")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(parseHomeRouteState(new URLSearchParams("constellation=new")).constellationIntent).toBe("new");
  });

  it("round-trips every map view the picker offers, and drops any other value", () => {
    for (const view of ["territories", "galaxy", "strata", "coupling"] as const) {
      const state = parseHomeRouteState(new URLSearchParams(`view=${view}`));
      expect(state.mapView).toBe(view);
      expect(applyHomeRouteState(new URLSearchParams(), state).get("view")).toBe(view);
    }
    expect(parseHomeRouteState(new URLSearchParams("view=flat")).mapView).toBeNull();
    expect(parseHomeRouteState(new URLSearchParams("view=cone")).mapView).toBeNull();
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

  // `?recent=` drives both the map's sinking and the INDEX lens, so the parsing contract is pinned
  // here.
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
      constellationIntent: null,
      mapView: null,
    });
    expect(parseHomeRouteState(new URLSearchParams("recent=yesterday"))).toMatchObject({
      recentWindow: null,
      constellationIntent: null,
      mapView: null,
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
    // Promoting to focus would use the 2-hop depth and bypass the 1-hop overlay; focus needs
    // explicit mode=focus.
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
    // mode=graph is retired; old links demote to overview.
    const params = new URLSearchParams("mode=graph");

    expect(parseHomeRouteState(params)).toMatchObject({
      analysisMode: "overview",
      selectedSlug: null,
    });
  });

  it("keeps overview on node click — selection must not expand the map (explicit focus entry only)", () => {
    // A click only selects; focus needs a badge, double click or deep link.
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
      askBusinessFlow: false,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
      constellationIntent: null,
      mapView: null,
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
      askBusinessFlow: false,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
      constellationIntent: null,
      mapView: null,
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
      askBusinessFlow: false,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
      constellationIntent: null,
      mapView: null,
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
      askBusinessFlow: false,
        expandedParents: [],
        realmSlug: null,
        recentWindow: null,
      constellationIntent: null,
      mapView: null,
      },
    );

    expect(params.toString()).toBe(
      "mode=path&pathFrom=domain%3Aviews&pathTo=capability%3Atopology-analysis-modes",
    );
  });

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
      constellationIntent: null,
      mapView: null,
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
    // A click changes only the selection, in every mode.
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
  // A second click in path mode must fill the target, or the chip stays on "pick a target".
  it("behaves like selectTopologyNodeRouteState outside path mode", () => {
    for (const mode of ["overview", "focus", "health"] as const) {
      const state = { ...DEFAULT_HOME_ROUTE_STATE, analysisMode: mode };
      expect(resolveTopologyNodeClickRouteState(state, "domain:views")).toEqual(
        selectTopologyNodeRouteState(state, "domain:views"),
      );
    }
  });

  it("in path mode the first click without a source sets the source", () => {
    const state = { ...DEFAULT_HOME_ROUTE_STATE, analysisMode: "path" as const };
    expect(
      resolveTopologyNodeClickRouteState(state, "project:ontology-atlas"),
    ).toMatchObject({
      analysisMode: "path",
      pathSourceSlug: "project:ontology-atlas",
      pathTargetSlug: null,
    });
  });

  it("in path mode the second click with a source sets the target", () => {
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

  it("in path mode a third node replaces the chosen target", () => {
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

  it("in path mode reclicking the source node leaves the state unchanged", () => {
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
      askBusinessFlow: false,
    });
    // A prefix without a tab names no destination.
    expect(
      parseHomeRouteState(
        new URLSearchParams("via=insights&review=promotion:element:x"),
      ),
    ).toMatchObject({
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      askBusinessFlow: false,
    });
  });

  it("survives map interactions and is deleted only by explicit dismiss", () => {
    const params = new URLSearchParams(
      "via=insights:do-next&review=promotion:element:x",
    );
    const state = parseHomeRouteState(params);

    // The chip survives a node click.
    const afterClick = resolveTopologyNodeClickRouteState(state, "domain:views");
    expect(afterClick.insightsReturnTab).toBe("do-next");
    expect(applyHomeRouteState(params, afterClick).get("via")).toBe(
      "insights:do-next",
    );
    expect(applyHomeRouteState(params, afterClick).get("review")).toBe(
      "promotion:element:x",
    );

    // Only the chip's dismiss clears the marker.
    const dismissed = applyHomeRouteState(params, {
      ...afterClick,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      askBusinessFlow: false,
    });
    expect(dismissed.get("via")).toBeNull();
    expect(dismissed.get("review")).toBeNull();
  });
});

describe("density-gate expansion state (?open=)", () => {
  it("parses a comma-separated parent list in order", () => {
    const state = parseHomeRouteState(
      new URLSearchParams("open=domain:onboarding,capability:huge"),
    );
    expect(state.expandedParents).toEqual([
      "domain:onboarding",
      "capability:huge",
    ]);
  });

  it("drops empty, duplicate and blank entries and keeps other navigation params", () => {
    const state = parseHomeRouteState(
      new URLSearchParams("p=pick&open=,a,,a, b ,&mode=health"),
    );
    expect(state.expandedParents).toEqual(["a", "b"]);
    expect(state.selectedSlug).toBe("pick");
    expect(state.analysisMode).toBe("health");
    // Round-trip safe.
    expect(parseHomeRouteState(new URLSearchParams("p=pick")).expandedParents).toEqual([]);
  });

  it("keeps open in the URL after map navigation such as node select and toggle", () => {
    const params = new URLSearchParams("open=domain:onboarding");
    const state = parseHomeRouteState(params);

    // Navigating does not reset the folding.
    const afterClick = resolveTopologyNodeClickRouteState(state, "domain:views");
    expect(afterClick.expandedParents).toEqual(["domain:onboarding"]);
    expect(applyHomeRouteState(params, afterClick).get("open")).toBe(
      "domain:onboarding",
    );

    const toggled = {
      ...afterClick,
      expandedParents: toggleExpandedParent(afterClick.expandedParents, "capability:huge"),
    };
    expect(applyHomeRouteState(params, toggled).get("open")).toBe(
      "domain:onboarding,capability:huge",
    );

    // Losing the last parent deletes the parameter.
    const collapsed = {
      ...state,
      expandedParents: toggleExpandedParent(state.expandedParents, "domain:onboarding"),
    };
    expect(applyHomeRouteState(params, collapsed).get("open")).toBeNull();
  });
});

describe("realm expansion (?realm=)", () => {
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

describe("resolveRealmNodeId slug alias", () => {
  const nodeIds = ["project:atlas", "domain:views", "capability:ai-agent-partner", "element:parser"];

  it("passes an exact canonical id through", () => {
    expect(resolveRealmNodeId("capability:ai-agent-partner", nodeIds)).toBe(
      "capability:ai-agent-partner",
    );
  });

  it("promotes a bare slug without a kind prefix to a <kind>:<slug> canonical id", () => {
    expect(resolveRealmNodeId("ai-agent-partner", nodeIds)).toBe(
      "capability:ai-agent-partner",
    );
    expect(resolveRealmNodeId("views", nodeIds)).toBe("domain:views");
  });

  it("returns null when no node matches, so the chip hides", () => {
    expect(resolveRealmNodeId("does-not-exist", nodeIds)).toBeNull();
    // Only an exact match counts.
    expect(resolveRealmNodeId("domain:ai-agent-partner", nodeIds)).toBeNull();
  });

  it("returns null for an empty or blank realm", () => {
    expect(resolveRealmNodeId(null, nodeIds)).toBeNull();
    expect(resolveRealmNodeId("", nodeIds)).toBeNull();
  });

  it("an exact match wins over a bare alias", () => {
    const ids = ["capability:parser", "element:parser"];
    expect(resolveRealmNodeId("element:parser", ids)).toBe("element:parser");
    // The first match in iteration order.
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
  // A 3-deep contains chain.
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
    // The walk stops before re-adding the target.
    expect(result).toEqual(["b", "c"]);
  });
});

/** Past the cap the oldest closes, collapsing always works, and a deep link gets the same cap. */
describe("expanded-parent cap", () => {
  it("stacks freely under the cap", () => {
    let open: string[] = [];
    open = toggleExpandedParent(open, "a");
    open = toggleExpandedParent(open, "b");
    expect(open).toEqual(["a", "b"]);
  });

  it("past the cap the longest-open parent closes, so the click is not ignored", () => {
    let open: string[] = [];
    for (const id of ["a", "b", "c", "d"]) open = toggleExpandedParent(open, id);
    expect(open).toHaveLength(MAX_EXPANDED_PARENTS);
    expect(open).toEqual(["b", "c", "d"]);
    // What was pressed must be open: "not ignored".
    expect(open).toContain("d");
    expect(open).not.toContain("a");
  });

  it("repeated presses never exceed the cap", () => {
    let open: string[] = [];
    for (let i = 0; i < 20; i += 1) open = toggleExpandedParent(open, `p${i}`);
    expect(open).toHaveLength(MAX_EXPANDED_PARENTS);
    expect(open).toContain("p19");
  });

  it("collapsing always works regardless of the cap", () => {
    let open = ["a", "b", "c"];
    open = toggleExpandedParent(open, "b");
    expect(open).toEqual(["a", "c"]);
  });

  it("reopening an already open parent closes no other", () => {
    const open = toggleExpandedParent(["a", "b", "c"], "a");
    expect(open).toEqual(["b", "c"]);
  });

  it("deep links get the same cap and cannot bypass it", () => {
    const parsed = parseExpandedParentsParam("a,b,c,d,e");
    expect(parsed).toHaveLength(MAX_EXPANDED_PARENTS);
    // The tail is kept, like the toggle's eviction.
    expect(parsed).toEqual(["c", "d", "e"]);
  });

  it("deep-link deduplication happens before the cap", () => {
    // Duplicates must not cut a valid entry.
    expect(parseExpandedParentsParam("a,a,a,b")).toEqual(["a", "b"]);
  });
});

/**
 * An address naming a node from another vault dims the whole map and makes the path chip claim a
 * falsehood.
 */
describe("clearVaultScopedRouteState", () => {
  /**
   * A complete path fixture has `p` already nulled by the parser, which passes even with clearing
   * removed,
   * so selection and path use separate fixtures.
   */
  const SELECTION_SEARCH =
    "p=capability:alpha&c=cat&hub=domain:h&open=domain:x,domain:y&realm=domain:r" +
    "&impact=upstream&pulse=7d&recent=7";
  const PATH_SEARCH = "mode=path&pathFrom=capability:a&pathTo=domain:b&from=capability:a&to=domain:b";

  it("clears selection state that carries vault names and keeps enum keys", () => {
    const current = parseHomeRouteState(new URLSearchParams(SELECTION_SEARCH));
    expect(current.selectedSlug).toBe("capability:alpha");

    const next = clearVaultScopedRouteState(current);

    expect(next.selectedSlug).toBeNull();
    expect(next.activeCategory).toBeNull();
    expect(next.focusedHubSlug).toBeNull();
    expect(next.expandedParents).toEqual([]);
    expect(next.realmSlug).toBeNull();
    // Enum values mean the same in any vault.
    expect(next.impactMode).toBe("upstream");
    expect(next.pulseMode).toBe("7d");
    expect(next.recentWindow).toBe(7);
  });

  it("clears path endpoints and returns to overview, since a path mode without endpoints claims nothing", () => {
    const current = parseHomeRouteState(new URLSearchParams(PATH_SEARCH));
    expect(current.pathSourceSlug).toBe("capability:a");
    expect(current.pathTargetSlug).toBe("domain:b");

    const next = clearVaultScopedRouteState(current);

    expect(next.pathSourceSlug).toBeNull();
    expect(next.pathTargetSlug).toBeNull();
    expect(next.analysisMode).toBe("overview");
  });

  it("the keys leave the address too: writing the cleared state back to the URL omits them", () => {
    for (const search of [SELECTION_SEARCH, PATH_SEARCH]) {
      const cleared = clearVaultScopedRouteState(
        parseHomeRouteState(new URLSearchParams(search)),
      );
      const params = applyHomeRouteState(new URLSearchParams(search), cleared);

      for (const key of VAULT_SCOPED_HOME_QUERY_KEYS) {
        expect(params.has(key), `${key} stayed in the address (${search})`).toBe(false);
      }
    }
  });

  it("enum keys stay in the address", () => {
    const cleared = clearVaultScopedRouteState(
      parseHomeRouteState(new URLSearchParams(SELECTION_SEARCH)),
    );
    const params = applyHomeRouteState(new URLSearchParams(SELECTION_SEARCH), cleared);
    expect(params.get("pulse")).toBe("7d");
    expect(params.get("impact")).toBe("upstream");
    expect(params.get("recent")).toBe("7");
  });

  it("an untouched mode stays unless it is path", () => {
    const current = parseHomeRouteState(new URLSearchParams("mode=health&p=x"));
    expect(clearVaultScopedRouteState(current).analysisMode).toBe("health");
  });
});

/**
 * Every vault-scoped key must be a real query
 * key; `tests/contract/scope-registry.contract.test.ts`
 * checks that every key is registered.
 */
describe("VAULT_SCOPED_HOME_QUERY_KEYS", () => {
  it("every key is a real query key", () => {
    const known = new Set<string>(Object.values(HOME_QUERY_KEYS));
    for (const key of VAULT_SCOPED_HOME_QUERY_KEYS) {
      expect(known.has(key), `${key} is missing from HOME_QUERY_KEYS`).toBe(true);
    }
  });
});

/**
 * The whole bridge from the insights flow tab to the chat. It rides `ask` without becoming
 * an `askIntent`,
 * which feeds `nodeIntent` and cannot answer a request naming no node.
 */
describe("business-flow ask value", () => {
  it("parses into its own field and never into askIntent", () => {
    const state = parseHomeRouteState(new URLSearchParams("ask=business-flow"));

    expect(state.askBusinessFlow).toBe(true);
    expect(
      state.askIntent,
      "askIntent means an intent about one node; this one is about the whole graph",
    ).toBeNull();
  });

  it("survives a round trip through the URL", () => {
    const params = applyHomeRouteState(new URLSearchParams(), {
      ...DEFAULT_HOME_ROUTE_STATE,
      askBusinessFlow: true,
    });

    expect(params.get("ask")).toBe("business-flow");
    expect(parseHomeRouteState(params).askBusinessFlow).toBe(true);
  });

  it("leaves a node intent on the same key untouched", () => {
    const state = parseHomeRouteState(new URLSearchParams("ask=missing-definition"));

    expect(state.askIntent).toBe("missing-definition");
    expect(state.askBusinessFlow).toBe(false);
  });
});

describe("map view in the address", () => {
  it("names Territories and the hex board, and drops anything else", () => {
    expect(parseHomeRouteState(new URLSearchParams("view=territories")).mapView).toBe("territories");
    expect(parseHomeRouteState(new URLSearchParams("view=hex")).mapView).toBe("hex");
    expect(parseHomeRouteState(new URLSearchParams("view=honeycomb")).mapView).toBeNull();
    const params = applyHomeRouteState(new URLSearchParams(), { ...DEFAULT_HOME_ROUTE_STATE, mapView: "hex" });
    expect(params.get("view")).toBe("hex");
  });
});

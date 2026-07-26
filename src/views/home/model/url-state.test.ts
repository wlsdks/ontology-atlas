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
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
    });
  });

  // 최근 변경 스포트라이트 (협의회 설계 2026-07-23) — `?recent=` 은 지도
  // 침강과 INDEX 렌즈를 동시에 구동하는 단일 진실원이라 파싱 계약을 고정한다.
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

  it("falls back to overview for the removed live-graph mode (#19)", () => {
    // 살아있는 그래프(물리) 토글 제거 후 mode=graph 는 더는 유효 모드가
    // 아니다 — 옛 공유 링크는 조용히 overview 로 강등된다.
    const params = new URLSearchParams("mode=graph");

    expect(parseHomeRouteState(params)).toMatchObject({
      analysisMode: "overview",
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
      indexState: null,
      insightsReturnTab: null,
      insightsReturnReviewId: null,
      askIntent: null,
      expandedParents: [],
      realmSlug: null,
      recentWindow: null,
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

  // 스포트라이트 왕복 안정 — 공유 링크/에이전트 판독 계약.
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

describe("resolveTopologyNodeClickRouteState", () => {
  // persona QA (fix/persona-findings ②): 두 번째 노드 클릭으로 캔버스는
  // A→B 를 그리지만 칩 문구가 "대상 선택" 에 고정되고 경로 패킷 복사
  // 버튼도 나타나지 않던 회귀 — `HomePage.tsx` 의 클릭 핸들러가
  // analysisMode 를 보지 않고 항상 일반 선택 경로로만 흘렀던 게 원인.
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
    // 탭 없는 접두어만으로는 복귀 목적지가 없다 — 칩 미렌더.
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

    // 노드 클릭(선택) 후에도 마커 유지 — 칩은 지도 탐색 중 사라지지 않는다.
    const afterClick = resolveTopologyNodeClickRouteState(state, "domain:views");
    expect(afterClick.insightsReturnTab).toBe("do-next");
    expect(applyHomeRouteState(params, afterClick).get("via")).toBe(
      "insights:do-next",
    );
    expect(applyHomeRouteState(params, afterClick).get("review")).toBe(
      "promotion:element:x",
    );

    // 명시 dismiss(칩의 X) 만 마커를 지운다.
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
    // 빈 항목/중복 제거, 트림. b 는 트림돼 살아남는다.
    expect(state.expandedParents).toEqual(["a", "b"]);
    // open 파싱이 나머지 라우트 상태를 오염시키지 않는다.
    expect(state.selectedSlug).toBe("pick");
    expect(state.analysisMode).toBe("health");
    // open 미지정이면 빈 배열(왕복 안전).
    expect(parseHomeRouteState(new URLSearchParams("p=pick")).expandedParents).toEqual([]);
  });

  it("왕복: 지도 탐색(노드 선택/토글) 후에도 open 이 URL 에 보존된다", () => {
    const params = new URLSearchParams("open=domain:onboarding");
    const state = parseHomeRouteState(params);

    // 노드 클릭(선택) 후에도 확장 상태 유지 — 탐색이 접힘을 리셋하지 않는다.
    const afterClick = resolveTopologyNodeClickRouteState(state, "domain:views");
    expect(afterClick.expandedParents).toEqual(["domain:onboarding"]);
    expect(applyHomeRouteState(params, afterClick).get("open")).toBe(
      "domain:onboarding",
    );

    // 토글 헬퍼로 부모 추가 → URL 왕복.
    const toggled = {
      ...afterClick,
      expandedParents: toggleExpandedParent(afterClick.expandedParents, "capability:huge"),
    };
    expect(applyHomeRouteState(params, toggled).get("open")).toBe(
      "domain:onboarding,capability:huge",
    );

    // 같은 부모 재토글 → 제거 → 마지막 하나 사라지면 open 파라미터 자체 삭제.
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
    // 사용자가 손으로 친 `?realm=ai-agent-partner` — 예전엔 raw 칩 + 전체 지도.
    expect(resolveRealmNodeId("ai-agent-partner", nodeIds)).toBe(
      "capability:ai-agent-partner",
    );
    expect(resolveRealmNodeId("views", nodeIds)).toBe("domain:views");
  });

  it("어떤 노드와도 안 맞으면 null — 칩 미표시 계약", () => {
    expect(resolveRealmNodeId("does-not-exist", nodeIds)).toBeNull();
    // kind prefix 가 붙었지만 kind 가 틀린 경우도 미해석(정확 일치만 인정).
    expect(resolveRealmNodeId("domain:ai-agent-partner", nodeIds)).toBeNull();
  });

  it("빈 값/공백 realm 은 null", () => {
    expect(resolveRealmNodeId(null, nodeIds)).toBeNull();
    expect(resolveRealmNodeId("", nodeIds)).toBeNull();
  });

  it("정확 일치가 bare 별칭보다 우선한다", () => {
    // 같은 tail slug 를 가진 두 노드가 있어도, 정확 일치 id 가 있으면 그것.
    const ids = ["capability:parser", "element:parser"];
    expect(resolveRealmNodeId("element:parser", ids)).toBe("element:parser");
    // bare `parser` 는 등장 순서상 첫 매치(capability:parser).
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

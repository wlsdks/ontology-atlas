import type { ProjectCategory } from "@/entities/project";
import type { ProjectImpactMode } from "@/entities/project";
import {
  buildInsightsReturnMarker,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
} from "@/entities/knowledge-graph";
import {
  parseIndexPanelStateParam,
  type IndexPanelState,
} from "@/widgets/topology-index-panel";

export type HomePulseMode = "all" | "7d" | "30d";
export type TopologyAnalysisMode =
  | "overview"
  | "graph"
  | "focus"
  | "path"
  | "health";

export interface HomeRouteState {
  selectedSlug: string | null;
  activeCategory: ProjectCategory | null;
  focusedHubSlug: string | null;
  impactMode: ProjectImpactMode;
  pulseMode: HomePulseMode;
  analysisMode: TopologyAnalysisMode;
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
  createNodeIntent: boolean;
  /**
   * INDEX panel expand/collapse deep-link intent (B3 허브가 곧 지도,
   * `?index=expanded|collapsed`). `null` = not specified in THIS url — the
   * caller (HomePage) falls back to the localStorage preference, then the
   * "expanded" default (`resolveIndexPanelState`,
   * `@/widgets/topology-index-panel`). Kept nullable rather than defaulting
   * here so a URL round-trip never clobbers a preference the URL didn't ask
   * to change.
   */
  indexState: IndexPanelState | null;
  /**
   * 인사이트발 딥링크 복귀 마커 (`?via=insights:<tab>`) — 값은 원래 보던
   * 인사이트 탭 slug. non-null 이면 HomePage 가 상단 중앙 크롬 열에
   * "인사이트로 돌아가기" 칩을 렌더한다.
   *
   * 수명 계약: 마커는 URL 에 살고, 지도 안의 다른 상호작용(노드 클릭·모드
   * 전환 등)에도 round-trip 으로 유지된다 — 탐색이 깊어질수록 브라우저
   * 뒤로가기가 무력해지는 바로 그 순간을 위한 어포던스라서다. 제거는 명시
   * dismiss(칩의 X) 또는 마커 없는 새 URL 진입뿐. 칩 클릭(복귀)은 마커를
   * 지우지 않는다 — 뒤로가기로 지도에 돌아오면 같은 딥링크 문맥이므로 칩도
   * 다시 보이는 게 맞다. Esc 사다리(M-7)에는 참여하지 않는다.
   */
  insightsReturnTab: string | null;
  /**
   * 밀도 게이트 (fable 설계) — 클러스터 칩으로 접힌 부모 중 사용자가 펼친
   * 부모 slug 목록 (`?open=slug1,slug2`). 임계(12) 초과 자식을 가진 부모는
   * 지도에서 기본 접힘이고, 여기 담긴 부모만 자식을 노출한다. URL 에 사는
   * 이유: 공유 링크·에이전트가 "무엇이 펼쳐졌나"를 그대로 재현/가독할 수
   * 있어야 하기 때문(`design.md` "나머지는 클릭 시 expand" 헌장과 정합).
   * HomePage 가 Set 으로 변환해 지도로 내린다.
   */
  expandedParents: string[];
  /**
   * "영역 전개" (S4, fable 설계) — 지도가 이 노드의 세계로 전환된 상태
   * (`?realm=slug`). non-null 이면 그 노드의 containment 서브트리만 남기고
   * 그 노드를 임시 루트로 재배치한 "영역" 뷰를 렌더한다. URL 에 사는 이유:
   * 공유 링크·에이전트가 "지금 어느 영역 안인가"를 그대로 재현/가독할 수 있어야
   * 하기 때문. 진입 시 기존 `p`(선택)·`open`(밀도 게이트 확장)은 클리어된다
   * (`enterRealmRouteState`) — 영역은 새 좌표계이므로 이전 확장 상태가 무의미하다.
   */
  realmSlug: string | null;
  /**
   * 최근 변경 스포트라이트 (`?recent=auto|1|7|30`, 협의회 설계 2026-07-23) —
   * non-null 이면 지도가 "지난 N일 동안 디스크가 바뀐 노드"를 fresh 채널로
   * 켜고 나머지를 침강시키는 렌즈 모드다. `"auto"` = 기존 적응 사다리
   * (`useAdaptiveRecentChanges` 7→3→1일)가 창을 고른다; 숫자 = 명시 창 고정.
   * URL 에 사는 이유: 공유 링크·에이전트가 "사람이 보던 것과 같은 창"을
   * 재현/가독할 수 있어야 하고, INDEX 렌즈와 지도 침강이 **단일 진실원**
   * (이 값 하나)에서 구동돼야 두 표면의 창 불일치가 구조적으로 불가능해진다.
   * null = off (파라미터 부재).
   */
  recentWindow: RecentSpotlightWindow | null;
}

/** 스포트라이트 창 — "auto"(적응 사다리) 또는 명시 일수 프리셋. */
export type RecentSpotlightWindow = "auto" | 1 | 7 | 30;

const HOME_QUERY_KEYS = {
  project: "p",
  category: "c",
  hub: "hub",
  impact: "impact",
  pulse: "pulse",
  mode: "mode",
  pathSource: "pathFrom",
  pathTarget: "pathTo",
  pathSourceAlias: "from",
  pathTargetAlias: "to",
  create: "create",
  index: "index",
  open: "open",
  realm: "realm",
  recent: "recent",
  via: ONTOLOGY_DEEPLINK_VIA_KEY,
} as const;

const VALID_IMPACT: ProjectImpactMode[] = [
  "none",
  "upstream",
  "downstream",
  "network",
];
const VALID_PULSE: HomePulseMode[] = ["all", "7d", "30d"];
const VALID_ANALYSIS_MODE: TopologyAnalysisMode[] = [
  "overview",
  "graph",
  "focus",
  "path",
  "health",
];

export const DEFAULT_HOME_ROUTE_STATE: HomeRouteState = {
  selectedSlug: null,
  activeCategory: null,
  focusedHubSlug: null,
  impactMode: "none",
  pulseMode: "all",
  analysisMode: "overview",
  pathSourceSlug: null,
  pathTargetSlug: null,
  createNodeIntent: false,
  indexState: null,
  insightsReturnTab: null,
  expandedParents: [],
  realmSlug: null,
  recentWindow: null,
};

/**
 * 스포트라이트 — `?recent=` 값 파싱. `auto`/`1`/`7`/`30` 만 유효, 그 외/부재는
 * null(off). 순수 함수 — 잘못된 값은 조용히 off 로 강등(범례 없는 상태 오염
 * 방지).
 */
export function parseRecentWindowParam(raw: string | null): RecentSpotlightWindow | null {
  if (raw === "auto") return "auto";
  if (raw === "1") return 1;
  if (raw === "7") return 7;
  if (raw === "30") return 30;
  return null;
}

/** 스포트라이트 창 → URL 값 직렬화 (null = 파라미터 제거). */
export function serializeRecentWindowParam(window: RecentSpotlightWindow | null): string | null {
  if (window === null) return null;
  return window === "auto" ? "auto" : String(window);
}

/**
 * 밀도 게이트 — `?open=` 값 파싱: 콤마 분리, 트림, 빈 항목 무시, 중복 제거.
 * 순서는 등장 순서를 보존한다(왕복 안정). 순수 함수라 테스트 가능.
 */
export function parseExpandedParentsParam(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (slug === "" || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  return result;
}

/**
 * 밀도 게이트 — 확장 부모 목록에서 한 부모를 토글한 새 목록을 낸다(순수).
 * HomePage 의 칩 클릭 핸들러가 이걸로 `expandedParents` 를 갱신해 URL 왕복한다.
 */
export function toggleExpandedParent(current: readonly string[], parentId: string): string[] {
  return current.includes(parentId)
    ? current.filter((id) => id !== parentId)
    : [...current, parentId];
}

/**
 * 딥링크 focus dive 조상 파생 (패널2-D1, R4 모션 헌법, fable 설계) — 한 방향
 * contains 엣지 목록에서 자식 id → 부모 id 맵을 만든다. 밀도 게이트
 * (`model/density-gate.ts`) 가 임계 초과 부모를 접었을 때, `?p=slug` 딥링크
 * 대상이 그 접힘 서브트리 안에 있으면 조상 체인을 펼쳐 드러내야 한다 —
 * 그 조상 체인을 걷기 위한 부모 조회 맵이다. 한 자식이 둘 이상 contains
 * 부모를 가지면(드묾) 먼저 나온 부모를 채택한다(딥링크 노출엔 유효한 한
 * 체인이면 충분). 순수·결정론.
 */
export function buildContainmentParentMap(
  edges: readonly { source: string; target: string; kind: string }[],
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "contains") continue;
    if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
  }
  return parentOf;
}

/**
 * 딥링크 focus dive 조상 파생 (패널2-D1, fable 설계) — `targetId` 의 contains
 * 조상 전부를 `currentExpanded` 에 더한 새 펼침 목록을 낸다. 대상 자신은
 * 부모가 아니므로 넣지 않고, 그 부모·조부모…를 가까운 순으로 append 한다
 * (URL `?open=` 왕복 안정). 이미 펼쳐진 조상은 중복 추가하지 않고, 사이클은
 * 방문 집합으로 차단한다. 추가할 조상이 없으면(대상 없음/최상위/전부 이미
 * 펼침) 내용이 같은 새 배열을 낸다. 순수 함수 — HomePage 가 로드 1회
 * 적용해 URL 왕복하면, 대상이 드러난 뒤 기존 focus dive 가 클릭과 동일한
 * 이징 문법으로 1회 발화한다.
 */
export function deriveDeeplinkAncestorExpansion(
  targetId: string | null,
  parentOf: ReadonlyMap<string, string>,
  currentExpanded: readonly string[],
): string[] {
  if (!targetId) return [...currentExpanded];
  const seen = new Set<string>(currentExpanded);
  const guard = new Set<string>([targetId]);
  const additions: string[] = [];
  let cursor = parentOf.get(targetId);
  while (cursor !== undefined && !guard.has(cursor)) {
    guard.add(cursor);
    if (!seen.has(cursor)) {
      seen.add(cursor);
      additions.push(cursor);
    }
    cursor = parentOf.get(cursor);
  }
  return additions.length === 0
    ? [...currentExpanded]
    : [...currentExpanded, ...additions];
}

/**
 * "영역 전개" 진입 — 지도를 `slug` 노드의 세계로 전환한다. 영역은 새 좌표계라
 * 이전 선택(`p`)·밀도 게이트 확장(`open`)·경로 소스는 클리어한다(spec: "realm
 * 전환 시 기존 open/p 는 클리어"). 순수 함수 — HomePage 가 URL 왕복한다.
 */
export function enterRealmRouteState(
  current: HomeRouteState,
  slug: string,
): HomeRouteState {
  return {
    ...current,
    realmSlug: slug,
    selectedSlug: null,
    focusedHubSlug: null,
    expandedParents: [],
  };
}

/** "영역 전개" 해제 — 전체 지도로 복귀 (`?realm=` 제거). 선택도 함께 비운다. */
export function exitRealmRouteState(current: HomeRouteState): HomeRouteState {
  return { ...current, realmSlug: null, selectedSlug: null, focusedHubSlug: null };
}

/**
 * "영역 전개" realm slug 해석 (패널3-S7) — URL 의 `?realm=` 값을 실제 노드
 * id 로 맞춘다. 노드 id 는 `kind:slug`(예: `capability:mcp-server`) 공간이라,
 * 사용자가 손으로 친 bare slug(`?realm=ai-agent-partner`, kind prefix 없음)는
 * 그냥은 어떤 노드와도 안 맞아 raw 칩 + 전체 지도가 조용히 렌더됐다. 이 함수는
 * (1) 정확히 일치하는 id 가 있으면 그대로, (2) prefix 없는 bare slug 면
 * `<kind>:<slug>` 형태의 노드를 찾아 canonical id 로 승격, (3) 못 찾으면 null.
 * null 이면 caller 가 칩을 숨기고 영역을 활성화하지 않는다(조용한 fallback 대신
 * 명시적 미해석). 순수 — `nodeIds` 는 canonical 노드 id 목록.
 */
export function resolveRealmNodeId(
  realmSlug: string | null,
  nodeIds: Iterable<string>,
): string | null {
  if (!realmSlug) return null;
  const hasKindPrefix = realmSlug.includes(":");
  let bareMatch: string | null = null;
  for (const id of nodeIds) {
    if (id === realmSlug) return id; // 정확 일치가 최우선
    if (!hasKindPrefix && bareMatch === null) {
      const colon = id.indexOf(":");
      if (colon >= 0 && id.slice(colon + 1) === realmSlug) bareMatch = id;
    }
  }
  return bareMatch;
}

export function parseHomeRouteState(
  searchParams: URLSearchParams,
): HomeRouteState {
  const impactParam = searchParams.get(HOME_QUERY_KEYS.impact);
  const pulseParam = searchParams.get(HOME_QUERY_KEYS.pulse);
  const modeParam = searchParams.get(HOME_QUERY_KEYS.mode);
  const rawSelectedSlug = searchParams.get(HOME_QUERY_KEYS.project);
  // 딥링크는 명시된 mode 를 존중한다. selectedSlug 만으로 parse 단계에서
  // focus 로 승격하지 않는다. click selection 의 승격은 아래
  // selectTopologyNodeRouteState 에서만 수행해 load 와 interaction 을 분리한다.
  const analysisMode = VALID_ANALYSIS_MODE.includes(modeParam as TopologyAnalysisMode)
    ? (modeParam as TopologyAnalysisMode)
    : DEFAULT_HOME_ROUTE_STATE.analysisMode;
  const pathSourceSlug =
    searchParams.get(HOME_QUERY_KEYS.pathSource) ??
    searchParams.get(HOME_QUERY_KEYS.pathSourceAlias) ??
    (analysisMode === "path" ? rawSelectedSlug : null);
  const pathTargetSlug =
    searchParams.get(HOME_QUERY_KEYS.pathTarget) ??
    searchParams.get(HOME_QUERY_KEYS.pathTargetAlias);
  const selectedSlug =
    analysisMode === "path" && pathSourceSlug && pathTargetSlug
      ? null
      : rawSelectedSlug;
  const pathResultComplete = Boolean(
    analysisMode === "path" && pathSourceSlug && pathTargetSlug,
  );
  const impactMode = pathResultComplete
    ? DEFAULT_HOME_ROUTE_STATE.impactMode
    : VALID_IMPACT.includes(impactParam as ProjectImpactMode)
      ? (impactParam as ProjectImpactMode)
      : DEFAULT_HOME_ROUTE_STATE.impactMode;

  return {
    selectedSlug,
    activeCategory: searchParams.get(HOME_QUERY_KEYS.category),
    focusedHubSlug: pathResultComplete
      ? null
      : searchParams.get(HOME_QUERY_KEYS.hub),
    impactMode,
    pulseMode: VALID_PULSE.includes(pulseParam as HomePulseMode)
      ? (pulseParam as HomePulseMode)
      : DEFAULT_HOME_ROUTE_STATE.pulseMode,
    analysisMode,
    pathSourceSlug,
    pathTargetSlug,
    createNodeIntent: searchParams.get(HOME_QUERY_KEYS.create) === "concept",
    indexState: parseIndexPanelStateParam(searchParams.get(HOME_QUERY_KEYS.index)),
    insightsReturnTab: parseInsightsReturnMarker(
      searchParams.get(HOME_QUERY_KEYS.via),
    ),
    expandedParents: parseExpandedParentsParam(
      searchParams.get(HOME_QUERY_KEYS.open),
    ),
    realmSlug: searchParams.get(HOME_QUERY_KEYS.realm) || null,
    recentWindow: parseRecentWindowParam(searchParams.get(HOME_QUERY_KEYS.recent)),
  };
}

export function selectTopologyNodeRouteState(
  current: HomeRouteState,
  slug: string,
  options?: { isHub?: boolean; preserveImpact?: boolean },
): HomeRouteState {
  return {
    ...current,
    selectedSlug: slug,
    focusedHubSlug: options?.isHub ? slug : null,
    impactMode: options?.preserveImpact ? current.impactMode : "none",
    // 클릭 = 선택(안전한 탐색)만 — 어떤 모드에서도 mode 를 바꾸지 않는다.
    // 이전의 overview→focus 자동 승격은 [선택+확장+재배치+카메라핏]을 한
    // 클릭에 겹쳐 인과를 지웠다 (R+ 소유자 피드백 "클릭하면 그냥 바뀌어서
    // 헷갈린다"). 확장(초점)은 카드 배지/더블클릭/딥링크의 명시적 의도로만.
    analysisMode: current.analysisMode,
  };
}

export function selectTopologyPathRouteState(
  current: HomeRouteState,
  selection: { sourceSlug: string | null; targetSlug: string | null },
): HomeRouteState {
  const hasCompletePath = Boolean(selection.sourceSlug && selection.targetSlug);
  return {
    ...current,
    analysisMode: "path",
    selectedSlug: hasCompletePath
      ? null
      : selection.sourceSlug ?? current.selectedSlug,
    focusedHubSlug: hasCompletePath ? null : current.focusedHubSlug,
    impactMode: hasCompletePath ? "none" : current.impactMode,
    pathSourceSlug: selection.sourceSlug,
    pathTargetSlug: selection.targetSlug,
  };
}

/**
 * 캔버스 노드 클릭의 단일 진입점 — path 모드인지 여부로
 * `selectTopologyNodeRouteState` (일반 선택) 과 `selectTopologyPathRouteState`
 * (경로 소스/대상 확정) 사이를 분기한다.
 *
 * persona QA 발견 (fix/persona-findings ②): 이전엔 `HomePage.tsx` 의
 * `handleSelect` 가 analysisMode 를 전혀 보지 않고 항상
 * `selectTopologyNodeRouteState` 로만 흘렀다 — path 모드에서 소스 노드를
 * 고른 뒤 두 번째 노드를 클릭해도 `pathTargetSlug` 가 절대 채워지지 않아,
 * 캔버스는 새로 선택된 노드의 ego 이웃을 그려 "경로가 확정된 것처럼"
 * 보였지만 `TopologyPathChip` 은 `pathTargetSlug` 를 엄격히 요구해 "대상
 * 선택" 문구에 고정되고 경로 패킷 복사 버튼도 끝내 나타나지 않았다.
 *
 * 판정: path 모드 + 소스 미확정 → 클릭한 노드를 소스로. path 모드 + 소스
 * 확정 + 클릭한 노드가 소스와 다름 → 그 노드를 대상으로 확정(다시 클릭해
 * 대상을 갈아끼우는 재선택 흐름 유지). 그 외(overview/focus/health 등,
 * 또는 소스 노드 자체를 다시 클릭) → 기존 일반 선택 그대로.
 */
export function resolveTopologyNodeClickRouteState(
  current: HomeRouteState,
  slug: string,
  options?: { isHub?: boolean; preserveImpact?: boolean },
): HomeRouteState {
  if (current.analysisMode === "path") {
    if (!current.pathSourceSlug) {
      return selectTopologyPathRouteState(current, {
        sourceSlug: slug,
        targetSlug: null,
      });
    }
    if (slug !== current.pathSourceSlug) {
      return selectTopologyPathRouteState(current, {
        sourceSlug: current.pathSourceSlug,
        targetSlug: slug,
      });
    }
    return current;
  }
  return selectTopologyNodeRouteState(current, slug, options);
}

export function applyHomeRouteState(
  searchParams: URLSearchParams,
  state: HomeRouteState,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);

  setOrDelete(next, HOME_QUERY_KEYS.project, state.selectedSlug);
  setOrDelete(next, HOME_QUERY_KEYS.category, state.activeCategory);
  setOrDelete(next, HOME_QUERY_KEYS.hub, state.focusedHubSlug);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.impact,
    state.impactMode === "none" ? null : state.impactMode,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.pulse,
    state.pulseMode === "all" ? null : state.pulseMode,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.mode,
    state.analysisMode === "overview" ? null : state.analysisMode,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.pathSource,
    state.analysisMode === "path" ? state.pathSourceSlug : null,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.pathTarget,
    state.analysisMode === "path" ? state.pathTargetSlug : null,
  );
  next.delete(HOME_QUERY_KEYS.pathSourceAlias);
  next.delete(HOME_QUERY_KEYS.pathTargetAlias);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.create,
    state.createNodeIntent ? "concept" : null,
  );
  setOrDelete(next, HOME_QUERY_KEYS.index, state.indexState);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.open,
    state.expandedParents.length > 0 ? state.expandedParents.join(",") : null,
  );
  setOrDelete(next, HOME_QUERY_KEYS.realm, state.realmSlug);
  setOrDelete(next, HOME_QUERY_KEYS.recent, serializeRecentWindowParam(state.recentWindow));
  setOrDelete(
    next,
    HOME_QUERY_KEYS.via,
    state.insightsReturnTab
      ? buildInsightsReturnMarker(state.insightsReturnTab)
      : null,
  );

  return next;
}

function setOrDelete(
  searchParams: URLSearchParams,
  key: string,
  value: string | null,
) {
  if (value) {
    searchParams.set(key, value);
    return;
  }

  searchParams.delete(key);
}

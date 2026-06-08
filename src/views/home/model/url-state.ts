import type { ProjectCategory } from "@/entities/project";
import type { ProjectImpactMode } from "@/entities/project";

export type HomePulseMode = "all" | "7d" | "30d";
export type TopologyAnalysisMode = "overview" | "focus" | "path" | "health";

export interface HomeRouteState {
  selectedSlug: string | null;
  activeCategory: ProjectCategory | null;
  focusedHubSlug: string | null;
  impactMode: ProjectImpactMode;
  pulseMode: HomePulseMode;
  analysisMode: TopologyAnalysisMode;
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
}

const HOME_QUERY_KEYS = {
  project: "p",
  category: "c",
  hub: "hub",
  impact: "impact",
  pulse: "pulse",
  mode: "mode",
  pathSource: "pathFrom",
  pathTarget: "pathTo",
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
};

export function parseHomeRouteState(
  searchParams: URLSearchParams,
): HomeRouteState {
  const impactParam = searchParams.get(HOME_QUERY_KEYS.impact);
  const pulseParam = searchParams.get(HOME_QUERY_KEYS.pulse);
  const modeParam = searchParams.get(HOME_QUERY_KEYS.mode);
  const selectedSlug = searchParams.get(HOME_QUERY_KEYS.project);
  const analysisMode = VALID_ANALYSIS_MODE.includes(modeParam as TopologyAnalysisMode)
    ? (modeParam as TopologyAnalysisMode)
    : selectedSlug
      ? "focus"
      : DEFAULT_HOME_ROUTE_STATE.analysisMode;

  return {
    selectedSlug,
    activeCategory: searchParams.get(HOME_QUERY_KEYS.category),
    focusedHubSlug: searchParams.get(HOME_QUERY_KEYS.hub),
    impactMode: VALID_IMPACT.includes(impactParam as ProjectImpactMode)
      ? (impactParam as ProjectImpactMode)
      : DEFAULT_HOME_ROUTE_STATE.impactMode,
    pulseMode: VALID_PULSE.includes(pulseParam as HomePulseMode)
      ? (pulseParam as HomePulseMode)
      : DEFAULT_HOME_ROUTE_STATE.pulseMode,
    analysisMode,
    pathSourceSlug: searchParams.get(HOME_QUERY_KEYS.pathSource),
    pathTargetSlug: searchParams.get(HOME_QUERY_KEYS.pathTarget),
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
    // 노드 선택은 현재 모드를 유지한다. 기본(overview)에서 클릭하면 depthLimit
    // null 이 유지돼 nodeReducer 가 applyFocusOverlay 의 1-hop tight ego(focus
    // 강조 + 1-hop 인디고 tint + 그 외 deep dim)를 그린다. overview→focus 자동
    // 승격은 depthLimit 2(2-hop)를 걸어 그 1-hop 경로를 우회시켰다. "초점" 탭은
    // 사용자가 명시적으로 누르면 2-hop neighborhood 로 동작한다(분리 유지).
    analysisMode: current.analysisMode,
  };
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

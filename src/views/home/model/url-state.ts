import type { ProjectCategory } from "@/entities/project";
import type { ProjectImpactMode } from "@/entities/project";
import { WORKSPACE_PROJECT_QUERY_KEY } from "@/shared/lib/account-scope";

export type HomePulseMode = "all" | "7d" | "30d";

export interface HomeRouteState {
  selectedSlug: string | null;
  activeCategory: ProjectCategory | null;
  focusedHubSlug: string | null;
  featuredPathId: string | null;
  impactMode: ProjectImpactMode;
  pulseMode: HomePulseMode;
  /** P0-B · 활성 workspaceProject 컨테이너 id. null 이면 selector 가 첫 컨테이너 (보통 "general"). */
  projectId: string | null;
}

const HOME_QUERY_KEYS = {
  project: "p",
  category: "c",
  hub: "hub",
  path: "path",
  impact: "impact",
  pulse: "pulse",
  /** workspaceProject container id. `p` 가 이미 selectedSlug 라서 `pj`. shared 의 WORKSPACE_PROJECT_QUERY_KEY 와 동기. */
  projectId: WORKSPACE_PROJECT_QUERY_KEY,
} as const;

const VALID_IMPACT: ProjectImpactMode[] = [
  "none",
  "upstream",
  "downstream",
  "network",
];
const VALID_PULSE: HomePulseMode[] = ["all", "7d", "30d"];

export const DEFAULT_HOME_ROUTE_STATE: HomeRouteState = {
  selectedSlug: null,
  activeCategory: null,
  focusedHubSlug: null,
  featuredPathId: null,
  impactMode: "none",
  pulseMode: "all",
  projectId: null,
};

export function parseHomeRouteState(
  searchParams: URLSearchParams,
): HomeRouteState {
  const impactParam = searchParams.get(HOME_QUERY_KEYS.impact);
  const pulseParam = searchParams.get(HOME_QUERY_KEYS.pulse);

  return {
    selectedSlug: searchParams.get(HOME_QUERY_KEYS.project),
    activeCategory: searchParams.get(HOME_QUERY_KEYS.category),
    focusedHubSlug: searchParams.get(HOME_QUERY_KEYS.hub),
    featuredPathId: searchParams.get(HOME_QUERY_KEYS.path),
    impactMode: VALID_IMPACT.includes(impactParam as ProjectImpactMode)
      ? (impactParam as ProjectImpactMode)
      : DEFAULT_HOME_ROUTE_STATE.impactMode,
    pulseMode: VALID_PULSE.includes(pulseParam as HomePulseMode)
      ? (pulseParam as HomePulseMode)
      : DEFAULT_HOME_ROUTE_STATE.pulseMode,
    projectId: searchParams.get(HOME_QUERY_KEYS.projectId),
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
  setOrDelete(next, HOME_QUERY_KEYS.path, state.featuredPathId);
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
  setOrDelete(next, HOME_QUERY_KEYS.projectId, state.projectId);

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

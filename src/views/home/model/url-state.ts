import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ProjectCategory } from "@/entities/project";
import type { ProjectImpactMode } from "@/entities/project";
import {
  buildInsightsReturnMarker,
  BUSINESS_FLOW_ASK_VALUE,
  ONTOLOGY_DEEPLINK_ASK_KEY,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
} from "@/entities/knowledge-graph";
import {
  parseNodeIntentKind,
  type FirstWordsNodeIntentKind,
} from "@/features/vault-agent";
import {
  parseIndexPanelStateParam,
  type IndexPanelState,
} from "@/widgets/topology-index-panel";

type HomePulseMode = "all" | "7d" | "30d";
export type TopologyAnalysisMode =
  | "overview"
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
  /** `?workbench=edit`. */
  meaningEditorIntent: boolean;
  /** `edit=<relation>:<targetId>`; the entity parser owns the first-colon split. */
  meaningEditParam: string | null;
  /**
   * `?index=`; null when this URL does not say, so the caller's stored preference survives a
   * round-trip.
   */
  indexState: IndexPanelState | null;
  /**
   * `?via=insights:<tab>`: renders the "back to insights" chip. It survives other map interactions
   * and Back navigation, and clears only on the chip's dismiss or a new URL without it; not part of
   * the Esc ladder.
   */
  insightsReturnTab: string | null;
  /** `?review=`, read only with a valid insights `via` marker and preserved with it. */
  insightsReturnReviewId: string | null;
  /**
   * `?ask=`: only the intent kind, since the map composes the sentence and prose does not belong in
   * an address. Never copied into React state; closing the agent panel clears it. Unknown values
   * parse to null.
   */
  askIntent: FirstWordsNodeIntentKind | null;
  // The whole-graph `ask` value, parsed apart from `askIntent` because that type means an intent
  // about one node.
  // Only the name travels; the sentence is rebuilt at the destination, so a shared link carries no
  // folder text.
  askBusinessFlow: boolean;
  /**
   * `?open=`: parents expanded out of their cluster chips; in the URL so a shared link or agent can
   * reproduce it.
   */
  expandedParents: string[];
  /**
   * `?realm=`: only one node's containment subtree, relaid out as a root. Entering clears `p`
   * and `open` (`enterRealmRouteState`), since a realm is a new coordinate system.
   */
  realmSlug: string | null;
  /**
   * `?recent=auto|1|7|30` lights nodes changed in the last N days ("auto" is the adaptive window
   * of `useAdaptiveRecentChanges`). One URL value drives both the INDEX lens and the map, so their
   * windows cannot disagree; null is off.
   */
  recentWindow: RecentSpotlightWindow | null;
  /** Saved constellation id, or `new` to open its editor; vault-scoped. */
  constellationIntent: string | null;
  /**
   * `?view=`; other values drop at parse time. null is the flat map, or on arrival the stored
   * choice decides.
   */
  mapView: HomeMapView | null;
}

/** Every picker view except the flat map, which is the parameter's absence. */
const HOME_MAP_VIEWS = ["territories", "hex", "galaxy", "strata", "coupling"] as const;
export type HomeMapView = (typeof HOME_MAP_VIEWS)[number];

function parseHomeMapView(value: string | null): HomeMapView | null {
  return value !== null && (HOME_MAP_VIEWS as readonly string[]).includes(value) ? (value as HomeMapView) : null;
}

type RecentSpotlightWindow = "auto" | 1 | 7 | 30;

/**
 * The registry's source of truth: `tests/contract/scope-registry.contract.test.ts` requires
 * a `global` or `vault-scoped` tag for every key, so each new key answers "clear on vault change?".
 */
export const HOME_QUERY_KEYS = {
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
  workbench: "workbench",
  edit: "edit",
  index: "index",
  open: "open",
  realm: "realm",
  recent: "recent",
  constellation: "constellation",
  via: ONTOLOGY_DEEPLINK_VIA_KEY,
  review: ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ask: ONTOLOGY_DEEPLINK_ASK_KEY,
  view: "view",
} as const;

/**
 * Keys whose value is a name from one vault (node, project or category slug). Surviving a vault
 * switch leaves them pointing at nothing, which the screen reads as fact: a ghost `p` dims the
 * whole map, and absent `pathFrom`/`pathTo` claim "no path". `hub` has no consumer yet but rides
 * round-trips. `from`/`to` are legacy aliases of `pathFrom`/`pathTo`. Enum keys stay.
 */
export const VAULT_SCOPED_HOME_QUERY_KEYS = [
  "p",
  "c",
  "hub",
  "pathFrom",
  "pathTo",
  "from",
  "to",
  "open",
  "realm",
  "edit",
  "constellation",
] as const;

/**
 * Clears vault-scoped state the moment vault identity changes, so a stale name never crosses the
 * boundary. Path mode falls back to overview, since a path without endpoints claims nothing. Never
 * called on first mount: a `?p=` there was handed over (deep link, handoff, bookmark), and a broken
 * external link is reported honestly, not erased.
 */
export function clearVaultScopedRouteState(current: HomeRouteState): HomeRouteState {
  return {
    ...current,
    selectedSlug: null,
    activeCategory: null,
    focusedHubSlug: null,
    pathSourceSlug: null,
    pathTargetSlug: null,
    expandedParents: [],
    realmSlug: null,
    constellationIntent: null,
    meaningEditorIntent: false,
    meaningEditParam: null,
    analysisMode: current.analysisMode === "path" ? "overview" : current.analysisMode,
  };
}

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
};

/** Only `auto`/`1`/`7`/`30`; anything else is null (off), so no legend has to explain a bad value. */
function parseRecentWindowParam(raw: string | null): RecentSpotlightWindow | null {
  if (raw === "auto") return "auto";
  if (raw === "1") return 1;
  if (raw === "7") return 7;
  if (raw === "30") return 30;
  return null;
}

/** Null removes the parameter. */
function serializeRecentWindowParam(window: RecentSpotlightWindow | null): string | null {
  if (window === null) return null;
  return window === "auto" ? "auto" : String(window);
}

/** Comma split, trimmed, empty and duplicate entries dropped, order kept so round-trips are stable. */
export function parseExpandedParentsParam(
  raw: string | null,
  max: number = MAX_EXPANDED_PARENTS,
): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (slug === "" || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  // A deep link gets the same cap, or one link bypasses it; the tail is kept, like the toggle's
  // LRU eviction.
  const cap = Math.max(1, Math.floor(max));
  return result.length > cap ? result.slice(result.length - cap) : result;
}

/**
 * Caps expanded parents because the multiplier is there: five open parents left ~150 unlabelled
 * nodes. 3 fits a comparison (this, that, where I came from). The user can change it in Settings
 * (1-6); `DEFAULT_EXPAND.maxOpenParents` is the one source.
 */
export const MAX_EXPANDED_PARENTS = DEFAULT_EXPAND.maxOpenParents;

/**
 * Keeps the tail, like `toggleExpandedParent`'s LRU. Separate from parsing
 * because `parseHomeRouteState` knows only the default cap, so the screen applies the user's cap
 * once more.
 */
export function limitExpandedParents(slugs: readonly string[], max: number): string[] {
  const cap = Math.max(1, Math.floor(max));
  return slugs.length > cap ? slugs.slice(slugs.length - cap) : [...slugs];
}

/**
 * Collapsing always works; expanding past the cap closes the longest-open parent (LRU), because an
 * ignored click reads as broken with nowhere to explain why.
 */
export function toggleExpandedParent(
  current: readonly string[],
  parentId: string,
  max: number = MAX_EXPANDED_PARENTS,
): string[] {
  if (current.includes(parentId)) {
    return current.filter((id) => id !== parentId);
  }
  const next = [...current, parentId];
  // Array order is expansion order (append-only).
  const cap = Math.max(1, Math.floor(max));
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * Child id to parent id over `contains` edges, so a deep-link focus can walk the ancestors a
 * density gate folded. The first of several parents wins: one valid chain reveals the target. O(E).
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
 * Appends every `contains` ancestor of `targetId` nearest-first, skipping expanded ones; a visited
 * set blocks cycles. O(depth). HomePage applies it once on load and round-trips the URL.
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
 * A realm is a new coordinate system, so selection (`p`), expansion (`open`) and path source clear.
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

/** Also clears the selection. */
export function exitRealmRouteState(current: HomeRouteState): HomeRouteState {
  return { ...current, realmSlug: null, selectedSlug: null, focusedHubSlug: null };
}

/**
 * Node ids are `kind:slug`, so a hand-typed bare slug matched nothing and showed a raw chip.
 * Returns the exact id, else the canonical id for a bare slug, else null (the caller hides the
 * chip).
 */
export function resolveRealmNodeId(
  realmSlug: string | null,
  nodeIds: Iterable<string>,
): string | null {
  if (!realmSlug) return null;
  const hasKindPrefix = realmSlug.includes(":");
  let bareMatch: string | null = null;
  for (const id of nodeIds) {
    if (id === realmSlug) return id;
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
  // A deep link honours its stated mode: selectedSlug never promotes to focus at parse time.
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
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams.get(HOME_QUERY_KEYS.via),
  );
  const workbench = searchParams.get(HOME_QUERY_KEYS.workbench);
  const meaningEditorIntent = workbench === "edit";

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
    createNodeIntent:
      searchParams.get(HOME_QUERY_KEYS.create) === "concept" || workbench === "create",
    meaningEditorIntent,
    meaningEditParam: meaningEditorIntent
      ? searchParams.get(HOME_QUERY_KEYS.edit)
      : null,
    indexState: parseIndexPanelStateParam(searchParams.get(HOME_QUERY_KEYS.index)),
    insightsReturnTab,
    insightsReturnReviewId: insightsReturnTab
      ? searchParams.get(HOME_QUERY_KEYS.review)
      : null,
    askIntent: parseNodeIntentKind(searchParams.get(HOME_QUERY_KEYS.ask)),
    askBusinessFlow: searchParams.get(HOME_QUERY_KEYS.ask) === BUSINESS_FLOW_ASK_VALUE,
    expandedParents: parseExpandedParentsParam(
      searchParams.get(HOME_QUERY_KEYS.open),
    ),
    realmSlug: searchParams.get(HOME_QUERY_KEYS.realm) || null,
    recentWindow: parseRecentWindowParam(searchParams.get(HOME_QUERY_KEYS.recent)),
    constellationIntent: searchParams.get(HOME_QUERY_KEYS.constellation) || null,
    mapView: parseHomeMapView(searchParams.get(HOME_QUERY_KEYS.view)),
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
    meaningEditorIntent: false,
    meaningEditParam: null,
    // A click only selects and never changes mode: auto-promotion stacked select, expand, relayout
    // and fit on one click. Focus comes only from a card badge, double click or deep link.
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
    meaningEditorIntent: false,
    meaningEditParam: null,
  };
}

/**
 * The one entry for a canvas node click. In path mode without a source the node becomes the source;
 * with a source a different node becomes (or replaces) the target; anything else is ordinary
 * selection. Routing path clicks through ordinary selection left `pathTargetSlug` empty and the
 * copy button hidden.
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
  next.delete(HOME_QUERY_KEYS.create);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.workbench,
    state.meaningEditorIntent
      ? "edit"
      : state.createNodeIntent
        ? "create"
        : null,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.edit,
    state.meaningEditorIntent ? state.meaningEditParam : null,
  );
  setOrDelete(next, HOME_QUERY_KEYS.index, state.indexState);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.open,
    state.expandedParents.length > 0 ? state.expandedParents.join(",") : null,
  );
  setOrDelete(next, HOME_QUERY_KEYS.realm, state.realmSlug);
  setOrDelete(next, HOME_QUERY_KEYS.recent, serializeRecentWindowParam(state.recentWindow));
  setOrDelete(next, HOME_QUERY_KEYS.constellation, state.constellationIntent);
  setOrDelete(next, HOME_QUERY_KEYS.view, state.mapView);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.ask,
    state.askBusinessFlow ? BUSINESS_FLOW_ASK_VALUE : state.askIntent,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.via,
    state.insightsReturnTab
      ? buildInsightsReturnMarker(state.insightsReturnTab)
      : null,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.review,
    state.insightsReturnTab ? state.insightsReturnReviewId : null,
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

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ProjectCategory } from "@/entities/project";
import type { ProjectImpactMode } from "@/entities/project";
import {
  buildInsightsReturnMarker,
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

export type HomePulseMode = "all" | "7d" | "30d";
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
  /** URL intent that opens the in-map meaning editor (`?workbench=edit`). */
  meaningEditorIntent: boolean;
  /** `edit=<relation>:<targetId>` — the entity parser owns the first-colon split. */
  meaningEditParam: string | null;
  /**
   * INDEX panel expand/collapse deep-link intent
   * (`?index=expanded|collapsed`). `null` = not specified in THIS url — the
   * caller (HomePage) falls back to the localStorage preference, then the
   * "expanded" default (`resolveIndexPanelState`,
   * `@/widgets/topology-index-panel`). Kept nullable rather than defaulting
   * here so a URL round-trip never clobbers a preference the URL didn't ask
   * to change.
   */
  indexState: IndexPanelState | null;
  /**
   * Deep-link return marker from insights (`?via=insights:<tab>`) — the value
   * is the insights tab slug the user came from. Non-null makes HomePage
   * render a "back to insights" chip in the top-centre chrome row.
   *
   * Lifetime: the marker lives in the URL and survives round-trips through
   * other map interactions (node click, mode switch). The affordance exists
   * for exactly the moment when navigating deeper has made browser Back
   * useless. It is removed only by an explicit dismiss (the chip's X) or by
   * entering a new URL without it. Clicking the chip to return does **not**
   * clear it — arriving back on the map via Back is the same deep-link
   * context, so the chip belongs there again. It does not take part in the
   * Esc ladder.
   */
  insightsReturnTab: string | null;
  /**
   * The exact review row id (`?review=`) the visit started from in the to-do
   * queue. Read only when a valid insights `via` marker is present, and
   * preserved with it across map interactions.
   */
  insightsReturnReviewId: string | null;
  /**
   * Marks a jump from an insights queue row via "ask the agent in words"
   * (`?ask=missing-definition`, …). The value is the **kind of intent** only;
   * the sentence is composed by the map's first-words generator, because a
   * human-readable sentence does not belong in an address.
   *
   * The URL is the state. It is never copied into React state, so "is it open"
   * and "what will it ask" live in one place, and closing the agent panel
   * clears this too (re-opening after a close would be a defect). Unknown
   * values are demoted to null at parse time.
   */
  askIntent: FirstWordsNodeIntentKind | null;
  /**
   * Density gate — the parent slugs the user expanded out of the cluster chips
   * they were folded into (`?open=slug1,slug2`). A parent with more children
   * than the threshold (12) is collapsed by default on the map; only parents
   * listed here reveal their children. It lives in the URL so a shared link or
   * an agent can reproduce and read what is expanded (matching `design.md`
   * 「나머지는 클릭 시 expand」 — the rest expands on click). HomePage converts
   * it to a Set on the way down to the map.
   */
  expandedParents: string[];
  /**
   * Realm view (`?realm=slug`) — the map switched into the world of one node:
   * only that node's containment subtree remains, with the node relaid out as
   * a temporary root. It lives in the URL so a shared link or an agent can
   * reproduce and read which realm is open. Entering clears the existing `p`
   * (selection) and `open` (density-gate expansion) via
   * `enterRealmRouteState` — a realm is a new coordinate system, so the
   * previous expansion means nothing.
   */
  realmSlug: string | null;
  /**
   * Recent-change spotlight (`?recent=auto|1|7|30`, council design
   * 2026-07-23) — non-null puts the map in a lens mode that lights nodes whose
   * disk file changed in the last N days on the fresh channel and sinks the
   * rest. `"auto"` lets the existing adaptive window pick
   * (`useAdaptiveRecentChanges`, 7→3→1 days); a number pins it. It lives in the
   * URL so a shared link or an agent reproduces the same window a person saw,
   * and so the INDEX lens and the map's sinking are driven from a **single
   * source** (this one value) — that makes a window mismatch between the two
   * surfaces structurally impossible. null = off (parameter absent).
   */
  recentWindow: RecentSpotlightWindow | null;
}

/** Spotlight window — "auto" (adaptive) or an explicit day preset. */
export type RecentSpotlightWindow = "auto" | 1 | 7 | 30;

/**
 * The map's address vocabulary — **this object is the registry's source of
 * truth.**
 *
 * `tests/contract/scope-registry.contract.test.ts` requires a `global` /
 * `vault-scoped` tag for every key here, so adding a key fails that test
 * first. Without the tag nobody asks "must this be cleared when the vault
 * changes?", and that unasked question is where out-of-scope state is born.
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
  via: ONTOLOGY_DEEPLINK_VIA_KEY,
  review: ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ask: ONTOLOGY_DEEPLINK_ASK_KEY,
} as const;

/**
 * **Address keys that only mean something inside one vault** — their value is
 * a *name* from that vault (node slug, project slug, category), so the moment
 * the vault changes the name points at nothing.
 *
 * ## Why a separate list is needed (repaired 2026-08-01)
 *
 * The other keys (`mode` · `impact` · `pulse` · `index` · `recent` · `create` ·
 * `via` · `review` · `ask`) are **fixed enumerations** and mean the same thing
 * in any vault, so surviving a vault switch is right for them. Only the keys
 * in this list differ — surviving leaves them **pointing at something that
 * does not exist**, and the screen reads that as fact:
 *
 * - `p` — judged as a selected ghost node, so the whole map dimmed (ego focus
 *   only looked at `focusedNodeId !== null`, never at existence). The same
 *   slug also killed the first-visit hint permanently.
 * - `pathFrom`/`pathTo` — with two nodes absent from this vault, the screen
 *   asserted **"no path"**. The truth was "neither is here"; the screen said
 *   "both are here and unconnected".
 * - `hub` — zero consumers today, but the parser reads it and it rides URL
 *   round-trips. Registered now because it becomes the same defect the day a
 *   consumer appears.
 * - `c` · `open` · `realm` — same axis (slug values).
 *
 * `from`/`to` are legacy aliases of `pathFrom`/`pathTo` and get the same
 * treatment.
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
] as const;

/**
 * Clears vault-scoped address state **at the moment** vault identity changes.
 *
 * This is the cause fix, not the symptom fix. Defending on every screen ("does
 * this slug exist?") leaves the stale slug alive; clearing it the moment the
 * name loses meaning stops it crossing the vault boundary at all, so every
 * false judgement downstream disappears **structurally**.
 *
 * Path mode falls back to overview because both endpoints are gone — a "path"
 * mode with no endpoints is an empty claim in itself.
 *
 * ⚠️ Never called on first mount. The `?p=` there is not a leftover, it is
 * **something someone handed over** (deep link, agent handoff, bookmark). A
 * broken link from outside is something to say honestly, not erase silently.
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
  expandedParents: [],
  realmSlug: null,
  recentWindow: null,
};

/**
 * Spotlight — parses `?recent=`. Only `auto`/`1`/`7`/`30` are valid; anything
 * else, or absence, is null (off). A bad value is demoted to off rather than
 * polluting state with something no legend can explain.
 */
export function parseRecentWindowParam(raw: string | null): RecentSpotlightWindow | null {
  if (raw === "auto") return "auto";
  if (raw === "1") return 1;
  if (raw === "7") return 7;
  if (raw === "30") return 30;
  return null;
}

/** Spotlight window → URL value (null removes the parameter). */
export function serializeRecentWindowParam(window: RecentSpotlightWindow | null): string | null {
  if (window === null) return null;
  return window === "auto" ? "auto" : String(window);
}

/**
 * Density gate — parses `?open=`: comma split, trimmed, empty entries ignored,
 * duplicates removed. Appearance order is preserved so round-trips are stable.
 */
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
  // A deep link gets the same cap — otherwise one link bypasses it and the
  // recipient sees a worse screen than the sender. **The tail is kept** (same
  // direction as the toggle's LRU eviction: what was written later is the more
  // recent intent).
  const cap = Math.max(1, Math.floor(max));
  return result.length > cap ? result.slice(result.length - cap) : result;
}

/**
 * How many parents may stay expanded at once.
 *
 * **Why a cap exists** — the child count of **one** parent is already limited
 * (a batch of 24 plus `+N more`). The number of *expanded parents* had no
 * limit at all, so nodes on screen multiplied with every parent piled into
 * `?open=`. Owner measurement (2026-07-31 screenshot): expanding 5 parents
 * left ~150 nodes carrying **2 labels** — the rest were identical,
 * unidentifiable rectangles. The map's only job is "what is where", and there
 * it could not answer.
 *
 * The limit is on **parent count** because that is where the multiplier is.
 * Shrinking the batch size would make looking at a single parent worse, while
 * what actually broke the screen was the **sum across parents**, not any one
 * of them.
 *
 * 3 is a human number, not a pixel one — a comparison is usually two (this vs
 * that) plus one "where did I come from". From the fourth on it is
 * accumulation, not comparison.
 *
 * **The user can now move this value** (Settings → 「확장 → 동시에 펼쳐 둘
 * 부모」 (expansion → parents open at once), 1–6). The paragraphs above remain
 * the rationale for the **default**, and the single source is the settings
 * side (`DEFAULT_EXPAND.maxOpenParents`) — the same number is not written in
 * two places.
 */
export const MAX_EXPANDED_PARENTS = DEFAULT_EXPAND.maxOpenParents;

/**
 * Caps an already-resolved list — **keeping the tail** (same direction as
 * `toggleExpandedParent`'s LRU eviction: what was written later is the more
 * recent intent).
 *
 * Why this is separate from parsing: `parseHomeRouteState` is a pure function
 * that knows nothing about settings and can only apply the default cap, so a
 * deep-linked list got through **without passing the cap the user had set**
 * (measured 2026-08-02: a screen with "parents open at once" set to 1 expanded
 * three parents from a single link). The place that knows the cap — the screen
 * — filters once more.
 */
export function limitExpandedParents(slugs: readonly string[], max: number): string[] {
  const cap = Math.max(1, Math.floor(max));
  return slugs.length > cap ? slugs.slice(slugs.length - cap) : [...slugs];
}

/**
 * Cluster expansion toggle — collapsing always works; expanding past the cap
 * **closes the parent that has been open longest** (LRU).
 *
 * The point is that an overflowing click is **not ignored**. A press that does
 * nothing reads as broken, and there is nowhere to explain why. Closing the
 * oldest is what a person actually does on a crowded workbench, so it is easy
 * to learn.
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
  // Drop from the front — array order is expansion order (it is append-only).
  const cap = Math.max(1, Math.floor(max));
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * Builds a child id → parent id lookup from one-directional contains edges, so
 * a deep-link focus dive can walk an ancestor chain: when the density gate
 * (`model/density-gate.ts`) has folded a parent past its threshold and the
 * `?p=slug` target sits inside that folded subtree, the ancestors must be
 * expanded to reveal it. If a child has more than one contains parent (rare)
 * the first one wins — one valid chain is enough to reveal the target. Pure
 * and deterministic.
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
 * Returns `currentExpanded` plus every contains ancestor of `targetId`. The
 * target itself is not a parent, so it is not added; its parent, grandparent, …
 * are appended nearest-first, which keeps the `?open=` round-trip stable.
 * Already-expanded ancestors are not re-added and cycles are blocked by a
 * visited set. With nothing to add (no target / top level / all already
 * expanded) it returns an equal new array. Pure — HomePage applies it once on
 * load and round-trips the URL, after which the existing focus dive fires once
 * with the same easing grammar as a click.
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
 * Enters the realm view — switches the map into the world of the `slug` node.
 * A realm is a new coordinate system, so the previous selection (`p`),
 * density-gate expansion (`open`) and path source are cleared. Pure —
 * HomePage round-trips the URL.
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

/** Leaves the realm view — back to the whole map (`?realm=` removed), clearing the selection too. */
export function exitRealmRouteState(current: HomeRouteState): HomeRouteState {
  return { ...current, realmSlug: null, selectedSlug: null, focusedHubSlug: null };
}

/**
 * Resolves a `?realm=` value to a real node id. Node ids live in a `kind:slug`
 * space (e.g. `capability:mcp-server`), so a bare slug typed by hand
 * (`?realm=ai-agent-partner`, no kind prefix) matched no node and the screen
 * silently rendered a raw chip over the whole map. Returns (1) the exact id if
 * one matches, (2) the canonical `<kind>:<slug>` id for a bare slug, (3) null
 * otherwise. On null the caller hides the chip and does not activate the realm
 * — explicit non-resolution rather than a silent fallback. Pure; `nodeIds` is
 * the list of canonical node ids.
 */
export function resolveRealmNodeId(
  realmSlug: string | null,
  nodeIds: Iterable<string>,
): string | null {
  if (!realmSlug) return null;
  const hasKindPrefix = realmSlug.includes(":");
  let bareMatch: string | null = null;
  for (const id of nodeIds) {
    if (id === realmSlug) return id; // Exact match wins.
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
  // A deep link honours the mode it states: selectedSlug alone never promotes
  // to focus at parse time. Click selection promotes only in
  // selectTopologyNodeRouteState below, keeping load and interaction separate.
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
    meaningEditorIntent: false,
    meaningEditParam: null,
    // Click = selection (safe navigation) only — mode never changes, in any
    // mode. The old overview→focus auto-promotion stacked
    // [select + expand + relayout + camera fit] onto one click and erased
    // causality. Owner: "클릭하면 그냥 바뀌어서 헷갈린다" (clicking just
    // changes things and it is confusing). Expansion (focus) happens only on
    // explicit intent: card badge, double click, or deep link.
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
 * The single entry point for a canvas node click — branches on path mode
 * between `selectTopologyNodeRouteState` (ordinary selection) and
 * `selectTopologyPathRouteState` (fixing the path source/target).
 *
 * Persona QA finding: `HomePage.tsx`'s `handleSelect` used to ignore
 * analysisMode and always take the ordinary-selection route, so in path mode a
 * second click never filled `pathTargetSlug`. The canvas drew the newly
 * selected node's ego neighbourhood, which looked like a confirmed path, while
 * `TopologyPathChip` strictly requires `pathTargetSlug` and stayed pinned to
 * "pick a target" — the path packet copy button never appeared.
 *
 * Rule: path mode + no source → the clicked node becomes the source. Path mode
 * + source fixed + a different node clicked → that node becomes the target
 * (clicking again swaps the target, keeping the reselection flow). Anything
 * else (overview/focus/health, or clicking the source node again) → ordinary
 * selection.
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
  setOrDelete(next, HOME_QUERY_KEYS.ask, state.askIntent);
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

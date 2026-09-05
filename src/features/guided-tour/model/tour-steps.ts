/**
 * The guided tour's declarative step array. The map screen's (/) surface
 * dedicated to meaning literacy — eight steps, with the non-developer persona
 * (1–7) as the default and step 8 reached by choosing "I'm a developer" at step 7.
 *
 * An anchor is either a testid string (DOM) or a canvas-node (canvas projection).
 * This file imports no widgets or views (FSD forbids feature → widgets). The
 * actual DOM and canvas resolution belongs to `resolve-anchor-rect.ts` (testid)
 * and to HomePage/TopologyMapV2 (canvas-node).
 */

export type TourPersona = "all" | "dev";

export type TourAnchor =
  | { type: "testid"; value: string }
  /**
   * The canvas node anchor. `domain` is a correction from "hub" (measured
   * 2026-07-23): an isHub node is folded into a "+N" cluster chip in the spine
   * view, so clicking it triggered cluster expansion (a full map relayout) rather
   * than selection. A domain is always visible at the spine tier and clicking it
   * selects (opening the datasheet), which keeps step 4's interactive promise —
   * "press it and a card opens" — deterministic.
   */
  | { type: "canvas-node"; target: "project" | "domain" }
  | null;

export interface TourStep {
  id: string;
  anchor: TourAnchor;
  /** The interactive step (4) — waits for a real node click instead of [next]. */
  interactive?: boolean;
  persona: TourPersona;
  /** The copy key leading to `guidedTour.steps.<copyKey>` in `messages/*.json`. */
  copyKey: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "welcome", anchor: null, persona: "all", copyKey: "welcome" },
  {
    id: "nodes",
    anchor: { type: "canvas-node", target: "project" },
    persona: "all",
    copyKey: "nodes",
  },
  {
    id: "relations",
    // The relationship legend moved to the permanent corner's pull-only 「?」 help. This step
    // is the central explanation for reading line meanings while viewing the entire map, so it does not point at a specific DOM box.
    anchor: null,
    persona: "all",
    copyKey: "relations",
  },
  {
    id: "try-click",
    anchor: { type: "canvas-node", target: "domain" },
    interactive: true,
    persona: "all",
    copyKey: "tryClick",
  },
  {
    id: "datasheet",
    anchor: { type: "testid", value: "topology-v2-detail-panel" },
    persona: "all",
    copyKey: "datasheet",
  },
  {
    id: "index",
    anchor: { type: "testid", value: "topology-index-panel" },
    persona: "all",
    copyKey: "index",
  },
  {
    id: "recent",
    anchor: { type: "testid", value: "topology-spotlight-toggle" },
    persona: "all",
    copyKey: "recent",
  },
  {
    id: "agent",
    anchor: { type: "testid", value: "first-run-starter" },
    persona: "dev",
    copyKey: "agent",
  },
];

/**
 * Per-destination guides (owner request 2026-07-26: "Each LNB tab should have its own guide; right now only the map does).
 *
 * **No second guidance system is built** — the tour mechanism the map already
 * used is reused as is, with only the step array differing per destination. The
 * card, scrim, cutout, progress dots, and skip/replay contracts must be identical
 * across every screen so the grammar a user learns once is reused.
 *
 * Each destination is **two pages** — ① what this screen is for (no anchor, a
 * centred card) ② the one thing to look at first here (spotlighting a real
 * element). It answers only "what can I do here", not a feature list. If ②'s
 * anchor is not on screen at that moment (the document list is collapsed, say),
 * `computeVisibleSteps` removes it automatically and the guidance folds to one page.
 *
 * The map is not here — its eight-step journey uses canvas node anchors, an
 * interactive click, and the developer branch, so `TOUR_STEPS` keeps owning it.
 */
export type DestinationTourId =
  | "architecture"
  | "docs"
  | "insights"
  | "projects"
  | "agents"
  | "mcp"
  | "git";

export const DESTINATION_TOURS: Record<DestinationTourId, readonly TourStep[]> = {
  architecture: [
    { id: "architecture-what", anchor: null, persona: "all", copyKey: "architectureWhat" },
    {
      id: "architecture-blueprint",
      anchor: { type: "testid", value: "architecture-blueprint" },
      persona: "all",
      copyKey: "architectureBlueprint",
    },
  ],
  docs: [
    { id: "docs-what", anchor: null, persona: "all", copyKey: "docsWhat" },
    {
      id: "docs-list",
      anchor: { type: "testid", value: "docs-vault-doc-list" },
      persona: "all",
      copyKey: "docsList",
    },
  ],
  /*
   * Agents — a destination added 2026-08-20 (ledger 90). Two pages: what this
   * screen does, and where to press when there is no tool.
   */
  agents: [
    { id: "agents-what", anchor: null, persona: "all", copyKey: "agentsWhat" },
    {
      id: "agents-check",
      anchor: { type: "testid", value: "app-settings-runtimes-recheck" },
      persona: "all",
      copyKey: "agentsCheck",
    },
  ],
  /*
   * MCP — a destination added 2026-09-05. Two pages: what this screen is for, and the tab strip,
   * because the second half of the screen (the connectors) is behind a tab and a person who never
   * presses it never learns it is there. Anchoring on the strip rather than on either panel keeps
   * the guide correct whichever tab the URL opened.
   */
  mcp: [
    { id: "mcp-what", anchor: null, persona: "all", copyKey: "mcpWhat" },
    {
      id: "mcp-tabs",
      anchor: { type: "testid", value: "mcp-tabs" },
      persona: "all",
      copyKey: "mcpTabs",
    },
  ],
  insights: [
    { id: "insights-what", anchor: null, persona: "all", copyKey: "insightsWhat" },
    {
      id: "insights-today",
      anchor: { type: "testid", value: "do-next-touchups" },
      persona: "all",
      copyKey: "insightsToday",
    },
  ],
  projects: [
    { id: "projects-what", anchor: null, persona: "all", copyKey: "projectsWhat" },
    {
      id: "projects-card",
      anchor: { type: "testid", value: "project-selector-card" },
      persona: "all",
      copyKey: "projectsCard",
    },
  ],
  git: [
    { id: "git-what", anchor: null, persona: "all", copyKey: "gitWhat" },
    {
      id: "git-changes",
      anchor: { type: "testid", value: "atlas-git-panel" },
      persona: "all",
      copyKey: "gitChanges",
    },
  ],
};

export interface VisibleStepsContext {
  persona: TourPersona;
  /** Did a real selection occur at step 4 — false skips step 5 (datasheet). */
  hasSelection: boolean;
  /** Can the anchor resolve right now (false if the element is absent, `display:none`, or off-viewport). */
  canResolveAnchor: (anchor: TourAnchor) => boolean;
}

/**
 * The step skip rules: a step whose `canResolveAnchor` is false is excluded
 * automatically, and the progress denominator (`visibleSteps.length`) shrinks
 * accordingly. `datasheet` is included only when a selection actually occurred at
 * step 4 (excluded on a failed selection or a skip). `agent` is included only when
 * `persona === 'dev'`.
 */
export function computeVisibleSteps(
  steps: readonly TourStep[],
  ctx: VisibleStepsContext,
): TourStep[] {
  return steps.filter((step) => {
    if (step.persona === "dev" && ctx.persona !== "dev") return false;
    if (step.id === "datasheet" && !ctx.hasSelection) return false;
    if (step.anchor === null) return true;
    return ctx.canResolveAnchor(step.anchor);
  });
}

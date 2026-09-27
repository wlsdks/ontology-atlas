/**
 * The map tour's declarative steps: eight, persona "all" for 1–7 and step 8 after choosing
 * "I'm a developer". An anchor is a testid (resolved in `resolve-anchor-rect.ts`) or a canvas
 * node (HomePage/OntologyMap); no widget imports (FSD).
 */

export type TourPersona = "all" | "dev";

export type TourAnchor =
  | { type: "testid"; value: string }
  /**
   * `domain`, not a hub: a hub folds into a "+N" cluster chip at the spine tier and clicking it
   * relayouts, while a domain is always visible and its click opens the datasheet.
   */
  | { type: "canvas-node"; target: "project" | "domain" }
  | null;

export interface TourStep {
  id: string;
  anchor: TourAnchor;
  /** Step 4 waits for a real node click instead of [next]. */
  interactive?: boolean;
  persona: TourPersona;
  /** Leads to `guidedTour.steps.<copyKey>` in `messages/*.json`. */
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
    // The central explanation of line meanings while viewing the whole map, so no DOM box.
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
    anchor: { type: "testid", value: "map-detail-panel" },
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
 * Per-destination guides reusing the map tour mechanism, so card, scrim, cutout, dots and
 * skip/replay behave the same everywhere. Two pages each: what the screen is for (centred),
 * and the one element to look at first; `computeVisibleSteps` folds to one page when that
 * anchor is absent. The map keeps its own journey in `TOUR_STEPS`.
 */
export type DestinationTourId =
  | "architecture"
  | "docs"
  | "library"
  | "automations"
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
   * What this screen does, and where to press when there is no tool.
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
   * The tab strip, because the connectors sit behind a tab; anchoring on the strip is right
   * whichever tab the URL opened.
   */
  mcp: [
    { id: "mcp-what", anchor: null, persona: "all", copyKey: "mcpWhat" },
    {
      id: "mcp-tabs",
      anchor: { type: "testid", value: "agents-tabs" },
      persona: "all",
      copyKey: "mcpTabs",
    },
  ],
  /*
   * Sources, not Wiki: Sources is drawn in every reachable state, and an absent anchor folds
   * the guide to one page.
   */
  library: [
    { id: "library-what", anchor: null, persona: "all", copyKey: "libraryWhat" },
    {
      id: "library-sources",
      anchor: { type: "testid", value: "library-sources" },
      persona: "all",
      copyKey: "librarySources",
    },
  ],
  automations: [
    { id: "automations-what", anchor: null, persona: "all", copyKey: "automationsWhat" },
    {
      id: "automations-tabs",
      anchor: { type: "testid", value: "automations-tabs" },
      persona: "all",
      copyKey: "automationsTabs",
    },
  ],
  /*
   * The headline the screen opens on. `tests/contract/tour-anchor-testids.contract.test.ts`
   * catches a testid no screen carries but not which tab is open, so this anchor must be on
   * the landing tab.
   */
  insights: [
    { id: "insights-what", anchor: null, persona: "all", copyKey: "insightsWhat" },
    {
      id: "insights-headline",
      anchor: { type: "testid", value: "brief-headline" },
      persona: "all",
      copyKey: "insightsHeadline",
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
  /** False skips step 5 (datasheet). */
  hasSelection: boolean;
  /** False when the element is absent, `display:none` or off-viewport. */
  canResolveAnchor: (anchor: TourAnchor) => boolean;
}

/**
 * Excludes steps whose anchor cannot resolve, so the progress denominator shrinks;
 * `datasheet` needs a real selection at step 4 and `agent` needs `persona === 'dev'`.
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

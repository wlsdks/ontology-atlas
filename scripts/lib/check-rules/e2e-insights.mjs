/** Playwright specs that drive the insights board. */

export const rules = [
  {
    order: 750,
    // The installed app's probe and its payload contract can drift away from this board in
    // silence: nothing else runs them against real HTML, so the first sign is a failed
    // verification eight minutes into a bundle build (measured 2026-09-20, when a pinned tab
    // count became unreachable). This spec runs both over the rendered screen in seconds.
    command: 'pnpm exec playwright test tests/e2e/insights-app-contract.spec.ts',
    reason: 'the insights board, the app DOM probe, or the payload contract that judges it changed',
    matches: [
      /^src-tauri\/src\/webview_verify\/dom_marker_probe\.js$/,
      /^scripts\/lib\/verify-macos\/payload-contract\.mjs$/,
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/lib\/insights-tab-state\.ts$/,
    ],
  },
  {
    order: 760,
    /*
     * A control that exists on one subject only is invisible to a gate that loads the bare
     * route. The touch-target contract waited 20 seconds for a tab row the brief correctly does
     * not draw and went red with no defect behind it (2026-09-20), and nothing recommended it
     * for a change to this board.
     */
    command: 'pnpm exec playwright test tests/e2e/touch-target-contract.spec.ts',
    reason: 'a control on the insights board, the census strip, or a shared control primitive changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/tabs\/BriefTab\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/parts\/InsightsCensusStrip\.tsx$/,
      /^src\/shared\/ui\/tab-bar\.tsx$/,
      /^src\/shared\/ui\/segmented-control\.tsx$/,
    ],
  },
  {
    order: 770,
    // The census strip is drawn for one subject only, so wherever it sits it can push the
    // control a reader just clicked (measured 2026-09-20: 188px, at both 1512 and 1920).
    command: 'pnpm exec playwright test tests/e2e/insights-board-stability.spec.ts',
    reason: 'the insights subject row, its census strip, or the panel between them changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/parts\/InsightsCensusStrip\.tsx$/,
      /^src\/shared\/ui\/segmented-control\.tsx$/,
    ],
  },
  {
    order: 780,
    command: 'pnpm exec playwright test tests/e2e/insights-badge-agreement.spec.ts',
    reason: 'insights census rendering or its domain-capacity consumer changed',
    matches: [
      /^src\/shared\/lib\/use-count-up\.ts$/,
      /^src\/views\/ontology-insights\/lib\/census-health\.ts$/,
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/parts\/InsightsHeroCensus\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/tabs\/OverviewTab\.tsx$/,
      /^src\/widgets\/domain-capacity-bar\/ui\/DomainCapacityBar\.tsx$/,
    ],
  },
];

/** Playwright specs that drive the insights board. */

export const rules = [
  {
    order: 750,
    // The app probe and its payload contract drift silently from this board unless run against real
    // HTML; this spec runs both over the rendered screen.
    command: 'pnpm exec playwright test tests/e2e/insights/insights-app-contract.spec.ts',
    reason: 'the insights board, the app DOM probe, or a module the payload contract loads changed',
    matches: [
      /^src-tauri\/src\/webview_verify\/dom_marker_probe\.js$/,
      /^scripts\/lib\/verify-macos\/[^/]+\.mjs$/,
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/lib\/insights-tab-state\.ts$/,
    ],
  },
  {
    order: 760,
    /*
     * A control present on one subject only is invisible to a gate that loads the bare route, so a
     * change to this board must run the touch-target contract.
     */
    command: 'pnpm exec playwright test tests/e2e/gateway/touch-target-contract.spec.ts',
    reason: 'a control on the insights board or a shared control primitive changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/tabs\/BriefTab\.tsx$/,
      /^src\/shared\/ui\/controls\/tab-bar\.tsx$/,
      /^src\/shared\/ui\/fields\/segmented-control\.tsx$/,
    ],
  },
  {
    order: 770,
    // A strip drawn for one subject only pushes the control a reader just clicked; the spec keeps the
    // evidence in view.
    command: 'pnpm exec playwright test tests/e2e/insights/insights-board-stability.spec.ts',
    reason: 'the insights subject row or the panel below it changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/analysis\/AnalysisWorkspace\.tsx$/,
      /^src\/shared\/ui\/fields\/segmented-control\.tsx$/,
    ],
  },
  {
    order: 780,
    command: 'pnpm exec playwright test tests/e2e/insights/insights-badge-agreement.spec.ts',
    reason: 'the insights analysis counts or the witnesses they name changed',
    matches: [
      /^src\/views\/ontology-insights\/lib\/analysis-model\.ts$/,
      /^src\/views\/ontology-insights\/ui\/OntologyInsightsPage\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/analysis\/AnalysisWorkspace\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/analysis\/PairRail\.tsx$/,
    ],
  },
];

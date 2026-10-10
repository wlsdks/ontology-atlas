export const rules = [
  {
    order: 5200,
    command: 'pnpm exec playwright test tests/e2e/agent-composer-footer-width.spec.ts',
    reason: "the agent composer footer's picker width across the panel's drag range changed",
    matches: [
      /^src\/widgets\/acp-chat-panel\/ui\/AcpChatPanel\.tsx$/,
    ],
  },
  {
    order: 5201,
    command: 'pnpm exec playwright test tests/e2e/agent-footer-running-turn.spec.ts',
    reason: "the agent composer footer's pieces overlapping while a turn runs changed",
    matches: [
      /^src\/widgets\/acp-chat-panel\/ui\/AcpChatPanel\.tsx$/,
      /^src\/widgets\/acp-chat-panel\/ui\/AcpPermissionCard\.tsx$/,
    ],
  },
  {
    order: 5202,
    command: 'pnpm exec playwright test tests/e2e/app-chrome-layout.spec.ts',
    reason: 'the app nav rail, settings trigger or vault switcher layout changed',
    matches: [
      /^src\/widgets\/app-nav-rail\/ui\/AppNavRail\.tsx$/,
      /^src\/features\/vault-switch\/ui\/VaultSwitchRailTile\.tsx$/,
      /^src\/features\/vault-switch\/lib\/switcher-placement\.ts$/,
    ],
  },
  {
    order: 5203,
    command: 'pnpm exec playwright test tests/e2e/architecture-role-ledger.spec.ts',
    reason: "the architecture graph's role ledger and evidence rail layout changed",
    matches: [
      /^src\/views\/architecture\/ui\/ArchitectureWorkbench\.tsx$/,
      /^src\/views\/architecture\/ui\/ArchitectureSketch\.tsx$/,
      /^src\/views\/architecture\/ui\/ArchitectureEvidenceRail\.tsx$/,
      /^src\/views\/architecture\/ui\/ArchitectureRoleDetail\.tsx$/,
    ],
  },
  {
    order: 5204,
    command: 'pnpm exec playwright test tests/e2e/chat-answer-overflow-edge.spec.ts',
    reason: 'the edge cue on a fenced block that overflows the agent panel changed',
    matches: [
      /^src\/widgets\/acp-chat-panel\/ui\/AcpChatPanel\.tsx$/,
    ],
  },
  {
    order: 5205,
    command: 'pnpm exec playwright test tests/e2e/download-conduction.spec.ts',
    reason: "the download page's conduction figure changed",
    matches: [
      /^src\/views\/download\/ui\/ConductionFigure\.tsx$/,
      /^src\/views\/download\/ui\/ConductionScene\.tsx$/,
    ],
  },
  {
    order: 5206,
    command: 'pnpm exec playwright test tests/e2e/download-hero-echo.spec.ts',
    reason: "the download hero's typing echo and caption changed",
    matches: [
      /^src\/views\/download\/ui\/HeroAtlas\.tsx$/,
      /^src\/views\/download\/ui\/HeroObject\.tsx$/,
      /^src\/views\/download\/ui\/HeroTypewriter\.tsx$/,
    ],
  },
  {
    order: 5207,
    command: 'pnpm exec playwright test tests/e2e/download-scroll-budget.spec.ts',
    reason: "the download page's scroll frame budget changed",
    matches: [
      /^src\/views\/download\/ui\/DownloadPage\.tsx$/,
      /^src\/views\/download\/ui\/ConductionFigure\.tsx$/,
      /^src\/views\/download\/ui\/StartFigure\.tsx$/,
      /^src\/views\/download\/ui\/ChangeFigure\.tsx$/,
    ],
  },
  {
    order: 5208,
    command: 'pnpm exec playwright test tests/e2e/download-still.spec.ts',
    reason: "the download page's reduced-motion and no-script stillness changed",
    matches: [
      /^src\/views\/download\/ui\/DownloadPage\.tsx$/,
      /^src\/views\/download\/ui\/HeroAtlas\.tsx$/,
      /^src\/views\/download\/ui\/ConductionFigure\.tsx$/,
    ],
  },
  {
    order: 5209,
    command: 'pnpm exec playwright test tests/e2e/download-visibility-gate.spec.ts',
    reason: "the download figures' visibility gate changed",
    matches: [
      /^src\/views\/download\/ui\/ConductionFigure\.tsx$/,
      /^src\/views\/download\/ui\/StartFigure\.tsx$/,
      /^src\/views\/download\/ui\/ChangeFigure\.tsx$/,
    ],
  },
  {
    order: 5210,
    command: 'pnpm exec playwright test tests/e2e/gateway-doc-column.spec.ts',
    reason: 'the guide and changelog reading column width changed',
    matches: [
      /^src\/views\/gateway-doc\/ui\/GatewayDocPage\.tsx$/,
    ],
  },
  {
    order: 5211,
    command: 'pnpm exec playwright test tests/e2e/gateway-reading-reach.spec.ts',
    reason: "the guide chapter picker's reach on narrow screens changed",
    matches: [
      /^src\/views\/gateway-doc\/ui\/GatewayDocPage\.tsx$/,
      /^src\/widgets\/gateway-chrome\/ui\/GatewayNav\.tsx$/,
    ],
  },
  {
    order: 5212,
    command: 'pnpm exec playwright test tests/e2e/git-workbench-stacked-floor.spec.ts',
    reason: 'the stacked Git reader at the window floor changed',
    matches: [
      /^src\/widgets\/atlas-git-panel\/ui\/AtlasGitPanel\.tsx$/,
      /^src\/widgets\/atlas-git-panel\/ui\/CommitDetail\.tsx$/,
    ],
  },
  {
    order: 5213,
    command: 'pnpm exec playwright test tests/e2e/gray-area/panel-layout.spec.ts',
    reason: 'the gray-area inspector panel layout changed',
    matches: [
      /^src\/features\/gray-area\/ui\/GrayAreaInspector\.tsx$/,
    ],
  },
  {
    order: 5214,
    command: 'pnpm exec playwright test tests/e2e/harness-auto-insights-layout.spec.ts',
    reason: 'placement and overlap on the harness and architecture panels changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/tabs\/HarnessCoverageOverview\.tsx$/,
      /^src\/views\/architecture\/ui\/HarnessAnatomyView\.tsx$/,
      /^src\/views\/architecture\/ui\/HarnessCoverageView\.tsx$/,
    ],
  },
  {
    order: 5215,
    command: 'pnpm exec playwright test tests/e2e/harness-tab-layout.spec.ts',
    reason: "the harness tab's fitted diagram and role popup changed",
    matches: [
      /^src\/views\/ontology-insights\/ui\/tabs\/HarnessCoverageOverview\.tsx$/,
      /^src\/views\/architecture\/ui\/HarnessStructureDiagram\.tsx$/,
      /^src\/views\/architecture\/ui\/HarnessAnatomyView\.tsx$/,
    ],
  },
  {
    order: 5216,
    command: 'pnpm exec playwright test tests/e2e/insights-previews.spec.ts',
    reason: 'the insights library and harness tab previews changed',
    matches: [
      /^src\/views\/ontology-insights\/ui\/tabs\/HarnessTab\.tsx$/,
      /^src\/views\/ontology-insights\/ui\/tabs\/LibraryTab\.tsx$/,
    ],
  },
  {
    order: 5217,
    command: 'pnpm exec playwright test tests/e2e/ix-projects-agents-git-layout.spec.ts',
    reason: 'the project agent dock, agents and Git panel layout at the window floor changed',
    matches: [
      /^src\/views\/project-detail\/ui\/parts\/ProjectAgentDock\.tsx$/,
      /^src\/widgets\/atlas-git-panel\/ui\/AtlasGitPanel\.tsx$/,
      /^src\/views\/mcp\/ui\/McpPage\.tsx$/,
      /^src\/features\/acp-doctor\/ui\/AgentDoctor\.tsx$/,
    ],
  },
  {
    order: 5218,
    command: 'pnpm exec playwright test tests/e2e/library-answer-comparison-rows.spec.ts',
    reason: "the library answer comparison's row alignment and measure changed",
    matches: [
      /^src\/views\/library\/ui\/parts\/AnswerRevisionComparison\.tsx$/,
      /^src\/views\/library\/ui\/parts\/RetainedAnswerContext\.tsx$/,
    ],
  },
  {
    order: 5219,
    command: 'pnpm exec playwright test tests/e2e/library-graph-islands.spec.ts',
    reason: "the library graph's islands overview changed",
    matches: [
      /^src\/widgets\/library-graph\/ui\/LibraryGraph\.tsx$/,
      /^src\/widgets\/library-graph\/ui\/LibraryMarkPopover\.tsx$/,
    ],
  },
  {
    order: 5220,
    command: 'pnpm exec playwright test tests/e2e/library-graph-picture.spec.ts',
    reason: "the library graph picture's legibility changed",
    matches: [
      /^src\/widgets\/library-graph\/ui\/LibraryGraph\.tsx$/,
      /^src\/widgets\/library-graph\/ui\/LibraryMarkPopover\.tsx$/,
    ],
  },
  {
    order: 5221,
    command: 'pnpm exec playwright test tests/e2e/library-interaction-placement.spec.ts',
    reason: "where the library's transient surfaces land changed",
    matches: [
      /^src\/views\/library\/ui\/LibraryPage\.tsx$/,
      /^src\/views\/library\/ui\/LibraryRounds\.tsx$/,
      /^src\/views\/library\/ui\/parts\/LibraryAgentDock\.tsx$/,
      /^src\/features\/library\/ui\/FindDocumentsDialog\.tsx$/,
    ],
  },
  {
    order: 5222,
    command: 'pnpm exec playwright test tests/e2e/library-question-desk.spec.ts',
    reason: 'the library question desk changed',
    matches: [
      /^src\/views\/library\/ui\/parts\/LibraryQuestionDesk\.tsx$/,
    ],
  },
  {
    order: 5223,
    command: 'pnpm exec playwright test tests/e2e/library-renderer-disposal.spec.ts',
    reason: "the library constellation renderer's disposal changed",
    matches: [
      /^src\/views\/library\/ui\/LibraryConstellations\.tsx$/,
      /^src\/views\/library\/ui\/parts\/LibraryConstellation\.tsx$/,
    ],
  },
  {
    order: 5224,
    command: 'pnpm exec playwright test tests/e2e/library-source-pane-end.spec.ts',
    reason: 'where the library source pane ends changed',
    matches: [
      /^src\/views\/library\/ui\/parts\/SourceSummary\.tsx$/,
      /^src\/views\/library\/ui\/LibraryPage\.tsx$/,
    ],
  },
  {
    order: 5225,
    command: 'pnpm exec playwright test tests/e2e/project-hero-control-row.spec.ts',
    reason: "the project hero's control row changed",
    matches: [
      /^src\/views\/project-detail\/ui\/ProjectDetailPage\.tsx$/,
    ],
  },
  {
    order: 5226,
    command: 'pnpm exec playwright test tests/e2e/route-arrival-paint.spec.ts',
    reason: 'a revisited route arriving painted instead of loading changed',
    matches: [
      /^src\/shared\/ui\/route-loading-fallback\.tsx$/,
      /^src\/shared\/ui\/gateway-entry-fallback\.tsx$/,
      /^src\/shared\/ui\/map-entry-loading-visual\.tsx$/,
    ],
  },
  {
    order: 5227,
    command: 'pnpm exec playwright test tests/e2e/settings-reading-layout.spec.ts',
    reason: "the settings popover's reading layout changed",
    matches: [
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/SettingsNav\.tsx$/,
    ],
  },
  {
    order: 5228,
    command: 'pnpm exec playwright test tests/e2e/toast-free-lane.spec.ts',
    reason: "a toast or agent status standing over the map's chrome changed",
    matches: [
      /^src\/features\/agent-activity\/ui\/AgentActivityChip\.tsx$/,
      /^src\/views\/home\/ui\/TopologyCommandChrome\.tsx$/,
      /^src\/widgets\/search-hint\/ui\/SearchHint\.tsx$/,
    ],
  },
]

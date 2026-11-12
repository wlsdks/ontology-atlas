export const rules = [
  {
    order: 5207,
    command: 'pnpm exec playwright test tests/e2e/gateway/download-scroll-budget.spec.ts',
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
    command: 'pnpm exec playwright test tests/e2e/gateway/download-still.spec.ts',
    reason: "the download page's reduced-motion and no-script stillness changed",
    matches: [
      /^src\/views\/download\/ui\/DownloadPage\.tsx$/,
      /^src\/views\/download\/ui\/HeroAtlas\.tsx$/,
      /^src\/views\/download\/ui\/ConductionFigure\.tsx$/,
    ],
  },
  {
    order: 5211,
    command: 'pnpm exec playwright test tests/e2e/gateway/gateway-reading-reach.spec.ts',
    reason: "the guide chapter picker's reach on narrow screens changed",
    matches: [
      /^src\/views\/gateway-doc\/ui\/GatewayDocPage\.tsx$/,
      /^src\/widgets\/gateway-chrome\/ui\/GatewayNav\.tsx$/,
    ],
  },
  {
    order: 5212,
    command: 'pnpm exec playwright test tests/e2e/git/git-workbench-stacked-floor.spec.ts',
    reason: 'the stacked Git reader at the window floor changed',
    matches: [
      /^src\/widgets\/atlas-git-panel\/ui\/(AtlasGitPanel|DesktopBody|StepList|ActionDock|RemoteControls|SetupMode)\.tsx$/,
      /^src\/widgets\/atlas-git-panel\/ui\/CommitDetail\.tsx$/,
    ],
  },
  {
    order: 5219,
    command:
      'pnpm exec playwright test tests/e2e/library/graph/library-graph-alive.spec.ts tests/e2e/library/graph/library-graph-card.spec.ts ' +
      'tests/e2e/library/graph/library-graph-islands.spec.ts',
    reason: "the library graph changed; these specs measure its motion, card, islands and picture, and other library specs that draw it keep the smoke sweep",
    additive: true,
    matches: [
      /^src\/widgets\/library-graph\/.+(?<!\.test)\.tsx?$/,
      /^tests\/e2e\/library\/graph\/library-graph-probe\.ts$/,
    ],
  },
  {
    order: 5222,
    command: 'pnpm exec playwright test tests/e2e/library/answers/library-question-desk.spec.ts',
    reason: 'the library question desk changed',
    matches: [
      /^src\/views\/library\/ui\/parts\/questions\/LibraryQuestionDesk\.tsx$/,
    ],
  },
  {
    order: 5223,
    command: 'pnpm exec playwright test tests/e2e/library/graph/library-renderer-disposal.spec.ts',
    reason: "the library constellation renderer's disposal changed",
    matches: [
      /^src\/views\/library\/ui\/LibraryConstellations\.tsx$/,
      /^src\/views\/library\/ui\/parts\/first-run\/LibraryConstellation\.tsx$/,
    ],
  },
]

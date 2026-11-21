export const rules = [
  {
    order: 5207,
    command: 'pnpm exec playwright test tests/e2e/gateway/download-scroll-budget.spec.ts',
    reason: "the download page's scroll frame budget changed",
    matches: [
      /^src\/views\/download\/ui\/DownloadPage\.tsx$/,
      /^src\/views\/download\/(?:lib\/gateway-frame-loop\.ts|ui\/GatewayFx\.tsx)$/,
      /^src\/views\/download\/ui\/[A-Za-z]+Section\.tsx$/,
    ],
  },
  {
    order: 5208,
    command: 'pnpm exec playwright test tests/e2e/gateway/download-still.spec.ts',
    reason: "the download page's reduced-motion and no-script stillness changed",
    matches: [
      /^src\/views\/download\/ui\/DownloadPage\.tsx$/,
      /^src\/views\/download\/(?:lib\/gateway-frame-loop\.ts|ui\/GatewayFx\.tsx)$/,
      /^src\/views\/download\/ui\/[A-Za-z]+Section\.tsx$/,
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
    command: 'pnpm exec playwright test tests/e2e/library/sources-home.spec.ts',
    reason: "the Sources home overview changed; this spec presses its rows and measures its overflow, and other library specs that draw it keep the smoke sweep",
    additive: true,
    matches: [
      /^src\/widgets\/library-sources-overview\/.+(?<!\.test)\.tsx?$/,
    ],
  },
  {
    order: 5222,
    command: 'pnpm exec playwright test tests/e2e/library/answers/library-question-desk.spec.ts',
    reason: 'the library question desk changed',
    matches: [
      /^src\/views\/library\/ui\/parts\/questions\/LibraryQuestionDesk\.tsx$/,
      /^src\/views\/library\/ui\/parts\/questions\/desk\/[^/]+\.tsx?$/,
    ],
  },
  {
    order: 5223,
    command: 'pnpm exec playwright test tests/e2e/library/library-renderer-disposal.spec.ts',
    reason: "the library constellation renderer's disposal changed",
    matches: [
      /^src\/views\/library\/ui\/LibraryConstellations\.tsx$/,
      /^src\/views\/library\/ui\/parts\/first-run\/LibraryConstellation\.tsx$/,
    ],
  },
  {
    order: 5224,
    command: 'pnpm exec playwright test tests/e2e/library/wiki/library-wiki-reader.spec.ts',
    reason: 'the library wiki reader or the source passage it reads on a press changed',
    matches: [
      /^src\/views\/library\/ui\/parts\/wiki\/[^/]+\.tsx?$/,
      /^src\/views\/library\/lib\/sources\/use-cited-passage\.ts$/,
      /^src\/shared\/lib\/library\/source-passage\.ts$/,
    ],
  },
]

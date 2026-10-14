/** Playwright specs for the other screens: architecture, docs, agents, web surface, routes, gateway. */

export const rules = [
  {
    order: 415,
    command: 'pnpm test:e2e:sleeps && pnpm e2e:sleeps:check',
    reason: 'an e2e spec or the fixed-sleep gate changed; a spec may not add a waitForTimeout without a measurement-window note',
    matches: [/^tests\/e2e\/.+\.ts$/, /^scripts\/quality\/check-e2e-sleeps(?:\.test)?\.mjs$/],
  },
  {
    order: 420,
    command: 'pnpm exec playwright test tests/e2e/vault-session/retired-game-storage.spec.ts tests/e2e/agents/agent-mascot-presence.spec.ts',
    reason: 'folder entry and work status must preserve personal saves and verified activity after game retirement',
    matches: [
      /^src\/views\/first-run\/ui\/FirstRunPage\.tsx$/,
      /^src\/views\/home\/ui\/TopologyCommandChrome\.tsx$/,
      /^src\/features\/agent-activity\/ui\/Agent(?:ActivityChip|MascotPresence)\.tsx$/,
      /^tests\/e2e\/vault-session\/retired-game-storage\.spec\.ts$/,
    ],
  },
  {
    order: 430,
    command: 'pnpm exec playwright test tests/e2e/harness/architecture-workbench.spec.ts',
    reason: 'Architecture workflow reachability, scroll anchoring, or mobile navigation changed',
    matches: [
      /^src\/views\/architecture\//,
      /^src\/widgets\/bottom-tab-bar\/ui\/BottomTabBar\.tsx$/,
      /^tests\/e2e\/harness\/architecture-workbench\.spec\.ts$/,
    ],
  },
  {
    order: 720,
    command: 'pnpm exec playwright test tests/e2e/vault-session/local-vault-picker.spec.ts',
    reason: 'Playwright config or webServer behavior changed',
    matches: [/^playwright\.config\.ts$/],
  },
  {
    order: 730,
    command: 'pnpm exec playwright test tests/e2e/design-audits/overflow-sweep.spec.ts',
    reason: 'global CSS, Tailwind, or PostCSS styling behavior changed',
    matches: [/^app\/(?:globals|styles\/[^/]+)\.css$/, /^postcss\.config\.mjs$/],
  },
  {
    order: 820,
    /*
     * Editing the docs surface must run the e2e specs that drive it (`.claude/rules/testing.md`: sweep
     * a screen's specs with the screen).
     */
    command:
      'pnpm exec playwright test tests/e2e/library/docs/docs-deeplink.spec.ts tests/e2e/design-audits/document-scroll-lock.spec.ts tests/e2e/vault-session/vault-truth-telling.spec.ts',
    reason: 'the docs surface changed — its e2e specs drive that screen by role and testid',
    matches: [
      /^src\/views\/docs-vault\/.+\.tsx?$/,
      /^src\/widgets\/docs-vault\/.+\.tsx?$/,
    ],
  },
  {
    order: 830,
    /*
     * Each spec drives these files: `mcp-connector-add` via `/mcp/`'s redirect,
     * `agent-connect-panel-census` via the rail and tab strip, `web-surface-smoke` for the degradation
     * cards and tab address.
     */
    command:
      'pnpm exec playwright test tests/e2e/agents/mcp-connector-add.spec.ts ' +
      'tests/e2e/agents/agent-connect-panel-census.spec.ts tests/e2e/web-surface-smoke.spec.ts',
    reason: 'the Agents destination changed — three e2e specs drive its tabs, its connectors card and its deep link',
    matches: [
      /^src\/views\/(?:agents|mcp|mcp-redirect)\/.+\.tsx?$/,
      /^src\/app\/agents-workspace\/.+\.tsx?$/,
      /^src\/features\/mcp-connectors\/.+\.tsx?$/,
      /^src\/widgets\/app-settings-menu\/ui\/(?:AgentSetupSection|VaultAgentSetupPanel)\.tsx$/,
    ],
  },
  {
    order: 840,
    /*
     * The runtime list is the other half of that destination, and only one of those three
     * specs reaches it: `web-surface-smoke` registers `app-settings-runtimes-web`, the card a
     * browser sees instead of the list, and asserts the link it carries. Naming the other two
     * here would be a mapping that does not measure this file.
     */
    command: 'pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
    reason: 'the runtime list changed — the web surface draws its degradation card instead',
    matches: [/^src\/widgets\/app-settings-menu\/ui\/AcpRuntimeSettings\.tsx$/],
  },
  {
    order: 850,
    // The web does not follow the app, so touching a capability bridge must also suggest the web smoke
    // test; the web is an unattended surface.
    command: 'pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
    reason: 'desktop capability bridge or local-vault entry changed — the web surface is unattended',
    matches: [
      /^src\/shared\/lib\/(?:vault-folder\/tauri-vault-fs|git\/tauri-git|llm-connection\/tauri-(?:secrets|llm))\.ts$/,
      /^src\/shared\/lib\/desktop-shell\/desktop-shell\.ts$/,
      /^src\/entities\/vault-session\/model\/local-vault\/[^/]+(?<!\.test)\.ts$/,
      /^src\/features\/first-run-starter\/ui\/FirstRunStarterModule\.tsx$/,
      /^src-tauri\//,
    ],
  },
  {
    order: 860,
    command: 'pnpm exec playwright test tests/e2e/vault-session/vault-switch-release.spec.ts',
    reason: 'a callback that can outlive a folder switch changed; no earlier folder may stay alive',
    matches: [
      /^src\/entities\/vault-session\/model\/local-vault\/use-(?:local-vault|vault-choice|vault-doc-writes)\.ts$/,
      /^src\/features\/vault-switch\//,
      /^src\/views\/home\/ui\/HomePage\.tsx$/,
      /^src\/views\/home\/model\/(?:agent\/use-topology-agent-orchestration|keyboard\/use-topology-keyboard-tour|use-topology-vault-read-model|trail\/use-past-trails|trail\/use-footprint-trail)\.tsx?$/,
      /^src\/views\/library\/lib\/rounds\/use-rounds-runner\.ts$/,
      /^src\/shared\/lib\/(?:use-latest-ref|derived-hook)\.ts$/,
      /^src\/widgets\/ontology-map\/ui\/camera\/use-topology-(?:camera-navigation|overview-navigation|viewport-lifecycle)\.ts$/,
      /^tests\/e2e\/(?:vault-session\/vault-switch-release\.spec|heap-census)\.ts$/,
    ],
  },
  {
    order: 1020,
    // A route is the input of three gates: the decision ledger (`decisions:check`), accessibility
    // classification (`audited-route-coverage`), and the two ratchets that measure contrast.
    command:
      'pnpm exec playwright test tests/e2e/design-audits/a11y-ratchet.spec.ts tests/e2e/design-audits/contrast-ratchet.spec.ts',
    reason: 'a route was added or changed — it must be classified into the a11y/contrast ratchets',
    matches: [/^app\/(?:.+\/)?(?:page|not-found|error|global-error)\.tsx$/],
  },
  {
    order: 1030,
    // Editing the gateway layout must run its grid check. `PAGE_COLUMN`/`PAGE_GUTTER` are included
    // because they are the baseline the grid measures against.
    command: 'pnpm exec playwright test tests/e2e/gateway/download-gateway-grid.spec.ts',
    reason: 'the gateway plate or its frame changed — six elements must still share one origin',
    matches: [
      /^src\/views\/download\/.*\.tsx?$/,
      /^src\/widgets\/gateway-chrome\/.*\.tsx?$/,
      /^src\/shared\/lib\/public-pages\/gateway-frame\.ts$/,
    ],
  },
  {
    order: 1035,
    command: 'pnpm exec playwright test tests/e2e/gateway/download-hero-release.spec.ts',
    reason: 'the download hero or its renderer changed; leaving /download must give back its WebGL context and page',
    matches: [
      /^src\/views\/download\/(?:lib\/hero-atlas-scene\.ts|ui\/HeroAtlas\.tsx|lib\/gateway-frame-loop\.ts)$/,
      /^tests\/e2e\/(?:gateway\/download-hero-release\.spec|heap-census)\.ts$/,
    ],
  },
];

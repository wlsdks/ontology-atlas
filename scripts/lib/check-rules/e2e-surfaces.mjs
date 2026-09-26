/** Playwright specs for the other screens: companion, architecture, docs, agents, web surface, routes, gateway. */

export const rules = [
  {
    order: 415,
    command: 'pnpm test:e2e:sleeps && pnpm e2e:sleeps:check',
    reason: 'an e2e spec or the fixed-sleep gate changed; a spec may not add a waitForTimeout without a measurement-window note',
    matches: [/^tests\/e2e\/.+\.ts$/, /^scripts\/check-e2e-sleeps(?:\.test)?\.mjs$/],
  },
  {
    order: 420,
    // A companion screen edit ran only the spec it touched, so a new sector entry broke the
    // growth journey's overflow and hit-area contracts in CI instead of locally (lesson 3b68fac4).
    command: 'pnpm exec playwright test tests/e2e/companion-home.spec.ts tests/e2e/companion-growth.spec.ts tests/e2e/companion-learning.spec.ts tests/e2e/companion-progression.spec.ts tests/e2e/companion-sector.spec.ts',
    reason: 'a companion screen or its model changed; its journeys share one surface, so all of them run',
    matches: [
      /^src\/features\/agent-activity\/(?:ui|model)\/[^/]*[Cc]ompanion[^/]*$/,
      /^tests\/e2e\/companion-[^/]+\.spec\.ts$/,
    ],
  },
  {
    order: 430,
    command: 'pnpm exec playwright test tests/e2e/architecture-workbench.spec.ts',
    reason: 'Architecture workflow reachability, scroll anchoring, or mobile navigation changed',
    matches: [
      /^src\/views\/architecture\//,
      /^src\/widgets\/bottom-tab-bar\/ui\/BottomTabBar\.tsx$/,
      /^tests\/e2e\/architecture-workbench\.spec\.ts$/,
    ],
  },
  {
    order: 720,
    command: 'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    reason: 'Playwright config or webServer behavior changed',
    matches: [/^playwright\.config\.ts$/],
  },
  {
    order: 730,
    command: 'pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts',
    reason: 'global CSS, Tailwind, or PostCSS styling behavior changed',
    matches: [/^app\/globals\.css$/, /^postcss\.config\.mjs$/],
  },
  {
    order: 820,
    /*
     * ⚠️ **Editing the docs surface runs the e2e that drives it** (2026-08-08).
     *
     * Missing this mapping caused a real incident. #987 moved the docs header's
     * "sample | local" radio into the vault chip menu, and
     * `docs-deeplink.spec.ts` clicks that radio. The advisor **never once pointed at
     * that spec**, so it was not run locally, and CI stayed red while **six more PRs
     * merged** (2-minute timeout × 3 retries × two tests).
     *
     * `.claude/rules/testing.md` warns about exactly this: delete a screen and sweep
     * its e2e specs in the same PR. That sweep was left to human memory; the tool does it instead:
     * **a check the tool cannot point at is a check that does not exist.**
     */
    command:
      'pnpm exec playwright test tests/e2e/docs-deeplink.spec.ts tests/e2e/document-scroll-lock.spec.ts tests/e2e/vault-truth-telling.spec.ts',
    reason: 'the docs surface changed — its e2e specs drive that screen by role and testid',
    matches: [
      /^src\/views\/docs-vault\/.+\.tsx?$/,
      /^src\/widgets\/docs-vault\/.+\.tsx?$/,
    ],
  },
  {
    order: 830,
    /*
     * ⚠️ **Editing the Agents destination runs the e2e that drives it** (2026-09-19).
     *
     * The same hole the docs rule above was opened for. Measured on this branch: changing
     * `McpPage.tsx`, `ConnectorsPanel.tsx`, `agents-workspace/index.tsx`, `AgentsPage.tsx` or
     * `McpRedirectPage.tsx` suggested **no Playwright spec at all**, while three specs drive
     * exactly those files — including the one that proves `ontology-atlas://mcp?install=…`
     * still opens the connectors dialog, which is the named falsifier of the 2026-09-19
     * decision that made MCP a tab of this page. The e2e specs only ran during that work
     * because the specs themselves were edited; a person changing the screen alone would have
     * shipped past them.
     *
     * All three are true for every path listed: `mcp-connector-add` presses into the
     * connectors card and arrives through `/mcp/`'s redirect, `agent-connect-panel-census`
     * reaches the share pane through the rail and the tab strip, and `web-surface-smoke`
     * registers this screen's degradation cards (`agent-server-unavailable`, the connectors
     * card) and the tab address they are reached by.
     */
    command:
      'pnpm exec playwright test tests/e2e/mcp-connector-add.spec.ts ' +
      'tests/e2e/agent-connect-panel-census.spec.ts tests/e2e/web-surface-smoke.spec.ts',
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
    // Since the surface split (2026-07-27) the web does not follow the app, so anyone
    // touching a capability bridge easily checks only the app and moves on. The web is
    // an unattended surface, so that pass becomes decay — touching a bridge also
    // suggests the web smoke test.
    command: 'pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
    reason: 'desktop capability bridge or local-vault entry changed — the web surface is unattended',
    matches: [
      /^src\/shared\/lib\/tauri-(?:vault-fs|git|secrets|llm)\.ts$/,
      /^src\/shared\/lib\/desktop-shell\.ts$/,
      /^src\/features\/docs-vault-local\/model\/use-local-vault\.ts$/,
      /^src\/features\/first-run-starter\/ui\/FirstRunStarterModule\.tsx$/,
      /^src-tauri\//,
    ],
  },
  {
    order: 1020,
    // 2026-08-04 — for someone adding a route this advisor suggested only tsc. A route
    // is the input of three gates: the decision ledger (`decisions:check`), the
    // accessibility classification (`audited-route-coverage` → `pnpm test:contracts`),
    // and the actual measurement (the two ratchets). Without the third, a new screen's
    // contrast shortfall passes **while appearing on no list at all** — on 2026-08-03
    // two 404 pages were carrying AA 4.42:1 that way.
    command:
      'pnpm exec playwright test tests/e2e/a11y-ratchet.spec.ts tests/e2e/contrast-ratchet.spec.ts',
    reason: 'a route was added or changed — it must be classified into the a11y/contrast ratchets',
    matches: [/^app\/(?:.+\/)?(?:page|not-found|error|global-error)\.tsx$/],
  },
  {
    order: 1030,
    // 2026-08-08 — for someone editing the gateway's layout this advisor **did not
    // suggest that layout's grid check**, and a regression went through the gap:
    // adding one line to the footer turned `download-gateway-grid` red at all eight
    // widths, nobody ran that spec locally, and it surfaced only in CI.
    //
    // This repository's discipline is "point at the tool instead of a hand-written
    // list", which makes **a check the tool cannot point at a check that does not
    // exist**. Even with `download-gateway` right there in the spec name, it is
    // useless without a path↔check link.
    //
    // The origin values (`PAGE_COLUMN`/`PAGE_GUTTER`) are included because they are the
    // baseline the grid measures against — editing them moves all eight widths without
    // touching the layout.
    command: 'pnpm exec playwright test tests/e2e/download-gateway-grid.spec.ts',
    reason: 'the gateway plate or its frame changed — six elements must still share one origin',
    matches: [
      /^src\/views\/download\/.*\.tsx?$/,
      /^src\/widgets\/gateway-chrome\/.*\.tsx?$/,
      /^src\/shared\/lib\/gateway-frame\.ts$/,
    ],
  },
];

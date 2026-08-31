import { existsSync } from 'node:fs';

import { isSupportedSourcePath } from '../quality/source-language/source-paths.mjs';

const RULES = [
  {
    command: 'pnpm test:mcp:registration',
    reason: 'MCP source-checkout registration templates changed',
    matches: [/^\.mcp\.json(?:\.example)?$/, /^\.codex\/config\.toml$/],
  },
  {
    command: 'pnpm docs-vault:check',
    reason: 'static docs-vault input or generated manifest changed',
    matches: [/^docs\/.+\.md$/, /^src\/entities\/docs-vault\/data\/manifest\.json$/],
  },
  {
    command: 'pnpm test:docs-vault',
    reason: 'docs-vault build/check or conflict-recovery helper changed',
    matches: [
      /^scripts\/(?:build-docs-vault|resolve-docs-vault-conflicts)\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm docs:language',
    reason: 'authored Markdown must not add unexplained Korean prose',
    matches: [/\.md$/, /^scripts\/quality\/markdown-language\//],
  },
  {
    command: 'pnpm test:docs:language',
    reason: 'Markdown language inventory or ratchet implementation changed',
    matches: [/^scripts\/quality\/markdown-language\//],
  },
  {
    command: 'pnpm test:source:language',
    reason: 'source-comment language inventory or ratchet implementation changed',
    matches: [/^scripts\/quality\/source-language\//],
  },
  {
    command: 'pnpm knip',
    reason: 'dead-code analyzer scope, configuration, package, or implementation changed',
    matches: [
      /^(?:app|src)\/.+\.(?:[cm]?[jt]sx?|css)$/,
      /^scripts\/(?:quality\/dead-code\/|.+\.(?:mjs|js))$/,
      /^cli\/(?:src\/|package(?:-lock)?\.json$|pnpm-lock\.yaml$)/,
      /^mcp\/(?:src\/|scripts\/|package(?:-lock)?\.json$|pnpm-lock\.yaml$)/,
      /^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|next\.config\.ts|tsconfig(?:\.[^/]+)?\.json|vitest\.config\.ts|playwright\.config\.ts|postcss\.config\.mjs)$/,
    ],
  },
  {
    // The accident this net actually catches is "a document moved or the vault was
    // regenerated but the prose citing it stayed", which only happens in a PR that
    // touched markdown — so markdown is also the trigger for the suggestion.
    command: 'pnpm docs:links',
    reason: 'markdown moved or edited — cited paths and links may have gone stale',
    matches: [/\.md$/],
  },
  {
    command: 'pnpm test:guide-examples',
    reason: 'public guide ontology examples must satisfy the live UID schema',
    matches: [
      /^docs\/guide\/[^/]+\.md$/,
      /^scripts\/check-guide-frontmatter-examples\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm docs:surface:check',
    reason: 'MCP tool registry, CLI command registry, or their READMEs changed',
    matches: [
      /^mcp\/src\/index\.js$/,
      /^cli\/src\/lib\/cli-commands\.mjs$/,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^docs\/\.generated\/mcp-surface\.json$/,
    ],
  },
  {
    command: 'pnpm test:docs:checks',
    reason: 'docs surface or doc-link checker changed',
    matches: [
      /^scripts\/build-docs-surface\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-doc-links\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/(?:docs-surface|doc-links)\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'GitHub workflow or community template changed',
    matches: [
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^\.github\/DISCUSSIONS-CATEGORIES\.md$/,
      /^\.github\/ISSUE_TEMPLATE\/[^/]+\.yml$/,
    ],
  },
  {
    command: 'pnpm test:meaning-corpus',
    reason: 'business meaning corpus evaluator or its fixtures changed',
    matches: [
      /^scripts\/evaluate-meaning-corpus(?:\.test)?\.mjs$/,
      /^tests\/fixtures\/meaning-corpus\//,
    ],
  },
  {
    command: 'pnpm test:vault:validate',
    reason: 'vault validator script changed',
    matches: [/^scripts\/validate-vault(?:-script)?\.test\.mjs$/, /^scripts\/validate-vault\.mjs$/],
  },
  {
    command: 'pnpm test:vault:audit',
    reason: 'vault path audit script changed',
    matches: [/^scripts\/audit-vault-paths\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:desktop:check',
    reason: 'desktop readiness checker contract changed',
    matches: [
      /^scripts\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos-app-launch(?:\.[^/]+)?\.mjs$/,
      /^scripts\/lib\/verify-macos\/[^/]+\.mjs$/,
      /^scripts\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-macos-download-release\.mjs$/,
      /^scripts\/build-updater-manifest\.(?:mjs|test\.mjs)$/,
      /^scripts\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
    ],
  },
  {
    // The hard desktop performance budgets used to run only in
    // `desktop:release-preflight`, and in the meantime the bundled vault data grew
    // until both budgets were silently exceeded (found during 2026-08-19 release prep:
    // 1.71MiB against 1.50, 8.42MiB against 8.00). When a path that moves the budget
    // changes — the bundled data JSON, the generator that produces it, the static
    // import site, or the budget check itself — the measurement is suggested here. The
    // half that runs constantly without a build is
    // `tests/contract/bundled-vault-budget.contract.test.ts`.
    command: 'pnpm build && pnpm desktop:perf',
    reason: 'bundled vault data or the desktop performance budget surface changed — re-measure the static budgets',
    matches: [
      /^src\/entities\/docs-vault\/data\//,
      /^scripts\/build-docs-vault\.mjs$/,
      /^scripts\/check-desktop-performance\.(?:mjs|test\.mjs)$/,
      /^src\/entities\/docs-vault\/lib\/static-(?:vault-source|headings)\.ts$/,
    ],
  },
  {
    command: 'pnpm test:desktop:runtime',
    reason: 'hosted-vs-installed desktop runtime split changed',
    matches: [
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu(?:\.test)?\.tsx$/,
    ],
  },
  {
    command: 'pnpm design:ontology',
    reason: 'ontology workbench design surface or its guard changed',
    matches: [
      /^scripts\/check-ontology-design-surface\.(?:mjs|test\.mjs)$/,
      /^src\/views\/ontology-insights\//,
    ],
  },
  {
    command: 'pnpm test:desktop:bridge',
    reason: 'native macOS vault bridge changed',
    matches: [
      /^src\/shared\/lib\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src-tauri\/src\/lib\.rs$/,
      /^src-tauri\/Cargo\.(?:toml|lock)$/,
    ],
  },
  {
    command: 'pnpm desktop:check',
    reason: 'macOS desktop readiness inputs changed',
    matches: [
      /^scripts\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-macos-download-release\.mjs$/,
      /^scripts\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^docs\/DESKTOP-MACOS\.md$/,
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/shared\/lib\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/views\/docs-vault\/ui\/DocsVaultPage\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu(?:\.test)?\.tsx$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
      /^src-tauri\//,
      /^package\.json$/,
      /^next\.config\.ts$/,
    ],
  },
  {
    command: 'pnpm test:vault:migrate',
    reason: 'vault migration behavior changed',
    matches: [
      /^scripts\/migrate-vault\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrate-node-uids\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrations\/[^/]+\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm vault:migrate --list',
    reason: 'vault migration inventory or runner changed',
    matches: [
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/(?:README\.md|[^/]+\.mjs)$/,
    ],
  },
  {
    command: 'pnpm test:architecture',
    reason: 'architecture profile, conformance, agent packet, and cross-surface parity changed',
    matches: [
      /^docs\/ontology\/architecture\//,
      /^mcp\/src\/architecture-profile\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/(?:commands\/architecture|lib\/architecture-results)\.mjs$/,
      /^src\/entities\/architecture-profile\//,
      /^src\/views\/architecture\//,
      /^tests\/contract\/architecture-profile\.contract\.test\.ts$/,
      /^tests\/fixtures\/architecture-profile-cases\.mjs$/,
    ],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/architecture-workbench.spec.ts',
    reason: 'Architecture workflow reachability, scroll anchoring, or mobile navigation changed',
    matches: [
      /^src\/views\/architecture\//,
      /^src\/widgets\/bottom-tab-bar\/ui\/BottomTabBar\.tsx$/,
      /^tests\/e2e\/architecture-workbench\.spec\.ts$/,
    ],
  },
  {
    command: 'pnpm test:contracts',
    reason:
      'cross-package parser/schema contract, or a UI file the design-system and a11y contracts scan from disk',
    matches: [
      // 2026-08-04 — for a new `.tsx` view and a new route this advisor suggested
      // nothing beyond tsc and i18n. But several gates in `tests/contract/` **read the
      // file system directly**: ramp coverage, the named-utility ratchet, the control
      // adoption ratchet, forbidden classes, inline hex, surface motion, label
      // decoration, and `audited-route-coverage`, which classifies routes. A newly
      // created UI file is their input, not somebody else's business.
      /^(?:src|app)\/.*\.tsx$/,
      /^tests\/contract\//,
      /^tests\/fixtures\/(?:frontmatter|frontmatter-writer|validate-vault|vault-schema)-cases\.mjs$/,
      /^mcp\/src\/(?:parser|schema|validate)\.mjs$/,
      /^cli\/src\/lib\/(?:parse-frontmatter|schema|validate)\.mjs$/,
      /^cli\/src\/commands\/validate\.mjs$/,
      /^scripts\/lib\/parse-frontmatter\.mjs$/,
      /^src\/shared\/lib\/(?:parse-frontmatter|validate-vault-document)\.ts$/,
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/[^/]+\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:unit',
    reason: 'MCP source or unit contract changed',
    matches: [
      /^mcp\/src\/(?!integration\.test\.mjs$)[^/]+\.(?:mjs|js)$/,
      /^tests\/fixtures\/source-hidden-field-trial\/v1\.json$/,
    ],
  },
  {
    command: 'pnpm integration:mcp:surface',
    reason: 'MCP JSON-RPC tool registry or handler surface changed',
    matches: [/^mcp\/src\/index\.js$/],
  },
  {
    command: 'pnpm integration:mcp',
    reason: 'MCP integration test harness or broad integration contract changed',
    matches: [/^mcp\/src\/integration\.test\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:graph',
    reason: 'MCP graph artifact/query handler surface changed',
    matches: [/^mcp\/src\/(?:ontology-compiler|ontology-engine)\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:repo-analysis',
    reason: 'MCP code-to-vault analysis handler surface changed',
    matches: [/^mcp\/src\/(?:analyze|architecture-profile|meaning-evaluation|construction-qualification|construction-lifecycle|infer-imports)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    command: 'pnpm integration:mcp:vault-read',
    reason: 'MCP vault/frontmatter read handler surface changed',
    matches: [/^mcp\/src\/(?:validate|vault)\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:read',
    reason: 'MCP read/query tool handler surface changed',
    matches: [
      /^mcp\/src\/query\.mjs$/,
    ],
  },
  {
    command: 'pnpm integration:mcp:write',
    reason: 'MCP write tool handler surface changed',
    matches: [/^mcp\/src\/(?:index|vault)\.(?:mjs|js)$/],
  },
  {
    command: 'pnpm test:dogfood:script-refs',
    reason: 'help text, package-script references, or focused wrapper behavior changed',
    matches: [
      /^package\.json$/,
      /^scripts\/lib\/pnpm-script-refs\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/test-name-pattern\.(?:mjs|test\.mjs)$/,
      /^scripts\/run-focused-node-test\.(?:mjs|test\.mjs)$/,
      /^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/commands\/mcp-verify\.mjs$/,
      /^mcp\/scripts\/verify\.mjs$/,
      /^README\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/benchmark\/README\.md$/,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^scripts\/migrations\/README\.md$/,
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
      /^\.claude\/rules\/[^/]+\.md$/,
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
    ],
  },
  {
    command: 'pnpm test:claude:hooks',
    reason: 'agent hook wiring, a guard, or the commit-message gate changed',
    /*
     * This list named two of the four hook scripts, so editing the Git guard or
     * the generated-output guard recommended nothing that tests them (measured
     * 2026-08-24). A gate that covers half its own subject set is the shape this
     * repository keeps finding; match the directories instead of enumerating
     * files, so a new hook is covered the day it lands.
     */
    matches: [
      /^\.claude\/hooks\/.+\.sh$/,
      /^\.claude\/settings\.json$/,
      /^\.codex\/hooks\.json$/,
      /^\.codex\/hooks\/.+\.sh$/,
      /^\.githooks\/(?:commit-msg|commit-msg-language\.mjs)$/,
      /^\.gitignore$/,
      /^scripts\/claude-hooks\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm agents:check',
    reason: 'agent-file surface changed: mirror parity, pointers, MCP grants, and the Codex cap move together',
    /*
     * CI has run this since it existed, but nothing recommended it locally, so
     * the answer to "did I break the mirror" cost an eight-minute CI round
     * instead of the fifty milliseconds it actually takes (measured
     * 2026-08-24).
     */
    matches: [
      /^CLAUDE\.md$/,
      /^AGENTS\.md$/,
      /^[^/]+\/AGENTS\.md$/,
      /^\.claude\/(?:agents|skills|hooks|rules)\/.+/,
      /^\.claude\/settings\.json$/,
      /^\.agents\/(?:agents|skills)\/.+/,
      /^\.codex\/.+/,
      /^\.mcp\.json$/,
      /^cli\/src\/lib\/agent-files\.mjs$/,
      /^cli\/src\/commands\/agent-files\.mjs$/,
    ],
  },
  {
    command: 'pnpm exec vitest run tests/contract/agent-files.contract.test.ts tests/contract/nested-agents-pointers.contract.test.ts tests/contract/skill-routing.contract.test.ts tests/contract/rules-path-scope.contract.test.ts tests/contract/secret-read-guard.contract.test.ts tests/contract/node-test-reachability.contract.test.ts tests/contract/agent-file-citations.contract.test.ts',
    reason: 'one side of the agent-files pair, or a rule glob the nested pointers derive from, changed',
    /*
     * `cli/src/lib/agent-files.mjs` and `src/views/docs-vault/lib/agent-files.ts`
     * are two implementations of one contract, and the nested `AGENTS.md`
     * pointers derive their expected rule set from `.claude/rules/` frontmatter.
     * Editing either side alone recommended neither contract, which is how a
     * mirror silently diverged for a full iteration (measured 2026-08-24).
     */
    matches: [
      /^cli\/src\/lib\/agent-files\.mjs$/,
      /^src\/views\/docs-vault\/lib\/agent-files\.ts$/,
      /^tests\/fixtures\/agent-files-cases\.mjs$/,
      /^\.claude\/rules\/[^/]+\.md$/,
      /^[^/]+\/AGENTS\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
      /^tests\/contract\/rules-path-scope\.contract\.test\.ts$/,
      /^tests\/contract\/secret-read-guard\.contract\.test\.ts$/,
      /^\.gitignore$/,
      /^\.claude\/settings\.json$/,
      /^package\.json$/,
      /^\.github\/workflows\/[^/]+\.ya?ml$/,
      /^tests\/contract\/node-test-reachability\.contract\.test\.ts$/,
      /^tests\/contract\/agent-file-citations\.contract\.test\.ts$/,
    ],
  },
  {
    command: 'pnpm test:dogfood:args',
    reason: 'dogfood shortcut argument helper changed',
    matches: [/^scripts\/lib\/dogfood-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:dogfood:compile-fix',
    reason: 'dogfood compile-fix idempotence helper changed',
    matches: [/^scripts\/dogfood-compile-fix\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:checks:changed',
    reason: 'changed-path focused-check advisor changed',
    matches: [
      /^scripts\/lib\/focused-check-suggestions\.(?:mjs|test\.mjs)$/,
      /^scripts\/suggest-focused-checks\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    /*
     * **The script that decides what CI runs had no suggestion mapping of its own**
     * (2026-08-08). `pnpm checks:changed -- scripts/classify-change.mjs` returned "no
     * focused mapping" — the highest-consequence script in this repository had no line
     * pointing at its own tests. One classification defect in that file actually made
     * main skip the entire Playwright suite.
     */
    command: 'pnpm exec node --test scripts/classify-change.test.mjs',
    reason: 'the CI change classifier decides what CI runs at all',
    matches: [/^scripts\/classify-change\.(?:mjs|test\.mjs)$/],
  },
  {
    /*
     * The skill-integrity instrument. It is a discovery tool rather than a product
     * feature, but its verdict logic is a pure function and has tests. A check the tool
     * cannot point at is a check that does not exist.
     */
    command: 'pnpm test:skills:audit',
    reason: 'Claude skill integrity instrument changed',
    matches: [/^scripts\/audit-claude-skills\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts',
    reason: 'Vitest config, setup, or test discovery changed',
    matches: [/^vitest\.config\.ts$/, /^vitest\.setup\.ts$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    reason: 'Playwright config or webServer behavior changed',
    matches: [/^playwright\.config\.ts$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts',
    reason: 'global CSS, Tailwind, or PostCSS styling behavior changed',
    matches: [/^app\/globals\.css$/, /^postcss\.config\.mjs$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/map-viewport-reframe.spec.ts',
    reason: 'camera free-area measurement or its selected-inspector owner changed',
    matches: [
      /^src\/widgets\/topology-map-v2\/interaction\/free-area\.ts$/,
      /^src\/views\/home\/ui\/HomePage\.tsx$/,
    ],
  },
  {
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
  {
    command: 'pnpm exec playwright test tests/e2e/ontology-ui.spec.ts',
    reason: 'topology route-state and legacy redirect behavior changed',
    matches: [/^src\/views\/home\/ui\/HomePage\.tsx$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts',
    reason: 'ontology change-review rendering changed',
    matches: [
      /^src\/features\/ontology-change-review\/ui\/OntologyChangeReview\.tsx$/,
    ],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/touch-target-contract.spec.ts',
    reason: 'selected-node panel touch targets changed',
    matches: [/^src\/widgets\/topology-map-v2\/ui\/TopologyV2DetailPanel\.tsx$/],
  },
  {
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
    command: 'pnpm test:dogfood:status',
    reason: 'dogfood status shortcut changed',
    matches: [/^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:dogfood:graph-db',
    reason: 'dogfood graph DB pack gate changed',
    matches: [/^scripts\/dogfood-graph-db-pack\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm benchmark --dry-run',
    reason: 'Codex benchmark runner config changed',
    matches: [/^scripts\/benchmark\.mjs$/],
  },
  {
    command: 'pnpm benchmark:change-flow --dry-run',
    reason: 'end-to-end meaning-to-change benchmark runner config changed',
    matches: [/^scripts\/benchmark-change-flow(?:\.test)?\.mjs$/],
  },
  {
    command: 'pnpm benchmark:scale --dry-run',
    reason: 'Codex scale benchmark runner config changed',
    matches: [/^scripts\/benchmark-scale\.mjs$/],
  },
  {
    command: 'node scripts/perf-vault.mjs 10',
    reason: 'vault parser perf smoke changed',
    matches: [/^scripts\/perf-vault\.mjs$/],
  },
  {
    command: 'node --test scripts/perf-graph.test.mjs',
    reason: 'graph compiler/query perf audit helper contract changed',
    matches: [/^scripts\/perf-graph\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm perf:graph:check',
    reason: 'graph compiler/query perf budget changed',
    matches: [/^scripts\/perf-graph\.mjs$/],
  },
  {
    command: 'pnpm perf:graph:scale',
    reason: 'graph compiler/query scale budget changed',
    matches: [/^scripts\/perf-graph\.mjs$/],
  },
  {
    command: 'pnpm smoke:onboarding',
    reason: 'clean onboarding smoke changed',
    matches: [/^scripts\/smoke-clean-onboarding\.mjs$/],
  },
  {
    command: 'pnpm smoke:memory-loop',
    reason: 'fresh repo memory loop smoke changed',
    matches: [/^scripts\/smoke-memory-loop\.mjs$/],
  },
  {
    command: 'pnpm exec tsc --noEmit',
    reason: 'TypeScript or Next.js static export config changed',
    /*
     * ⚠️ **Do not exclude test files** (corrected 2026-08-21).
     *
     * This used to exclude `.test.`/`.spec.` under `src/**` with a negative lookahead
     * and never looked at `tests/**` at all, presumably on the premise that tests do
     * not affect product types. But **`tsconfig.json`'s `include` is all of
     * `**\/*.ts`**, so CI's `tsc --noEmit` checks them — and **vitest does not check
     * types**. Anyone who edited only tests therefore had no way to meet a type error
     * locally, and it first went red in the `Types · Lint · Docs` job.
     *
     * It broke exactly that way (2026-08-21, `#1180`): a fake `spawn` stub added to a
     * contract test did not match `SpawnSyncReturns`. All 25 unit tests were green.
     *
     * This is what the repository already decided about gates: **wherever the check's
     * reach differs from the advisor's reach, that difference surfaces only in CI.**
     */
    matches: [
      /^app\/.*\.(?:ts|tsx)$/,
      /^next\.config\.ts$/,
      /^next-env\.d\.ts$/,
      /^src\/.*\.(?:ts|tsx)$/,
      /^tests\/.*\.(?:ts|tsx)$/,
      /^tsconfig\.json$/,
    ],
  },
  {
    // 2026-08-08 — a council fixed copy that falsely claimed a feature was app-only,
    // and the advisor suggested only `test:i18n:messages` (catalogue consistency). The
    // gate actually pinning that copy was **`check-desktop-readiness`**, and it went
    // red only in CI — even though local verification ran everything the tool asked
    // for.
    //
    // A message catalogue is not only the input of the consistency check. It is also
    // the input of the gates that read "what does this screen claim it can do".
    command: 'pnpm test:desktop:check',
    reason: 'message copy changed — the desktop routing gate reads these strings for capability claims',
    matches: [/^messages\/[^/]+\.json$/],
  },
  {
    command: 'pnpm test:i18n:messages',
    reason: 'locale routing or message catalog changed',
    matches: [
      /^messages\/[^/]+\.json$/,
      /^src\/i18n\/.*\.ts$/,
      /^scripts\/validate-messages\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm lint',
    reason: 'ESLint boundary or style rules changed',
    matches: [/^eslint\.config\.mjs$/],
  },
  {
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
  {
    command: 'pnpm decisions:check',
    reason: 'a route or design-spec surface moved — the decision ledger must move with it',
    matches: [/^app\/(?:.+\/)?(?:page|not-found)\.tsx$/],
  },
  {
    command: 'pnpm build',
    reason: 'static export config changed',
    matches: [/^next\.config\.ts$/],
  },
  {
    command: 'pnpm test:mcp:dogfood:timeout',
    reason: 'MCP dogfood timeout/argument diagnostics changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:dogfood',
    reason: 'MCP dogfood helper changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:verify:first-contact',
    reason: 'MCP verify first-contact helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:verify:timeout',
    reason: 'MCP verify timeout/startup diagnostics changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:verify',
    reason: 'MCP verify helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:maintenance',
    reason: 'maintenance_plan queue or formatter behavior changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/, /^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:suggestions',
    reason: 'MCP enum or argument suggestion behavior changed',
    matches: [/^mcp\/src\/suggestions\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:args',
    reason: 'CLI argument parser changed',
    matches: [/^cli\/src\/lib\/cli-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:mcp-call',
    reason: 'CLI MCP response wrapper changed',
    matches: [/^cli\/src\/lib\/mcp-call\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:lib',
    reason: 'CLI shared helper changed',
    matches: [/^cli\/src\/lib\//],
  },
  {
    command: 'pnpm integration:cli:entry',
    reason: 'CLI entrypoint, help, or init dispatch changed',
    matches: [/^cli\/src\/index\.mjs$/, /^cli\/src\/lib\/cli-commands\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:setup',
    reason: 'agent config merge, root rebind, or setup flow changed',
    matches: [
      /^cli\/src\/lib\/agent-config\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/commands\/agent-setup\.mjs$/,
    ],
  },
  {
    command: 'pnpm integration:cli',
    reason: 'CLI integration test harness or broad integration contract changed',
    matches: [/^cli\/src\/integration\.test\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:compile',
    reason: 'CLI compile command changed',
    matches: [/^cli\/src\/commands\/compile\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:mcp-verify',
    reason: 'CLI mcp-verify command changed',
    matches: [/^cli\/src\/commands\/mcp-verify\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:diagnosis',
    reason: 'CLI health/agent-brief/workspace-brief diagnosis command changed',
    matches: [/^cli\/src\/commands\/(?:health|agent-brief|workspace-brief)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:graph-read',
    reason: 'CLI graph read command changed',
    matches: [
      /^cli\/src\/commands\/(?:backlinks|path|all-paths|relation-check|orphans|query|overview|hubs|blast-radius|cycles|node-profile|similar)\.mjs$/,
      /^cli\/src\/lib\/query-plan-output\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm integration:cli:graph-write',
    reason: 'CLI graph write command changed',
    matches: [/^cli\/src\/commands\/(?:rename|delete|merge)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:repo-analysis',
    reason: 'CLI repo analysis or bootstrap command changed',
    matches: [/^cli\/src\/commands\/(?:analyze|infer-imports|architecture|bootstrap)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    command: 'pnpm integration:cli:local-vault',
    reason: 'CLI local vault/frontmatter command changed',
    matches: [/^cli\/src\/commands\/(?:add|import|list|find|validate)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:growth',
    reason: 'CLI growth command changed',
    matches: [/^cli\/src\/commands\/growth\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:maintenance',
    reason: 'CLI maintenance command changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:package',
    reason: 'package or release contract changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'public docs or dogfood ontology docs changed',
    matches: [
      /^README\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/CHANGELOG\.md$/,
      /^docs\/ontology\//,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^scripts\/check-package-contracts\.test\.mjs$/,
    ],
  },
  {
    /*
     * ⚠️ **Do not use a readout as a gate** (corrected by measurement, 2026-08-21).
     *
     * What used to be here was `pnpm dogfood:status`. That command exits **1 even when
     * the graph is merely immature** — its `health` child reports `needs_attention` for
     * "this project's competency answers are not filled in yet", while the output
     * itself says ***"Nothing is broken"***.
     *
     * Measured: **it is 1 on main too.** So every push that edited the vault was
     * blocked **for an unrelated reason** (this rule is wired into the pre-push hook,
     * and it really did block). Clearing that state (`finalize_project_meaning`) is
     * something the tool itself pins as **not to be done without human approval**, so an
     * agent cannot quietly step past it either.
     *
     * Instead the gate is **a check that only speaks when something is broken**:
     * `vault:validate` measures frontmatter integrity and graph references and fails
     * only when they are actually broken (CI uses it too). `dogfood:status` remains a
     * readout for a person — it is not removed, it is **taken out of the gate slot**.
     */
    command: 'pnpm vault:validate',
    reason: 'dogfood ontology or MCP/CLI dogfood surface changed',
    matches: [/^docs\/ontology\//, /^mcp\//, /^cli\//, /^scripts\/dogfood/],
  },
  {
    /*
     * **The gateway shows one vault file verbatim.** `/download`'s evidence section renders the
     * frontmatter of a pinned node and claims it is a file you can open in this repository. That
     * claim is only true while the committed generated copy matches the vault, so editing either
     * side has to re-run the generator.
     *
     * The specimen file itself is the obvious trigger, but so is **any** vault edit: the caption
     * states how many `kind:` nodes exist, which every added or deleted node changes.
     */
    command: 'pnpm gateway:specimen:check',
    reason: 'the vault feeds the gateway evidence specimen (file shown verbatim + node count)',
    matches: [
      /^docs\/ontology\//,
      /^scripts\/generate-evidence-specimen\.mjs$/,
      /^src\/views\/download\/model\/evidence-specimen\.generated\.ts$/,
    ],
  },
  {
    /*
     * **Vault markdown is drawn on screen.** `/docs` renders this folder as is, and so
     * do `samples/storefront` and `docs/guide`. So the prose written here is **product
     * copy**, not code, and it is within reach of the copy gate (no em dashes).
     *
     * ⚠️ Without this rule it was actually breached (2026-08-21): two vault nodes were
     * written with em dashes in the prose, `vault:validate` only looks at frontmatter
     * integrity so it passed, and the pre-push hook passed it too. It went red only
     * **after CI's Unit · Contract job had run for 7 minutes**. The integrity check and
     * the copy check **measure different things**, so neither substitutes for the
     * other.
     */
    command: 'pnpm test:run tests/contract/em-dash-ratchet.contract.test.ts',
    reason: 'rendered doc markdown changed (vault, guide, sample)',
    matches: [
      /^docs\/ontology\/.*\.md$/,
      /^docs\/guide\/.*\.md$/,
      /^docs\/CHANGELOG\.md$/,
      /^samples\/storefront\/.*\.md$/,
    ],
  },
  {
    /*
     * **A vault section that outgrows its cap is holding more than one idea.**
     *
     * Measured 2026-08-25: `capabilities/mcp-server.md` carried a single
     * `## Core Flow` of 12,865 bytes — five lines of flow followed by twenty-two
     * paragraphs of hard limits and fail-closed rules. Nothing there was wrong;
     * an agent simply had to read 12 KB named "Core Flow" to reach any rule.
     *
     * `vault:validate` checks frontmatter integrity and the em-dash ratchet
     * checks copy, so neither can see body shape. This is a third measurement.
     */
    command: 'pnpm test:run tests/contract/vault-section-shape.contract.test.ts',
    reason: 'vault node bodies changed — a section may now hold more than one idea',
    matches: [/^docs\/ontology\/.*\.md$/],
  },
];

const ESCALATIONS = [
  {
    command: 'pnpm package:check',
    reason: 'package manifests, docs contracts, or release scripts changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm dogfood:verify',
    reason: 'shared MCP/CLI verification surface changed',
    matches: [/^mcp\//, /^cli\/src\/commands\/mcp-verify\.mjs$/, /^scripts\/smoke-packed-cli\.mjs$/],
  },
];

const MCP_DIRECT_UNIT_TESTS = new Map([
  ['mcp/src/analyze.mjs', 'mcp/src/analyze.test.mjs'],
  ['mcp/src/architecture-profile.mjs', 'mcp/src/architecture-profile.test.mjs'],
  ['mcp/src/meaning-evaluation.mjs', 'mcp/src/meaning-evaluation.test.mjs'],
  ['mcp/src/construction-qualification.mjs', 'mcp/src/construction-qualification.test.mjs'],
  ['mcp/src/construction-lifecycle.mjs', 'mcp/src/construction-lifecycle.test.mjs'],
  ['mcp/src/infer-imports.mjs', 'mcp/src/infer-imports.test.mjs'],
  ['mcp/src/ontology-atlas-ignore.mjs', 'mcp/src/ontology-atlas-ignore.test.mjs'],
  ['mcp/src/ontology-compiler.mjs', 'mcp/src/ontology-compiler.test.mjs'],
  ['mcp/src/ontology-engine.mjs', 'mcp/src/ontology-engine.test.mjs'],
  ['mcp/src/parser.mjs', 'mcp/src/parser.test.mjs'],
  ['mcp/src/query.mjs', 'mcp/src/query.test.mjs'],
  ['mcp/src/suggestions.mjs', 'mcp/src/suggestions.test.mjs'],
  ['mcp/src/validate.mjs', 'mcp/src/validate.test.mjs'],
  ['mcp/src/vault.mjs', 'mcp/src/vault.test.mjs'],
  ['mcp/scripts/json-rpc-lines.mjs', 'mcp/src/json-rpc-lines.test.mjs'],
  ['tests/fixtures/source-hidden-field-trial/v1.json', 'mcp/src/source-hidden-field-trial.test.mjs'],
]);

const MCP_DIRECT_UNIT_TEST_FILES = new Set([
  ...MCP_DIRECT_UNIT_TESTS.values(),
  'mcp/src/redirect-backlinks.test.mjs',
  'mcp/src/conflict-detection.test.mjs',
  'mcp/src/json-rpc-lines.test.mjs',
  'mcp/src/source-hidden-field-trial.test.mjs',
]);

const CLI_DIRECT_LIB_TESTS = new Map([
  ['cli/src/lib/captured-summary.mjs', 'cli/src/lib/captured-summary.test.mjs'],
  ['cli/src/lib/cli-args.mjs', 'cli/src/lib/cli-args.test.mjs'],
  ['cli/src/lib/cli-commands.mjs', 'cli/src/lib/cli-commands.test.mjs'],
  ['cli/src/lib/diagnosis-colors.mjs', 'cli/src/lib/diagnosis-colors.test.mjs'],
  ['cli/src/lib/diagnosis-options.mjs', 'cli/src/lib/diagnosis-options.test.mjs'],
  ['cli/src/lib/import-analysis-results.mjs', 'cli/src/lib/import-analysis-results.test.mjs'],
  ['cli/src/lib/mcp-call.mjs', 'cli/src/lib/mcp-call.test.mjs'],
  ['cli/src/lib/mcp-metadata.mjs', 'cli/src/lib/mcp-metadata.test.mjs'],
  ['cli/src/lib/query-plan-output.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
  ['cli/src/lib/query-plan-output.test.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
  ['cli/src/lib/query-result-contract.mjs', 'cli/src/lib/query-result-contract.test.mjs'],
  ['cli/src/lib/repo-analysis-results.mjs', 'cli/src/lib/repo-analysis-results.test.mjs'],
  ['cli/src/lib/resolve-vault.mjs', 'cli/src/lib/resolve-vault.test.mjs'],
]);

const CLI_DIRECT_LIB_TEST_FILES = new Set(CLI_DIRECT_LIB_TESTS.values());

const SCRIPT_DIRECT_LIB_TESTS = new Map([
  ['scripts/audit-vault-paths.mjs', 'scripts/audit-vault-paths.test.mjs'],
  ['scripts/audit-vault-paths.test.mjs', 'scripts/audit-vault-paths.test.mjs'],
  ['scripts/build-docs-vault.mjs', 'scripts/build-docs-vault.test.mjs'],
  ['scripts/build-docs-vault.test.mjs', 'scripts/build-docs-vault.test.mjs'],
  ['scripts/resolve-docs-vault-conflicts.mjs', 'scripts/resolve-docs-vault-conflicts.test.mjs'],
  ['scripts/resolve-docs-vault-conflicts.test.mjs', 'scripts/resolve-docs-vault-conflicts.test.mjs'],
  ['scripts/check-desktop-readiness.mjs', 'scripts/check-desktop-readiness.test.mjs'],
  ['scripts/check-desktop-readiness.test.mjs', 'scripts/check-desktop-readiness.test.mjs'],
  ['scripts/check-ontology-design-surface.mjs', 'scripts/check-ontology-design-surface.test.mjs'],
  ['scripts/check-ontology-design-surface.test.mjs', 'scripts/check-ontology-design-surface.test.mjs'],
  ['scripts/desktop-doctor.mjs', 'scripts/desktop-doctor.test.mjs'],
  ['scripts/desktop-doctor.test.mjs', 'scripts/desktop-doctor.test.mjs'],
  ['scripts/desktop-smoke.mjs', 'scripts/desktop-smoke.test.mjs'],
  ['scripts/desktop-smoke.test.mjs', 'scripts/desktop-smoke.test.mjs'],
  ['scripts/lib/macos-dmg-layout.mjs', 'scripts/lib/macos-dmg-layout.test.mjs'],
  ['scripts/lib/macos-dmg-layout.test.mjs', 'scripts/lib/macos-dmg-layout.test.mjs'],
  ['scripts/lib/redact-command.mjs', 'scripts/lib/redact-command.test.mjs'],
  ['scripts/lib/redact-command.test.mjs', 'scripts/lib/redact-command.test.mjs'],
  ['scripts/dogfood-compile-fix.mjs', 'scripts/dogfood-compile-fix.test.mjs'],
  ['scripts/dogfood-compile-fix.test.mjs', 'scripts/dogfood-compile-fix.test.mjs'],
  ['scripts/dogfood-mcp-walk.mjs', 'scripts/dogfood-mcp-walk.test.mjs'],
  ['scripts/dogfood-mcp-walk.test.mjs', 'scripts/dogfood-mcp-walk.test.mjs'],
  ['scripts/dogfood-status.mjs', 'scripts/dogfood-status.test.mjs'],
  ['scripts/dogfood-status.test.mjs', 'scripts/dogfood-status.test.mjs'],
  ['scripts/dogfood-graph-db-pack.mjs', 'scripts/dogfood-graph-db-pack.test.mjs'],
  ['scripts/dogfood-graph-db-pack.test.mjs', 'scripts/dogfood-graph-db-pack.test.mjs'],
  ['scripts/run-focused-node-test.mjs', 'scripts/run-focused-node-test.test.mjs'],
  ['scripts/run-focused-node-test.test.mjs', 'scripts/run-focused-node-test.test.mjs'],
  ['scripts/lib/dogfood-args.mjs', 'scripts/lib/dogfood-args.test.mjs'],
  ['scripts/lib/dogfood-args.test.mjs', 'scripts/lib/dogfood-args.test.mjs'],
  ['scripts/lib/focused-check-suggestions.mjs', 'scripts/lib/focused-check-suggestions.test.mjs'],
  ['scripts/lib/pnpm-script-refs.mjs', 'scripts/lib/pnpm-script-refs.test.mjs'],
  ['scripts/lib/test-name-pattern.mjs', 'scripts/lib/test-name-pattern.test.mjs'],
  ['scripts/validate-messages.test.mjs', 'scripts/validate-messages.test.mjs'],
  ['scripts/validate-vault.mjs', 'scripts/validate-vault-script.test.mjs'],
  ['scripts/validate-vault-script.test.mjs', 'scripts/validate-vault-script.test.mjs'],
  ['scripts/check-package-contracts.mjs', 'scripts/check-package-contracts.test.mjs'],
  ['scripts/check-package-contracts.test.mjs', 'scripts/check-package-contracts.test.mjs'],
]);

const SCRIPT_DIRECT_LIB_TEST_FILES = new Set(SCRIPT_DIRECT_LIB_TESTS.values());

const FOCUSED_CHECK_DIRECT_TESTS = new Map([
  ['scripts/suggest-focused-checks.mjs', 'scripts/suggest-focused-checks.test.mjs'],
  ['scripts/suggest-focused-checks.test.mjs', 'scripts/suggest-focused-checks.test.mjs'],
]);

export function normalizeChangedPath(path) {
  return String(path || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

export function suggestFocusedChecks(paths = []) {
  const normalizedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const staticCommands = rulesToSuggestions(RULES, normalizedPaths);
  const withSourceLanguage = prependSuggestions(
    staticCommands,
    directSourceLanguageSuggestions(normalizedPaths),
  );
  const withVitestDirect = prependSuggestions(
    withSourceLanguage,
    directVitestTestSuggestions(normalizedPaths),
  );
  const withPlaywrightDirect = prependSuggestions(
    withVitestDirect,
    directPlaywrightTestSuggestions(normalizedPaths),
  );
  const withLintDirect = prependSuggestions(
    withPlaywrightDirect,
    directLintSuggestions(normalizedPaths),
  );
  const withMcpDirect = insertBeforeCommand(
    withLintDirect,
    directMcpUnitTestSuggestions(normalizedPaths),
    'pnpm test:mcp:unit',
  );
  const commands = insertBeforeCommand(
    withMcpDirect,
    directCliLibTestSuggestions(normalizedPaths),
    'pnpm test:cli:lib',
  );
  const withScriptDirect = insertBeforeCommand(
    commands,
    directScriptLibTestSuggestions(normalizedPaths),
    'pnpm test:dogfood:script-refs',
  );
  const withFocusedCheckDirect = insertBeforeCommand(
    withScriptDirect,
    directFocusedCheckTestSuggestions(normalizedPaths),
    'pnpm test:checks:changed',
  );
  const escalations = rulesToSuggestions(ESCALATIONS, normalizedPaths);
  return { paths: normalizedPaths, commands: withFocusedCheckDirect, escalations };
}

function directSourceLanguageSuggestions(paths) {
  const sourcePaths = paths.filter(isSupportedSourcePath);
  if (sourcePaths.length === 0) return [];
  return [
    {
      command: 'pnpm source:language',
      reason: 'source comments are English-only across current code, tests, and prototypes',
      paths: sourcePaths,
    },
  ];
}

function directVitestTestSuggestions(paths) {
  const pathSet = new Set(paths);
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = resolveVitestTestFile(path, pathSet);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec vitest run ${testFile}`,
      reason: 'direct Vitest sibling test for changed app/source file',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

/**
 * Runs **ESLint directly** on changed `src/**` and `app/**` sources.
 *
 * In this repository the design-system spec (type, radius, leading, motion, and
 * shadow ramps; forbidden gradients; accent×tint pairing; FSD boundaries) is
 * enforced by `no-restricted-syntax`, not by a document. Yet in the 2026-08-04
 * field trial this advisor suggested only tsc, contracts, and i18n for a new `.tsx`
 * view and **never once suggested lint** — the gate carrying the spec was absent
 * from the list.
 *
 * It runs on **the changed files only**, not the whole `pnpm lint`. The full run is
 * an escalation; what is needed here is an immediate answer to "is the screen I
 * just wrote inside the spec".
 */
function directLintSuggestions(paths) {
  const lintable = paths.filter((path) => /^(?:src|app)\/.+\.(?:ts|tsx)$/.test(path));
  if (lintable.length === 0) return [];
  return [
    {
      command: `pnpm exec eslint ${lintable.join(' ')}`,
      reason: 'design-system ramps and FSD boundaries are lint-enforced on changed source',
      paths: lintable,
    },
  ];
}

function directPlaywrightTestSuggestions(paths) {
  return paths
    .filter((path) => /^tests\/e2e\/.+\.spec\.ts$/.test(path))
    .map((path) => ({
      command: `pnpm exec playwright test ${path}`,
      reason: 'direct Playwright spec for changed e2e test',
      paths: [path],
    }));
}

function resolveVitestTestFile(path, pathSet) {
  if (!/^(?:src|app)\//.test(path)) return null;
  if (!/\.(?:ts|tsx)$/.test(path)) return null;
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(path)) return path;

  const testFile = path.replace(/\.(tsx?)$/, '.test.$1');
  if (pathSet.has(testFile) || existsSync(testFile)) return testFile;
  return null;
}

function resolveMcpUnitTestFile(path, pathSet) {
  const mapped = MCP_DIRECT_UNIT_TESTS.get(path);
  if (mapped) return mapped;
  if (MCP_DIRECT_UNIT_TEST_FILES.has(path)) return path;
  if (/^mcp\/src\/(?!integration\.test\.mjs$)[^/]+\.test\.mjs$/.test(path)) return path;
  if (!/^mcp\/src\/[^/]+\.(?:mjs|js)$/.test(path)) return null;
  const testFile = path.replace(/\.(?:mjs|js)$/, '.test.mjs');
  return pathSet.has(testFile) || existsSync(testFile) ? testFile : null;
}

function directMcpUnitTestSuggestions(paths) {
  const byTestFile = new Map();
  const pathSet = new Set(paths);
  for (const path of paths) {
    const testFile = resolveMcpUnitTestFile(path, pathSet);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct MCP unit test for changed source or test',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directCliLibTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = CLI_DIRECT_LIB_TESTS.get(path) ?? (CLI_DIRECT_LIB_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct CLI lib unit test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directScriptLibTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = SCRIPT_DIRECT_LIB_TESTS.get(path) ?? (SCRIPT_DIRECT_LIB_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct script helper unit test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directFocusedCheckTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = FOCUSED_CHECK_DIRECT_TESTS.get(path);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct focused-check advisor test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function prependSuggestions(suggestions, additions) {
  if (additions.length === 0) return suggestions;
  const existing = new Set(suggestions.map((item) => item.command));
  const uniqueAdditions = additions.filter((item) => !existing.has(item.command));
  return [...uniqueAdditions, ...suggestions];
}

function insertBeforeCommand(suggestions, additions, command) {
  if (additions.length === 0) return suggestions;
  const seen = new Set();
  const uniqueAdditions = additions.filter((item) => {
    if (seen.has(item.command)) return false;
    seen.add(item.command);
    return true;
  });
  const index = suggestions.findIndex((item) => item.command === command);
  if (index === -1) return [...uniqueAdditions, ...suggestions];
  return [
    ...suggestions.slice(0, index),
    ...uniqueAdditions,
    ...suggestions.slice(index),
  ];
}

function rulesToSuggestions(rules, paths) {
  const seen = new Set();
  const suggestions = [];
  for (const rule of rules) {
    const matchedPaths = paths.filter((path) => rule.matches.some((pattern) => pattern.test(path)));
    if (matchedPaths.length === 0 || seen.has(rule.command)) continue;
    seen.add(rule.command);
    suggestions.push({ command: rule.command, reason: rule.reason, paths: matchedPaths });
  }
  return suggestions;
}

export function formatFocusedCheckSuggestions({ paths = [], commands = [], escalations = [] } = {}) {
  if (paths.length === 0) {
    return [
      '[focused-checks] no changed paths against HEAD or untracked files',
      'Use `pnpm checks:changed -- <path...>` to inspect a planned file set.',
    ].join('\n');
  }
  const lines = [
    `[focused-checks] ${paths.length} changed path${paths.length === 1 ? '' : 's'}`,
  ];
  if (commands.length === 0) {
    lines.push('First checks: no focused mapping; do not jump to the full suite by default.');
    lines.push('Choose the nearest area from docs/DEVELOPMENT-CHECKS.md, then escalate only for concrete uncovered risk.');
  } else {
    lines.push('First checks:');
    for (const suggestion of commands) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
    lines.push('Run these before broad lint/build/test; escalate only when the change risk requires it.');
  }
  if (escalations.length > 0) {
    lines.push('Escalate when needed:');
    for (const suggestion of escalations) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  return lines.join('\n');
}

/** Design gates: tokens, the design-system document, the ontology design surface, and design proof routing. */

const UI_AUDIT_PATHS = [
  /^scripts\/design\/ui-audit(?:\.test)?\.mjs$/,
  /^scripts\/lib\/design\/ui-audit-(?:probe|checks)\.mjs$/,
];

export const rules = [
  {
    order: 90,
    command: 'pnpm check:tokens',
    reason: 'styles or ramp registries changed — the raw-color and token gates apply',
    matches: [/^app\/(?:globals|styles\/[^/]+)\.css$/, /^src\/.+\.css$/, /^src\/shared\/lib\/cn\.ts$/],
  },
  {
    order: 92,
    command:
      'pnpm exec vitest run tests/contract/design-tokens/unused-token-ratchet.contract.test.ts tests/contract/design-tokens/undeclared-token-ref.contract.test.ts tests/contract/design-tokens/design-doc-token-integrity.contract.test.ts',
    reason: 'the global stylesheet changed — the token gates read it whole, whatever else the diff holds',
    matches: [/^app\/(?:globals|styles\/[^/]+)\.css$/],
  },
  {
    order: 100,
    command: 'pnpm design:toc:check',
    reason: 'the design system document changed and its table of contents is generated',
    matches: [/^docs\/DESIGN-SYSTEM\.md$/],
  },
  {
    order: 105,
    command: 'pnpm test:design:tokens',
    reason: 'the token printer or its tests changed',
    matches: [/^scripts\/design\/design-tokens(?:\.test)?\.mjs$/],
  },
  {
    order: 110,
    command: 'pnpm test:ui:audit',
    reason: 'the rendered audit collector or numerical judge changed',
    matches: UI_AUDIT_PATHS,
  },
  {
    order: 115,
    command: 'pnpm exec playwright test tests/e2e/design-audits/ui-audit-probe.spec.ts',
    reason: 'audit reachability and visibility need real DOM geometry with planted defects',
    matches: UI_AUDIT_PATHS,
  },
  {
    order: 360,
    command: 'pnpm design:ontology',
    reason: 'ontology workbench design surface or its guard changed',
    matches: [
      /^scripts\/design\/check-ontology-design-surface\.(?:mjs|test\.mjs)$/,
      /^scripts\/quality\/source-language\/(?:inventory|source-paths)\.mjs$/,
      /^src\/views\/ontology-insights\//,
    ],
  },
  {
    order: 670,
    command: 'pnpm test:design-gates',
    reason: 'Atlas design proof routing, iterative Computer Use contract, motion evidence, or independent-review lens policy changed',
    matches: [
      /^scripts\/(?:lib\/)?design\/design-proof-router\.mjs$/,
      /^scripts\/(?:lib\/design\/design-spec-census|records\/check-decision-record)\.mjs$/,
      /^tests\/contract\/agent-instructions\/(?:design-(?:proof-router|spec-ledger)|reviewer-wiring)\.contract\.test\.ts$/,
      /^docs\/PRODUCT-DESIGN-OPERATING-SYSTEM\.md$/,
      /^docs\/engineering\/motion-recording\.md$/,
      /^\.(?:claude|agents)\/skills\/(?:ui-build|ui-proof)\/(?:SKILL\.md|workflow\.md|guides\/[^/]+\.md)$/,
      /^\.(?:claude|agents)\/agents\/(?:reviewer|design-guardian)\.md$/,
      /^\.claude\/rules\/design\.md$/,
      /^AGENTS\.md$/,
      /^package\.json$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/design/check-ontology-design-surface.mjs', 'scripts/design/check-ontology-design-surface.test.mjs'],
    ['scripts/design/check-ontology-design-surface.test.mjs', 'scripts/design/check-ontology-design-surface.test.mjs'],
  ],
};

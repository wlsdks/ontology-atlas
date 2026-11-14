/** Design gates: tokens, the design-system document, the ontology design surface, and design proof routing. */

const UI_AUDIT_PATHS = [
  /^scripts\/design\/ui-(?:audit|look)(?:\.test)?\.mjs$/,
  /^scripts\/design\/look\/[^/]+\.mjs$/,
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
      'pnpm exec vitest run tests/contract/design-tokens/undeclared-token-ref.contract.test.ts tests/contract/design-tokens/design-doc-token-integrity.contract.test.ts',
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
    ],
  },
  {
    order: 670,
    command: 'pnpm exec vitest run tests/contract/agent-instructions/design-build-recipe.contract.test.ts',
    reason: 'the /ui-build or /ui-proof procedure changed; every primitive and gate it names must exist',
    matches: [
      /^\.(?:claude|agents)\/skills\/(?:ui-build|ui-proof)\/(?:SKILL\.md|workflow\.md|guides\/[^/]+\.md)$/,
      /^tests\/contract\/agent-instructions\/design-build-recipe\.contract\.test\.ts$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/design/check-ontology-design-surface.mjs', 'scripts/design/check-ontology-design-surface.test.mjs'],
    ['scripts/design/check-ontology-design-surface.test.mjs', 'scripts/design/check-ontology-design-surface.test.mjs'],
  ],
};

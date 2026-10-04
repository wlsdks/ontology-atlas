/** Design gates: tokens, the design-system document, the ontology design surface, and design proof routing. */

export const rules = [
  {
    order: 90,
    // 2026-09-01 review: check:tokens and design:toc:check were unconditional
    // CI steps before the impact-aware rework and existed afterwards only in
    // the push-to-main full lane — a raw color slipping into globals.css or a
    // stale DESIGN-SYSTEM.md table of contents merged green and turned main
    // red after the fact.
    command: 'pnpm check:tokens',
    reason: 'styles or ramp registries changed — the raw-color and token gates apply',
    matches: [/^app\/(?:globals|styles\/[^/]+)\.css$/, /^src\/.+\.css$/, /^src\/shared\/lib\/cn\.ts$/],
  },
  {
    order: 92,
    command:
      'pnpm exec vitest run tests/contract/unused-token-ratchet.contract.test.ts tests/contract/undeclared-token-ref.contract.test.ts tests/contract/design-doc-token-integrity.contract.test.ts',
    reason: 'the global stylesheet changed — the token gates read it whole, whatever else the diff holds',
    matches: [/^app\/(?:globals|styles\/[^/]+)\.css$/],
  },
  {
    order: 95,
    // Every token gate and spec census reads the split stylesheet through this
    // reader; a wrong join would blind all of them at once.
    command: 'node --test scripts/lib/global-css.test.mjs && pnpm exec vitest related --run scripts/lib/global-css.mjs',
    reason: 'the stylesheet reader changed — its own tests and every gate that reads CSS through it',
    matches: [/^scripts\/lib\/global-css(?:\.test)?\.mjs$/],
  },
  {
    order: 100,
    command: 'pnpm design:toc:check',
    reason: 'the design system document changed and its table of contents is generated',
    matches: [/^docs\/DESIGN-SYSTEM\.md$/],
  },
  {
    order: 360,
    command: 'pnpm design:ontology',
    reason: 'ontology workbench design surface or its guard changed',
    matches: [
      /^scripts\/check-ontology-design-surface\.(?:mjs|test\.mjs)$/,
      /^scripts\/quality\/source-language\/(?:inventory|source-paths)\.mjs$/,
      /^src\/views\/ontology-insights\//,
    ],
  },
  {
    order: 670,
    command: 'pnpm test:design-gates',
    reason: 'Atlas design proof routing, iterative Computer Use contract, motion evidence, or independent-review lens policy changed',
    matches: [
      /^scripts\/(?:lib\/design-proof-router|design-proof-router)\.mjs$/,
      /^scripts\/(?:lib\/design-spec-census|check-decision-record)\.mjs$/,
      /^tests\/contract\/(?:design-(?:proof-router|spec-ledger)|reviewer-wiring)\.contract\.test\.ts$/,
      /^docs\/PRODUCT-DESIGN-OPERATING-SYSTEM\.md$/,
      /^docs\/engineering\/motion-recording\.md$/,
      /^\.(?:claude|agents)\/skills\/(?:design-(?:audit|build|directions|system-audit)|motion-verify|responsive-sweep|map-perf|user-walkthrough)\/(?:SKILL|workflow)\.md$/,
      /^\.(?:claude|agents)\/agents\/(?:reviewer|design-guardian)\.md$/,
      /^\.claude\/rules\/design\.md$/,
      /^AGENTS\.md$/,
      /^package\.json$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/check-ontology-design-surface.mjs', 'scripts/check-ontology-design-surface.test.mjs'],
    ['scripts/check-ontology-design-surface.test.mjs', 'scripts/check-ontology-design-surface.test.mjs'],
  ],
};

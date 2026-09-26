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
    matches: [/^app\/globals\.css$/, /^src\/.+\.css$/, /^src\/shared\/lib\/cn\.ts$/],
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
      /^src\/views\/ontology-insights\//,
    ],
  },
  {
    order: 670,
    command: 'pnpm test:design-gates',
    reason: 'Atlas design proof routing, iterative Computer Use contract, motion evidence, or selected-seat council policy changed',
    matches: [
      /^scripts\/(?:lib\/design-proof-router|design-proof-router)\.mjs$/,
      /^scripts\/(?:lib\/design-spec-census|check-decision-record)\.mjs$/,
      /^tests\/contract\/design-(?:proof-router|council|spec-ledger)\.contract\.test\.ts$/,
      /^docs\/PRODUCT-DESIGN-OPERATING-SYSTEM\.md$/,
      /^\.(?:claude|agents)\/skills\/(?:design-(?:audit|build|council|directions|system-audit)|motion-verify|responsive-sweep|map-perf|user-walkthrough)\/SKILL\.md$/,
      /^\.(?:claude|agents)\/agents\/(?:chief|design-(?:lead|system|interaction|motion|infoviz|workbench|responsive|handoff|guardian))\.md$/,
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

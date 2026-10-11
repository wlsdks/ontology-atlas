/** CI planning and landing: the impact planner, Playwright allocation, pre-push, the lander, and this advisor itself. */

/**
 * The one list of files that ARE the CI planner. `classify-change.mjs` imports it as its full-plan
 * trigger (PLANNER_SURFACE), so that promise and the `test:ci:impact` rule cannot drift apart. The
 * rule files here are planner surface too.
 */
export const BROWSER_EXECUTION_SURFACE_PATTERNS = Object.freeze([
  /^scripts\/run-playwright-ci(?:\.test)?\.mjs$/,
  /^scripts\/data\/playwright-file-durations\.json$/,
]);

export const CI_PLANNER_SURFACE_PATTERNS = Object.freeze([
  /^scripts\/(?:lib\/)?reviewed-main-push(?:\.test)?\.mjs$/,
  /^scripts\/fixtures\/reviewed-main-push\.json$/,
  /^scripts\/classify-change(?:\.test)?\.mjs$/,
  /^scripts\/run-ci-lane(?:\.test)?\.mjs$/,
  /^scripts\/lib\/focused-check-suggestions(?:\.test)?\.mjs$/,
  /^scripts\/lib\/check-rules\//,
  /^scripts\/lib\/import-graph\//,
  /^scripts\/suggest-focused-checks(?:\.test)?\.mjs$/,
  /^\.github\/workflows\/(?:checks|e2e)\.yml$/,
  /^\.github\/actions\/setup-playwright\/action\.yml$/,
]);

export const rules = [
  {
    order: 50,
    command: 'node --test scripts/run-playwright-ci.test.mjs',
    reason: 'browser file allocation, coverage verification, or timing estimates changed',
    matches: [/^scripts\/run-playwright-ci(?:\.test)?\.mjs$/, /^scripts\/data\/playwright-file-durations\.json$/, /^scripts\/refresh-playwright-durations\.mjs$/, /^scripts\/run-ci-lane(?:\.test)?\.mjs$/],
  },
  {
    order: 55,
    command: 'node --test scripts/gate-yield.test.mjs',
    reason: 'the CI gate-yield report or its aggregation changed',
    matches: [/^scripts\/gate-yield(?:\.test)?\.mjs$/],
  },
  { order: 60, command: 'node --test scripts/prepush.test.mjs', reason: 'pre-push scope or failure propagation changed', matches: [/^scripts\/prepush(?:-unit-plan)?(?:\.test)?\.mjs$/, /^scripts\/lib\/prepush\//, /^\.githooks\/pre-push$/, /^scripts\/suggest-focused-checks\.mjs$/] },
  {
    order: 70,
    command: 'pnpm test:ci:impact',
    reason: 'CI impact planner, executor, or workflow wiring changed',
    matches: [...CI_PLANNER_SURFACE_PATTERNS, ...BROWSER_EXECUTION_SURFACE_PATTERNS],
  },
  {
    order: 80,
    command: 'pnpm test:pr:land',
    reason: 'the landing sequence or its state machine changed',
    matches: [/^scripts\/pr-land(?:\.test)?\.mjs$/, /^scripts\/lib\/landing-train(?:\.test)?\.mjs$/],
  },
  {
    order: 640,
    command: 'pnpm test:checks:changed',
    reason: 'changed-path focused-check advisor changed',
    matches: [
      /^scripts\/lib\/focused-check-suggestions\.(?:mjs|test\.mjs)$/,
      /^scripts\/suggest-focused-checks\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/check-rules\//,
      /^scripts\/lib\/import-graph\//,
    ],
  },
  {
    order: 680,
    command: 'pnpm exec node --test scripts/classify-change.test.mjs',
    reason: 'the CI change classifier decides what CI runs at all',
    matches: [/^scripts\/classify-change\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 690,
    command:
      'pnpm exec vitest run tests/contract/e2e-change-scope.contract.test.ts tests/contract/e2e-suite-split.contract.test.ts tests/contract/ci-bounded-network.contract.test.ts',
    reason:
      'E2E scope, required-check liveness, suite split, or bounded Playwright preparation changed',
    matches: [
      /^\.github\/workflows\/e2e\.yml$/,
      /^\.github\/actions\/setup-playwright\/action\.yml$/,
      /^tests\/contract\/(?:e2e-change-scope|e2e-suite-split|ci-bounded-network)\.contract\.test\.ts$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/lib/run-main-copy.mjs', 'scripts/lib/run-main-copy.test.mjs'],
    ['scripts/lib/run-main-copy.test.mjs', 'scripts/lib/run-main-copy.test.mjs'],
    ['scripts/lib/playwright-server-owner.mjs', 'scripts/lib/playwright-server-owner.test.mjs'],
    ['scripts/lib/playwright-server-owner.test.mjs', 'scripts/lib/playwright-server-owner.test.mjs'],
    ['scripts/bundle-branches.mjs', 'scripts/bundle-branches.test.mjs'],
    ['scripts/bundle-branches.test.mjs', 'scripts/bundle-branches.test.mjs'],
    ['scripts/lib/focused-check-suggestions.mjs', 'scripts/lib/focused-check-suggestions.test.mjs'],
  ],
  focusedCheck: [
    ['scripts/suggest-focused-checks.mjs', 'scripts/suggest-focused-checks.test.mjs'],
    ['scripts/suggest-focused-checks.test.mjs', 'scripts/suggest-focused-checks.test.mjs'],
  ],
};

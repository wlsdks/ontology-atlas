/** CI planning and landing: the impact planner, Playwright allocation, pre-push, the lander, and this advisor itself. */

/**
 * The one list of files that ARE the CI planner. `classify-change.mjs` imports it as its full-plan
 * trigger (PLANNER_SURFACE), so that promise and the `test:ci:impact` rule cannot drift apart. The
 * rule files here are planner surface too.
 */
export const BROWSER_EXECUTION_SURFACE_PATTERNS = Object.freeze([
  /^scripts\/ci\/run-playwright-ci(?:\.test)?\.mjs$/,
  /^scripts\/data\/playwright-file-durations\.json$/,
]);

export const CI_PLANNER_SURFACE_PATTERNS = Object.freeze([
  /^scripts\/(?:lib\/)?ci\/reviewed-main-push(?:\.test)?\.mjs$/,
  /^scripts\/fixtures\/reviewed-main-push\.json$/,
  /^scripts\/ci\/classify-change(?:\.test)?\.mjs$/,
  /^scripts\/ci\/run-ci-lane(?:\.test)?\.mjs$/,
  /^scripts\/lib\/ci\/focused-check-suggestions(?:\.test)?\.mjs$/,
  /^scripts\/lib\/check-rules\//,
  /^scripts\/lib\/import-graph\//,
  /^scripts\/ci\/suggest-focused-checks(?:\.test)?\.mjs$/,
  /^\.github\/workflows\/(?:checks|e2e)\.yml$/,
  /^\.github\/actions\/setup-playwright\/action\.yml$/,
]);

export const rules = [
  {
    order: 50,
    command: 'node --test scripts/ci/run-playwright-ci.test.mjs',
    reason: 'browser file allocation, coverage verification, or timing estimates changed',
    matches: [/^scripts\/ci\/run-playwright-ci(?:\.test)?\.mjs$/, /^scripts\/data\/playwright-file-durations\.json$/, /^scripts\/ci\/refresh-playwright-durations\.mjs$/, /^scripts\/ci\/run-ci-lane(?:\.test)?\.mjs$/],
  },
  {
    order: 55,
    command: 'node --test scripts/ci/gate-yield.test.mjs',
    reason: 'the CI gate-yield report or its aggregation changed',
    matches: [/^scripts\/ci\/gate-yield(?:\.test)?\.mjs$/],
  },
  { order: 60, command: 'node --test scripts/ci/prepush.test.mjs', reason: 'pre-push scope or failure propagation changed', matches: [/^scripts\/ci\/prepush(?:-unit-plan)?(?:\.test)?\.mjs$/, /^scripts\/lib\/prepush\//, /^\.githooks\/pre-push$/, /^scripts\/ci\/suggest-focused-checks\.mjs$/] },
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
    matches: [/^scripts\/landing\/pr-land(?:\.test)?\.mjs$/, /^scripts\/lib\/landing\/landing-train(?:\.test)?\.mjs$/],
  },
  {
    order: 640,
    command: 'pnpm test:checks:changed',
    reason: 'changed-path focused-check advisor changed',
    matches: [
      /^scripts\/lib\/ci\/focused-check-suggestions\.(?:mjs|test\.mjs)$/,
      /^scripts\/ci\/suggest-focused-checks\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/check-rules\//,
      /^scripts\/lib\/import-graph\//,
    ],
  },
  {
    order: 680,
    command: 'pnpm exec node --test scripts/ci/classify-change.test.mjs',
    reason: 'the CI change classifier decides what CI runs at all',
    matches: [/^scripts\/ci\/classify-change\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 690,
    command:
      'pnpm exec vitest run tests/contract/ci-gates/e2e-change-scope.contract.test.ts tests/contract/ci-gates/e2e-suite-split.contract.test.ts tests/contract/ci-gates/ci-bounded-network.contract.test.ts',
    reason:
      'E2E scope, required-check liveness, suite split, or bounded Playwright preparation changed',
    matches: [
      /^\.github\/workflows\/e2e\.yml$/,
      /^\.github\/actions\/setup-playwright\/action\.yml$/,
      /^tests\/contract\/ci-gates\/(?:e2e-change-scope|e2e-suite-split|ci-bounded-network)\.contract\.test\.ts$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/lib/landing/run-main-copy.mjs', 'scripts/lib/landing/run-main-copy.test.mjs'],
    ['scripts/lib/landing/run-main-copy.test.mjs', 'scripts/lib/landing/run-main-copy.test.mjs'],
    ['scripts/lib/ci/playwright-server-owner.mjs', 'scripts/lib/ci/playwright-server-owner.test.mjs'],
    ['scripts/lib/ci/playwright-server-owner.test.mjs', 'scripts/lib/ci/playwright-server-owner.test.mjs'],
    ['scripts/landing/bundle-branches.mjs', 'scripts/landing/bundle-branches.test.mjs'],
    ['scripts/landing/bundle-branches.test.mjs', 'scripts/landing/bundle-branches.test.mjs'],
    ['scripts/lib/ci/focused-check-suggestions.mjs', 'scripts/lib/ci/focused-check-suggestions.test.mjs'],
  ],
  focusedCheck: [
    ['scripts/ci/suggest-focused-checks.mjs', 'scripts/ci/suggest-focused-checks.test.mjs'],
    ['scripts/ci/suggest-focused-checks.test.mjs', 'scripts/ci/suggest-focused-checks.test.mjs'],
  ],
};

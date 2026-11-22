/** Recorded gh output for the landing tests: a rollup with eleven contexts (eight required), draft and green variants, and a recorded pull request. */

/**
 * The landing train, driven by recorded `gh` output and a fake GitHub; no network. The recorded
 * rollup has eleven contexts, eight required, one required context red: a lander counting "ten of
 * eleven green" would merge it.
 */
export const REQUIRED_CONTEXTS = [
  'Types · Lint · Docs',
  'Unit · Contract',
  'MCP',
  'Playwright (static export)',
  'Playwright (web surface)',
  'Playwright (chromium 1/3)',
  'Playwright (chromium 2/3)',
  'Playwright (chromium 3/3)',
];

export const RECORDED_ROLLUP = [
  { __typename: 'CheckRun', name: 'Check impact plan', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' },
  { __typename: 'CheckRun', name: 'E2E impact plan', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'Vault freshness check', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Vault freshness' },
  { __typename: 'CheckRun', name: 'Types · Lint · Docs', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' },
  { __typename: 'CheckRun', name: 'Playwright (static export)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  {
    __typename: 'CheckRun',
    name: 'Unit · Contract',
    status: 'COMPLETED',
    conclusion: 'FAILURE',
    detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34686397014/job/103534040573',
    workflowName: 'Checks',
  },
  { __typename: 'CheckRun', name: 'Playwright (web surface)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'MCP', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' },
  { __typename: 'CheckRun', name: 'Playwright (chromium 1/3)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'Playwright (chromium 2/3)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'Playwright (chromium 3/3)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
];

export const GREEN_ROLLUP = RECORDED_ROLLUP.map((run) =>
  run.name === 'Unit · Contract' ? { ...run, conclusion: 'SUCCESS', detailsUrl: undefined } : run,
);

/**
 * What a draft pull request's checks look like: every job carries
 * `github.event.pull_request.draft == false`, so GitHub reports them `skipped`, and branch
 * protection counts a skipped job as satisfied.
 */
export const DRAFT_ROLLUP = REQUIRED_CONTEXTS.map((name) => ({
  __typename: 'CheckRun',
  name,
  status: 'COMPLETED',
  conclusion: 'SKIPPED',
}));

/** `gh pr view 1572 --json ...`, recorded. */
export const RECORDED_PR = {
  baseRefName: 'main',
  headRefName: 'fix/route-arrival-flicker',
  headRefOid: 'f52a59c49a139c9edcfdcedc00464bd163081643',
  isCrossRepository: false,
  isDraft: false,
  mergeStateStatus: 'BLOCKED',
  mergeable: 'MERGEABLE',
  number: 1572,
  state: 'OPEN',
  statusCheckRollup: RECORDED_ROLLUP,
  title: 'fix(app): the right pane arrives painted, without a flash, on every rail transition',
  url: 'https://github.com/wlsdks/ontology-atlas/pull/1572',
};

export const readyPr = (overrides = {}) => ({
  ...RECORDED_PR,
  isDraft: false,
  mergeStateStatus: 'CLEAN',
  statusCheckRollup: GREEN_ROLLUP,
  ...overrides,
});

export const ROLLUP_WITH_RED_UNREQUIRED = [
  ...REQUIRED_CONTEXTS.map((name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' })),
  {
    __typename: 'CheckRun',
    name: 'Verify unsigned Windows x64 beta',
    status: 'COMPLETED',
    conclusion: 'FAILURE',
    detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34720027112/job/103625133745',
    workflowName: 'Windows x64 Beta Check',
  },
];

export const green = () => REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-09-26T10:00:00Z' }));
export const red = (names, runId = 777) => REQUIRED_CONTEXTS.map((name) => ({
  name,
  status: 'COMPLETED',
  conclusion: names.includes(name) ? 'FAILURE' : 'SUCCESS',
  startedAt: '2026-09-26T10:00:00Z',
  detailsUrl: `https://github.com/wlsdks/ontology-atlas/actions/runs/${runId}/job/1`,
}));

#!/usr/bin/env node

// End-to-end meaning-to-change benchmark.
//
// The earlier lifecycle benchmark measured only whether a prepared Atlas vault
// improved a final answer. This runner lets the agent make a small, fixed code
// change and then measures the repository outcome: tests, scope, commit, local
// push, merge/recovery, post-merge tests, ontology freshness, and owned cleanup.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMarkdown } from '../mcp/src/parser.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MCP_SERVER = join(REPO_ROOT, 'mcp/src/index.js');
const DEFAULT_OUTPUT_ROOT = join(REPO_ROOT, 'docs/benchmark/results');

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changedFiles', 'testCommand', 'commitSubject', 'atlasAction', 'unknowns'],
  properties: {
    summary: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    testCommand: { type: 'string' },
    commitSubject: { type: 'string' },
    atlasAction: { type: 'string' },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
};

const ACK_BASELINE_LINE = '  return ' + '`' + '${record.member} acknowledged \\`${record.decision}\\`' + '`;';
const ACK_BASELINE_SOURCE = [
  'export function formatAcknowledgement(record) {',
  ACK_BASELINE_LINE,
  '}',
  '',
].join('\n');
const CHECKOUT_CHANGE_MARKER = '- The confirmed total now accepts non-negative integer discountCents and clamps at zero.';
const ACKNOWLEDGEMENT_CHANGE_MARKER = '- Acknowledgements now render a trimmed non-blank note after the decision.';

const CASES = Object.freeze([
  Object.freeze({
    id: 'greenfield',
    label: 'greenfield-shaped purchase project',
    projectSlug: 'projects/green-cart',
    featureBranch: 'benchmark/greenfield-change',
    conflict: false,
    sourceFiles: Object.freeze({
      'src/checkout.mjs': `export function confirmPurchase(totalCents, inventoryAvailable) {
  if (!inventoryAvailable) throw new Error('inventory unavailable');
  return totalCents;
}
`,
      'src/inventory.mjs': `export function isSellable(inventoryAvailable) {
  return inventoryAvailable === true;
}
`,
      'test/checkout.test.mjs': `import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmPurchase } from '../src/checkout.mjs';

test('confirms an available purchase at its current total', () => {
  assert.equal(confirmPurchase(1200, true), 1200);
});

test('refuses a purchase when inventory is unavailable', () => {
  assert.throws(() => confirmPurchase(1200, false), /inventory unavailable/);
});
`,
    }),
    task: `Implement this approved change in the repository:

- Extend confirmPurchase(totalCents, inventoryAvailable) so it accepts a third options argument with discountCents.
- A non-negative integer discountCents reduces the confirmed total but never below zero.
- Reject a negative or non-integer discountCents with RangeError.
- Keep inventory availability as a separate responsibility; do not move code into src/inventory.mjs.
- Add focused tests for the new behavior while keeping the existing tests.
- After the code tests pass, use Atlas MCP \`patch_concept\` on \`capabilities/checkout\` to append exactly this section to the existing body (preserve all existing frontmatter and body text):
  ## Change record
  ${CHECKOUT_CHANGE_MARKER}
- Then use Atlas MCP \`validate_vault\` and \`compile_ontology\` to verify the updated vault. Do not add, rename, delete, or directly edit any other Atlas file.

Run exactly: node --test test/checkout.test.mjs
Review the diff, commit only the intended files with the conventional subject \`feat: add checkout discount handling\`, and do not push or merge; the harness will verify those steps.`,
    testCommand: Object.freeze([process.execPath, '--test', 'test/checkout.test.mjs']),
    expectedFiles: Object.freeze(['src/checkout.mjs', 'test/checkout.test.mjs']),
    ontologyFile: 'atlas/capabilities/checkout.md',
    ontologyMarker: CHECKOUT_CHANGE_MARKER,
    conflictPath: 'src/checkout.mjs',
    conflictMarker: Object.freeze({
      from: 'export function confirmPurchase(totalCents, inventoryAvailable) {',
      to: "export function confirmPurchase(totalCents, inventoryAvailable, currency = 'USD') {",
    }),
    nodes: Object.freeze([
      node({
        slug: 'projects/green-cart',
        kind: 'project',
        title: 'Green Cart',
        frontmatter: { domains: ['domains/inventory', 'domains/purchase'], path: '.' },
        body: '# Green Cart\n\n## Definition\nA small commerce project that confirms purchases while preserving sellable inventory boundaries.\n\n## Uncertainty\nRuntime behavior beyond the named tests remains unmeasured.',
      }),
      node({
        slug: 'domains/purchase',
        kind: 'domain',
        title: 'Purchase',
        frontmatter: { capabilities: ['capabilities/checkout'] },
        body: '## Definition\nThe responsibility boundary for confirming a reviewed purchase.\n\n## Boundaries\nPurchase owns confirmation and pricing decisions; inventory owns sellable stock.',
      }),
      node({
        slug: 'domains/inventory',
        kind: 'domain',
        title: 'Inventory',
        frontmatter: { capabilities: ['capabilities/inventory-availability'] },
        body: '## Definition\nThe responsibility boundary for reporting sellable inventory.\n\n## Boundaries\nInventory supplies availability; it does not own purchase confirmation or discount calculation.',
      }),
      node({
        slug: 'capabilities/checkout',
        kind: 'capability',
        title: 'Checkout',
        frontmatter: {
          domain: 'domains/purchase',
          path: 'src/checkout.mjs',
          elements: ['elements/checkout-module'],
          dependencies: ['capabilities/inventory-availability'],
          relation_notes: {
            'capabilities/inventory-availability': 'Checkout needs the inventory availability decision before confirming a purchase.',
          },
        },
        body: '## Definition\nConfirm a purchase and apply purchase-side pricing adjustments.\n\n## Boundaries\n- Includes discount handling on the confirmed purchase total.\n- Excludes inventory availability calculation.\n\n## Handoff\nRead src/checkout.mjs and test/checkout.test.mjs first; keep inventory logic in its own module.',
      }),
      node({
        slug: 'capabilities/inventory-availability',
        kind: 'capability',
        title: 'Inventory Availability',
        frontmatter: {
          domain: 'domains/inventory',
          path: 'src/inventory.mjs',
          elements: ['elements/inventory-module'],
        },
        body: '## Definition\nReport whether stock is sellable to the purchase flow.\n\n## Boundaries\n- Includes availability decisions.\n- Excludes purchase confirmation and discount calculation.',
      }),
      node({
        slug: 'elements/checkout-module',
        kind: 'element',
        title: 'Checkout module',
        frontmatter: { domain: 'domains/purchase', path: 'src/checkout.mjs' },
        body: 'The source module used by the Checkout capability.',
      }),
      node({
        slug: 'elements/inventory-module',
        kind: 'element',
        title: 'Inventory module',
        frontmatter: { domain: 'domains/inventory', path: 'src/inventory.mjs' },
        body: 'The source module used by the Inventory Availability capability.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'brownfield',
    label: 'brownfield-shaped collaboration project',
    projectSlug: 'projects/relay-collaboration',
    featureBranch: 'benchmark/brownfield-change',
    conflict: true,
    sourceFiles: Object.freeze({
      'apps/web/src/acknowledgement.mjs': ACK_BASELINE_SOURCE,
      'apps/web/test/acknowledgement.test.mjs': "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { formatAcknowledgement } from '../src/acknowledgement.mjs';\n\ntest('formats an acknowledgement for the incident timeline', () => {\n  assert.equal(\n    formatAcknowledgement({ member: 'Lee', decision: 'Containment' }),\n    'Lee acknowledged `Containment`',\n  );\n});\n",
      'packages/realtime/src/publish.mjs': `export function publishTimelineEvent(event) {
  return { channel: 'incident-timeline', event };
}
`,
      'packages/policy/src/authorize.mjs': `export function canCoordinate(member) {
  return member?.permissions?.includes('coordinate') === true;
}
`,
    }),
    task: `Implement this approved change in the repository:

- Extend formatAcknowledgement(record) so an optional non-blank record.note is shown after the decision.
- When note is absent or blank, preserve the existing output exactly.
- Keep acknowledgement presentation in apps/web. Do not move permission logic into packages/policy or distribution logic into packages/realtime.
- Add focused tests for both the note and no-note cases.
- After the code tests pass, use Atlas MCP \`patch_concept\` on \`capabilities/acknowledgement-tracking\` to append exactly this section to the existing body (preserve all existing frontmatter and body text):
  ## Change record
  ${ACKNOWLEDGEMENT_CHANGE_MARKER}
- Then use Atlas MCP \`validate_vault\` and \`compile_ontology\` to verify the updated vault. Do not add, rename, delete, or directly edit any other Atlas file.

Run exactly: node --test apps/web/test/acknowledgement.test.mjs
Review the diff, commit only the intended files with the conventional subject \`feat: show acknowledgement notes\`, and do not push or merge; the harness will verify those steps.`,
    testCommand: Object.freeze([process.execPath, '--test', 'apps/web/test/acknowledgement.test.mjs']),
    expectedFiles: Object.freeze(['apps/web/src/acknowledgement.mjs', 'apps/web/test/acknowledgement.test.mjs']),
    ontologyFile: 'atlas/capabilities/acknowledgement-tracking.md',
    ontologyMarker: ACKNOWLEDGEMENT_CHANGE_MARKER,
    conflictPath: 'apps/web/src/acknowledgement.mjs',
    conflictMarker: Object.freeze({
      from: ACK_BASELINE_LINE,
      to: "  return `${record.member} acknowledged ${record.decision} in the timeline`;",
    }),
    nodes: Object.freeze([
      node({
        slug: 'projects/relay-collaboration',
        kind: 'project',
        title: 'Relay Collaboration',
        frontmatter: { domains: ['domains/access-control', 'domains/coordination'], path: '.' },
        body: '# Relay Collaboration\n\n## Definition\nA shared operational picture for teams responding to an incident.\n\n## Uncertainty\nThe package map is source evidence; runtime and transitive impact remain unmeasured.',
      }),
      node({
        slug: 'domains/coordination',
        kind: 'domain',
        title: 'Coordination',
        frontmatter: { capabilities: ['capabilities/acknowledgement-tracking', 'capabilities/decision-broadcast'] },
        body: '## Definition\nThe responsibility boundary for publishing decisions and displaying acknowledgement state.\n\n## Boundaries\nCoordination owns incident decision state; member authority belongs to Access Control.',
      }),
      node({
        slug: 'domains/access-control',
        kind: 'domain',
        title: 'Access Control',
        frontmatter: { capabilities: ['capabilities/workspace-authorization'] },
        body: '## Definition\nThe responsibility boundary for incident workspace authority.\n\n## Boundaries\nAccess Control owns permission evaluation; it does not own incident decision content.',
      }),
      node({
        slug: 'capabilities/acknowledgement-tracking',
        kind: 'capability',
        title: 'Acknowledgement Tracking',
        frontmatter: {
          domain: 'domains/coordination',
          path: 'apps/web/src/acknowledgement.mjs',
          elements: ['elements/acknowledgement-view'],
          dependencies: ['capabilities/workspace-authorization'],
          relation_notes: {
            'capabilities/workspace-authorization': 'The web acknowledgement view must respect workspace authority while it displays incident state.',
          },
        },
        body: '## Definition\nDisplay which responders acknowledged an incident decision.\n\n## Boundaries\n- Includes acknowledgement presentation and its note text.\n- Excludes permission evaluation and realtime distribution.\n\n## Handoff\nRead apps/web/src/acknowledgement.mjs and its focused test; consult policy only for the authorization boundary.',
      }),
      node({
        slug: 'capabilities/decision-broadcast',
        kind: 'capability',
        title: 'Decision Broadcast',
        frontmatter: {
          domain: 'domains/coordination',
          path: 'packages/realtime/src/publish.mjs',
          elements: ['elements/realtime-publisher'],
          dependencies: ['capabilities/acknowledgement-tracking'],
          relation_notes: {
            'capabilities/acknowledgement-tracking': 'Acknowledgement state is meaningful after the decision reaches responders.',
          },
        },
        body: '## Definition\nDistribute incident decisions to active responders.\n\n## Boundaries\n- Includes timeline distribution.\n- Excludes acknowledgement presentation and permission evaluation.',
      }),
      node({
        slug: 'capabilities/workspace-authorization',
        kind: 'capability',
        title: 'Workspace Authorization',
        frontmatter: {
          domain: 'domains/access-control',
          path: 'packages/policy/src/authorize.mjs',
          elements: ['elements/policy-authorizer'],
        },
        body: '## Definition\nEvaluate whether a member may coordinate an incident workspace.\n\n## Boundaries\n- Includes permission decisions.\n- Excludes publishing or displaying incident decisions.',
      }),
      node({
        slug: 'elements/acknowledgement-view',
        kind: 'element',
        title: 'Acknowledgement view',
        frontmatter: { domain: 'domains/coordination', path: 'apps/web/src/acknowledgement.mjs' },
        body: 'The web source module used by the Acknowledgement Tracking capability.',
      }),
      node({
        slug: 'elements/realtime-publisher',
        kind: 'element',
        title: 'Realtime publisher',
        frontmatter: { domain: 'domains/coordination', path: 'packages/realtime/src/publish.mjs' },
        body: 'The realtime source module used by the Decision Broadcast capability.',
      }),
      node({
        slug: 'elements/policy-authorizer',
        kind: 'element',
        title: 'Policy authorizer',
        frontmatter: { domain: 'domains/access-control', path: 'packages/policy/src/authorize.mjs' },
        body: 'The policy source module used by the Workspace Authorization capability.',
      }),
    ]),
  }),
]);

const MODES = Object.freeze(['off', 'on']);

function node({ slug, kind, title, frontmatter = {}, body }) {
  return Object.freeze({ slug, kind, title, frontmatter: Object.freeze(frontmatter), body });
}

function parseArgs(argv) {
  const flags = new Set(argv);
  const onlyValue = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  const only = onlyValue ? onlyValue.split(',').filter(Boolean) : CASES.map(({ id }) => id);
  const repeatValue = Number(argv.find((arg) => arg.startsWith('--repeat='))?.slice('--repeat='.length) ?? 1);
  const repeat = Number.isFinite(repeatValue) ? Math.max(1, Math.floor(repeatValue)) : 1;
  const selectedCases = CASES.filter(({ id }) => only.includes(id));
  const modes = flags.has('--on-only') ? ['on'] : flags.has('--off-only') ? ['off'] : MODES;
  if (selectedCases.length === 0) throw new Error(`No matching case in --only=${only.join(',')}`);
  return {
    bypass: flags.has('--bypass'),
    dryRun: flags.has('--dry-run'),
    cases: selectedCases,
    modes,
    repeat,
    runId: argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length) || `change-pilot-${randomUUID().slice(0, 8)}`,
    outputRoot: resolve(argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ?? DEFAULT_OUTPUT_ROOT),
  };
}

function runGit(root, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function writeNode(vaultRoot, entry) {
  const target = join(vaultRoot, `${entry.slug}.md`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buildMarkdown({
    frontmatter: {
      uid: randomUUID(),
      slug: entry.slug,
      kind: entry.kind,
      title: entry.title,
      created_by: 'human',
      ...entry.frontmatter,
    },
    body: entry.body,
  }), 'utf8');
}

function validatePreparedVault(vaultRoot) {
  const result = runCliJson(['validate', vaultRoot, '--json']);
  if (result.status !== 0) throw new Error(`prepared vault validation failed: ${result.stderr || result.stdout}`);
  const payload = result.payload;
  if (payload.problems?.length) throw new Error(`prepared vault has validation problems: ${JSON.stringify(payload.problems)}`);
}

function runCliJson(args) {
  const result = spawnSync(process.execPath, [join(REPO_ROOT, 'cli/src/index.mjs'), ...args], { encoding: 'utf8' });
  let payload = null;
  let parseError = null;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  return { ...result, payload, parseError };
}

function completedMcpCalls(transcript, tool) {
  return (transcript.match(new RegExp(`mcp: ontology-atlas/${tool} \\(completed\\)`, 'g')) ?? []).length;
}

function checkPostChangeVault({ caseDefinition, mode, prepared, transcript }) {
  if (mode === 'off') {
    return {
      required: false,
      passed: true,
      filePresent: false,
      markerPresent: false,
      patchCalls: 0,
      validateCalls: 0,
      compileCalls: 0,
    };
  }
  const ontologyPath = join(prepared.subjectRoot, caseDefinition.ontologyFile);
  const filePresent = existsSync(ontologyPath);
  const body = filePresent ? readFileSync(ontologyPath, 'utf8') : '';
  const markerPresent = body.includes(caseDefinition.ontologyMarker);
  const validate = runCliJson(['validate', prepared.vaultRoot, '--json']);
  const compile = runCliJson(['compile', prepared.vaultRoot, '--summary', '--json']);
  const validatePassed = validate.status === 0 && !validate.payload?.problems?.length;
  const compilePassed = compile.status === 0 && Boolean(compile.payload);
  const patchCalls = completedMcpCalls(transcript, 'patch_concept');
  const validateCalls = completedMcpCalls(transcript, 'validate_vault');
  const compileCalls = completedMcpCalls(transcript, 'compile_ontology');
  return {
    required: true,
    passed: filePresent && markerPresent && validatePassed && compilePassed && patchCalls > 0 && validateCalls > 0 && compileCalls > 0,
    filePresent,
    markerPresent,
    validatePassed,
    compilePassed,
    patchCalls,
    validateCalls,
    compileCalls,
    validateProblems: validate.payload?.problems?.length ?? null,
    compileStatus: compile.status,
  };
}

function prepareSubject(caseDefinition, mode, scratchRoot) {
  const subjectRoot = join(scratchRoot, `${caseDefinition.id}-${mode}`);
  mkdirSync(subjectRoot, { recursive: true });
  writeFileSync(join(subjectRoot, 'README.md'), mode === 'on'
    ? `# ${caseDefinition.label}\n\nThis subject has a prepared Atlas ontology in the atlas/ folder.\n`
    : `# ${caseDefinition.label}\n\nThis subject contains source and product documents only.\n`, 'utf8');
  writeFileSync(join(subjectRoot, 'package.json'), '{\n  "name": "benchmark-subject",\n  "private": true\n}\n', 'utf8');
  if (mode === 'on') writeFileSync(join(subjectRoot, '.gitignore'), 'atlas/.ontology-atlas/\n', 'utf8');
  for (const [path, content] of Object.entries(caseDefinition.sourceFiles)) {
    const target = join(subjectRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  if (mode === 'on') {
    const vaultRoot = join(subjectRoot, 'atlas');
    mkdirSync(vaultRoot, { recursive: true });
    for (const entry of caseDefinition.nodes) writeNode(vaultRoot, entry);
    validatePreparedVault(vaultRoot);
  }
  runGit(subjectRoot, ['init', '--quiet']);
  runGit(subjectRoot, ['config', 'user.name', 'Atlas benchmark']);
  runGit(subjectRoot, ['config', 'user.email', 'atlas-benchmark@example.invalid']);
  runGit(subjectRoot, ['add', '-A']);
  runGit(subjectRoot, ['commit', '-qm', 'chore: create benchmark baseline']);
  runGit(subjectRoot, ['branch', '-M', 'main']);
  const remoteRoot = join(scratchRoot, `${caseDefinition.id}-${mode}-remote.git`);
  runGit(scratchRoot, ['init', '--bare', '--quiet', remoteRoot]);
  runGit(subjectRoot, ['remote', 'add', 'origin', remoteRoot]);
  runGit(subjectRoot, ['push', '-q', '-u', 'origin', 'main']);
  runGit(subjectRoot, ['switch', '-c', caseDefinition.featureBranch]);
  return { subjectRoot, vaultRoot: mode === 'on' ? join(subjectRoot, 'atlas') : null, remoteRoot };
}

function buildMcpOverride({ vaultRoot, repoRoot }) {
  return `{command = "node", args = [${JSON.stringify(MCP_SERVER)}], env = { OATLAS_VAULT = ${JSON.stringify(vaultRoot)}, OATLAS_REPO_ROOT = ${JSON.stringify(repoRoot)} }}`;
}

function runAgent({ mode, prepared, task, schemaPath, answerPath }) {
  const modeInstruction = mode === 'on'
    ? 'Atlas MCP is connected. Before reading source, use its read-only tools to inspect the recorded responsibility, boundary, relation rationale, and handoff path. After implementing and testing the change, follow the task instructions for the narrowly scoped post-change Atlas update and verification.'
    : 'Atlas is not available in this control run. Use the source and product documents only; do not look for an Atlas folder or MCP server.';
  const mcpArgs = mode === 'on'
    ? ['-c', `mcp_servers.ontology-atlas=${buildMcpOverride({ vaultRoot: prepared.vaultRoot, repoRoot: prepared.subjectRoot })}`]
    : [];
  const startedAt = Date.now();
  const result = spawnSync('codex', [
    'exec',
    ...mcpArgs,
    '--cd', prepared.subjectRoot,
    '--ignore-user-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-schema', schemaPath,
    '--output-last-message', answerPath,
    `${modeInstruction}\n\n${task}\n\nReturn exactly one JSON object matching the output schema. Do not push or merge; the harness will do and verify those operations.`,
  ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const transcript = `${result.stdout ?? ''}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`;
  let answer = null;
  let answerError = null;
  if (existsSync(answerPath)) {
    try {
      answer = JSON.parse(readFileSync(answerPath, 'utf8'));
    } catch (error) {
      answerError = error instanceof Error ? error.message : String(error);
    }
  } else {
    answerError = 'Codex did not produce --output-last-message';
  }
  return {
    result,
    transcript,
    answer,
    answerError,
    durationMs: Date.now() - startedAt,
    mcpCalls: (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \(completed\)/g) ?? []).length,
    failedMcpCalls: (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \((?:failed|error)\)/g) ?? []).length,
    patchCalls: completedMcpCalls(transcript, 'patch_concept'),
    validateCalls: completedMcpCalls(transcript, 'validate_vault'),
    compileCalls: completedMcpCalls(transcript, 'compile_ontology'),
    shellCalls: (transcript.match(/^exec$/gm) ?? []).length,
    tokens: Number((transcript.match(/tokens used:?\s*([\d,]+)/i) ?? [])[1]?.replace(/,/g, '') ?? 0),
  };
}

function runTest(root, command) {
  const result = spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' });
  return {
    passed: result.status === 0,
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`,
  };
}

function listChangedFiles(root) {
  return runGit(root, ['diff', '--name-only', 'main...HEAD']).stdout.trim().split('\n').filter(Boolean).sort();
}

function injectMainConflict(root, caseDefinition) {
  const target = join(root, caseDefinition.conflictPath);
  const before = readFileSync(target, 'utf8');
  if (!before.includes(caseDefinition.conflictMarker.from)) {
    throw new Error(`conflict marker source is absent from ${caseDefinition.conflictPath}`);
  }
  writeFileSync(target, before.replace(caseDefinition.conflictMarker.from, caseDefinition.conflictMarker.to), 'utf8');
  runGit(root, ['add', '--', caseDefinition.conflictPath]);
  runGit(root, ['commit', '-qm', 'chore: advance main during benchmark']);
}

function mergeAndPush(root, caseDefinition) {
  runGit(root, ['switch', 'main']);
  if (caseDefinition.conflict) injectMainConflict(root, caseDefinition);
  const merge = runGit(root, ['merge', '--no-ff', caseDefinition.featureBranch, '-m', `merge: ${caseDefinition.id} benchmark change`], { allowFailure: true });
  let conflictRecovered = false;
  const unresolved = runGit(root, ['diff', '--name-only', '--diff-filter=U'], { allowFailure: true }).stdout.trim().split('\n').filter(Boolean);
  if (merge.status !== 0) {
    if (unresolved.length === 0) return { mergePassed: false, conflictRecovered, conflictPaths: [], output: `${merge.stdout}\n${merge.stderr}` };
    for (const path of unresolved) {
      runGit(root, ['checkout', '--theirs', '--', path]);
      runGit(root, ['add', '--', path]);
    }
    runGit(root, ['commit', '-qm', `merge: recover ${caseDefinition.id} benchmark change`]);
    conflictRecovered = true;
  }
  const postMergeCommit = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
  const parents = runGit(root, ['show', '-s', '--format=%P', 'HEAD']).stdout.trim().split(/\s+/).filter(Boolean);
  runGit(root, ['push', '-q', 'origin', 'main']);
  const remoteMain = runGit(root, ['ls-remote', 'origin', 'refs/heads/main']).stdout.split(/\s+/)[0];
  const featureRemoteBeforeCleanup = runGit(root, ['ls-remote', 'origin', `refs/heads/${caseDefinition.featureBranch}`], { allowFailure: true });
  const featureRemotePresentBeforeCleanup = featureRemoteBeforeCleanup.status === 0 && Boolean(featureRemoteBeforeCleanup.stdout.trim());
  const deleteRemote = runGit(root, ['push', '-q', 'origin', '--delete', caseDefinition.featureBranch], { allowFailure: true });
  const deleteLocal = runGit(root, ['branch', '-d', caseDefinition.featureBranch], { allowFailure: true });
  const featureRemoteAfterCleanup = runGit(root, ['ls-remote', 'origin', `refs/heads/${caseDefinition.featureBranch}`], { allowFailure: true });
  const clean = runGit(root, ['status', '--porcelain']).stdout.trim() === '';
  return {
    mergePassed: merge.status === 0 || conflictRecovered,
    conflictRecovered,
    conflictPaths: unresolved,
    postMergeCommit,
    mergeParents: parents.length,
    mainPushPassed: remoteMain === postMergeCommit,
    featureRemotePresentBeforeCleanup,
    featureRemoteDeleted: featureRemoteAfterCleanup.status !== 0 || featureRemoteAfterCleanup.stdout.trim() === '',
    localFeatureDeleted: deleteLocal.status === 0,
    remoteDeleteStatus: deleteRemote.status,
    cleanAfterCleanup: clean,
  };
}

function contentIntegrity({ caseDefinition, mode, agent, test, changedFiles, cleanBeforeMerge, featureCommitSubject }) {
  const expected = [...caseDefinition.expectedFiles, ...(mode === 'on' ? [caseDefinition.ontologyFile] : [])].sort();
  const exactChangedFiles = JSON.stringify(changedFiles) === JSON.stringify(expected);
  const mcpExpected = mode === 'on' ? agent.mcpCalls > 0 && agent.failedMcpCalls === 0 : agent.mcpCalls === 0 && agent.failedMcpCalls === 0;
  const answerShape = Boolean(agent.answer
    && typeof agent.answer.summary === 'string'
    && Array.isArray(agent.answer.changedFiles)
    && typeof agent.answer.testCommand === 'string'
    && typeof agent.answer.commitSubject === 'string'
    && typeof agent.answer.atlasAction === 'string'
    && Array.isArray(agent.answer.unknowns));
  const commitSubject = featureCommitSubject;
  const commitPassed = commitSubject.startsWith('feat:') && commitSubject === (mode === 'on' || mode === 'off'
    ? (caseDefinition.id === 'greenfield' ? 'feat: add checkout discount handling' : 'feat: show acknowledgement notes')
    : '');
  return {
    exactChangedFiles,
    cleanBeforeMerge,
    mcpExpected,
    answerShape,
    commitPassed,
    testPassed: test.passed,
    ontologyUpdatePassed: mode === 'off' || agent.postChangeVault?.passed === true,
  };
}

function runCell({ caseDefinition, mode, iteration, scratchRoot, schemaPath, outputRoot, runId }) {
  const prepared = prepareSubject(caseDefinition, mode, scratchRoot);
  const answerPath = join(scratchRoot, `${caseDefinition.id}-${mode}-r${iteration}.answer.json`);
  const agent = runAgent({
    mode,
    prepared,
    task: caseDefinition.task,
    schemaPath,
    answerPath,
  });
  const changedFiles = listChangedFiles(prepared.subjectRoot);
  const featureTest = runTest(prepared.subjectRoot, caseDefinition.testCommand);
  const postChangeVault = checkPostChangeVault({ caseDefinition, mode, prepared, transcript: agent.transcript });
  agent.postChangeVault = postChangeVault;
  const cleanBeforeMerge = runGit(prepared.subjectRoot, ['status', '--porcelain']).stdout.trim() === '';
  const featureCommitSubject = runGit(prepared.subjectRoot, ['show', '-s', '--format=%s', 'HEAD']).stdout.trim();
  const beforeMergeDiff = runGit(prepared.subjectRoot, ['diff', 'main...HEAD', '--', ...changedFiles], { allowFailure: true }).stdout;
  const beforeMergeDiffPath = join(outputRoot, `${runId}-${caseDefinition.id}-${mode}-r${iteration}.diff`);
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(beforeMergeDiffPath, beforeMergeDiff, 'utf8');
  const gitHead = runGit(prepared.subjectRoot, ['rev-parse', 'HEAD']).stdout.trim();
  const merge = agent.result.status === 0 && featureTest.passed && changedFiles.length > 0
    ? mergeAndPush(prepared.subjectRoot, caseDefinition)
    : { mergePassed: false, conflictRecovered: false, conflictPaths: [], cleanAfterCleanup: false };
  const postMergeTest = merge.mergePassed ? runTest(prepared.subjectRoot, caseDefinition.testCommand) : { passed: false, status: null, output: '' };
  const integrity = contentIntegrity({ caseDefinition, mode, agent, test: featureTest, changedFiles, cleanBeforeMerge, featureCommitSubject });
  const usable = agent.result.status === 0 && !agent.answerError && integrity.mcpExpected && integrity.answerShape && integrity.ontologyUpdatePassed;
  const workflowPass = usable
    && integrity.exactChangedFiles
    && integrity.cleanBeforeMerge
    && integrity.commitPassed
    && integrity.testPassed
    && integrity.ontologyUpdatePassed
    && merge.mergePassed
    && postMergeTest.passed
    && merge.mainPushPassed
    && merge.cleanAfterCleanup;
  const transcriptName = `${runId}-${caseDefinition.id}-${mode}-r${iteration}.txt`;
  writeFileSync(join(outputRoot, transcriptName), agent.transcript, 'utf8');
  const row = {
    caseId: caseDefinition.id,
    mode,
    iteration,
    status: agent.result.status,
    durationMs: agent.durationMs,
    shellCalls: agent.shellCalls,
    mcpCalls: agent.mcpCalls,
    failedMcpCalls: agent.failedMcpCalls,
    tokens: agent.tokens,
    changedFiles,
    gitHead,
    agentAnswer: agent.answer,
    answerError: agent.answerError,
    featureTest,
    postMergeTest,
    integrity,
    postChangeVault,
    merge,
    usable,
    workflowPass,
    transcript: transcriptName,
    diff: basename(beforeMergeDiffPath),
  };
  rmSync(prepared.subjectRoot, { recursive: true, force: true });
  return row;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(rows, cases, modes, repeat) {
  const arms = cases.flatMap(({ id }) => modes.map((mode) => {
    const selected = rows.filter((row) => row.caseId === id && row.mode === mode);
    return {
      caseId: id,
      mode,
      cells: selected.length,
      workflowPasses: selected.filter((row) => row.workflowPass).length,
      usableCells: selected.filter((row) => row.usable).length,
      medianDurationMs: median(selected.map((row) => row.durationMs)),
      testsPassed: selected.filter((row) => row.featureTest.passed && row.postMergeTest.passed).length,
      commitsPassed: selected.filter((row) => row.integrity.commitPassed).length,
      ontologyUpdatesPassed: selected.filter((row) => row.integrity.ontologyUpdatePassed).length,
      pushesPassed: selected.filter((row) => row.merge.mainPushPassed).length,
      mergesPassed: selected.filter((row) => row.merge.mergePassed).length,
      cleanupsPassed: selected.filter((row) => row.merge.cleanAfterCleanup).length,
    };
  }));
  const paired = cases.map(({ id }) => {
    const off = arms.find((row) => row.caseId === id && row.mode === 'off');
    const on = arms.find((row) => row.caseId === id && row.mode === 'on');
    return {
      caseId: id,
      workflowDelta: off && on ? on.workflowPasses - off.workflowPasses : null,
      mergeDelta: off && on ? on.mergesPassed - off.mergesPassed : null,
      durationDeltaMs: off?.medianDurationMs != null && on?.medianDurationMs != null ? on.medianDurationMs - off.medianDurationMs : null,
    };
  });
  return { repeat, arms, paired };
}

function renderSummary({ runId, summary, rows }) {
  const lines = [
    `# Meaning-to-change benchmark — ${runId}`,
    '',
    'Each cell gave a fresh temporary Git repository to the same Codex agent. `off` had no Atlas vault or MCP; `on` had the same source plus a prepared validated vault, read-only context reads, and one reviewed Atlas update. A local bare remote stood in for push. No external remote was contacted.',
    '',
    `Runs per cell: **${summary.repeat}**`,
    '',
    '| Subject | Arm | Cells | Workflow passes | Usable cells | Tests | Commits | Ontology updates | Main pushes | Merges | Cleanups | Median time |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const arm of summary.arms) lines.push(`| ${arm.caseId} | ${arm.mode} | ${arm.cells} | ${arm.workflowPasses} | ${arm.usableCells} | ${arm.testsPassed}/${arm.cells} | ${arm.commitsPassed}/${arm.cells} | ${arm.ontologyUpdatesPassed}/${arm.cells} | ${arm.pushesPassed}/${arm.cells} | ${arm.mergesPassed}/${arm.cells} | ${arm.cleanupsPassed}/${arm.cells} | ${arm.medianDurationMs ?? '—'} ms |`);
  lines.push('', '## Paired deltas', '', '| Subject | ON workflow − OFF | ON merges − OFF | ON time − OFF |', '|---|---:|---:|---:|');
  for (const row of summary.paired) lines.push(`| ${row.caseId} | ${row.workflowDelta ?? '—'} | ${row.mergeDelta ?? '—'} | ${row.durationDeltaMs ?? '—'} ms |`);
  lines.push('', '## Interpretation boundary', '', '- A workflow pass requires direct evidence of the changed file set, tests, commit, local push, merge/recovery, post-merge tests, owned cleanup, and (only in the Atlas arm) an existing capability update checked through Atlas MCP plus vault validation and compilation.', '- A failed step is not converted into a success by harness repair; inspect the cell row and raw transcript.', '- Atlas is measured as meaning/navigation context and a reviewed post-change ontology update. Generic Git mechanics remain ordinary Git actions and are reported separately.', '- This pilot uses internal synthetic subjects and does not establish a general customer or cross-repository effect.', '', '## Cells', '', '| Subject | Task | Arm | Content | Ontology | Usable | Workflow | Changed files | Merge | Transcript | Diff |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of rows) lines.push(`| ${row.caseId} | ${row.caseId === 'greenfield' ? 'discount handling' : 'acknowledgement note'} | ${row.mode} | ${row.integrity.exactChangedFiles ? 'exact' : 'scope drift'} · tests ${row.featureTest.passed && row.postMergeTest.passed ? 'pass' : 'fail'} · commit ${row.integrity.commitPassed ? 'pass' : 'fail'} | ${formatOntologyCheck(row.postChangeVault)} | ${row.usable ? 'yes' : 'no'} | ${row.workflowPass ? 'yes' : 'no'} | ${row.changedFiles.join('<br>') || 'none'} | ${row.merge.mergePassed ? (row.merge.conflictRecovered ? 'recovered' : 'clean') : 'failed'} | [raw](${row.transcript}) | [diff](${row.diff}) |`);
  return `${lines.join('\n')}\n`;
}

function formatOntologyCheck(check) {
  if (!check.required) return 'n/a';
  return `${check.passed ? 'pass' : 'fail'} · file ${check.filePresent ? 'yes' : 'no'} · marker ${check.markerPresent ? 'yes' : 'no'} · patch ${check.patchCalls} · validate ${check.validateCalls} · compile ${check.compileCalls}`;
}

export function validateDefinitions() {
  const errors = [];
  for (const entry of CASES) {
    if (!entry.task || entry.expectedFiles.length !== 2) errors.push(`${entry.id}: incomplete task contract`);
    if (!entry.testCommand.length || entry.testCommand[0] !== process.execPath) errors.push(`${entry.id}: invalid test command`);
    if (!entry.conflictPath || !entry.conflictMarker?.from || !entry.conflictMarker?.to) errors.push(`${entry.id}: incomplete conflict contract`);
    if (!entry.ontologyFile || !entry.ontologyMarker) errors.push(`${entry.id}: incomplete ontology update contract`);
    if (new Set(entry.expectedFiles).size !== entry.expectedFiles.length) errors.push(`${entry.id}: duplicate expected file`);
    for (const path of entry.expectedFiles) if (!path.endsWith('.mjs')) errors.push(`${entry.id}: expected file is not a module: ${path}`);
  }
  return errors;
}

export function workflowScore(row) {
  return {
    usable: row.usable,
    workflowPass: row.workflowPass,
    changedFilesExact: row.integrity.exactChangedFiles,
    testsPassed: row.integrity.testPassed && row.postMergeTest.passed,
    commitPassed: row.integrity.commitPassed,
    ontologyUpdatePassed: row.integrity.ontologyUpdatePassed,
    mergePassed: row.merge.mergePassed,
    pushPassed: row.merge.mainPushPassed,
    cleanupPassed: row.merge.cleanAfterCleanup,
  };
}

export async function runBenchmark(options) {
  const errors = validateDefinitions();
  if (errors.length) throw new Error(errors.join('\n'));
  const scratchRoot = join(tmpdir(), `ontology-atlas-change-flow-${randomUUID()}`);
  const schemaPath = join(scratchRoot, 'answer.schema.json');
  mkdirSync(scratchRoot, { recursive: true });
  writeFileSync(schemaPath, `${JSON.stringify(OUTPUT_SCHEMA, null, 2)}\n`, 'utf8');
  const rows = [];
  try {
    for (const caseDefinition of options.cases) {
      for (const task of Array.from({ length: options.repeat }, (_, index) => index + 1)) {
        for (const mode of options.modes) {
          process.stdout.write(`[change-flow] ${caseDefinition.id} ${mode} r${task} ...\n`);
          rows.push(runCell({
            caseDefinition,
            mode,
            iteration: task,
            scratchRoot,
            schemaPath,
            outputRoot: options.outputRoot,
            runId: options.runId,
          }));
          const row = rows.at(-1);
          process.stdout.write(`  usable=${row.usable} workflow=${row.workflowPass} tests=${row.featureTest.passed && row.postMergeTest.passed} commit=${row.integrity.commitPassed} ontology=${row.postChangeVault.passed} push=${row.merge.mainPushPassed} merge=${row.merge.mergePassed} cleanup=${row.merge.cleanAfterCleanup} mcp=${row.mcpCalls} ${(row.durationMs / 1000).toFixed(1)}s\n`);
        }
      }
    }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
  const summary = summarize(rows, options.cases, options.modes, options.repeat);
  mkdirSync(options.outputRoot, { recursive: true });
  const summaryPath = join(options.outputRoot, `${options.runId}-summary.md`);
  writeFileSync(summaryPath, renderSummary({ runId: options.runId, summary, rows }), 'utf8');
  process.stdout.write(`[change-flow] summary: ${summaryPath}\n`);
  return { summary, rows, summaryPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write(`[change-flow] cases=${options.cases.map(({ id }) => id).join(',')} modes=${options.modes.join(',')} repeat=${options.repeat}\n`);
  if (options.dryRun) {
    process.stdout.write(`[change-flow] definitions valid; cells=${options.cases.length * options.modes.length * options.repeat}; no Codex process spawned\n`);
    return;
  }
  if (!options.bypass) {
    process.stderr.write('[change-flow] requires --bypass because it invokes read-only Codex MCP and temporary Git operations\n');
    process.stderr.write('[change-flow] use --dry-run to validate definitions without spawning Codex\n');
    process.exitCode = 2;
    return;
  }
  runBenchmark(options).catch((error) => {
    process.stderr.write(`[change-flow] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { CASES, MODES, OUTPUT_SCHEMA };

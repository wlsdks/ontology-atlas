#!/usr/bin/env node

// Paired greenfield/brownfield benchmark.
//
// This runner measures Atlas consumption after a vault has been prepared. It
// deliberately keeps construction cost separate: the source-hidden field trial
// measures bootstrap and persisted-handoff cost, while this matrix asks whether
// a prepared meaning layer changes an agent's answer on the same source.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  cpSync,
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
const FIXTURE_ROOT = join(REPO_ROOT, 'tests/fixtures/meaning-corpus');
const MCP_SERVER = join(REPO_ROOT, 'mcp/src/index.js');
const DEFAULT_OUTPUT_ROOT = join(REPO_ROOT, 'docs/benchmark/results');

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'evidence', 'nextAction', 'unknowns'],
  properties: {
    answer: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    nextAction: { type: 'string' },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
};

const TASKS = Object.freeze({
  greenfield: Object.freeze([
    Object.freeze({
      id: 'G1',
      axis: 'orientation',
      prompt:
        'A teammate wants to add a discount rule. Which existing responsibility should own the change, which capabilities does it touch, what implementation paths should be read first, and what remains unknown? Give a bounded answer; do not invent behavior.',
      required: [
        'domains/purchase',
        'capabilities/checkout',
        'capabilities/inventory-sync',
        'src/features/checkout/index.ts',
      ],
      requiredAny: ['unknown', 'not proven', 'not measured', 'unmeasured', 'cannot prove'],
      forbidden: [],
    }),
    Object.freeze({
      id: 'G2',
      axis: 'boundary',
      prompt:
        'A receiving agent proposes moving inventory reconciliation into checkout. According to the recorded project meaning, should it? State the boundary, the recorded relationship and its reason, and the next verification path.',
      required: [
        'capabilities/checkout',
        'capabilities/inventory-sync',
        'src/features/inventory-sync/index.ts',
        'excludes',
      ],
      requiredAny: ['because', 'reason', 'depends', 'boundary'],
      forbidden: [],
    }),
  ]),
  brownfield: Object.freeze([
    Object.freeze({
      id: 'B1',
      axis: 'impact',
      prompt:
        'If acknowledgement state changes, which domain and capabilities are involved, which source paths should be read first, and which part remains a recorded product dependency rather than proven runtime impact?',
      required: [
        'domains/coordination',
        'capabilities/decision-broadcast',
        'capabilities/acknowledgement-tracking',
        'apps/web',
        'packages/realtime',
      ],
      requiredAny: ['not proven', 'not measured', 'unknown', 'recorded', 'bounded'],
      forbidden: [],
    }),
    Object.freeze({
      id: 'B2',
      axis: 'handoff',
      prompt:
        'An engineer asks to put permission evaluation in coordination. Based on the recorded ontology, where does it belong, what is explicitly outside coordination, and what should the receiving agent verify next?',
      required: [
        'domains/access-control',
        'capabilities/workspace-authorization',
        'domains/coordination',
        'capabilities/decision-broadcast',
        'packages/policy',
        'excludes',
      ],
      requiredAny: ['verify', 'verification', 'next', 'unknown'],
      forbidden: [],
    }),
  ]),
});

const CASES = Object.freeze([
  Object.freeze({
    id: 'greenfield',
    label: 'small feature-sliced project',
    fixture: 'commerce-fsd',
    projectSlug: 'projects/northstar-commerce',
    nodes: Object.freeze([
      node({
        slug: 'projects/northstar-commerce',
        kind: 'project',
        title: 'Northstar Commerce',
        frontmatter: { domains: ['domains/inventory', 'domains/purchase'], path: '.' },
        body: `# Northstar Commerce\n\n## Definition\nA commerce workspace that keeps purchase completion and sellable inventory consistent.\n\n## Boundary\nThis record preserves the cross-file responsibility map that the source does not express as one artifact.\n\n## Uncertainty\nThe fixture names implementation entrypoints but does not measure runtime behavior.`,
      }),
      node({
        slug: 'domains/purchase',
        kind: 'domain',
        title: 'Purchase',
        frontmatter: { capabilities: ['capabilities/checkout'] },
        body: '## Definition\nThe responsibility boundary for turning a reviewed cart into a confirmed order.\n\n## Boundaries\nPurchase owns order confirmation; inventory owns sellable stock.',
      }),
      node({
        slug: 'domains/inventory',
        kind: 'domain',
        title: 'Inventory',
        frontmatter: { capabilities: ['capabilities/inventory-sync'] },
        body: '## Definition\nThe responsibility boundary for maintaining trustworthy sellable stock.\n\n## Boundaries\nInventory owns reconciliation across storefront and warehouse; purchase consumes availability before confirmation.',
      }),
      node({
        slug: 'capabilities/checkout',
        kind: 'capability',
        title: 'Checkout',
        frontmatter: {
          domain: 'domains/purchase',
          path: 'src/features/checkout/index.ts',
          elements: ['elements/checkout-entry'],
          dependencies: ['capabilities/inventory-sync'],
          relation_notes: {
            'capabilities/inventory-sync': 'Checkout depends on trustworthy sellable availability before it confirms a purchase.',
          },
        },
        body: '## Definition\nAuthorize a purchase and produce an order confirmation.\n\n## Boundaries\n- Includes turning a reviewed cart into a confirmed order.\n- Excludes inventory reconciliation itself and interface preference changes.\n\n## Handoff\nRead the checkout entrypoint first, then inspect the inventory capability before changing the boundary.',
      }),
      node({
        slug: 'capabilities/inventory-sync',
        kind: 'capability',
        title: 'Inventory Sync',
        frontmatter: {
          domain: 'domains/inventory',
          path: 'src/features/inventory-sync/index.ts',
          elements: ['elements/inventory-sync-entry'],
        },
        body: '## Definition\nReconcile storefront availability with warehouse stock.\n\n## Boundaries\n- Includes sellable stock reconciliation.\n- Excludes purchase confirmation.',
      }),
      node({
        slug: 'elements/checkout-entry',
        kind: 'element',
        title: 'Checkout entrypoint',
        frontmatter: { domain: 'domains/purchase', path: 'src/features/checkout/index.ts' },
        body: 'The implementation entrypoint named by the reviewed checkout capability.',
      }),
      node({
        slug: 'elements/inventory-sync-entry',
        kind: 'element',
        title: 'Inventory sync entrypoint',
        frontmatter: { domain: 'domains/inventory', path: 'src/features/inventory-sync/index.ts' },
        body: 'The implementation entrypoint named by the reviewed inventory capability.',
      }),
    ]),
  }),
  Object.freeze({
    id: 'brownfield',
    label: 'multi-package collaboration project',
    fixture: 'collaboration-monorepo',
    projectSlug: 'projects/relay-collaboration',
    nodes: Object.freeze([
      node({
        slug: 'projects/relay-collaboration',
        kind: 'project',
        title: 'Relay Collaboration',
        frontmatter: { domains: ['domains/access-control', 'domains/coordination'], path: '.' },
        body: '# Relay Collaboration\n\n## Definition\nA shared operational picture for teams responding to an incident.\n\n## Boundary\nThis project record connects responsibilities spread across packages; package names alone are not product capabilities.\n\n## Uncertainty\nThe package map is source evidence. Runtime and transitive impact remain unmeasured by this static benchmark.',
      }),
      node({
        slug: 'domains/coordination',
        kind: 'domain',
        title: 'Coordination',
        frontmatter: { capabilities: ['capabilities/acknowledgement-tracking', 'capabilities/decision-broadcast'] },
        body: '## Definition\nThe responsibility boundary for publishing and acknowledging incident decisions.\n\n## Boundaries\nCoordination owns decision state; member authority belongs to access control.',
      }),
      node({
        slug: 'domains/access-control',
        kind: 'domain',
        title: 'Access Control',
        frontmatter: { capabilities: ['capabilities/workspace-authorization'] },
        body: '## Definition\nThe responsibility boundary for incident workspace authority.\n\n## Boundaries\nAccess control owns permission evaluation; it does not own incident decision content.',
      }),
      node({
        slug: 'capabilities/decision-broadcast',
        kind: 'capability',
        title: 'Decision Broadcast',
        frontmatter: {
          domain: 'domains/coordination',
          path: 'packages/realtime',
          elements: ['elements/realtime-package'],
          dependencies: ['capabilities/acknowledgement-tracking'],
          relation_notes: {
            'capabilities/acknowledgement-tracking': 'Acknowledgement state is meaningful only after a decision has been published to responders.',
          },
        },
        body: '## Definition\nPublish an operational decision and distribute it to active responders.\n\n## Boundaries\n- Includes decision publication and distribution.\n- Excludes workspace permission evaluation and member authority.\n\n## Handoff\nStart with the realtime package, then check acknowledgement tracking; do not infer a complete runtime blast radius from this relation.',
      }),
      node({
        slug: 'capabilities/acknowledgement-tracking',
        kind: 'capability',
        title: 'Acknowledgement Tracking',
        frontmatter: {
          domain: 'domains/coordination',
          path: 'apps/web',
          elements: ['elements/web-console'],
          dependencies: ['capabilities/workspace-authorization'],
          relation_notes: {
            'capabilities/workspace-authorization': 'The receiving console must respect workspace authority while it shows acknowledgement state.',
          },
        },
        body: '## Definition\nShow which responders have acknowledged a decision.\n\n## Boundaries\n- Includes acknowledgement state in the incident workspace.\n- Excludes evaluating who may read or administer the workspace.',
      }),
      node({
        slug: 'capabilities/workspace-authorization',
        kind: 'capability',
        title: 'Workspace Authorization',
        frontmatter: {
          domain: 'domains/access-control',
          path: 'packages/policy',
          elements: ['elements/policy-package'],
        },
        body: '## Definition\nEvaluate whether a member may read, coordinate, or administer an incident.\n\n## Boundaries\n- Includes workspace permission decisions.\n- Excludes publishing or acknowledging incident decisions.',
      }),
      node({
        slug: 'elements/realtime-package',
        kind: 'element',
        title: 'Realtime package',
        frontmatter: { domain: 'domains/coordination', path: 'packages/realtime' },
        body: 'The package path used as source evidence for decision distribution.',
      }),
      node({
        slug: 'elements/web-console',
        kind: 'element',
        title: 'Web console',
        frontmatter: { domain: 'domains/coordination', path: 'apps/web' },
        body: 'The application path used as source evidence for acknowledgement display.',
      }),
      node({
        slug: 'elements/policy-package',
        kind: 'element',
        title: 'Policy package',
        frontmatter: { domain: 'domains/access-control', path: 'packages/policy' },
        body: 'The package path used as source evidence for workspace authorization.',
      }),
    ]),
  }),
]);

const MODES = Object.freeze(['off', 'on']);

function node({ slug, kind, title, frontmatter = {}, body }) {
  return Object.freeze({ slug, kind, title, frontmatter: Object.freeze(frontmatter), body });
}

function parseArgs(argv) {
  const args = new Set(argv);
  const onlyValue = argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  const only = onlyValue ? onlyValue.split(',').filter(Boolean) : CASES.map(({ id }) => id);
  const repeatValue = Number(argv.find((arg) => arg.startsWith('--repeat='))?.slice('--repeat='.length) ?? 1);
  const repeat = Number.isFinite(repeatValue) ? Math.max(1, Math.floor(repeatValue)) : 1;
  const runIdValue = argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
  const runId = runIdValue || `pilot-${randomUUID().slice(0, 8)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) throw new Error(`Invalid --run-id=${runId}`);
  const selectedCases = CASES.filter(({ id }) => only.includes(id));
  const selectedModes = args.has('--on-only') ? ['on'] : args.has('--off-only') ? ['off'] : MODES;
  if (selectedCases.length === 0) throw new Error(`No matching benchmark case in --only=${only.join(',')}`);
  return {
    bypass: args.has('--bypass'),
    dryRun: args.has('--dry-run'),
    runId,
    repeat,
    cases: selectedCases,
    modes: selectedModes,
    outputRoot: resolve(argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ?? DEFAULT_OUTPUT_ROOT),
  };
}

export function buildCodexConfig({ vaultRoot, repoRoot, serverPath = MCP_SERVER }) {
  return [
    '[mcp_servers.ontology-atlas]',
    'command = "node"',
    `args = [${JSON.stringify(serverPath)}]`,
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${JSON.stringify(vaultRoot)}`,
    `OATLAS_REPO_ROOT = ${JSON.stringify(repoRoot)}`,
    '',
  ].join('\n');
}

function codexConfigOverrides({ vaultRoot, repoRoot, serverPath = MCP_SERVER }) {
  const server = `{command = "node", args = [${JSON.stringify(serverPath)}], env = { OATLAS_VAULT = ${JSON.stringify(vaultRoot)}, OATLAS_REPO_ROOT = ${JSON.stringify(repoRoot)} }}`;
  return [
    '-c', `mcp_servers.ontology-atlas=${server}`,
  ];
}

export function scoreFinalAnswer(finalValue, task) {
  const valid = Boolean(
    finalValue
      && typeof finalValue === 'object'
      && typeof finalValue.answer === 'string'
      && Array.isArray(finalValue.evidence)
      && typeof finalValue.nextAction === 'string'
      && Array.isArray(finalValue.unknowns),
  );
  const haystack = valid ? JSON.stringify(finalValue).toLowerCase() : '';
  const matched = task.required.filter((value) => haystack.includes(value.toLowerCase()));
  const missing = task.required.filter((value) => !haystack.includes(value.toLowerCase()));
  const foundForbidden = task.forbidden.filter((value) => haystack.includes(value.toLowerCase()));
  const anyRequired = task.requiredAny.length === 0
    || task.requiredAny.some((value) => haystack.includes(value.toLowerCase()));
  return {
    valid,
    required: { matched: matched.length, total: task.required.length, missing },
    requiredAny: { passed: anyRequired, candidates: task.requiredAny },
    forbidden: { found: foundForbidden, total: task.forbidden.length },
    coverage: task.required.length === 0 ? 1 : Number((matched.length / task.required.length).toFixed(4)),
    pass: valid && missing.length === 0 && anyRequired && foundForbidden.length === 0,
  };
}

export function benchmarkPlan({ cases = CASES, modes = MODES, repeat = 1 } = {}) {
  return cases.flatMap((caseDefinition) => TASKS[caseDefinition.id].flatMap((task) => (
    modes.flatMap((mode) => Array.from({ length: repeat }, (_, index) => ({
      caseDefinition,
      caseId: caseDefinition.id,
      mode,
      task,
      iteration: index + 1,
    })))
  )));
}

function prepareSubject(caseDefinition, mode, scratchRoot) {
  const subjectRoot = join(scratchRoot, `${caseDefinition.id}-${mode}`);
  const fixtureRoot = join(FIXTURE_ROOT, caseDefinition.fixture);
  cpSync(fixtureRoot, subjectRoot, {
    recursive: true,
    filter: (source) => basename(source) !== 'golden.json',
  });
  const vaultRoot = join(subjectRoot, 'atlas');
  if (mode === 'on') {
    mkdirSync(vaultRoot, { recursive: true });
    for (const entry of caseDefinition.nodes) {
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
    const codexDirectory = join(subjectRoot, '.codex');
    mkdirSync(codexDirectory, { recursive: true });
    writeFileSync(join(codexDirectory, 'config.toml'), buildCodexConfig({
      vaultRoot,
      repoRoot: subjectRoot,
    }), 'utf8');
  }
  const git = spawnSync('git', ['init', '--quiet', subjectRoot], { encoding: 'utf8' });
  if (git.status !== 0) throw new Error(`git init failed for ${subjectRoot}: ${git.stderr || git.stdout}`);
  return { subjectRoot, vaultRoot: mode === 'on' ? vaultRoot : null };
}

function writeOutputSchema(scratchRoot) {
  const schemaPath = join(scratchRoot, 'answer.schema.json');
  writeFileSync(schemaPath, `${JSON.stringify(OUTPUT_SCHEMA, null, 2)}\n`, 'utf8');
  return schemaPath;
}

function validatePreparedVault(vaultRoot) {
  const validation = spawnSync(process.execPath, [
    join(REPO_ROOT, 'cli/src/index.mjs'),
    'validate',
    vaultRoot,
    '--json',
  ], { encoding: 'utf8' });
  if (validation.status !== 0) throw new Error(`prepared vault validation failed: ${validation.stderr || validation.stdout}`);
  let result;
  try {
    result = JSON.parse(validation.stdout);
  } catch (error) {
    throw new Error(`prepared vault validation returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.problems?.length) throw new Error(`prepared vault has ${result.problems.length} validation problem(s): ${JSON.stringify(result.problems)}`);
}

function runCell({ caseDefinition, mode, task, iteration, scratchRoot, outputRoot, schemaPath, runId }) {
  const prepared = prepareSubject(caseDefinition, mode, scratchRoot);
  if (mode === 'on') validatePreparedVault(prepared.vaultRoot);
  const answerPath = join(prepared.subjectRoot, 'answer.json');
  const start = Date.now();
  const mcpConfig = mode === 'on'
    ? codexConfigOverrides({ vaultRoot: prepared.vaultRoot, repoRoot: prepared.subjectRoot })
    : [];
  const result = spawnSync('codex', [
    'exec',
    ...mcpConfig,
    '--cd', prepared.subjectRoot,
    '--ignore-user-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-schema', schemaPath,
    '--output-last-message', answerPath,
    `${mode === 'on'
      ? 'Atlas MCP is connected for this run. Use its read-only tools first for ontology meaning, boundaries, relations, and handoff facts; then read source files for implementation detail.'
      : 'Atlas is not available for this run. Use the source files and product documents only; do not look for an Atlas vault.'}\n\n${task.prompt}\n\nReturn exactly one JSON object matching the provided output schema. Do not edit files and do not call Atlas write tools.`,
  ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const durationMs = Date.now() - start;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const transcript = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
  let finalValue = null;
  let parseError = null;
  if (existsSync(answerPath)) {
    try {
      finalValue = JSON.parse(readFileSync(answerPath, 'utf8'));
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  } else {
    parseError = 'Codex did not produce --output-last-message';
  }
  const grade = scoreFinalAnswer(finalValue, task);
  const mcpCalls = (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \(completed\)/g) ?? []).length;
  const failedMcpCalls = (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \((?:failed|error)\)/g) ?? []).length;
  const shellCalls = (transcript.match(/^exec$/gm) ?? []).length;
  const tokens = Number((transcript.match(/tokens used:?\s*([\d,]+)/i) ?? [])[1]?.replace(/,/g, '') ?? 0);
  const integrity = mode === 'on'
    ? { passed: mcpCalls > 0 && failedMcpCalls === 0, reason: mcpCalls > 0 ? (failedMcpCalls ? 'MCP call failed' : 'MCP observed') : 'MCP arm was not exercised' }
    : { passed: mcpCalls === 0 && failedMcpCalls === 0, reason: mcpCalls === 0 ? 'No MCP exposed' : 'MCP leaked into control arm' };
  const usable = result.status === 0 && !parseError && integrity.passed;
  mkdirSync(outputRoot, { recursive: true });
  const filename = `${runId}-${caseDefinition.id}-${task.id}-${mode}-r${iteration}.txt`;
  const outputPath = join(outputRoot, filename);
  writeFileSync(outputPath, transcript, 'utf8');
  rmSync(prepared.subjectRoot, { recursive: true, force: true });
  return {
    caseId: caseDefinition.id,
    mode,
    taskId: task.id,
    axis: task.axis,
    iteration,
    status: result.status,
    signal: result.signal,
    durationMs,
    shellCalls,
    mcpCalls,
    failedMcpCalls,
    tokens,
    grade,
    parseError,
    integrity,
    usable,
    transcript: filename,
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeRows(rows, caseId, mode) {
  const selected = rows.filter((row) => row.caseId === caseId && row.mode === mode);
  return {
    caseId,
    mode,
    cells: selected.length,
    contentPasses: selected.filter((row) => row.grade.pass).length,
    usableCells: selected.filter((row) => row.usable).length,
    coverage: selected.length === 0 ? null : Number((selected.reduce((sum, row) => sum + row.grade.coverage, 0) / selected.length).toFixed(4)),
    medianDurationMs: median(selected.map((row) => row.durationMs)),
    medianShellCalls: median(selected.map((row) => row.shellCalls)),
    medianMcpCalls: median(selected.map((row) => row.mcpCalls)),
    processFailures: selected.filter((row) => !row.usable).length,
  };
}

function buildSummary({ rows, cases, repeat, modes }) {
  const arms = cases.flatMap(({ id }) => modes.map((mode) => summarizeRows(rows, id, mode)));
  const paired = cases.map(({ id }) => {
    const off = arms.find((row) => row.caseId === id && row.mode === 'off');
    const on = arms.find((row) => row.caseId === id && row.mode === 'on');
    return {
      caseId: id,
      coverageDelta: off?.coverage != null && on?.coverage != null ? Number((on.coverage - off.coverage).toFixed(4)) : null,
      passDelta: off && on ? on.contentPasses - off.contentPasses : null,
      durationDeltaMs: off?.medianDurationMs != null && on?.medianDurationMs != null ? on.medianDurationMs - off.medianDurationMs : null,
    };
  });
  return { repeat, modes, arms, paired };
}

function renderSummary({ date, summary, rows }) {
  const lines = [
    `# Greenfield/brownfield lifecycle benchmark — ${date}`,
    '',
    'This is a paired Codex measurement of a prepared Atlas vault. `off` has no vault, MCP, or answer key in the subject workspace; `on` has the same source plus a validated curated vault and Atlas MCP. Machine coverage is not a semantic quality certificate; inspect the saved transcripts before making a product claim.',
    '',
    `Runs per cell: **${summary.repeat}**`,
    '',
    '| Subject | Arm | Cells | Content passes | Usable cells | Required coverage | Median duration | Median shell | Median MCP | Process failures |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const arm of summary.arms) {
    lines.push(`| ${arm.caseId} | ${arm.mode} | ${arm.cells} | ${arm.contentPasses} | ${arm.usableCells} | ${arm.coverage ?? '—'} | ${arm.medianDurationMs ?? '—'} ms | ${arm.medianShellCalls ?? '—'} | ${arm.medianMcpCalls ?? '—'} | ${arm.processFailures} |`);
  }
  lines.push('', '## Paired deltas', '', '| Subject | ON coverage − OFF | ON passes − OFF | ON duration − OFF |', '|---|---:|---:|---:|');
  for (const row of summary.paired) lines.push(`| ${row.caseId} | ${row.coverageDelta ?? '—'} | ${row.passDelta ?? '—'} | ${row.durationDeltaMs ?? '—'} ms |`);
  lines.push('', '## Interpretation boundary', '', '- A positive coverage delta is a lead, not proof of business meaning.', '- A zero or negative delta is a valid result and should redirect the next slice.', '- Bootstrap/maintenance cost, source-hidden handoff, citation truth, and human semantic grading remain separate measurements.', '- A cell with failed arm integrity is a setup failure, not evidence for or against Atlas.', '', '## Cells', '', '| Subject | Task | Arm | Iteration | Coverage | Content pass | Integrity | Usable | Status | Transcript |', '|---|---|---|---:|---:|---|---|---|---:|---|');
  for (const row of rows) lines.push(`| ${row.caseId} | ${row.taskId} | ${row.mode} | ${row.iteration} | ${row.grade.coverage} | ${row.grade.pass ? 'yes' : 'no'} | ${row.integrity.passed ? 'yes' : `no (${row.integrity.reason})`} | ${row.usable ? 'yes' : 'no'} | ${row.status ?? '—'} | [raw transcript](${row.transcript}) |`);
  return `${lines.join('\n')}\n`;
}

export function validateDefinitions() {
  const errors = [];
  for (const entry of CASES) {
    if (!existsSync(join(FIXTURE_ROOT, entry.fixture))) errors.push(`${entry.id}: missing fixture`);
    if (TASKS[entry.id].length === 0) errors.push(`${entry.id}: no tasks`);
    for (const task of TASKS[entry.id]) {
      if (task.required.length === 0) errors.push(`${task.id}: no required evidence`);
      if (!task.prompt || !task.axis) errors.push(`${task.id}: incomplete task`);
    }
    for (const entryNode of entry.nodes) {
      if (!entryNode.slug || !entryNode.kind || !entryNode.title || !entryNode.body) errors.push(`${entry.id}: incomplete node`);
    }
  }
  return errors;
}

export async function runBenchmark(options) {
  const errors = validateDefinitions();
  if (errors.length) throw new Error(errors.join('\n'));
  const scratchRoot = join(tmpdir(), `ontology-atlas-lifecycle-${randomUUID()}`);
  mkdirSync(scratchRoot, { recursive: true });
  const schemaPath = writeOutputSchema(scratchRoot);
  const rows = [];
  try {
    for (const plan of benchmarkPlan(options)) {
      process.stdout.write(`[lifecycle] ${plan.caseId} ${plan.task.id} ${plan.mode} r${plan.iteration} ...\n`);
      rows.push(runCell({ ...plan, scratchRoot, outputRoot: options.outputRoot, schemaPath, runId: options.runId }));
      const row = rows.at(-1);
      process.stdout.write(`  coverage=${row.grade.coverage} pass=${row.grade.pass} shell=${row.shellCalls} mcp=${row.mcpCalls} ${(row.durationMs / 1000).toFixed(1)}s\n`);
    }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
  const summary = buildSummary({ rows, ...options });
  const summaryPath = join(options.outputRoot, `${options.runId}-summary.md`);
  writeFileSync(summaryPath, renderSummary({ date: options.runId, summary, rows }), 'utf8');
  process.stdout.write(`[lifecycle] summary: ${summaryPath}\n`);
  return { summary, rows, summaryPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  process.stdout.write(`[lifecycle] cases=${options.cases.map(({ id }) => id).join(',')} modes=${options.modes.join(',')} repeat=${options.repeat}\n`);
  if (options.dryRun) {
    process.stdout.write(`[lifecycle] definitions valid; cells=${benchmarkPlan(options).length}; no Codex process spawned\n`);
    return;
  }
  if (!options.bypass) {
    process.stderr.write('[lifecycle] requires --bypass because it invokes read-only codex exec with the Atlas MCP arm\n');
    process.stderr.write('[lifecycle] use --dry-run to validate definitions without spawning Codex\n');
    process.exitCode = 2;
    return;
  }
  runBenchmark(options).catch((error) => {
    process.stderr.write(`[lifecycle] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { CASES, MODES, OUTPUT_SCHEMA, TASKS };

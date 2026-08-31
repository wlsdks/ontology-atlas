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
  readdirSync,
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

// Required evidence is sorted by who could possibly have written it, because one
// blended score hides which half of a gap is a real comparison.
//
// `vocabulary` items are Atlas concept names such as `capabilities/checkout`.
// They exist only inside the prepared vault, so the side without a vault scores
// zero on them however good its answer is. A gap here says the Atlas side
// returned a name that can be looked up again; it does not say the answer was
// better.
//
// `path` and `phrase` items are things either side could write: a source path is
// on disk for both, and either can say a thing is excluded. Only these two can
// be compared.
//
// The sorting is derived here and then proved in `validateDefinitions`, so no
// token can be filed into the flattering class by hand.
const VAULT_KINDS = Object.freeze(['projects', 'domains', 'capabilities', 'elements']);

export function classifyEvidence(token) {
  if (VAULT_KINDS.some((kind) => token.startsWith(`${kind}/`))) return 'vocabulary';
  return token.includes('/') ? 'path' : 'phrase';
}

function groupRequired(task) {
  const grouped = { vocabulary: [], path: [], phrase: [] };
  for (const token of task.required) grouped[classifyEvidence(token)].push(token);
  return grouped;
}

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
    regrade: args.has('--regrade'),
    explicitRunId: Boolean(runIdValue),
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
  const cover = (tokens) => {
    const matched = tokens.filter((value) => haystack.includes(value.toLowerCase()));
    const missing = tokens.filter((value) => !haystack.includes(value.toLowerCase()));
    return {
      matched: matched.length,
      total: tokens.length,
      missing,
      coverage: tokens.length === 0 ? null : Number((matched.length / tokens.length).toFixed(4)),
    };
  };
  const grouped = groupRequired(task);
  const all = cover(task.required);
  const vocabulary = cover(grouped.vocabulary);
  const comparable = cover([...grouped.path, ...grouped.phrase]);
  const foundForbidden = task.forbidden.filter((value) => haystack.includes(value.toLowerCase()));
  const anyRequired = task.requiredAny.length === 0
    || task.requiredAny.some((value) => haystack.includes(value.toLowerCase()));
  return {
    valid,
    required: { matched: all.matched, total: all.total, missing: all.missing },
    requiredAny: { passed: anyRequired, candidates: task.requiredAny },
    forbidden: { found: foundForbidden, total: task.forbidden.length },
    coverage: all.coverage ?? 1,
    vocabularyCoverage: vocabulary.coverage,
    comparableCoverage: comparable.coverage,
    breakdown: {
      vocabulary,
      path: cover(grouped.path),
      phrase: cover(grouped.phrase),
      comparable,
      unknownSignal: anyRequired,
    },
    pass: valid && all.missing.length === 0 && anyRequired && foundForbidden.length === 0,
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
  const numeric = values.filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return null;
  const sorted = [...numeric].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(4));
}

function summarizeRows(rows, caseId, mode) {
  const selected = rows.filter((row) => row.caseId === caseId && row.mode === mode);
  return {
    caseId,
    mode,
    cells: selected.length,
    contentPasses: selected.filter((row) => row.grade.pass).length,
    usableCells: selected.filter((row) => row.usable).length,
    coverage: mean(selected.map((row) => row.grade.coverage)),
    vocabularyCoverage: mean(selected.map((row) => row.grade.vocabularyCoverage)),
    comparableCoverage: mean(selected.map((row) => row.grade.comparableCoverage)),
    unknownSignals: selected.filter((row) => row.grade.breakdown?.unknownSignal).length,
    medianDurationMs: median(selected.map((row) => row.durationMs)),
    medianShellCalls: median(selected.map((row) => row.shellCalls)),
    medianMcpCalls: median(selected.map((row) => row.mcpCalls)),
    processFailures: selected.filter((row) => !row.usable).length,
  };
}

function delta(on, off) {
  return on != null && off != null ? Number((on - off).toFixed(4)) : null;
}

function buildSummary({ rows, cases, repeat, modes }) {
  const arms = cases.flatMap(({ id }) => modes.map((mode) => summarizeRows(rows, id, mode)));
  const paired = cases.map(({ id }) => {
    const off = arms.find((row) => row.caseId === id && row.mode === 'off');
    const on = arms.find((row) => row.caseId === id && row.mode === 'on');
    return {
      caseId: id,
      coverageDelta: delta(on?.coverage, off?.coverage),
      comparableDelta: delta(on?.comparableCoverage, off?.comparableCoverage),
      vocabularyDelta: delta(on?.vocabularyCoverage, off?.vocabularyCoverage),
      passDelta: off && on ? on.contentPasses - off.contentPasses : null,
      durationDeltaMs: off?.medianDurationMs != null && on?.medianDurationMs != null ? on.medianDurationMs - off.medianDurationMs : null,
    };
  });
  return { repeat, modes, arms, paired };
}

function renderSummary({ date, summary, rows, title = 'Greenfield/brownfield lifecycle benchmark', preamble = [] }) {
  const lines = [
    `# ${title} — ${date}`,
    '',
    'Two sides answer the same questions about the same source code. `off` has no Atlas vault, no MCP server, and no answer key in its workspace; `on` has the identical source plus a checked Atlas vault and the read-only Atlas MCP server. These scores count whether an answer contained the things it should have named. They do not judge whether the answer was true or useful — read the saved answers before making any claim about the product.',
    ...preamble,
    '',
    `Runs per cell: **${summary.repeat}**`,
    '',
    '| Subject | Side | Cells | Content passes | Usable cells | Blended | Comparable (both sides) | Atlas names (Atlas side only) | Median duration | Median shell | Median MCP | Process failures |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const arm of summary.arms) {
    lines.push(`| ${arm.caseId} | ${arm.mode} | ${arm.cells} | ${arm.contentPasses} | ${arm.usableCells} | ${arm.coverage ?? '—'} | ${arm.comparableCoverage ?? '—'} | ${arm.vocabularyCoverage ?? '—'} | ${arm.medianDurationMs == null ? '—' : `${arm.medianDurationMs} ms`} | ${arm.medianShellCalls ?? '—'} | ${arm.medianMcpCalls ?? '—'} | ${arm.processFailures} |`);
  }
  lines.push('', '## Paired gaps', '', '| Subject | Comparable gap | Atlas-name gap | Blended gap | ON passes − OFF | ON duration − OFF |', '|---|---:|---:|---:|---:|---:|');
  for (const row of summary.paired) lines.push(`| ${row.caseId} | ${row.comparableDelta ?? '—'} | ${row.vocabularyDelta ?? '—'} | ${row.coverageDelta ?? '—'} | ${row.passDelta ?? '—'} | ${row.durationDeltaMs == null ? '—' : `${row.durationDeltaMs} ms`} |`);
  lines.push(
    '',
    '## How to read this',
    '',
    '- **Only the comparable column compares the two sides.** It scores source paths and boundary words, which either side could have written.',
    '- **The Atlas-name column is not a comparison.** It scores Atlas concept names, which live only in the vault, so the control side scores zero on it no matter how good its answer is. What it does show is worth showing: a name like `capabilities/checkout` can be looked up again next session by a person or an agent, and the phrase "the checkout feature" cannot.',
    '- The blended column exists only so earlier published runs still reproduce. Do not quote it.',
    '- **Boundary words are matched literally.** An answer that says "explicitly outside" instead of "excludes" scores zero for it, so a gap that rests on one word is a wording difference until a human grader says otherwise. The table at the end names the word behind every miss.',
    '- A positive comparable gap is a lead, not proof that the meaning layer helped.',
    '- A gap of zero, or a negative one, is a real result and should redirect the next slice.',
    '- Build and upkeep cost, the source-hidden handoff, whether citations are true, and human grading of meaning are separate measurements. None of them is folded into these numbers.',
    '- A cell that failed its setup check is a broken run, not evidence for or against Atlas.',
    '',
    '## Cells',
    '',
    '| Subject | Task | Side | Iteration | Blended | Comparable | Atlas names | Said what it did not know | Content pass | Setup | Usable | Status | Transcript |',
    '|---|---|---|---:|---:|---:|---:|---|---|---|---|---:|---|',
  );
  for (const row of rows) lines.push(`| ${row.caseId} | ${row.taskId} | ${row.mode} | ${row.iteration} | ${row.grade.coverage} | ${row.grade.comparableCoverage ?? '—'} | ${row.grade.vocabularyCoverage ?? '—'} | ${row.grade.breakdown?.unknownSignal ? 'yes' : 'no'} | ${row.grade.pass ? 'yes' : 'no'} | ${row.integrity.passed ? 'yes' : `no (${row.integrity.reason})`} | ${row.usable ? 'yes' : 'no'} | ${row.status ?? '—'} | [raw transcript](${row.transcript}) |`);
  lines.push(...renderMissedEvidence(rows));
  return `${lines.join('\n')}\n`;
}

// Every point of a delta is a specific token an arm did not write. Printing them
// stops a reader — including us — from reading a coverage number as a verdict
// without checking which word decided it.
function renderMissedEvidence(rows) {
  const tally = new Map();
  for (const row of rows) {
    for (const token of row.grade.required?.missing ?? []) {
      const key = `${row.caseId}:${row.mode}:${token}`;
      const entry = tally.get(key) ?? { caseId: row.caseId, mode: row.mode, token, cells: 0 };
      entry.cells += 1;
      tally.set(key, entry);
    }
  }
  if (tally.size === 0) return [];
  const ordered = [...tally.values()].sort((a, b) => (
    a.caseId.localeCompare(b.caseId) || a.mode.localeCompare(b.mode) || b.cells - a.cells || a.token.localeCompare(b.token)
  ));
  return [
    '',
    '## Which word decided each miss',
    '',
    'Every point of a gap is one specific thing a side did not write. `phrase` rows are the fragile ones: they are matched as literal words, so an answer that states the same boundary in other words scores zero. Send boundary judgement to blind human grading before reading a phrase gap as a difference in quality.',
    '',
    '| Subject | Side | What was missing | Kind | Cells |',
    '|---|---|---|---|---:|',
    ...ordered.map((entry) => `| ${entry.caseId} | ${entry.mode} | \`${entry.token}\` | ${classifyEvidence(entry.token)} | ${entry.cells} |`),
  ];
}

export function validateDefinitions() {
  const errors = [];
  for (const entry of CASES) {
    if (!existsSync(join(FIXTURE_ROOT, entry.fixture))) errors.push(`${entry.id}: missing fixture`);
    if (TASKS[entry.id].length === 0) errors.push(`${entry.id}: no tasks`);
    const vaultSlugs = new Set(entry.nodes.map((node) => node.slug));
    for (const task of TASKS[entry.id]) {
      if (task.required.length === 0) errors.push(`${task.id}: no required evidence`);
      if (!task.prompt || !task.axis) errors.push(`${task.id}: incomplete task`);
      for (const token of task.required) {
        const kind = classifyEvidence(token);
        const onDisk = existsSync(join(FIXTURE_ROOT, entry.fixture, token));
        if (kind === 'vocabulary') {
          // An Atlas concept name has to be a real entry in this subject's vault
          // and absent from the source tree. That is what turns "the side
          // without a vault cannot score this" into a fact, not an assumption.
          if (!vaultSlugs.has(token)) {
            errors.push(`${task.id}: "${token}" is scored as an Atlas concept name, but the ${entry.id} vault has no such entry. Add it to the vault or score something both sides can write.`);
          }
          if (onDisk) {
            errors.push(`${task.id}: "${token}" is scored as an Atlas concept name, but it also exists in the ${entry.fixture} source tree, so the side without a vault could reach it. It is not Atlas-only.`);
          }
        } else if (kind === 'path') {
          if (!onDisk) {
            errors.push(`${task.id}: "${token}" is scored as a source path, but it does not exist in the ${entry.fixture} fixture. Neither side can name a file that is not there.`);
          }
        } else if (vaultSlugs.has(token)) {
          errors.push(`${task.id}: "${token}" is an entry in the ${entry.id} vault, so it cannot be scored as an ordinary phrase both sides could write.`);
        }
      }
    }
    for (const entryNode of entry.nodes) {
      if (!entryNode.slug || !entryNode.kind || !entryNode.title || !entryNode.body) errors.push(`${entry.id}: incomplete node`);
    }
  }
  return errors;
}

const TRANSCRIPT_STDERR_MARKER = '\n[stderr]\n';

// A saved transcript is the answer on stdout followed by the captured log. Codex
// wrote the final structured answer to stdout, so re-grading reads exactly the
// object the original run scored and never the reasoning log around it.
export function parseTranscriptAnswer(transcript) {
  const stdout = transcript.split(TRANSCRIPT_STDERR_MARKER)[0].trim();
  if (!stdout) return { value: null, error: 'transcript has no stdout section' };
  try {
    return { value: JSON.parse(stdout), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// The coverage each side published, recovered from the run's own summary. If a
// re-grade cannot reproduce those numbers it is reading different answers, and
// its new columns mean nothing.
export function readPublishedCoverage(summaryMarkdown) {
  const published = new Map();
  for (const line of summaryMarkdown.split('\n')) {
    const match = line.match(/^\|\s*(\w+)\s*\|\s*(off|on)\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*([\d.]+)\s*\|/);
    if (match) published.set(`${match[1]}:${match[2]}`, Number(match[3]));
  }
  return published;
}

export function regradeRun({ runId, outputRoot, cases = CASES, modes = MODES }) {
  const taskById = new Map(cases.flatMap((entry) => TASKS[entry.id].map((task) => [`${entry.id}:${task.id}`, task])));
  const pattern = new RegExp(`^${runId}-(\\w+)-(\\w+)-(off|on)-r(\\d+)\\.txt$`);
  const rows = [];
  for (const filename of readdirSync(outputRoot).sort()) {
    const match = filename.match(pattern);
    if (!match) continue;
    const [, caseId, taskId, mode, iteration] = match;
    const task = taskById.get(`${caseId}:${taskId}`);
    if (!task || !modes.includes(mode)) continue;
    const transcript = readFileSync(join(outputRoot, filename), 'utf8');
    const { value, error } = parseTranscriptAnswer(transcript);
    const mcpCalls = (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \(completed\)/g) ?? []).length;
    const failedMcpCalls = (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \((?:failed|error)\)/g) ?? []).length;
    const integrity = mode === 'on'
      ? { passed: mcpCalls > 0 && failedMcpCalls === 0, reason: mcpCalls > 0 ? (failedMcpCalls ? 'MCP call failed' : 'MCP observed') : 'MCP arm was not exercised' }
      : { passed: mcpCalls === 0 && failedMcpCalls === 0, reason: mcpCalls === 0 ? 'No MCP exposed' : 'MCP leaked into control arm' };
    rows.push({
      caseId,
      mode,
      taskId,
      axis: task.axis,
      iteration: Number(iteration),
      status: null,
      durationMs: null,
      shellCalls: (transcript.match(/^exec$/gm) ?? []).length,
      mcpCalls,
      failedMcpCalls,
      grade: scoreFinalAnswer(value, task),
      parseError: error,
      integrity,
      usable: !error && integrity.passed,
      transcript: filename,
    });
  }
  if (rows.length === 0) throw new Error(`no saved transcripts for --run-id=${runId} in ${outputRoot}`);
  const summary = buildSummary({ rows, cases, repeat: Math.max(...rows.map((row) => row.iteration)), modes });
  const originalPath = join(outputRoot, `${runId}-summary.md`);
  const published = existsSync(originalPath) ? readPublishedCoverage(readFileSync(originalPath, 'utf8')) : new Map();
  const reproduction = summary.arms.map((arm) => {
    const expected = published.get(`${arm.caseId}:${arm.mode}`);
    return {
      arm: `${arm.caseId}:${arm.mode}`,
      published: expected ?? null,
      recomputed: arm.coverage,
      reproduced: expected == null ? null : Math.abs(expected - arm.coverage) < 0.0005,
    };
  });
  return { summary, rows, reproduction };
}

function renderRegrade({ runId, summary, rows, reproduction }) {
  const checked = reproduction.filter((row) => row.reproduced != null);
  const failed = checked.filter((row) => !row.reproduced);
  const preamble = [
    '',
    `**This file re-scores the answers already saved for \`${runId}\`. Nothing was re-run: no Codex process started, no fixture was rebuilt, and no answer changed.** Only the scoring is new. The single score published for that run is split in two — the part both sides could earn, and the part only the Atlas side could.`,
    '',
    '### Does this read the same answers the run scored?',
    '',
    checked.length === 0
      ? 'The original summary was not found beside the transcripts, so the published score could not be re-derived. Treat the split below as unchecked.'
      : failed.length === 0
        ? `Yes. All ${checked.length} published averages came back exactly from the saved answers, so the split below is a different reading of the same run — not a different run.`
        : `**No. ${failed.length} of ${checked.length} published averages did not come back.** Treat the split below as unverified until that is explained.`,
    '',
    '| Side | Published score | Recomputed | Same |',
    '|---|---:|---:|---|',
    ...reproduction.map((row) => `| ${row.arm} | ${row.published ?? '—'} | ${row.recomputed ?? '—'} | ${row.reproduced == null ? 'not published' : row.reproduced ? 'yes' : 'no'} |`),
  ];
  return renderSummary({
    date: runId,
    summary,
    rows,
    title: 'Lifecycle benchmark, re-scored with the two halves separated',
    preamble,
  });
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
  if (options.regrade) {
    if (!options.explicitRunId) {
      process.stderr.write('[lifecycle] --regrade needs --run-id=<saved run> so it re-scores an existing matrix\n');
      process.exitCode = 2;
      return;
    }
    const result = regradeRun(options);
    const outputPath = join(options.outputRoot, `${options.runId}-regrade-summary.md`);
    writeFileSync(outputPath, renderRegrade({ runId: options.runId, ...result }), 'utf8');
    for (const row of result.reproduction) {
      process.stdout.write(`  ${row.arm}: published=${row.published ?? '—'} recomputed=${row.recomputed} reproduced=${row.reproduced == null ? 'not published' : row.reproduced}\n`);
    }
    process.stdout.write(`[lifecycle] re-graded ${result.rows.length} saved cells; no Codex process spawned\n`);
    process.stdout.write(`[lifecycle] summary: ${outputPath}\n`);
    if (result.reproduction.some((row) => row.reproduced === false)) process.exitCode = 1;
    return;
  }
  if (options.dryRun) {
    // This used to print "definitions valid" while calling nothing that could
    // fail, so the dry run was a permanently green gate.
    const errors = validateDefinitions();
    if (errors.length) {
      for (const error of errors) process.stderr.write(`[lifecycle] ${error}\n`);
      process.stderr.write(`[lifecycle] ${errors.length} invalid definition(s); no Codex process spawned\n`);
      process.exitCode = 1;
      return;
    }
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

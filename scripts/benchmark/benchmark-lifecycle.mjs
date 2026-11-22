#!/usr/bin/env node

// Paired greenfield/brownfield benchmark: does a prepared meaning layer change an agent's answer
// on the same source? Construction cost is measured by the source-hidden field trial, not here.

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCodexConfig, runBenchmark } from './lifecycle/codex-run.mjs';
import { validateDefinitions, fixtureHeadings, vaultHeadings } from './lifecycle/definition-checks.mjs';
import { CASES, MODES, OUTPUT_SCHEMA, TASKS, benchmarkPlan, classifyEvidence } from './lifecycle/definitions.mjs';
import { DEFAULT_OUTPUT_ROOT } from './lifecycle/paths.mjs';
import { parseTranscriptAnswer, readPublishedCoverage, regradeRun } from './lifecycle/regrade.mjs';
import { renderRegrade } from './lifecycle/render.mjs';
import { scoreFinalAnswer } from './lifecycle/scoring.mjs';

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

export {
  CASES,
  MODES,
  OUTPUT_SCHEMA,
  TASKS,
  benchmarkPlan,
  buildCodexConfig,
  classifyEvidence,
  fixtureHeadings,
  parseTranscriptAnswer,
  readPublishedCoverage,
  regradeRun,
  runBenchmark,
  scoreFinalAnswer,
  validateDefinitions,
  vaultHeadings,
};

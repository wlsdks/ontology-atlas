// Runs one benchmark cell in a throwaway subject with `codex exec`, with or
// without the Atlas MCP server, and writes its transcript.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { buildMarkdown } from '../../../mcp/src/parser.mjs';
import { validateDefinitions } from './definition-checks.mjs';
import { OUTPUT_SCHEMA, benchmarkPlan } from './definitions.mjs';
import { FIXTURE_ROOT, MCP_SERVER, REPO_ROOT } from './paths.mjs';
import { renderSummary } from './render.mjs';
import { armIntegrity, scoreFinalAnswer, transcriptCallCounts } from './scoring.mjs';
import { buildSummary } from './summary-stats.mjs';

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
  const { mcpCalls, failedMcpCalls, shellCalls } = transcriptCallCounts(transcript);
  const tokens = Number((transcript.match(/tokens used:?\s*([\d,]+)/i) ?? [])[1]?.replace(/,/g, '') ?? 0);
  const integrity = armIntegrity(mode, { mcpCalls, failedMcpCalls });
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

#!/usr/bin/env node

// Runs an independent grader over a saved grading packet.
//
// The first reading of a benchmark's answers was done by the same assistant that
// built the scoring, which is the weakest possible arrangement: it had seen the
// earlier numbers and knew what it expected to find. This gives the same packet
// to a separate process — a fresh agent, a different model, no memory of this
// repository's conversation — and records its grades in the same shape, so the
// two readings can be compared cell by cell.
//
// Where two graders agree, the grade is probably about the answer. Where they
// disagree, the criteria are unclear, and that is the more useful output.
//
// This still is not a person. It removes one specific bias — a grader scoring
// its own earlier conclusion — and leaves the rest.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMarkdown } from '../mcp/src/parser.mjs';
import { CASES } from './benchmark-lifecycle.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests/fixtures/meaning-corpus');
const DEFAULT_RESULT_ROOT = join(REPO_ROOT, 'docs/benchmark/results');

export const GRADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['grades'],
  properties: {
    grades: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'correct', 'citations', 'boundary', 'nextStep', 'unsupported', 'note'],
        properties: {
          id: { type: 'string' },
          correct: { type: 'integer', minimum: 0, maximum: 3 },
          citations: { type: 'integer', minimum: 0, maximum: 2 },
          boundary: { type: 'integer', minimum: 0, maximum: 2 },
          nextStep: { type: 'integer', minimum: 0, maximum: 2 },
          unsupported: { type: 'integer', minimum: 0 },
          note: { type: 'string' },
        },
      },
    },
  },
};

export const AXES = Object.freeze([
  { key: 'correct', max: 3, label: 'Correct' },
  { key: 'citations', max: 2, label: 'Citations' },
  { key: 'boundary', max: 2, label: 'Boundary' },
  { key: 'nextStep', max: 2, label: 'Next step' },
]);

// The grader needs the same material a person would open: the answers, the
// criteria, the source each answer was written about, and the vault the Atlas
// side could read. Withholding the vault would make its citations ungradeable.
export function prepareGradingWorkspace({ packetPath, rubricPath, scratchRoot }) {
  mkdirSync(scratchRoot, { recursive: true });
  cpSync(packetPath, join(scratchRoot, 'answers.md'));
  cpSync(rubricPath, join(scratchRoot, 'criteria.md'));
  for (const entry of CASES) {
    cpSync(join(FIXTURE_ROOT, entry.fixture), join(scratchRoot, `source-${entry.id}`), {
      recursive: true,
      filter: (source) => !source.endsWith('golden.json'),
    });
    for (const node of entry.nodes) {
      const target = join(scratchRoot, `vault-${entry.id}`, `${node.slug}.md`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, buildMarkdown({
        frontmatter: { slug: node.slug, kind: node.kind, title: node.title, ...node.frontmatter },
        body: node.body,
      }), 'utf8');
    }
  }
  return scratchRoot;
}

export function gradingPrompt(cellCount) {
  return [
    `Grade ${cellCount} answers in answers.md. Each answer has an opaque id and was`,
    'written by an AI agent asked one question about one of the two codebases here.',
    '',
    'You have: answers.md (the answers), criteria.md (how to score, section',
    '"Lifecycle matrix scoring"), source-greenfield/ and source-brownfield/ (the',
    'codebases the questions were about), and vault-greenfield/ and',
    'vault-brownfield/ (a curated concept vault that some of the answering agents',
    'could read and others could not).',
    '',
    'Read the sources and the vault before scoring, and check every path and',
    'concept an answer cites against them.',
    '',
    'Score every id on correct (0-3), citations (0-2), boundary (0-2) and',
    'nextStep (0-2), and count unsupported claims. Put the one thing that decided',
    'the correct score in note, in one sentence.',
    '',
    'Some answers name vault concepts and some describe the same idea in ordinary',
    'words. That difference is not itself a quality difference — grade what the',
    'answer establishes about the codebase, not which vocabulary it used.',
    '',
    'Return exactly one JSON object matching the provided output schema. Do not',
    'edit any file.',
  ].join('\n');
}

export function compareGradings(mine, theirs) {
  const ids = Object.keys(mine).filter((id) => id in theirs).sort();
  const perAxis = AXES.map(({ key, max, label }) => {
    const diffs = ids.map((id) => Math.abs(mine[id][key] - theirs[id][key]));
    const exact = diffs.filter((value) => value === 0).length;
    return {
      key,
      label,
      max,
      cells: ids.length,
      exact,
      exactRate: ids.length === 0 ? null : Number((exact / ids.length).toFixed(3)),
      within1: ids.length === 0 ? null : Number((diffs.filter((v) => v <= 1).length / ids.length).toFixed(3)),
      meanAbsolute: ids.length === 0 ? null : Number((diffs.reduce((a, b) => a + b, 0) / ids.length).toFixed(3)),
    };
  });
  const disagreements = ids
    .map((id) => ({
      id,
      gap: Math.max(...AXES.map(({ key }) => Math.abs(mine[id][key] - theirs[id][key]))),
      mine: Object.fromEntries(AXES.map(({ key }) => [key, mine[id][key]])),
      theirs: Object.fromEntries(AXES.map(({ key }) => [key, theirs[id][key]])),
    }))
    .filter((row) => row.gap >= 2)
    .sort((a, b) => b.gap - a.gap || a.id.localeCompare(b.id));
  return { ids, perAxis, disagreements };
}

export function runGrader({ runId, resultRoot, keep = false }) {
  const packetPath = join(resultRoot, `${runId}-blind-packet.md`);
  if (!existsSync(packetPath)) throw new Error(`no packet for ${runId}; run: pnpm benchmark:blind-set --run-id=${runId}`);
  const cellCount = (readFileSync(packetPath, 'utf8').match(/^## C\d+/gm) ?? []).length;
  const scratchRoot = join(tmpdir(), `ontology-atlas-grading-${randomUUID()}`);
  try {
    prepareGradingWorkspace({
      packetPath,
      rubricPath: join(REPO_ROOT, 'docs/benchmark/rubric.md'),
      scratchRoot,
    });
    const schemaPath = join(scratchRoot, 'grade.schema.json');
    writeFileSync(schemaPath, `${JSON.stringify(GRADE_SCHEMA, null, 2)}\n`, 'utf8');
    const answerPath = join(scratchRoot, 'grades.json');
    const started = Date.now();
    const result = spawnSync('codex', [
      'exec',
      '--cd', scratchRoot,
      '--ignore-user-config',
      '--ephemeral',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
      '--output-schema', schemaPath,
      '--output-last-message', answerPath,
      gradingPrompt(cellCount),
    ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const durationMs = Date.now() - started;
    const transcript = (result.stdout ?? '') + (result.stderr ? `\n[stderr]\n${result.stderr}` : '');
    writeFileSync(join(resultRoot, `${runId}-independent-grader.txt`), transcript, 'utf8');
    if (!existsSync(answerPath)) throw new Error('the grader produced no output; see the saved transcript');
    const parsed = JSON.parse(readFileSync(answerPath, 'utf8'));
    if (parsed.grades.length !== cellCount) {
      throw new Error(`the grader returned ${parsed.grades.length} grades for ${cellCount} answers`);
    }
    const byId = Object.fromEntries(parsed.grades.map((row) => [row.id, row]));
    writeFileSync(join(resultRoot, `${runId}-independent-grades.json`), `${JSON.stringify(byId, null, 1)}\n`, 'utf8');
    return { byId, cellCount, durationMs, status: result.status };
  } finally {
    if (!keep) rmSync(scratchRoot, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  const runId = argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    process.stderr.write('[grade] needs --run-id=<run with a saved packet>\n');
    process.exitCode = 2;
    return;
  }
  const resultRoot = resolve(argv.find((arg) => arg.startsWith('--results='))?.slice('--results='.length) ?? DEFAULT_RESULT_ROOT);
  if (!argv.includes('--bypass')) {
    process.stderr.write('[grade] requires --bypass because it spawns a read-only codex exec grader\n');
    process.exitCode = 2;
    return;
  }
  const { byId, cellCount, durationMs } = runGrader({ runId, resultRoot });
  process.stdout.write(`[grade] independent grader scored ${Object.keys(byId).length}/${cellCount} answers in ${(durationMs / 1000).toFixed(1)}s\n`);
  process.stdout.write(`[grade] grades: ${join(resultRoot, `${runId}-independent-grades.json`)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

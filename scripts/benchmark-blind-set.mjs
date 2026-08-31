#!/usr/bin/env node

// Builds a grading packet from a saved lifecycle run.
//
// The machine score counts whether an answer contained the right words. It
// cannot tell whether the answer was true, whether the boundary was right, or
// whether the next step was worth taking. A person has to read the answers for
// that — and a person who knows which side wrote each answer will find what
// they expect to find.
//
// So this writes two files: a packet where the answers carry opaque ids in a
// shuffled order, and a key that maps those ids back. Grade the packet, save the
// grades, and only then open the key. The shuffle is seeded from the run id, so
// two people grading the same run receive the same packet in the same order.
//
// One limit this cannot remove: an answer written with a vault names its
// concepts, and an answer written without one does not. A grader will often be
// able to tell the sides apart from the wording alone. Blinding here protects
// against grading in a convenient order and against scoring the label instead of
// the answer; it is not a claim that the grader cannot guess.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RESULT_ROOT = join(REPO_ROOT, 'docs/benchmark/results');
const TRANSCRIPT_STDERR_MARKER = '\n[stderr]\n';

// A tiny deterministic generator, so the packet is reproducible from the run id
// alone and nobody has to trust a shuffle they cannot repeat.
export function seededShuffle(items, seedText) {
  let seed = 0;
  for (const character of seedText) seed = (Math.imul(seed, 31) + character.codePointAt(0)) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function collectAnswers({ runId, resultRoot }) {
  const pattern = new RegExp(`^${runId}-(\\w+)-(\\w+)-(off|on)-r(\\d+)\\.txt$`);
  const collected = [];
  for (const filename of readdirSync(resultRoot).sort()) {
    const match = filename.match(pattern);
    if (!match) continue;
    const [, subject, task, side, iteration] = match;
    const stdout = readFileSync(join(resultRoot, filename), 'utf8').split(TRANSCRIPT_STDERR_MARKER)[0].trim();
    let answer = null;
    let parseError = null;
    try {
      answer = JSON.parse(stdout);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    collected.push({ filename, subject, task, side, iteration: Number(iteration), answer, parseError });
  }
  return collected;
}

export function renderPacket({ runId, entries }) {
  const lines = [
    `# Grading packet — ${runId}`,
    '',
    'Each answer below is identified only by an opaque id, and the order is shuffled.',
    'Which side wrote which answer is withheld until the grades are saved.',
    '',
    'Score each answer on four axes and one count. Full definitions are in',
    '`docs/benchmark/rubric.md`, section "Lifecycle matrix scoring". In short:',
    '',
    '| Axis | Out of | What full marks means |',
    '|---|---:|---|',
    '| Correct | **3** | Everything the question asked for is present and accurate, with no false claim. |',
    '| Citations | **2** | Every path and concept it cites exists, and each supports the claim made from it. |',
    '| Boundary | **2** | Names the responsibility that owns the work **and** what is outside it. |',
    '| Next step | **2** | A second agent could act on it without coming back to ask. |',
    '| Unsupported | count | Statements the source and vault do not support. A count, never averaged in. |',
    '',
    'Always write a score with its maximum: `2 / 3`, never `2`.',
    '',
    'The question each answer was given is shown, because the same question was put',
    'to both sides and grading without it is impossible.',
    '',
  ];
  for (const entry of entries) {
    lines.push(`## ${entry.id}  (question ${entry.task})`, '');
    if (entry.parseError) {
      lines.push(`_This cell produced no readable answer: ${entry.parseError}_`, '');
      continue;
    }
    lines.push(`**Answer**: ${entry.answer.answer}`, '', '**Evidence given**:');
    for (const item of entry.answer.evidence) lines.push(`- ${item}`);
    lines.push('', `**Next step proposed**: ${entry.answer.nextAction}`, '', '**Stated as unknown**:');
    for (const item of entry.answer.unknowns) lines.push(`- ${item}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function buildBlindSet({ runId, resultRoot, outputRoot }) {
  const collected = collectAnswers({ runId, resultRoot });
  if (collected.length === 0) throw new Error(`no saved answers for --run-id=${runId} in ${resultRoot}`);
  const entries = seededShuffle(collected, runId).map((entry, index) => ({
    ...entry,
    id: `C${String(index + 1).padStart(2, '0')}`,
  }));
  const key = Object.fromEntries(entries.map((entry) => [entry.id, {
    file: entry.filename,
    side: entry.side,
    subject: entry.subject,
    task: entry.task,
    iteration: entry.iteration,
  }]));
  mkdirSync(outputRoot, { recursive: true });
  const packetPath = join(outputRoot, `${runId}-blind-packet.md`);
  const keyPath = join(outputRoot, `${runId}-blind-key.json`);
  writeFileSync(packetPath, renderPacket({ runId, entries }), 'utf8');
  writeFileSync(keyPath, `${JSON.stringify(key, null, 1)}\n`, 'utf8');
  return { entries, key, packetPath, keyPath };
}

function main() {
  const argv = process.argv.slice(2);
  const runId = argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    process.stderr.write('[blind-set] needs --run-id=<saved run>, for example --run-id=2026-08-31-gb-r3\n');
    process.exitCode = 2;
    return;
  }
  const resultRoot = resolve(argv.find((arg) => arg.startsWith('--results='))?.slice('--results='.length) ?? DEFAULT_RESULT_ROOT);
  const outputRoot = resolve(argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ?? resultRoot);
  if (!existsSync(resultRoot)) {
    process.stderr.write(`[blind-set] no such results directory: ${resultRoot}\n`);
    process.exitCode = 2;
    return;
  }
  const { entries, packetPath, keyPath } = buildBlindSet({ runId, resultRoot, outputRoot });
  process.stdout.write(`[blind-set] ${entries.length} answers, order shuffled, side withheld\n`);
  process.stdout.write(`[blind-set] packet: ${packetPath}\n`);
  process.stdout.write(`[blind-set] key:    ${keyPath}  — open only after the grades are saved\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { DEFAULT_RESULT_ROOT };

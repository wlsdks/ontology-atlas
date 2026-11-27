// `--goldens`: the corpus answers frozen to files, so that after the JavaScript server is deleted
// the Rust server still has something to equal. `--goldens=write` runs the chosen server (`--a`,
// default node) and stores each case; `--goldens` (or `--goldens=compare`) runs the chosen server
// and compares it with the stored files by the same rules as two live servers.
//
// What is stored is what the comparison reads: the answer lines, the server's own messages, stderr,
// exit, the folder (kind, mode, hash, and text up to 4 KiB) and the repository state. The run's
// work folder is written as `$WORK` and the times of files the run wrote as a token, so a golden
// does not depend on where or when it was made.
//
// Some answers hash the absolute path of the vault (a project source's `sourceId`), so goldens are
// made and checked one case at a time at one fixed path, `/tmp/oatlas-differential-golden` (or
// `--golden-root`), never in parallel. A machine whose `/tmp` is a link to another folder makes
// different hashes than one whose is not: goldens are per platform until the Rust server owns
// the hashing, and the cut-over slice decides where they are kept.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HarnessContext, runCaseOnServer } from './case-runner.mjs';
import { compareRuns, formatDifference, maskOwnTimesInText } from './compare-runs.mjs';
import { exceptRulesByFamily } from './manifest.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

const DEFAULT_GOLDEN_ROOT = '/tmp/oatlas-differential-golden';
export const GOLDEN_DIRECTORY = ['tests', 'differential', 'goldens'];

function portable(text, workDir, ownTimes) {
  if (typeof text !== 'string') return text;
  return maskOwnTimesInText(text.replaceAll(workDir, '$WORK'), ownTimes);
}

export function toGolden(run, workDir) {
  const own = run.ownTimes;
  return {
    answers: run.answers.map((answer) => ({
      step: answer.step,
      id: answer.id,
      request: answer.request ? JSON.parse(portable(JSON.stringify(answer.request), workDir, new Set())) : undefined,
      response: portable(answer.response, workDir, own),
      directive: answer.directive,
    })),
    serverMessages: run.serverMessages.map((message) => ({ ...message, raw: portable(message.raw, workDir, own) })),
    stderr: portable(run.stderr, workDir, own),
    exit: run.exit,
    folder: [...run.folder].map(([name, entry]) => [name, { ...entry, text: entry.text === undefined ? undefined : portable(entry.text, workDir, own) }]),
    git: run.git,
  };
}

function fromGolden(golden) {
  return {
    ...golden,
    folder: new Map(golden.folder),
    ownTimes: new Set(),
    ownTimeProblems: [],
  };
}

function goldenFile(directory, caseDef) {
  return path.join(directory, caseDef.family, `${caseDef.name}.json`);
}

export async function runGoldens({ repoRoot, workRoot, cases, values, flags }) {
  const writing = values.goldens === 'write' || flags.has('write');
  const directory = values['goldens-dir'] ? path.resolve(values['goldens-dir']) : path.join(repoRoot, ...GOLDEN_DIRECTORY);
  const context = new HarnessContext({ repoRoot, workRoot });
  const server = resolveServer(values.a ?? 'node', { repoRoot, workRoot });
  for (const fixture of new Set(cases.map((c) => c.header.vault))) context.template(fixture);
  const except = exceptRulesByFamily(repoRoot);
  let failures = 0;
  let checked = 0;
  let next = 0;
  const worker = async () => {
    const workerDir = values['golden-root'] ?? DEFAULT_GOLDEN_ROOT;
    mkdirSync(workerDir, { recursive: true });
    for (;;) {
      const at = next;
      next += 1;
      if (at >= cases.length) return;
      const caseDef = cases[at];
      const run = await runCaseOnServer({ context, caseDef, server, locale: LOCALES[1], workerDir });
      const fresh = toGolden(run, workerDir);
      const file = goldenFile(directory, caseDef);
      if (writing) {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify(fresh)}\n`);
        checked += 1;
        continue;
      }
      if (!existsSync(file)) {
        failures += 1;
        console.log(`  MISSING   ${caseDef.family}/${caseDef.name}: no golden at ${file}`);
        continue;
      }
      const stored = fromGolden(JSON.parse(readFileSync(file, 'utf8')));
      const differences = compareRuns(stored, fromGolden(JSON.parse(JSON.stringify(fresh))), { except: except[caseDef.family] ?? [] });
      checked += 1;
      if (differences.length > 0) {
        failures += 1;
        console.log(`\n${formatDifference(differences[0], { family: caseDef.family, caseName: caseDef.name, labelA: 'golden', labelB: server.label })}`);
      }
    }
  };
  await worker();
  console.log(writing ? `wrote ${checked} goldens under ${directory}` : `${checked} cases compared with their goldens, ${failures} differing`);
  return failures > 0 ? 1 : 0;
}

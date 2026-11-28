// `--goldens`: the corpus answers frozen to files, so that after the JavaScript server is deleted
// the Rust server still has something to equal. `--goldens=write` runs the chosen server (`--a`,
// default node) and stores each case; `--goldens` (or `--goldens=compare`) runs the chosen server
// and compares it with the stored files by the same rules as two live servers.
//
// What is stored is what the comparison reads: the answer lines, the server's own messages, stderr,
// exit, the folder (kind, mode, hash, and text up to 256 KiB) and the repository state. Nothing in a
// golden depends on where or when it was made:
//   - the run's folder is written as `$WORK`;
//   - a hash of a root path (a project source's `sourceId` is the SHA-256 of its kind and root) is
//     written as the root's place under `$WORK`, because the same hash cannot be made elsewhere;
//   - the times of files the run wrote are written as a token;
//   - a file's hash is the hash of its text as stored, so a file that names the folder hashes alike.
// Each worker has its own folder, so goldens are written and checked in parallel.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HarnessContext, runCaseOnServer } from './case-runner.mjs';
import { compareRuns, formatDifference, maskOwnTimesInText } from './compare-runs.mjs';
import { exceptRulesByFamily } from './manifest.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

const GOLDEN_DIRECTORY = ['tests', 'differential', 'goldens'];
const ROOT_KINDS = ['git', 'folder'];

/** `sha256:<hex>` of a source root as the server computes it, to a place-independent token. */
function rootDigests(workDirs, folder) {
  const digests = new Map();
  const roots = new Set(['case']);
  for (const [key, entry] of folder) if (entry.kind === 'dir' && !key.includes(':')) roots.add(`case/${key.split(path.sep).join('/')}`);
  for (const workDir of workDirs) {
    for (const root of roots) {
      const absolute = path.join(workDir, ...root.split('/'));
      for (const kind of ROOT_KINDS) {
        const hash = createHash('sha256');
        for (const part of [kind, absolute]) {
          hash.update(part);
          hash.update(Buffer.from([0]));
        }
        digests.set(`sha256:${hash.digest('hex')}`, `sha256:<${kind}-root $WORK/${root}>`);
      }
    }
  }
  return digests;
}

// A folder source's revision hashes the size of every file in it, and a vault inside the source holds
// logs that name the run's folder, so the revision cannot be made place-independent by naming roots.
// A case whose header says `revisionsDependOnPlace` stores those values as a token instead.
const REVISION_VALUE = /((?:sourceRevision|sourceFingerprint|fingerprint|revision)\\*":\s*\\*"sha256:)[0-9a-f]{64}/g;

function placeIndependent(text, { workDirs, digests, ownTimes, maskRevisions }) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const [digest, token] of digests) result = result.replaceAll(digest, token);
  for (const workDir of workDirs) result = result.replaceAll(workDir, '$WORK');
  if (maskRevisions) result = result.replace(REVISION_VALUE, '$1<place-dependent>');
  return maskOwnTimesInText(result, ownTimes);
}

/** A request with the times of files the run wrote (sent back from an earlier answer) as a token. */
function withoutOwnTimes(value, ownTimes) {
  if (typeof value === 'number') return ownTimes.has(value) ? '<own-file-time>' : value;
  if (Array.isArray(value)) return value.map((item) => withoutOwnTimes(item, ownTimes));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutOwnTimes(item, ownTimes)]));
  return value;
}

function toGolden(run, workDir, { maskRevisions = false } = {}) {
  const workDirs = [...new Set([workDir, existsSync(workDir) ? realpathSync(workDir) : workDir])];
  const context = { workDirs, digests: rootDigests(workDirs, run.folder), ownTimes: run.ownTimes, maskRevisions };
  const portable = (text) => placeIndependent(text, context);
  return {
    answers: run.answers.map((answer) => ({
      step: answer.step,
      id: answer.id,
      request: answer.request
        ? withoutOwnTimes(JSON.parse(placeIndependent(JSON.stringify(answer.request), { ...context, ownTimes: new Set() })), run.ownTimes)
        : undefined,
      response: portable(answer.response),
      responseBytes: answer.responseBytes === undefined ? undefined : portable(answer.responseBytes),
      directive: answer.directive,
    })),
    serverMessages: run.serverMessages.map((message) => ({ ...message, raw: portable(message.raw), bytes: portable(message.bytes) })),
    stderr: portable(run.stderr),
    exit: run.exit,
    folder: [...run.folder].map(([name, entry]) => {
      if (entry.text === undefined) return [name, entry];
      const text = portable(entry.text);
      return [name, { ...entry, text, size: text.length, sha: createHash('sha256').update(text, 'latin1').digest('hex') }];
    }),
    git: run.git === null ? null : { head: run.git.head, status: portable(run.git.status) },
  };
}

function fromGolden(golden) {
  return { ...golden, folder: new Map(golden.folder), ownTimes: new Set(), problems: [] };
}

function goldenFile(directory, caseDef) {
  return path.join(directory, caseDef.family, `${caseDef.name}.json`);
}

export async function runGoldens({ repoRoot, workRoot, cases, values, flags, concurrency }) {
  const writing = values.goldens === 'write' || flags.has('write');
  const directory = values['goldens-dir'] ? path.resolve(values['goldens-dir']) : path.join(repoRoot, ...GOLDEN_DIRECTORY);
  const context = new HarnessContext({ repoRoot, workRoot });
  const server = resolveServer(values.a ?? 'node', { repoRoot, workRoot });
  for (const fixture of new Set(cases.map((c) => c.header.vault))) context.template(fixture);
  const except = exceptRulesByFamily(repoRoot);
  let failures = 0;
  let checked = 0;
  let next = 0;
  const worker = async (index) => {
    const workerDir = path.join(workRoot, `golden-worker-${index}`);
    for (;;) {
      const at = next;
      next += 1;
      if (at >= cases.length) return;
      const caseDef = cases[at];
      const run = await runCaseOnServer({ context, caseDef, server, locale: LOCALES[1], workerDir });
      const fresh = toGolden(run, workerDir, { maskRevisions: caseDef.header.revisionsDependOnPlace === true });
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
      const current = { ...fromGolden(JSON.parse(JSON.stringify(fresh))), problems: run.problems };
      const differences = compareRuns(stored, current, { except: except[caseDef.family] ?? [] });
      checked += 1;
      if (differences.length > 0) {
        failures += 1;
        for (const difference of differences) {
          console.log(`\n${formatDifference(difference, { family: caseDef.family, caseName: caseDef.name, labelA: 'golden', labelB: server.label })}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency ?? 4) }, (_, index) => worker(index)));
  console.log(writing ? `wrote ${checked} goldens under ${directory}` : `${checked} cases compared with their goldens, ${failures} differing`);
  return failures > 0 ? 1 : 0;
}


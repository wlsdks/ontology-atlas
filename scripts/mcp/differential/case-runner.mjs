// Runs one corpus case against one server on a folder restored from a template, and records what
// the comparison needs. Two servers compared on one case run one after the other on the same
// absolute path, each from a fresh restore, so paths in answers are equal by construction.
//
// A case runs inside a worker folder holding exactly two things, `case/` (the fixture, the vault
// and anything beside it) and `home/` (HOME and the temporary folder). After the run all of it is
// read back: anything else in the worker folder is a write the server made outside its case.
import { execFileSync } from 'node:child_process';
import {
  closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { createHash } from 'node:crypto';

import { snapshotFolder } from './folder-snapshot.mjs';
import { parseOrdered } from './ordered-json.mjs';
import { resolveTokens, runSession } from './rpc-session.mjs';
import { FIXED_CLOCK_MS, serverEnvironment } from './servers.mjs';
import { buildSourceSnapshot } from '../../../tests/differential/support/source-snapshot.mjs';
import {
  GIT_ENV,
  HARDENED_GIT_ARGS,
  SECRET_SENTINEL,
  buildFixture,
  plantMtimes,
  replantMtimes,
  vaultRelOf,
} from '../../../tests/differential/support/vault-fixtures.mjs';

/** Keys of an answer that carry a file's modification time, and the sibling keys that name the file. */
const TIME_KEYS = Object.freeze({
  mtime: ['slug', 'path', 'from'],
  mtimeMs: ['slug', 'path', 'from'],
  newMtime: ['newSlug', 'slug'],
  newMtimeMs: ['newSlug', 'slug'],
  intoMtime: ['intoSlug'],
});

export class HarnessContext {
  constructor({ repoRoot, workRoot }) {
    this.repoRoot = repoRoot;
    this.workRoot = workRoot;
    this.templates = new Map();
  }

  template(fixture) {
    if (!this.templates.has(fixture)) {
      const dir = path.join(this.workRoot, 'templates', fixture);
      buildFixture(fixture, dir, { repoRoot: this.repoRoot });
      this.templates.set(fixture, { dir, plan: plantMtimes(dir) });
    }
    return this.templates.get(fixture);
  }

  /** Puts a fresh copy of the fixture at `caseDir` with its planted times; returns the vault path. */
  restore(fixture, caseDir) {
    const { dir, plan } = this.template(fixture);
    rmSync(caseDir, { recursive: true, force: true });
    mkdirSync(path.dirname(caseDir), { recursive: true });
    cpSync(dir, caseDir, { recursive: true, verbatimSymlinks: true });
    replantMtimes(caseDir, plan);
    return path.join(caseDir, vaultRelOf(fixture));
  }
}

/** Relative path to modification time of every regular file under `root`, a repository's own folder left out. */
function fileTimes(root) {
  const times = new Map();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' && existsSync(path.join(dir, entry.name, 'HEAD'))) continue;
      const full = path.join(dir, entry.name);
      const info = lstatSync(full);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) visit(full);
      else times.set(path.relative(root, full), info.mtimeMs);
    }
  };
  visit(root);
  return times;
}

function gitState(caseDir) {
  const repo = path.join(caseDir, 'repo');
  if (!existsSync(path.join(repo, '.git'))) return null;
  const run = (args) => {
    try {
      // The harness reads the repository the way the server must.
      return execFileSync('git', [...HARDENED_GIT_ARGS, '-C', repo, ...args], {
        env: { ...process.env, ...GIT_ENV },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (error) {
      return `error: ${String(error.stderr ?? error.message).trim()}`;
    }
  };
  return { head: run(['rev-parse', 'HEAD']), status: run(['status', '--porcelain']) };
}

/** Walks every object in an answer; calls `visit(entries, pathText)` for each. */
function eachObject(node, visit, pathText = '') {
  if (node.t === 'arr') node.items.forEach((item, index) => eachObject(item, visit, `${pathText}[${index}]`));
  if (node.t !== 'obj') return;
  visit(node.entries, pathText);
  for (const [key, child] of node.entries) eachObject(child, visit, pathText ? `${pathText}.${key}` : key);
}

/**
 * Each time an answer reports for a file must be the time that file has now (the answer is checked
 * the moment it arrives, before the next step can change anything). A time named for a file that
 * does not exist cannot be checked and is skipped; it still has to equal the other server's.
 * @returns {{ path: string, detail: string }[]}
 */
function wrongReportedTimes(answer, vaultPath) {
  let tree;
  try {
    tree = parseOrdered(answer.response);
  } catch {
    return [];
  }
  const problems = [];
  const checkTime = (relative, node, where) => {
    let actual;
    try {
      actual = statSync(path.join(vaultPath, relative)).mtimeMs;
    } catch {
      return;
    }
    if (actual !== Number(node.text)) {
      problems.push({
        kind: 'own-time',
        path: `step ${answer.step} ${where}`,
        detail: `reported ${node.text} for ${relative}, whose time is ${actual}`,
      });
    }
  };
  eachObject(tree, (entries, pathText) => {
    // `mtimes` maps a slug to its file's time.
    if (/(^|\.)mtimes$/.test(pathText)) {
      for (const [slug, node] of entries) if (node.t === 'num') checkTime(`${slug}.md`, node, `${pathText}.${slug}`);
      return;
    }
    for (const [key, node] of entries) {
      const namedBy = TIME_KEYS[key];
      if (!namedBy || node.t !== 'num') continue;
      for (const sibling of namedBy) {
        const value = entries.find(([name]) => name === sibling)?.[1];
        if (value?.t !== 'str') continue;
        const relative = /slug$|^from$/i.test(sibling) ? `${value.v}.md` : value.v;
        if (existsSync(path.join(vaultPath, relative))) {
          checkTime(relative, node, `${pathText ? `${pathText}.` : ''}${key}`);
          break;
        }
      }
    }
  });
  return problems;
}

/** `[]` when a case's written markdown files are all whole; each broken one as a problem otherwise. */
function brokenWrittenFiles(caseDir, templateDir) {
  const problems = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.name.endsWith('.md') || entry.name.includes('.oatlas-tmp-')) continue;
      const relative = path.relative(caseDir, full);
      let bytes;
      try {
        bytes = readFileSync(full);
      } catch {
        continue;
      }
      const original = existsSync(path.join(templateDir, relative)) ? readFileSync(path.join(templateDir, relative)) : null;
      if (original?.equals(bytes)) continue;
      const text = bytes.toString('utf8');
      if (!/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.test(text)) {
        problems.push({ kind: 'invariant', path: relative, detail: 'a written file is cut short: its frontmatter does not close' });
      }
    }
  };
  visit(caseDir);
  return problems;
}

function secretLeaks(run, requestsText) {
  const leaks = [];
  const check = (where, text, allowedBy) => {
    for (const found of new Set(text.match(SECRET_SENTINEL) ?? [])) {
      if (!allowedBy.includes(found)) leaks.push({ kind: 'secret', path: where, detail: `shows ${found}, which no request asked for` });
    }
  };
  for (const answer of run.answers) {
    if (answer.response) check(`answer ${JSON.stringify(answer.id)}`, answer.response, JSON.stringify(answer.request));
  }
  run.serverMessages.forEach((message, index) => check(`server message ${index}`, message.raw, requestsText));
  check('stderr', run.stderr, requestsText);
  return leaks;
}

function emptyWorkerFolder(workerDir) {
  mkdirSync(workerDir, { recursive: true });
  for (const name of readdirSync(workerDir)) rmSync(path.join(workerDir, name), { recursive: true, force: true });
}

/** An open descriptor onto a freshly built snapshot, or undefined; the file is gone once it is open. */
function openSnapshotDescriptor(header, caseDir, scratch) {
  if (!header.snapshot) return undefined;
  const file = path.join(scratch, `snapshot-${createHash('sha1').update(caseDir).digest('hex').slice(0, 8)}.json`);
  mkdirSync(scratch, { recursive: true });
  writeFileSync(file, buildSourceSnapshot(path.join(caseDir, header.snapshot.root ?? 'repo'), header.snapshot));
  const descriptor = openSync(file, 'r');
  unlinkSync(file);
  return descriptor;
}

/**
 * @param {object} options
 * @param {HarnessContext} options.context
 * @param {{ family: string, name: string, header: object, steps: object[] }} options.caseDef
 * @param {import('./servers.mjs').ServerSpec} options.server
 * @param {string} options.locale
 * @param {string} options.workerDir
 * @param {string} [options.coverageDir]
 */
export async function runCaseOnServer({ context, caseDef, server, locale, workerDir, coverageDir }) {
  const { header, steps } = caseDef;
  emptyWorkerFolder(workerDir);
  const caseDir = path.join(workerDir, 'case');
  const homeDir = path.join(workerDir, 'home');
  mkdirSync(homeDir, { recursive: true });
  const vaultPath = context.restore(header.vault, caseDir);
  const plantedTimes = fileTimes(caseDir);
  const plantedValues = new Set(plantedTimes.values());
  const tokens = { vaultPath, parentPath: path.dirname(vaultPath) };
  const environment = serverEnvironment({
    locale,
    vaultPath,
    homeDir,
    extra: resolveTokens(header.env, tokens),
    coverageDir,
    deterministic: server.deterministic,
    clockMs: header.clockMs ?? FIXED_CLOCK_MS,
  });
  for (const [key, value] of Object.entries(environment)) if (value === null || value === undefined) delete environment[key];
  const cwd = header.cwd === 'vault' ? vaultPath : caseDir;
  const snapshotFd = openSnapshotDescriptor(header, caseDir, path.join(context.workRoot, 'snapshots'));

  const ownTimes = new Set();
  const problems = [];
  // A time a `touch` step sets is fixed by the corpus, like a planted one, not a time the system chose.
  const touched = steps.filter((step) => step.$ === 'touch').map((step) => step.mtimeMs);
  const isChosenByCorpus = (time) => plantedValues.has(time) || touched.some((value) => Math.abs(value - time) < 0.01);
  const noteTimes = () => {
    for (const time of fileTimes(caseDir).values()) if (!isChosenByCorpus(time)) ownTimes.add(time);
  };
  const session = await runSession({
    server,
    steps: steps.map((step) => ({ ...step })),
    env: environment,
    cwd,
    vaultPath,
    handshake: header.handshake
      ? { protocolVersion: header.protocol, capabilities: header.capabilities }
      : null,
    elicit: header.elicit,
    snapshotFd,
    onAnswer: (answer) => {
      noteTimes();
      if (answer.response && answer.request?.method === 'tools/call') problems.push(...wrongReportedTimes(answer, vaultPath));
    },
  });
  noteTimes();
  if (snapshotFd !== undefined) closeSync(snapshotFd);

  for (const relative of header.mustNotExist) {
    if (existsSync(path.join(caseDir, relative))) {
      problems.push({ kind: 'must-not-exist', path: relative, detail: 'exists, so something ran that a hostile setting named' });
    }
  }
  const requestsText = JSON.stringify(steps);
  // Where a kill lands inside a batch is a race, so such a case compares only what must hold
  // wherever it lands (`invariants`), never the answers, the exit or the bytes on disk.
  const raced = header.folder === 'invariants';
  const recorded = raced
    ? { ...session, answers: [], serverMessages: [], stderr: '', exit: { code: null, signal: 'SIGKILL' } }
    : session;
  const run = { server: server.label, locale, ...recorded };
  problems.push(...secretLeaks(run, requestsText));
  for (const detail of session.unresolved ?? []) problems.push({ kind: 'answer-reference', path: 'request', detail });
  if (header.invariants?.includes('atomic-writes')) problems.push(...brokenWrittenFiles(caseDir, context.template(header.vault).dir));

  const folder = raced ? new Map() : snapshotFolder(caseDir, { planted: plantedTimes });
  for (const [key, entry] of snapshotFolder(homeDir, { prefix: 'home:' })) folder.set(key, entry);
  const insideWorkerFolder = (relative) => relative === 'case' || relative === 'home';
  for (const [key, entry] of snapshotFolder(workerDir, { prefix: 'outside:', skip: insideWorkerFolder })) folder.set(key, entry);
  for (const key of folder.keys()) {
    if (key.startsWith('outside:')) problems.push({ kind: 'outside-write', path: key.slice('outside:'.length), detail: 'a file or folder outside the case folder' });
  }
  const result = { ...run, folder, git: gitState(caseDir), ownTimes, problems };
  rmSync(homeDir, { recursive: true, force: true });
  return result;
}

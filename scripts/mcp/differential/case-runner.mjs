// Runs one corpus case against one server on a folder restored from a template, and records what
// the comparison needs. Two servers compared on one case run one after the other on the same
// absolute path, each from a fresh restore, so paths in answers are equal by construction.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { findNumbersNamed } from './compare-runs.mjs';
import { snapshotFolder } from './folder-snapshot.mjs';
import { resolveTokens, runSession } from './rpc-session.mjs';
import { serverEnvironment } from './servers.mjs';
import {
  GIT_ENV,
  PLANTED_BASE_MS,
  buildFixture,
  plantMtimes,
  replantMtimes,
  vaultRelOf,
} from '../../../tests/differential/support/vault-fixtures.mjs';

const OWN_TIME_KEYS = ['mtime', 'newMtime', 'intoMtime', 'mtimeMs', 'newMtimeMs'];

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

function regularFileTimes(root) {
  const times = new Set();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' && existsSync(path.join(dir, entry.name, 'HEAD'))) continue;
      const full = path.join(dir, entry.name);
      const info = lstatSync(full);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) visit(full);
      else times.add(info.mtimeMs);
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
      // The harness reads the repository the way the server must: nothing the repository's own
      // settings name is run (a hostile fixture would otherwise run it here).
      const hardened = [
        '--no-optional-locks',
        '-c', 'core.fsmonitor=false',
        '-c', 'core.hooksPath=/dev/null',
        '-c', 'filter.x.clean=cat',
        '-c', 'filter.x.smudge=cat',
        '-c', 'diff.external=',
        '-c', 'core.sshCommand=',
      ];
      return execFileSync('git', [...hardened, '-C', repo, ...args], {
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
  const caseDir = path.join(workerDir, 'case');
  const homeDir = path.join(workerDir, 'home');
  rmSync(homeDir, { recursive: true, force: true });
  mkdirSync(homeDir, { recursive: true });
  const vaultPath = context.restore(header.vault, caseDir);
  const planted = regularFileTimes(caseDir);
  const tokens = { vaultPath, parentPath: path.dirname(vaultPath) };
  const headerEnv = resolveTokens(header.env, tokens);
  const environment = serverEnvironment({
    locale,
    vaultPath,
    homeDir,
    extra: headerEnv,
    coverageDir,
    deterministic: server.deterministic,
  });
  for (const [key, value] of Object.entries(environment)) if (value === null) delete environment[key];
  const cwd = header.cwd === 'vault' ? vaultPath : caseDir;

  const ownTimes = new Set();
  const noteTimes = () => {
    for (const time of regularFileTimes(caseDir)) if (!planted.has(time)) ownTimes.add(time);
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
    onStepDone: noteTimes,
  });
  noteTimes();

  const problems = [];
  for (const answer of session.answers) {
    if (!answer.response || answer.request?.method !== 'tools/call') continue;
    for (const found of findNumbersNamed(answer.response, OWN_TIME_KEYS)) {
      const isPlanted = planted.has(found.value) || found.value < PLANTED_BASE_MS + 1_000_000_000;
      if (!isPlanted && !ownTimes.has(found.value)) {
        problems.push({
          path: `step ${answer.step} ${found.path}`,
          detail: `reported ${found.value}, which is no file's time in the vault`,
        });
      }
    }
  }
  for (const relative of header.mustNotExist) {
    if (existsSync(path.join(caseDir, relative))) {
      problems.push({ path: relative, detail: 'exists, so something ran that a hostile setting named' });
    }
  }
  const run = {
    server: server.label,
    locale,
    ...session,
    folder: snapshotFolder(caseDir),
    git: gitState(caseDir),
    ownTimes,
    ownTimeProblems: problems,
  };
  if (!coverageDir) rmSync(homeDir, { recursive: true, force: true });
  return run;
}

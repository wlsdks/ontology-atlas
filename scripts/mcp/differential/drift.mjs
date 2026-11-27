// `--drift --days=N`: the stop rule of the port. Replays the corpus on the JavaScript server as it
// was N days ago (taken with `git archive` into the work folder, no worktree is created) and as it
// is now, and counts the answers that changed. When more answers changed in families marked
// `proven` than were newly proven equal in those days (`--newly-proven=<n>`), the port is chasing a
// moving target: exit 1, stop and re-plan with the owner.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { loadManifest } from './manifest.mjs';
import { runPairs } from './run-pairs.mjs';
import { LOCALES, resolveServer } from './servers.mjs';

function git(repoRoot, args, options = {}) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

/**
 * The old tree's own locked dependencies, from the package store; the packages of two weeks ago
 * are not the packages of today (the Markdown reader changed in that time). `--offline` first so
 * nothing leaves the machine when the store has them.
 */
function installDependencies(folder) {
  const flags = ['install', '--frozen-lockfile', '--ignore-scripts'];
  try {
    execFileSync('pnpm', [...flags, '--offline'], { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    console.error('the package store lacks the old dependencies; installing them from the registry');
    execFileSync('pnpm', flags, { cwd: folder, stdio: ['ignore', 'pipe', 'inherit'] });
  }
}

/** The JavaScript server tree as of `days` days ago, extracted under `workRoot`; returns its path. */
export function extractTreeFromDaysAgo({ repoRoot, workRoot, days }) {
  const commit = git(repoRoot, ['rev-list', '-1', `--before=${days} days ago`, 'HEAD']);
  if (!commit) throw new Error(`no commit older than ${days} days on this branch`);
  const tree = path.join(workRoot, `drift-tree-${commit.slice(0, 12)}`);
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });
  const archive = execFileSync('git', ['archive', '--format=tar', commit, 'mcp'], {
    cwd: repoRoot,
    maxBuffer: 512 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', tree], { input: archive });
  installDependencies(path.join(tree, 'mcp'));
  const date = git(repoRoot, ['show', '-s', '--format=%cI', commit]);
  return { tree, commit, date };
}

export async function runDrift({ repoRoot, workRoot, cases, values, concurrency }) {
  const days = Number(values.days ?? 14);
  const old = extractTreeFromDaysAgo({ repoRoot, workRoot, days });
  console.log(`replaying against the server as of ${old.date} (${old.commit.slice(0, 12)}, ${days} days ago) and as it is now`);
  const serverA = resolveServer(`node:${old.tree}`, { repoRoot, workRoot });
  const serverB = resolveServer('node', { repoRoot, workRoot });
  const manifest = loadManifest(repoRoot);
  const results = await runPairs({
    repoRoot,
    workRoot,
    cases,
    serverA,
    serverB,
    localeA: LOCALES[1],
    localeB: LOCALES[1],
    concurrency,
  });
  const rows = new Map();
  for (const result of results) {
    const row = rows.get(result.family) ?? { cases: 0, requests: 0, changedCases: 0, changedAnswers: 0 };
    row.cases += 1;
    row.requests += result.requests;
    if (result.differences.length > 0) row.changedCases += 1;
    row.changedAnswers += result.differences.filter((d) => d.where === 'answer').length;
    rows.set(result.family, row);
  }
  console.log('\nfamily          cases  requests  changed cases  changed answers  proven');
  let provenChanged = 0;
  for (const [family, row] of [...rows].sort()) {
    const proven = Boolean(manifest.families[family]?.proven);
    if (proven) provenChanged += row.changedAnswers;
    console.log(`${family.padEnd(15)} ${String(row.cases).padStart(5)} ${String(row.requests).padStart(9)} ${String(row.changedCases).padStart(14)} ${String(row.changedAnswers).padStart(16)}  ${proven ? 'yes' : 'no'}`);
  }
  const newlyProven = Number(values['newly-proven'] ?? 0);
  console.log(`\nchanged answers in proven families: ${provenChanged}; newly proven equal in the same days: ${newlyProven}`);
  if (provenChanged > newlyProven) {
    console.error('STOP: more answers changed in proven families than were newly proven; re-plan with the owner (docs/specs/2026-11-27-mcp-server-in-rust.md, Risks 2).');
    return 1;
  }
  return 0;
}


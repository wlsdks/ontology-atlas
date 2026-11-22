#!/usr/bin/env node
/**
 * `pnpm integration:<step>`: one integration branch carries parallel slices to `main` (`/integrate`).
 * `start` pushes `integration/<topic>-<date>` from `origin/main` in its own installed worktree;
 * `add` merges one slice with `--no-ff` and runs that slice's checks, locally; `pr` merges
 * `origin/main`, runs the repo-wide lanes once, pushes and opens one draft; `prune` deletes only
 * what `main`'s history contains.
 * Every step merges; none squashes, rebases or cherry-picks, so each slice commit reaches `main`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyPrune, githubPulls, headLanded, makeGit, parseWorktrees, prunePlan } from './bundle-branches.mjs';

export const PREFIX = 'integration/';
const BASE = 'origin/main';
const TOPIC = /^[a-z0-9][a-z0-9-]*$/;

/** The lanes the lead runs once on the merged tree, after `checks:changed` on every path it changed. */
export const REPO_WIDE_LANES = ['pnpm test:contracts', 'pnpm knip', 'pnpm typecheck'];

/** A fresh worktree has no `node_modules` and no generated message types; both come from the store. */
export const WORKTREE_SETUP = ['pnpm install --frozen-lockfile --offline', 'pnpm messages:build'];

export function integrationBranch(topic, now = new Date()) {
  if (!TOPIC.test(topic ?? '')) throw new Error('name the topic in lowercase words joined by hyphens, such as library-sources');
  const pad = (n) => String(n).padStart(2, '0');
  return `${PREFIX}${topic}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function mainCheckout(git) {
  return parseWorktrees(git.out('worktree', 'list', '--porcelain'))[0].path;
}

function currentIntegration(git) {
  const branch = git.out('branch', '--show-current');
  if (!branch.startsWith(PREFIX)) throw new Error(`run this in the integration worktree; ${branch || 'a detached HEAD'} is not an ${PREFIX} branch`);
  return branch;
}

function requireClean(git) {
  if (git.out('status', '--porcelain', '--untracked-files=no') !== '') {
    throw new Error('the integration worktree has uncommitted changes; commit or finish the merge first');
  }
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function shellQuote(text) {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** `checks:changed` over the paths that still exist, so a deleted file is not handed to a linter. */
function checksChangedCommand(cwd, paths, extra) {
  const present = paths.filter((path) => existsSync(resolve(cwd, path)));
  return present.length === 0 ? null : `pnpm checks:changed -- --run${extra} ${present.map(shellQuote).join(' ')}`;
}

/**
 * Creates the integration branch from `origin/main` in `.claude/worktrees/integration-<topic>`,
 * pushes it and installs the worktree so the first slice's checks can run there.
 */
export function start(git, topic, { now = new Date(), exec = run } = {}) {
  const branch = integrationBranch(topic, now);
  git.out('fetch', '--quiet', 'origin', 'main');
  const path = join(mainCheckout(git), '.claude', 'worktrees', `integration-${topic}`);
  git.out('worktree', 'add', '-q', '-b', branch, path, BASE);
  makeGit(path).out('push', '--quiet', '-u', 'origin', branch);
  for (const command of WORKTREE_SETUP) {
    if (exec(command, path) !== 0) throw new Error(`${command} failed in ${path}; run it there by hand before integration:add`);
  }
  return { branch, path };
}

/** The first-parent merge commit on HEAD whose second parent is `head`, or null. */
function mergeOf(git, head) {
  const merges = lines(git.out('rev-list', '--first-parent', '--merges', '--parents', 'HEAD'));
  return merges.map((line) => line.split(' ')).find((ids) => ids.length === 3 && ids[2] === head)?.[0] ?? null;
}

/**
 * Merges `branch` into the checked-out integration branch with `--no-ff`, so the slice keeps its own
 * commits behind one merge commit. A conflict stops with the merge in progress and its files listed.
 * Running `add` again for a merged slice, after a resolution or a fix commit, re-checks every path
 * changed since the merge's first parent.
 */
export function add(git, branch) {
  currentIntegration(git);
  const head = git.out('rev-parse', '--verify', `${branch}^{commit}`);
  if (git.try('merge-base', '--is-ancestor', head, 'HEAD').status !== 0) {
    requireClean(git);
    const merged = git.try('merge', '--no-ff', '--no-edit', head, '-m', `Merge branch '${branch}' into ${git.out('branch', '--show-current')}`);
    if (merged.status !== 0) {
      const conflicts = lines(git.out('diff', '--name-only', '--diff-filter=U'));
      if (conflicts.length > 0) return { state: 'conflict', head, conflicts };
      git.try('merge', '--abort');
      throw new Error(`git merge ${branch} failed and was aborted: ${merged.stderr || merged.stdout}`);
    }
  }
  const merge = mergeOf(git, head);
  if (!merge) return { state: 'already', head };
  const paths = lines(git.out('-c', 'core.quotePath=false', 'diff', '--name-only', `${merge}^1`, 'HEAD'));
  return { state: 'merged', head, merge, paths };
}

/**
 * The slices merged into `ref` and not into `exclude`, oldest first, from its first-parent merge
 * commits. A merge whose second parent `exclude` already holds is the `origin/main` merge: it
 * names no component but its conflicts are listed.
 */
export function components(git, ref, exclude) {
  const merges = lines(git.out('log', '--first-parent', '--merges', '--reverse', '--format=%H %P%x09%s', ref, `^${exclude}`));
  return merges.map((line) => {
    const [ids, subject = ''] = line.split('\t');
    const [merge, first, second] = ids.split(' ');
    const fromMain = git.try('merge-base', '--is-ancestor', second, exclude).status === 0;
    const named = /^Merge (?:branch|remote-tracking branch) '([^']+)'/.exec(subject)?.[1] ?? null;
    const trial = git.try('merge-tree', '--write-tree', '--name-only', '--no-messages', first, second);
    const conflicts = trial.status === 0 ? [] : lines(trial.stdout).slice(1);
    return { merge, head: second, branch: fromMain ? null : named, from: named ?? second.slice(0, 9), conflicts };
  });
}

export function prBody({ items, lanes, notes = '' }) {
  const conflicted = items.filter((item) => item.conflicts.length > 0);
  return [
    '## Summary',
    '',
    ...(notes.trim() ? [notes.trim(), ''] : []),
    '### Components',
    '',
    ...items.filter((item) => item.branch).map((item) => `- \`${item.branch}\` @ ${item.head.slice(0, 9)}, merged with \`--no-ff\` in ${item.merge.slice(0, 9)}`),
    '',
    '### Conflicts',
    '',
    ...(conflicted.length === 0
      ? ['None: every merge was clean.']
      : conflicted.flatMap((item) => item.conflicts.map((file) => `- \`${file}\`: conflicted when \`${item.from}\` merged; resolved in ${item.merge.slice(0, 9)}`))),
    '',
    '## Test plan',
    '',
    ...lanes.map((lane) => `- \`${lane}\` passed on the integration tree`),
    '',
  ].join('\n');
}

/** The integration branch and every component that `main`'s history contains, or why not yet. */
export function prunePlanFor(git, integration, { base = BASE, currentPath = mainCheckout(git) } = {}) {
  const local = git.try('rev-parse', '--verify', '--quiet', `refs/heads/${integration}`).status === 0;
  const ref = local ? `refs/heads/${integration}` : `refs/remotes/origin/${integration}`;
  if (git.try('rev-parse', '--verify', '--quiet', ref).status !== 0) throw new Error(`no branch ${integration} here or on origin`);
  const landed = headLanded(git, base, ref);
  if (landed.keep) return { refused: `${integration} is ${landed.keep}; run pnpm pr:land on its pull request first` };
  const exclude = landed.landedAt ? `${landed.landedAt}^1` : base;
  const names = components(git, ref, exclude).map((item) => item.branch).filter(Boolean);
  return { actions: prunePlan(git, base, [integration, ...new Set(names)], { currentPath }) };
}

function run(command, cwd) {
  return spawnSync(command, { cwd, shell: true, stdio: 'inherit' }).status ?? 1;
}

function argValue(args, name) {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

export function runIntegration(argv, { cwd = process.cwd(), io = console, exec = run, pulls = githubPulls } = {}) {
  const [step, ...args] = argv.filter((arg) => arg !== '--');
  const git = makeGit(cwd);
  if (step === 'start') {
    const { branch, path } = start(git, args[0]);
    io.log(`${branch} pushed from ${BASE}; its worktree is ${path}\nnext: one brief per slice with pnpm brief:new, then pnpm integration:add <branch> there as each returns`);
    return 0;
  }
  if (step === 'add') {
    if (!args[0]) throw new Error('usage: pnpm integration:add <slice branch>');
    const result = add(git, args[0]);
    if (result.state === 'already') {
      io.log(`${args[0]} @ ${result.head.slice(0, 9)} is already in this integration branch`);
      return 0;
    }
    if (result.state === 'conflict') {
      io.log(`conflict merging ${args[0]}; resolve each by intent (never --ours/--theirs wholesale), git add, git commit --no-edit, then run pnpm integration:add ${args[0]} again:`);
      for (const file of result.conflicts) io.log(`  ${file}`);
      return 1;
    }
    io.log(`merged ${args[0]} @ ${result.head.slice(0, 9)} with --no-ff in ${result.merge.slice(0, 9)}; running its slice checks`);
    const checks = checksChangedCommand(cwd, result.paths, ' --slice');
    if (checks && exec(checks, cwd) !== 0) {
      io.log(`slice checks failed on the merged tree; fix it here, commit, and run pnpm integration:add ${args[0]} again`);
      return 1;
    }
    io.log('kept local; pnpm integration:pr pushes once at the end');
    return 0;
  }
  if (step === 'pr') {
    const title = argValue(args, 'title');
    if (!title) throw new Error('usage: pnpm integration:pr -- --title="<type>: <what it does>" [--notes=<file>]');
    const branch = currentIntegration(git);
    requireClean(git);
    git.out('fetch', '--quiet', 'origin', 'main');
    if (git.try('merge-base', '--is-ancestor', BASE, 'HEAD').status !== 0) {
      const merged = git.try('merge', '--no-ff', '--no-edit', BASE);
      if (merged.status !== 0) {
        io.log(`conflict merging ${BASE}; resolve, git commit --no-edit, then run pnpm integration:pr again:`);
        for (const file of lines(git.out('diff', '--name-only', '--diff-filter=U'))) io.log(`  ${file}`);
        return 1;
      }
    }
    const changed = lines(git.out('-c', 'core.quotePath=false', 'diff', '--name-only', `${BASE}...HEAD`));
    const checks = checksChangedCommand(cwd, changed, '');
    for (const lane of checks ? [checks, ...REPO_WIDE_LANES] : REPO_WIDE_LANES) {
      io.log(`\n[integration] ${lane}`);
      if (exec(lane, cwd) !== 0) {
        io.log(`[integration] ${lane} failed; fix it on this branch, commit, and run pnpm integration:pr again`);
        return 1;
      }
    }
    git.out('push', '--quiet', 'origin', 'HEAD');
    const notesFile = argValue(args, 'notes');
    const body = prBody({ items: components(git, 'HEAD', BASE), lanes: ['pnpm checks:changed -- --run <every changed path>', ...REPO_WIDE_LANES], notes: notesFile ? readFileSync(notesFile, 'utf8') : '' });
    const dir = mkdtempSync(join(tmpdir(), 'integration-pr-'));
    try {
      const file = join(dir, 'body.md');
      writeFileSync(file, body);
      const open = JSON.parse(spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number'], { cwd, encoding: 'utf8' }).stdout || '[]');
      const command = open[0]
        ? `gh pr edit ${open[0].number} --title ${shellQuote(title)} --body-file ${shellQuote(file)}`
        : `gh pr create --draft --base main --head ${shellQuote(branch)} --title ${shellQuote(title)} --body-file ${shellQuote(file)}`;
      if (exec(command, cwd) !== 0) return 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    io.log(`next: pnpm pr:land <number>, the one CI run; then pnpm integration:prune -- ${branch} --apply`);
    return 0;
  }
  if (step === 'prune') {
    const integration = args.find((arg) => !arg.startsWith('--')) ?? currentIntegration(git);
    const apply = args.includes('--apply');
    const root = makeGit(mainCheckout(git));
    root.out('fetch', '--quiet', '--prune', 'origin');
    const plan = prunePlanFor(root, integration);
    if (plan.refused) {
      io.log(plan.refused);
      return 1;
    }
    applyPrune(root, plan.actions, { apply, base: BASE, io, pulls });
    const kept = plan.actions.filter((action) => action.keep);
    if (kept.length > 0) io.log(`\n${kept.length} branch(es) kept: main's history does not hold them as they are; report each, never delete by hand`);
    return kept.length > 0 ? 1 : 0;
  }
  throw new Error('usage: integration.mjs start <topic> | add <branch> | pr --title=<title> [--notes=<file>] | prune [<integration branch>] [--apply]');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runIntegration(process.argv.slice(2));
  } catch (error) {
    console.error(`[integration] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

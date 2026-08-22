// `ontology-atlas snapshot [vault] [--dry-run] [--push] [--message "..."] [--json]`
//
// Snapshots the vault as a git commit. Git is already the vault's source of truth,
// but a non-developer or desktop user has no version history or backup route, and
// even for a developer an ontology change buried in a code commit is invisible in
// the history. This command commits the vault scope alone with a **meaning-level
// commit message** (per-kind added/modified/deleted counts plus representative
// slugs), turning the git history into an ontology journal.
//
// Trust charter: the default is a local commit only (zero transmission). Only an
// explicit `--push` pushes to the user's existing remote and branch — with no
// upstream it never sets `-u` automatically, it explains instead. No login or
// token handling: the user's own git configuration is used as-is.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { resolveVaultRoot, VaultRootError } from '../lib/resolve-vault.mjs';
import {
  addPaths,
  buildChangeSummary,
  classifyGitError,
  commitPathspec,
  findGitRepoRoot,
  findStagedOutsideVault,
  formatSnapshotSummary,
  getCurrentBranch,
  getFullPorcelainStatus,
  getHeadHash,
  getPorcelainStatus,
  getRemoteUrl,
  getUpstreamRef,
  getVaultDiff,
  getVaultLog,
  pullCurrentBranch,
  pushCurrentBranch,
  vaultPathspec,
} from '../lib/git-snapshot.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseRawRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--dry-run', '--push', '--message', '--json', '--history', '--diff', '--pull'];
const STATUS_MARK = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' };
const STATUS_COLOR = { added: COLORS.green, modified: COLORS.yellow, deleted: COLORS.red, renamed: COLORS.blue };
const DEFAULT_HISTORY_LIMIT = 10;

export async function runSnapshot(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  let vaultRoot;
  try {
    vaultRoot = resolveVaultRoot(parsed.vault);
  } catch (err) {
    if (err instanceof VaultRootError) {
      process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const repoRoot = findGitRepoRoot(vaultRoot);
  if (!repoRoot) {
    return emitNotAGitRepo(parsed.json, vaultRoot);
  }

  const pathspec = vaultPathspec(repoRoot, vaultRoot);

  // Parity modes — each short-circuits the commit flow (read-only, or opt-in transmission).
  if (parsed.history !== null) {
    return emitHistory({ json: parsed.json, vaultRoot, repoRoot, pathspec, limit: parsed.history });
  }
  if (parsed.diff) {
    return emitDiff({ json: parsed.json, vaultRoot, repoRoot, pathspec });
  }
  if (parsed.pull) {
    return runPull({ json: parsed.json, vaultRoot, repoRoot });
  }

  const rows = getPorcelainStatus({ repoRoot, pathspec });
  if (rows === null) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  git status failed for ${vaultRoot}\n`);
    return 2;
  }

  if (rows.length === 0) {
    return emitNoChanges(parsed.json, vaultRoot);
  }

  const changes = buildChangeSummary(rows, { repoRoot, vaultRoot });
  const autoSummary = formatSnapshotSummary(changes);
  const subject = parsed.message || autoSummary;
  const fullMessage = buildCommitMessage({ subject, autoSummary, changes, hasCustomMessage: Boolean(parsed.message) });

  const fullStatusRows = getFullPorcelainStatus({ repoRoot }) ?? [];
  const stagedOutside = findStagedOutsideVault(fullStatusRows, pathspec);

  if (parsed.dryRun) {
    render({
      json: parsed.json,
      dryRun: true,
      vaultRoot,
      repoRoot,
      subject,
      autoSummary,
      message: fullMessage,
      changes,
      stagedOutside,
      committed: false,
    });
    return 0;
  }

  const untrackedPaths = rows.filter((r) => r.index === '?' && r.worktree === '?').map((r) => r.path);
  // Turns a commit throw (a pre-commit hook refusing, a gpg signing failure, a
  // merge or rebase in progress) into one line of cause plus the next action,
  // rather than a raw stack trace.
  try {
    addPaths({ repoRoot, paths: untrackedPaths });
    commitPathspec({ repoRoot, pathspec, message: fullMessage });
  } catch (err) {
    return emitGitError(err, { operation: 'commit', json: parsed.json, vaultRoot });
  }
  const commitHash = getHeadHash({ repoRoot });

  let push = null;
  let exitCode = 0;
  if (parsed.push) {
    const upstream = getUpstreamRef({ repoRoot });
    if (!upstream) {
      const branch = getCurrentBranch({ repoRoot });
      push = {
        pushed: false,
        reason: 'no-upstream',
        message: 'push 실패: 이 브랜치에 upstream 이 없어요. 커밋은 로컬에 기록됨.',
        guidance: `git push -u origin ${branch}`,
      };
      exitCode = 1;
    } else {
      // A push throw (remote ahead, auth failure, …) degrades gracefully too. The
      // commit is already local, so this explains and exits 1 with no stack trace.
      try {
        pushCurrentBranch({ repoRoot });
        const remoteName = upstream.split('/')[0];
        const remoteUrl = getRemoteUrl({ repoRoot, remoteName });
        push = { pushed: true, remoteUrl };
      } catch (err) {
        const info = classifyGitError(err, { operation: 'push' });
        push = { pushed: false, reason: info.reason, message: info.message, note: info.note, guidance: info.guidance };
        exitCode = 1;
      }
    }
  }

  render({
    json: parsed.json,
    dryRun: false,
    vaultRoot,
    repoRoot,
    subject,
    autoSummary,
    message: fullMessage,
    changes,
    stagedOutside,
    committed: true,
    commitHash,
    push,
  });

  return exitCode;
}

function buildCommitMessage({ subject, autoSummary, changes, hasCustomMessage }) {
  const bodyLines = [];
  if (hasCustomMessage) {
    bodyLines.push(autoSummary, '');
  }
  bodyLines.push(...changes.map((c) => `  ${STATUS_MARK[c.status] ?? '?'}  ${c.path}`));
  return `${subject}\n\n${bodyLines.join('\n')}`;
}

function emitNotAGitRepo(json, vaultRoot) {
  if (json) {
    process.stdout.write(
      JSON.stringify(
        { operation: 'snapshot', ok: false, reason: 'not-a-git-repo', vaultRoot, guidance: 'git init' },
        null,
        2,
      ) + '\n',
    );
    return 1;
  }
  process.stderr.write(
    `${COLORS.red}error${COLORS.reset}  ${vaultRoot} is not inside a git repository.\n` +
      `${COLORS.dim}  snapshot never runs 'git init' for you: run it yourself if you want version history here:${COLORS.reset}\n` +
      `  ${COLORS.cyan}git init${COLORS.reset}\n`,
  );
  return 1;
}

function emitNoChanges(json, vaultRoot) {
  if (json) {
    process.stdout.write(
      JSON.stringify({ operation: 'snapshot', ok: true, reason: 'no-changes', vaultRoot, committed: false }, null, 2) + '\n',
    );
    return 0;
  }
  process.stdout.write(`${COLORS.dim}스냅샷할 변경 없음${COLORS.reset} ${COLORS.dim}(vault=${vaultRoot})${COLORS.reset}\n`);
  return 0;
}

// Turns a git failure (commit throw, push throw) into one line of cause plus the
// next action instead of a raw stack trace. Written to stderr so the human-readable
// stdout is never polluted.
function emitGitError(err, { operation, json, vaultRoot }) {
  const info = classifyGitError(err, { operation });
  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          operation: 'snapshot',
          ok: false,
          reason: info.reason,
          vaultRoot,
          committed: false,
          note: info.note ?? null,
          guidance: info.guidance ?? null,
        },
        null,
        2,
      ) + '\n',
    );
    return 1;
  }
  let out = `${COLORS.red}error${COLORS.reset}  ${info.message}\n`;
  if (info.note) out += `${COLORS.dim}  ${info.note}${COLORS.reset}\n`;
  if (info.guidance) out += `  ${COLORS.cyan}${info.guidance}${COLORS.reset}\n`;
  process.stderr.write(out);
  return 1;
}

// `snapshot --history [N]` — the last N commits touching the vault path (Obsidian Git parity).
function emitHistory({ json, vaultRoot, repoRoot, pathspec, limit }) {
  const commits = getVaultLog({ repoRoot, pathspec, limit });
  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          operation: 'snapshot-history',
          ok: true,
          vaultRoot,
          repoRoot,
          limit,
          count: commits ? commits.length : 0,
          commits: commits ?? [],
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }
  if (commits === null || commits.length === 0) {
    process.stdout.write(`${COLORS.dim}아직 vault 범위 커밋이 없어요${COLORS.reset} ${COLORS.dim}(vault=${vaultRoot})${COLORS.reset}\n`);
    return 0;
  }
  process.stdout.write(
    `${COLORS.cyan}history${COLORS.reset}  ${COLORS.dim}vault=${vaultRoot} · 최근 ${commits.length}개${COLORS.reset}\n`,
  );
  for (const c of commits) {
    process.stdout.write(
      `  ${COLORS.bold}${c.shortHash}${COLORS.reset}  ${c.subject}  ${COLORS.dim}(${c.relativeTime})${COLORS.reset}\n`,
    );
  }
  return 0;
}

// `snapshot --diff` — preview of uncommitted changes in the vault scope (file list + diff).
function emitDiff({ json, vaultRoot, repoRoot, pathspec }) {
  const rows = getPorcelainStatus({ repoRoot, pathspec });
  if (rows === null) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  git status failed for ${vaultRoot}\n`);
    return 2;
  }
  const changes = buildChangeSummary(rows, { repoRoot, vaultRoot });
  const diffText = getVaultDiff({ repoRoot, pathspec }) ?? '';

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          operation: 'snapshot-diff',
          ok: true,
          vaultRoot,
          repoRoot,
          count: changes.length,
          files: changes.map((c) => ({ path: c.path, status: c.status, kind: c.kind, slug: c.slug, renamedFrom: c.renamedFrom })),
          diff: diffText,
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  if (changes.length === 0) {
    process.stdout.write(`${COLORS.dim}커밋 안 된 vault 변경 없음${COLORS.reset} ${COLORS.dim}(vault=${vaultRoot})${COLORS.reset}\n`);
    return 0;
  }

  process.stdout.write(`${COLORS.cyan}diff${COLORS.reset}  ${COLORS.dim}vault=${vaultRoot} · 커밋 안 된 변경 ${changes.length}개${COLORS.reset}\n`);
  for (const change of changes) {
    const mark = STATUS_MARK[change.status] ?? '?';
    const color = STATUS_COLOR[change.status] ?? COLORS.dim;
    const kindLabel = change.kind ? `${KIND_COLORS[change.kind] ?? COLORS.dim}${change.kind}${COLORS.reset} ` : '';
    const pathDisplay = change.renamedFrom ? `${change.renamedFrom} → ${change.path}` : change.path;
    process.stdout.write(`  ${color}${mark}${COLORS.reset}  ${kindLabel}${pathDisplay}\n`);
  }
  if (diffText.trim()) {
    process.stdout.write(`\n${diffText.replace(/\n$/, '')}\n`);
  } else {
    process.stdout.write(`\n${COLORS.dim}추적 파일의 텍스트 diff 없음 (신규 파일만): 위 목록 참고${COLORS.reset}\n`);
  }
  return 0;
}

// `snapshot --pull` — git pull from upstream (opt-in). Conflicts, non-fast-forward,
// and a missing remote are explained without a crash. Trust charter: transmission
// is always explicit opt-in.
function runPull({ json, vaultRoot, repoRoot }) {
  const upstream = getUpstreamRef({ repoRoot });
  if (!upstream) {
    const branch = getCurrentBranch({ repoRoot });
    if (json) {
      process.stdout.write(
        JSON.stringify(
          { operation: 'snapshot-pull', ok: false, reason: 'no-upstream', vaultRoot, guidance: `git push -u origin ${branch}` },
          null,
          2,
        ) + '\n',
      );
      return 1;
    }
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  이 브랜치에 연결된 원격이 없어요: 먼저 upstream 을 설정하세요.\n` +
        `  ${COLORS.cyan}git push -u origin ${branch}${COLORS.reset}\n`,
    );
    return 1;
  }

  let out;
  try {
    out = pullCurrentBranch({ repoRoot });
  } catch (err) {
    return emitGitError(err, { operation: 'pull', json, vaultRoot });
  }

  const summary = String(out ?? '').trim().split('\n').filter(Boolean).slice(-1)[0] || 'up to date';
  if (json) {
    process.stdout.write(
      JSON.stringify({ operation: 'snapshot-pull', ok: true, vaultRoot, upstream, summary }, null, 2) + '\n',
    );
    return 0;
  }
  process.stdout.write(
    `${COLORS.green}ok${COLORS.reset}    pull 완료 ${COLORS.dim}(${upstream})${COLORS.reset}\n  ${COLORS.dim}${summary}${COLORS.reset}\n`,
  );
  return 0;
}

function render({ json, dryRun, vaultRoot, repoRoot, subject, autoSummary, message, changes, stagedOutside, committed, commitHash, push }) {
  const added = changes.filter((c) => c.status === 'added').length;
  const modified = changes.filter((c) => c.status === 'modified').length;
  const removed = changes.filter((c) => c.status === 'deleted').length;

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          operation: 'snapshot',
          ok: true,
          dryRun,
          vaultRoot,
          repoRoot,
          subject,
          summary: autoSummary,
          message,
          counts: { added, modified, removed, total: changes.length },
          files: changes.map((c) => ({ path: c.path, status: c.status, kind: c.kind, slug: c.slug })),
          stagedOutsideVault: stagedOutside,
          committed,
          commitHash: commitHash ?? null,
          push,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const header = dryRun
    ? `${COLORS.cyan}dry-run${COLORS.reset}`
    : `${COLORS.green}ok${COLORS.reset}    committed ${COLORS.bold}${commitHash}${COLORS.reset}`;
  process.stdout.write(`${header}  ${COLORS.dim}vault=${vaultRoot}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.bold}${subject}${COLORS.reset}\n\n`);

  for (const change of changes) {
    const mark = STATUS_MARK[change.status] ?? '?';
    const color = STATUS_COLOR[change.status] ?? COLORS.dim;
    const kindLabel = change.kind ? `${KIND_COLORS[change.kind] ?? COLORS.dim}${change.kind}${COLORS.reset} ` : '';
    // A rename shows as "before → after", which reads far better in the history.
    const pathDisplay = change.renamedFrom ? `${change.renamedFrom} → ${change.path}` : change.path;
    process.stdout.write(`  ${color}${mark}${COLORS.reset}  ${kindLabel}${pathDisplay}\n`);
  }

  if (stagedOutside.length > 0) {
    process.stdout.write(
      `\n${COLORS.yellow}warn${COLORS.reset}  ${stagedOutside.length} file(s) staged outside the vault are left untouched (not committed here):\n`,
    );
    for (const path of stagedOutside) {
      process.stdout.write(`  ${COLORS.dim}${path}${COLORS.reset}\n`);
    }
  }

  if (dryRun) {
    process.stdout.write(`\n${COLORS.dim}no commit made: rerun without --dry-run to commit${COLORS.reset}\n`);
    return;
  }

  if (push) {
    if (push.pushed) {
      process.stdout.write(`\n${COLORS.green}ok${COLORS.reset}    원격으로 전송됨: ${COLORS.bold}${push.remoteUrl}${COLORS.reset}\n`);
    } else {
      // A transmission failure is guidance (an error), so it goes to stderr — never polluting the stdout commit summary.
      let out = `\n${COLORS.red}error${COLORS.reset}  ${push.message}\n`;
      if (push.note) out += `${COLORS.dim}  ${push.note}${COLORS.reset}\n`;
      if (push.guidance) out += `  ${COLORS.cyan}${push.guidance}${COLORS.reset}\n`;
      process.stderr.write(out);
    }
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, dryRun: false, push: false, message: null, history: null, diff: false, pull: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--push') flags.push = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--diff') flags.diff = true;
    else if (a === '--pull') flags.pull = true;
    else if (a === '--history') {
      // Optional integer argument: consumed when the next token is a positive integer, else the default.
      const next = args[i + 1];
      if (next !== undefined && /^[1-9]\d*$/.test(next)) {
        flags.history = parseBoundedPositiveIntegerFlag('--history', next, { max: 1000 });
        i += 1;
      } else {
        flags.history = DEFAULT_HISTORY_LIMIT;
      }
    } else if (a.startsWith('--history=')) {
      flags.history = parseBoundedPositiveIntegerFlag('--history', a.slice('--history='.length), { max: 1000 });
    } else if (a === '--message') flags.message = parseRawRequiredFlagValue('--message', args[++i]);
    else if (a.startsWith('--message=')) flags.message = parseRawRequiredFlagValue('--message', a.slice('--message='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  // The parity modes (history/diff/pull) are mutually exclusive — combining them only confuses.
  const modeCount = (flags.history !== null ? 1 : 0) + (flags.diff ? 1 : 0) + (flags.pull ? 1 : 0);
  if (modeCount > 1) {
    return { error: 'pass only one of --history / --diff / --pull at a time' };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    dryRun: flags.dryRun,
    push: flags.push,
    message: flags.message,
    history: flags.history,
    diff: flags.diff,
    pull: flags.pull,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas snapshot [vault] [--dry-run] [--push] [--message "..."] [--json]\n` +
      `  ontology-atlas snapshot [vault] --history [N] [--json]\n` +
      `  ontology-atlas snapshot [vault] --diff [--json]\n` +
      `  ontology-atlas snapshot [vault] --pull [--json]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Commits vault-scoped changes only (never files outside the vault), with a\n` +
      `  semantic commit message summarizing kind-level add/update/rename/remove counts\n` +
      `  and up to 3 representative slugs, e.g.:\n` +
      `    ontology snapshot: +2 concepts, ~3 updated (capabilities/foo, elements/bar, +1)\n\n` +
      `  Exits 0 with no output change when there is nothing to snapshot. Never runs\n` +
      `  'git init' for you: if the vault is outside a git repo it exits 1 with that\n` +
      `  suggestion. Files already staged outside the vault are left untouched (git's\n` +
      `  pathspec-scoped partial commit never touches them). A rejected commit (hook /\n` +
      `  gpg / merge in progress) or a rejected push (remote ahead) prints a one-line\n` +
      `  cause + next action to stderr instead of a raw stack trace.\n\n` +
      `${COLORS.bold}Flags:${COLORS.reset}\n` +
      `  ${COLORS.bold}--dry-run${COLORS.reset}   preview the summary + file list, no commit\n` +
      `  ${COLORS.bold}--push${COLORS.reset}      after committing, push to the current branch's existing\n` +
      `              upstream. Never configures one: no upstream prints setup guidance\n` +
      `              and exits 1 (the commit itself still lands). Prints the remote URL\n` +
      `              on success (trust charter: transport is opt-in and explicit).\n` +
      `  ${COLORS.bold}--message "..."${COLORS.reset} use this as the commit subject instead of the auto\n` +
      `              summary; the auto summary moves into the commit body instead.\n` +
      `  ${COLORS.bold}--history [N]${COLORS.reset} list the last N (default ${DEFAULT_HISTORY_LIMIT}) commits touching the vault —\n` +
      `              short hash + subject + relative time. Read-only.\n` +
      `  ${COLORS.bold}--diff${COLORS.reset}      preview uncommitted vault-scoped changes (file list + diff),\n` +
      `              nothing is written. Read-only.\n` +
      `  ${COLORS.bold}--pull${COLORS.reset}      opt-in: pull the current branch from its upstream, handling\n` +
      `              conflicts / non-fast-forward / no-remote gracefully (no crash).\n` +
      `  ${COLORS.bold}--json${COLORS.reset}      machine-readable output for any of the modes above\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas snapshot docs/ontology --dry-run\n` +
      `  ontology-atlas snapshot docs/ontology --history 20\n` +
      `  ontology-atlas snapshot docs/ontology --diff\n` +
      `  ontology-atlas snapshot docs/ontology --push\n`,
  );
}

// `ontology-atlas snapshot [vault] [--dry-run] [--push] [--message "..."] [--json]`
//
// Atlas Git 슬라이스 1 (50번째 CLI 명령) — vault 를 git 커밋으로 스냅샷한다.
// git 이 이미 vault 의 진실원이지만 비개발자/데스크톱 사용자에게는 버전
// 기록/백업 수단이 없고, 개발자에게도 온톨로지 변경이 코드 커밋에 섞여
// 히스토리에서 안 보인다. 이 명령은 vault 범위만 골라 **의미 단위 커밋
// 메시지**(kind별 추가/수정/삭제 카운트 + 대표 슬러그)로 커밋해 git
// 히스토리를 온톨로지 저널로 만든다.
//
// 신뢰 헌장: 기본값 = 로컬 커밋만 (전송 0). `--push` 를 명시할 때만 사용자의
// 기존 원격/브랜치로 push — upstream 이 없으면 자동으로 `-u` 를 설정하지
// 않고 안내만 한다. 로그인/토큰 취급 0 — 사용자 git 설정을 그대로 쓴다.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { resolveVaultRoot, VaultRootError } from '../lib/resolve-vault.mjs';
import {
  addPaths,
  buildChangeSummary,
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
  pushCurrentBranch,
  vaultPathspec,
} from '../lib/git-snapshot.mjs';
import {
  formatUnknownFlagError,
  parseRawRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const ALLOWED_FLAGS = ['--vault', '--dry-run', '--push', '--message', '--json'];
const STATUS_MARK = { added: 'A', modified: 'M', deleted: 'D' };
const STATUS_COLOR = { added: COLORS.green, modified: COLORS.yellow, deleted: COLORS.red };

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
  addPaths({ repoRoot, paths: untrackedPaths });
  commitPathspec({ repoRoot, pathspec, message: fullMessage });
  const commitHash = getHeadHash({ repoRoot });

  let push = null;
  let exitCode = 0;
  if (parsed.push) {
    const upstream = getUpstreamRef({ repoRoot });
    if (!upstream) {
      const branch = getCurrentBranch({ repoRoot });
      push = { pushed: false, reason: 'no-upstream', guidance: `git push -u origin ${branch}` };
      exitCode = 1;
    } else {
      pushCurrentBranch({ repoRoot });
      const remoteName = upstream.split('/')[0];
      const remoteUrl = getRemoteUrl({ repoRoot, remoteName });
      push = { pushed: true, remoteUrl };
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
      `${COLORS.dim}  snapshot never runs 'git init' for you — run it yourself if you want version history here:${COLORS.reset}\n` +
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
    process.stdout.write(`  ${color}${mark}${COLORS.reset}  ${kindLabel}${change.path}\n`);
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
    process.stdout.write(`\n${COLORS.dim}no commit made — rerun without --dry-run to commit${COLORS.reset}\n`);
    return;
  }

  if (push) {
    if (push.pushed) {
      process.stdout.write(`\n${COLORS.green}ok${COLORS.reset}    원격으로 전송됨: ${COLORS.bold}${push.remoteUrl}${COLORS.reset}\n`);
    } else {
      process.stdout.write(
        `\n${COLORS.red}error${COLORS.reset}  push failed — no upstream configured for this branch.\n` +
          `${COLORS.dim}  commit landed locally. set an upstream, then push:${COLORS.reset}\n` +
          `  ${COLORS.cyan}${push.guidance}${COLORS.reset}\n`,
      );
    }
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, dryRun: false, push: false, message: null };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--push') flags.push = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--message') flags.message = parseRawRequiredFlagValue('--message', args[++i]);
    else if (a.startsWith('--message=')) flags.message = parseRawRequiredFlagValue('--message', a.slice('--message='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return {
    vault: vaultResult.vault,
    json: flags.json,
    dryRun: flags.dryRun,
    push: flags.push,
    message: flags.message,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas snapshot [vault] [--dry-run] [--push] [--message "..."] [--json]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Commits vault-scoped changes only (never files outside the vault), with a\n` +
      `  semantic commit message summarizing kind-level add/update/remove counts and\n` +
      `  up to 3 representative slugs, e.g.:\n` +
      `    ontology snapshot: +2 concepts, ~3 updated (capabilities/foo, elements/bar, +1)\n\n` +
      `  Exits 0 with no output change when there is nothing to snapshot. Never runs\n` +
      `  'git init' for you — if the vault is outside a git repo it exits 1 with that\n` +
      `  suggestion. Files already staged outside the vault are left untouched (git's\n` +
      `  pathspec-scoped partial commit never touches them).\n\n` +
      `${COLORS.bold}Flags:${COLORS.reset}\n` +
      `  ${COLORS.bold}--dry-run${COLORS.reset}   preview the summary + file list, no commit\n` +
      `  ${COLORS.bold}--push${COLORS.reset}      after committing, push to the current branch's existing\n` +
      `              upstream. Never configures one — no upstream prints setup guidance\n` +
      `              and exits 1 (the commit itself still lands). Prints the remote URL\n` +
      `              on success (trust charter: transport is opt-in and explicit).\n` +
      `  ${COLORS.bold}--message "..."${COLORS.reset} use this as the commit subject instead of the auto\n` +
      `              summary; the auto summary moves into the commit body instead.\n` +
      `  ${COLORS.bold}--json${COLORS.reset}      machine-readable summary/counts/files/push result\n\n` +
      `${COLORS.bold}Example:${COLORS.reset}\n` +
      `  ontology-atlas snapshot docs/ontology --dry-run\n` +
      `  ontology-atlas snapshot docs/ontology --push\n`,
  );
}

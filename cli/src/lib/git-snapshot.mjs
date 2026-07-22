// `ontology-atlas snapshot` 의 순수 git/frontmatter 로직 — 커맨드 파일
// (`cli/src/commands/snapshot.mjs`) 은 이 모듈의 얇은 CLI wrapper다.
//
// 신뢰 헌장: 기본값은 로컬 커밋만(전송 0). git 명령은 모두 injectable `run`
// 을 받아 실제 git 프로세스 없이도 단위 test 가능 — `git-staged.mjs` 와 같은
// 패턴. vault 자체 test 는 실제 임시 git repo fixture 로 실행해 partial-commit
// pathspec 동작(다른 staged 파일 보호)을 직접 검증한다.
//
// 안전 설계 — "vault 밖 파일은 절대 add 하지 않는다 / 기존 staged 오염 금지":
// `git commit -m <msg> -- <pathspec>` (git 의 "partial commit" 형태) 는 이미
// tracked 인 파일의 working-tree 변경/삭제를 index 전체를 건드리지 않고 그
// pathspec 범위만 커밋한다 — vault 밖에 이미 staged 된 변경은 그대로 staged
// 로 남고 이번 커밋에 섞이지 않는다. 단, "아직 git 이 모르는" untracked 신규
// 파일은 pathspec commit 만으로 포함되지 않으므로, vault 범위의 untracked
// 파일만 먼저 `git add` 한다 (vault 밖 파일은 손대지 않음).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseFrontmatter } from './parse-frontmatter.mjs';

// stdio 를 명시적으로 전부 pipe — 예상된 실패 경로(git repo 밖에서
// `rev-parse` / upstream 없는 브랜치에서 `@{u}` 조회 등)의 git stderr 가
// 우리 자체 에러 메시지 위에 겹쳐 사용자 터미널을 어지럽히지 않게 한다.
function defaultRun(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** vault 를 담은 git repo 의 최상위 경로. git repo 밖이면 null. */
export function findGitRepoRoot(vaultRoot, { run = defaultRun } = {}) {
  try {
    const out = run(['rev-parse', '--show-toplevel'], vaultRoot);
    if (typeof out !== 'string') return null;
    const trimmed = out.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** repoRoot 기준 vault 의 pathspec — vault 가 repo root 자체면 '.'. */
export function vaultPathspec(repoRoot, vaultRoot) {
  const rel = relative(repoRoot, vaultRoot).replace(/\\/g, '/');
  return rel === '' ? '.' : rel;
}

/**
 * `git status --porcelain -- <pathspec>` 결과를 파싱한 행 배열.
 * git 명령 실패 시 `null` (repo 아님/기타 오류 — 호출자가 판단).
 *
 * @returns {{ index: string, worktree: string, path: string, renamedFrom: string|null }[] | null}
 */
export function getPorcelainStatus({ repoRoot, pathspec, run = defaultRun }) {
  let out;
  try {
    out = run(['status', '--porcelain', '--untracked-files=all', '--', pathspec], repoRoot);
  } catch {
    return null;
  }
  if (typeof out !== 'string') return null;
  return parsePorcelain(out);
}

/** pathspec 없는 전체 repo `git status --porcelain` — staged-outside-vault 가드용. */
export function getFullPorcelainStatus({ repoRoot, run = defaultRun }) {
  let out;
  try {
    out = run(['status', '--porcelain', '--untracked-files=all'], repoRoot);
  } catch {
    return null;
  }
  if (typeof out !== 'string') return null;
  return parsePorcelain(out);
}

function parsePorcelain(out) {
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const index = line[0] ?? ' ';
      const worktree = line[1] ?? ' ';
      let rest = line.slice(3);
      let renamedFrom = null;
      const arrow = rest.indexOf(' -> ');
      if (arrow !== -1) {
        renamedFrom = rest.slice(0, arrow);
        rest = rest.slice(arrow + 4);
      }
      return { index, worktree, path: rest, renamedFrom };
    });
}

/** porcelain 행 하나를 'added' | 'modified' | 'deleted' 로 분류. */
export function classifyChange(row) {
  if (row.index === 'D' || row.worktree === 'D') return 'deleted';
  if ((row.index === '?' && row.worktree === '?') || row.index === 'A') return 'added';
  return 'modified';
}

/**
 * porcelain 행을 frontmatter 기반 의미 정보로 확장.
 * `.md` 이고 삭제되지 않은 파일만 frontmatter 를 읽는다 (삭제된 파일은
 * 디스크에 없고, 비-md 파일은 애초에 frontmatter 가 없다).
 */
export function buildChangeSummary(rows, { repoRoot, vaultRoot }) {
  return rows.map((row) => {
    const absPath = resolve(repoRoot, row.path);
    const status = classifyChange(row);
    let kind = null;
    let slug = relative(vaultRoot, absPath).replace(/\\/g, '/').replace(/\.md$/, '');
    if (row.path.endsWith('.md') && status !== 'deleted') {
      try {
        const raw = readFileSync(absPath, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);
        if (frontmatter && typeof frontmatter.kind === 'string' && frontmatter.kind) {
          kind = frontmatter.kind;
        }
        if (frontmatter && typeof frontmatter.slug === 'string' && frontmatter.slug) {
          slug = frontmatter.slug;
        }
      } catch {
        // 읽기 실패 — kind 없이 경로 기반 slug 로 진행 (커밋 자체는 막지 않음).
      }
    }
    return { path: row.path, absPath, status, kind, slug };
  });
}

/**
 * 의미 단위 커밋 요약 한 줄 — kind별 추가/수정/삭제 카운트 + 대표 슬러그
 * 최대 3개. 예: `ontology snapshot: +2 concepts, ~3 updated (capabilities/foo, elements/bar, +1)`
 */
export function formatSnapshotSummary(changes) {
  const added = changes.filter((c) => c.status === 'added').length;
  const modified = changes.filter((c) => c.status === 'modified').length;
  const removed = changes.filter((c) => c.status === 'deleted').length;

  const parts = [];
  if (added > 0) parts.push(`+${added} concept${added === 1 ? '' : 's'}`);
  if (modified > 0) parts.push(`~${modified} updated`);
  if (removed > 0) parts.push(`-${removed} removed`);

  const headline = parts.length > 0 ? `ontology snapshot: ${parts.join(', ')}` : 'ontology snapshot: no concept changes';

  const slugs = changes.map((c) => c.slug);
  const shown = slugs.slice(0, 3);
  const overflow = slugs.length - shown.length;
  const slugText = shown.length > 0 ? ` (${shown.join(', ')}${overflow > 0 ? `, +${overflow}` : ''})` : '';

  return `${headline}${slugText}`;
}

/** vault pathspec 밖에서 이미 staged 된 경로 목록 — 보호 경고용. */
export function findStagedOutsideVault(fullStatusRows, pathspec) {
  return fullStatusRows
    .filter((row) => {
      const isStaged = row.index !== ' ' && row.index !== '?';
      if (!isStaged) return false;
      return !isUnderPathspec(row.path, pathspec);
    })
    .map((row) => row.path);
}

function isUnderPathspec(path, pathspec) {
  if (pathspec === '.') return true;
  return path === pathspec || path.startsWith(`${pathspec}/`);
}

/** vault 범위의 untracked 파일만 골라 add — vault 밖 파일은 절대 건드리지 않는다. */
export function addPaths({ repoRoot, paths, run = defaultRun }) {
  if (!paths || paths.length === 0) return;
  run(['add', '--', ...paths], repoRoot);
}

/**
 * pathspec-scoped partial commit — vault 밖에 이미 staged 된 변경을 건드리지
 * 않고 vault 범위만 커밋한다 (모듈 상단 주석 참고).
 */
export function commitPathspec({ repoRoot, pathspec, message, run = defaultRun }) {
  run(['commit', '-m', message, '--', pathspec], repoRoot);
}

export function getHeadHash({ repoRoot, run = defaultRun }) {
  return run(['rev-parse', 'HEAD'], repoRoot).trim();
}

export function getCurrentBranch({ repoRoot, run = defaultRun }) {
  return run(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot).trim();
}

/** 현재 브랜치의 upstream ref (예: `origin/main`) — 없으면 null. */
export function getUpstreamRef({ repoRoot, run = defaultRun }) {
  try {
    const out = run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoRoot);
    const trimmed = typeof out === 'string' ? out.trim() : '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** upstream 이 이미 설정된 브랜치로만 push — 자동 `-u` 설정 금지 (신뢰 헌장). */
export function pushCurrentBranch({ repoRoot, run = defaultRun }) {
  run(['push'], repoRoot);
}

export function getRemoteUrl({ repoRoot, remoteName, run = defaultRun }) {
  return run(['remote', 'get-url', remoteName], repoRoot).trim();
}

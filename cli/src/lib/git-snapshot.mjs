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

/** porcelain 행 하나를 'added' | 'modified' | 'deleted' | 'renamed' 로 분류. */
export function classifyChange(row) {
  if (row.index === 'D' || row.worktree === 'D') return 'deleted';
  if (row.index === 'R') return 'renamed';
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
    // LOW-5: rename 은 이전 경로를 보존해 히스토리에서 "renamed A → B" 로 읽히게 한다.
    const renamedFrom = status === 'renamed' && row.renamedFrom ? row.renamedFrom : null;
    return { path: row.path, absPath, status, kind, slug, renamedFrom };
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
  const renamed = changes.filter((c) => c.status === 'renamed').length;

  const parts = [];
  if (added > 0) parts.push(`+${added} concept${added === 1 ? '' : 's'}`);
  if (modified > 0) parts.push(`~${modified} updated`);
  if (renamed > 0) parts.push(`→${renamed} renamed`);
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

// ── 우아한 실패 (HIGH-1) ──────────────────────────────────────────────────
// commitPathspec / pushCurrentBranch / pullCurrentBranch 는 execFileSync 의
// throw 를 그대로 전파한다. 커맨드 래퍼는 그 에러를 `classifyGitError` 로
// 넘겨 raw 스택트레이스 크래시 대신 "한 줄 원인 + 다음 행동" 으로 바꾼다.
// 순수 함수 — I/O 없음, stderr 는 래퍼가 쓴다.

/** execFileSync 에러의 stderr/stdout/message 를 하나의 문자열로 합친다. */
function gitErrorText(err) {
  if (!err) return '';
  const parts = [];
  for (const key of ['stderr', 'stdout']) {
    const v = err[key];
    if (typeof v === 'string') parts.push(v);
    else if (v && typeof v.toString === 'function') parts.push(v.toString('utf-8'));
  }
  if (typeof err.message === 'string') parts.push(err.message);
  return parts.join('\n');
}

/**
 * git 실패 에러를 사용자가 이해할 한 줄 + 다음 행동으로 분류.
 * @param {Error} err execFileSync 가 던진 에러
 * @param {{ operation?: 'commit'|'push'|'pull'|'git' }} opts
 * @returns {{ reason: string, message: string, note: string|null, guidance: string|null }}
 */
export function classifyGitError(err, { operation = 'git' } = {}) {
  const raw = gitErrorText(err);
  const text = raw.toLowerCase();
  const firstLine = raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || null;

  // push: 원격이 앞섬 (non-fast-forward). 커밋은 이미 로컬에 있으므로 안내만.
  if (
    text.includes('non-fast-forward') ||
    text.includes('updates were rejected') ||
    (text.includes('[rejected]') && text.includes('fetch first'))
  ) {
    return {
      reason: 'push-non-fast-forward',
      message: '원격이 앞섰어요 — `git pull` 후 다시 스냅샷하세요.',
      note: '커밋은 이미 로컬에 기록됨',
      guidance: 'git pull',
    };
  }

  // gpg 서명 실패
  if (
    text.includes('gpg failed to sign') ||
    text.includes('signing failed') ||
    (text.includes('gpg') && text.includes('sign'))
  ) {
    return {
      reason: 'gpg-sign-failed',
      message: '커밋 서명(gpg)에 실패했어요 — 서명 키를 확인하세요.',
      note: firstLine,
      guidance: 'git config commit.gpgsign false   # 서명을 끄고 다시 스냅샷',
    };
  }

  // merge / rebase 진행 중 — pathspec 부분 커밋 불가
  if (
    text.includes('cannot do a partial commit during a merge') ||
    text.includes('cannot do a partial commit during a rebase') ||
    text.includes('cannot do a partial commit')
  ) {
    return {
      reason: 'merge-in-progress',
      message: '머지/리베이스가 진행 중이라 vault 범위만 커밋할 수 없어요 — 진행 중인 작업을 먼저 마치거나 중단하세요.',
      note: null,
      guidance: 'git status   # 진행 중 상태 확인',
    };
  }

  // pull: 충돌
  if (text.includes('conflict') || text.includes('automatic merge failed')) {
    return {
      reason: 'pull-conflict',
      message: 'pull 중 충돌이 났어요 — 충돌 파일을 해결한 뒤 커밋하세요.',
      note: null,
      guidance: 'git status   # 충돌 파일 확인',
    };
  }

  // 커밋 안 된 로컬 변경이 pull 로 덮어써질 위험
  if (text.includes('would be overwritten') || text.includes('overwritten by merge')) {
    return {
      reason: 'local-changes',
      message: '커밋 안 된 로컬 변경이 있어 막혔어요 — 먼저 snapshot 으로 커밋하거나 stash 하세요.',
      note: null,
      guidance: 'ontology-atlas snapshot   # 로컬 변경을 먼저 커밋',
    };
  }

  // pull: 원격/추적 정보 없음
  if (
    text.includes('no tracking information') ||
    text.includes("couldn't find remote ref") ||
    text.includes('no such remote')
  ) {
    return {
      reason: 'no-upstream',
      message: '이 브랜치에 연결된 원격이 없어요 — 먼저 upstream 을 설정하세요.',
      note: null,
      guidance: 'git push -u origin <branch>',
    };
  }

  // pre-commit / commit-msg 훅 거부 (훅이 "hook"/"pre-commit" 을 남긴 경우)
  if (text.includes('pre-commit') || text.includes('commit-msg') || text.includes('hook')) {
    return {
      reason: 'pre-commit-hook',
      message: '커밋 훅이 스냅샷을 거부했어요 — 훅이 보고한 문제를 고친 뒤 다시 스냅샷하세요.',
      note: firstLine,
      guidance: null,
    };
  }

  // 미분류 — raw 스택트레이스 대신 operation 별 깔끔한 fallback + git 첫 줄.
  if (operation === 'commit') {
    return {
      reason: 'commit-rejected',
      message: '커밋이 거부됐어요 (커밋 훅이 막았을 수 있어요).',
      note: firstLine,
      guidance: null,
    };
  }
  return {
    reason: 'git-command-failed',
    message: `git ${operation} 명령이 실패했어요.`,
    note: firstLine,
    guidance: null,
  };
}

// ── 옵시디언 Git 패리티 (읽기 전용 + opt-in 전송) ─────────────────────────
const LOG_FIELD_SEP = '\x1f';

/**
 * vault pathspec 에 닿은 최근 커밋 N개 (git log -- <pathspec>).
 * 커밋이 하나도 없거나 repo 오류면 null (호출자가 "히스토리 없음" 안내).
 * @returns {{ shortHash: string, hash: string, subject: string, relativeTime: string, isoTime: string }[] | null}
 */
export function getVaultLog({ repoRoot, pathspec, limit = 10, run = defaultRun }) {
  let out;
  try {
    out = run(
      [
        'log',
        `--max-count=${limit}`,
        `--pretty=format:%h${LOG_FIELD_SEP}%H${LOG_FIELD_SEP}%s${LOG_FIELD_SEP}%cr${LOG_FIELD_SEP}%cI`,
        '--',
        pathspec,
      ],
      repoRoot,
    );
  } catch {
    return null; // 아직 커밋 없음 / repo 아님
  }
  if (typeof out !== 'string') return null;
  const trimmed = out.trim();
  if (!trimmed) return [];
  return trimmed
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [shortHash, hash, subject, relativeTime, isoTime] = line.split(LOG_FIELD_SEP);
      return { shortHash, hash, subject, relativeTime, isoTime };
    });
}

/**
 * 아직 커밋 안 된 vault 범위 변경의 diff (git diff HEAD -- <pathspec>).
 * HEAD 가 없으면 (커밋 0개) 인덱스 기준으로 폴백. 실패 시 null.
 * (untracked 신규 파일은 diff 에 안 잡히므로 파일 목록으로 별도 표시한다.)
 */
export function getVaultDiff({ repoRoot, pathspec, run = defaultRun }) {
  try {
    return run(['diff', 'HEAD', '--', pathspec], repoRoot);
  } catch {
    try {
      return run(['diff', '--', pathspec], repoRoot);
    } catch {
      return null;
    }
  }
}

/**
 * 현재 브랜치를 upstream 에서 pull (opt-in). 충돌/비-fast-forward/원격 없음은
 * throw 로 전파 → 래퍼가 `classifyGitError` 로 우아하게 변환한다.
 */
export function pullCurrentBranch({ repoRoot, run = defaultRun }) {
  return run(['pull'], repoRoot);
}

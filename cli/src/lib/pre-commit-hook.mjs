// R+ — `ontology-atlas agent-setup --install-pre-commit-hook` 의 순수 콘텐츠
// 빌더. 실제 fs/child_process I/O 는 호출자(agent-setup.mjs)가 맡고, 이
// 모듈은 "기존 hook 파일 내용이 주어졌을 때 다음 내용은 무엇인가"만 결정해
// 단위 test 가능하게 유지한다.
//
// 설계 원칙 (spec — "기존 hook 있으면 append, --no-verify 우회 존중"):
//   - 파일이 없으면 새로 만든다 (shebang + managed block).
//   - 파일이 있고 우리 managed block 이 이미 있으면 그대로 둔다 (idempotent).
//   - 파일이 있고 managed block 이 없으면 끝에 append — 기존 hook 로직을
//     덮어쓰지 않는다.
//   - hook 본문은 `ontology-atlas preflight --staged` 를 실행할 뿐, exit
//     code 로 커밋을 막지 않는다 (preflight 자체가 항상 정보 제공용
//     exit 0). `git commit --no-verify` 는 git 이 hook 전체를 건너뛰는
//     표준 동작이라 이 hook 이 따로 처리할 필요가 없다 — "우회 존중"은
//     hook 이 아무 것도 강제하지 않는 것으로 충분하다.

export const PRE_COMMIT_MARKER_START =
  '# >>> ontology-atlas preflight (managed block: safe to remove) >>>';
export const PRE_COMMIT_MARKER_END =
  '# <<< ontology-atlas preflight (managed block: safe to remove) <<<';

const HOOK_BLOCK = [
  PRE_COMMIT_MARKER_START,
  '# Shows which vault nodes this commit touches: informational only, never',
  '# blocks the commit. `git commit --no-verify` skips this like any other hook.',
  'if command -v ontology-atlas >/dev/null 2>&1; then',
  '  ontology-atlas preflight --staged',
  'elif [ -x "./node_modules/.bin/ontology-atlas" ]; then',
  '  ./node_modules/.bin/ontology-atlas preflight --staged',
  'else',
  '  npx --no-install ontology-atlas preflight --staged 2>/dev/null || true',
  'fi',
  PRE_COMMIT_MARKER_END,
  '',
].join('\n');

export function hasManagedPreCommitBlock(content) {
  return typeof content === 'string' && content.includes(PRE_COMMIT_MARKER_START);
}

/**
 * @param {string|null|undefined} existingContent  current hook file content, or nullish if absent
 * @returns {{ content: string, action: 'created' | 'appended' | 'already-installed' }}
 */
export function buildPreCommitHookContent(existingContent) {
  if (typeof existingContent !== 'string' || existingContent.length === 0) {
    return { content: `#!/bin/sh\n${HOOK_BLOCK}`, action: 'created' };
  }
  if (hasManagedPreCommitBlock(existingContent)) {
    return { content: existingContent, action: 'already-installed' };
  }
  const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${existingContent}${separator}${HOOK_BLOCK}`, action: 'appended' };
}

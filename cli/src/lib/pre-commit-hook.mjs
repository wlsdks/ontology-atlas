// Pure content builder for `ontology-atlas agent-setup --install-pre-commit-hook`.
// The caller (agent-setup.mjs) owns the fs and child_process I/O; this module only
// decides "given the current hook file, what should it contain next", which keeps
// it unit-testable.
//
// Design rules — append to an existing hook, and respect a `--no-verify` bypass:
//   - no file: create one (shebang + managed block).
//   - file with our managed block already present: leave it alone (idempotent).
//   - file without our managed block: append at the end, never overwriting the
//     existing hook logic.
//   - the hook body only runs `ontology-atlas preflight --staged`; it never blocks
//     the commit through an exit code (preflight is always informational, exit 0).
//     `git commit --no-verify` is git skipping hooks entirely, so this hook needs
//     no handling for it — respecting the bypass is satisfied by the hook enforcing
//     nothing.

export const PRE_COMMIT_MARKER_START =
  '# >>> ontology-atlas preflight (managed block: safe to remove) >>>';
const PRE_COMMIT_MARKER_END =
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

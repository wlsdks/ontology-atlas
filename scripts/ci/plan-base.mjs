/**
 * Which commit a CI run compares with. Both rules decide from text a workflow event supplies, so a
 * value that is not plainly a commit or a branch name is refused and the run stays exhaustive.
 */

/** The exact previous tip of a push, or `null` when GitHub gave none usable (absent, malformed, or the all-zero id of a new branch). */
export function usablePushBefore(before) {
  return /^[a-f0-9]{40}$/.test(before ?? '') && !/^0+$/.test(before) ? before : null;
}

/** An explicit, plain branch name a manual run may compare with, or `null` for anything else. */
export function comparableBranch(compareTo) {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(compareTo) && !compareTo.includes('..') ? compareTo : null;
}

export type SaveFailureMessageKey = 'saveConflict' | 'saveIdentityUid' | 'saveIdentityHistory';

/**
 * The message a rejected save has its own words for, by the error's name, or null when the generic
 * failure sentence applies. Matched by name because the errors cross a module boundary.
 */
export function saveFailureMessageKey(error: unknown): SaveFailureMessageKey | null {
  const name = error instanceof Error ? error.name : '';
  if (name === 'VaultConflictError') return 'saveConflict';
  if (name === 'VaultIdentityUidError') return 'saveIdentityUid';
  if (name === 'VaultIdentityHistoryError') return 'saveIdentityHistory';
  return null;
}

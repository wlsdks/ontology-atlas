/**
 * The "seen up to here" timestamp, one slot per vault. The key derivation is a pure function so
 * tests lock it by behaviour; a source scan for the scoping name cannot prove the wiring exists.
 */
const READ_AT_KEY_PREFIX = 'atlas.agentActivity.readAt:';

/**
 * The global key from before vaults were scoped. **It is never read back** — there is no way to know
 * which vault that timestamp was stamped in, and reading it back is precisely the defect above. It is
 * cleared once.
 */
export const LEGACY_UNSCOPED_READ_AT_KEY = 'atlas.agentActivity.readAt';

export function readAtStorageKey(vaultScope: string): string {
  return `${READ_AT_KEY_PREFIX}${vaultScope}`;
}

export function readReadAt(vaultScope: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const parsed = Number.parseInt(
      window.localStorage.getItem(readAtStorageKey(vaultScope)) ?? '',
      10,
    );
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function writeReadAt(vaultScope: string, at: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(readAtStorageKey(vaultScope), String(at));
  } catch {
    // Even if storing is blocked, the event marks it read for the current session.
  }
}

export function forgetLegacyUnscopedReadAt(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_UNSCOPED_READ_AT_KEY);
  } catch {
    // private mode — skip
  }
}

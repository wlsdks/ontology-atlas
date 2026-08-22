/**
 * The notification box's **"seen up to here" timestamp** — a per-vault slot.
 *
 * ## Why a separate module
 *
 * With the key computed inside the hook, **reverting it turns no test red** (measured 2026-08-01:
 * the scoping was removed from inside the hook and the registry contract test stayed green, because
 * the file still *mentioned* the scoping function's name). A check that looks for a name in the source
 * cannot prove the wiring exists. So the derivation is extracted as a pure function and locked
 * **by behaviour** (`read-at-storage.test.ts`).
 *
 * ## What was broken
 *
 * There used to be one global key. The feed is per vault while the threshold was global, so **opening
 * the bell in one vault marked another vault's unseen items as read.** A notification's only job is to
 * say "what you have not seen yet", and that verdict became false because of someone else's folder.
 */
export const READ_AT_KEY_PREFIX = 'atlas.agentActivity.readAt:';

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

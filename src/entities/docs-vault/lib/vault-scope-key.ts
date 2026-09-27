/** Storage namespace for recents and pins, kept per vault; shared by `/docs` and the map drawer. */
export type VaultScopeKey = 'server' | `local:${string}`;

const PINNED_DOCS_STORAGE_PREFIX = 'demo:docs-vault:pinned:v1:';
const RECENT_DOCS_STORAGE_PREFIX = 'demo:docs-vault:recent:v2:';

export function vaultScopeKey(args: {
  /** A local vault actually loaded. */
  isLocalLoaded: boolean;
  /** Absent falls back to bundled scope. */
  handleName?: string | null;
}): VaultScopeKey {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return 'server';
}

export function pinnedDocsStorageKey(scope: VaultScopeKey): string {
  return `${PINNED_DOCS_STORAGE_PREFIX}${scope}`;
}

export function recentDocsStorageKey(scope: VaultScopeKey): string {
  return `${RECENT_DOCS_STORAGE_PREFIX}${scope}`;
}

/**
 * Vault identity for change detection and per-vault state. Unlike `vaultScopeKey` it separates
 * the two samples; `vaultScopeKey` stays as is to keep existing stored lists.
 */
export type VaultIdentityScope = `local:${string}` | `sample:${string}`;

export function vaultIdentityScope(args: {
  /** A local vault actually loaded. */
  isLocalLoaded: boolean;
  /** Absent falls back to sample scope. */
  handleName?: string | null;
  /** `dogfood` or `storefront`. */
  sampleSource: string;
}): VaultIdentityScope {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return `sample:${args.sampleSource}`;
}

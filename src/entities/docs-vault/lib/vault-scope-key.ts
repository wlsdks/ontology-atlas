/** Storage namespace for recents and pins, kept per vault; shared by `/docs` and the map drawer. */
export type VaultScopeKey = `local:${string}`;

const PINNED_DOCS_STORAGE_PREFIX = 'demo:docs-vault:pinned:v1:';
const RECENT_DOCS_STORAGE_PREFIX = 'demo:docs-vault:recent:v2:';

/** With no folder open the namespace is empty: nothing is pinned or recent there. */
const NO_FOLDER_SCOPE: VaultScopeKey = 'local:';

export function vaultScopeKey(args: {
  isLocalLoaded: boolean;
  handleName?: string | null;
}): VaultScopeKey {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return NO_FOLDER_SCOPE;
}

export function pinnedDocsStorageKey(scope: VaultScopeKey): string {
  return `${PINNED_DOCS_STORAGE_PREFIX}${scope}`;
}

export function recentDocsStorageKey(scope: VaultScopeKey): string {
  return `${RECENT_DOCS_STORAGE_PREFIX}${scope}`;
}

/** What `vaultIdentityScope` answers while no folder is loaded. */
const NO_FOLDER_IDENTITY = 'no-folder';

/**
 * Vault identity for change detection and per-vault state, as one opaque string that changes when
 * the screen starts looking at another vault. Unlike `vaultScopeKey` it has its own value for
 * "no folder loaded".
 */
export type VaultIdentityScope = `local:${string}` | typeof NO_FOLDER_IDENTITY;

export function vaultIdentityScope(args: {
  isLocalLoaded: boolean;
  /** Absent falls back to the no-folder identity. */
  handleName?: string | null;
}): VaultIdentityScope {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return NO_FOLDER_IDENTITY;
}

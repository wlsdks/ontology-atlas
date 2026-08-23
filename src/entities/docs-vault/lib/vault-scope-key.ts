/**
 * The **vault scope key** for a document's recent and pinned lists.
 *
 * Recents and pins must be kept per vault: opening a five-document local vault and
 * seeing documents pinned in the bundled sample leaves a user unable to tell what
 * they are looking at.
 *
 * `/docs` already followed this rule, but the map's quick document drawer
 * hardcoded `'server'` and so showed **pins and recents from bundled documents
 * unrelated to the active local vault** (review 2026-07-25). Both surfaces now use
 * one derivation, placed in `entities` so both widgets can import it — FSD forbids
 * widget→widget imports.
 */
export type VaultScopeKey = 'server' | `local:${string}`;

const PINNED_DOCS_STORAGE_PREFIX = 'demo:docs-vault:pinned:v1:';
const RECENT_DOCS_STORAGE_PREFIX = 'demo:docs-vault:recent:v2:';

export function vaultScopeKey(args: {
  /** Is the active data source a local vault that actually loaded? */
  isLocalLoaded: boolean;
  /** Name of the chosen local folder. Absent falls back to bundled scope. */
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
 * **Which vault the screen is currently looking at** — for *identity*, not for
 * storage namespacing (2026-08-01).
 *
 * `vaultScopeKey` above names a **storage location**, so it collapses both samples
 * (dogfood and the example storefront) into a single `'server'`. Using that value
 * to decide "did the vault change?" means **a sample↔sample switch is not seen as a
 * change** — every node on screen is different while the scope is unchanged, so
 * cleanup logic that trusts the scope removes nothing (raised and reproduced
 * 2026-08-01). That is a scope gate certifying the very defect it was meant to stop.
 *
 * Widening `vaultScopeKey` is not the fix: that would move where pins, recents, and
 * open tabs are stored, orphaning every list a user has accumulated under
 * `'server'`. So these are **deliberately two functions**:
 *
 * | | Used for | The two samples |
 * |---|---|---|
 * | `vaultScopeKey` | storage key namespace (pins, recents, tabs) | one (`server`) |
 * | `vaultIdentityScope` | identity, cleanup triggers, per-vault state keys | split (`sample:<source>`) |
 *
 * New per-vault state uses **this** one. The other is a legacy contract protecting
 * already-shipped storage.
 */
export type VaultIdentityScope = `local:${string}` | `sample:${string}`;

export function vaultIdentityScope(args: {
  /** Is the active data source a local vault that actually loaded? */
  isLocalLoaded: boolean;
  /** Name of the chosen local folder. Absent falls back to sample scope. */
  handleName?: string | null;
  /** Which bundled sample static mode is showing (`dogfood` | `storefront`). */
  sampleSource: string;
}): VaultIdentityScope {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return `sample:${args.sampleSource}`;
}

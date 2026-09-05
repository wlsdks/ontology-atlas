/**
 * URL and localStorage parsing/storage helpers for the docs vault page.
 *
 * Used only inside that surface — `DocsVaultContent` combines the `?view=` query with the
 * user's last stored choice at first render to decide view and source.
 *
 * Pure functions plus a window guard, so SSR and static export are safe.
 *
 * The docs check panel moved from a band to a centre modal, and
 * `readStoredContractOpen`/`storeContractOpen` were deliberately removed with it — a modal
 * open on every page load violates modality, so its open state is not persisted and it
 * always starts closed. The toggle itself is plain component state in `DocsVaultContent`
 * and lives only for the session.
 */

import { VaultConflictError } from "@/entities/vault-session";

export type DocsVaultSource = "server" | "local";
// The folder-topology mini map was removed: it was a third graph vocabulary competing with
// the kind schema. Only 'doc' remains, so this is no longer a union, but the call sites'
// signatures (`parseDocsVaultView`, `replaceDocsVaultUrlState`) are kept as they are to
// minimize the regression diff.
export type DocsVaultView = "doc";

export const DOCS_VAULT_SOURCE_KEY = "demo:docs-vault:source";
export const DOCS_VAULT_LIST_COLLAPSED_KEY = "demo:docs-vault:list-collapsed";

/**
 * Whether the document-list aside is collapsed. A workspace preference, so it persists
 * across sessions and reloads (localStorage). Defaults to false (expanded). Guarded for
 * SSR and static export.
 */
export function readStoredListCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(DOCS_VAULT_LIST_COLLAPSED_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* private mode — skip */
  }
  return false;
}

export function storeListCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DOCS_VAULT_LIST_COLLAPSED_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* private mode — skip */
  }
}

/** URL `?view=` → a validated enum; an unknown value falls back to 'doc'. The union has one
 *  member, so this effectively returns a constant, but the call-site signature is kept (it
 *  once had several views) — reintroducing one means updating this function alone. */
export function parseDocsVaultView(value?: string | null): DocsVaultView {
  void value;
  return "doc";
}

export function parseDocsVaultSource(
  value?: string | null,
): DocsVaultSource | null {
  return value === "server" || value === "local" ? value : null;
}

export function readStoredSource(): DocsVaultSource {
  if (typeof window === "undefined") return "server";
  try {
    const v = window.localStorage.getItem(DOCS_VAULT_SOURCE_KEY);
    if (v === "server" || v === "local") return v;
  } catch {
    /* private mode — skip */
  }
  return "server";
}

/**
 * Should landing on the docs surface auto-prefer the local source? True only when a local
 * vault is actually loaded AND the current source is not already local.
 * Guards the one trust bug: a live vault must never be silently replaced by the
 * Sample (`server`) source just because that was the last stored preference.
 * Callers apply this ONCE per mount (a ref) so a later deliberate switch to
 * Sample is respected — this only covers the initial landing.
 */
export function shouldPreferLocalOnLanding(
  localVaultStatus: string,
  currentSource: DocsVaultSource,
  explicitSource: DocsVaultSource | null = null,
): boolean {
  return (
    explicitSource !== "server" &&
    localVaultStatus === "loaded" &&
    currentSource !== "local"
  );
}

export function storeSource(v: DocsVaultSource) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCS_VAULT_SOURCE_KEY, v);
  } catch {
    /* private mode — skip */
  }
}

export function shouldHonorLocalIntent(
  intent: string | null | undefined,
  isDesktopRuntime: boolean,
): boolean {
  // A web session respects local intent too. In the same browser the map already allows
  // writing to the vault, so gating only the docs surface behind desktop was a contract that
  // contradicted itself across surfaces. A browser without FSA is stopped by the
  // `localVaultStatus === 'unsupported'` gate instead.
  void isDesktopRuntime;
  return intent === "local";
}

export function shouldShowDogfoodVaultHint({
  dogfood,
  isDesktopRuntime,
  source,
  hasLocalManifest,
}: {
  dogfood: string | null | undefined;
  isDesktopRuntime: boolean;
  source: DocsVaultSource;
  hasLocalManifest: boolean;
}): boolean {
  return dogfood === "1" && isDesktopRuntime && source === "local" && !hasLocalManifest;
}

export function shouldSwitchToDogfoodVault({
  dogfood,
  isDesktopRuntime,
  source,
  localVaultStatus,
  currentRootPath,
  dogfoodRootPath,
  dogfoodRootPaths,
}: {
  dogfood: string | null | undefined;
  isDesktopRuntime: boolean;
  source: DocsVaultSource;
  localVaultStatus: string;
  currentRootPath: string | null | undefined;
  dogfoodRootPath: string;
  dogfoodRootPaths?: readonly string[];
}): boolean {
  const acceptedRootPaths = dogfoodRootPaths ?? [dogfoodRootPath];
  if (!currentRootPath) return false;
  return (
    dogfood === "1" &&
    isDesktopRuntime &&
    source === "local" &&
    localVaultStatus === "loaded" &&
    !acceptedRootPaths.includes(currentRootPath)
  );
}

export function isDocsVaultLocalSourceDisabled({
  isDesktopRuntime,
  localVaultStatus,
}: {
  isDesktopRuntime: boolean;
  localVaultStatus: string;
}): boolean {
  // The gate looks only at capability (FSA support). The runtime (web or desktop) is no
  // longer a gate — the same contract as the map.
  void isDesktopRuntime;
  return localVaultStatus === "unsupported";
}

export function shouldShowDesktopVaultWelcome({
  isDesktopRuntime,
  source,
  localVaultStatus,
  hasLocalManifest,
}: {
  isDesktopRuntime: boolean;
  source: DocsVaultSource;
  localVaultStatus: string;
  hasLocalManifest: boolean;
}): boolean {
  // The welcome screen (including the open-folder CTA) is capability-based too: entering the
  // local source in a web FSA session must still offer a way to open. Desktop-only elements
  // (the dogfood path hint) are gated separately by `shouldShowDogfoodVaultHint`.
  void isDesktopRuntime;
  return (
    source === "local" &&
    !hasLocalManifest &&
    (localVaultStatus === "idle" ||
      localVaultStatus === "opening" ||
      localVaultStatus === "loading")
  );
}

/**
 * Escapes user input (title, body) when building HTML for an external popout or print.
 * Four entities are enough — no SVG or iframe is used.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Re-exported, not defined here. It moved to `@/shared/lib/schedule-state-sync` on
 * 2026-09-06 because the reading pane's two scroll hooks became widget code and a
 * widget cannot import a view. Keeping the name reachable from this module leaves the
 * twenty call sites inside Docs untouched while the definition stays single.
 */
export { scheduleStateSync } from "@/shared/lib/schedule-state-sync";

/**
 * The editor's save handler — persists the buffer through `saveDoc`.
 *
 * **The data-loss guard, and the point of this function:** when the `.md` changes outside
 * (another editor, an AI over MCP) between read and write, `saveDoc` throws
 * `VaultConflictError`. *Swallowing* that error here (as an older `onSave` did) makes the
 * calling editor's `doSave` mistake the resolve for success, mark the buffer phantom-clean,
 * and show "saved" → `dirty` becomes false, which releases the poll guard, and the next poll
 * re-fetch silently overwrites the unsaved edit. So a conflict, or any error, is **always
 * re-thrown**. The editor uses that throw to keep the buffer dirty and prevent the loss.
 *
 * `onConflict` is a side-effect hook for notifying the user (a toast); the error is re-thrown
 * whether or not it is called.
 */
export async function persistEditorSave(
  saveDoc: (
    slug: string,
    content: string,
    opts: { expectedMtime?: number },
  ) => Promise<unknown>,
  args: { slug: string; content: string; expectedMtime?: number },
  onConflict?: (err: VaultConflictError) => void,
): Promise<void> {
  try {
    await saveDoc(args.slug, args.content, { expectedMtime: args.expectedMtime });
  } catch (err) {
    if (err instanceof VaultConflictError) {
      onConflict?.(err);
    }
    throw err; // never swallow — the editor needs the throw to keep the buffer dirty
  }
}

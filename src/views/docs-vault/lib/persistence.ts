/**
 * URL and localStorage helpers for the docs vault page; pure plus a window guard, so SSR and
 * static export are safe. The docs check modal's open state is deliberately not persisted.
 */

import { VaultConflictError } from "@/entities/vault-session";

export type DocsVaultSource = "server" | "local";
// One view remains; call-site signatures are kept so adding a view changes only this module.
export type DocsVaultView = "doc";

export const DOCS_VAULT_SOURCE_KEY = "demo:docs-vault:source";
export const DOCS_VAULT_LIST_COLLAPSED_KEY = "demo:docs-vault:list-collapsed";

/** A workspace preference persisted in localStorage; defaults to expanded. */
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

/** An unknown value falls back to 'doc'. */
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
 * True when a local vault is loaded, or the launch stopped to let the person choose, and the
 * source is not already local: a live vault must never be silently replaced by the stored
 * Sample preference. Callers apply it once per mount so a later switch to Sample is respected.
 */
export function shouldPreferLocalOnLanding(
  localVaultStatus: string,
  currentSource: DocsVaultSource,
  explicitSource: DocsVaultSource | null = null,
  awaitingVaultChoice = false,
): boolean {
  return (
    explicitSource !== "server" &&
    (localVaultStatus === "loaded" || awaitingVaultChoice) &&
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
  // The web honours local intent as the map does; a browser without FSA is stopped by
  // the `localVaultStatus === 'unsupported'` gate instead.
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
  // Capability (FSA support) is the gate, not the runtime, as on the map.
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
  // Capability-based too; desktop-only hints are gated by `shouldShowDogfoodVaultHint`.
  void isDesktopRuntime;
  return (
    source === "local" &&
    !hasLocalManifest &&
    (localVaultStatus === "idle" ||
      localVaultStatus === "opening" ||
      localVaultStatus === "loading")
  );
}

/** Escapes user input for a popout or print document; four entities suffice without SVG or iframe. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Re-exported so Docs call sites keep this import while the definition lives in shared. */
export { scheduleStateSync } from "@/shared/lib/schedule-state-sync";

/**
 * Persists the editor buffer through `saveDoc` and always rethrows, a `VaultConflictError`
 * included: a swallowed conflict marks the buffer clean, releases the poll guard, and the next
 * poll overwrites the unsaved edit.
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

import { VaultConflictError } from "@/entities/vault-session";

export type DocsVaultSource = "server" | "local";
export type DocsVaultView = "doc";

export const DOCS_VAULT_SOURCE_KEY = "demo:docs-vault:source";
export const DOCS_VAULT_LIST_COLLAPSED_KEY = "demo:docs-vault:list-collapsed";

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
 * The source the docs surface settles on once it knows its shell, or `"keep"` to settle on the one
 * it holds (a local intent). The installed app has one source, its folders, and no bundled sample,
 * so it settles on local whether or not a folder is open: waiting for a manifest left the page on
 * its loading frame for good while the launch asked which folder to open. A stored preference is
 * never read there, or it would briefly revive the sample the app excludes.
 */
export function settledDocsSource({
  installedShell,
  hasLocalManifest,
  querySource,
  localIntent,
  readStored,
}: {
  installedShell: boolean;
  hasLocalManifest: boolean;
  querySource: DocsVaultSource | null;
  localIntent: boolean;
  readStored: () => DocsVaultSource;
}): DocsVaultSource | "keep" {
  if (installedShell) return "local";
  // A mounted folder wins on landing; `?source=server` stays an explicit web choice.
  if (hasLocalManifest && querySource !== "server") return "local";
  if (querySource) return querySource;
  if (localIntent) return "keep";
  return readStored();
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
      localVaultStatus === "loading" ||
      // A folder that vanished or refused the restore leaves nothing to show but the chooser.
      localVaultStatus === "error")
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { scheduleStateSync } from "@/shared/lib/render-timing/schedule-state-sync";

/**
 * Persists the editor buffer through `saveDoc` and always rethrows, a `VaultConflictError`
 * included: a swallowed conflict marks the buffer clean, releases the poll guard, and the next
 * poll overwrites the unsaved edit.
 */
export async function persistEditorSave(
  saveDoc: (
    slug: string,
    content: string,
    options: { expectedMtime?: number },
  ) => Promise<unknown>,
  args: { slug: string; content: string; expectedMtime?: number },
  onConflict?: (error: VaultConflictError) => void,
): Promise<void> {
  try {
    await saveDoc(args.slug, args.content, { expectedMtime: args.expectedMtime });
  } catch (error) {
    if (error instanceof VaultConflictError) {
      onConflict?.(error);
    }
    throw error; // never swallow — the editor needs the throw to keep the buffer dirty
  }
}

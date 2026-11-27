import { VaultConflictError } from "@/entities/vault-session";

export type DocsVaultView = "doc";

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

export function shouldShowDogfoodVaultHint({
  dogfood,
  hasLocalManifest,
}: {
  dogfood: string | null | undefined;
  hasLocalManifest: boolean;
}): boolean {
  return dogfood === "1" && !hasLocalManifest;
}

export function shouldSwitchToDogfoodVault({
  dogfood,
  localVaultStatus,
  currentRootPath,
  dogfoodRootPath,
  dogfoodRootPaths,
}: {
  dogfood: string | null | undefined;
  localVaultStatus: string;
  currentRootPath: string | null | undefined;
  dogfoodRootPath: string;
  dogfoodRootPaths?: readonly string[];
}): boolean {
  const acceptedRootPaths = dogfoodRootPaths ?? [dogfoodRootPath];
  if (!currentRootPath) return false;
  return (
    dogfood === "1" &&
    localVaultStatus === "loaded" &&
    !acceptedRootPaths.includes(currentRootPath)
  );
}

export function shouldShowDesktopVaultWelcome({
  localVaultStatus,
  hasLocalManifest,
}: {
  localVaultStatus: string;
  hasLocalManifest: boolean;
}): boolean {
  return (
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

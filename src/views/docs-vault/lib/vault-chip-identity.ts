/**
 * What the vault chip says it is — **it states the chosen source**.
 *
 * Owner report from real use, 2026-07-28: local was chosen while the chip read "31 sample
 * documents". The old verdict was `isLocalSourceLoaded && handle` alone, so the state of having
 * **chosen local but not yet chosen a folder** fell through to sample.
 *
 * That state is not sample. It is the **separate state** "local, without a folder yet", and what
 * the screen should say then is not "31 sample documents" but "no folder chosen" — showing a sample
 * number right after the user pressed local is false.
 *
 * The document count is hidden with it. That number belongs to the **sample manifest**, so putting
 * it on a local screen reads as "my folder has 31 documents".
 */
export type VaultChipIdentity =
  | { kind: "local"; label: string; showDocCount: true }
  | { kind: "local-pending"; label: null; showDocCount: false }
  | { kind: "sample"; label: null; showDocCount: true };

export function resolveVaultChipIdentity({
  source,
  isLocalSourceLoaded,
  localFolderName,
}: {
  source: "server" | "local";
  isLocalSourceLoaded: boolean;
  localFolderName: string | null | undefined;
}): VaultChipIdentity {
  if (source === "local") {
    return isLocalSourceLoaded && localFolderName
      ? { kind: "local", label: localFolderName, showDocCount: true }
      : { kind: "local-pending", label: null, showDocCount: false };
  }
  return { kind: "sample", label: null, showDocCount: true };
}

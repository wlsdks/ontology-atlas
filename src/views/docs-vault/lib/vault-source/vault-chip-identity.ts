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

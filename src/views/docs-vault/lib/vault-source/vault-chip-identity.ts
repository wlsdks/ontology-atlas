export type VaultChipIdentity =
  | { kind: "local"; label: string; showDocCount: true }
  | { kind: "local-pending"; label: null; showDocCount: false };

export function resolveVaultChipIdentity({
  isLocalSourceLoaded,
  localFolderName,
}: {
  isLocalSourceLoaded: boolean;
  localFolderName: string | null | undefined;
}): VaultChipIdentity {
  return isLocalSourceLoaded && localFolderName
    ? { kind: "local", label: localFolderName, showDocCount: true }
    : { kind: "local-pending", label: null, showDocCount: false };
}

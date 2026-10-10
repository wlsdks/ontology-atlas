import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useLocalVault, useVaultIdentityScope } from "@/entities/vault-session";
import type { LibrarySourceRow, SourceCandidate, VaultManifest } from "@/entities/docs-vault";
import {
  addSources,
  useSourceImportFeedback,
  addSourcesInBrowser,
  discoverSources,
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
  summarizeAddSources,
  withoutImportedNames,
  type DiscoveryOutcome,
} from "@/features/library";
import { handOverVaultFile } from "@/shared/lib/open-vault-file";
import { revealTauriVaultFile } from "@/shared/lib/tauri-vault-fs";
import { useToast } from "@/shared/ui";

export function useLibrarySources({
  t, toast, localVault, handle, manifest, nativeVaultRootPath, busy, setBusy,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  toast: ReturnType<typeof useToast>;
  localVault: ReturnType<typeof useLocalVault>;
  handle: FileSystemDirectoryHandle | null;
  manifest: VaultManifest | null;
  nativeVaultRootPath: string | null;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
}) {
  const vaultScope = useVaultIdentityScope();
  const [findOpen, setFindOpen] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryOutcome | null>(null);
  const [declinedCount, setDeclinedCount] = useState(0);
  const importedSourceNames = useMemo(
    () => new Set((manifest?.sources ?? []).map((source) => source.name)),
    [manifest],
  );

  const { state: sourceImportFeedback, begin: beginSourceImport } = useSourceImportFeedback(nativeVaultRootPath ?? handle);

  const handleAddFiles = useCallback(() => {
    if (!handle || busy) return;
    const feedback = beginSourceImport();
    setBusy(true);
    void addSources({
      root: handle,
      vaultRootPath: nativeVaultRootPath,
      dialogTitle: t("sources.addTooltip"),
      onImportStart: feedback.importing,
    })
      .then(async (outcome) => {
        if (outcome.cancelled) { feedback.finish(outcome); return; }
        const { added, duplicate, failed } = summarizeAddSources(outcome);
        if (added > 0) toast.show(t("sources.added", { count: added }), "success");
        if (duplicate > 0) {
          const first = outcome.results.find((row) => row.status === "duplicate");
          toast.show(
            t("sources.duplicate", { count: duplicate, path: first?.relativePath ?? "" }),
            "info",
          );
        }
        if (failed > 0) toast.show(t("sources.failed", { count: failed }), "error");
        await localVault.refresh();
        feedback.finish(outcome);
      })
      .catch((error) => {
        feedback.fail();
        toast.show(
          t("sources.failedReason", {
            reason: error instanceof Error ? error.message : String(error),
          }),
          "error",
        );
      })
      .finally(() => setBusy(false));
  }, [handle, busy, beginSourceImport, setBusy, nativeVaultRootPath, t, toast, localVault]);

  const runDiscovery = useCallback(async () => {
    if (!handle) return;
    setDiscovery(null);
    const outcome = await discoverSources({
      handle,
      vaultRootPath: nativeVaultRootPath,
      vaultLabel: handle.name,
    });
    const declined = readDeclinedCandidates(vaultScope);
    const { fresh, declinedCount: hidden } = partitionByDeclined(
      withoutImportedNames(outcome.candidates, importedSourceNames),
      declined,
    );
    setDeclinedCount(hidden);
    setDiscovery({ ...outcome, candidates: fresh });
  }, [handle, importedSourceNames, nativeVaultRootPath, vaultScope]);

  const handleFindDocuments = useCallback(() => {
    toast.dismiss();
    setFindOpen(true);
    void runDiscovery();
  }, [runDiscovery, toast]);

  const handleAddCandidates = useCallback(
    (chosen: SourceCandidate[], declined: SourceCandidate[]) => {
      if (!handle || chosen.length === 0) return;
      setBusy(true);
      rememberDeclinedCandidates(vaultScope, declined);
      void (async () => {
        try {
          if (nativeVaultRootPath) {
            const { importTauriSourceFiles } = await import("@/shared/lib/tauri-vault-fs");
            const absolute = chosen.map(
              (candidate) => `${candidate.rootPath}/${candidate.relativePath}`,
            );
            const results = (await importTauriSourceFiles(nativeVaultRootPath, absolute)) ?? [];
            reportAddOutcome(summarizeAddSources({ results, cancelled: false }));
          } else {
            const files: File[] = [];
            for (const candidate of chosen) {
              const segments = candidate.relativePath.split("/");
              const name = segments.pop() as string;
              let cursor: FileSystemDirectoryHandle = handle;
              for (const segment of segments) cursor = await cursor.getDirectoryHandle(segment);
              files.push(await (await cursor.getFileHandle(name)).getFile());
            }
            reportAddOutcome(summarizeAddSources(await addSourcesInBrowser(handle, files)));
          }
          setFindOpen(false);
          await localVault.refresh();
        } catch (error) {
          toast.show(
            t("sources.failedReason", {
              reason: error instanceof Error ? error.message : String(error),
            }),
            "error",
          );
        } finally {
          setBusy(false);
        }
      })();

      function reportAddOutcome({
        added,
        duplicate,
        failed,
      }: {
        added: number;
        duplicate: number;
        failed: number;
      }) {
        if (added > 0) toast.show(t("sources.added", { count: added }), "success");
        if (duplicate > 0) {
          toast.show(t("sources.duplicate", { count: duplicate, path: "" }), "info");
        }
        if (failed > 0) toast.show(t("sources.failed", { count: failed }), "error");
      }
    },
    [handle, localVault, nativeVaultRootPath, setBusy, t, toast, vaultScope],
  );

  const handleForgetDeclined = useCallback(() => {
    forgetDeclinedCandidates(vaultScope);
    setDeclinedCount(0);
    void runDiscovery();
  }, [runDiscovery, vaultScope]);

  const handleOpenSource = useCallback(
    (row: LibrarySourceRow) => {
      if (nativeVaultRootPath) {
        void revealTauriVaultFile(nativeVaultRootPath, row.path).catch((error) => {
          toast.show(
            t("sources.revealFailed", {
              reason: error instanceof Error ? error.message : String(error),
            }),
            "error",
          );
        });
        return;
      }
      const sourceHandle = localVault.sourceHandles.get(row.path);
      if (!sourceHandle) return;
      void sourceHandle
        .getFile()
        .then((file) => {
          if (handOverVaultFile(file) === "saved") {
            toast.show(t("sources.savedInstead", { name: file.name }), "info");
          }
        })
        .catch(() => toast.show(t("sources.openFailed"), "error"));
    },
    [localVault.sourceHandles, nativeVaultRootPath, t, toast],
  );

  return {
    vaultScope, findOpen, setFindOpen, discovery, setDiscovery, declinedCount, setDeclinedCount,
    importedSourceNames, sourceImportFeedback, beginSourceImport, handleAddFiles, runDiscovery,
    handleFindDocuments, handleAddCandidates, handleForgetDeclined, handleOpenSource,
  };
}

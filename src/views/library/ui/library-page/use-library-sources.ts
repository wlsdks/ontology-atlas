import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { useLocalVault, useVaultIdentityScope } from "@/entities/vault-session";
import {
  withoutVaultOwnedMarkdown,
  type LibrarySourceRow,
  type SourceCandidate,
  type VaultManifest,
} from "@/entities/docs-vault";
import {
  addSources,
  useSourceImportFeedback,
  addSourcesInBrowser,
  discoverSources,
  forgetDeclinedCandidates,
  partitionByDeclined,
  readDeclinedCandidates,
  rememberDeclinedCandidates,
  startSourceCopy,
  summarizeAddSources,
  withoutImportedNames,
  type BrowserSourcePick,
  type DiscoveryOutcome,
} from "@/features/library";
import { handOverVaultFile } from "@/shared/lib/library/open-vault-file";
import { revealTauriSourcesFolder } from "@/shared/lib/vault-folder/native-vault/tauri-library-sources";
import { revealTauriVaultFile } from "@/shared/lib/vault-folder/native-vault/tauri-vault-location";
import { useToast } from "@/shared/ui";
import { hostFileManager } from "../parts/first-run/file-manager";
import type { CopyRequest } from "../parts/first-run/source-drop";
import type { FoundInFolderSummary } from "../parts/first-run/FoundInFolder";

/** Found files in the open folder lead; files only a bound code root holds stay a suggestion. */
function splitByRoot(candidates: readonly SourceCandidate[], openRoot: string) {
  const inFolder: SourceCandidate[] = [];
  const elsewhere: SourceCandidate[] = [];
  for (const candidate of candidates) (candidate.rootPath === openRoot ? inFolder : elsewhere).push(candidate);
  return { inFolder, elsewhere };
}

/** The first folder each file sits in below the open folder; a file at its top counts under its name. */
function folderCounts(candidates: readonly SourceCandidate[], folderName: string) {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const slash = candidate.relativePath.indexOf("/");
    const folder = slash < 0 ? folderName : candidate.relativePath.slice(0, slash).normalize("NFC");
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function browserPicks(handle: FileSystemDirectoryHandle, chosen: readonly SourceCandidate[]): Promise<BrowserSourcePick[]> {
  const picks: BrowserSourcePick[] = [];
  for (const candidate of chosen) {
    const segments = candidate.relativePath.split("/");
    const name = segments.pop() as string;
    let cursor: FileSystemDirectoryHandle = handle;
    for (const segment of segments) cursor = await cursor.getDirectoryHandle(segment);
    picks.push({ file: await (await cursor.getFileHandle(name)).getFile(), relativePath: candidate.relativePath });
  }
  return picks;
}

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
  const docs = manifest?.docs;
  const openRoot = nativeVaultRootPath ?? handle?.name ?? "";
  const fileManager = hostFileManager();
  const fileManagerName = t("start.fileManagerName", { fileManager });

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
    const outcome = await discoverSources({
      handle,
      vaultRootPath: nativeVaultRootPath,
      vaultLabel: handle.name,
    });
    const declined = readDeclinedCandidates(vaultScope);
    const documents = withoutVaultOwnedMarkdown(outcome.candidates, { openRootPath: openRoot, docs: docs ?? [] });
    const { fresh, declinedCount: hidden } = partitionByDeclined(
      withoutImportedNames(documents, importedSourceNames),
      declined,
    );
    setDeclinedCount(hidden);
    setDiscovery({ ...outcome, candidates: fresh });
  }, [docs, handle, importedSourceNames, nativeVaultRootPath, openRoot, vaultScope]);

  const found = useMemo(() => {
    const { inFolder, elsewhere } = splitByRoot(discovery?.candidates ?? [], openRoot);
    const inFolderSummary: FoundInFolderSummary | null = inFolder.length > 0
      ? { count: inFolder.length, truncated: discovery?.truncated ?? false, folders: folderCounts(inFolder, handle?.name ?? "") }
      : null;
    return { inFolder, elsewhere, inFolderSummary };
  }, [discovery, handle, openRoot]);

  const handleFindDocuments = useCallback(() => {
    toast.dismiss();
    setDiscovery(null);
    setFindOpen(true);
    void runDiscovery();
  }, [runDiscovery, toast]);

  const handleShowFoundDocuments = useCallback(() => {
    toast.dismiss();
    setFindOpen(true);
  }, [toast]);

  /** Copies in the background; the toast and the refresh come when the last file lands. */
  const startCopy = useCallback((request: CopyRequest) => {
    void startSourceCopy(vaultScope, request.plan).then(async (job) => {
      if (!job) return;
      if (job.added > 0) toast.show(t("sources.added", { count: job.added }), "success");
      await localVault.refresh();
      void runDiscovery();
    });
  }, [localVault, runDiscovery, t, toast, vaultScope]);

  const copyAllRequest = useCallback(async (): Promise<CopyRequest | null> => {
    if (!handle || found.inFolder.length === 0) return null;
    const totalBytes = found.inFolder.reduce((sum, candidate) => sum + candidate.size, 0);
    const plan = nativeVaultRootPath
      ? { kind: "native" as const, rootPath: nativeVaultRootPath, skipped: [], paths: found.inFolder.map((candidate) => `${candidate.rootPath}/${candidate.relativePath}`) }
      : { kind: "browser" as const, root: handle, skipped: [], picks: await browserPicks(handle, found.inFolder) };
    return { files: found.inFolder.length, totalBytes, plan, holdsOpenFolder: [] };
  }, [found.inFolder, handle, nativeVaultRootPath]);

  const handleAddCandidates = useCallback(
    (chosen: SourceCandidate[], declined: SourceCandidate[]) => {
      if (!handle || chosen.length === 0) return;
      setBusy(true);
      rememberDeclinedCandidates(vaultScope, declined);
      void (async () => {
        try {
          if (nativeVaultRootPath) {
            const { importTauriSourceFiles } = await import("@/shared/lib/vault-folder/native-vault/tauri-library-sources");
            const absolute = chosen.map(
              (candidate) => `${candidate.rootPath}/${candidate.relativePath}`,
            );
            const results = (await importTauriSourceFiles(nativeVaultRootPath, absolute)) ?? [];
            reportAddOutcome(summarizeAddSources({ results, cancelled: false }));
          } else {
            reportAddOutcome(summarizeAddSources(await addSourcesInBrowser(handle, await browserPicks(handle, chosen))));
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

  /** The suggestion's Hide: the existing declined store, so the find dialog can bring them back. */
  const handleHideSuggestion = useCallback((shown: SourceCandidate[]) => {
    rememberDeclinedCandidates(vaultScope, shown);
    const hidden = new Set(shown);
    setDiscovery((current) => current && { ...current, candidates: current.candidates.filter((row) => !hidden.has(row)) });
    setDeclinedCount((count) => count + shown.length);
    toast.show(t("start.found.hidden"), "info");
  }, [t, toast, vaultScope]);

  const handleForgetDeclined = useCallback(() => {
    forgetDeclinedCandidates(vaultScope);
    setDeclinedCount(0);
    void runDiscovery();
  }, [runDiscovery, vaultScope]);

  const revealFailed = useCallback((error: unknown) => {
    toast.show(
      t("sources.revealFailed", {
        fileManagerName,
        reason: error instanceof Error ? error.message : String(error),
      }),
      "error",
    );
  }, [fileManagerName, t, toast]);

  const handleRevealSourcesFolder = useCallback(() => {
    if (nativeVaultRootPath) void revealTauriSourcesFolder(nativeVaultRootPath).catch(revealFailed);
  }, [nativeVaultRootPath, revealFailed]);

  const handleOpenSource = useCallback(
    (row: LibrarySourceRow) => {
      if (nativeVaultRootPath) {
        void revealTauriVaultFile(nativeVaultRootPath, row.path).catch(revealFailed);
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
    [localVault.sourceHandles, nativeVaultRootPath, revealFailed, t, toast],
  );

  return {
    vaultScope, findOpen, setFindOpen, discovery, setDiscovery, declinedCount, setDeclinedCount,
    importedSourceNames, sourceImportFeedback, beginSourceImport, handleAddFiles, runDiscovery,
    handleFindDocuments, handleShowFoundDocuments, handleAddCandidates, handleForgetDeclined, handleOpenSource,
    found, fileManager, startCopy, copyAllRequest, handleHideSuggestion, handleRevealSourcesFolder,
  };
}

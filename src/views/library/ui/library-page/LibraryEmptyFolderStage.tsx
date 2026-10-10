import { useTranslations } from "next-intl";
import { LibraryStartStage } from "../parts/LibraryStartStage";
import { LibrarySynapseField } from "../parts/LibrarySynapseField";
import type { ReactNode } from "react";
import type { useLibrarySources } from "./use-library-sources";

export function LibraryEmptyFolderStage({
  t, handle, nativeVaultRootPath, busy, openImport, importDialog, findDocumentsDialog, sources,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  handle: FileSystemDirectoryHandle;
  nativeVaultRootPath: string | null;
  busy: boolean;
  openImport: () => void;
  importDialog: ReactNode;
  findDocumentsDialog: ReactNode;
  sources: ReturnType<typeof useLibrarySources>;
}) {
  const { findOpen, sourceImportFeedback, handleAddFiles, handleFindDocuments } = sources;
  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="library-page"
      data-library-state="empty-folder"
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
    >
      <LibrarySynapseField paused={findOpen} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-canvas)_0%,var(--color-canvas-a70)_30%,transparent_56%,var(--color-canvas-a70)_88%,var(--color-canvas)_100%)]"
      />
      <div className="relative">
      <LibraryStartStage
        vaultLabel={nativeVaultRootPath ?? handle.name}
        busy={busy}
        onAddFiles={handleAddFiles}
        addFilesFeedback={sourceImportFeedback}
        onFindDocuments={handleFindDocuments}
        onImportFromService={openImport}
        t={t}
      />
      </div>
      {importDialog}
      {findDocumentsDialog}
    </main>
  );
}

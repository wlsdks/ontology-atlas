import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { LibraryStartStage } from "../parts/first-run/LibraryStartStage";
import { LibrarySynapseField } from "../parts/first-run/LibrarySynapseField";
import type { ReactNode } from "react";
import type { useLibrarySources } from "./use-library-sources";

export function LibraryEmptyFolderStage({
  t, handle, nativeVaultRootPath, busy, openImport, conversationDoor, sources,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  handle: FileSystemDirectoryHandle;
  nativeVaultRootPath: string | null;
  busy: boolean;
  openImport: () => void;
  /** The way back into a conversation started from this stage, while its dock is put away. */
  conversationDoor: ReactNode;
  sources: ReturnType<typeof useLibrarySources>;
}) {
  const { findOpen, discovery, runDiscovery, sourceImportFeedback, handleAddFiles, handleFindDocuments, handleShowFoundDocuments } = sources;
  /* Names, formats and sizes only, in the folders the dialog would walk; nothing is copied before a pick. */
  useEffect(() => {
    void runDiscovery();
  }, [runDiscovery]);
  const foundCount = discovery?.candidates.length ?? 0;
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto px-5 py-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]"
    >
      <LibrarySynapseField paused={findOpen} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-canvas)_0%,var(--color-canvas-a70)_30%,transparent_56%,var(--color-canvas-a70)_88%,var(--color-canvas)_100%)]"
      />
      {/* mb-14: the workspace header's height. */}
      <div className="relative mb-14 w-full">
      <LibraryStartStage
        vaultLabel={nativeVaultRootPath ?? handle.name}
        busy={busy}
        onAddFiles={handleAddFiles}
        addFilesFeedback={sourceImportFeedback}
        foundCount={foundCount}
        onFindDocuments={foundCount > 0 ? handleShowFoundDocuments : handleFindDocuments}
        onImportFromService={openImport}
        t={t}
      />
      </div>
      {conversationDoor ? <div className="absolute right-5 top-4">{conversationDoor}</div> : null}
    </div>
  );
}

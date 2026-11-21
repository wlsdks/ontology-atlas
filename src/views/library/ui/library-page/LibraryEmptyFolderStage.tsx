import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { copyNeedsConfirm, dismissSourceCopy, stopSourceCopy } from "@/features/library";

import { AgentDoor } from "../parts/agent/AgentDoor";
import { FoundInFolder } from "../parts/first-run/FoundInFolder";
import { FoundSuggestion } from "../parts/first-run/FoundSuggestion";
import { LibraryStartStage } from "../parts/first-run/LibraryStartStage";
import { LargeCopyConfirm, SkippedFilesDialog } from "../parts/first-run/SourceCopyDialogs";
import { SourceCopyLine } from "../parts/first-run/SourceCopyLine";
import { SourceDropArea } from "../parts/first-run/SourceDropArea";
import type { CopyRequest } from "../../model/sources/source-drop";
import { useSourceCopy, useSourceDrop } from "../../model/sources/use-source-drop";
import type { useLibrarySources } from "../../model/sources/use-library-sources";

export function LibraryEmptyFolderStage({
  t, handle, nativeVaultRootPath, busy, openImport, conversationDoor, sources, agentName, agentConnected, wikiOnly = false,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  handle: FileSystemDirectoryHandle;
  nativeVaultRootPath: string | null;
  busy: boolean;
  openImport: () => void;
  /** The way back into a conversation started from this stage, while its dock is put away. */
  conversationDoor: ReactNode;
  sources: ReturnType<typeof useLibrarySources>;
  agentName: string | null;
  agentConnected: boolean;
  wikiOnly?: boolean;
}) {
  const {
    runDiscovery, sourceImportFeedback, handleAddFiles, handleFindDocuments, handleShowFoundDocuments,
    found, fileManager, startCopy, copyAllRequest, handleHideSuggestion, handleAddCandidates,
    handleRevealSourcesFolder, vaultScope,
  } = sources;
  /* Names, formats and sizes only, in the folders the dialog would walk; nothing is copied before a pick. */
  useEffect(() => {
    void runDiscovery();
  }, [runDiscovery]);

  const [confirming, setConfirming] = useState<CopyRequest | null>(null);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const job = useSourceCopy(vaultScope);
  const copying = job?.phase === "copying";
  /** What a drop could not do, said where the copy line speaks; the next drop replaces it. */
  const [notice, setNotice] = useState<{ kind: "busy" } | { kind: "holdsOpenFolder"; names: string[] } | null>(null);

  const request = useCallback((next: CopyRequest) => {
    // One import per open folder: a second would race the first for free names.
    if (busy || copying) {
      setNotice({ kind: "busy" });
      return;
    }
    setNotice(next.holdsOpenFolder.length > 0 ? { kind: "holdsOpenFolder", names: next.holdsOpenFolder } : null);
    if (next.files === 0 && next.plan.skipped.length === 0) return;
    dismissSourceCopy(vaultScope);
    if (copyNeedsConfirm(next.files, next.totalBytes)) setConfirming(next);
    else startCopy(next);
  }, [busy, copying, startCopy, vaultScope]);
  const { over } = useSourceDrop({ root: handle, nativeRootPath: nativeVaultRootPath, onRequest: request });

  const inApp = nativeVaultRootPath !== null;
  const agentNote = !inApp ? (
    <p data-testid="library-start-agent-note" className="text-body text-[color:var(--color-text-tertiary)]">{t("start.web")}</p>
  ) : agentConnected ? null : (
    <p data-testid="library-start-agent-note" className="flex flex-wrap items-center gap-x-2 text-body text-[color:var(--color-text-tertiary)]">
      <span>{t("start.noAgent")}</span>
      <AgentDoor variant="link" label={t("start.noAgentLink")} testId="library-start-agent-door" />
    </p>
  );

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 justify-center overflow-auto px-5 pt-14 pb-10 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
      <LibraryStartStage
        folderName={handle.name}
        inApp={inApp}
        fileManager={fileManager}
        agentName={agentConnected ? agentName : null}
        agentNote={agentNote}
        wikiOnly={wikiOnly}
        busy={busy}
        foundShown={found.inFolderSummary !== null}
        found={found.inFolderSummary ? (
          <FoundInFolder
            found={found.inFolderSummary}
            folderName={handle.name}
            busy={busy || copying}
            onCopyAll={() => void copyAllRequest().then((next) => next && request(next))}
            onChoose={handleShowFoundDocuments}
            t={t}
          />
        ) : null}
        dropArea={(
          <SourceDropArea
            over={over}
            busy={busy || copying}
            onAddFiles={handleAddFiles}
            addFilesFeedback={sourceImportFeedback}
            line={job || notice ? (
              <>
                {notice ? (
                  <p data-testid="library-copy-notice" data-notice={notice.kind} role="status" className="text-body text-[color:var(--color-text-secondary)]">
                    {notice.kind === "busy"
                      ? t("drop.busy")
                      : t("drop.holdsOpenFolder", { names: notice.names.map((name) => name.normalize("NFC")).join(", ") })}
                  </p>
                ) : null}
                {job ? (
                  <SourceCopyLine job={job} onStop={() => stopSourceCopy(vaultScope)} onShowSkipped={() => setSkippedOpen(true)} t={t} />
                ) : null}
              </>
            ) : null}
            t={t}
          />
        )}
        suggestion={found.elsewhere.length > 0 ? (
          <FoundSuggestion
            candidates={found.elsewhere}
            busy={busy || copying}
            onAdd={(shown) => handleAddCandidates(shown, [])}
            onHide={handleHideSuggestion}
            onSeeAll={handleShowFoundDocuments}
            t={t}
          />
        ) : null}
        onFindDocuments={handleFindDocuments}
        onImportFromService={openImport}
        onReveal={handleRevealSourcesFolder}
        t={t}
      />
      {conversationDoor ? <div className="absolute right-5 top-4">{conversationDoor}</div> : null}
      <LargeCopyConfirm
        request={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) startCopy(confirming);
          setConfirming(null);
        }}
        t={t}
      />
      <SkippedFilesDialog job={job} open={skippedOpen} onClose={() => setSkippedOpen(false)} t={t} />
    </div>
  );
}

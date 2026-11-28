import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GitChangeEntry, GitCommitInfo } from "@/shared/lib/git/tauri-git";
import {
  changedDocumentLabel,
  fileCarriesNode,
  patchOf,
  type CommitConcept,
} from "../lib/commit-documents";
import { arrivalLens, type DocumentFollow, type Lens } from "../lib/document-follow";
import type { CopyTranslate } from "../lib/translator";
import type { ConceptEgo } from "../model/build-concept-ego";
import { useCommitDiff } from "../model/use-commit-diff";
import { ConceptChips } from "./commit-detail/ConceptChips";
import { CommitDetailHeader } from "./commit-detail/CommitDetailHeader";
import { CommitFileList } from "./commit-detail/CommitFileList";
import { CommitLensTabs } from "./commit-detail/CommitLensTabs";
import { DetailSection } from "./commit-detail/DetailSection";
import { DocumentHistory } from "./commit-detail/DocumentHistory";
import { RestoreDock } from "./commit-detail/RestoreDock";
import { ConceptEgoCard } from "./ConceptEgoCard";
import { DocumentChangeReader, type ChangedDocument } from "./PendingDocumentPane";

export type { CommitConcept } from "../lib/commit-documents";

/** What one step changed: identity on top, the rest in two lenses (concepts, files). */
export function CommitDetail({
  t,
  vaultPath,
  hash,
  isoTime,
  relativeTime,
  subject,
  headline = null,
  concepts,
  files,
  pendingDelta,
  onRestore,
  restoreBusy,
  onJumpToCommit,
  follow = null,
  whenOf,
  stepTitleOf,
  focusedConceptId,
  setFocusedConceptId,
  egoFor,
  kindLabel,
}: {
  t: CopyTranslate;
  vaultPath: string | null;
  hash: string;
  isoTime: string;
  relativeTime: string;
  subject: string;
  /**
   * The reader's-language subject for an automatic `ontology snapshot: …` string, `null` for a
   * person's; the raw subject stays on screen as the audit trail.
   */
  headline?: string | null;
  concepts: readonly CommitConcept[];
  files: readonly GitChangeEntry[];
  pendingDelta: ReadonlyMap<string, { added: number; removed: number }>;
  onRestore: (path: string, others: number) => Promise<boolean>;
  restoreBusy: boolean;
  /**
   * Selects another step by hash, carrying the document being read there: a jump from a
   * document's own history keeps following that document.
   */
  onJumpToCommit: (hash: string, follow: DocumentFollow) => void;
  follow?: DocumentFollow | null;
  whenOf: (isoTime: string) => string;
  stepTitleOf: (commit: GitCommitInfo) => string;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
}) {
  /*
   * A jump keeps the followed document and opens on it (`arrivalLens`), or the restore door
   * would aim at the step's first document. A step whose files lack it (a merge) holds: no
   * selection and no door until the person picks a chip or file.
   */
  const followEntry = follow ? (files.find((file) => file.path === follow.path) ?? null) : null;
  const followCarried = followEntry !== null && concepts.some((concept) => fileCarriesNode(followEntry, concept.id));
  const [held, setHeld] = useState(follow !== null && followEntry === null);
  // A plain press on this same step in the list ends the follow; the hold ends with it.
  const holding = held && follow !== null;
  // Holding, nothing is pressed.
  const focused = holding ? null : (focusedConceptId ?? concepts[0]?.id ?? null);
  const pickConcept = (id: string) => {
    setHeld(false);
    setFocusedConceptId(id);
  };

  const [lens, setLens] = useState<Lens>(() =>
    arrivalLens({
      follow,
      followChanged: followEntry !== null,
      followCarried,
      conceptCount: concepts.length,
      fileCount: files.length,
    }),
  );
  const [openFile, setOpenFile] = useState<string | null>(followEntry?.path ?? null);
  const { diff, tooLarge: diffTooLarge, perFile } = useCommitDiff(vaultPath, hash);
  // After a jump the kept selection is scrolled into view once; `nearest` leaves a visible one.
  const detailRef = useRef<HTMLDivElement>(null);
  const revealOnArrival = useRef(follow !== null);
  useLayoutEffect(() => {
    if (!revealOnArrival.current) return;
    revealOnArrival.current = false;
    const anchor = detailRef.current?.querySelector<HTMLElement>("[data-document-anchor]");
    if (anchor && typeof anchor.scrollIntoView === "function") anchor.scrollIntoView({ block: "nearest" });
  }, []);

  const activeFile = holding ? null : (openFile ?? files[0]?.path ?? null);
  const activeEntry = activeFile ? files.find((file) => file.path === activeFile) ?? null : null;
  // The files lens names a document by its concept, else its file name, and reads it with the
  // uncommitted pane's reader.
  const activeDocument = useMemo<ChangedDocument | null>(
    () =>
      activeEntry
        ? { entry: activeEntry, label: changedDocumentLabel(activeEntry, concepts), kind: activeEntry.kind }
        : null,
    [activeEntry, concepts],
  );
  const activeFallback = useMemo(() => patchOf(perFile, activeFile), [perFile, activeFile]);
  // The focused concept's document in this commit, so the default lens has a restore door too.
  const focusedFile = useMemo(() => {
    if (!focused) return null;
    return files.find((file) => fileCarriesNode(file, focused)) ?? null;
  }, [files, focused]);
  // The concepts lens also reads the change itself, between the card and the document's
  // history, so the restore door follows what was just read.
  const focusedLabel = concepts.find((concept) => concept.id === focused)?.label ?? null;
  const focusedDocument = useMemo<ChangedDocument | null>(
    () =>
      focusedFile && focusedLabel !== null
        ? { entry: focusedFile, label: focusedLabel, kind: focusedFile.kind }
        : null,
    [focusedFile, focusedLabel],
  );
  const focusedFallback = useMemo(
    () => patchOf(perFile, focusedFile?.path ?? null),
    [perFile, focusedFile],
  );
  // Keyed by hash and path as in the files lens; opens with a section label, since the card
  // above already names the concept.
  const conceptReader = focusedDocument ? (
    <div
      key={`${hash}:${focusedDocument.entry.path}:${diff === null ? "reading" : "read"}`}
      data-testid="atlas-git-concept-diff"
      className="flex min-h-0 flex-none flex-col"
    >
      <DocumentChangeReader
        t={t}
        vaultPath={vaultPath}
        document={focusedDocument}
        fallback={focusedFallback}
        fallbackTooLarge={diffTooLarge}
        source={hash}
        heading={t("changedLines")}
      />
    </div>
  ) : null;

  // One door per document, on its history heading in both lenses. A step that deleted the
  // document has nothing to restore, and says so instead of silently omitting the door.
  const restoreDoor = (file: GitChangeEntry) =>
    file.status === "deleted" ? (
      <p
        data-testid="atlas-git-restore-absent"
        className="text-caption leading-label text-[color:var(--color-text-quaternary)]"
      >
        {t("restoreAbsentDeleted")}
      </p>
    ) : (
      <RestoreDock
        // Keyed by document, or an armed confirm would re-aim at another document.
        key={file.path}
        t={t}
        path={file.path}
        when={relativeTime}
        pending={pendingDelta.get(file.path) ?? null}
        others={Math.max(0, files.length - 1)}
        busy={restoreBusy}
        onRestore={onRestore}
      />
    );

  /*
   * The followed document, when this step's file list does not hold it: said in the reader in
   * place of a document, above that document's own steps — without a door, because nothing on
   * this step is selected to put back. Drawn the same in both lenses.
   */
  const notInStep =
    holding && follow ? (
      <div className="flex flex-none flex-col gap-1 px-4 py-4">
        <p
          data-testid="atlas-git-doc-not-in-step"
          data-document-anchor
          className="max-w-[var(--measure-doc-column)] text-body leading-body text-[color:var(--color-text-secondary)]"
        >
          {t("docNotInStep", { path: follow.path })}
        </p>
        <DocumentHistory
          key={follow.path}
          t={t}
          vaultPath={vaultPath}
          path={follow.path}
          currentHash={hash}
          changedHere={false}
          whenOf={whenOf}
          stepTitleOf={stepTitleOf}
          onJump={(target) => onJumpToCommit(target, follow)}
        />
      </div>
    ) : null;

  return (
    <div
      ref={detailRef}
      className="git-fade-in flex min-h-0 flex-1 flex-col"
      data-testid="atlas-git-history-detail"
    >
      <CommitDetailHeader
        t={t}
        subject={subject}
        headline={headline}
        concepts={concepts}
        hash={hash}
        isoTime={isoTime}
        relativeTime={relativeTime}
      />

      <CommitLensTabs
        t={t}
        lens={lens}
        onSelectLens={setLens}
        conceptCount={concepts.length}
        fileCount={files.length}
      />

      <div key={lens} className="git-fade-in flex min-h-0 flex-1 flex-col">
        {lens === "concepts" ? (
          concepts.length > 0 ? (
            <>
              <ConceptChips t={t} concepts={concepts} focused={focused} onPick={pickConcept} />
              {focused ? (
                <DetailSection label={t("egoHeading")} note={t("egoHint")}>
                  <ConceptEgoCard
                    ego={egoFor(focused)}
                    t={t}
                    kindLabel={kindLabel}
                    onSelect={pickConcept}
                  />
                </DetailSection>
              ) : null}
              {notInStep}
              {conceptReader}
              {focusedFile ? (
                <div className="px-4 pb-4">
                  {/* Keyed by document, so a new document never shows the last one's rows while reading. */}
                  <DocumentHistory
                    key={focusedFile.path}
                    t={t}
                    vaultPath={vaultPath}
                    path={focusedFile.path}
                    currentHash={hash}
                    whenOf={whenOf}
                    stepTitleOf={stepTitleOf}
                    onJump={(target) =>
                      onJumpToCommit(target, { path: focusedFile.path, lens: "concepts", conceptId: focused })
                    }
                    action={restoreDoor(focusedFile)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="px-4 py-6 text-label text-[color:var(--color-text-quaternary)]">
                {t("stepNoConcepts")}
              </p>
              {notInStep}
            </>
          )
        ) : (
          <>
            <CommitFileList
              files={files}
              activeFile={activeFile}
              onOpenFile={(path) => {
                setHeld(false);
                setOpenFile(path);
              }}
            />

            {activeDocument ? (
              // Keyed by hash and path so a new document starts over; `diff` in the key makes a
              // later patch replace the fallback instead of layering on it.
              <div
                key={`${hash}:${activeDocument.entry.path}:${diff === null ? "reading" : "read"}`}
                data-testid="atlas-git-commit-diff"
                className="flex min-h-0 flex-none flex-col"
              >
                <DocumentChangeReader
                  t={t}
                  vaultPath={vaultPath}
                  document={activeDocument}
                  fallback={activeFallback}
                  fallbackTooLarge={diffTooLarge}
                  source={hash}
                />
              </div>
            ) : null}
            {activeEntry ? (
              <div className="px-4 pb-4">
                <DocumentHistory
                  key={activeEntry.path}
                  t={t}
                  vaultPath={vaultPath}
                  path={activeEntry.path}
                  currentHash={hash}
                  whenOf={whenOf}
                  stepTitleOf={stepTitleOf}
                  onJump={(target) => onJumpToCommit(target, { path: activeEntry.path, lens: "files", conceptId: null })}
                  action={restoreDoor(activeEntry)}
                />
              </div>
            ) : null}
            {notInStep}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useFormatter } from "next-intl";
import { cn } from "@/shared/lib/cn";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { shortHash, stripConventionalPrefix } from "../lib/step-title";
import { arrivalLens, type DocumentFollow, type Lens } from "../lib/document-follow";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { controlClass } from "@/shared/ui";
import { gitCommitDiff, gitHistory, type GitChangeEntry, type GitCommitInfo } from "@/shared/lib/tauri-git";
import { parseUnifiedDiff, type AtlasGitDiffFile } from "@/shared/lib/atlas-git-record";
import { DocumentChangeReader, type ChangedDocument } from "./PendingDocumentPane";
import type { ConceptEgo } from "../model/build-concept-ego";
import { ConceptEgoCard } from "./ConceptEgoCard";
import { DocumentConfirmStep } from "./DocumentConfirmStep";

/**
 * What one step changed: identity always on top, the rest in two lenses. Tabs fit here
 * because Concepts and Files are two views of one chosen step, hiding presentation, not a
 * fact; the history list has no tabs, since there a tab would hide repository state.
 * The file list is a chooser, so only the chosen file's document renders.
 */
export interface CommitConcept {
  id: string;
  label: string;
  kind: string;
}

/** Concept names the headline spells out before it counts the rest. */
const HEADLINE_CONCEPTS = 2;

/**
 * Does this changed file carry that concept? Kind and slug tail are both compared, as the
 * forward `matchNodeId` does: `domains/orders.md` and `capabilities/orders.md` share a tail, and
 * matching the tail alone would aim the restore door at the wrong file.
 */
function fileCarriesNode(file: { slug: string; kind: string | null }, nodeId: string): boolean {
  if (!file.kind) return false;
  const tail = file.slug.split("/").pop() ?? file.slug;
  return nodeId === `${file.kind}:${tail}`;
}

/** One section — label (plus count or hint) above, content below. */
function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-none flex-col gap-2.5 px-5 py-4">
      <h3 className="flex items-baseline gap-2 text-label text-[color:var(--color-text-tertiary)]">
        {label}
        {note ? (
          <i className="min-w-0 truncate not-italic text-caption text-[color:var(--color-text-quaternary)]">
            {note}
          </i>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

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
  t: (key: string, values?: Record<string, string | number>) => string;
  /** The connected vault scopes this commit's lazy `git show` request. */
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
  /** Uncommitted +/- line counts per path, from the diff the person can already read. */
  pendingDelta: ReadonlyMap<string, { added: number; removed: number }>;
  /** Restores one of this commit's files to this commit's content; resolves true when git did it. */
  onRestore: (path: string, others: number) => Promise<boolean>;
  restoreBusy: boolean;
  /**
   * Selects another step by hash, carrying the document being read there: a jump from a
   * document's own history keeps following that document.
   */
  onJumpToCommit: (hash: string, follow: DocumentFollow) => void;
  /** The document this step was opened to follow — a jump from its history — or `null`. */
  follow?: DocumentFollow | null;
  /** Relative-time wording in the reader's language. */
  whenOf: (isoTime: string) => string;
  /** What another step changed, in words: its concepts, else its documents, else its author's sentence. */
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
  const focused = holding ? null : (focusedConceptId ?? concepts[0]?.id ?? null);
  const pickConcept = (id: string) => {
    setHeld(false);
    setFocusedConceptId(id);
  };
  const format = useFormatter();
  const { state: hashState, copy: copyHash } = useCopyFeedback();
  const authored = stripConventionalPrefix(subject);
  const reason = headline ? t("stepAutoSubject", { summary: headline }) : authored;
  // The headline is the author's sentence; only an automatic subject is named by its
  // concepts, with the reader's-language summary under it.
  const conceptTitle =
    headline && concepts.length > 0
      ? `${concepts
          .slice(0, HEADLINE_CONCEPTS)
          .map((concept) => concept.label)
          .join(", ")}${concepts.length > HEADLINE_CONCEPTS ? ` ${t("moreSlugs", { count: concepts.length - HEADLINE_CONCEPTS })}` : ""}`
      : null;
  const title = conceptTitle ?? headline ?? authored;
  // With a concept title, the author's reason is the second line; without one the reason
  // already is the title and is not said twice.
  const byline = conceptTitle ? reason : null;
  const dateLabel = useMemo(() => {
    const at = new Date(isoTime);
    if (Number.isNaN(at.getTime())) return "";
    const sameYear = at.getFullYear() === new Date().getFullYear();
    return format.dateTime(at, {
      ...(sameYear ? {} : { year: "numeric" }),
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      // The reader's local time; the static export configures no global default.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [format, isoTime]);

  /*
   * Concept chips are an exclusive single selection starting at `concepts[0]`, exposed as a
   * radio group. The container keeps its own `tone:'secondary'` plus conditional border,
   * which never paints over a pressed chip's indigo.
   */
  const conceptGroup = useRovingRadioGroup<string | null>({
    // Holding, nothing is pressed; the group then makes its first chip the tab stop (APG).
    value: focused,
    values: concepts.map((c) => c.id),
    onChange: (id) => {
      if (id) pickConcept(id);
    },
  });

  // Concepts by default, files for a step without concepts, and a followed document's own lens.
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
  const [diff, setDiff] = useState<string | null>(null);
  // After a jump the kept selection is scrolled into view once; `nearest` leaves a visible one.
  const detailRef = useRef<HTMLDivElement>(null);
  const revealOnArrival = useRef(follow !== null);
  useLayoutEffect(() => {
    if (!revealOnArrival.current) return;
    revealOnArrival.current = false;
    const anchor = detailRef.current?.querySelector<HTMLElement>("[data-document-anchor]");
    if (anchor && typeof anchor.scrollIntoView === "function") anchor.scrollIntoView({ block: "nearest" });
  }, []);

  // The parent keys this detail by vault, hash and concept count, so a new step starts
  // with fresh state and needs no effect reset.
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitCommitDiff(vaultPath, hash)
      .then((result) => {
        if (!cancelled) setDiff(result?.diff ?? "");
      })
      // A failed read leaves that section saying "none".
      .catch(() => {
        if (!cancelled) setDiff("");
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, hash]);

  /*
   * The commit's own patch, parsed once: it is the reader's fallback when the whole
   * document cannot be read at this commit (the web, a stub, a refused `git show`).
   */
  const perFile = useMemo(() => parseUnifiedDiff(diff ?? ""), [diff]);
  const activeFile = holding ? null : (openFile ?? files[0]?.path ?? null);
  const activeEntry = activeFile ? files.find((file) => file.path === activeFile) ?? null : null;
  // The files lens names a document by its concept (`fileCarriesNode`), else its file name,
  // and reads it with the uncommitted pane's reader.
  const activeDocument = useMemo<ChangedDocument | null>(() => {
    if (!activeEntry) return null;
    const concept = concepts.find((c) => fileCarriesNode(activeEntry, c.id));
    return {
      entry: activeEntry,
      // A document without a concept drops `.md` like the uncommitted chips; config keeps its name.
      label:
        concept?.label ??
        (activeEntry.kind
          ? (activeEntry.path.split("/").pop() ?? activeEntry.path).replace(/\.md$/i, "")
          : (activeEntry.path.split("/").pop() ?? activeEntry.path)),
      kind: activeEntry.kind,
    };
  }, [activeEntry, concepts]);
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
      <div className="flex flex-none flex-col gap-1 px-5 py-4">
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
      {/*
        Identity, the pane's one headline in either lens: `text-hero`, one step above the page
        title so the selection wins, at the signature weight. A short id and a locale date
        replace the full hash and ISO timestamp.
      */}
      <header className="flex flex-none flex-col gap-1.5 px-5 pt-5 pb-4">
        <h2
          data-testid="atlas-git-detail-headline"
          title={subject}
          /* Bounded by the document column's measure, balanced so a two-line sentence does not
             leave one word alone on its second line. */
          className="max-w-[var(--measure-doc-column)] text-balance text-hero font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
        >
          {title}
        </h2>
        {byline ? (
          <p
            data-testid="atlas-git-detail-byline"
            className="text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
          >
            {byline}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--color-text-tertiary)]">
          <button
            type="button"
            data-testid="atlas-git-detail-hash"
            onClick={() => void copyHash(hash)}
            aria-label={t("hashCopy", { hash })}
            title={t("hashCopy", { hash })}
            className={controlClass({
              // `md`, the size of every other door in this pane; `-ml-2.5` cancels its
              // inline padding so the id starts on the headline's line.
              shape: "chip",
              size: "md",
              tone: "secondary",
              hoverInk: "strong",
              hoverBorder: "strong",
              className: "-ml-2.5 border-transparent font-mono tabular-nums",
            })}
          >
            {hashState === "copied" ? t("webCopied") : shortHash(hash)}
          </button>
          <time dateTime={isoTime} className="tabular-nums">
            {dateLabel}
          </time>
          <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
          <span>{relativeTime}</span>
        </p>
      </header>

      {/* Each lens label carries its count, so the tab never hides a fact. */}
      <div
        role="tablist"
        aria-label={t("lensLabel")}
        className="flex flex-none items-center gap-1 border-b border-[color:var(--color-divider)] px-5"
      >
        {(["concepts", "files"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            data-testid={`atlas-git-lens-${id}`}
            aria-selected={lens === id}
            /* An empty lens stays in the strip to say its zero, but cannot be chosen. */
            disabled={(id === "concepts" ? concepts.length : files.length) === 0}
            onClick={() => setLens(id)}
            className={controlClass({ shape: "segment", size: "md", tone: "muted", className: "-mb-px min-h-9 gap-1.5 rounded-none border-b-2 border-transparent px-2.5 hover:text-[color:var(--color-text-primary)] aria-selected:border-[color:var(--color-indigo-brand)] aria-selected:font-[var(--font-weight-signature)] aria-selected:text-[color:var(--color-text-primary)]" })}
          >
            {id === "concepts" ? t("changedConcepts") : t("changedFiles")}
            <b className="font-normal tabular-nums text-[color:var(--color-text-quaternary)]">
              {id === "concepts" ? concepts.length : files.length}
            </b>
          </button>
        ))}
      </div>

      <div key={lens} className="git-fade-in flex min-h-0 flex-1 flex-col">
        {lens === "concepts" ? (
          concepts.length > 0 ? (
            <>
              <div className="flex flex-none flex-col gap-2.5 px-5 pt-4">
                <div {...conceptGroup.groupProps} aria-label={t("conceptChipsAria")} className="flex flex-wrap gap-1.5">
                  {concepts.map((concept, index) => (
                    <button
                      key={concept.id}
                      {...conceptGroup.itemProps(index)}
                      type="button"
                      data-testid="atlas-git-concept-chip"
                      data-document-anchor={focused === concept.id ? true : undefined}
                      className={controlClass({
                        shape: "chip",
                        size: "md",
                        tone: "secondary",
                        active: focused === concept.id,
                        // The pressed chip's indigo border comes from the ramp;
                        // overriding it unconditionally here would silently
                        // remove that signal (a before/after measurement caught it).
                        className: cn(
                          focused !== concept.id &&
                            "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
                        ),
                      })}
                    >
                      <OntologyMapKindGlyph kind={concept.kind} size={12} />
                      {concept.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Card first, then the document's timeline with the restore door on its heading, as in the files lens. */}
              {focused ? (
                <Section label={t("egoHeading")} note={t("egoHint")}>
                  <ConceptEgoCard
                    ego={egoFor(focused)}
                    t={t}
                    kindLabel={kindLabel}
                    onSelect={pickConcept}
                  />
                </Section>
              ) : null}
              {notInStep}
              {conceptReader}
              {focusedFile ? (
                <div className="px-5 pb-4">
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
              <p className="px-5 py-6 text-label text-[color:var(--color-text-quaternary)]">
                {t("stepNoConcepts")}
              </p>
              {notInStep}
            </>
          )
        ) : (
          <>
            <ul
              data-testid="atlas-git-file-list"
              className="flex flex-none flex-col border-b border-[color:var(--color-divider)]"
            >
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    data-testid="atlas-git-commit-file"
                    /* `aria-current`, not pressed: the lens above already uses `aria-selected`. */
                    aria-current={activeFile === file.path ? "true" : undefined}
                    data-document-anchor={activeFile === file.path ? true : undefined}
                    onClick={() => {
                      setHeld(false);
                      setOpenFile(file.path);
                    }}
                    className={controlClass({ shape: "row", stacked: true, className: "min-h-8 min-w-0 gap-2.5 border-l-2 border-l-transparent px-5 hover:bg-[color:var(--color-overlay-1)] aria-[current=true]:border-l-[color:var(--color-indigo-brand)] aria-[current=true]:bg-[color:var(--color-overlay-2)]" })}
                  >
                    <span
                      aria-hidden
                      className="grid size-[18px] shrink-0 place-items-center rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] font-mono text-caption text-[color:var(--color-text-tertiary)]"
                    >
                      {statusMark(file.status)}
                    </span>
                    <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-secondary)]">
                      {file.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

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
                  source={hash}
                />
              </div>
            ) : null}
            {/* The document first, then its history and door, in the same order as the concepts lens. */}
            {activeEntry ? (
              <div className="px-5 pb-4">
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

/**
 * Restore: this commit's content for one document, landing as an uncommitted change. The
 * confirm says it is reversible, whether uncommitted lines go with it, and which documents stay.
 */
function RestoreDock({
  t,
  path,
  when,
  pending,
  others,
  busy,
  onRestore,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  path: string;
  when: string;
  pending: { added: number; removed: number } | null;
  others: number;
  busy: boolean;
  onRestore: (path: string, others: number) => Promise<boolean>;
}) {
  return (
    // Armed, the confirm takes the heading row's full width, under the heading it belongs to.
    <div
      className="flex min-w-0 flex-col gap-2 has-[[data-testid=atlas-git-restore-step]]:basis-full"
      data-testid="atlas-git-restore-dock"
    >
      <DocumentConfirmStep
        testIdPrefix="atlas-git-restore"
        /* The door names the one file it puts back before it is pressed. */
        doorLabel={t("restoreAction", { path })}
        confirmLabel={t("restoreButton")}
        busyLabel={t("restoreRunning")}
        cancelLabel={t("cancelButton")}
        tone="primary"
        busy={busy}
        onConfirm={() => onRestore(path, others)}
      >
        <p className="text-label leading-prose text-[color:var(--color-text-secondary)]">
          {t("restoreConfirmBody", { path, when })}
        </p>
        {pending && pending.added + pending.removed > 0 ? (
          <p className="text-label leading-prose text-[color:var(--color-danger-text)]">
            {t("restoreConfirmPending", { added: pending.added, removed: pending.removed })}
          </p>
        ) : null}
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("restoreConfirmLands")}
          {others > 0 ? ` ${t("restoreConfirmOthers", { count: others })}` : ""}
        </p>
      </DocumentConfirmStep>
    </div>
  );
}

/** How many of a document's other steps are read; one more tells whether older ones exist. */
const DOCUMENT_HISTORY_LIMIT = 12;
/** Rows a document's history shows before "N more". */
const DOCUMENT_HISTORY_PREVIEW = 3;

/**
 * The other steps that changed this one document, read from git scoped to the path; each
 * row jumps to that step.
 */
function DocumentHistory({
  t,
  vaultPath,
  path,
  currentHash,
  changedHere = true,
  whenOf,
  stepTitleOf,
  onJump,
  action = null,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  vaultPath: string | null;
  path: string;
  currentHash: string;
  /**
   * Whether the step on screen changed this document. When it did not, the list is the steps
   * that did, and says nothing about this one — "this is the only step" would be false.
   */
  changedHere?: boolean;
  whenOf: (isoTime: string) => string;
  stepTitleOf: (commit: GitCommitInfo) => string;
  onJump: (hash: string) => void;
  /** The document's restore door, drawn on the heading beside the versions it chooses between. */
  action?: React.ReactNode;
}) {
  const [rows, setRows] = useState<GitCommitInfo[] | null>(null);
  const [older, setOlder] = useState(false);
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitHistory(vaultPath, DOCUMENT_HISTORY_LIMIT + 1, path)
      .then((result) => {
        if (cancelled) return;
        const all = result ?? [];
        setOlder(all.length > DOCUMENT_HISTORY_LIMIT);
        setRows(all.slice(0, DOCUMENT_HISTORY_LIMIT));
      })
      // A failed read shows nothing rather than a wrong list; the main list still has every step.
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, path]);

  const others = useMemo(() => (rows ?? []).filter((commit) => commit.hash !== currentHash), [rows, currentHash]);
  // Three by default so the ego drawing stays above the fold; the rest are counted, one press away.
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  // "Show fewer" fades the removed rows out on the arrival curve before shortening; opacity
  // only, so reduced motion keeps the fade, and without Web Animations it just shortens.
  const collapse = () => {
    const leaving = [...(listRef.current?.querySelectorAll<HTMLLIElement>("li[data-extra]") ?? [])];
    if (leaving.length === 0 || typeof leaving[0].animate !== "function") {
      setExpanded(false);
      return;
    }
    const style = getComputedStyle(leaving[0]);
    // The token computes as ".12s" in the browser, not "120ms"; read either unit.
    const raw = style.getPropertyValue("--motion-fast").trim();
    const value = Number.parseFloat(raw);
    const duration = Number.isFinite(value) ? (raw.endsWith("ms") ? value : value * 1000) : 120;
    const easing = style.getPropertyValue("--motion-ease").trim() || "ease";
    const runs = leaving.map((row) =>
      row.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: "forwards" }).finished,
    );
    void Promise.allSettled(runs).then(() => setExpanded(false));
  };
  // The door keeps one tree position before and after the history lands; moving it would
  // remount it and close an open restore confirm.
  const loaded = rows !== null;
  if (!loaded && !action) return null;
  if (loaded && !changedHere && others.length === 0) return null;
  const shown = expanded ? others : others.slice(0, DOCUMENT_HISTORY_PREVIEW);
  const hidden = others.length - shown.length;
  return (
    <section className="flex flex-col gap-1 pt-4" data-testid={loaded ? "atlas-git-document-history" : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {loaded ? (
          <h3 className="flex items-baseline gap-2 text-label text-[color:var(--color-text-tertiary)]">
            {!changedHere ? t("docHistoryElsewhere") : others.length > 0 ? t("docHistoryTitle") : t("docHistoryOnly")}
            {others.length > 0 ? (
              <b className="font-normal tabular-nums text-[color:var(--color-text-quaternary)]">{others.length}</b>
            ) : null}
          </h3>
        ) : null}
        {action}
      </div>
      {others.length > 0 ? (
        <ul ref={listRef} className="flex flex-col">
          {shown.map((commit, index) => (
            <li
              key={commit.hash}
              data-extra={index >= DOCUMENT_HISTORY_PREVIEW ? "true" : undefined}
              /* Added rows arrive on the list's stagger, capped at eight; the first three do not replay. */
              className={index >= DOCUMENT_HISTORY_PREVIEW ? "git-fade-in" : undefined}
              style={
                index >= DOCUMENT_HISTORY_PREVIEW
                  ? ({ ["--git-row-index" as string]: Math.min(index - DOCUMENT_HISTORY_PREVIEW, 7) } as CSSProperties)
                  : undefined
              }
            >
              <button
                type="button"
                data-testid="atlas-git-document-step"
                title={t("docHistoryJumpHint")}
                onClick={() => onJump(commit.hash)}
                className={controlClass({
                  shape: "row",
                  size: "sm",
                  tone: "secondary",
                  hoverInk: "strong",
                  hoverSurface: "lift",
                  /* The list's own `--git-when-w` time column, for the same rhythm as the left. */
                  className: "grid w-full grid-cols-[var(--git-when-w)_minmax(0,1fr)] items-center gap-3 rounded-none px-0",
                })}
              >
                <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                  {whenOf(commit.isoTime)}
                </span>
                <span className="min-w-0 truncate text-body" title={commit.subject}>
                  {stepTitleOf(commit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 || (expanded && others.length > DOCUMENT_HISTORY_PREVIEW) ? (
        <button
          type="button"
          data-testid="atlas-git-document-history-more"
          aria-expanded={expanded}
          onClick={() => (expanded ? collapse() : setExpanded(true))}
          className={controlClass({
            shape: "chip",
            size: "md",
            tone: "secondary",
            hoverInk: "strong",
            hoverBorder: "strong",
            className: "-ml-2.5 self-start border-transparent",
          })}
        >
          {expanded ? t("docHistoryLess") : t("docHistoryMore", { count: hidden })}
        </button>
      ) : null}
      {older && (expanded || others.length <= DOCUMENT_HISTORY_PREVIEW) ? (
        <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">{t("docHistoryOlder")}</p>
      ) : null}
    </section>
  );
}

/** One-character file status — the letter carries the meaning, not the colour. */
function statusMark(status: string): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    default:
      return "M";
  }
}

/**
 * Find a patch by file path, exact first, then by tail: list paths are vault-relative and
 * patch paths repository-relative.
 */
function patchOf(perFile: readonly AtlasGitDiffFile[], path: string | null): AtlasGitDiffFile | null {
  if (!path) return null;
  return (
    perFile.find((file) => file.path === path) ??
    perFile.find((file) => file.path.endsWith(path) || path.endsWith(file.path)) ??
    null
  );
}


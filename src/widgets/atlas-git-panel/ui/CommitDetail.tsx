"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { controlClass } from "@/shared/ui";
import { gitCommitDiff, gitHistory, type GitChangeEntry, type GitCommitInfo } from "@/shared/lib/tauri-git";
import { parseUnifiedDiff } from "@/shared/lib/atlas-git-record";
import { DocumentChangeReader, type ChangedDocument } from "./PendingDocumentPane";
import type { ConceptEgo } from "../model/build-concept-ego";
import { ConceptEgoCard } from "./ConceptEgoCard";

/**
 * What one step changed — identity (title, hash) always on top, the rest split
 * into two lenses.
 *
 * ## Why tabs here, and why tabs on the list were rejected (2026-08-03)
 *
 * The same word means opposite things in the two places. **On the list** tabs
 * were rejected: what varies there is the *repository's* state (uncommitted ·
 * unpushed · remote-only), and a tab **hides** every pane but its own — "you
 * have something unpushed" sitting behind another tab is the same as it not
 * existing. That decision and the test that holds it already exist
 * ("Commit history never hides behind a tab" — commit history never hides behind a tab).
 *
 * **Here what varies is not state but lens.** "Concepts" (concepts) and "Files"
 * (files) are two ways of looking at *one already-chosen step*, and identity
 * stays above the tabs so it survives either lens. What hides is the
 * presentation, not a fact.
 *
 * Measurement forced the switch: five sections stacked in one column turned the
 * right-hand column into a 2,000px scroll, and "What Changed" (what changed)
 * concatenated four files' patches, so which file you were reading was decided
 * **by scroll position alone**. Owner: *"It looked like too much was being expressed through scrolling."*
 * (it looked like too much was being expressed through scrolling).
 *
 * So the file list became a **chooser** — only the clicked file's patch renders
 * beneath it.
 */
export interface CommitConcept {
  id: string;
  label: string;
  kind: string;
}

type Lens = "concepts" | "files";

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
  whenOf,
  headlineOf,
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
   * The subject in the reader's language when the subject is one of our own automatic
   * `ontology snapshot: …` strings; `null` when a person wrote it. The raw subject stays on
   * screen either way — one line down — because the audit trail is the raw text.
   */
  headline?: string | null;
  concepts: readonly CommitConcept[];
  files: readonly GitChangeEntry[];
  /** Uncommitted +/- line counts per path, from the diff the person can already read. */
  pendingDelta: ReadonlyMap<string, { added: number; removed: number }>;
  /** Restores one of this commit's files to this commit's content; resolves true when git did it. */
  onRestore: (path: string, others: number) => Promise<boolean>;
  restoreBusy: boolean;
  /** Selects another step by hash. */
  onJumpToCommit: (hash: string) => void;
  /** Relative-time wording in the reader's language. */
  whenOf: (isoTime: string) => string;
  /** Human wording for an automatic subject, `null` when a person wrote it. */
  headlineOf: (subject: string) => string | null;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
}) {
  const focused = focusedConceptId ?? concepts[0]?.id ?? null;

  /*
   * Concept chips are an **exclusive single selection**: the initial value is
   * `concepts[0]`, so one is always true and re-clicking never clears it.
   * Siblings previously carried `aria-pressed` side by side, which left the
   * exclusivity out of the accessibility tree entirely.
   *
   * The container stays as it is — `tone:'secondary'` plus a conditional border
   * is not a chip-ramp combination, and that border rule comes from a
   * measurement: never paint over a pressed chip's indigo (decision rule,
   * ledger 2026-08-15 (8)).
   */
  const conceptGroup = useRovingRadioGroup({
    value: focused,
    values: concepts.map((c) => c.id),
    onChange: setFocusedConceptId,
  });

  /*
   * The default lens is **concepts**, because that is exactly where this product
   * parts ways with a git client: every tool has a file list, and "which
   * concepts did this step touch" exists only here. Only a step with no
   * concepts at all (a config-only change, say) opens on files — a default that
   * renders empty is not a default.
   */
  const [lens, setLens] = useState<Lens>(concepts.length > 0 ? "concepts" : "files");
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);

  // The parent keys this detail by vault + hash + concept count. A step transition
  // therefore creates the correct initial lens, file selection, and loading state
  // without a synchronous effect reset.
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitCommitDiff(vaultPath, hash)
      .then((result) => {
        if (!cancelled) setDiff(result?.diff ?? "");
      })
      // A failed read does not bring the screen down — that section just says "none".
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
  const activeFile = openFile ?? files[0]?.path ?? null;
  const activeEntry = activeFile ? files.find((file) => file.path === activeFile) ?? null : null;
  /*
   * The document the files lens reads, named the way the concept lens names it: the concept
   * whose id tail matches the file's slug tail, else the file name. The same reader the
   * uncommitted pane uses (owner direction B, 2026-09-19) draws it whole at this commit,
   * so a step's change and an uncommitted change read the same way.
   */
  const activeDocument = useMemo<ChangedDocument | null>(() => {
    if (!activeEntry) return null;
    const tail = activeEntry.slug.split("/").pop() ?? activeEntry.slug;
    const concept = concepts.find((c) => (c.id.split(":").pop() ?? c.id) === tail);
    return {
      entry: activeEntry,
      // A document without a matching concept is named by its file, minus the `.md` the
      // uncommitted pane's chips also drop; a config file keeps its full name.
      label:
        concept?.label ??
        (activeEntry.kind
          ? (activeEntry.path.split("/").pop() ?? activeEntry.path).replace(/\.md$/i, "")
          : (activeEntry.path.split("/").pop() ?? activeEntry.path)),
      kind: activeEntry.kind,
    };
  }, [activeEntry, concepts]);
  const activeFallback = useMemo(() => {
    if (!activeFile) return null;
    return (
      perFile.find((file) => file.path === activeFile) ??
      perFile.find((file) => file.path.endsWith(activeFile) || activeFile.endsWith(file.path)) ??
      null
    );
  }, [perFile, activeFile]);
  /*
   * The focused concept's own document in this commit. The concept lens is the default lens
   * (review, 2026-09-19: an action that lives only under "files" may never be found), so the
   * restore door opens here too, for the document that carries the concept.
   */
  const focusedFile = useMemo(() => {
    if (!focused) return null;
    const tail = focused.split(":").pop() ?? focused;
    return files.find((file) => (file.slug.split("/").pop() ?? file.slug) === tail) ?? null;
  }, [files, focused]);

  return (
    <div
      className="git-fade-in flex min-h-0 flex-1 flex-col"
      data-testid="atlas-git-history-detail"
    >
      {/* Identity — survives either lens. */}
      <header className="flex flex-none flex-col gap-1 px-5 pt-4 pb-3">
        <p
          data-testid="atlas-git-detail-headline"
          className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
        >
          {headline ?? subject}
        </p>
        <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
          {headline ? <>{subject} · </> : null}
          {t("historyItemDetail", { hash, isoTime })} · {relativeTime}
        </p>
      </header>

      {/* The lenses carry their count in the label. "Concepts" alone forces a
          click to learn how many, and then the tab hides a **fact**, not a
          presentation. */}
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
              {/* The tab already said how many concepts changed — repeating it
                  directly below spends ink and says nothing. */}
              <div className="flex flex-none flex-col gap-2.5 px-5 pt-4">
                <div {...conceptGroup.groupProps} aria-label={t("conceptChipsAria")} className="flex flex-wrap gap-1.5">
                  {concepts.map((concept, index) => (
                    <button
                      key={concept.id}
                      {...conceptGroup.itemProps(index)}
                      type="button"
                      data-testid="atlas-git-concept-chip"
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
              {focusedFile ? (
                <div className="px-5 pt-3">
                  {/* A step that deleted the document holds no content to put back, so the
                      door is not drawn — but its absence is said, not left silent: the person
                      is looking at a concept and would otherwise read the missing door as a
                      missing feature (installed-app walk, 2026-09-19). The document's own
                      steps below still hold its content. */}
                  {focusedFile.status === "deleted" ? (
                    <p
                      data-testid="atlas-git-restore-absent"
                      className="text-caption leading-label text-[color:var(--color-text-quaternary)]"
                    >
                      {t("restoreAbsentDeleted")}
                    </p>
                  ) : null}
                  {focusedFile.status !== "deleted" ? (
                  <RestoreDock
                    t={t}
                    path={focusedFile.path}
                    label={t("restoreConceptDoc", { path: focusedFile.path })}
                    when={relativeTime}
                    pending={pendingDelta.get(focusedFile.path) ?? null}
                    others={Math.max(0, files.length - 1)}
                    busy={restoreBusy}
                    onRestore={onRestore}
                  />
                  ) : null}
                  <DocumentHistory
                    t={t}
                    vaultPath={vaultPath}
                    path={focusedFile.path}
                    currentHash={hash}
                    whenOf={whenOf}
                    headlineOf={headlineOf}
                    onJump={onJumpToCommit}
                  />
                </div>
              ) : null}
              {focused ? (
                <Section label={t("egoHeading")} note={t("egoHint")}>
                  <ConceptEgoCard
                    ego={egoFor(focused)}
                    t={t}
                    kindLabel={kindLabel}
                    onSelect={setFocusedConceptId}
                  />
                </Section>
              ) : null}
            </>
          ) : (
            <p className="px-5 py-6 text-label text-[color:var(--color-text-quaternary)]">
              {t("stepNoConcepts")}
            </p>
          )
        ) : (
          <>
            {/* Files are a **chooser**. Concatenating four patches leaves scroll
                position as the only indicator of which file you are reading. */}
            <ul
              data-testid="atlas-git-file-list"
              className="flex flex-none flex-col border-b border-[color:var(--color-divider)]"
            >
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    data-testid="atlas-git-commit-file"
                    /* The file list uses `aria-current` for the same reason: the
                       sibling lens directly above uses `role="tablist"` plus
                       `aria-selected`, and adding pressed here would put three
                       vocabularies on one screen. */
                    aria-current={activeFile === file.path ? "true" : undefined}
                    onClick={() => setOpenFile(file.path)}
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

            {/* A file this commit deleted has no content at this commit to restore; the door
                would only open on a refusal, so it is not drawn. The document's own history
                still lists the steps that hold its content. */}
            {activeFile ? (
              <div className="px-5 pt-3">
                {files.find((file) => file.path === activeFile)?.status !== "deleted" ? (
                <RestoreDock
                  t={t}
                  path={activeFile}
                  label={null}
                  when={relativeTime}
                  pending={pendingDelta.get(activeFile) ?? null}
                  others={Math.max(0, files.length - 1)}
                  busy={restoreBusy}
                  onRestore={onRestore}
                />
                ) : null}
                <DocumentHistory
                  t={t}
                  vaultPath={vaultPath}
                  path={activeFile}
                  currentHash={hash}
                  whenOf={whenOf}
                  headlineOf={headlineOf}
                  onJump={onJumpToCommit}
                />
              </div>
            ) : null}

            {activeDocument ? (
              /*
               * Keyed by hash and path: a new step or a new file is a new document, so the
               * reader starts over rather than showing one document's lines under another's
               * name while the read is in flight. `diff` in the key means a later commit
               * patch replaces an earlier one's fallback rather than layering on it.
               */
              <div
                key={`${hash}:${activeDocument.entry.path}:${diff === null ? "reading" : "read"}`}
                data-testid="atlas-git-commit-diff"
                className="flex min-h-0 flex-1 flex-col"
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
          </>
        )}
      </div>
    </div>
  );
}

/** One-character file status — the letter carries the meaning, not the colour. */
/**
 * Restore — this commit's content for one document, landing as an uncommitted change. Worded
 * apart from discard (review, 2026-09-19): this one is reversible from the same screen, and
 * the confirm says so; it also says when the document's own uncommitted lines would go with
 * it, and which of this commit's other documents stay as they are.
 */
function RestoreDock({
  t,
  path,
  label,
  when,
  pending,
  others,
  busy,
  onRestore,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  path: string;
  /** A lead-in naming whose document this is, or `null` when the file list already says. */
  label: string | null;
  when: string;
  pending: { added: number; removed: number } | null;
  others: number;
  busy: boolean;
  onRestore: (path: string, others: number) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-2" data-testid="atlas-git-restore-dock">
      {confirming ? (
        <div
          className="git-fade-in flex flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
          data-testid="atlas-git-restore-step"
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="atlas-git-restore-confirm"
              disabled={busy}
              onClick={() => {
                void onRestore(path, others).then((ok) => {
                  if (ok) setConfirming(false);
                });
              }}
              className={controlClass({ tone: "onAccent" })}
            >
              {busy ? t("restoreRunning") : t("restoreButton")}
            </button>
            <button
              type="button"
              data-testid="atlas-git-restore-cancel"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className={controlClass({})}
            >
              {t("cancelButton")}
            </button>
          </div>
        </div>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {label ? (
            <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
              {label}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="atlas-git-restore"
            onClick={() => setConfirming(true)}
            className={controlClass({
              shape: "link",
              size: "sm",
              tone: "muted",
              hoverInk: "strong",
              className: "text-label",
            })}
          >
            {t("restoreAction")}
          </button>
        </p>
      )}
    </div>
  );
}

/** How many of a document's other steps are read; one more tells whether older ones exist. */
const DOCUMENT_HISTORY_LIMIT = 12;

/**
 * The other steps that changed this one document — a meaning's own timeline, read from git
 * scoped to the path. Each row jumps to that step. Without this, "when else did this concept
 * change" meant scanning every row of the list for the concept's name.
 */
function DocumentHistory({
  t,
  vaultPath,
  path,
  currentHash,
  whenOf,
  headlineOf,
  onJump,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  vaultPath: string | null;
  path: string;
  currentHash: string;
  whenOf: (isoTime: string) => string;
  headlineOf: (subject: string) => string | null;
  onJump: (hash: string) => void;
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
  if (rows === null) return null;
  return (
    <section className="flex flex-col gap-1.5 pt-3" data-testid="atlas-git-document-history">
      <h3 className="flex items-baseline gap-2 text-label text-[color:var(--color-text-tertiary)]">
        {others.length > 0 ? t("docHistoryTitle") : t("docHistoryOnly")}
        {others.length > 0 ? (
          <b className="font-normal tabular-nums text-[color:var(--color-text-quaternary)]">{others.length}</b>
        ) : null}
      </h3>
      {others.length > 0 ? (
        <ul className="flex flex-col">
          {others.map((commit) => (
            <li key={commit.hash}>
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
                  className: "grid w-full grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 rounded-none px-0",
                })}
              >
                <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                  {whenOf(commit.isoTime)}
                </span>
                <span className="min-w-0 truncate text-label">{headlineOf(commit.subject) ?? commit.subject}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {older ? (
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">{t("docHistoryOlder")}</p>
      ) : null}
    </section>
  );
}

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
 * Raw patch → rows grouped **per file**.
 *
 * Why the noise is stripped (2026-08-02): `diff --git a/… b/…`,
 * `index 05d74bf..e04bf82`, `--- a/…` and `+++ b/…` precede every file, and all
 * four say one thing — **the file name**. The list above now carries that name,
 * so these are dropped outright.
 *
 * Colour is the **second** channel: the leading +/- sign stays, so a
 * colour-blind reader gets the same distinction.
 */

/**
 * Find a patch by file path. It also matches on the **path tail**, because the
 * list's paths are vault-relative while the patch's are repository-root
 * relative, so they differ at the front whenever the vault is a subfolder.
 * Exact match first, tail match second.
 */


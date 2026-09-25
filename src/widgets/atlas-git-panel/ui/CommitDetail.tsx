"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useFormatter } from "next-intl";
import { cn } from "@/shared/lib/cn";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { shortHash, stripConventionalPrefix } from "../lib/step-title";
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

/** Concept names the headline spells out before it counts the rest. */
const HEADLINE_CONCEPTS = 2;

/**
 * Does this changed file carry that concept? `matchNodeId` builds a node id as
 * `<kind>:<slug tail>`, so the **tail alone is ambiguous**: `domains/orders.md` and
 * `capabilities/orders.md` share it, and either would answer for the other — naming one
 * document after the other's concept, and opening the restore door onto the wrong file.
 * The kind is the half that tells them apart, so both halves are compared here, exactly as
 * the forward match compares them.
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
  /** What another step changed, in words: its concepts, else its documents, else its author's sentence. */
  stepTitleOf: (commit: GitCommitInfo) => string;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
}) {
  const focused = focusedConceptId ?? concepts[0]?.id ?? null;
  const format = useFormatter();
  const { state: hashState, copy: copyHash } = useCopyFeedback();
  const authored = stripConventionalPrefix(subject);
  const reason = headline ? t("stepAutoSubject", { summary: headline }) : authored;
  /*
   * Round four (2026-09-25): the headline is the step's sentence whenever a person wrote one.
   * "Payment approval, Payment service and 1 more" put a list of names and an overflow count on the screen's
   * largest line and demoted the sentence that says what the step did — and the concept chips
   * a few lines down print those same names again. Only an automatic subject, which has no
   * sentence of its own, is named by its concepts, with the reader's-language summary under it.
   */
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
      // The reader's own clock: the step happened at their local time, and no global
      // default is configured for the static export.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [format, isoTime]);

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
   * this file carries (`fileCarriesNode`), else the file name. The same reader the
   * uncommitted pane uses (owner direction B, 2026-09-19) draws it whole at this commit,
   * so a step's change and an uncommitted change read the same way.
   */
  const activeDocument = useMemo<ChangedDocument | null>(() => {
    if (!activeEntry) return null;
    const concept = concepts.find((c) => fileCarriesNode(activeEntry, c.id));
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
    return files.find((file) => fileCarriesNode(file, focused)) ?? null;
  }, [files, focused]);

  /*
   * One door per document, drawn in one place in both lenses: on the heading of the
   * document's own history. A step that deleted the document holds no content to put back,
   * so the door is not drawn — but its absence is said, not left silent: the person would
   * otherwise read the missing door as a missing feature (installed-app walk, 2026-09-19).
   */
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
        // Keyed by document: an armed confirm must not survive a file change and re-aim at
        // another document (interaction seat, 2026-09-19).
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

  return (
    <div
      className="git-fade-in flex min-h-0 flex-1 flex-col"
      data-testid="atlas-git-history-detail"
    >
      {/*
        Identity — survives either lens, and is the pane's one headline (review 2026-09-25).
        It was a 14px line, the same size as every list row, under a 23px page title and above
        a 23px file title: the thing the person picked was the smallest heading on screen. The
        page title stepped down to a destination label, the file title inside a step stepped
        down to `text-title`, and this line took the display step.

        It names the step the way its list row does — concepts first — so the row and the
        pane agree on what was picked. The author's words follow as the second line without
        their conventional-commit code, and the meta line carries a short id to copy and a
        date in the reader's locale instead of a 40-character hash and an ISO timestamp.

        Round three (2026-09-25): the page title went back to the display step every
        destination's h1 uses, which left two 23px lines 50px apart and no winner. The
        selection now wins by size, one ramp step above the page title — `text-hero`, the
        step the Insights brief headline already takes under its own display-size page title
        (BriefTab.tsx) — at the signature weight, so the larger line does not also shout.
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
            /* A lens with nothing in it is a count, not a place to go (review 2026-09-25:
               "Concepts changed 0" stayed pressable and opened onto one empty sentence).
               It stays in the strip, so the zero is still said, but it cannot be chosen. */
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
              {/*
                Card first, then the document's own timeline (round three, 2026-09-25). The
                card names the concept and where it is written down — once. The line that used
                to sit above the history ("This concept's document capabilities/checkout.md")
                printed the same slug the card's two fact cells printed again, three times on
                the screen's main view; it is gone, and the restore door moved onto the
                history's own heading, beside the versions it chooses between. The files lens
                draws the door in exactly the same place.
              */}
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
              {focusedFile ? (
                <div className="px-5 pb-4">
                  <DocumentHistory
                    t={t}
                    vaultPath={vaultPath}
                    path={focusedFile.path}
                    currentHash={hash}
                    whenOf={whenOf}
                    stepTitleOf={stepTitleOf}
                    onJump={onJumpToCommit}
                    action={restoreDoor(focusedFile)}
                  />
                </div>
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
            {/* Subject first, then its history (round four, 2026-09-25). The document's other
                steps and the restore door sat between the chooser and the document they refer
                to, so the timeline was read before its subject and the reader's own title sat
                further down as a smaller heading. The reader now follows its chooser, and the
                history with its door closes the document — the door restores what was just
                read. The concepts lens keeps the same order: card, then history. */}
            {activeEntry ? (
              <div className="px-5 pb-4">
                <DocumentHistory
                  t={t}
                  vaultPath={vaultPath}
                  path={activeEntry.path}
                  currentHash={hash}
                  whenOf={whenOf}
                  stepTitleOf={stepTitleOf}
                  onJump={onJumpToCommit}
                  action={restoreDoor(activeEntry)}
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
  const [confirming, setConfirming] = useState(false);
  return (
    // Armed, the confirm takes the heading row's full width, under the heading it belongs to.
    <div className={cn("flex min-w-0 flex-col gap-2", confirming && "basis-full")} data-testid="atlas-git-restore-dock">
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
          <button
            type="button"
            data-testid="atlas-git-restore"
            onClick={() => setConfirming(true)}
            /*
             * Measured 2026-09-20: in quaternary ink this door read as one more caption, so
             * it carries `secondary` ink. `md` is 11px on the shared 32px height, and the chip
             * shape's touch floor still gives a finger 44px (review 2026-09-25).
             *
             * Round three (2026-09-25): a transparent border left it a bare word at the end of
             * a line. It wears the resting border the concept chips above it wear, so the
             * pane's controls share one grammar, and it is no longer mistaken for text.
             */
            className={controlClass({
              shape: "chip",
              size: "md",
              tone: "secondary",
              hoverInk: "strong",
              hoverBorder: "strong",
              className: "self-start border-[color:var(--color-border-soft)]",
            })}
          >
            {t("restoreAction")}
          </button>
      )}
    </div>
  );
}

/** How many of a document's other steps are read; one more tells whether older ones exist. */
const DOCUMENT_HISTORY_LIMIT = 12;
/** Rows a document's history shows before "N more". */
const DOCUMENT_HISTORY_PREVIEW = 3;

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
  stepTitleOf,
  onJump,
  action = null,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  vaultPath: string | null;
  path: string;
  currentHash: string;
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
  /*
   * Three by default (review 2026-09-25): eleven 28px rows pushed the concept's ego drawing,
   * the richest part of this pane, below the fold on a 949px window. The rest are one press
   * away and counted, never silently dropped.
   */
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  /*
   * "Show fewer" leaves the way "Show N more" arrived (round four, 2026-09-25): the rows it
   * removes fade out on the same fast curve before the list shortens, instead of vanishing in
   * one frame. Opacity only, so the reduced-motion reading is the same fade without the
   * stagger; where the Web Animations API is missing, the list simply shortens.
   */
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
  // Until the history is read (or where it cannot be, on the web) the door still stands.
  if (rows === null) return action ? <div className="flex pt-4">{action}</div> : null;
  const shown = expanded ? others : others.slice(0, DOCUMENT_HISTORY_PREVIEW);
  const hidden = others.length - shown.length;
  return (
    <section className="flex flex-col gap-1 pt-4" data-testid="atlas-git-document-history">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="flex items-baseline gap-2 text-label text-[color:var(--color-text-tertiary)]">
          {others.length > 0 ? t("docHistoryTitle") : t("docHistoryOnly")}
          {others.length > 0 ? (
            <b className="font-normal tabular-nums text-[color:var(--color-text-quaternary)]">{others.length}</b>
          ) : null}
        </h3>
        {action}
      </div>
      {others.length > 0 ? (
        <ul ref={listRef} className="flex flex-col">
          {shown.map((commit, index) => (
            <li
              key={commit.hash}
              data-extra={index >= DOCUMENT_HISTORY_PREVIEW ? "true" : undefined}
              /* "Show N more" was a hard cut (review 2026-09-25). The rows it adds arrive on
                 the screen's one arrival curve, staggered and capped at eight like the step
                 list; under reduced motion they crossfade together with no stagger. The first
                 three rows were already there and do not replay. */
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
                  /* The time column is the list's own `--git-when-w`, so a step reads with the
                     same rhythm here as on the left; the old 6rem left a 93px hole before the
                     name. */
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


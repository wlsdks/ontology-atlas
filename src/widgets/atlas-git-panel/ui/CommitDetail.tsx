"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { controlClass } from "@/shared/ui";
import type { GitChangeEntry } from "@/shared/lib/tauri-git";
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
 * (「커밋 이력이 탭 뒤에 숨지 않는다」 — commit history never hides behind a tab).
 *
 * **Here what varies is not state but lens.** 「개념」 (concepts) and 「파일」
 * (files) are two ways of looking at *one already-chosen step*, and identity
 * stays above the tabs so it survives either lens. What hides is the
 * presentation, not a fact.
 *
 * Measurement forced the switch: five sections stacked in one column turned the
 * right-hand column into a 2,000px scroll, and 「바뀐 내용」 (what changed)
 * concatenated four files' patches, so which file you were reading was decided
 * **by scroll position alone**. Owner: *"너무 많은걸 스크롤로 다 표현하려는것같긴 해서"*
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
  hash,
  isoTime,
  relativeTime,
  subject,
  concepts,
  files,
  diff,
  focusedConceptId,
  setFocusedConceptId,
  egoFor,
  kindLabel,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  hash: string;
  isoTime: string;
  relativeTime: string;
  subject: string;
  concepts: readonly CommitConcept[];
  files: readonly GitChangeEntry[];
  /** This step's patch. `null` until read, empty string when there is none. */
  diff: string | null;
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

  // Lens and chosen file follow the step. Inheriting another step's selection
  // leaves the reader asking why they are looking at this.
  useEffect(() => {
    setLens(concepts.length > 0 ? "concepts" : "files");
    setOpenFile(null);
  }, [hash, concepts.length]);

  const perFile = useMemo(() => splitDiffByFile(diff ?? ""), [diff]);
  const activeFile = openFile ?? files[0]?.path ?? null;
  const activePatch = activeFile ? findPatch(perFile, activeFile) : null;

  return (
    <div
      className="git-fade-in flex min-h-0 flex-1 flex-col"
      data-testid="atlas-git-history-detail"
    >
      {/* Identity — survives either lens. */}
      <header className="flex flex-none flex-col gap-1 px-5 pt-4 pb-3">
        <p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {subject}
        </p>
        <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
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
                      <TopologyV2KindGlyph kind={concept.kind} size={12} />
                      {concept.label}
                    </button>
                  ))}
                </div>
              </div>
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

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-5 py-4">
              <h3 className="flex-none text-label text-[color:var(--color-text-tertiary)]">
                {t("changedLines")}
              </h3>
              {diff === null ? (
                <p className="text-caption text-[color:var(--color-text-quaternary)]">
                  {t("diffLoading")}
                </p>
              ) : !activePatch || activePatch.length === 0 ? (
                <p className="text-caption text-[color:var(--color-text-quaternary)]">
                  {t("diffEmpty")}
                </p>
              ) : (
                <div
                  key={activeFile}
                  data-testid="atlas-git-commit-diff"
                  className="git-fade-in min-h-0 flex-1 overflow-auto rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-1.5 font-mono text-caption leading-label"
                >
                  {activePatch.map((row, index) => (
                    <p key={index} className={diffRowClass(row.kind)}>
                      {row.text === "" ? " " : row.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
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

type DiffRow = { kind: "hunk" | "add" | "del" | "ctx"; text: string };

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
function splitDiffByFile(patch: string): { path: string; rows: DiffRow[] }[] {
  const blocks: { path: string; rows: DiffRow[] }[] = [];
  let current: { path: string; rows: DiffRow[] } | null = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const to = line.slice(line.indexOf(" b/") + 3);
      current = { path: to || line, rows: [] };
      blocks.push(current);
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename ")
    ) {
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) current.rows.push({ kind: "hunk", text: line });
    else if (line.startsWith("+")) current.rows.push({ kind: "add", text: line });
    else if (line.startsWith("-")) current.rows.push({ kind: "del", text: line });
    else current.rows.push({ kind: "ctx", text: line });
  }
  for (const block of blocks) {
    while (block.rows.length > 0 && block.rows[block.rows.length - 1].text.trim() === "") {
      block.rows.pop();
    }
  }
  return blocks;
}

/**
 * Find a patch by file path. It also matches on the **path tail**, because the
 * list's paths are vault-relative while the patch's are repository-root
 * relative, so they differ at the front whenever the vault is a subfolder.
 * Exact match first, tail match second.
 */
function findPatch(
  blocks: { path: string; rows: DiffRow[] }[],
  path: string,
): DiffRow[] | null {
  const exact = blocks.find((b) => b.path === path);
  if (exact) return exact.rows;
  const tail = blocks.find((b) => b.path.endsWith(path) || path.endsWith(b.path));
  return tail?.rows ?? null;
}

function diffRowClass(kind: DiffRow["kind"]): string {
  const base = "px-3 whitespace-pre-wrap break-all";
  if (kind === "hunk") return cn(base, "mt-1 text-[color:var(--color-text-quaternary)]");
  if (kind === "add") {
    return cn(
      base,
      "bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]",
    );
  }
  if (kind === "del") {
    return cn(base, "bg-[color:var(--color-danger-a10)] text-[color:var(--color-danger-text)]");
  }
  return cn(base, "text-[color:var(--color-text-tertiary)]");
}

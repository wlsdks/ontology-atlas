"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRovingRows } from "@/shared/lib/use-roving-rows";
import { stepRowMotionClass, stepRowUsesStagger } from "../lib/step-row-motion";
import { stepFileNames, stripConventionalPrefix, humanizeStepSubject } from "../lib/step-title";
import { describeSnapshotSubject } from "@/shared/lib/atlas-git-record";
import type { GitCommitInfo } from "@/shared/lib/tauri-git";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { controlClass } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import type { Translator } from "../lib/translator";
import type { WorkbenchSelection } from "../model/use-workbench-selection";

/** Stagger cap — the first 8 rows arrive in order and everything after shares one frame. */
const MAX_STAGGER_INDEX = 8;

function staggerStyle(index: number): React.CSSProperties {
  return { "--git-row-index": Math.min(index, MAX_STAGGER_INDEX) } as React.CSSProperties;
}

const STEP_CONCEPT_SLOTS = 2;

/**
 * A step's concept names, as many as fit whole: two only when there are exactly two and both
 * fit on the painted row (measured, since the column follows the window), else one whole name
 * and a count.
 */
function StepConceptNames({
  concepts,
  more,
}: {
  concepts: readonly { id: string; label: string; kind: string }[];
  more: (count: number) => string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lastWidth = useRef(0);
  const pair = concepts.length === STEP_CONCEPT_SLOTS;
  useLayoutEffect(() => {
    if (!pair || collapsed || !ref.current) return;
    const cut = [...ref.current.querySelectorAll<HTMLElement>("[data-step-concept-name]")].some(
      (name) => name.scrollWidth > name.clientWidth + 1,
    );
    // A truncation is only knowable after layout; switching before paint keeps the cut pair
    // from ever showing.
    if (cut) setCollapsed(true);
  }, [pair, collapsed, concepts]);
  useEffect(() => {
    const node = ref.current;
    if (!pair || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (lastWidth.current && width > lastWidth.current + 8) setCollapsed(false);
      lastWidth.current = width;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pair]);
  const slots = concepts.length > STEP_CONCEPT_SLOTS || collapsed ? 1 : STEP_CONCEPT_SLOTS;
  return (
    <span ref={ref} className="flex min-w-0 flex-1 items-center gap-2.5">
      {concepts.slice(0, slots).map((concept) => (
        <span key={concept.id} className="inline-flex min-w-0 shrink items-center gap-1.5">
          <OntologyMapKindGlyph kind={concept.kind} size={12} />
          <span className="truncate" title={concept.label} data-step-concept-name="">{concept.label}</span>
        </span>
      ))}
      {concepts.length > slots ? (
        <span
          className="shrink-0 text-label font-normal text-[color:var(--color-text-quaternary)]"
          title={concepts.slice(slots).map((concept) => concept.label).join(", ")}
        >
          {more(concepts.length - slots)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The step list's scroll box: while it has room for another row and older steps exist it
 * reads the next page itself, so it is never half empty.
 */
export function StepListScroller({
  hasMore,
  busy,
  onMore,
  className,
  children,
}: {
  hasMore: boolean;
  busy: boolean;
  onMore: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(false);
  /*
   * Which edges hide rows; each such edge fades by `--tabbar-edge-fade`, the mask other
   * scrolling lists use, so hidden rows are visible as such.
   */
  const [edge, setEdge] = useState({ top: false, bottom: false });
  const readEdge = useCallback(() => {
    const el = ref.current;
    if (!el || el.clientHeight < 1) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
    setEdge((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => {
      readEdge();
      // An unmeasured box (a test DOM, a hidden panel) has no room to fill.
      if (el.clientHeight < 1) return setRoomy(false);
      const rowHeightPx = Number.parseFloat(getComputedStyle(el).getPropertyValue("--git-row-h")) || 40;
      setRoomy(el.scrollHeight - el.clientHeight < rowHeightPx);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    const list = el.firstElementChild;
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [readEdge]);
  useEffect(() => {
    if (roomy && hasMore && !busy) onMore();
  }, [roomy, hasMore, busy, onMore]);
  const fade = "var(--tabbar-edge-fade)";
  const mask =
    edge.top && edge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`
      : edge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${fade}), transparent 100%)`
        : edge.top
          ? `linear-gradient(to bottom, transparent 0, black ${fade})`
          : undefined;
  return (
    <div
      ref={ref}
      data-testid="atlas-git-steps-scroll"
      data-edge-bottom={edge.bottom ? "true" : undefined}
      onScroll={readEdge}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className={cn("min-h-0 max-xl:overflow-y-auto xl:flex-1 xl:overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}

/**
 * One list row: a full-width table row whose 2px indigo edge marks selection (not a railed
 * card, which `design.md` forbids).
 */
const STEP_ROW =
  "grid w-full grid-cols-[var(--git-when-w)_minmax(0,1fr)] min-h-[var(--git-row-h)] items-center gap-x-3 gap-y-0.5 border-b border-l-2 border-b-[color:var(--color-divider)] py-2 pl-3.5 pr-4 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] [&>*:first-child]:row-span-2 [&>*:nth-child(3)]:col-start-2";

export function StepList({
  t,
  history,
  hasMore,
  moreBusy,
  onMore,
  concepts,
  settledHash,
  pendingCount,
  selection,
  setSelection,
  ahead,
  behind,
  upstream,
  onRemoteAction,
}: {
  t: Translator;
  history: GitCommitInfo[];
  /** Older steps exist beyond the list — the list ends with a row that fetches them, never silently. */
  hasMore: boolean;
  moreBusy: boolean;
  onMore: () => void;
  /** Step hash → the vault concepts it changed, from per-commit kind and slug matched to the graph. */
  concepts: ReadonlyMap<string, readonly { id: string; label: string; kind: string }[]>;
  /** Hash of the commit just recorded — only that one row gets the settle ramp. */
  settledHash?: string | null;
  /** Number of uncommitted changes; at 0 the row is not drawn. */
  pendingCount: number;
  selection: WorkbenchSelection;
  setSelection: (v: WorkbenchSelection) => void;
  /** Number of steps not yet pushed — they are the top N of the list. */
  ahead: number | null;
  /** Steps that exist only on the remote. They are not in local history, so this is **guidance, not a row**. */
  behind: number | null;
  upstream: string | null;
  onRemoteAction: (kind: "fetch" | "pull" | "push") => void;
}) {
  /*
   * A jump from a document's history can select a row far below the fold. The row is the
   * proof that the selection landed, so it is brought into view; `nearest` never moves a row
   * that is already visible, so an ordinary click does not scroll.
   */
  const revealSelectedRow = useCallback((node: HTMLButtonElement | null) => {
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, []);
  /*
   * One tab stop with arrows between rows, the Library lists' hook; Enter or Space is the row's
   * click, so selection stays a deliberate press.
   */
  const rowCount =
    (behind && behind > 0 ? 1 : 0) + (pendingCount > 0 ? 1 : 0) + history.length + (hasMore ? 1 : 0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const roving = useRovingRows({ count: rowCount, listRef });
  let rowIndex = 0;
  const rowProps = () => {
    const index = rowIndex++;
    return {
      "data-row-index": index,
      tabIndex: roving.tabIndexOf(index),
      onFocus: () => roving.onRowFocus(index),
    };
  };
  if (history.length === 0) {
    return (
      <div className="flex flex-col gap-1 px-4 py-3">
        <p className="text-label text-[color:var(--color-text-tertiary)]">{t("historyEmpty")}</p>
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("historyEmptyHint")}
        </p>
      </div>
    );
  }

  /*
   * No tabs: remote-only, uncommitted and unpushed are stretches of one timeline, separated
   * by boundaries (a test holds that history never hides behind a tab).
   */
  const unpushed = Math.max(0, Math.min(ahead ?? 0, history.length));

  return (
    <ul data-testid="atlas-git-steps" className="flex flex-col" ref={listRef} onKeyDown={roving.onKeyDown}>
      {behind && behind > 0 ? (
        <li>
          <button
            type="button"
            data-testid="atlas-git-behind-row"
            {...rowProps()}
            onClick={() => onRemoteAction("pull")}
            className={cn(STEP_ROW, "border-l-transparent")}
          >
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("remoteOnlyWhen")}
            </span>
            <span className="truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("remoteOnlyTitle", { count: behind })}
            </span>
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("remoteOnlyHint")}
            </span>
          </button>
        </li>
      ) : null}
      {/* Uncommitted changes use the commit row grammar, marked by a dashed line and "now". */}
      {pendingCount > 0 ? (
        <li>
          <button
            type="button"
            data-testid="atlas-git-pending-row"
            {...rowProps()}
            /*
             * The `aria-current` attribute, not pressed: this row marks what the detail shows, and
             * the sibling rows already use `aria-expanded`.
             */
            aria-current={selection.kind === "pending" ? "true" : undefined}
            onClick={() => setSelection({ kind: "pending" })}
            className={cn(STEP_ROW, "border-l-dashed border-l-[color:var(--color-indigo-a46)] aria-[current=true]:border-l-[color:var(--color-indigo-brand)] aria-[current=true]:bg-[color:var(--color-overlay-2)]")}
          >
            <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {t("pendingNow")}
            </span>
            <span className="truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("changesTitle")}
            </span>
            {/* Tertiary ink, since quaternary on a selected row's overlay-2 falls below contrast. */}
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("pendingHint", { count: pendingCount })}
            </span>
          </button>
        </li>
      ) : null}
      {history.map((commit, index) => {
        const summary = describeSnapshotSubject(commit.subject);
        const human = humanizeStepSubject(t, commit.subject);
        const headline = human ?? stripConventionalPrefix(commit.subject);
        /*
         * The why column: a person's subject, or for an automatic subject its counts in the
         * reader's language instead of the raw snapshot string.
         */
        const why = human ? t("stepAutoSubject", { summary: human }) : stripConventionalPrefix(commit.subject);
        const stepConcepts = concepts.get(commit.hash) ?? [];
        const names = summary.slugs.join(", ");
        const trail = summary.overflow > 0 ? t("moreSlugs", { count: summary.overflow }) : "";
        const expanded = selection.kind === "commit" && selection.hash === commit.hash;
        // There are **two** boundaries: the head of the unpushed stretch, and the point it draws level with the remote.
        const boundary =
          unpushed > 0 && index === 0
            ? t("sectionUnpushed", { count: unpushed })
            : unpushed > 0 && index === unpushed
              ? t("sectionSynced", { upstream: upstream ?? "" })
              : null;
        return (
          <Fragment key={`row-${commit.hash}`}>
          {boundary ? (
            <li
              aria-hidden
              data-testid="atlas-git-section"
              className="flex items-center gap-2.5 px-4 pt-3 pb-1.5 text-caption text-[color:var(--color-text-quaternary)]"
            >
              <span className="truncate">{boundary}</span>
              <i className="h-px min-w-4 flex-1 bg-[color:var(--color-divider)]" />
            </li>
          ) : null}
          <li
            className={stepRowMotionClass(commit.hash, settledHash)}
            style={stepRowUsesStagger(commit.hash, settledHash) ? staggerStyle(index) : undefined}
          >
            <button
              type="button"
              data-testid="atlas-git-history-item"
              {...rowProps()}
              ref={expanded ? revealSelectedRow : undefined}
              aria-expanded={expanded}
              title={t("stepSelectHint")}
              onClick={() => setSelection({ kind: "commit", hash: commit.hash })}
              className={cn(STEP_ROW, "border-l-transparent aria-expanded:border-l-[color:var(--color-indigo-brand)] aria-expanded:bg-[color:var(--color-overlay-2)]")}
            >
              <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                {commit.relativeTime}
              </span>
              {/* The subject is the concept; a step without one falls back to the summary or raw subject. */}
              <span className="flex min-w-0 items-center gap-2.5 truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {stepConcepts.length > 0 ? (
                  <>
                    {/* Truncated, never wrapped, so a long name cannot change the row's height
                        (`forbidden.md`); the full name stays recoverable. */}
                    <StepConceptNames
                      concepts={stepConcepts}
                      more={(count) => t("moreSlugs", { count })}
                    />
                  </>
                ) : (
                  <span className="truncate" title={commit.subject}>{headline}</span>
                )}
              </span>
              <span
                className="truncate text-label text-[color:var(--color-text-tertiary)]"
                title={stepConcepts.length > 0 ? why : undefined}
              >
                {stepConcepts.length > 0
                  ? why
                  : names && trail
                    ? `${names} · ${trail}`
                    : /* Without concepts or a summary, the files the step touched are the reason. */
                      names || trail || stepFileNames(commit.files, (count) => t("moreSlugs", { count })) || " "}
              </span>
            </button>
          </li>
          </Fragment>
        );
      })}
      {/*
        The list ends with a fact: a row that fetches older steps in place, or the folder's first
        step.
      */}
      {hasMore ? (
        <li className="grid grid-cols-[var(--git-when-w)_minmax(0,1fr)] items-center gap-3 border-b border-[color:var(--color-divider)] px-4 py-1.5">
          <span aria-hidden />
          <button
            type="button"
            data-testid="atlas-git-history-more"
            {...rowProps()}
            disabled={moreBusy}
            onClick={onMore}
            className={controlClass({
              shape: "row",
              size: "sm",
              tone: "muted",
              hoverInk: "strong",
              hoverSurface: "lift",
              className: "justify-self-start -ml-2 text-[color:var(--color-text-tertiary)]",
            })}
          >
            {moreBusy ? t("historyMoreBusy") : t("historyMore")}
          </button>
        </li>
      ) : (
        <li
          data-testid="atlas-git-history-end"
          className="px-4 pt-3 pb-2 text-caption text-[color:var(--color-text-quaternary)]"
        >
          {t("historyEnd")}
        </li>
      )}
    </ul>
  );
}

"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { controlClass } from "@/shared/ui";
import type { GitCommitInfo } from "@/shared/lib/git/tauri-git";
import {
  DOCUMENT_HISTORY_PREVIEW,
  motionDurationMs,
  visibleDocumentHistory,
} from "../../lib/document-history-window";
import type { CopyTranslate } from "../../lib/translator";
import { useDocumentHistoryRows } from "../../model/use-document-history-rows";

/**
 * The other steps that changed this one document, read from git scoped to the path; each
 * row jumps to that step.
 */
export function DocumentHistory({
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
  t: CopyTranslate;
  vaultPath: string | null;
  path: string;
  currentHash: string;
  /**
   * Whether the step on screen changed this document. When it did not, the list is the steps
   * that did, and says nothing about this one: "this is the only step" would be false.
   */
  changedHere?: boolean;
  whenOf: (isoTime: string) => string;
  stepTitleOf: (commit: GitCommitInfo) => string;
  onJump: (hash: string) => void;
  action?: React.ReactNode;
}) {
  const { rows, older } = useDocumentHistoryRows(vaultPath, path);
  const others = useMemo(() => (rows ?? []).filter((commit) => commit.hash !== currentHash), [rows, currentHash]);
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
    const duration = motionDurationMs(style.getPropertyValue("--motion-fast"));
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
  const { shown, hidden, showToggle, showOlderNote } = visibleDocumentHistory(others, expanded, older);
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
      {showToggle ? (
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
      {showOlderNote ? (
        <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">{t("docHistoryOlder")}</p>
      ) : null}
    </section>
  );
}

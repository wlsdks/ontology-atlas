"use client";

import { useMemo } from "react";
import { useFormatter } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { controlClass } from "@/shared/ui";
import { commitDateOptions, commitHeadlineLines } from "../../lib/commit-headline";
import type { CommitConcept } from "../../lib/commit-documents";
import { shortHash } from "../../lib/step-title";
import type { CopyTranslate } from "../../lib/translator";

/** The step's headline and byline, its copyable id and when it happened. */
export function CommitDetailHeader({
  t,
  subject,
  headline,
  concepts,
  hash,
  isoTime,
  relativeTime,
}: {
  t: CopyTranslate;
  subject: string;
  headline: string | null;
  concepts: readonly CommitConcept[];
  hash: string;
  isoTime: string;
  relativeTime: string;
}) {
  const format = useFormatter();
  const { state: hashState, copy: copyHash } = useCopyFeedback();
  const { title, byline } = commitHeadlineLines({ t, subject, headline, concepts });
  const dateLabel = useMemo(() => {
    const at = new Date(isoTime);
    if (Number.isNaN(at.getTime())) return "";
    // The reader's local time; the static export configures no global default.
    return format.dateTime(
      at,
      commitDateOptions(at, new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone),
    );
  }, [format, isoTime]);

  return (
    <header className="flex flex-none flex-col gap-1.5 px-4 pt-5 pb-4">
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
          {hashState === "copied" ? t("copied") : shortHash(hash)}
        </button>
        <time dateTime={isoTime} className="tabular-nums">
          {dateLabel}
        </time>
        <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
        <span>{relativeTime}</span>
      </p>
    </header>
  );
}

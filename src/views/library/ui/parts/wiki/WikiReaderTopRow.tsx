"use client";

import { useFormatter, type useTranslations } from "next-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { StateBadge } from "../index-column/StateBadge";
import { wikiStatusLabel, writerLabel } from "../../../lib/wiki/writer-label";

/** The day the page records it was written: `compiled_at`, else the file's own time. */
function writtenAt(doc: VaultDoc): Date | null {
  const recorded = doc.frontmatter.compiled_at;
  const value = typeof recorded === "string" ? Date.parse(recorded) : Number.NaN;
  if (Number.isFinite(value)) return new Date(value);
  return doc.mtime ? new Date(doc.mtime) : null;
}

/**
 * The open page's own facts for the row above it: its state, then who wrote it and when. The
 * folder's counts are not here; they live on the Sources home and in Check results.
 */
export function WikiReaderTopRow({ doc, sourceChanged, t }: {
  doc: VaultDoc;
  /** A source this page cites changed after the page recorded its hash. */
  sourceChanged: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const format = useFormatter();
  const status = typeof doc.frontmatter.status === "string" ? doc.frontmatter.status : null;
  const createdBy = typeof doc.frontmatter.created_by === "string" ? doc.frontmatter.created_by : null;
  const statusWord = wikiStatusLabel(status, t);
  const when = writtenAt(doc);
  const byline = [writerLabel(createdBy, t), when ? format.dateTime(when, { dateStyle: "medium" }) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div data-testid="wiki-reader-top-row" className="flex min-w-0 items-center gap-2 text-label leading-label">
      {statusWord ? <StateBadge tone="neutral" testId="wiki-reader-status">{statusWord}</StateBadge> : null}
      {sourceChanged ? <StateBadge tone="warning" testId="wiki-reader-source-changed">{t("wikiReader.sourceChanged")}</StateBadge> : null}
      <span data-testid="wiki-reader-byline" className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">
        {byline}
      </span>
    </div>
  );
}

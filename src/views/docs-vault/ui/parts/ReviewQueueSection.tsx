"use client";

import type { useTranslations } from "next-intl";
import { CircleDashed, FileQuestion, UserRoundPen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import type { ReviewQueueRow } from "@/entities/docs-vault";

/**
 * What waits on a person, at the top of the document list; drawn only when non-empty.
 * The `raised` row (an agent handed it over, with its own sentence) and `changed-since-review`
 * (recomputed from the file, `docs/benchmark/FINDINGS-2026-09-02-review-marks.md`) stay separate rows. No row for
 * unreviewed nodes: absence stays unknown (`docs/DECISIONS.md`, 2026-08-22 record 93 §5).
 */
export interface ReviewQueueSectionProps {
  rows: ReviewQueueRow[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  t: ReturnType<typeof useTranslations<"vaultWidgets.parts.sidebar">>;
}

export function ReviewQueueSection({ rows, selectedSlug, onSelect, t }: ReviewQueueSectionProps) {
  if (rows.length === 0) return null;
  const raised = rows.filter((row) => row.reason === "raised");
  const changed = rows.filter((row) => row.reason === "changed-since-review");
  // An approval nobody can check is neither fine nor drifted, so it is its own group.
  const unverifiable = rows.filter((row) => row.reason === "unverifiable");

  return (
    <section
      data-testid="docs-review-queue"
      className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1"
    >
      {raised.length > 0 ? (
        <ReviewGroup
          testId="docs-review-queue-raised"
          icon={<UserRoundPen size={ICON_SIZE.sm} aria-hidden />}
          label={t("review.raisedHeader", { count: raised.length })}
          rows={raised}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
        />
      ) : null}
      {unverifiable.length > 0 ? (
        <ReviewGroup
          testId="docs-review-queue-unverifiable"
          icon={<FileQuestion size={ICON_SIZE.sm} aria-hidden />}
          label={t("review.unverifiableHeader", { count: unverifiable.length })}
          rows={unverifiable}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          describe={() => t("review.unverifiablePlain")}
        />
      ) : null}
      {changed.length > 0 ? (
        <ReviewGroup
          testId="docs-review-queue-changed"
          icon={<CircleDashed size={ICON_SIZE.sm} aria-hidden />}
          label={t("review.changedHeader", { count: changed.length })}
          rows={changed}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          describe={(row) =>
            row.reviewedBy ? t("review.changedBy", { name: row.reviewedBy }) : t("review.changedPlain")
          }
        />
      ) : null}
    </section>
  );
}

function ReviewGroup({
  testId,
  icon,
  label,
  rows,
  selectedSlug,
  onSelect,
  describe,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  rows: ReviewQueueRow[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  describe?: (row: ReviewQueueRow) => string;
}) {
  return (
    <div data-testid={testId}>
      <h3 className="flex flex-none items-center gap-1.5 px-3 pb-1.5 pt-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {icon}
        {label}
      </h3>
      <ul className="px-0.5 pb-1">
        {rows.map((row) => {
          const active = row.slug === selectedSlug;
          const detail = row.note ?? describe?.(row);
          return (
            <li key={row.slug}>
              <button
                type="button"
                onClick={() => onSelect(row.slug)}
                aria-current={active ? "true" : undefined}
                className={controlClass({
                  shape: "row",
                  size: "md",
                  tone: "muted",
                  active,
                  hoverSurface: "lift",
                  className: "flex-col items-start gap-0.5 rounded-chip py-1.5",
                })}
              >
                <span
                  className={cn(
                    "w-full truncate text-body",
                    active
                      ? "text-[color:var(--color-text-primary)]"
                      : "text-[color:var(--color-text-secondary)]",
                  )}
                >
                  {row.title}
                </span>
                {detail ? (
                  // Two lines: one truncated line at 280px cuts the sentence that makes the row triageable.
                  <span className="line-clamp-2 w-full text-caption text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                    {detail}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

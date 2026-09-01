"use client";

import type { useTranslations } from "next-intl";
import { CircleDashed, UserRoundPen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import type { ReviewQueueRow } from "@/entities/docs-vault";

/**
 * What a person still has to look at, at the top of the document list.
 *
 * **Why this is the first thing in the sidebar.** Docs used to open on whatever
 * document sorted first — measured 2026-09-01, a 51-word definition in a
 * 1168×856 canvas that was 62% empty. Everything it showed, the map already
 * showed. This section is the one question no other surface answers: *what is
 * waiting on me.*
 *
 * **Two rows, never merged into one count.** They are different work:
 *
 *   - `raised` — an agent could not settle it and handed it over. Its own
 *     sentence says what has to be decided, so the row can be triaged without
 *     opening anything.
 *   - `changed-since-review` — a person approved this node and something
 *     rewrote it afterwards. Nobody reported that; it is recomputed from the
 *     file, so it appears even when the change came through a tool Atlas never
 *     saw (`docs/benchmark/FINDINGS-2026-09-02-review-marks.md`).
 *
 * **There is no third row for unreviewed nodes.** 80 of this repository's own 94
 * carry `created_by: agent:unknown`; a queue counting them opens on a wall of
 * hundreds and gets closed once. Absence stays unknown — the same invariant
 * `created_by` holds (`docs/DECISIONS.md`, 2026-08-22 record 93 §5).
 *
 * When both lists are empty the section is not drawn at all. A permanently
 * present "0 waiting" panel spends the top of the list on nothing.
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
      {/* Same engraved caption the sibling sections use (`SectionLabel` in
          `DocsSidebarBody`); this one carries an icon because two groups sit
          under one border and the label alone would read as one list. */}
      <h3 className="flex flex-none items-center gap-1.5 px-3 pb-1.5 pt-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {icon}
        {label}
      </h3>
      <ul className="px-1 pb-1">
        {rows.map((row) => {
          const active = row.slug === selectedSlug;
          // The agent's own sentence is the row's second line. Without it a person
          // has to open every row to find out which one is theirs to answer —
          // triage is the whole point of the list.
          const detail = row.note ?? describe?.(row);
          return (
            <li key={row.slug}>
              <button
                type="button"
                onClick={() => onSelect(row.slug)}
                aria-current={active ? "true" : undefined}
                // The shared `row` control owns the touch floor, width, and
                // transition. Only the second line is this row's own: the
                // agent's sentence sits under the title, so the axis flips to
                // column and the primitive's `items-center` with it.
                className={controlClass({
                  shape: "row",
                  size: "md",
                  tone: "muted",
                  active,
                  // `lift` on a row emits exactly the hover surface this list
                  // wants, and `active` its selected surface. Writing either by
                  // hand would put a fourth opinion about "selected" on a screen
                  // that already has three lists.
                  hoverSurface: "lift",
                  className: "flex-col items-start gap-0.5 rounded-chip px-2 py-1.5",
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
                  // Two lines, not one truncated line. The agent's sentence is what
                  // makes the row triageable without opening it; measured at the
                  // 280px sidebar, one line cut "…is a legal ret…" and sent the
                  // reader into the document to learn what the row already knew.
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

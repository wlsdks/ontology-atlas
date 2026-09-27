import { useLocale, useTranslations } from "next-intl";
import { CircleDashed, FileText, Network, UserRoundPen } from "lucide-react";
import {
  buildTopologyDeeplinkForDoc,
  type ReviewQueueRow,
  type VaultDoc,
  isWikiPage,
} from "@/entities/docs-vault";
import { Link } from "@/i18n/navigation";
import { estimateReadingMinutes } from "./reading-minutes";
import { controlClass } from '@/shared/ui/control-class';
import { badgeClass } from '@/shared/ui/badge-class';

const actionLinkClass = controlClass({
  shape: "chip",
  size: "md",
  tone: "muted",
  className:
    "min-h-8 border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] underline-offset-2 transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:border-[color:var(--color-indigo-line-a54)] active:bg-[color:var(--color-indigo-line-a13)] motion-reduce:transform-none",
});

export function DocMetaBar({
  doc,
  reviewRow,
  review,
}: {
  doc: VaultDoc;
  /** Passed in so the sidebar and the document share one drift verdict (a hash comparison). */
  reviewRow?: ReviewQueueRow;
  /**
   * Present only for a writable local folder. The lane the MCP server refuses an agent, not
   * an identity check: Atlas has no login.
   */
  review?: {
    /** True while this document carries `review_state: human_decides`. */
    reserved: boolean;
    busy: boolean;
    onConfirm: () => void;
    onRelease: () => void;
  };
}) {
  const t = useTranslations("vaultWidgets.parts.meta");
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  const locale = useLocale();
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  const readingMinutes = estimateReadingMinutes(doc.wordCount);
  const updated = new Date(doc.updatedAt);
  // Two clocks, one row: `reviewed_at` is meaning time (a person judged it right), `updatedAt`
  // record time (bytes last written). One date alone cannot tell an approval from a save.
  const reviewedAtRaw = doc.frontmatter?.reviewed_at;
  const reviewedAt =
    typeof reviewedAtRaw === "string" && !Number.isNaN(Date.parse(reviewedAtRaw))
      ? new Date(reviewedAtRaw)
      : null;
  const formatDay = (value: Date) =>
    value.toLocaleDateString(numberLocale, { year: "numeric", month: "2-digit", day: "2-digit" });
  // Every node kind has a map node; `buildTopologyDeeplinkForDoc` handles each.
  const topologyHref = buildTopologyDeeplinkForDoc(doc);
  /**
   * One verdict for chip, body and CTA: a document the deeplink builder cannot address has no
   * place on the map.
   */
  const inGraph = topologyHref != null;
  // The explanation shows only for documents not on the map; for the rest the chip and link
  // already say it.
  const proofBody = inGraph ? null : t(isWikiPage(doc) ? "notOnMapWikiBody" : "notOnMapBody");

  return (
    <section
      aria-label={inGraph ? t("recordProofAria") : t("notOnMapAria")}
      className="mx-auto flex max-w-[var(--measure-doc-column)] flex-col gap-2 border-b border-[color:var(--color-overlay-2)] px-6 py-2 text-label text-[color:var(--color-text-quaternary)] md:px-10"
    >
      {proofBody ? (
        <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
        <span
            data-testid="doc-map-evidence"
            data-in-graph={inGraph ? "true" : "false"}
            className={
              inGraph
                ? "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 text-label text-[color:var(--color-text-secondary)]"
                : // Not being on the map is a fact, not an alarm.
                  "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed-a12)] px-2.5 text-label text-[color:var(--color-text-quaternary)]"
            }
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {inGraph ? t("recordProofLabel") : t("notOnMapLabel")}
          </span>
          <span className="min-h-7 min-w-0 flex-1 py-1 text-[color:var(--color-text-tertiary)]">
            {proofBody}
          </span>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        {/* On the map, the chip joins this row. */}
        {proofBody ? null : (
        <span
            data-testid="doc-map-evidence"
            data-in-graph={inGraph ? "true" : "false"}
            className={
              inGraph
                ? "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 text-label text-[color:var(--color-text-secondary)]"
                : // Not being on the map is a fact, not an alarm.
                  "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed-a12)] px-2.5 text-label text-[color:var(--color-text-quaternary)]"
            }
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {inGraph ? t("recordProofLabel") : t("notOnMapLabel")}
          </span>
        )}
        {/* Stated on the document for readers who never saw the sidebar row; neutral, not an alarm. */}
        {reviewRow ? (
          <span
            data-testid="doc-review-chip"
            // Geometry from the shared badge; the two older chips above are the whole hand-written ledger.
            className={badgeClass({
              shape: "tag",
              className:
                "min-h-8 gap-1.5 border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 text-label text-[color:var(--color-text-secondary)]",
            })}
          >
            {reviewRow.reason === "raised" ? (
              <UserRoundPen className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {reviewRow.reason === "raised"
              ? tReview("docChipRaised")
              : reviewRow.reviewedBy
                ? tReview("changedBy", { name: reviewRow.reviewedBy })
                : tReview("changedPlain")}
          </span>
        ) : null}
        {review ? (
          // One action for the current state; confirming is primary even on a reserved node, or the
          // node stays agent-writable and unapproved between release and confirm.
          <button
            type="button"
            data-testid="doc-review-action"
            disabled={review.busy}
            onClick={review.onConfirm}
            className={controlClass({ shape: "chip", size: "md", tone: "muted", hoverSurface: "lift" })}
          >
            {tReview("actionConfirm")}
          </button>
        ) : null}
        {review?.reserved ? (
          <button
            type="button"
            data-testid="doc-review-release"
            disabled={review.busy}
            onClick={review.onRelease}
            className={controlClass({ shape: "chip", size: "md", tone: "muted", hoverSurface: "lift" })}
          >
            {tReview("actionRelease")}
          </button>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="tabular-nums">
            {t("wordsUnit", { count: doc.wordCount.toLocaleString(numberLocale) })}
          </span>
          <span className="tabular-nums">
            {t("readingMinutes", { minutes: readingMinutes })}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* One entrance to the map: `/ontology` is only a redirect to `/topology`. */}
          {/* With no address the CTA is not drawn (`.claude/rules/surfaces.md`: no dead CTAs). */}
          {topologyHref ? (
            <Link
              href={topologyHref}
              title={t("topologyLinkTitle")}
              data-testid="doc-map-open"
              className={actionLinkClass}
            >
              <Network className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("topologyLinkLabel")}</span>
            </Link>
          ) : null}
        </div>
        {doc.tags.length > 0 ? (
          <span className="font-mono">
            {doc.tags.map((tag) => `#${tag}`).join(" ")}
          </span>
        ) : null}
        <span className="ml-auto flex min-w-0 items-baseline gap-2 tabular-nums">
          {reviewedAt ? (
            <span
              data-testid="doc-meaning-time"
              className="text-[color:var(--color-text-secondary)]"
              title={tReview("reviewedOnTitle")}
            >
              {tReview("reviewedOn", { date: formatDay(reviewedAt) })}
            </span>
          ) : null}
          <span
            data-testid="doc-record-time"
            title={t("recordTimeTitle", { at: updated.toLocaleString(numberLocale) })}
          >
            {formatDay(updated)}
          </span>
          {/* Git's commit count for this file, derived at build time. */}
          {doc.revision ? (
            <span data-testid="doc-revision" title={t("revisionTitle", { count: doc.revision })}>
              {t("revisionLabel", { count: doc.revision })}
            </span>
          ) : null}
        </span>
      </div>
    </section>
  );
}

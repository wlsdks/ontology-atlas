import { useLocale, useTranslations } from "next-intl";
import { CircleDashed, FileText, Network, UserRoundPen } from "lucide-react";
import {
  buildTopologyDeeplinkForDoc,
  type ReviewQueueRow,
  type VaultDoc,
  isWikiPage,
} from "@/entities/docs-vault";
import { useDocumentDetail } from "@/features/document-detail";
import { LOCALE_META, type LocaleMeta } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { READING_TIME_MIN_WORDS, estimateReadingMinutes } from "./reading-minutes";
import { controlClass } from '@/shared/ui/control-class';

const actionLinkClass = controlClass({
  shape: "chip",
  size: "md",
  tone: "muted",
  className:
    "min-h-8 border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] underline-offset-2 hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-text-primary)] active:border-[color:var(--color-indigo-line-a54)] active:bg-[color:var(--color-indigo-line-a13)]",
});

export function DocMetaBar({
  doc,
  reviewRow,
  review,
}: {
  doc: VaultDoc;
  reviewRow?: ReviewQueueRow;
  /**
   * Present only for a writable local folder. The lane the MCP server refuses an agent, not
   * an identity check: Atlas has no login.
   */
  review?: {
    reserved: boolean;
    busy: boolean;
    onConfirm: () => void;
    onRelease: () => void;
  };
}) {
  const t = useTranslations("vaultWidgets.parts.meta");
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  const locale = useLocale();
  const numberLocale = (LOCALE_META as Record<string, LocaleMeta>)[locale]?.intlTag ?? "en-US";
  const wordCount = useDocumentDetail(doc)?.wordCount;
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
  const topologyHref = buildTopologyDeeplinkForDoc(doc);
  const inGraph = topologyHref != null;
  // The explanation shows only for documents not on the map; for the rest the chip and link
  // already say it. A wiki page gets its own sentence: the generic one would have it add
  // the `kind:` that `validateWikiPage` rejects.
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
            data-in-graph="false"
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed-a12)] px-2.5 text-label text-[color:var(--color-text-quaternary)]"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {t("notOnMapLabel")}
          </span>
          <span className="min-h-7 min-w-0 flex-1 py-1 text-[color:var(--color-text-tertiary)]">
            {proofBody}
          </span>
        </div>
      ) : null}

      {reviewRow ? (
        <p
          data-testid="doc-review-chip"
          className="flex min-w-0 items-center gap-1.5 py-1 text-label text-[color:var(--color-text-secondary)]"
        >
          {reviewRow.reason === "raised" ? (
            <UserRoundPen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0">
            {reviewRow.reason === "raised"
              ? tReview("docChipRaised")
              : reviewRow.reviewedBy
                ? tReview("changedBy", { name: reviewRow.reviewedBy })
                : tReview("changedPlain")}
          </span>
        </p>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        {topologyHref ? (
          <span data-testid="doc-map-evidence" data-in-graph="true" className="contents">
            <Link
              href={topologyHref}
              title={t("topologyLinkTitle")}
              data-testid="doc-map-open"
              className={actionLinkClass}
            >
              <Network className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("topologyLinkLabel")}</span>
            </Link>
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
        <span className="ml-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-1 tabular-nums">
          {wordCount !== undefined ? (
            <span data-testid="doc-word-count" className="motion-swap-in flex gap-x-2">
              <span>{t("wordsUnit", { count: wordCount.toLocaleString(numberLocale) })}</span>
              {wordCount >= READING_TIME_MIN_WORDS ? <span>{t("readingMinutes", { minutes: estimateReadingMinutes(wordCount) })}</span> : null}
            </span>
          ) : null}
          {doc.tags.length > 0 ? (
            <span className="font-mono">
              {doc.tags.map((tag) => `#${tag}`).join(" ")}
            </span>
          ) : null}
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

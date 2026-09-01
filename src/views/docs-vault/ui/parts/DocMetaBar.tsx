import { useLocale, useTranslations } from "next-intl";
import { CircleDashed, FileText, Network, UserRoundPen } from "lucide-react";
import {
  buildTopologyDeeplinkForDoc,
  type ReviewQueueRow,
  type VaultDoc,
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
    "min-h-8 border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] font-mono underline-offset-2 transition-[background-color,border-color,color,transform] hover:-translate-y-0.5 hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:border-[color:var(--color-indigo-line-a54)] active:bg-[color:var(--color-indigo-line-a13)] motion-reduce:transform-none",
});

/**
 * The meta bar above a document body — word count, reading time, kind jump, tags, updated date.
 */
export function DocMetaBar({
  doc,
  reviewRow,
}: {
  doc: VaultDoc;
  /**
   * This document's row in the review queue, when it has one.
   *
   * Passed in rather than recomputed, so the sidebar and the document cannot
   * disagree about the same fact — the drift verdict is a hash comparison, and
   * two call sites hashing separately is two chances to answer differently.
   */
  reviewRow?: ReviewQueueRow;
}) {
  const t = useTranslations("vaultWidgets.parts.meta");
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  const locale = useLocale();
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  const readingMinutes = estimateReadingMinutes(doc.wordCount);
  const updated = new Date(doc.updatedAt);
  // The topology renders the whole ontology graph, so project, domain, capability, and element
  // all have 1:1 nodes and can be jumped to (`buildTopologyDeeplinkForDoc` handles each kind).
  const topologyHref = buildTopologyDeeplinkForDoc(doc);
  /**
   * **Does this document actually exist on the map** — the chip, the body, and the CTA all branch
   * on this one value.
   *
   * The verdict is taken from the deeplink builder (2026-08-04) because the chip and the body used
   * to say "map evidence" **unconditionally**. So a document with a missing, empty, or unknown
   * `kind` — one with **no node** in the graph — still claimed to back the map. A document the
   * builder cannot make an address for has no place on the map. Using **the same value** makes it
   * structurally impossible for the chip to say «it is there» while the CTA cannot go.
   */
  const inGraph = topologyHref != null;
  /*
   * **An explanation earns its place only when it changes something** (2026-08-08, owner report —
   *[the top looks a bit odd when reading a document; can it be laid out better?]*.
   *
   * This line used to appear on every document. But on a document that **is** on the map the
   * sentence says nothing new — the chip immediately to its left reads "map evidence" and there is
   * a link to the topology on its right — while eating a whole line above the body. Measured: in
   * the shipped sample vault **all 112 documents are nodes**, so the same sentence repeated 112
   * times, pushing the body down each time.
   *
   * On a document that is **not** on the map the opposite holds — why it is not, and what to do,
   * live only in that sentence (82 documents in the dogfood vault). So it is kept only then. Same
   * shape as this repository's degradation-card discipline: state the reason and the destination
   * in the case that does not work.
   *
   * Not moved into a tooltip: on a touch device there is no hover, so it would effectively vanish,
   * which becomes "hiding a typed fact".
   */
  const proofBody = inGraph ? null : t("notOnMapBody");

  return (
    <section
      aria-label={inGraph ? t("recordProofAria") : t("notOnMapAria")}
      className="mx-auto flex max-w-[760px] flex-col gap-2 border-b border-[color:var(--color-overlay-2)] px-6 py-2 text-label text-[color:var(--color-text-quaternary)] md:px-10"
    >
      {/* Only a document that is not on the map gets its own line — there, why it is not is the fact. */}
      {proofBody ? (
        <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
        <span
            data-testid="doc-map-evidence"
            data-in-graph={inGraph ? "true" : "false"}
            className={
              inGraph
                ? "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 font-mono text-label text-[color:var(--color-text-secondary)]"
                : // Not being on the map is a fact, not an alarm — kept neutral.
                  "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed-a12)] px-2.5 font-mono text-label text-[color:var(--color-text-quaternary)]"
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
        {/* When it is on the map the chip joins this row — two rows become one. */}
        {proofBody ? null : (
        <span
            data-testid="doc-map-evidence"
            data-in-graph={inGraph ? "true" : "false"}
            className={
              inGraph
                ? "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 font-mono text-label text-[color:var(--color-text-secondary)]"
                : // Not being on the map is a fact, not an alarm — kept neutral.
                  "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed-a12)] px-2.5 font-mono text-label text-[color:var(--color-text-quaternary)]"
            }
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {inGraph ? t("recordProofLabel") : t("notOnMapLabel")}
          </span>
        )}
        {/* The sidebar row carries this fact, and a person who arrives any other
            way — a link, a tab left open, coming back tomorrow — would not have
            seen it. It belongs to the document, so it is stated on the document.
            Neutral, like the not-on-the-map chip beside it: this is a fact to act
            on, not an alarm. */}
        {reviewRow ? (
          <span
            data-testid="doc-review-chip"
            // Geometry comes from the shared badge, not from this file. Its two
            // older siblings above predate that primitive and are the whole of
            // the hand-written ledger; a third would have grown it.
            className={badgeClass({
              shape: "tag",
              className:
                "min-h-7 gap-1.5 border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2.5 font-mono text-[color:var(--color-text-secondary)]",
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
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono tabular-nums">
            {t("wordsUnit", { count: doc.wordCount.toLocaleString(numberLocale) })}
          </span>
          <span className="font-mono tabular-nums">
            {t("readingMinutes", { minutes: readingMinutes })}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/*
            There is **one** entrance to the map (2026-07-28).

            "Meaning map" (`/ontology/?node=`) and "topology" (`/topology/?p=`) used to sit side by
            side. But `/ontology` is a **thin redirect** to the map (the old hub is retired), so
            both links arrive at the same screen. Two entrances differing only in parameters are
            not a choice, they are hesitation.

            Only the direct one (`/topology` focus) is kept — one redirect hop fewer, and one fewer
            question the screen asks the user.
          */}
          {/* **With no address to build, the CTA is not drawn.** Zero dead CTAs is this
              repository's contract (`.claude/rules/surfaces.md`) — a link that looks pressable and
              selects nothing is a trap, not a degradation. It branches on the same `inGraph` value
              above, so the chip and the CTA cannot say different things. */}
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
        <span
          className="ml-auto font-mono tabular-nums"
          title={updated.toLocaleString(numberLocale)}
        >
          {updated.toLocaleDateString(numberLocale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })}
        </span>
      </div>
    </section>
  );
}

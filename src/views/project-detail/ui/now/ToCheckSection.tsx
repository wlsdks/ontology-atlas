"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { getTopologyFocusHref } from "@/entities/project";
import type { MapEvidenceAvailability } from "@/features/vault-ontology";
import { Button, Dialog, DialogBody, DialogFooter, OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { TO_CHECK_REASONS, type ProjectToCheck, type ToCheckReason, type ToCheckRow } from "../../model/project-to-check";
import { CrossFadeText, SECTION_HEADING_CLASS, STALE_DOT_CLASS, SectionHeadingLine, rowMotion, useArrival } from "./now-parts";

/** A group in the dialog lists this many rows; the rest are named by count and live on the map. */
const DIALOG_ROWS_PER_REASON = 100;
const REVIEW_REASONS: ReadonlySet<ToCheckReason> = new Set(["raised", "changed-since-review", "unverifiable"]);

/** Two lines at one fixed height, so three slots are reserved before any reason is known. */
const ROW_CLASS = controlClass({
  shape: "row",
  size: "md",
  tone: "secondary",
  hoverSurface: "lift",
  hoverInk: "strong",
  className: "h-11 w-full flex-col items-stretch justify-center gap-0.5 px-2 py-1",
});

export function ToCheckSection({
  projectName,
  toCheck,
  availability,
  staleCount,
  capabilityTotal,
  reducedMotion,
  arrivalOffset = 0,
}: {
  projectName: string;
  toCheck: ProjectToCheck;
  availability: MapEvidenceAvailability;
  staleCount: number;
  capabilityTotal: number;
  reducedMotion: boolean;
  arrivalOffset?: number;
}) {
  const t = useTranslations("projectPages.detail");
  const [dialogOpen, setDialogOpen] = useState(false);
  const arrival = useArrival(toCheck.visible.length > 0);
  const total = toCheck.rows.length;
  const evidenceLine =
    availability === "measured" ? t("toCheckEvidenceMeasured", { stale: staleCount, total: capabilityTotal })
      : availability === "reading" ? t("toCheckEvidenceReading")
        : availability === "app-only" ? t("toCheckEvidenceAppOnly")
          : availability === "unreadable" ? t("toCheckEvidenceUnreadable")
            : t("toCheckEvidenceNoPaths");

  return (
    <section data-testid="project-detail-to-check" aria-labelledby="project-detail-to-check-title" className="min-w-0">
      <SectionHeadingLine
        heading={
          <CrossFadeText
            as="h2"
            id="project-detail-to-check-title"
            testId="project-detail-to-check-heading"
            reducedMotion={reducedMotion}
            className={SECTION_HEADING_CLASS}
            text={t("toCheckHeading", { count: total })}
          />
        }
        door={
          total > toCheck.visible.length ? (
            <button
              type="button"
              data-testid="project-detail-to-check-view-all"
              onClick={() => setDialogOpen(true)}
              className={controlClass({ shape: "link", tone: "accent", className: "touch-hit-expand tabular-nums" })}
            >
              {t("toCheckViewAll", { count: total })}
            </button>
          ) : null
        }
      />
      <CrossFadeText
        as="p"
        testId="project-detail-evidence-line"
        reducedMotion={reducedMotion}
        wrap
        className="mt-0.5 min-h-[2lh] text-label leading-label text-[color:var(--color-text-tertiary)]"
        text={evidenceLine}
      />
      <ul
        data-testid="project-detail-to-check-rows"
        className="relative -mx-2 mt-2 flex min-h-[calc(3*2.75rem+2px)] flex-col gap-px"
      >
        <AnimatePresence initial mode="popLayout">
          {toCheck.visible.map((row, index) => (
            <motion.li key={`${row.reason}:${row.nodeId}`} layout="position" className="min-w-0" {...rowMotion({ index: index + arrivalOffset, arrival, reducedMotion })}>
              <ToCheckRowLink row={row} />
            </motion.li>
          ))}
        </AnimatePresence>
        {toCheck.visible.length === 0 && availability !== "reading" ? (
          <li data-testid="project-detail-to-check-empty" className="px-2 py-1.5 text-pretty text-body leading-body text-[color:var(--color-text-secondary)]">
            {t("toCheckEmpty")}
          </li>
        ) : null}
      </ul>
      <ToCheckDialog open={dialogOpen} onClose={() => setDialogOpen(false)} projectName={projectName} rows={toCheck.rows} />
    </section>
  );
}

function useReasonSentence() {
  const t = useTranslations("projectPages.detail");
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  return (row: ToCheckRow): string => {
    switch (row.reason) {
      case "raised":
        return row.note ?? t("toCheckRaisedNoNote");
      case "changed-since-review":
        return row.reviewedBy ? tReview("changedBy", { name: row.reviewedBy }) : tReview("changedPlain");
      case "stale":
        return row.pathGone ? t("toCheckStaleGone", { path: row.path ?? "" }) : t("toCheckStaleMoved", { path: row.path ?? "" });
      case "unverifiable":
        return tReview("unverifiablePlain");
      case "definition-missing":
        return t("toCheckNoDefinition");
    }
  };
}

function ToCheckRowLink({ row }: { row: ToCheckRow }) {
  const t = useTranslations("projectPages.detail");
  const sentenceOf = useReasonSentence();
  const opensDocument = REVIEW_REASONS.has(row.reason) && row.docSlug !== null;
  const href = opensDocument ? buildDocsVaultHref({ slug: row.docSlug! }) : getTopologyFocusHref(row.nodeId);
  const sentence = sentenceOf(row);
  return (
    <Link
      href={href}
      data-testid="project-detail-to-check-row"
      data-reason={row.reason}
      aria-label={opensDocument ? t("toCheckOpenDocAria", { name: row.name }) : t("domainCapabilityLinkAria", { name: row.name })}
      className={ROW_CLASS}
    >
      <span className="flex min-w-0 items-center gap-2">
        <OntologyMapKindGlyph kind={row.kind} size={ICON_SIZE.sm} className="shrink-0" />
        <span title={row.name} className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
          {row.name}
        </span>
        {row.domainName ? (
          <span title={row.domainName} className="max-w-[45%] shrink-0 truncate text-right text-label text-[color:var(--color-text-tertiary)]">
            {row.domainName}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-2 pl-[calc(var(--icon-sm)+0.5rem)]">
        {row.reason === "stale" ? <span aria-hidden className={STALE_DOT_CLASS} /> : null}
        <span title={sentence} className="min-w-0 truncate text-label leading-label text-[color:var(--color-text-secondary)]">
          {sentence}
        </span>
      </span>
    </Link>
  );
}

function ToCheckDialog({
  open,
  onClose,
  projectName,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  rows: readonly ToCheckRow[];
}) {
  const t = useTranslations("projectPages.detail");
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  const groupHeading: Record<ToCheckReason, (count: number) => string> = {
    raised: (count) => tReview("raisedHeader", { count }),
    "changed-since-review": (count) => tReview("changedHeader", { count }),
    stale: (count) => t("toCheckGroupStale", { count }),
    unverifiable: (count) => tReview("unverifiableHeader", { count }),
    "definition-missing": (count) => t("toCheckGroupNoDefinition", { count }),
  };
  const groups = TO_CHECK_REASONS.map((reason) => ({ reason, rows: rows.filter((row) => row.reason === reason) })).filter(
    (group) => group.rows.length > 0,
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="project-detail-to-check-dialog-title"
      size="md"
      testId="project-detail-to-check-dialog"
      className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col"
    >
      <h2 id="project-detail-to-check-dialog-title" className={SECTION_HEADING_CLASS}>
        {t("toCheckDialogTitle", { project: projectName })}
      </h2>
      <DialogBody className="mt-3 space-y-5 overscroll-contain pb-4">
        {groups.map((group) => (
          <section key={group.reason} aria-label={groupHeading[group.reason](group.rows.length)}>
            <h3 className="text-body font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-secondary)]">
              {groupHeading[group.reason](group.rows.length)}
            </h3>
            <ul className="-mx-2 mt-1.5 flex flex-col gap-px">
              {group.rows.slice(0, DIALOG_ROWS_PER_REASON).map((row) => (
                <li key={`${row.reason}:${row.nodeId}`} className="min-w-0">
                  <ToCheckRowLink row={row} />
                </li>
              ))}
            </ul>
            {group.rows.length > DIALOG_ROWS_PER_REASON ? (
              <p className="mt-1.5 text-label text-[color:var(--color-text-tertiary)]">
                {t("toCheckDialogMore", { count: group.rows.length - DIALOG_ROWS_PER_REASON })}
              </p>
            ) : null}
          </section>
        ))}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose} className="atlas-touch-floor">
          {t("previewClose")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

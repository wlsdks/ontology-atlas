"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getTopologyFocusHref } from "@/entities/project";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { ProjectChanged } from "../../model/project-changed";
import { CrossFadeText, RECENT_DOT_CLASS, SECTION_HEADING_CLASS, SectionHeadingLine, rowMotion, useArrival } from "./now-parts";

const ROW_CLASS = controlClass({
  shape: "row",
  size: "sm",
  tone: "secondary",
  hoverSurface: "lift",
  hoverInk: "strong",
  className: "h-8 w-full gap-2 px-2",
});

export function ChangedSection({
  changed,
  windowDays,
  reading,
  reducedMotion,
  arrivalOffset = 0,
}: {
  changed: ProjectChanged;
  windowDays: number;
  reading: boolean;
  reducedMotion: boolean;
  arrivalOffset?: number;
}) {
  const t = useTranslations("projectPages.detail");
  const tIndex = useTranslations("topology.index");
  const tAge = useTranslations("editProvenance.age");
  const arrival = useArrival(changed.visible.length > 0);
  const ageOf = (days: number) => (days === 0 ? t("changedToday") : days === 1 ? tAge("yesterday") : tAge("daysAgo", { count: days }));

  return (
    <section data-testid="project-detail-changed" aria-labelledby="project-detail-changed-title" className="min-w-0">
      <SectionHeadingLine
        heading={
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={RECENT_DOT_CLASS} />
            <CrossFadeText
              as="h2"
              id="project-detail-changed-title"
              testId="project-detail-changed-heading"
              reducedMotion={reducedMotion}
              className={SECTION_HEADING_CLASS}
              text={reading ? t("changedReading") : t("changedHeading", { days: windowDays, count: changed.total })}
            />
          </span>
        }
        door={
          <Link
            href="/topology/?recent=auto"
            data-testid="project-detail-changed-map-link"
            className={controlClass({ shape: "link", tone: "accent", className: "touch-hit-expand" })}
          >
            {t("changedViewOnMap")}
          </Link>
        }
      />
      <ul data-testid="project-detail-changed-rows" className="relative -mx-2 mt-2 flex min-h-[calc(3*2rem+2px)] flex-col gap-px">
        <AnimatePresence initial mode="popLayout">
          {changed.visible.map((row, index) => (
            <motion.li key={row.id} layout="position" className="min-w-0" {...rowMotion({ index: index + arrivalOffset, arrival, reducedMotion })}>
              <Link
                href={getTopologyFocusHref(row.id)}
                data-testid="project-detail-changed-row"
                aria-label={t("domainCapabilityLinkAria", { name: row.name })}
                className={ROW_CLASS}
              >
                <OntologyMapKindGlyph kind={row.kind} size={ICON_SIZE.sm} className="shrink-0" />
                <span title={row.name} className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
                  {row.name}
                </span>
                <span className="shrink-0 text-right text-label tabular-nums text-[color:var(--color-text-tertiary)]">{ageOf(row.agoDays)}</span>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
        {!reading && changed.visible.length === 0 ? (
          <li data-testid="project-detail-changed-empty" className="px-2 py-2 break-keep text-body text-[color:var(--color-text-secondary)]">
            {tIndex("recentEmptyHint", { days: windowDays })}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

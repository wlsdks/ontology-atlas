"use client";

import { useTranslations } from "next-intl";
import type { MapEvidence, MapEvidenceAvailability } from "../model/use-map-evidence-states";

const KINDS = ["project", "domain", "capability", "element"] as const;
type Kind = (typeof KINDS)[number];

/**
 * The lit 3D map's key: hue is the node's kind, brightness its evidence (stale dims with an amber
 * ring, unknown emits nothing with a dashed ring). Counts are over the concepts on the map; with
 * nothing measured the note says why. A bottom strip marked `data-map-fit-obstacle="bottom"`, so
 * the 3D fit stays above it.
 */
export function TopologyLightLegend({
  evidence,
  nodeIds,
  kindLabels,
  hiddenDependencies = 0,
}: {
  evidence: MapEvidence;
  /** The counts are over these. */
  nodeIds: readonly string[];
  kindLabels: Readonly<Partial<Record<Kind, string>>> | null;
  hiddenDependencies?: number;
}) {
  const t = useTranslations("topology.light3d");
  let current = 0;
  let stale = 0;
  for (const id of nodeIds) {
    const state = evidence.states.get(id);
    if (state === "current") current += 1;
    else if (state === "stale") stale += 1;
  }
  const unknown = nodeIds.length - current - stale;
  const note: Record<Exclude<MapEvidenceAvailability, "measured">, string> = {
    reading: t("noteReading"),
    "app-only": t("noteAppOnly"),
    unreadable: t("noteUnreadable"),
    "no-paths": t("noteNoPaths"),
  };

  const sep = <span aria-hidden className="h-3 w-px shrink-0 bg-[color:var(--map-panel-border)]" />;
  return (
    <div
      data-testid="topology-light-legend"
      data-map-fit-obstacle="bottom"
      data-evidence-availability={evidence.availability}
      data-evidence-current={current}
      data-evidence-stale={stale}
      data-evidence-unknown={unknown}
      role="group"
      aria-label={t("legendLabel")}
      className="pointer-events-none absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px+16px)] right-[max(calc(var(--map-safe-inset-right)*1px),calc(var(--map-live-inset-right,0px)+16px))] z-20 hidden justify-center md:flex"
    >
      {/* One row below `xl`: every wrapped row is canvas the fit gives up. The availability
         note goes to assistive technology there; the "Unknown" count still shows it. */}
      <div className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1 text-caption text-[color:var(--map-panel-text-secondary)] xl:gap-x-3 xl:px-3.5 xl:py-1.5 xl:text-label">
        {kindLabels ? (
          <>
            <span className="sr-only">{t("kindsHeading")}</span>
            {KINDS.map((kind) =>
              kindLabels[kind] ? (
                <span key={kind} className="flex items-center gap-1.5 whitespace-nowrap" data-light-kind={kind}>
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: `rgb(var(--color-kind-${kind}-rgb))` }}
                  />
                  {kindLabels[kind]}
                </span>
              ) : null,
            )}
            {sep}
          </>
        ) : null}
        <span className="sr-only">{t("evidenceHeading")}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap" data-light-evidence="current">
          <span aria-hidden className="size-2 rounded-full bg-[color:var(--map-indigo-bright)]" />
          {t("current", { count: current })}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap" data-light-evidence="stale">
          <span
            aria-hidden
            className="size-2.5 rounded-full border border-[color:var(--color-status-warning)] bg-[color:var(--map-node-fill-capability)]"
          />
          {t("stale", { count: stale })}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap" data-light-evidence="unknown">
          <span
            aria-hidden
            className="size-2.5 rounded-full border border-dashed border-[color:var(--map-node-stroke-capability)]"
          />
          {t("unknown", { count: unknown })}
        </span>
        {hiddenDependencies > 0 ? (
          <>
            {sep}
            <span
              data-testid="topology-light-legend-hidden-dependencies"
              data-hidden-dependencies={hiddenDependencies}
              className="whitespace-nowrap"
            >
              {t("dependenciesHidden", { count: hiddenDependencies })}
            </span>
            <span className="sr-only text-[color:var(--map-panel-text-tertiary)] xl:not-sr-only">
              {t("dependenciesHiddenHint")}
            </span>
          </>
        ) : null}
        {evidence.availability !== "measured" ? (
          <span
            data-testid="topology-light-legend-note"
            className="sr-only text-center text-[color:var(--map-panel-text-tertiary)] xl:not-sr-only"
          >
            {note[evidence.availability]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

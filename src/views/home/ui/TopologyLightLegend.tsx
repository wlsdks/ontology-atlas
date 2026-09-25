"use client";

import { useTranslations } from "next-intl";
import type { MapEvidence, MapEvidenceAvailability } from "../model/use-map-evidence-states";

const KINDS = ["project", "domain", "capability", "element"] as const;
type Kind = (typeof KINDS)[number];

/**
 * **The lit 3D map's key** (2026-09-25) — what each colour of light is, and what the
 * evidence light is standing on.
 *
 * The light on the 3D map carries two facts, and a reader cannot be asked to guess either:
 * the **hue** is the node's kind (the product's kind ramp, the same one every kind chip
 * wears), and the **brightness** is its evidence — current emits, stale emits less and wears
 * an amber ring, unknown emits nothing and wears a dashed ring. The counts are the
 * measurement's, over the concepts on the map; when nothing was measured the note says why,
 * so an unlit map is never read as a map of current concepts.
 *
 * One strip along the bottom of the canvas, between the panels, that wraps rather than cuts.
 * It used to be a 176px card in the bottom-left corner, and the camera did not know it was
 * there: at 1040 it stood over nine drawn nodes (interaction audit, 2026-09-25). The strip is
 * marked `data-map-fit-obstacle="bottom"`, and the 3D fit keeps the drawing above it.
 */
export function TopologyLightLegend({
  evidence,
  nodeIds,
  kindLabels,
}: {
  evidence: MapEvidence;
  /** The concepts on the map — the counts are over these. */
  nodeIds: readonly string[];
  kindLabels: Readonly<Partial<Record<Kind, string>>> | null;
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
      <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-chip bg-[color:var(--chrome-surface)] px-3.5 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]">
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
        {evidence.availability !== "measured" ? (
          <span
            data-testid="topology-light-legend-note"
            className="text-center text-[color:var(--map-panel-text-tertiary)] [word-break:keep-all]"
          >
            {note[evidence.availability]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

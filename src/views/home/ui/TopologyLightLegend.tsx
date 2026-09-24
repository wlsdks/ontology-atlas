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
 * Bottom-left of the canvas, clear of the readout (bottom-right) and the hint (centre).
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

  return (
    <div
      data-testid="topology-light-legend"
      data-evidence-availability={evidence.availability}
      data-evidence-current={current}
      data-evidence-stale={stale}
      data-evidence-unknown={unknown}
      role="group"
      aria-label={t("legendLabel")}
      className="pointer-events-none absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px+16px)] z-20 hidden w-44 flex-col gap-1.5 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-2 text-label text-[color:var(--map-panel-text-secondary)] md:flex"
    >
      {kindLabels ? (
        <div className="flex flex-col gap-1">
          <span className="text-[color:var(--map-panel-text-tertiary)]">{t("kindsHeading")}</span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {KINDS.map((kind) =>
              kindLabels[kind] ? (
                <span key={kind} className="flex items-center gap-1.5" data-light-kind={kind}>
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: `rgb(var(--color-kind-${kind}-rgb))` }}
                  />
                  {kindLabels[kind]}
                </span>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className="text-[color:var(--map-panel-text-tertiary)]">{t("evidenceHeading")}</span>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5" data-light-evidence="current">
            <span aria-hidden className="size-2 rounded-full bg-[color:var(--map-indigo-bright)]" />
            {t("current", { count: current })}
          </span>
          <span className="flex items-center gap-1.5" data-light-evidence="stale">
            <span
              aria-hidden
              className="size-2.5 rounded-full border border-[color:var(--color-status-warning)] bg-[color:var(--map-node-fill-capability)]"
            />
            {t("stale", { count: stale })}
          </span>
          <span className="flex items-center gap-1.5" data-light-evidence="unknown">
            <span
              aria-hidden
              className="size-2.5 rounded-full border border-dashed border-[color:var(--map-node-stroke-capability)]"
            />
            {t("unknown", { count: unknown })}
          </span>
        </div>
      </div>
      {evidence.availability !== "measured" ? (
        <span data-testid="topology-light-legend-note" className="text-[color:var(--map-panel-text-tertiary)]">
          {note[evidence.availability]}
        </span>
      ) : null}
    </div>
  );
}

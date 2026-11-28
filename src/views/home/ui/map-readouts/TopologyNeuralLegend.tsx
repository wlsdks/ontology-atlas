import { useMemo } from "react";
import { useTranslations } from "use-intl";
import type { NeuralLabels } from "@/widgets/ontology-map";
import type { MapEvidence, MapEvidenceAvailability } from "@/features/vault-ontology";
import { ArcSwatch, KindDot } from "./map-legend-swatches";

/**
 * Neural's key: capability, element and stale cells, and with a focus the two arc inks. Stale is
 * counted only once evidence was read; otherwise one quiet line says why nothing is amber. A
 * bottom strip marked `data-map-fit-obstacle="bottom"`, so the 3D fit stays above it.
 */
export function TopologyNeuralLegend({
  evidence,
  nodeIds,
  focused,
  indirect = false,
  hiddenDependencies = 0,
}: {
  evidence: MapEvidence;
  nodeIds: readonly string[];
  focused: boolean;
  indirect?: boolean;
  hiddenDependencies?: number;
}) {
  const t = useTranslations("topology.light3d");
  const tTree = useTranslations("mapTree");
  const tHex = useTranslations("topology.hexBoard");
  const tDial = useTranslations("mapDial");
  const tKinds = useTranslations("kinds");
  const measured = evidence.availability === "measured";
  let stale = 0;
  for (const id of nodeIds) if (evidence.states.get(id) === "stale") stale += 1;
  const note: Record<Exclude<MapEvidenceAvailability, "measured">, string> = {
    reading: tHex("evidenceReading"),
    "app-only": tTree("evidenceNeedsFolder"),
    unreadable: tHex("evidenceUnreadable"),
    "no-paths": tTree("evidenceNoPaths"),
  };

  return (
    <div
      data-testid="topology-neural-legend"
      data-map-fit-obstacle="bottom"
      data-evidence-availability={evidence.availability}
      data-evidence-stale={measured ? stale : 0}
      role="group"
      aria-label={t("legendLabel")}
      className="pointer-events-none absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px+16px)] right-[max(calc(var(--map-safe-inset-right)*1px),calc(var(--map-live-inset-right,0px)+16px))] z-20 hidden justify-center md:flex"
    >
      <div className="flex max-w-full flex-col items-center gap-1 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <KindDot radius={4} ink="var(--map-graph-name-strong)" />
            {tKinds("capability")}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <KindDot radius={2.2} ink="var(--map-graph-name-strong)" />
            {tKinds("element")}
          </span>
          {measured ? (
            <span data-testid="topology-neural-legend-stale" className="flex items-center gap-1.5 whitespace-nowrap">
              <KindDot radius={3} ink="var(--color-status-warning)" />
              {tDial("stale", { count: stale })}
            </span>
          ) : null}
          {focused ? (
            <>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <ArcSwatch ink="var(--map-graph-arc)" />
                {tDial("keyNeeds")}
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <ArcSwatch ink="var(--map-graph-reach)" />
                {tDial("keyNeededBy")}
              </span>
              {indirect ? (
                <span data-testid="topology-neural-legend-indirect" className="flex items-center gap-1.5 whitespace-nowrap">
                  <ArcSwatch ink="var(--map-graph-reach)" strength="var(--map-neural-impact-mid)" />
                  {tDial("keyNeededByIndirectly")}
                </span>
              ) : null}
            </>
          ) : null}
          {hiddenDependencies > 0 ? (
            <span
              data-testid="topology-neural-legend-hidden-dependencies"
              data-hidden-dependencies={hiddenDependencies}
              className="whitespace-nowrap"
            >
              {t("dependenciesHidden", { count: hiddenDependencies })}
            </span>
          ) : null}
        </div>
        {evidence.availability === "measured" ? null : (
          <span data-testid="topology-neural-legend-note" className="text-center text-[color:var(--map-panel-text-tertiary)]">
            {note[evidence.availability]}
          </span>
        )}
      </div>
    </div>
  );
}

export function useNeuralLabels(measured: boolean): NeuralLabels {
  const t = useTranslations("topology.light3d");
  const tHex = useTranslations("topology.hexBoard");
  return useMemo(
    () => ({
      domainMeta: ({ capabilities, elements, stale }) => {
        const meta = tHex("domainMeta", { capabilities, elements });
        if (!measured) return meta;
        return `${meta} · ${stale > 0 ? tHex("domainStale", { count: stale }) : tHex("domainStaleNone")}`;
      },
      focusFacts: ({ stale, needs, usedBy, impact }) => {
        const direct = t("focusFacts", { needs, users: usedBy });
        const facts = impact === undefined ? direct : `${direct} · ${t("focusImpact", { count: impact })}`;
        return stale ? `${tHex("tooltipStale")} · ${facts}` : facts;
      },
    }),
    [measured, t, tHex],
  );
}

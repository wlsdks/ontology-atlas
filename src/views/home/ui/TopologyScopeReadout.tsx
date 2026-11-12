"use client";

import { useTranslations } from "next-intl";
import { FLAT_LINE_BITS } from "@/widgets/ontology-map";
import type { MapEvidence } from "../model/map-canvas/use-map-evidence-states";

export function TopologyScopeReadout({ total, members, synthetic }: {
  total: number | null;
  members: number | null;
  synthetic: boolean;
}) {
  const t = useTranslations("firstRunStarter.readout");
  if (total === null || total <= 0 || (!synthetic && (members === null || members <= 0 || members > total))) return null;
  return (
    <div
      data-testid="topology-scope-readout"
      data-total-concepts={total}
      data-scope-concepts={synthetic ? total : members}
      data-synthetic={synthetic ? "true" : "false"}
      className="pointer-events-none hidden text-label tabular-nums text-[color:var(--color-text-tertiary)] md:block"
    >
      {synthetic ? t("synthetic", { count: total }) : members === total
        ? t("scopeFull", { count: total }) : t("scopePartial", { shown: members!, total })}
    </div>
  );
}

type KeyShape = "capability" | "rest" | "needs" | "neededBy" | "relates" | "broader";

/** A drawn sample of one map mark, in the ink the canvas paints it with. */
function KeySample({ shape }: { shape: KeyShape }) {
  const ink = shape === "neededBy" ? "var(--map-graph-reach)" : shape === "capability" ? "currentColor" : "var(--map-graph-arc)";
  return (
    <svg aria-hidden width="20" height="10" viewBox="0 0 20 10" className="shrink-0 overflow-visible">
      {shape === "capability" ? <circle cx="10" cy="5" r="3.6" fill="none" stroke={ink} strokeWidth="1.4" /> : null}
      {shape === "rest" ? <path d="M1 5 H18 M15 2.5 L18 5 L15 7.5" fill="none" stroke={ink} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {shape === "needs" || shape === "neededBy" ? <path d="M1 3.3 L19 4.8 L19 5.2 L1 6.7 Z" fill={ink} /> : null}
      {shape === "relates" ? <path d="M1 5 H19" fill="none" stroke={ink} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="0 4" /> : null}
      {shape === "broader" ? <path d="M1 3.7 H19 M1 6.3 H19" fill="none" stroke={ink} strokeWidth="1" /> : null}
    </svg>
  );
}

const SELECTION_SHAPES = [
  ["needs", "keyNeeds"],
  ["neededBy", "keyNeededBy"],
  ["relates", "keyRelates"],
  ["broader", "keyBroader"],
] as const;

/**
 * The marks on screen now, each beside a drawn sample: at rest the capability disc and the
 * domain arcs, under a selection the kinds of line it draws. `lineKinds` holds `FLAT_LINE_BITS`;
 * null before the map has drawn, when the resting arcs are what it will show.
 */
export function TopologyFlatKey({ evidence, selected, lineKinds }: { evidence: MapEvidence; selected: boolean; lineKinds: number | null }) {
  const t = useTranslations("mapDial");
  const stale = [...evidence.states.values()].some((state) => state === "stale");
  const bits = lineKinds ?? FLAT_LINE_BITS.rest;
  const lines = SELECTION_SHAPES.filter(([shape]) => (bits & FLAT_LINE_BITS[shape]) !== 0);
  const restArcs = (bits & FLAT_LINE_BITS.rest) !== 0;
  return (
    <div data-testid="topology-flat-key" data-line-kinds={bits}className="pointer-events-none absolute bottom-12 left-[calc(var(--map-safe-inset-left)*1px+16px)] right-[max(calc(var(--map-safe-inset-right)*1px),calc(var(--map-live-inset-right,0px)+16px))] z-20 hidden justify-center md:flex">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-label text-[color:var(--color-text-tertiary)]">
        <span className="inline-flex items-center gap-1.5"><KeySample shape="capability" />{t("keyCapability")}</span>
        {restArcs ? <span className="inline-flex items-center gap-1.5"><KeySample shape="rest" />{t("keyDependency")}</span> : null}
        {lines.map(([shape, key]) => (
          <span key={shape} data-key-shape={shape} className="inline-flex items-center gap-1.5"><KeySample shape={shape} />{t(key)}</span>
        ))}
        {stale ? <span className="text-[color:var(--color-status-warning)]">{t("keyStale")}</span> : null}
        {selected && lines.length === 0 ? <span>{t("keySelection")}</span> : null}
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
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

export function TopologyFlatKey({ evidence, selected }: { evidence: MapEvidence; selected: boolean }) {
  const t = useTranslations("mapDial");
  const stale = [...evidence.states.values()].some((state) => state === "stale");
  return (
    <div data-testid="topology-flat-key" className="pointer-events-none absolute bottom-12 left-[calc(var(--map-safe-inset-left)*1px+16px)] right-[max(calc(var(--map-safe-inset-right)*1px),calc(var(--map-live-inset-right,0px)+16px))] z-20 hidden justify-center md:flex">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-label text-[color:var(--color-text-tertiary)]">
        <span>{t("keyCapability")}</span>
        <span>{t("keyDependency")}</span>
        {stale ? <span className="text-[color:var(--color-status-warning)]">{t("keyStale")}</span> : null}
        {selected ? <span>{t("keySelection")}</span> : null}
      </div>
    </div>
  );
}

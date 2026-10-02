"use client";

import { useCallback, useMemo, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { OntologyCosmosMap, type CosmosMirrorLabels, type CosmosPlacementRecord } from "@/widgets/ontology-map";
import { readCosmosPlacement, writeCosmosPlacement } from "../model/cosmos-placement-store";

type CosmosMapProps = ComponentProps<typeof OntologyCosmosMap>;

export function TopologyCosmosSurface({
  vaultKey,
  ...props
}: Omit<CosmosMapProps, "arrivalKey" | "placement" | "onPlacement" | "labels"> & { vaultKey: string }) {
  const t = useTranslations("mapCosmos");
  const labels: CosmosMirrorLabels = useMemo(
    () => ({ list: t("list"), galaxyRow: (name, count) => t("galaxyRow", { name, count }) }),
    [t],
  );
  const placement = useMemo(() => (typeof window === "undefined" ? null : readCosmosPlacement(vaultKey)), [vaultKey]);
  const onPlacement = useCallback((record: CosmosPlacementRecord) => writeCosmosPlacement(vaultKey, record), [vaultKey]);
  return <OntologyCosmosMap key={vaultKey} {...props} arrivalKey={vaultKey} placement={placement} onPlacement={onPlacement} labels={labels} />;
}

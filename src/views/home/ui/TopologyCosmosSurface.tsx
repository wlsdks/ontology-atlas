"use client";

import { useMemo, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { OntologyCosmosMap, type CosmosMirrorLabels } from "@/widgets/ontology-map";

type CosmosMapProps = ComponentProps<typeof OntologyCosmosMap>;

export function TopologyCosmosSurface({
  vaultKey,
  ...props
}: Omit<CosmosMapProps, "arrivalKey" | "labels"> & { vaultKey: string }) {
  const t = useTranslations("mapCosmos");
  const labels: CosmosMirrorLabels = useMemo(
    () => ({
      list: t("list"),
      galaxyRow: (name, count) => t("galaxyRow", { name, count }),
      strandList: t("strandList"),
      strandRow: (from, to, count, twoWay) => t(twoWay ? "strandRowBoth" : "strandRow", { from, to, count }),
    }),
    [t],
  );
  return <OntologyCosmosMap key={vaultKey} {...props} arrivalKey={vaultKey} labels={labels} />;
}

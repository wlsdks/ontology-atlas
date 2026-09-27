import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { useMemo } from "react";
import { projectSlugForSource, useProjectSourceModel } from "./use-project-source-model";
import { buildProjectSourceReadinessRefreshToken, useProjectSourceReadiness } from "./use-unbound-project-source";

interface Options {
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "t" | "activeLocale">;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "selectedOntologyNode" | "vault" | "ontologyInsight">;
}
export function useTopologySourceReadiness({ topologyVaultReadModel, topologyPreferences }: Options) {
  const { selectedOntologyNode, vault, ontologyInsight } = topologyVaultReadModel;
  const { t, activeLocale } = topologyPreferences;

  // Only the selected project reaches `useProjectSourceModel`, so one sidecar read lifts
  // "no code folder is linked" into a quiet INDEX row.
  const sourceProjectSlug = projectSlugForSource(selectedOntologyNode);
  const usableVaultHandle =
    vault.status === "loaded" || vault.isReloadingSameVault ? vault.handle : null;
  const projectSource = useProjectSourceModel({
    projectSlug: sourceProjectSlug,
    vaultHandle: usableVaultHandle,
    nodes: ontologyInsight?.nodes ?? [],
    docs: vault.manifest?.docs ?? [],
    // The OS folder picker's title follows the screen's language.
    pickerTitle: t("nodeDatasheet.sourcePickerTitle"),
  });
  const projectSourceReadinessRefreshToken = useMemo(
    () =>
      buildProjectSourceReadinessRefreshToken({
        projectSlug: sourceProjectSlug,
        bindingCardinality: projectSource.view?.bindingCardinality ?? null,
        measuredAt: projectSource.view?.measuredAt ?? null,
        proposalSettled: projectSource.proposalSettled,
        acpWorkReceipts: vault.acpWorkReceipts,
      }),
    [
      sourceProjectSlug,
      projectSource.view?.bindingCardinality,
      projectSource.view?.measuredAt,
      projectSource.proposalSettled,
      vault.acpWorkReceipts,
    ],
  );
  const projectSourceReadiness = useProjectSourceReadiness({
    vaultHandle: usableVaultHandle,
    nodes: ontologyInsight?.nodes ?? [],
    // Binding and measuring do not change Markdown, so the manifest never re-parses; the project
    // model and the latest
    // ACP binding receipt invalidate this sidecar read instead.
    refreshToken: projectSourceReadinessRefreshToken,
  });
  const unboundProjectSource = projectSourceReadiness.unbound;
  const projectSourceMeasuredAtLabel = useMemo(() => {
    const measuredAt = projectSource.view?.measuredAt;
    if (!measuredAt) return t("nodeDatasheet.sourceMeasuredNever");
    const date = new Date(measuredAt);
    const time = Number.isNaN(date.getTime())
      ? measuredAt
      : new Intl.DateTimeFormat(activeLocale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    return t("nodeDatasheet.sourceMeasuredAt", { time });
  }, [projectSource.view?.measuredAt, activeLocale, t]);
  return { projectSourceReadiness, projectSource, projectSourceMeasuredAtLabel, unboundProjectSource };
}

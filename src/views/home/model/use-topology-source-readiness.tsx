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

  /*
   * Lifts the diagnosis **out of the selection**. `useProjectSourceModel` below only
   * ever sees the one selected project, so unless somebody clicks that node, "no code
   * folder is linked" exists nowhere on screen (measured 2026-08-04: zero occurrences
   * on the first screen). This hook reads the sidecar once and puts that one fact in
   * a quiet INDEX row.
   */
  const sourceProjectSlug = projectSlugForSource(selectedOntologyNode);
  const usableVaultHandle =
    vault.status === "loaded" || vault.isReloadingSameVault ? vault.handle : null;
  const projectSource = useProjectSourceModel({
    projectSlug: sourceProjectSlug,
    vaultHandle: usableVaultHandle,
    nodes: ontologyInsight?.nodes ?? [],
    docs: vault.manifest?.docs ?? [],
    // Even the OS folder picker's title must be in the screen's language: measured
    // 2026-08-04, the installed app opened an English-titled picker over a Korean
    // screen.
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
    // Since connections/measurement do not change the markdown graph, waiting for manifest update means it will never
    // re-parse. The selected project model and the latest completed ACP source-binding receipt
    // invalidate this read-only sidecar summary without rescanning the ontology.
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

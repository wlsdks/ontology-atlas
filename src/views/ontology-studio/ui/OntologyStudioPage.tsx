"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { EmptyState, useToast } from "@/shared/ui";
import { buildStudioItem, selectDefaultStudioNodeId } from "../lib/build-studio-item";
import { StudioArena, type StudioArenaLabels } from "./StudioArena";

/**
 * `/ontology/studio` — the Ontology Studio "강화(enhancement) screen". Slice 1
 * is READ-ONLY: it reads a node's real relations from the derived ontology
 * (`useOntologyInsight` — the SAME source as the map/insights) and renders it
 * as a game item with equipped relation gems, enhancement sockets, and a
 * deterministic completeness score. The 강화하기 / 넣기 / 에이전트 buttons render
 * with the right affordance but only surface a "next slice" notice — no writes.
 *
 * Node selection: `?node=<id>` deeplink wins; otherwise the most-connected
 * capability in the active vault (or the built-in dogfood/storefront sample) is
 * chosen deterministically.
 */

// Static particle seeds — deterministic so SSR (static export) and the client
// render the same DOM (no hydration mismatch from Math.random).
const PARTICLE_SEEDS = [
  { left: 14, top: 62, dur: 6.1, delay: 0.4, opacity: 0.5 },
  { left: 28, top: 48, dur: 7.3, delay: 2.1, opacity: 0.42 },
  { left: 41, top: 78, dur: 5.4, delay: 1.0, opacity: 0.6 },
  { left: 52, top: 55, dur: 8.0, delay: 3.4, opacity: 0.36 },
  { left: 63, top: 82, dur: 6.7, delay: 0.9, opacity: 0.55 },
  { left: 74, top: 44, dur: 7.8, delay: 4.2, opacity: 0.4 },
  { left: 86, top: 70, dur: 5.9, delay: 2.6, opacity: 0.48 },
  { left: 20, top: 84, dur: 6.4, delay: 1.7, opacity: 0.52 },
  { left: 35, top: 40, dur: 7.1, delay: 3.0, opacity: 0.38 },
  { left: 48, top: 90, dur: 5.6, delay: 0.2, opacity: 0.58 },
  { left: 58, top: 46, dur: 8.2, delay: 2.9, opacity: 0.34 },
  { left: 69, top: 76, dur: 6.0, delay: 1.4, opacity: 0.5 },
  { left: 80, top: 52, dur: 7.5, delay: 3.7, opacity: 0.44 },
  { left: 90, top: 66, dur: 6.3, delay: 0.7, opacity: 0.46 },
] as const;

export function OntologyStudioPage() {
  const t = useTranslations("ontologyStudio");
  const searchParams = useSearchParams();
  const { insight } = useOntologyInsight();
  const kindLabel = useOntologyKindLabel();
  const toast = useToast();

  const requestedNode = searchParams.get("node");

  const item = useMemo(() => {
    const nodes = insight?.nodes ?? [];
    const edges = insight?.edges ?? [];
    if (nodes.length === 0) return null;
    const targetId =
      (requestedNode && nodes.some((n) => n.id === requestedNode) ? requestedNode : null) ??
      selectDefaultStudioNodeId(nodes, edges);
    if (!targetId) return null;
    return buildStudioItem(targetId, nodes, edges);
  }, [insight, requestedNode]);

  const onDeferredAction = useCallback(() => {
    toast.show(t("nextSlice"), "info");
  }, [toast, t]);

  const labels: StudioArenaLabels = useMemo(
    () => ({
      mode: t("mode"),
      close: t("close"),
      statsTitle: t("statsTitle"),
      socketsTitle: t("socketsTitle"),
      axis: {
        definition: t("axis.definition"),
        evidence: t("axis.evidence"),
        contains: t("axis.contains"),
        dependsOn: t("axis.dependsOn"),
        relates: t("axis.relates"),
        isA: t("axis.isA"),
      },
      statConfirmed: t("statConfirmed"),
      statMissing: t("statMissing"),
      level: (from, to) => t("level", { from, to }),
      levelMax: (level) => t("levelMax", { level }),
      gaugeLead: t("gaugeLead"),
      gaugeTrail: t("gaugeTrail"),
      gaugeMax: (percent) => t("gaugeMax", { percent }),
      isaTag: t("isaTag"),
      isaPrompt: (title) => t("isaPrompt", { title }),
      relationMeta: (count) => t("relationMeta", { count }),
      relatesPick: t("relatesPick"),
      relatesEmptyHint: t("relatesEmptyHint"),
      add: t("add"),
      readOnlyNote: t("readOnlyNote"),
      enhance: t("enhance"),
      enhanceSub: t("enhanceSub"),
      agent: t("agent"),
    }),
    [t],
  );

  if (!item) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6">
        <EmptyState title={t("emptyTitle")} description={t("emptyBody")} tone="solid" align="center" />
      </div>
    );
  }

  return (
    <StudioArena
      item={item}
      labels={labels}
      kindLabel={kindLabel}
      onDeferredAction={onDeferredAction}
      particleSeeds={PARTICLE_SEEDS}
    />
  );
}

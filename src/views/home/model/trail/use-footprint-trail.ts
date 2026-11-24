"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { requestOntologyMapFrame } from "@/widgets/ontology-map";
import { copyText } from "@/shared/lib/clipboard/copy-text";
import { COPY_FEEDBACK_RESET_MS } from "@/shared/lib/clipboard/use-copy-feedback";

import {
  buildTrailStepLinks,
  collapseFootprintTrail,
  formatFootprintTrailAgentPacket,
  TRAIL_STEP_UNRELATED,
  type FootprintTrailEntry,
  type TrailEdge,
  type TrailStepCaption,
} from "../../lib/trail/footprint-trail";
import {
  adoptSessionTrailScope,
  clearSessionTrail,
  useSessionTrailSteps,
  visitSessionTrail,
} from "./session-trail-store";

type InsightNode = { id: string } & NonNullable<Parameters<typeof resolveNodeAgentTarget>[0]>;

interface FootprintGraphNode {
  id: string;
  label: string;
  kind: string;
}

export interface UseFootprintTrailArgs {
  /** The open folder's session identity, null until the folder is known. */
  trailScope: string | null;
  canvasSelectedSlug: string | null;
  graphNodes: readonly FootprintGraphNode[];
  insightNodes: readonly InsightNode[] | undefined;
  insightEdges: readonly TrailEdge[] | undefined;
  relationLabelOf: (type: string) => string;
}

export interface UseFootprintTrailResult {
  footprintTrailEntries: FootprintTrailEntry[];
  footprintTrailStepCaptions: (TrailStepCaption | null)[];
  footprintVisitedIds: string[];
  footprintPacketCopied: boolean;
  copyFootprintPacket: () => Promise<void>;
  clearFootprintTrail: () => void;
  footprintLensActiveRef: RefObject<boolean>;
  footprintBrushNodeIdRef: RefObject<string | null>;
  handleFootprintLens: (active: boolean) => void;
  handleFootprintBrush: (id: string | null) => void;
}

export function useFootprintTrail({
  trailScope,
  canvasSelectedSlug,
  graphNodes,
  insightNodes,
  insightEdges,
  relationLabelOf,
}: UseFootprintTrailArgs): UseFootprintTrailResult {
  const t = useTranslations("topology");
  const footprintTrail = useSessionTrailSteps(trailScope);
  // The selection that arrives with a folder switch still names the old folder's concept.
  useEffect(() => {
    if (!trailScope) return;
    if (adoptSessionTrailScope(trailScope) === "switched") return;
    if (canvasSelectedSlug) visitSessionTrail(trailScope, canvasSelectedSlug);
  }, [trailScope, canvasSelectedSlug]);
  const clearFootprintTrail = useCallback(() => {
    if (trailScope) clearSessionTrail(trailScope);
  }, [trailScope]);
  // Refined against the live graph, so a deleted concept leaves the trail in memory only.
  const footprintNodeLookup = useMemo(
    () => new Map(graphNodes.map((n) => [n.id, n])),
    [graphNodes],
  );
  const insightNodeById = useMemo(
    () => new Map((insightNodes ?? []).map((n) => [n.id, n])),
    [insightNodes],
  );
  /**
   * Only the last visit per concept, since repeating a concept in the packet is noise; the map
   * keeps the raw steps.
   */
  const footprintTrailEntries = useMemo<FootprintTrailEntry[]>(() => {
    const entries: FootprintTrailEntry[] = [];
    for (const id of collapseFootprintTrail(footprintTrail)) {
      const node = footprintNodeLookup.get(id);
      if (!node) continue;
      const target = resolveNodeAgentTarget(insightNodeById.get(id));
      entries.push({
        id,
        title: node.label,
        kind: node.kind,
        slug: target.documented ? target.ref : null,
      });
    }
    return entries;
  }, [footprintTrail, footprintNodeLookup, insightNodeById]);
  const footprintVisitedIds = useMemo(
    () => footprintTrail.filter((id) => footprintNodeLookup.has(id)),
    [footprintTrail, footprintNodeLookup],
  );
  /**
   * How each row's last visit was reached (`relation_notes`), shared by the timeline and the
   * packet. The edge scan and the naming stay in two memos because `relationLabelOf` is a new
   * closure every render.
   */
  const footprintTrailStepLinks = useMemo(
    () =>
      buildTrailStepLinks(
        footprintTrail,
        footprintTrailEntries.map((entry) => entry.id),
        insightEdges ?? [],
      ),
    [footprintTrail, footprintTrailEntries, insightEdges],
  );
  const footprintTrailStepCaptions = useMemo<(TrailStepCaption | null)[]>(
    () =>
      footprintTrailStepLinks.map((link) =>
        link === null || link === TRAIL_STEP_UNRELATED
          ? link
          : { relationLabel: relationLabelOf(link.type), reason: link.reason },
      ),
    [footprintTrailStepLinks, relationLabelOf],
  );
  const [footprintPacketCopied, setFootprintPacketCopied] = useState(false);
  useEffect(() => {
    if (!footprintPacketCopied) return;
    const timer = window.setTimeout(() => setFootprintPacketCopied(false), COPY_FEEDBACK_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [footprintPacketCopied]);
  const copyFootprintPacket = useCallback(async () => {
    if (footprintTrailEntries.length === 0) return;
    const ok = await copyText(
      formatFootprintTrailAgentPacket(
        footprintTrailEntries,
        {
          title: t("footprint.packetTitle"),
          order: t("footprint.packetOrder"),
          reviewHint: t("footprint.packetReviewHint"),
          undocumented: t("footprint.packetUndocumented"),
          pathHint: t("footprint.packetPathHint"),
          unrelated: t("footprint.stepUnrelated"),
        },
        footprintTrailStepCaptions,
      ),
    );
    if (!ok) return;
    setFootprintPacketCopied(true);
  }, [footprintTrailEntries, footprintTrailStepCaptions, t]);
  // Footprint lens: true while the popover is open, with no new mode or URL state. The map dims
  // ego edges and keeps only visited nodes lit; no trail line is drawn, since a line means a
  // relation. Refs, not state, because state re-rendered the page tree on every toggle and hover.
  const footprintLensActiveRef = useRef(false);
  const footprintBrushNodeIdRef = useRef<string | null>(null);
  const handleFootprintLens = useCallback((active: boolean) => {
    footprintLensActiveRef.current = active;
    requestOntologyMapFrame();
    // The lens also dims the DOM panel that declares `data-attention-role="supporting-detail"`,
    // which otherwise takes the eye from the map. A dataset attribute costs no render; hover or
    // focus brings the panel back.
    if (typeof document !== "undefined") {
      if (active) document.documentElement.dataset.trailLens = "on";
      else delete document.documentElement.dataset.trailLens;
    }
  }, []);
  const handleFootprintBrush = useCallback((id: string | null) => {
    footprintBrushNodeIdRef.current = id;
    requestOntologyMapFrame();
  }, []);
  return {
    footprintTrailEntries,
    footprintTrailStepCaptions,
    footprintVisitedIds,
    footprintPacketCopied,
    copyFootprintPacket,
    clearFootprintTrail,
    footprintLensActiveRef,
    footprintBrushNodeIdRef,
    handleFootprintLens,
    handleFootprintBrush,
  };
}

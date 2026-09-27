"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";
import { COPY_FEEDBACK_RESET_MS } from "@/shared/lib/use-copy-feedback";

import {
  appendFootprintVisit,
  buildTrailStepLinks,
  collapseFootprintTrail,
  formatFootprintTrailAgentPacket,
  type FootprintTrailEntry,
  type TrailEdge,
  type TrailStepCaption,
} from "../lib/footprint-trail";

type InsightNode = { id: string } & NonNullable<Parameters<typeof resolveNodeAgentTarget>[0]>;

interface FootprintGraphNode {
  id: string;
  label: string;
  kind: string;
}

export interface UseFootprintTrailArgs {
  /** Null without ego focus. */
  canvasSelectedSlug: string | null;
  /** The trail is refined against it. */
  graphNodes: readonly FootprintGraphNode[];
  /** Names the handoff packet's targets. */
  insightNodes: readonly InsightNode[] | undefined;
  dustySlugs: ReadonlySet<string>;
  /** Read for the reason each consecutive pair is connected. */
  insightEdges: readonly TrailEdge[] | undefined;
  /** In the reader's current register (`relationVocabulary`). */
  relationLabelOf: (type: string) => string;
}

export interface UseFootprintTrailResult {
  setFootprintTrail: (trail: string[]) => void;
  lastVisitedNodeRef: RefObject<string | null>;
  footprintNodeLookup: ReadonlyMap<string, FootprintGraphNode>;
  /** Last visit per node, for the chip and the handoff packet. */
  footprintTrailEntries: FootprintTrailEntry[];
  /** Aligned with `footprintTrailEntries`; index 0 is null. */
  footprintTrailStepCaptions: (TrailStepCaption | null)[];
  /** Raw visit order minus deleted nodes, for the map's step numbers. */
  footprintVisitedIds: string[];
  footprintPacketCopied: boolean;
  copyFootprintPacket: () => Promise<void>;
  footprintLensActiveRef: RefObject<boolean>;
  footprintBrushNodeIdRef: RefObject<string | null>;
  handleFootprintLens: (active: boolean) => void;
  handleFootprintBrush: (id: string | null) => void;
}

/**
 * Appended whenever a node takes ego focus; not in the URL or storage, cleared on reload.
 * One ordered array feeds the map's footprint rings and the trail chip.
 */
export function useFootprintTrail({
  canvasSelectedSlug,
  graphNodes,
  insightNodes,
  dustySlugs,
  insightEdges,
  relationLabelOf,
}: UseFootprintTrailArgs): UseFootprintTrailResult {
  const t = useTranslations("topology");
  const [footprintTrail, setFootprintTrail] = useState<string[]>([]);
  // Skips an immediate repeat of the same node; revisits between different nodes still append.
  const lastVisitedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (lastVisitedNodeRef.current === canvasSelectedSlug) return;
    lastVisitedNodeRef.current = canvasSelectedSlug;
    setFootprintTrail((trail) => appendFootprintVisit(trail, canvasSelectedSlug));
  }, [canvasSelectedSlug]);
  // Refined against the live graph so a deleted node cannot linger: the trail is display, never a
  // source.
  const footprintNodeLookup = useMemo(
    () => new Map(graphNodes.map((n) => [n.id, n])),
    [graphNodes],
  );
  /**
   * Only the last visit per node, since repeating `get_concept` is noise; the map keeps the raw
   * steps.
   */
  const footprintTrailEntries = useMemo<FootprintTrailEntry[]>(() => {
    const entries: FootprintTrailEntry[] = [];
    for (const id of collapseFootprintTrail(footprintTrail)) {
      const node = footprintNodeLookup.get(id);
      if (!node) continue;
      // The name the vault knows, not the canvas id.
      const target = resolveNodeAgentTarget(insightNodes?.find((n) => n.id === id));
      entries.push({
        id,
        title: node.label,
        kind: node.kind,
        agentRef: target.ref,
        documented: target.documented,
      });
    }
    return entries;
  }, [footprintTrail, footprintNodeLookup, insightNodes]);
  /** Never collapsed: the map's step numbers need the repeats. */
  const footprintVisitedIds = useMemo(
    () => footprintTrail.filter((id) => footprintNodeLookup.has(id)),
    [footprintTrail, footprintNodeLookup],
  );
  /**
   * The reason each step follows the last (`relation_notes`), shared by the timeline and the
   * packet.
   * The edge scan and the naming stay in two memos because `relationLabelOf` is a new closure
   * every render.
   */
  const footprintTrailStepLinks = useMemo(
    () => buildTrailStepLinks(footprintTrailEntries.map((entry) => entry.id), insightEdges ?? []),
    [footprintTrailEntries, insightEdges],
  );
  const footprintTrailStepCaptions = useMemo<(TrailStepCaption | null)[]>(
    () =>
      footprintTrailStepLinks.map((link) =>
        link ? { relationLabel: relationLabelOf(link.type), reason: link.reason } : null,
      ),
    [footprintTrailStepLinks, relationLabelOf],
  );
  const [footprintPacketCopied, setFootprintPacketCopied] = useState(false);
  // See `COPY_FEEDBACK_RESET_MS`.
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
          pathHint: t("footprint.packetPathHint"),
          dustyHint: t("footprint.packetDustyHint", { count: dustySlugs.size }),
          unrelated: t("footprint.stepUnrelated"),
        },
        [...dustySlugs],
        footprintTrailStepCaptions,
      ),
    );
    if (!ok) return;
    setFootprintPacketCopied(true);
  }, [footprintTrailEntries, footprintTrailStepCaptions, dustySlugs, t]);
  // Footprint lens: true while the popover is open, with no new mode or URL state. The map dims
  // ego edges and
  // keeps only visited nodes lit; no trail line is drawn, since a line means a relation.
  // Refs, not state, because state re-rendered the page tree on every toggle and hover.
  const footprintLensActiveRef = useRef(false);
  const footprintBrushNodeIdRef = useRef<string | null>(null);
  const handleFootprintLens = useCallback((active: boolean) => {
    footprintLensActiveRef.current = active;
    // The lens also dims the DOM panel that declares `data-attention-role="supporting-detail"`,
    // which otherwise
    // takes the eye from the map. A dataset attribute costs no render; hover or focus brings the
    // panel back.
    if (typeof document !== "undefined") {
      if (active) document.documentElement.dataset.trailLens = "on";
      else delete document.documentElement.dataset.trailLens;
    }
  }, []);
  const handleFootprintBrush = useCallback((id: string | null) => {
    footprintBrushNodeIdRef.current = id;
  }, []);
  return {
    setFootprintTrail,
    lastVisitedNodeRef,
    footprintNodeLookup,
    footprintTrailEntries,
    footprintTrailStepCaptions,
    footprintVisitedIds,
    footprintPacketCopied,
    copyFootprintPacket,
    footprintLensActiveRef,
    footprintBrushNodeIdRef,
    handleFootprintLens,
    handleFootprintBrush,
  };
}

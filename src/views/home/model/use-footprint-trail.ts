"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";

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
  /** The node currently holding ego focus on the canvas, or null. */
  canvasSelectedSlug: string | null;
  /** The live map graph; the trail is refined against it. */
  graphNodes: readonly FootprintGraphNode[];
  /** Vault-side nodes, used to name the handoff packet's targets. */
  insightNodes: readonly InsightNode[] | undefined;
  /** Slugs the packet flags as dusty. */
  dustySlugs: ReadonlySet<string>;
  /** Vault edges, read for the reason each consecutive pair is connected. */
  insightEdges: readonly TrailEdge[] | undefined;
  /** Names a relation type in the reader's current register (`relationVocabulary`). */
  relationLabelOf: (type: string) => string;
}

export interface UseFootprintTrailResult {
  setFootprintTrail: (trail: string[]) => void;
  lastVisitedNodeRef: RefObject<string | null>;
  footprintNodeLookup: ReadonlyMap<string, FootprintGraphNode>;
  /** Collapsed trail (last visit per node) for the chip and the handoff packet. */
  footprintTrailEntries: FootprintTrailEntry[];
  /**
   * How each entry connects to the one before it, aligned index-for-index with
   * `footprintTrailEntries`. Index 0 is null: the oldest step has no predecessor.
   */
  footprintTrailStepCaptions: (TrailStepCaption | null)[];
  /** Raw visit order with deleted nodes removed, for the map's step numbers. */
  footprintVisitedIds: string[];
  footprintPacketCopied: boolean;
  copyFootprintPacket: () => Promise<void>;
  footprintLensActiveRef: RefObject<boolean>;
  footprintBrushNodeIdRef: RefObject<string | null>;
  handleFootprintLens: (active: boolean) => void;
  handleFootprintBrush: (id: string | null) => void;
}

/**
 * Footprint trail — the path walked so far, appended each time a node takes ego
 * focus on the map. It is not a mode but a passive record layer over the map: not
 * in the URL, never in localStorage, cleared on reload. The same ordered array
 * feeds the map (recency-decayed footprint rings) and the trail chip (mini
 * timeline + handoff packet).
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
  // Guards against appending the same node twice in a row (clicking the background
  // and reselecting). Revisits between two different nodes still append and so
  // refresh the order.
  const lastVisitedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (lastVisitedNodeRef.current === canvasSelectedSlug) return;
    lastVisitedNodeRef.current = canvasSelectedSlug;
    setFootprintTrail((trail) => appendFootprintVisit(trail, canvasSelectedSlug));
  }, [canvasSelectedSlug]);
  // id → label/kind lookup. The trail is refined against the live graph so a deleted
  // node cannot linger in it — the trail is a derived display layer, never a source.
  const footprintNodeLookup = useMemo(
    () => new Map(graphNodes.map((n) => [n.id, n])),
    [graphNodes],
  );
  /**
   * The **collapsed** trail the timeline and the handoff packet read: only the last
   * visit to each node. The raw `footprintTrail` keeps the steps walked back over,
   * which is what numbers the map, but handing an agent the same `get_concept` three
   * times is noise, not information.
   */
  const footprintTrailEntries = useMemo<FootprintTrailEntry[]>(() => {
    const entries: FootprintTrailEntry[] = [];
    for (const id of collapseFootprintTrail(footprintTrail)) {
      const node = footprintNodeLookup.get(id);
      if (!node) continue;
      // The handoff packet carries the name the vault knows, not the canvas node id.
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
  /**
   * The visit ids handed to the map: the **raw** order with only deleted nodes
   * filtered out, never collapsed. Only the map needs the repeated steps — the step
   * numbers (`buildFootprintSteps`) come from them, and the recency rank collapses on
   * last appearance anyway. Sending the collapsed list would erase "I came here three
   * times" from the screen.
   */
  const footprintVisitedIds = useMemo(
    () => footprintTrail.filter((id) => footprintNodeLookup.has(id)),
    [footprintTrail, footprintNodeLookup],
  );
  /**
   * The reason each step follows the one before it. The trail used to carry names and
   * distances only, which records *where* the reader went and drops *why they could go
   * there* — and the why (`relation_notes`) is the durable thing this product keeps. Both
   * the timeline rows and the handoff packet read this one derivation, so the screen and
   * the agent are told the same thing.
   */
  // Two steps on purpose. Scanning every vault edge is the expensive half and depends
  // only on the walk and the graph; `relationLabelOf` comes from `useTranslations` and is
  // a fresh closure on every render, so naming is kept in its own memo. Fused, one render
  // of the page would re-scan the whole edge list.
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
    window.setTimeout(() => setFootprintPacketCopied(false), 1600);
  }, [footprintTrailEntries, footprintTrailStepCaptions, dustySlugs, t]);
  // Footprint lens — a transient state **equivalent to** the popover being open: no
  // new mode, toggle, or URL state. While it is open the map folds away relation
  // reading (the ego highlight edges) and yields to trail reading — only visited
  // nodes keep their values and labels, everything else and every edge falls back
  // to the existing dim values. Those ego edges were the blue lines the owner called
  // *"dizzying"*. No trail polyline is drawn (in this product a line means a
  // relation); the field is simply cleared for the moment of reading.
  //
  // The lens flag and the brush are **refs, not state**. As state, every toggle and
  // every row hover re-renders the whole page tree (measured: ~100 ms per switch,
  // 68–109 ms per hover — squarely in "sticky" territory). The canvas loop reads refs
  // every frame anyway, so the same picture costs zero renders.
  const footprintLensActiveRef = useRef(false);
  const footprintBrushNodeIdRef = useRef<string | null>(null);
  const handleFootprintLens = useCallback((active: boolean) => {
    footprintLensActiveRef.current = active;
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

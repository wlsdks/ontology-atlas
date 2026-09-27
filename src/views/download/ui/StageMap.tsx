'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { OntologyMap, clearOntologyMapTokensCache } from '@/widgets/ontology-map';
import type { TierRevealConfig } from '@/widgets/ontology-map';
import { buildStageGraph, type StageGraph } from '../lib/stage-graph';

/** Every tier shows at the entry zoom, so the drawing matches the count in the caption. */
const GATEWAY_TIER_REVEAL: TierRevealConfig = {
  capability: { enterRatio: 0.35, fullRatio: 0.65 },
  element: { enterRatio: 0.45, fullRatio: 0.8 },
};

/**
 * The one graph the caption counts and the map draws. Pinned to this repository's vault, not the
 * session's choice; memoised per locale, so two callers derive once.
 */
export function useStageGraph(): StageGraph {
  const insight = useDogfoodInsight();
  return useMemo(() => buildStageGraph(insight.nodes, insight.edges), [insight]);
}

/**
 * The demo drives the two engine states a pointer produces, so it is the same machinery on a
 * timer (`docs/DECISIONS.md` 2026-08-23 (106)).
 */
export interface StageScriptedFocus {
  selectedSlug: string | null;
  emphasizedSlug: string | null;
}

export function StageMap({
  graph,
  scripted = null,
  onUserInteract,
}: {
  graph: StageGraph;
  scripted?: StageScriptedFocus | null;
  /** The first pointer act cancels the demo script: the hand wins. */
  onUserInteract?: () => void;
}) {
  const t = useTranslations('download');
  const [selected, setSelected] = useState<string | null>(null);
  /** Without it the engine's pressable cluster chip does nothing; session state, not URL. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    /* All expanded, or folded chips make the drawing disagree with the caption. */
    () => new Set(graph.nodes.map((node) => node.id)),
  );

  /**
   * Starts at 0 and rises a tick after mount, or the engine's baseline of 0 swallows it and the
   * map arrives as a hard cut instead of settling (`tests/contract/gateway-map-reveal.contract.test.ts`).
   */
  const [revealToken, setRevealToken] = useState(0);

  /**
   * Sets html[data-gateway-stage] on the root, since the canvas reads numeric tokens once from the
   * root and caches them. Reverted on unmount, or `/topology` inherits the camera ceiling. The map
   * mounts only after it is set, or child effects cache the tokens first.
   */
  const [scoped, setScoped] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-gateway-stage', '');

    clearOntologyMapTokensCache();
    // This setState is the ordering contract above; one extra render beats touching the DOM in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScoped(true);

    return () => {
      root.removeAttribute('data-gateway-stage');
      clearOntologyMapTokensCache();
    };
  }, []);

  /** Revealed on first entering the viewport, since it sits below the fold; at once without IntersectionObserver. */
  useEffect(() => {
    if (!scoped) return;
    let raf = 0;
    const arm = () => {
      raf = requestAnimationFrame(() => setRevealToken(1));
    };
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      arm();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          arm();
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [scoped]);

  const toggleCluster = useCallback((parentId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  if (!scoped || graph.nodes.length === 0) return null;

  return (
    <div ref={frameRef} className="download-stage-map absolute inset-0" data-testid="download-stage-map">
      <OntologyMap
        nodes={graph.nodes}
        edges={graph.edges}
        focus={{ selectedSlug: scripted ? scripted.selectedSlug : selected }}
        emphasizedNeighborSlug={scripted?.emphasizedSlug ?? null}
  // No "fit map" button here, so one fit per mount.
        fitViewToken={1}
        relayoutToken={1}
        revealToken={revealToken}
        onSelect={(slug) => {
          onUserInteract?.();
          setSelected(slug);
        }}
        onPaneClick={() => {
          onUserInteract?.();
          setSelected(null);
        }}
        expandedParents={expanded}
        onToggleCluster={toggleCluster}
        tierReveal={GATEWAY_TIER_REVEAL}
        /* Every tier is drawn from entry, so the fit is the full graph, not the workbench's spine. */
        overviewFit="full"
        clusterHint={t('stageClusterHint')}
        canvasLabel={t('stageMapLabel')}
        // The wheel scrolls the page; zoom is a pinch only.
        wheelIntent="page-scroll"
        // No reading task here, so it sleeps within seconds of the last touch.
        ambientSleepDelayMs={3000}
      />
    </div>
  );
}

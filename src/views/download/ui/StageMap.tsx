'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDogfoodInsight } from '@/features/vault-ontology';
import { TopologyMapV2, clearTopologyV2TokensCache } from '@/widgets/topology-map-v2';
import type { TierRevealConfig } from '@/widgets/topology-map-v2';
import { buildStageGraph, type StageGraph } from '../lib/stage-graph';

/**
 * Tier reveal for the gateway's evidence section — **draw as many as the caption counts**
 * (owner report 2026-08-18: a drawing of 8 under a caption reading "81 concepts").
 *
 * The workbench's default reveal bands (capability 1.5–2.0, element 2.3–2.85) are the grammar
 * of a task screen: the overview shows only the skeleton and zooming in adds a tier at a time.
 * The evidence section's job is not a task but **proof** — if the caption says "81 concepts ·
 * 107 relations" and the screen draws 8, this page's honesty contract (caption and map are one
 * graph) is betrayed to the eye. So the bands are pulled forward so every tier is already
 * visible at the entry zoom (zoomRatio 1). Zooming out still leaves only the skeleton — the
 * reveal moved earlier, the gate was not removed.
 */
const GATEWAY_TIER_REVEAL: TierRevealConfig = {
  capability: { enterRatio: 0.35, fullRatio: 0.65 },
  element: { enterRatio: 0.45, fullRatio: 0.8 },
};

/**
 * The graph the stage draws — **caption and map look at the same object.**
 *
 * The map used to draw this derived graph while the caption printed the frontmatter file count
 * from the build script (`DOGFOOD_CENSUS`, 96). Two definitions on one screen, and measured, the
 * map had **287** nodes — the caption understated by 3×. A caption must count the picture it
 * describes.
 *
 * `useDogfoodInsight` memoizes per locale, so calling it from two places derives once.
 */
export function useStageGraph(): StageGraph {
  const insight = useDogfoodInsight();
  return useMemo(() => buildStageGraph(insight.nodes, insight.edges), [insight]);
}

/**
 * The stage's map — **it is the real engine** (owner instruction 2026-07-28:
 * *"ours is far prettier; I want dragging on the right to move it, like the real thing, like
 * using it"*
 * — ours is far prettier; I want dragging on the right to move it, like the real thing, like
 * using it).
 *
 * **Why the static portrait was dropped.** The previous version was an SVG portrait baked at
 * build time. The logic was right ("do not build a second workbench on the gateway") but it
 * **optimized the wrong thing** — if this page's job is to sell the service, no argument is
 * stronger than **letting someone actually handle what is being sold**. A hand-drawn likeness
 * is worse than the real thing no matter how polished, and a visitor spots the difference exactly.
 *
 * **So what is protected instead.** What keeps the gateway from becoming a workbench was never
 * *not using the engine* — it was **not attaching the chrome**. So there is no INDEX panel, no
 * detail datasheet, no control bar. What remains is the map's own feel: it pushes when dragged,
 * settles with inertia, and focuses a node when you press it. Anyone who wants more is sent to
 * "open the map in the browser" and to the app.
 *
 * **Data.** The graph comes from `useStageGraph()` above and is **shared with the caption** —
 * the number the caption counts and the dots drawn here must be the same object for this page's
 * honesty contract to hold.
 *
 * `useDogfoodInsight()` **pins the source**. `useOntologyInsight()` follows the session's choice
 * (a local vault, the storefront sample), which produced a caption claiming "this repository's
 * docs/ontology · 96 concepts" while drawing the storefront's 7 nodes (measured 2026-07-28, the
 * first engine mount). What the stage claims and what it draws must be the same vault.
 */
/**
 * The scripted focus the evidence demo drives — `null` when no script is running.
 *
 * The engine states used are the two a person's own pointer would produce (`focus.selectedSlug`
 * ego focus, `emphasizedNeighborSlug` panel-hover emphasis) — the demo is the same machinery on a
 * timer, not a parallel presentation layer. `docs/DECISIONS.md` 2026-08-23 (106).
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
  /**
   * Fired on the first pointer act (node press or pane click). The parent cancels the script —
   * the map is "an object to handle", so the moment a hand lands on it, the hand wins.
   */
  onUserInteract?: () => void;
}) {
  const t = useTranslations('download');
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * Parents whose collapsed children have been expanded. **Without this state the cluster chip
   * (`+17`) is a dead affordance** — the engine draws it as pressable, and with no receiver
   * pressing it does nothing (measured 2026-07-28, the first engine mount). Something that looks
   * pressable must be pressed, or must not look that way.
   *
   * No URL round trip — the gateway's map is an object to handle, not shared state, so expansion
   * is session state that may vanish when this screen is left.
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    /**
     * Everything starts expanded (2026-08-18), for the same reason as `GATEWAY_TIER_REVEAL`
     * above: if the density gate folds children into a chip (`+17`), the number the caption
     * counts diverges from the number drawn. Seeding every node id is safe — the gate looks only
     * at parents present in `childrenByParent`, so surplus ids are harmless, and pressing a chip
     * to collapse again still works through `toggleCluster`.
     */
    () => new Set(graph.nodes.map((node) => node.id)),
  );

  /**
   * The first-map reveal token — **it wakes choreography the engine already has** (motion seat
   * verdict, 2026-07-29).
   *
   * The reveal in `use-topology-loop.ts` gathers every node at the project node's home and
   * settles them into place with a homing spring (critically damped, with a reduced-motion snap
   * built in). It is an existing mechanism with zero new motion contracts, but `revealToken={1}`
   * was passed here **as a constant** and therefore never fired — the engine's comparison basis
   * (`lastRevealTokenRef`) starts at 0, so the first mount swallows the increment. Measured on
   * p(t), the canvas produced a finished map in **one hard-cut frame** (first effective frame
   * diff 5042/5044).
   *
   * This page's only sales argument is "this is not a picture, it is a live engine", so if the
   * moment of arrival is a dead picture the argument collapses in the first frame. Seeing it
   * settle *is* the proof of the physics.
   *
   * Why it waits one rAF tick: the 0→1 transition must be visible **after** the world and loop
   * are ready. On the same frame, the mount swallows it again.
   */
  const [revealToken, setRevealToken] = useState(0);

  /**
   * Turns on the gateway token scope — `html[data-gateway-stage]` in `app/globals.css`.
   *
   * Why a root attribute: the canvas token reader reads the computed style of
   * `document.documentElement` **once and caches it globally**. Putting a class on this
   * component's container makes colours appear to change (CSS inherits them), but **numeric
   * tokens such as the camera ceiling only ever arrive through the reader**, so nothing happens
   * (measured 2026-07-28: only the ink brightened while the map's size did not move one pixel).
   * The repository precedent is `html[data-topology-index="collapsed"]`, which already uses this
   * structure.
   *
   * It must be reverted on unmount, or a client navigation to `/topology` leaves the workbench
   * inheriting the gateway's camera ceiling.
   *
   * ⚠️ **The map must mount *after* this effect.** React runs child effects before the parent's,
   * so drawing the map in the same render reads the tokens **before the attribute is set** and
   * freezes them into the global cache — and after clearing the cache there is no trigger to read
   * again. Measured 2026-07-28: the ink brightened by CSS inheritance while the camera ceiling
   * kept its old value, so the map's size did not move one pixel twice in a row. The `scoped`
   * gate enforces that order.
   */
  const [scoped, setScoped] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-gateway-stage', '');

    /**
     * [Retired 2026-08-18] The camera reserve derivation that lived here (reading
     * `computeGatewaySafeInset`, subscribing to resize, writing
     * `--gateway-safe-inset-left-computed`) was deleted in the remake — with the map in its own
     * (evidence) section rather than behind the panel, the panel cannot cover the map and there
     * is no width to reserve. `tests/e2e/download-gateway-grid.spec.ts` measures the
     * impossibility of overlap by rect.
     */
    clearTopologyV2TokensCache();
    // This setState **is** the ordering contract. Drawing the map in the same render lets React
    // run the child effect first, reading tokens **before the attribute is set** and freezing
    // them into the global cache (measured 2026-07-28: only the camera ceiling kept its old
    // value, so the map failed to grow by even one pixel twice in a row). One extra render pass
    // buys away that race — the alternative is touching the DOM during render, which is worse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScoped(true);

    return () => {
      root.removeAttribute('data-gateway-stage');
      clearTopologyV2TokensCache();
    };
  }, []);

  /**
   * The arrival choreography fires **in front of the viewer** (remake 2026-08-18).
   *
   * It used to raise `revealToken` on the frame after mount, which was correct while the map was
   * the first screen's background and mount *was* the moment of becoming visible. Now that the
   * map lives in the evidence section below the fold, firing at mount finishes the choreography
   * **while nobody is watching**. It is raised one rAF tick after the section first enters the
   * viewport (the same-frame trap where mount swallows the transition still applies —
   * `tests/contract/gateway-map-reveal.contract.test.ts`).
   *
   * Where IntersectionObserver is unavailable (jsdom) it fires immediately.
   */
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

  // The map is not drawn before the scope is on (the ordering contract above).
  if (!scoped || graph.nodes.length === 0) return null;

  return (
    <div ref={frameRef} className="download-stage-map absolute inset-0" data-testid="download-stage-map">
      <TopologyMapV2
        nodes={graph.nodes}
        edges={graph.edges}
        focus={{ selectedSlug: scripted ? scripted.selectedSlug : selected }}
        emphasizedNeighborSlug={scripted?.emphasizedSlug ?? null}
  // The gateway has no "fit map" button, so the token is fixed at one mount.
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
        /**
         * The first camera centres the full node bbox in the frame (owner, 2026-08-18:
         * *"on first load it sat too low; it should be dead centre"* — on first load it sat too low; it
         * should be dead centre). The workbench default (fit to the spine bbox) is the honest
         * frame when only the spine is drawn on entry, but this section draws every tier from
         * entry via `tierReveal` above — and the spine's centre is above the whole graph's mass,
         * so measured at 1512 it sat low with 143px of space above and 17px below. Labels take
         * part in the camera only through the bottom allowance
         * (`OVERVIEW_LABEL_BOTTOM_ALLOWANCE` in camera-math), not through the bbox.
         */
        overviewFit="full"
        clusterHint={t('stageClusterHint')}
        canvasLabel={t('stageMapLabel')}
        // The gateway is a scrolling document — the wheel and vertical swipes belong to the page,
        // and zoom only to an explicit pinch. Drag-pan and click still belong to the map.
        wheelIntent="page-scroll"
        // A gateway session is shorter than a workbench one, and this surface has no reading task
        // carried by comets — alive in your hand, cold within seconds once you put it down.
        ambientSleepDelayMs={3000}
      />
    </div>
  );
}

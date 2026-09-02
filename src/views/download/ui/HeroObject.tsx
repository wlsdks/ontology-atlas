'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { mountHeroObject, type HeroEngineHandle, type HeroGraphData } from '../lib/hero-object-engine';
import { echoFact } from '../lib/hero-echo';
import type { StageGraph } from '../lib/stage-graph';
import { cn } from '@/shared/lib/cn';

/**
 * The hero's split width — **one number, four consumers** (council, 2026-09-02). Above it the
 * plane is the ground beside the type (the section claims the viewport, the caption sits in the
 * plane's corner); below it the plane drops into the plinth under the facts strip. 90rem (1440):
 * measured, 1280–1439 put 8–16% of the plane's ink under the decision block and the trust line,
 * and 1440 is the first band that clears the recovery proof with margin. The three Tailwind
 * consumers spell it as `min-[90rem]:` — `tests/contract/hero-split-width.contract.test.ts` keeps
 * them equal to this constant.
 */
export const HERO_SPLIT_MIN_WIDTH_REM = 90;
const HERO_SPLIT_MEDIA = `(min-width: ${HERO_SPLIT_MIN_WIDTH_REM}rem)`;
const subscribeSplit = (onChange: () => void): (() => void) => {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(HERO_SPLIT_MEDIA);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const readSplit = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(HERO_SPLIT_MEDIA).matches;
/**
 * The phone band (≤40rem, 2026-09-03). In the plinth at 390 the whole graph — 96 nodes — drew
 * into 165px: the element and capability radii were 0.7px apart, below resolution, so the kind
 * channel collapsed and the marks were a texture (infoviz seat). A phone shows the project, the
 * domains, and the capabilities — a typed subset is more honest than an unresolvable whole — and
 * the plane is drawn larger for the nodes it keeps.
 */
const HERO_PHONE_MEDIA = '(max-width: 40rem)';
const subscribePhone = (onChange: () => void): (() => void) => {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(HERO_PHONE_MEDIA);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const readPhone = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(HERO_PHONE_MEDIA).matches;

/**
 * The hero object — the column opposite the type.
 *
 * What it draws is not a mockup but **the same graph as the evidence section's map and caption**
 * (one hook, `useStageGraph`). It assembles as **the typing echo** (Direction B, owner,
 * 2026-08-30): the headline reports each typed character and the engine lights the dots that
 * character has earned (`hero-echo.ts`), so the object's arrival has a visible cause and finishes
 * on the sentence's last beat in every locale. That replaced the stage's own 450ms fade — an
 * entrance with a clock but no cause.
 *
 * At rest a fine pointer on a dot lights that dot and its parent line, and the caption line under
 * the canvas states the one edge the dot is drawn on. The line is **reserved**: it keeps its
 * height empty, so a fact appearing never moves the CTA column beside it, and it truncates, so a
 * long label never leaves its box.
 *
 * `aria-hidden` — because it is **duplicate**, not decoration: the facts drawn here (concept count,
 * relation count, structure) are already carried as text by the evidence caption and the instrument
 * strip. There is no reason to read the same graph to a screen reader twice.
 */
export function HeroObject({
  graph,
  typed,
  total,
}: {
  graph: StageGraph;
  /** How much of the headline is on screen, from `HeroTypewriter`'s `onProgress`. */
  typed: number;
  total: number;
}) {
  const t = useTranslations('download');
  const tKinds = useTranslations('kinds');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<HeroEngineHandle | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /** The latest progress, readable from the mount effect without re-running it. */
  const typingRef = useRef({ typed, total });
  // Synced in an effect, not during render (react-hooks/refs); declared before the mount effect
  // so it runs first in the same commit and the mount effect reads the current values.
  useEffect(() => {
    typingRef.current = { typed, total };
  });
  /**
   * Which placement the stage uses — **reactive** (council, 2026-09-02). Read once at mount, a
   * rotation or resize across the split kept the wrong placement until reload: measured 1512→834
   * without reload, 48% lit under the trust line. The engine remounts on change; a remounted
   * engine inherits the headline's progress (above), which is what made the remount safe.
   */
  const wide = useSyncExternalStore(subscribeSplit, readSplit, () => false);
  const phone = useSyncExternalStore(subscribePhone, readPhone, () => false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graph.nodes.length === 0) return;

    const keep = (kind: StageGraph['nodes'][number]['kind']): boolean => !phone || kind !== 'element';
    const kept = new Set(graph.nodes.filter((node) => keep(node.kind)).map((node) => node.id));
    const data: HeroGraphData = {
      nodes: graph.nodes.filter((node) => kept.has(node.id)).map((node) => ({ s: node.id, k: node.kind })),
      edges: graph.edges
        .filter((edge) => edge.kind === 'contains' || edge.kind === 'depends')
        .filter((edge) => kept.has(edge.source) && kept.has(edge.target))
        .map((edge) => ({ a: edge.source, b: edge.target, y: edge.kind })),
    };

    // `fitPx: 420` — the default 620 is the value for a square stage. Using it on this shorter
    // stage (1/0.62) shrinks the ink to min(W,H)/620 and the object becomes decoration using 66% of
    // the column (measured at 1728: ink 347×311 in a 528×433 box). 420 is the «size we want» (it was
    // 455 and came down as the apex plane tightened to 104 and the envelope shortened — left alone,
    // `fitPx` would bind first and waste the headroom the clamp gives).
    // Not being clipped is guaranteed by the engine's ink-envelope clamp (owner report 2026-08-18:
    // the dome's bottom was clipped by the instrument rule. The engine measures the projected bbox
    // over a full revolution of yaw, puts the vertical centre at the envelope's centre, and reduces
    // an overflowing scale leaving 4% margin — see the envelope doc-block in `hero-object-engine.ts`).
    /**
     * The full-bleed stage (2026-09-02, owner: *"I wanted cool motion or a background effect"*,
     * then *"the size must be right, and it need not be the dome"*). The object is no longer a
     * boxed column beside the type; it is the ground the first screen stands on, in the graph's
     * **plane form** — the same rings seen from a tilted camera. At the split width (`wide`) it is
     * anchored at 72% of the width and 60% of the height, dimmed to 0.55, leaning toward the
     * pointer, and pushed into by the scroll camera; `fitPx` 740 measured an ink box of
     * 798..1408 × 371..879 at 1512×982 — right of the decision block, above the facts strip.
     * Narrower, it drops into the plinth under the strip (`bottomPx`), smaller (`fitPx` 1180),
     * a little brighter (0.7) because nothing sits over it there.
     */
    const scrollHost = (): HTMLElement | null => {
      for (let n: HTMLElement | null = canvas.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if (o === 'auto' || o === 'scroll') return n;
      }
      return null;
    };
    /**
     * Two placements, one breakpoint (`xl`, where the split layout lives). Wide: the plane is
     * the ground beside the decision block, anchored at 72%/60%. Narrow: the block spans the
     * column, so the plane behind it would sit under the buttons (measured 834: 4.4% of the
     * block's pixels lit) — it moves below the facts strip into a fixed 21rem plinth, centred,
     * smaller, and a little brighter since nothing reads over it.
     */
    const handle = mountHeroObject(canvas, data, {
      inkScale: 0.97,
      // `fitPx` is a divisor: the ink scales by min(W, H) / fitPx, so a larger value draws a
      // smaller plane (600 measured 746px wide, 740 the width below; 1180 keeps the narrow
      // plinth's plane under the facts strip — 980 measured its top row behind the links).
      // On a phone the plane keeps three tiers and is drawn larger for them (2026-09-03).
      fitPx: wide ? 740 : phone ? 820 : 1180,
      echo: true,
      onHover: setHover,
      form: 'plane',
      anchor: wide ? { x: 0.72, y: 0.6 } : { x: 0.5, bottomPx: 176 },
      dim: wide ? 0.55 : 0.7,
      tilt: true,
      // The scroll camera runs only at the split width (council, 2026-09-02): below it the plane
      // sits in the plinth under the facts strip, and the lift carried it up through the strip's
      // links — measured 834 at scrollTop 627, 59% lit under the changelog link. Below the split
      // the plane is under the fold anyway, so the camera bought nothing there.
      camera: wide
        ? () => {
            const host = scrollHost();
            const top = host ? host.scrollTop : window.scrollY;
            const h = canvas.getBoundingClientRect().height || 1;
            return top / h;
          }
        : undefined,
    });
    handleRef.current = handle;
    /**
     * A freshly mounted engine inherits the headline's progress (council, 2026-09-02). The
     * `[typed, total]` effect below fires only when those change, so an engine mounted after the
     * last character — a remount on `graph`, HMR — would wait forever for a message that had
     * already gone by, and with `echo` on, an engine that never hears `setTyping` lights nothing:
     * a permanently blank ground with no diagnostic. Measured in the shared window: 0 lit pixels,
     * loop alive, headline complete.
     */
    if (handle && typingRef.current.total > 0) {
      handle.setTyping(typingRef.current.typed, typingRef.current.total);
    }
    // The inspection window for gates, attached only under `?e2e=1` (the map's `__atlasMap` grammar).
    const inspect =
      handle !== null && new URLSearchParams(window.location.search).get('e2e') === '1';
    if (inspect) {
      (window as unknown as { __heroEcho?: unknown }).__heroEcho = {
        lit: () => handle!.litCount(),
        nodes: () => handle!.nodesOnScreen(),
        count: graph.nodes.length,
      };
    }
    return () => {
      handleRef.current = null;
      if (inspect) delete (window as unknown as { __heroEcho?: unknown }).__heroEcho;
      handle?.dispose();
    };
  }, [graph, wide, phone]);

  useEffect(() => {
    // Before the headline's first report `total` is 0 and there is nothing to echo yet.
    if (total > 0) handleRef.current?.setTyping(typed, total);
  }, [typed, total]);

  const fact = hover !== null ? echoFact(graph, hover) : null;
  const hovered = hover !== null ? graph.nodes.find((n) => n.id === hover) : undefined;
  /* The kind word leads the caption (council, 2026-09-02): the size ramp is the plane's only
     kind channel and nothing stated it — now the first hover teaches it ("capability · …"). */
  const factLine = fact
    ? fact.relation === 'contains'
      ? t('heroFactContains', { parent: fact.from, child: fact.to })
      : t('heroFactDepends', { from: fact.from, to: fact.to })
    : '';
  const caption = factLine && hovered ? `${tKinds(hovered.kind)} · ${factLine}` : factLine;

  return (
    <div
      aria-hidden="true"
      data-testid="gateway-hero-object"
      className="gateway-hero-stage absolute inset-0 min-w-0 overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-pan-y" />
      {/* The reserved caption line: a non-breaking space keeps its height while nothing is pointed
          at, so a fact appearing changes ink, never layout. Below `xl` it sits at the stage's
          upper right on the eyebrow's row, clear of the stacked content; at the split width it
          moves to the plane's own corner, just above the facts strip (7.5rem: the strip's 5.4rem
          plus breath), so the fact appears near the dot that caused it — the council measured the
          upper-right slot 588px from the dot (2026-09-02). */}
      <p
        data-testid="gateway-hero-caption"
        className={cn(
          'gateway-hero-caption pointer-events-none absolute right-[var(--gateway-origin)] top-12 max-w-[40%] truncate text-right font-mono text-label leading-label text-[color:var(--color-text-tertiary)] md:top-16 min-[90rem]:top-auto min-[90rem]:bottom-[7.5rem]',
          caption ? 'is-on' : undefined,
        )}
      >
        {caption || '\u00A0'}
      </p>
    </div>
  );
}

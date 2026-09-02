'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { mountHeroObject, type HeroEngineHandle, type HeroGraphData } from '../lib/hero-object-engine';
import { echoFact } from '../lib/hero-echo';
import type { StageGraph } from '../lib/stage-graph';
import { cn } from '@/shared/lib/cn';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<HeroEngineHandle | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graph.nodes.length === 0) return;

    const data: HeroGraphData = {
      nodes: graph.nodes.map((node) => ({ s: node.id, k: node.kind })),
      edges: graph.edges
        .filter((edge) => edge.kind === 'contains' || edge.kind === 'depends')
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
     * The full-bleed stage (2026-09-02, owner: *"I wanted cool motion or a background effect"*).
     * The dome is no longer a boxed object beside the type; it is the ground the first screen
     * stands on — anchored right of centre, dimmed to 0.62 so the decision block reads over its
     * far side, leaning toward the pointer, and pushed into by the scroll camera. `fitPx` rises
     * with the box: the stage is now the hero's whole area, and 560 keeps the dome about
     * three-fifths of the height at 1512×982 (measured) instead of filling it edge to edge.
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
    const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 80rem)').matches;
    const handle = mountHeroObject(canvas, data, {
      inkScale: 0.97,
      // `fitPx` is a divisor: the ink scales by min(W, H) / fitPx, so a larger value draws a
      // smaller plane (600 measured 746px wide, 740 the width below; 1180 keeps the narrow
      // plinth's plane under the facts strip — 980 measured its top row behind the links).
      fitPx: wide ? 740 : 1180,
      echo: true,
      onHover: setHover,
      form: 'plane',
      anchor: wide ? { x: 0.72, y: 0.6 } : { x: 0.5, bottomPx: 176 },
      dim: wide ? 0.55 : 0.7,
      tilt: true,
      camera: () => {
        const host = scrollHost();
        const top = host ? host.scrollTop : window.scrollY;
        const h = canvas.getBoundingClientRect().height || 1;
        return top / h;
      },
    });
    handleRef.current = handle;
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
  }, [graph]);

  useEffect(() => {
    // Before the headline's first report `total` is 0 and there is nothing to echo yet.
    if (total > 0) handleRef.current?.setTyping(typed, total);
  }, [typed, total]);

  const fact = hover !== null ? echoFact(graph, hover) : null;
  const caption = fact
    ? fact.relation === 'contains'
      ? t('heroFactContains', { parent: fact.from, child: fact.to })
      : t('heroFactDepends', { from: fact.from, to: fact.to })
    : '';

  return (
    <div
      aria-hidden="true"
      data-testid="gateway-hero-object"
      className="gateway-hero-stage absolute inset-0 min-w-0 overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-pan-y" />
      {/* The reserved caption line: a non-breaking space keeps its height while nothing is pointed
          at, so a fact appearing changes ink, never layout. It sits at the stage's upper right,
          on the eyebrow's row — clear of the decision block at every width, unlike the foot,
          where the facts strip wraps to three rows below `lg`. */}
      <p
        data-testid="gateway-hero-caption"
        className={cn(
          'gateway-hero-caption pointer-events-none absolute right-[var(--gateway-origin)] top-12 max-w-[40%] truncate text-right font-mono text-label leading-label text-[color:var(--color-text-tertiary)] md:top-16',
          caption ? 'is-on' : undefined,
        )}
      >
        {caption || '\u00A0'}
      </p>
    </div>
  );
}

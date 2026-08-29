'use client';

import { useEffect, useRef, useState } from 'react';
import { mountHeroObject, type HeroGraphData } from '../lib/hero-object-engine';
import type { StageGraph } from '../lib/stage-graph';
import { cn } from '@/shared/lib/cn';
import { BrandMark } from '@/shared/ui/brand-mark';

/**
 * The hero object — the column opposite the type.
 *
 * What it draws is not a mockup but **the same graph as the evidence section's map and caption**
 * (one hook, `useStageGraph`). The first-three-seconds rule: the type arrives first at 150ms, and
 * this stage assembles its layers from 450ms (the CSS delay on `.gateway-hero-stage` plus the
 * engine's per-layer assembly delay).
 *
 * `aria-hidden` — because it is **duplicate**, not decoration: the facts drawn here (concept count,
 * relation count, structure) are already carried as text by the evidence caption and the instrument
 * strip. There is no reason to read the same graph to a screen reader twice.
 */
export function HeroObject({ graph }: { graph: StageGraph }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

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
    const handle = mountHeroObject(canvas, data, { inkScale: 0.97, fitPx: 420 });
    // Inside a rAF callback, so this is not a synchronous setState in the effect body — the stage
    // brightens on the frame after the engine actually attaches (staying at 0 where there is no canvas context).
    let raf = 0;
    if (handle) raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(raf);
      handle?.dispose();
    };
  }, [graph]);

  return (
    <div
      data-testid="gateway-hero-object"
      aria-hidden="true"
      className={cn('gateway-hero-stage aspect-[1/0.62] w-full max-h-[24rem]', mounted && 'is-in')}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-pan-y" />
      {/* A static brand companion, not a work-state claim. The graph remains the
          hero's product object; this simply closes the identity gap between the
          gateway, the downloaded app icon, and the evidence-bound in-app mascot. */}
      <BrandMark
        detail="full"
        size={128}
        alt=""
        aria-hidden="true"
        loading="eager"
        data-testid="gateway-hero-mascot"
        className="pointer-events-none absolute bottom-0 right-0 z-[1] size-16 select-none md:size-32"
      />
    </div>
  );
}

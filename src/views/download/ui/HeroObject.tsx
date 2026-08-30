'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { mountHeroObject, type HeroEngineHandle, type HeroGraphData } from '../lib/hero-object-engine';
import { echoFact } from '../lib/hero-echo';
import type { StageGraph } from '../lib/stage-graph';
import { cn } from '@/shared/lib/cn';
import { BrandMark } from '@/shared/ui/brand-mark';

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
    const handle = mountHeroObject(canvas, data, {
      inkScale: 0.97,
      fitPx: 420,
      echo: true,
      onHover: setHover,
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
    <div aria-hidden="true" className="min-w-0">
      <div
        data-testid="gateway-hero-object"
        className="gateway-hero-stage aspect-[1/0.62] w-full max-h-[24rem]"
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
      {/* The reserved caption line: a non-breaking space keeps its height while nothing is pointed
          at, so a fact appearing changes ink, never layout. */}
      <p
        data-testid="gateway-hero-caption"
        className={cn(
          'gateway-hero-caption mt-2 truncate font-mono text-label leading-label text-[color:var(--color-text-tertiary)]',
          caption ? 'is-on' : undefined,
        )}
      >
        {caption || ' '}
      </p>
    </div>
  );
}

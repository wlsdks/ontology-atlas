'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { mountHeroObject, type HeroEngineHandle, type HeroGraphData } from '../lib/hero-object-engine';
import { echoFact } from '../lib/hero-echo';
import type { StageGraph } from '../lib/stage-graph';
import { cn } from '@/shared/lib/cn';

/**
 * Below it the plane drops into the plinth under the facts strip; narrower bands put its ink under
 * the decision block. Tailwind spells it `min-[90rem]:`, kept equal by the contract
 * tests/contract/hero-split-width.contract.test.ts.
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
/** A phone drops elements, whose size became indistinguishable from capabilities, and draws the rest larger. */
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
 * The 2D hero: the evidence section's own graph, assembling with the typing echo. `aria-hidden`
 * because the caption and instrument strip already say these facts as text.
 */
export function HeroObject({
  graph,
  typed,
  total,
}: {
  graph: StageGraph;
  /** From `HeroTypewriter`'s `onProgress`. */
  typed: number;
  total: number;
}) {
  const t = useTranslations('download');
  const tKinds = useTranslations('kinds');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<HeroEngineHandle | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const typingRef = useRef({ typed, total });
  // Declared before the mount effect so it runs first in the same commit.
  useEffect(() => {
    typingRef.current = { typed, total };
  });
  /** Reactive, or a resize across the split keeps the wrong placement until reload. */
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

    const scrollHost = (): HTMLElement | null => {
      for (let n: HTMLElement | null = canvas.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if (o === 'auto' || o === 'scroll') return n;
      }
      return null;
    };
    /**
     * Wide, the plane is the ground beside the decision block; narrow, the block spans the column,
     * so the plane moves into the plinth below the facts strip, brighter since nothing covers it.
     */
    const handle = mountHeroObject(canvas, data, {
      inkScale: 0.97,
      // A divisor: larger draws smaller. 1180 keeps the narrow plane below the facts strip's links.
      fitPx: wide ? 620 : phone ? 820 : 1180,
      echo: true,
      onHover: setHover,
      form: 'plane',
      // Wide y 0.5: lower, the near rim crosses the facts strip's rule.
      anchor: wide ? { x: 0.72, y: 0.5 } : { x: 0.5, bottomPx: 176 },
      dim: wide ? 0.55 : 0.7,
      tilt: true,
      // Split width only: below it the lift carried the plane up through the strip's links.
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
    /* A remounted engine inherits progress, or after the last character it stays blank forever. */
    if (handle && typingRef.current.total > 0) {
      handle.setTyping(typingRef.current.typed, typingRef.current.total);
    }
    // For gates, only under `?e2e=1` (as the map's `__atlasMap`).
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

  // Layout effect, so a dot lights in the frame its character appears.
  useLayoutEffect(() => {
    if (total > 0) handleRef.current?.setTyping(typed, total);
  }, [typed, total]);

  const fact = hover !== null ? echoFact(graph, hover) : null;
  const hovered = hover !== null ? graph.nodes.find((n) => n.id === hover) : undefined;
  /* The kind word leads, since size is the plane's only unstated kind channel. */
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
      {/* A non-breaking space reserves the height, so a fact changes ink, never layout. At the
          split it sits in the plane's corner above the facts strip, near the dot that caused it. */}
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

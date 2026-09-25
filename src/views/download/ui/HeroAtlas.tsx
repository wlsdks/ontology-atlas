'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';

import type { AtlasHandle } from '../lib/hero-atlas-scene';
import { echoFact } from '../lib/hero-echo';
import type { StageGraph } from '../lib/stage-graph';
import { HERO_SPLIT_MIN_WIDTH_REM, HeroObject } from './HeroObject';

const HERO_SPLIT_MEDIA = `(min-width: ${HERO_SPLIT_MIN_WIDTH_REM}rem)`;
const subscribeSplit = (onChange: () => void): (() => void) => {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(HERO_SPLIT_MEDIA);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const readSplit = (): boolean => typeof matchMedia === 'function' && matchMedia(HERO_SPLIT_MEDIA).matches;

const HERO_PHONE_MEDIA = '(max-width: 40rem)';
const subscribePhone = (onChange: () => void): (() => void) => {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(HERO_PHONE_MEDIA);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const readPhone = (): boolean => typeof matchMedia === 'function' && matchMedia(HERO_PHONE_MEDIA).matches;

/**
 * True when WebGL is here **and hardware-backed**; false hands the stage to the 2D engine.
 *
 * A software renderer (SwiftShader, llvmpipe — headless browsers, some virtual machines) draws
 * the scene at ~22 fps on the main thread, and that starves everything else on the page: the
 * headline's typing (`setInterval` at 38 ms) measured 4.5 s instead of 1.8 s. The 2D engine costs
 * a fraction of that, so it is the honest choice there. `?hero=three` forces the scene for
 * measurement (the grid gate reads the WebGL object's ink under the type).
 */
function webglAccelerated(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('hero') === 'three') return true;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return !/swiftshader|llvmpipe|softpipe|software/i.test(renderer);
  } catch {
    return false;
  }
}

/**
 * The hero atlas — the real vault as a lit three.js object (`hero-atlas-scene.ts`), on the same
 * stage, with the same typing echo, hover caption and inspection window the 2D hero had. The
 * three.js chunk is loaded on demand so the gateway's first paint pays nothing for it; while it
 * loads, and wherever WebGL is unavailable, the 2D engine (`HeroObject`) draws the same graph,
 * so the stage is never empty and never lies.
 */
export function HeroAtlas({ graph, typed, total }: { graph: StageGraph; typed: number; total: number }) {
  const t = useTranslations('download');
  const tKinds = useTranslations('kinds');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<AtlasHandle | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [mode, setMode] = useState<'pending' | 'three' | 'fallback'>('pending');
  const typingRef = useRef({ typed, total });
  useEffect(() => {
    typingRef.current = { typed, total };
  });
  const wide = useSyncExternalStore(subscribeSplit, readSplit, () => false);
  const phone = useSyncExternalStore(subscribePhone, readPhone, () => false);

  useEffect(() => {
    let cancelled = false;
    // Decided off the effect body (a probe plus a chunk load), so the mode lands in a callback:
    // no WebGL, or a chunk that fails to load, hands the stage to the 2D engine.
    Promise.resolve()
      .then(() => (webglAccelerated() ? import('../lib/hero-atlas-scene') : Promise.reject(new Error('no webgl'))))
      .then(
        () => {
          if (!cancelled) setMode('three');
        },
        () => {
          if (!cancelled) setMode('fallback');
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'three') return;
    const canvas = canvasRef.current;
    if (!canvas || graph.nodes.length === 0) return;
    let disposed = false;
    let handle: AtlasHandle | null = null;
    const keep = (kind: StageGraph['nodes'][number]['kind']): boolean => !phone || kind !== 'element';
    const kept = new Set(graph.nodes.filter((node) => keep(node.kind)).map((node) => node.id));
    void import('../lib/hero-atlas-scene').then(({ mountHeroAtlas }) => {
      if (disposed) return;
      handle = mountHeroAtlas(
        canvas,
        {
          nodes: graph.nodes.filter((n) => kept.has(n.id)).map((n) => ({ s: n.id, k: n.kind, l: n.label })),
          edges: graph.edges
            .filter((e) => e.kind === 'contains' || e.kind === 'depends')
            .filter((e) => kept.has(e.source) && kept.has(e.target))
            .map((e) => ({ a: e.source, b: e.target, y: e.kind as 'contains' | 'depends' })),
        },
        // Wide draws from 5.2 radii (6.1 until 2026-09-25): the canvas is the hero's own height
        // now that it no longer claims the fold, and the object shrank with it.
        // Two placements, one breakpoint — the same pair the 2D engine had. Wide: the object
        // stands beside the decision block, seen across. Narrow: the block spans the stage, so the
        // object is the ground under it — anchored low, seen from above, and the type stays clear
        // of its ink (`download-gateway-grid.spec.ts` measures the share under the block).
        // Narrow places it the way the 2D engine did: centred 210px above the stage's bottom edge
        // (the plinth band under the facts strip measures 352px; 210 keeps the near rim inside the stage), at a fixed width, seen from
        // higher up. A phone's band is shorter, so the object is smaller and sits lower.
        wide
          ? { onHover: setHover, anchor: { x: 0.72, y: 0.52 }, dim: 0.9, distance: 5.2 }
          : phone
            ? { onHover: setHover, anchor: { x: 0.5, bottomPx: 140 }, dim: 0.75, fitPx: 300, pitch: 0.75 }
            : { onHover: setHover, anchor: { x: 0.5, bottomPx: 210 }, dim: 0.75, fitPx: 440, pitch: 0.75 },
      );
      if (!handle) {
        setMode('fallback');
        return;
      }
      handleRef.current = handle;
      if (typingRef.current.total > 0) handle.setTyping(typingRef.current.typed, typingRef.current.total);
      const inspect = new URLSearchParams(window.location.search).get('e2e') === '1';
      if (inspect) {
        (window as unknown as { __heroEcho?: unknown }).__heroEcho = {
          lit: () => handle!.litCount(),
          nodes: () => handle!.nodesOnScreen(),
          count: graph.nodes.length,
        };
      }
    });
    return () => {
      disposed = true;
      handleRef.current = null;
      if (new URLSearchParams(window.location.search).get('e2e') === '1') {
        delete (window as unknown as { __heroEcho?: unknown }).__heroEcho;
      }
      handle?.dispose();
    };
  }, [graph, wide, phone, mode]);

  // Layout, not passive — the same frame as the character (`HeroObject`).
  useLayoutEffect(() => {
    if (total > 0) handleRef.current?.setTyping(typed, total);
  }, [typed, total]);

  if (mode === 'fallback') return <HeroObject graph={graph} typed={typed} total={total} />;

  const fact = hover !== null ? echoFact(graph, hover) : null;
  const hovered = hover !== null ? graph.nodes.find((n) => n.id === hover) : undefined;
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
      data-hero-engine={mode === 'three' ? 'three' : 'pending'}
      className="gateway-hero-stage absolute inset-0 min-w-0 overflow-hidden"
    >
      {/* The spotlight: a soft pool of the accent behind the object's anchor, so the tree stands
          in light rather than on black. Tokens only (`.gateway-hero-atlas-wash`); it does not move. */}
      <div className={cn('gateway-hero-atlas-wash absolute inset-0', wide ? 'is-wide' : undefined)} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-pan-y" />
      <p
        data-testid="gateway-hero-caption"
        className={cn(
          'gateway-hero-caption pointer-events-none absolute right-[var(--gateway-origin)] top-12 max-w-[40%] truncate text-right font-mono text-label leading-label text-[color:var(--color-text-tertiary)] md:top-16 min-[90rem]:top-auto min-[90rem]:bottom-[7.5rem]',
          caption ? 'is-on' : undefined,
        )}
      >
        {caption || ' '}
      </p>
    </div>
  );
}

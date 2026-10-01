'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { webglAccelerated } from '@/shared/lib/webgl-probe';

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

function heroWebgl(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('hero') === 'three') return true;
  } catch {
    return false;
  }
  return webglAccelerated();
}

export function HeroAtlas({ graph, typed, total }: { graph: StageGraph; typed: number; total: number }) {
  const t = useTranslations('download');
  const tKinds = useTranslations('kinds');
  const hostRef = useRef<HTMLDivElement | null>(null);
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
    Promise.resolve()
      .then(() => (heroWebgl() ? import('../lib/hero-atlas-scene') : Promise.reject(new Error('no webgl'))))
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
    const host = hostRef.current;
    if (!host || graph.nodes.length === 0) return;
    let disposed = false;
    let handle: AtlasHandle | null = null;
    const keep = (kind: StageGraph['nodes'][number]['kind']): boolean => !phone || kind !== 'element';
    const kept = new Set(graph.nodes.filter((node) => keep(node.kind)).map((node) => node.id));
    void import('../lib/hero-atlas-scene').then(({ mountHeroAtlas }) => {
      if (disposed) return;
      handle = mountHeroAtlas(
        host,
        {
          nodes: graph.nodes.filter((n) => kept.has(n.id)).map((n) => ({ s: n.id, k: n.kind, l: n.label })),
          edges: graph.edges
            .filter((e) => e.kind === 'contains' || e.kind === 'depends')
            .filter((e) => kept.has(e.source) && kept.has(e.target))
            .map((e) => ({ a: e.source, b: e.target, y: e.kind as 'contains' | 'depends' })),
        },
        // Wide stands beside the decision block; narrow is ground under it, seen from above so the
        // type stays clear (`download-gateway-grid.spec.ts`). 210px keeps the near rim in the 352px plinth.
        {
          canvasClassName: 'block h-full w-full touch-pan-y',
          onHover: setHover,
          ...(wide
            ? { anchor: { x: 0.72, y: 0.52 }, dim: 0.9, distance: 5.2 }
            : phone
              ? { anchor: { x: 0.5, bottomPx: 140 }, dim: 0.75, fitPx: 300, pitch: 0.75 }
              : { anchor: { x: 0.5, bottomPx: 210 }, dim: 0.75, fitPx: 440, pitch: 0.75 }),
        },
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

  // Layout effect, so the echo lands in the same frame as the typed character.
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
      <div className={cn('gateway-hero-atlas-wash absolute inset-0', wide ? 'is-wide' : undefined)} />
      <div ref={hostRef} className="absolute inset-0" />
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

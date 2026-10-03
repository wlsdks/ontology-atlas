'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { IconButton } from '@/shared/ui/controls';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { StageGraph } from '../lib/stage-graph';
import { useFigureTurn } from './showpiece-player';
import { CONDUCTION_ANSWER, CONDUCTION_CAST, CONDUCTION_PROPOSAL, CONDUCTION_QUERY } from '../model/conduction-cast';

const SCENE_PLACEHOLDER = <div aria-hidden className="h-[38rem] min-[70rem]:h-[22rem]" />;
const ConductionScene = dynamic(() => import('./ConductionScene'), { ssr: false, loading: () => SCENE_PLACEHOLDER });

type FigureState = 'still' | 'running' | 'paused' | 'finished';

const unchanging = () => () => undefined;
const animatesOnClient = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const observesOnClient = () => typeof IntersectionObserver !== 'undefined';
const onServer = () => false;

export function ConductionSection({ graph }: { graph: StageGraph }) {
  return (
    <section
      data-testid="gateway-conduction-section"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)] w-full')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <ConductionFigure graph={graph} />
      </div>
    </section>
  );
}

export function ConductionFigure({ graph }: { graph: StageGraph }) {
  const t = useTranslations('downloadConduction');
  const format = useFormatter();
  const ids = useId();
  const reduced = usePrefersReducedMotion();
  const [figure, setFigure] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [refused, setRefused] = useState(false);

  const animates = useSyncExternalStore(unchanging, animatesOnClient, onServer);
  const observes = useSyncExternalStore(unchanging, observesOnClient, onServer);
  const approached = near || !observes;
  const seen = inView || !observes;
  const canAnimate = animates && !reduced && !refused;
  const running = useFigureTurn(canAnimate && !finished && !userPaused && seen && pageVisible);

  useLayoutEffect(() => {
    if (!host) return;
    const read = () => setAvailable(Math.floor(host.clientWidth));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  useEffect(() => {
    if (!figure) return;
    const syncPage = () => setPageVisible(document.visibilityState !== 'hidden');
    syncPage();
    document.addEventListener('visibilitychange', syncPage);
    if (!observes) return () => document.removeEventListener('visibilitychange', syncPage);
    const approach = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '100% 0px' },
    );
    const view = new IntersectionObserver((entries) => setInView(entries.at(-1)?.isIntersecting ?? true), {
      threshold: 0.2,
    });
    approach.observe(figure);
    view.observe(figure);
    return () => {
      document.removeEventListener('visibilitychange', syncPage);
      approach.disconnect();
      view.disconnect();
    };
  }, [figure, observes]);

  const labelOf = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node.label]));
    return (id: string) => byId.get(id) ?? id.slice(id.indexOf(':') + 1);
  }, [graph]);

  const focusDomain = CONDUCTION_CAST.find((concept) => concept.id === CONDUCTION_QUERY.concept)?.parent ?? '';
  const depends = CONDUCTION_ANSWER.filter((relation) => relation.relation === 'depends');
  const description = t('description', {
    project: labelOf(CONDUCTION_CAST[0]!.id),
    tool: CONDUCTION_QUERY.tool,
    slug: CONDUCTION_QUERY.slug,
    concept: labelOf(CONDUCTION_QUERY.concept),
    domain: labelOf(focusDomain),
    uses: format.list(depends.filter((relation) => relation.from === CONDUCTION_QUERY.concept).map((relation) => labelOf(relation.to))),
    usedBy: format.list(depends.filter((relation) => relation.to === CONDUCTION_QUERY.concept).map((relation) => labelOf(relation.from))),
    target: labelOf(CONDUCTION_PROPOSAL.to),
  });

  const state: FigureState = !canAnimate ? 'still' : finished ? 'finished' : running ? 'running' : 'paused';
  const control = finished
    ? { label: t('replay'), icon: <RotateCcw size={ICON_SIZE.sm} aria-hidden /> }
    : userPaused
      ? { label: t('resume'), icon: <Play size={ICON_SIZE.sm} aria-hidden /> }
      : { label: t('pause'), icon: <Pause size={ICON_SIZE.sm} aria-hidden /> };

  return (
    <figure
      ref={setFigure}
      data-testid="download-conduction-figure"
      data-conduction-state={state}
      aria-labelledby={`${ids}-label`}
      aria-describedby={`${ids}-description`}
      className="m-0 flex min-w-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-panel"
    >
      <div className="flex min-h-[var(--chrome-tile-size)] items-center justify-between gap-3 px-5 pt-3">
        <p
          id={`${ids}-label`}
          data-testid="download-conduction-label"
          className="flex min-w-0 items-center gap-2 text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
          <span className="min-w-0">{t('label')}</span>
        </p>
        {canAnimate ? (
          <IconButton
            size="sm"
            label={control.label}
            data-testid="download-conduction-control"
            onClick={() => {
              if (finished) {
                setUserPaused(false);
                setFinished(false);
                setGeneration((value) => value + 1);
                return;
              }
              setUserPaused((value) => !value);
            }}
          >
            {control.icon}
          </IconButton>
        ) : null}
      </div>
      <div ref={setHost} className="min-w-0 bg-[color:var(--map-canvas-bg-near)]">
        {available > 0 && approached ? (
          <ConductionScene
            available={available}
            labelOf={labelOf}
            focusDomain={focusDomain}
            animate={canAnimate && !finished}
            running={running}
            generation={generation}
            onFinished={() => setFinished(true)}
            onRefused={() => setRefused(true)}
          />
        ) : (
          SCENE_PLACEHOLDER
        )}
      </div>
      <figcaption id={`${ids}-description`} data-testid="download-conduction-description" className="sr-only">
        {description}
      </figcaption>
    </figure>
  );
}

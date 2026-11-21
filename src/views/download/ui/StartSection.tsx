'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';

import type { StageGraph } from '../lib/stage-graph';
import { useInViewMotion } from '../lib/page-motion/use-in-view-motion';
import { SectionIntro } from './SectionIntro';
import { ConnectScene, DraftScene, OpenFolderScene, useStepScenes } from './StepScenes';

/**
 * `waiting` hides a drawing's lines and exists only once a script has seen the block below the
 * fold, so the page reads whole with scripting off, and a block already in view never blinks.
 */
type Entrance = 'still' | 'waiting' | 'entering';

/** Each drawing's lines arrive once, in reading order, when its block scrolls into view. */
function useEntrance(): [(node: HTMLElement | null) => void, Entrance] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [entrance, setEntrance] = useState<Entrance>('still');

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let first = true;
    const observer = new IntersectionObserver(
      (entries) => {
        // Several entries can arrive together; the last one is the present.
        const seen = entries[entries.length - 1].isIntersecting;
        if (seen) {
          if (!first) setEntrance('entering');
          observer.disconnect();
        } else {
          setEntrance('waiting');
        }
        first = false;
      },
      // A line 15% above the window's foot, whatever the block's height or the text zoom.
      { rootMargin: '0px 0px -15% 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, entrance];
}

const SECTION = cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full scroll-mt-24');
const CARD_TITLE =
  'text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]';

function Line({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('gateway-entrance-line min-w-0', className)}
      style={{ '--motion-stagger-index': index } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function StartSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.start');
  const tFirst = useTranslations('firstRun');
  const tAnalyze = useTranslations('topology.startSteps.analyze');
  const tRail = useTranslations('navRail');
  const tConnect = useTranslations('agentConnect');
  const tModels = useTranslations('agents.models');
  const [stepsEntrance, entrance] = useEntrance();
  const [stepsMotion, pathMotion] = useInViewMotion();
  const [stepsNode, setStepsNode] = useState<HTMLElement | null>(null);
  useStepScenes(stepsNode, pathMotion);
  const steps = useCallback(
    (node: HTMLElement | null) => {
      stepsEntrance(node);
      stepsMotion(node);
      setStepsNode(node);
    },
    [stepsEntrance, stepsMotion],
  );
  const labelOf = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node.label]));
    return (id: string) => byId.get(id) ?? id.slice(id.indexOf(':') + 1);
  }, [graph.nodes]);

  const rows = [
    { title: t('step1.title'), body: t('step1.body'), scene: <OpenFolderScene open={tFirst('openTitle')} /> },
    {
      title: t('step2.title'),
      body: t('step2.body'),
      scene: <DraftScene ask={tAnalyze('ctaAgent')} labelOf={labelOf} />,
    },
    {
      title: t('step3.title'),
      body: t('step3.body', { agents: tRail('agents'), mcp: tRail('mcp'), connect: tConnect('short.connect') }),
      scene: (
        <ConnectScene
          place={`${tRail('agents')} › ${tRail('mcp')}`}
          connected={tModels('statusConnected')}
          connect={tConnect('short.connect')}
        />
      ),
    },
  ];

  return (
    <section id="start" data-testid="gateway-start-section" className={SECTION}>
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} />

        {/*
          One rail runs across the steps (down them on a phone): each step is a node on it, and a
          fill travels from node to node; as it arrives, that step's scene plays once.
        */}
        <ol
          ref={steps}
          data-testid="gateway-start-steps"
          data-gateway-entrance={entrance}
          data-gateway-steps-motion={pathMotion}
          className="mt-12 grid min-w-0 gap-x-8 gap-y-10 @min-[52rem]:grid-cols-3"
        >
          {rows.map((row, index) => (
            <li
              key={row.title}
              data-gateway-step={index}
              className="relative min-w-0 pl-10 @min-[52rem]:pl-0 @min-[52rem]:pt-10"
              style={{ '--gateway-step': index } as CSSProperties}
            >
              <span aria-hidden className="gateway-step-track absolute">
                <span className="gateway-step-rule absolute inset-0" />
                <span className="gateway-step-spark absolute inset-0" />
              </span>
              <span aria-hidden className="gateway-step-node absolute left-0 top-0 size-3 rounded-full">
                <span className="gateway-step-lit absolute inset-0.5 rounded-full" />
                {/* The beat as the fill arrives: a 1px ring grows out of the node and fades. */}
                <span
                  data-gateway-hit
                  className="gateway-step-press pointer-events-none absolute -inset-7 rounded-full border border-[color:var(--color-text-primary)]"
                />
              </span>
              <Line index={index * 2}>{row.scene}</Line>
              <Line index={index * 2 + 1}>
                <h3 className={cn(CARD_TITLE, 'mt-6')}>{row.title}</h3>
                <p className="mt-2 max-w-[26rem] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                  {row.body}
                </p>
              </Line>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

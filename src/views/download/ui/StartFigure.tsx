'use client';

import { useCallback, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { OntologyMapKindGlyph } from '@/shared/ui/map-kind-glyph';

import { DRAWN_OUTLINE, DRAWN_PRIMARY, keyPhrase, ShowpieceFigure, ShowpieceSection } from './ShowpieceFrame';
import { layoutBox, LIGHT_LAYERS, SHOWPIECE_PART, useShowpiece, type ShowpieceEnv } from './showpiece-player';
import {
  DRAFT_MAP,
  draftEdges,
  draftLightPaths,
  measureStart,
  START_DRAFT_COUNT,
  START_DURATION,
  START_WIDE_MIN,
  startRest,
  startTracks,
} from './start-scene';

const STEPS = ['step1', 'step2', 'step3'] as const;
const DOTS = 'bg-[radial-gradient(var(--color-border-soft)_1px,transparent_1px)] bg-[length:16px_16px]';

interface Gutter {
  d: string;
}

function measureGutters(stage: HTMLElement): Gutter[] {
  const find = (name: string) => {
    const element = stage.querySelector<HTMLElement>(`[data-anchor="${name}"]`);
    return element ? layoutBox(element, stage) : null;
  };
  return [
    [find('press-0'), find('offer')],
    [find('press-1'), find('card')],
  ].map(([from, to]) => {
    if (!from || !to) return { d: '' };
    const a = [from.x + from.width, from.y + from.height / 2] as const;
    const b = [to.x, to.y + to.height / 2] as const;
    const dx = (b[0] - a[0]) * 0.5;
    return { d: `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]}, ${b[0] - dx} ${b[1]}, ${b[0]} ${b[1]}` };
  });
}

export function StartSection() {
  const t = useTranslations('download.start');
  const tFirst = useTranslations('firstRun');
  const tAnalyze = useTranslations('topology.startSteps.analyze');
  const tPermission = useTranslations('acpChat.permission');
  const tHeadline = useTranslations('ontologyChangeReview.headline');
  const tBrief = useTranslations('ontologyPages.insights.brief.line');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [gutters, setGutters] = useState<Gutter[]>([]);
  const wide = width === 0 || width >= START_WIDE_MIN;

  useLayoutEffect(() => {
    if (!host) return;
    const read = () => setWidth(Math.floor(host.clientWidth));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  useLayoutEffect(() => {
    if (!stage || !wide) return;
    const read = () => setGutters(measureGutters(stage));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage, wide]);

  const build = useCallback(
    (root: HTMLElement, env: ShowpieceEnv) => {
      const scene = root.querySelector<HTMLElement>('[data-start-stage]');
      if (!scene) return {};
      return startTracks(measureStart(scene, wide, (element) => layoutBox(element, scene)), env);
    },
    [wide],
  );
  const { setRoot, setFigure, state, canAnimate, finished, userPaused, press } = useShowpiece({ duration: START_DURATION, build, layoutKey: `${wide}` });
  const part = (key: string, extra?: CSSProperties) => ({
    [SHOWPIECE_PART]: key,
    style: { ...(startRest(key, wide) as CSSProperties), ...extra },
  });

  const words = {
    eyebrow: tFirst('eyebrow'),
    firstTitle: tFirst('title'),
    openFolder: tFirst('openTitle'),
    justStart: tFirst('justStartTitle'),
    draftTitle: tAnalyze('title'),
    draftBody: tAnalyze('bodyAgent'),
    askAgent: tAnalyze('ctaAgent'),
    headline: tHeadline('createBatch', { count: START_DRAFT_COUNT }),
    writeBody: tPermission('ontologyWriteBody'),
    reject: tPermission('reject'),
    allowOnce: tPermission('allowOnce'),
    allowed: tPermission('answered.allow'),
    unreviewed: tBrief('ontology-agent-unreviewed', { count: START_DRAFT_COUNT }),
  };
  const description = t('description', { ...words, count: START_DRAFT_COUNT });

  const screens: ReactNode[] = [
    <div key="first" className="flex h-full flex-col justify-center px-6 py-6 sm:px-8">
      <p className="font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {words.eyebrow}
      </p>
      <p className="mt-2 text-title leading-title text-[color:var(--color-text-primary)]">{words.firstTitle}</p>
      <p className="mt-4 flex flex-wrap gap-2">
        <span data-anchor="press-0" className={DRAWN_PRIMARY} {...part('press:0')}>
          {words.openFolder}
        </span>
        <span className={DRAWN_OUTLINE}>{words.justStart}</span>
      </p>
    </div>,
    <div key="offer" className={cn('flex h-full items-center p-4', DOTS)}>
      <div
        data-anchor="offer"
        className="min-w-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <p className="flex min-w-0 items-start gap-2 text-body leading-body text-[color:var(--color-text-primary)]">
          <Sparkles size={ICON_SIZE.sm} aria-hidden className="mt-1 shrink-0 text-[color:var(--color-indigo-text-soft)]" />
          <span className="min-w-0">{words.draftTitle}</span>
        </p>
        <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{words.draftBody}</p>
        <p className="mt-3">
          <span data-anchor="press-1" className={DRAWN_PRIMARY} {...part('press:1')}>
            {words.askAgent}
          </span>
        </p>
      </div>
    </div>,
    <div key="draft" className={cn('relative h-full min-h-[14.5rem]', DOTS)}>
      <DraftMap part={part} />
      <p className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)]">
        <span
          data-anchor="stamp"
          className={badgeClass({
            shape: 'pill',
            className:
              'inline-block border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-1 text-label leading-label text-[color:var(--color-text-secondary)]',
          })}
          {...part('stamp')}
        >
          {words.allowed}
        </span>
      </p>
      <p
        className="absolute bottom-3 left-4 right-4 flex min-w-0 items-start gap-2 text-label leading-label text-[color:var(--color-text-primary)]"
        {...part('unreviewed')}
      >
        <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full border-[1.5px] border-[color:var(--color-text-tertiary)]" />
        <span className="min-w-0">{words.unreviewed}</span>
      </p>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-anchor="card"
          className="w-full max-w-[22rem] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)] shadow-elevation-2"
          {...part('card')}
        >
          <p className="text-body leading-body text-[color:var(--color-text-primary)]">{words.headline}</p>
          <p className="mt-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]">{words.writeBody}</p>
          <p className="mt-3 flex flex-wrap justify-end gap-2">
            <span className={DRAWN_OUTLINE}>{words.reject}</span>
            <span
              data-anchor="press-2"
              className={cn(
                DRAWN_OUTLINE,
                'relative overflow-hidden border-[color:var(--color-indigo-line-a40)]',
              )}
              {...part('press:2')}
            >
              <span aria-hidden className="absolute inset-0 bg-[color:var(--color-indigo-accent)]" {...part('fill')} />
              <span className="relative">{words.allowOnce}</span>
            </span>
          </p>
        </div>
      </div>
    </div>,
  ];

  const captions = STEPS.map((step, index) => (
    <p key={step} className="flex min-w-0 gap-3 text-body leading-body text-[color:var(--color-text-primary)]" {...part(`cap:${index}`)}>
      <span className="shrink-0 font-mono text-[color:var(--color-text-tertiary)]">{index + 1}</span>
      <span className="min-w-0">{t(step)}</span>
    </p>
  ));

  return (
    <ShowpieceSection
      id="start"
      testId="download-start-section"
      eyebrow={t('eyebrow')}
      title={t.rich('title', { key: keyPhrase('indigo', startRest('underline', wide) as CSSProperties) })}
      sub={t('sub')}
      underline="indigo"
      rootRef={setRoot}
    >
      <ShowpieceFigure testId="download-start-figure" label={t('label')} description={description}
        figureRef={setFigure}
        state={state}
        canAnimate={canAnimate}
        finished={finished}
        userPaused={userPaused}
        onPress={press}
      >
        <div ref={setHost} className="min-w-0">
          <div
            ref={setStage}
            aria-hidden
            inert
            data-start-stage
            data-start-layout={wide ? 'wide' : 'narrow'}
            className={cn('relative overflow-hidden', wide ? 'p-6' : 'p-[1.125rem]')}
          >
            {wide ? (
              <div className="grid grid-flow-col grid-cols-3 grid-rows-[minmax(16.75rem,auto)_auto] gap-x-6 gap-y-4">
                {screens.map((screen, index) => [
                  <Window key={`w${index}`} {...part(`win:${index}`)}>
                    {screen}
                  </Window>,
                  <div key={`c${index}`}>{captions[index]}</div>,
                ])}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-4">{captions}</div>
                <Window className="min-h-[18rem]">
                  {screens.map((screen, index) => (
                    <div key={index} className="min-w-0 [grid-area:1/1]" {...part(`win:${index}`)}>
                      {screen}
                    </div>
                  ))}
                </Window>
              </div>
            )}
            {wide ? (
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none">
                {(wide ? gutters : []).map((gutter, index) =>
                  gutter.d
                    ? LIGHT_LAYERS.map((layer) => (
                        <path
                          key={`${index}/${layer}`}
                          d={gutter.d}
                          pathLength={1}
                          stroke="var(--map-indigo-bright)"
                          strokeLinecap="round"
                          {...part(`light:g${index}/${layer}`, {
                            strokeWidth: layer === 'halo' ? 'var(--map-light-halo-px)' : 'var(--map-light-core-px)',
                          })}
                        />
                      ))
                    : null,
                )}
              </svg>
            ) : null}
            <Pointer part={part} />
          </div>
        </div>
      </ShowpieceFigure>
    </ShowpieceSection>
  );
}

type PartProps = (key: string, extra?: CSSProperties) => Record<string, unknown>;

function Window({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <div
      {...rest}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]',
        className,
      )}
    >
      <p aria-hidden className="flex h-7 shrink-0 items-center gap-1.5 border-b border-[color:var(--color-divider)] px-3">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2 rounded-full bg-[color:var(--color-overlay-2)]" />
        ))}
      </p>
      <div className="grid min-h-0 flex-1">{children}</div>
    </div>
  );
}

function DraftMap({ part }: { part: PartProps }) {
  const { width, height, project, domains, capabilities, sizes } = DRAFT_MAP;
  const glyph = (kind: string, x: number, y: number, size: number, key: string) => (
    <g key={key} transform={`translate(${x - size / 2} ${y - size / 2})`}>
      <OntologyMapKindGlyph kind={kind} size={size} />
    </g>
  );
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-x-4 bottom-10 top-12 h-[calc(100%-5.5rem)] w-[calc(100%-2rem)] overflow-visible"
      fill="none"
    >
      <g {...part('relations')}>
        {draftEdges().map((edge, index) => (
          <line
            key={index}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke="var(--map-edge-contains-mark)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {draftLightPaths().map((path, index) =>
        LIGHT_LAYERS.map((layer) => (
          <path
            key={`${index}/${layer}`}
            d={path.d}
            pathLength={1}
            stroke="var(--map-indigo-bright)"
            strokeLinecap="round"
            {...part(`light:m${index}/${layer}`, {
              strokeWidth: layer === 'halo' ? 'var(--map-light-halo-px)' : 'var(--map-light-core-px)',
            })}
          />
        )),
      )}
      <g {...part('tier:0')}>{glyph('project', project.x, project.y, sizes.project, 'p')}</g>
      <g {...part('tier:1')}>{domains.map((domain, index) => glyph('domain', domain.x, domain.y, sizes.domain, `d${index}`))}</g>
      <g {...part('tier:2')}>
        {capabilities.map((capability, index) => glyph('capability', capability.x, capability.y, sizes.capability, `c${index}`))}
      </g>
    </svg>
  );
}

function Pointer({ part }: { part: PartProps }) {
  return (
    <span
      data-anchor="pointer"
      className="pointer-events-none absolute z-[1] block h-5 w-4"
      {...part('pointer', { left: 'calc(100% - 1rem)', top: 'calc(100% - 1.25rem)' })}
    >
      <svg width={16} height={20} viewBox="0 0 16 20" className="block overflow-visible">
        <path
          d="M1 1 L1 15.5 L4.8 12 L7.4 18 L10 16.9 L7.5 11 L12.6 11 Z"
          fill="var(--color-text-primary)"
          stroke="var(--color-canvas)"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

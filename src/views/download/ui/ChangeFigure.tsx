'use client';

import { useCallback, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, SquareTerminal } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { OntologyMapKindGlyph } from '@/shared/ui/map-kind-glyph';

import type { StageGraph } from '../lib/stage-graph';
import {
  CHANGE_CAST,
  CHANGE_DURATION,
  CHANGE_WIDE_MIN,
  changeRest,
  changeTracks,
  fileName,
  folderOf,
  measureChange,
} from './change-scene';
import { DRAWN_OUTLINE, keyPhrase, ShowpieceFigure, ShowpieceSection } from './ShowpieceFrame';
import { layoutBox, LIGHT_LAYERS, SHOWPIECE_PART, useShowpiece, type ShowpieceEnv } from './showpiece-player';

const CALM_ALPHA = 'var(--map-spotlight-rest-alpha)';
const NOW = 1_000_000_000;
const MOVED_AT = NOW - 2 * 60_000;
const WRITTEN_AT = NOW - 6 * 86_400_000;

const part = (key: string, extra?: CSSProperties) => ({
  [SHOWPIECE_PART]: key,
  style: { ...(changeRest(key) as CSSProperties), ...extra },
});

const kindOf = (id: string) => id.slice(0, id.indexOf(':'));

interface Thread {
  d: string;
  length: number;
}

function cubicLength(points: [number, number][]): number {
  const [p0, p1, p2, p3] = points as [[number, number], [number, number], [number, number], [number, number]];
  let length = 0;
  let prev = p0;
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24;
    const u = 1 - t;
    const next: [number, number] = [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
    length += Math.hypot(next[0] - prev[0], next[1] - prev[1]);
    prev = next;
  }
  return Math.round(length);
}

function cubic(a: [number, number], b: [number, number], bend: number): Thread {
  const dx = (b[0] - a[0]) * bend;
  const points: [number, number][] = [a, [a[0] + dx, a[1]], [b[0] - dx, b[1]], b];
  const d = `M ${points[0]![0]} ${points[0]![1]} C ${points[1]![0]} ${points[1]![1]}, ${points[2]![0]} ${points[2]![1]}, ${points[3]![0]} ${points[3]![1]}`;
  return { d, length: cubicLength(points) };
}

function measureThreads(stage: HTMLElement, wide: boolean): Thread[] {
  const card = stage.querySelector<HTMLElement>('[data-anchor="card"]');
  const cardBox = card ? layoutBox(card, stage) : null;
  return CHANGE_CAST.map((_, index) => {
    const row = stage.querySelector<HTMLElement>(`[data-anchor="row-${index}"]`);
    const chip = stage.querySelector<HTMLElement>(`[data-anchor="chip-${index}"]`);
    const r = row ? layoutBox(row, stage) : null;
    const c = chip ? layoutBox(chip, stage) : null;
    if (!r || !c || !cardBox) return { d: '', length: 0 };
    if (wide) return cubic([cardBox.x + cardBox.width, r.y + r.height / 2], [c.x - 2, c.y + c.height / 2], 0.55);
    const y = r.y + r.height - 0.5;
    return cubic([r.x, y], [c.x + c.width / 2, y], 0.33);
  });
}

export function ChangeSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.change');
  const tBrief = useTranslations('ontologyPages.insights.brief');
  const format = useFormatter();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const wide = width === 0 || width >= CHANGE_WIDE_MIN;

  const labelOf = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node.label]));
    return (id: string) => byId.get(id) ?? id.slice(id.indexOf(':') + 1);
  }, [graph]);

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
    if (!stage) return;
    const read = () => setThreads(measureThreads(stage, wide));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage, wide]);

  const build = useCallback(
    (root: HTMLElement, env: ShowpieceEnv) => {
      const scene = root.querySelector<HTMLElement>('[data-change-stage]');
      if (!scene) return {};
      return changeTracks(measureChange(scene, (element) => layoutBox(element, scene)), env);
    },
    [],
  );
  const { setRoot, setFigure, state, canAnimate, finished, userPaused, press } = useShowpiece({ duration: CHANGE_DURATION, build, layoutKey: `${wide}:${threads.length}` });

  const moved = tBrief('line.ontology-evidence-moved', { count: CHANGE_CAST.length });
  const askAgent = tBrief('askAgent');
  const detail = tBrief('detailMoved', {
    moved: format.relativeTime(MOVED_AT, NOW),
    doc: format.relativeTime(WRITTEN_AT, NOW),
  });
  const description = t('description', {
    files: format.list(CHANGE_CAST.map((row) => row.file)),
    concepts: format.list(CHANGE_CAST.map((row) => labelOf(row.concept))),
    line: moved,
    askAgent,
  });

  return (
    <ShowpieceSection
      id="change"
      testId="download-change-section"
      eyebrow={t('eyebrow')}
      title={t.rich('title', { key: keyPhrase('amber', changeRest('underline') as CSSProperties) })}
      sub={t('sub')}
      underline="amber"
      rootRef={setRoot}
    >
      <ShowpieceFigure testId="download-change-figure" label={t('label')} description={description}
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
            data-change-stage
            data-change-layout={wide ? 'wide' : 'narrow'}
            className={cn(
              'relative',
              wide
                ? 'grid grid-cols-[17rem_minmax(0,1fr)_21.25rem] items-center gap-8 p-6'
                : 'flex flex-col gap-4 p-[1.125rem]',
            )}
          >
            <Threads threads={threads} wide={wide} />
            <CommitCard wide={wide} labelOf={labelOf} />
            {wide ? <ConceptColumn labelOf={labelOf} /> : null}
            <BriefPanel wide={wide} labelOf={labelOf} moved={moved} detail={detail} askAgent={askAgent} />
          </div>
        </div>
      </ShowpieceFigure>
    </ShowpieceSection>
  );
}

function Threads({ threads, wide }: { threads: Thread[]; wide: boolean }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none">
      {threads.map((thread, index) =>
        thread.d ? (
          <g key={index}>
            {wide ? (
              <path
                d={thread.d}
                stroke="var(--color-text-quaternary)"
                strokeWidth={1}
                strokeDasharray="3 3"
                style={{ opacity: 'var(--map-ego-rest-alpha)' }}
              />
            ) : null}
            {LIGHT_LAYERS.map((layer) => (
              <path
                key={layer}
                d={thread.d}
                pathLength={1}
                stroke="var(--map-indigo-bright)"
                strokeLinecap="round"
                data-anchor={layer === 'core' ? `thread-${index}` : undefined}
                data-length={thread.length}
                {...part(`light:${index}/${layer}`, {
                  strokeWidth: layer === 'halo' ? 'var(--map-light-halo-px)' : 'var(--map-light-core-px)',
                })}
              />
            ))}
          </g>
        ) : null,
      )}
    </svg>
  );
}

function CommitCard({ wide, labelOf }: { wide: boolean; labelOf: (id: string) => string }) {
  const t = useTranslations('download.change');
  return (
    <div
      data-anchor="card"
      className="relative min-w-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      <p
        className="flex min-w-0 items-center justify-between gap-3 border-b border-[color:var(--color-divider)] pb-2.5 text-label leading-label"
        {...part('card')}
      >
        <span className="flex min-w-0 items-center gap-2 text-[color:var(--color-text-secondary)]">
          <SquareTerminal size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          <span className="truncate">{t('agentCommit')}</span>
        </span>
        <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{t('filesChanged', { count: CHANGE_CAST.length })}</span>
      </p>
      <ul className="flex flex-col">
        {CHANGE_CAST.map((row, index) => (
          <li
            key={row.file}
            data-anchor={`row-${index}`}
            className={cn(
              'flex min-w-0 items-center gap-3 py-2.5',
              index < CHANGE_CAST.length - 1 && 'border-b border-[color:var(--color-divider)]',
            )}
            {...part(`row:${index}`)}
          >
            <span className="min-w-0 flex-1 font-mono text-label leading-label">
              <span
                data-anchor={wide ? undefined : `src-${index}`}
                className="block truncate text-[color:var(--color-text-primary)]"
              >
                {fileName(row.file)}
              </span>
              {wide ? (
                <span data-anchor={`src-${index}`} className="block truncate text-[color:var(--color-text-tertiary)]">
                  {folderOf(row.file)}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
              +{row.added} −{row.removed}
            </span>
            {wide ? null : <ConceptChip id={row.concept} index={index} labelOf={labelOf} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConceptChip({ id, index, labelOf }: { id: string; index: number; labelOf: (id: string) => string }) {
  return (
    <span
      data-anchor={`chip-${index}`}
      className={badgeClass({
        shape: 'pill',
        className:
          'inline-flex min-h-8 min-w-0 shrink-0 items-center gap-2 border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-3 py-1 text-label leading-label text-[color:var(--color-text-primary)]',
      })}
      {...part(`chip:${index}`)}
    >
      <OntologyMapKindGlyph kind={kindOf(id)} size={11} />
      <span className="truncate">{labelOf(id)}</span>
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--color-amber-source-a90)]" {...part(`dot:${index}`)} />
    </span>
  );
}

function ConceptColumn({ labelOf }: { labelOf: (id: string) => string }) {
  return (
    <ul className="flex min-w-0 flex-col items-center gap-2">
      {CHANGE_CAST.flatMap((row, index) => [
        <li key={row.concept} className="flex min-w-0 max-w-full">
          <ConceptChip id={row.concept} index={index} labelOf={labelOf} />
        </li>,
        ...row.calm.map((id) => (
          <li key={id} className="flex min-w-0 max-w-full" style={{ opacity: CALM_ALPHA }}>
            <span
              className={badgeClass({
                shape: 'pill',
                className:
                  'inline-flex min-h-8 min-w-0 items-center gap-2 border border-[color:var(--color-border-soft)] px-3 py-1 text-label leading-label text-[color:var(--color-text-secondary)]',
              })}
            >
              <OntologyMapKindGlyph kind={kindOf(id)} size={11} />
              <span className="truncate">{labelOf(id)}</span>
            </span>
          </li>
        )),
      ])}
    </ul>
  );
}

function BriefPanel({
  wide,
  labelOf,
  moved,
  detail,
  askAgent,
}: {
  wide: boolean;
  labelOf: (id: string) => string;
  moved: string;
  detail: string;
  askAgent: string;
}) {
  const tInsights = useTranslations('navRail');
  const tTab = useTranslations('ontologyPages.insights.tab');
  return (
    <div
      className="relative min-w-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)] shadow-elevation-2"
      {...part('brief')}
    >
      <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
        {tInsights('insights')} · {tTab('brief')}
      </p>
      <p className="mt-3 flex min-w-0 items-start gap-2 text-body leading-body text-[color:var(--color-text-primary)]" {...part('line')}>
        <span aria-hidden className="mt-[0.45rem] size-2.5 shrink-0 rounded-full bg-[color:var(--color-amber-source-a90)]" {...part('line-dot')} />
        <ChevronDown size={ICON_SIZE.sm} aria-hidden className="mt-1 shrink-0 text-[color:var(--color-text-tertiary)]" />
        <span className="min-w-0 font-[var(--font-weight-signature)]">{moved}</span>
      </p>
      <ul className={cn('ml-7 mt-2 flex flex-col border-l border-[color:var(--color-divider)] pl-4', wide ? 'gap-3' : 'gap-1.5')}>
        {CHANGE_CAST.map((row, index) => (
          <li key={row.file} className={cn('min-w-0', !wide && 'flex flex-wrap items-baseline gap-x-2.5')}>
            <span className="text-body leading-body text-[color:var(--color-indigo-text-strong)]">{labelOf(row.concept)}</span>
            <code
              data-anchor={`travel-${index}`}
              className={cn('font-mono text-label leading-label text-[color:var(--color-text-tertiary)]', wide ? 'block break-all' : 'inline-block')}
              {...part(`travel:${index}`)}
            >
              {wide ? row.file : fileName(row.file)}
            </code>
            {wide ? <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-quaternary)]">{detail}</span> : null}
          </li>
        ))}
      </ul>
      <p className="ml-7 mt-3 pl-4">
        <span className={DRAWN_OUTLINE} {...part('ask')}>
          {askAgent}
        </span>
      </p>
    </div>
  );
}

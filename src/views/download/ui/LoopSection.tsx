'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { GitCommitHorizontal, SquareTerminal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { OntologyMapKindGlyph } from '@/shared/ui/ontology-node/map-kind-glyph';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { StageGraph } from '../lib/stage-graph';
import { fileName, kindOf, LOOP_CHANGED, LOOP_PROPOSAL, LOOP_READ } from '../model/loop-cast';
import { SectionIntro } from './SectionIntro';

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
const MONO = 'font-mono text-label leading-label';
/** Small text starts at tertiary: quaternary falls under 7:1 at label size. */
const QUIET = 'text-[color:var(--color-text-tertiary)]';
const CARD =
  'flex min-w-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]';
const CARD_TITLE =
  'text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]';
const CARD_BODY = 'mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]';

/**
 * The three moments the folder works at, each beside a small drawing of the surface it happens
 * on. The drawings repeat what the text says, so they are hidden from assistive technology.
 */
export function LoopSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.loop');
  const tPermission = useTranslations('acpChat.permission');
  const tHeadline = useTranslations('ontologyChangeReview.headline');
  const [cards, entrance] = useEntrance();

  const labelOf = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node.label]));
    return (id: string) => byId.get(id) ?? id.slice(id.indexOf(':') + 1);
  }, [graph.nodes]);

  return (
    <section id="how" data-testid="gateway-loop-section" className={SECTION}>
      {/* The column, not the window, decides the row: the origin leaves it 640px wide at 1040. */}
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />

        <ul
          ref={cards}
          data-testid="gateway-loop-cards"
          data-gateway-entrance={entrance}
          className="mt-9 grid min-w-0 gap-4 @min-[52rem]:grid-cols-3"
        >
          <LoopCard title={t('read.title')} body={t('read.body')}>
            <ReadDrawing labelOf={labelOf} />
          </LoopCard>
          <LoopCard title={t('mark.title')} body={t('mark.body')}>
            <MarkDrawing labelOf={labelOf} commit={t('mark.commit', { count: LOOP_CHANGED.length })} />
          </LoopCard>
          <LoopCard title={t('allow.title')} body={t('allow.body')}>
            <AllowDrawing
              agent={t('allow.agent')}
              review={tPermission('ontologyWriteTitle')}
              change={tHeadline('relate', { from: labelOf(LOOP_PROPOSAL.from), to: labelOf(LOOP_PROPOSAL.to) })}
              allowOnce={tPermission('allowOnce')}
              reject={tPermission('reject')}
            />
          </LoopCard>
        </ul>

        <p className={cn('mt-4 text-label leading-label', QUIET)}>{t('note')}</p>
      </div>
    </section>
  );
}

function LoopCard({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <li className={CARD}>
      {/* One height for all three, so the row's text starts on one line. */}
      <div
        aria-hidden
        className="gateway-loop-drawing flex min-h-60 min-w-0 flex-col justify-center border-b border-[color:var(--color-border-soft)] px-6 py-5"
      >
        {children}
      </div>
      <div className="min-w-0 p-6">
        <h3 className={CARD_TITLE}>{title}</h3>
        <p className={CARD_BODY}>{body}</p>
      </div>
    </li>
  );
}

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

function Concept({ id, label, className }: { id: string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <OntologyMapKindGlyph kind={kindOf(id)} size={10} />
      <span className="min-w-0">{label}</span>
    </span>
  );
}

/** The tool call an agent makes before it opens a file, and what the folder answers. */
function ReadDrawing({ labelOf }: { labelOf: (id: string) => string }) {
  const rows: [string, readonly string[]][] = [
    ['contains', LOOP_READ.contains],
    ['depends_on', LOOP_READ.dependsOn],
  ];
  return (
    <div className="min-w-0">
      <Line index={0} className={cn(MONO, 'flex items-center gap-2 text-[color:var(--color-text-primary)]')}>
        <SquareTerminal size={ICON_SIZE.sm} className={cn('shrink-0', QUIET)} />
        <span className="min-w-0 break-all">{LOOP_READ.tool}</span>
      </Line>
      <Line index={1} className={cn(MONO, 'break-all pl-5', QUIET)}>
        {LOOP_READ.slug}
      </Line>
      <Line
        index={3}
        className="mt-4 flex min-w-0 items-baseline gap-2 text-body leading-body text-[color:var(--color-text-primary)]"
      >
        <Concept id={LOOP_READ.concept} label={labelOf(LOOP_READ.concept)} />
        <span className={cn('shrink-0 text-label leading-label', QUIET)}>{labelOf(LOOP_READ.domain)}</span>
      </Line>
      {rows.map(([key, ids], row) => (
        <Line key={key} index={4 + row} className="mt-1.5 flex min-w-0 items-baseline gap-3 text-label leading-label">
          <span className={cn('w-20 shrink-0 font-mono', QUIET)}>{key}</span>
          <span className="min-w-0 text-[color:var(--color-text-secondary)]">
            {ids.map((id) => labelOf(id)).join(' · ')}
          </span>
        </Line>
      ))}
      <Line index={6} className="mt-1.5 flex min-w-0 items-baseline gap-3 text-label leading-label">
        <span className={cn('w-20 shrink-0 font-mono', QUIET)}>path</span>
        <span className="min-w-0 break-all font-mono text-[color:var(--color-text-secondary)]">{LOOP_READ.path}</span>
      </Line>
    </div>
  );
}

/** Files one commit touched, and the concept recorded for each, marked the way the map marks it. */
function MarkDrawing({ labelOf, commit }: { labelOf: (id: string) => string; commit: string }) {
  return (
    <div className="min-w-0">
      <Line index={0} className={cn('flex items-center gap-2 text-label leading-label', QUIET)}>
        <GitCommitHorizontal size={ICON_SIZE.sm} className="shrink-0" />
        <span className="min-w-0">{commit}</span>
      </Line>
      {LOOP_CHANGED.map((row, index) => (
        <Line key={row.file} index={2 + index * 2} className="mt-2.5">
          <p className={cn(MONO, 'break-all text-[color:var(--color-text-secondary)]')}>{fileName(row.file)}</p>
          <p className="mt-1 flex min-w-0 items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2.5 py-1 text-label leading-label text-[color:var(--color-text-primary)]">
            <Concept id={row.concept} label={labelOf(row.concept)} />
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-status-warning)]" />
          </p>
        </Line>
      ))}
    </div>
  );
}

/** The app's own write card: the change in a sentence, then the two answers. */
function AllowDrawing({
  agent,
  review,
  change,
  allowOnce,
  reject,
}: {
  agent: string;
  review: string;
  change: string;
  allowOnce: string;
  reject: string;
}) {
  return (
    <div className="min-w-0">
      <Line index={0} className={cn('text-label leading-label', QUIET)}>
        {agent}
      </Line>
      <Line
        index={2}
        className="mt-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-3.5"
      >
        <p className={cn('text-label leading-label', QUIET)}>{review}</p>
        <p className="mt-1 text-body leading-body text-[color:var(--color-text-primary)]">{change}</p>
        <p className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-label leading-label">
          <span className="inline-flex min-h-7 items-center rounded-chip bg-[color:var(--color-indigo-accent)] px-3 text-[color:var(--color-text-on-accent)]">
            {allowOnce}
          </span>
          <span className="inline-flex min-h-7 items-center rounded-chip border border-[color:var(--color-border-strong)] px-3 text-[color:var(--color-text-primary)]">
            {reject}
          </span>
        </p>
      </Line>
    </div>
  );
}

/** The first three things a person does in the installed app, in the app's own words. */
export function StartSection() {
  const t = useTranslations('download.start');
  const tFirst = useTranslations('firstRun');
  const tAnalyze = useTranslations('topology.startSteps.analyze');
  const tRail = useTranslations('navRail');
  const tConnect = useTranslations('agentConnect');
  const [steps, entrance] = useEntrance();

  const rows = [
    { title: t('step1.title'), body: t('step1.body'), press: tFirst('openTitle') },
    { title: t('step2.title'), body: t('step2.body'), press: tAnalyze('ctaAgent') },
    {
      title: t('step3.title'),
      body: t('step3.body', { agents: tRail('agents'), mcp: tRail('mcp'), connect: tConnect('short.connect') }),
      press: tConnect('short.connect'),
    },
  ];

  return (
    <section id="start" data-testid="gateway-start-section" className={SECTION}>
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} />

        <ol
          ref={steps}
          data-testid="gateway-start-steps"
          data-gateway-entrance={entrance}
          className="mt-9 grid min-w-0 gap-4 @min-[52rem]:grid-cols-3"
        >
          {rows.map((row, index) => (
            <li key={row.title} className={cn(CARD, 'p-6')}>
              <Line index={index * 2} className="flex min-w-0 items-center justify-between gap-3">
                <span aria-hidden className={cn(MONO, QUIET)}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                {/* The button the step presses, drawn small in the app's own word. */}
                <span
                  aria-hidden
                  className="inline-flex min-h-7 min-w-0 items-center rounded-chip border border-[color:var(--color-border-strong)] px-3 text-label leading-label text-[color:var(--color-text-primary)]"
                >
                  {row.press}
                </span>
              </Line>
              <h3 className={cn(CARD_TITLE, 'mt-5')}>{row.title}</h3>
              <p className={CARD_BODY}>{row.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

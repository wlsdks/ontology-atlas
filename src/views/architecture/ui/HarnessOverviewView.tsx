'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';

import type { CoverageAreaInput, HarnessReport } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { Chip, EmptyState, RowDisclosure, Surface } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  buildHarnessOverview,
  EVERYWHERE_ROW,
  overviewCellKey,
  type OverviewTarget,
} from '../model/harness-overview';
import { HarnessOverviewMatrix } from './HarnessOverviewMatrix';
import { HarnessOverviewPanel } from './HarnessOverviewPanel';
import { HarnessOverviewSilent, HarnessOverviewVerdict } from './HarnessOverviewVerdict';
import type { TranslateFn } from './harness-overview-labels';

/** The slot must hold the table and the 25rem panel side by side; rem, so zoomed text drops to the disclosure layout. */
const PANEL_BESIDE_FROM_REM = 70;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), pre[tabindex]';

function useBelowSlot(slot: HTMLElement | null): boolean {
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    if (!slot) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setBelow(slot.clientWidth > 0 && slot.clientWidth < PANEL_BESIDE_FROM_REM * rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot]);
  return below;
}

function rowSlugOf(target: OverviewTarget | undefined): string | null {
  if (!target) return null;
  if (target.kind === 'cell') return target.cell.row;
  if (target.kind === 'everywhere') return EVERYWHERE_ROW;
  return target.row.slug;
}

function hostSuffix(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function HarnessOverviewView({
  report,
  areas,
  pathlessCapabilities,
  sourceRoot,
  onOpenGuides,
}: {
  report: HarnessReport;
  areas: readonly CoverageAreaInput[];
  pathlessCapabilities: number;
  sourceRoot: string | null;
  onOpenGuides: () => void;
}) {
  const t = useTranslations('harness');
  const baseId = useId();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const below = useBelowSlot(slot);
  const overview = useMemo(() => buildHarnessOverview(report, areas), [report, areas]);

  const [touched, setTouched] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const firstGap = overview.gaps[0];
  const arrivalKey = below
    ? null
    : firstGap
      ? overviewCellKey(firstGap.slug, firstGap.column)
      : (overview.everywhere[0]?.key ?? null);
  const openKey = touched ? pressedKey : arrivalKey;
  const [lastByRow, setLastByRow] = useState<Readonly<Record<string, string>>>({});
  const [epoch, setEpoch] = useState(0);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  const settle = useCallback(() => {
    if (touched) return;
    setTouched(true);
  }, [touched]);

  const closePanel = useCallback(() => {
    settle();
    if (openKey) cellRefs.current.get(openKey)?.focus();
    setPressedKey(null);
  }, [openKey, settle]);

  const pressCell = (key: string) => {
    settle();
    if (openKey === key) {
      setPressedKey(null);
      return;
    }
    const row = rowSlugOf(overview.targets.get(key));
    if (row === null) return;
    const previousRow = openKey ? rowSlugOf(overview.targets.get(openKey)) : null;
    if (below && previousRow !== row) setEpoch((value) => value + 1);
    setPressedKey(key);
    setLastByRow((current) => ({ ...current, [row]: key }));
  };

  useEffect(() => {
    if (openKey === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const inside = (event.target as Element | null)?.closest?.(
        '[data-testid="harness-overview-table"], [data-testid="harness-overview-aside"]',
      );
      if (!inside) return;
      closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openKey, closePanel]);

  const hostRow = openKey ? rowSlugOf(overview.targets.get(openKey)) : null;
  useEffect(() => {
    if (!below || hostRow === null) return;
    const host = document.getElementById(`${baseId}-panel-${hostSuffix(hostRow)}`);
    if (!host) return;
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const scroller = host.closest<HTMLElement>('[data-testid="harness-overview-scroll"]');
    const rowElement = host.closest('[role="row"]')?.previousElementSibling;
    const head = scroller?.querySelector('[data-harness-head]');
    if (!scroller || !rowElement || !head) return;
    const reveal = () => {
      const frame = scroller.getBoundingClientRect();
      const fromTop = (rect: DOMRect) => rect.top - frame.top + scroller.scrollTop;
      const rowTop = fromTop(rowElement.getBoundingClientRect()) - head.getBoundingClientRect().height;
      const panelBottom = fromTop(host.getBoundingClientRect()) + host.getBoundingClientRect().height;
      const needed = panelBottom - scroller.clientHeight;
      const top = needed <= rowTop ? Math.min(Math.max(scroller.scrollTop, needed), rowTop) : rowTop;
      scroller.scrollTo({ top, behavior });
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(host);
    const stop = window.setTimeout(() => observer.disconnect(), 500);
    return () => {
      window.clearTimeout(stop);
      observer.disconnect();
    };
  }, [below, hostRow, openKey, baseId]);

  if (overview.pathedDomainCount === 0) {
    return (
      <section data-testid="harness-overview" className="flex flex-col gap-4">
        <EmptyState
          title={t('coverageNoAreasTitle')}
          description={t('coverageNoAreasBody', { documents: report.guideDocumentCount })}
          action={
            <Chip data-testid="harness-overview-guides" onClick={onOpenGuides}>
              {t('views.guides')}
            </Chip>
          }
        />
      </section>
    );
  }

  const panelHostId = (slug: string) => `${baseId}-panel-${below ? hostSuffix(slug) : 'beside'}`;
  const titleId = (slug: string) => `${baseId}-title-${below ? hostSuffix(slug) : 'beside'}`;
  const openRow = openKey ? rowSlugOf(overview.targets.get(openKey)) : null;
  const provenanceId = `${baseId}-provenance`;

  const onTabHandoff = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (below || event.key !== 'Tab' || openKey === null) return;
    const target = event.target as HTMLElement;
    const host = document.getElementById(panelHostId(''));
    if (!host) return;
    if (!event.shiftKey && target.getAttribute('aria-expanded') === 'true' && target.hasAttribute('data-harness-cell')) {
      event.preventDefault();
      host.focus();
    } else if (event.shiftKey && target === host) {
      event.preventDefault();
      cellRefs.current.get(openKey)?.focus();
    } else if (!event.shiftKey && host.contains(target)) {
      const stops = [...host.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.checkVisibility());
      const last = stops[stops.length - 1];
      if (target !== last) return;
      event.preventDefault();
      const cells = [...document.querySelectorAll<HTMLElement>('[data-testid="harness-overview-table"] [data-harness-cell]')];
      const at = cells.indexOf(cellRefs.current.get(openKey) as HTMLElement);
      const next = cells[at + 1] ?? document.querySelector<HTMLElement>('[data-testid="harness-overview-provenance"]');
      next?.focus();
    }
  };

  const renderPanelRow = (slug: string) => {
    const key = lastByRow[slug];
    const open = openRow === slug;
    return (
      <div key={`${slug}-panel`} role="row" aria-hidden={!open || undefined}>
        <div role="cell">
          <RowDisclosure open={open} id={panelHostId(slug)}>
            {key ? (
              <div role="region" aria-labelledby={titleId(slug)} className="px-3 pb-3">
                <HarnessOverviewPanel
                  overview={overview}
                  targetKey={key}
                  epoch={epoch}
                  placement="below"
                  onClose={closePanel}
                  titleId={titleId(slug)}
                />
              </div>
            ) : null}
          </RowDisclosure>
        </div>
      </div>
    );
  };

  return (
    <section ref={setSlot} data-testid="harness-overview" className="flex min-h-0 flex-1 flex-col">
      <div
        onKeyDown={onTabHandoff}
        className={cn(
          'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]',
          below ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_25rem] gap-5',
        )}
      >
        <div
          data-testid="harness-overview-scroll"
          className="@container/slot flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain"
        >
          <HarnessOverviewVerdict
            overview={overview}
            sourceRoot={sourceRoot}
            readingIsEmpty={report.coverage.length === 0}
          />
          <HarnessOverviewMatrix
            overview={overview}
            openKey={openKey}
            below={below}
            onPress={pressCell}
            registerCell={(key, node) => {
              if (node) cellRefs.current.set(key, node);
              else cellRefs.current.delete(key);
            }}
            panelHostId={panelHostId}
            renderPanelRow={renderPanelRow}
          />
          <HarnessOverviewSilent overview={overview} onOpenGuides={onOpenGuides} />
          <div className="flex shrink-0 flex-col gap-2 px-1">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-[color:var(--color-text-quaternary)]">
              {below ? <span>{t('overviewCellHint')}</span> : null}
              <button
                type="button"
                data-testid="harness-overview-provenance"
                aria-expanded={provenanceOpen}
                aria-controls={provenanceId}
                onClick={() => setProvenanceOpen((open) => !open)}
                className={controlClass({ shape: 'link', size: 'md', tone: 'default', hoverInk: 'strong', className: 'gap-1' })}
              >
                {t('coverageProvenance')}
                <ChevronRight
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className={cn('shrink-0 transition-[rotate] duration-[var(--motion-fast)] motion-reduce:transition-none', provenanceOpen && 'rotate-90')}
                />
              </button>
            </p>
            <RowDisclosure open={provenanceOpen} id={provenanceId}>
              <ProvenanceNotes overview={overview} pathlessCapabilities={pathlessCapabilities} t={t} />
            </RowDisclosure>
          </div>
        </div>

        {below ? null : (
          <Surface
            as="aside"
            motion="overlay"
            open
            id={panelHostId('')}
            data-testid="harness-overview-aside"
            aria-labelledby={titleId('')}
            tabIndex={openKey ? 0 : undefined}
            className="min-h-0 overflow-y-auto overscroll-contain rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
          >
            <HarnessOverviewPanel
              overview={overview}
              targetKey={openKey ?? ''}
              epoch={epoch}
              placement="beside"
              onClose={closePanel}
              titleId={titleId('')}
            />
          </Surface>
        )}
      </div>
    </section>
  );
}

function ProvenanceNotes({
  overview,
  pathlessCapabilities,
  t,
}: {
  overview: ReturnType<typeof buildHarnessOverview>;
  pathlessCapabilities: number;
  t: TranslateFn;
}) {
  const note = 'text-label tabular-nums text-[color:var(--color-text-quaternary)]';
  return (
    <div className="flex flex-col gap-2 pb-1">
      <p className={note}>{t('coverageRule')}</p>
      {overview.unreachedPaths.length > 0 ? (
        <p className={note}>
          {t('coverageUnreached', {
            count: overview.unreachedPaths.length,
            paths: overview.unreachedPaths.join(' · '),
          })}
        </p>
      ) : null}
      {overview.outsideFolders.length > 0 ? (
        <p className={note}>
          {t('coverageOutside', {
            count: overview.outsideCount,
            folders: overview.outsideFolders.join(' · '),
          })}
        </p>
      ) : null}
      {pathlessCapabilities > 0 ? (
        <p className={note}>{t('coveragePathless', { count: pathlessCapabilities })}</p>
      ) : null}
      <p className={note}>{t('overviewLoopNote')}</p>
    </div>
  );
}

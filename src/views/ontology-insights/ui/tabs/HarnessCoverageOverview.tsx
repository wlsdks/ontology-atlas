'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button, Dialog, Disclosure, RowDisclosure, Surface } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/transient-surface';
import type { CoverageColumn } from '@/entities/agent-files';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';
import styles from './harness-coverage-overview.module.css';

type MeasuredDetail = Extract<InsightsBrief['harnessDetail'], { availability: 'measured' }>;
type Evidence = MeasuredDetail['evidence'];
type Area = Evidence['areas'][number];
type Selection =
  | { kind: 'domain'; areaSlug: string; column: CoverageColumn }
  | { kind: 'separate'; column: CoverageColumn }
  | { kind: 'outside' }
  | { kind: 'unreached' }
  | { kind: 'findings' };
type ReadingMode = 'diagram' | 'text';
type PresentationMode = 'desktop' | 'narrow';
type CloseIntent = 'restore' | 'outside' | 'breakpoint' | 'anchor-hidden' | 'mode-change';

const NARROW_QUERY = '(max-width: 767px)';

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_QUERY).matches
    : false;
}

function isVisibleAndUsable(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element.closest('[hidden], [inert]')) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number.parseFloat(style.opacity) === 0) return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

const selectionKey = (selection: Selection) => selection.kind === 'domain'
  ? `domain:${selection.areaSlug}:${selection.column}`
  : selection.kind === 'separate' ? `separate:${selection.column}` : selection.kind;

export function HarnessCoverageOverview({
  evidence,
  guideFiles,
  checks,
  drift,
}: {
  evidence: Evidence;
  guideFiles: number;
  checks: number;
  drift: readonly { path: string; message: string }[];
}) {
  const t = useTranslations('ontologyPages.insights.harnessTab.visual');
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [presented, setPresented] = useState<Selection | null>(null);
  const [presentationMode, setPresentationMode] = useState<PresentationMode | null>(null);
  const [popupStyle, setPopupStyle] = useState<(CSSProperties & { transformOrigin: string }) | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLElement | null>(null);
  const generationRef = useRef(0);
  const focusedGenerationRef = useRef(0);
  const closingRef = useRef<{ generation: number; selection: Selection; intent: CloseIntent; popupOwnedFocus: boolean } | null>(null);
  const [mode, setMode] = useState<ReadingMode>('diagram');

  const presentedArea = presented?.kind === 'domain'
    ? evidence.areas.find((area) => area.slug === presented.areaSlug) ?? null
    : null;
  const presentedCollection = presented && presented.kind !== 'domain' ? presented : null;

  const close = useCallback((intent: CloseIntent = 'restore') => {
    if (!selected) return;
    closingRef.current = {
      generation: generationRef.current,
      selection: selected,
      intent,
      popupOwnedFocus: intent === 'anchor-hidden' && Boolean(popupRef.current?.contains(document.activeElement)),
    };
    setSelected(null);
  }, [selected]);

  const desktopOpen = selected !== null && presentationMode === 'desktop' && !narrow;
  const narrowOpen = selected !== null && presentationMode === 'narrow' && narrow;

  /** The vertical room the popup may use: the scroll field's top to the usable bottom. */
  const fieldBounds = () => {
    const nav = document.querySelector<HTMLElement>('[data-tabbar="primary"]')?.getBoundingClientRect();
    return {
      top: fieldRef.current?.getBoundingClientRect().top ?? 0,
      bottom: nav && nav.width > 0 && nav.height > 0 ? nav.top : window.innerHeight,
    };
  };

  const place = useCallback(() => {
    if (!selected || typeof window === 'undefined') return;
    const trigger = triggerRefs.current.get(selectionKey(selected));
    if (!trigger || !isVisibleAndUsable(trigger)) {
      close('anchor-hidden');
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const field = fieldRef.current;
    const pane = field?.closest<HTMLElement>('[data-testid="app-shell-body-slot"]');
    const fieldRect = field?.getBoundingClientRect();
    const paneRect = pane?.getBoundingClientRect();
    const navCandidate = document.querySelector<HTMLElement>('[data-tabbar="primary"]')?.getBoundingClientRect();
    const usableBottom = navCandidate && navCandidate.width > 0 && navCandidate.height > 0 ? navCandidate.top : window.innerHeight;
    const fullyInside = (boundary: DOMRect | undefined) => !boundary || (
      rect.left >= boundary.left - 1 && rect.right <= boundary.right + 1 &&
      rect.top >= boundary.top - 1 && rect.bottom <= boundary.bottom + 1
    );
    if (!fullyInside(fieldRect) || !fullyInside(paneRect) || rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > usableBottom + 1) {
      close('anchor-hidden');
      return;
    }
    const railRight = document.querySelector<HTMLElement>('[data-testid="app-nav-rail"]')?.getBoundingClientRect().right ?? 0;
    setPopupStyle(popupPlacement(rect, window.innerWidth, window.innerHeight, railRight, popupRef.current?.getBoundingClientRect(), { top: fieldRect?.top ?? 0, bottom: usableBottom }));
  }, [close, selected]);

  useLayoutEffect(() => {
    if (desktopOpen) place();
  }, [desktopOpen, place]);

  useEffect(() => {
    if (!desktopOpen) return;
    const frame = window.requestAnimationFrame(place);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [desktopOpen, place]);

  useEffect(() => {
    if (!selected || presentationMode === null) return;
    if ((presentationMode === 'narrow') === narrow) return;
    const frame = window.requestAnimationFrame(() => close('breakpoint'));
    return () => window.cancelAnimationFrame(frame);
  }, [close, narrow, presentationMode, selected]);

  useEffect(() => {
    if (!desktopOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if ([...triggerRefs.current.values()].some((trigger) => trigger.contains(target))) return;
      close('outside');
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [close, desktopOpen]);

  useEffect(() => {
    if (!desktopOpen || popupStyle === null) return;
    const generation = generationRef.current;
    if (focusedGenerationRef.current === generation) return;
    const popup = popupRef.current;
    if (!popup) return;
    focusedGenerationRef.current = generation;
    popup.focus({ preventScroll: true });
  }, [desktopOpen, popupStyle, presented]);

  const handleDesktopExited = useCallback(() => {
    const closing = closingRef.current;
    if (!closing) return;
    if (generationRef.current !== closing.generation || selected !== null) return;
    closingRef.current = null;
    if (closing.intent === 'restore') {
      const active = document.activeElement;
      if (!active || active === document.body || popupRef.current?.contains(active)) {
        triggerRefs.current.get(selectionKey(closing.selection))?.focus({ preventScroll: true });
      }
    } else if (closing.intent === 'anchor-hidden' && closing.popupOwnedFocus) {
      const active = document.activeElement;
      if ((!active || active === document.body || popupRef.current?.contains(active)) && isVisibleAndUsable(fieldRef.current)) {
        fieldRef.current?.focus({ preventScroll: true });
      }
    }
    setPresented(null);
    setPresentationMode(null);
    setPopupStyle(null);
  }, [selected]);

  const select = (selection: Selection, trigger: HTMLButtonElement) => {
    generationRef.current += 1;
    closingRef.current = null;
    focusedGenerationRef.current = 0;
    setPresented(selection);
    setPresentationMode(narrow ? 'narrow' : 'desktop');
    setSelected(selection);
    const railRight = document.querySelector<HTMLElement>('[data-testid="app-nav-rail"]')?.getBoundingClientRect().right ?? 0;
    setPopupStyle(popupPlacement(trigger.getBoundingClientRect(), window.innerWidth, window.innerHeight, railRight, undefined, fieldBounds()));
  };

  const selectMode = (next: ReadingMode) => {
    if (selected) close('mode-change');
    setMode(next);
  };

  const evidenceAction = (selection: Selection, label: string, count: number) => {
    const key = selectionKey(selection);
    const isSelected = selected ? selectionKey(selected) === key : false;
    return (
      <button
        key={key}
        ref={(node) => { if (node) triggerRefs.current.set(key, node); else triggerRefs.current.delete(key); }}
        type="button"
        aria-expanded={isSelected}
        aria-haspopup="dialog"
        aria-controls={narrow ? 'harness-role-evidence-dialog-content' : 'harness-role-evidence-popup'}
        data-guidance-evidence-action={key}
        onClick={(event) => select(selection, event.currentTarget)}
        className={controlClass({ shape: 'chip', size: 'md', active: isSelected, hoverSurface: 'lift' })}
      >
        <span>{label}</span><span className="font-mono tabular-nums">{count}</span>
      </button>
    );
  };

  /*
   * How many domains each role reaches at all. The column that reaches the fewest is the one
   * thing on this screen worth reading first, so it alone is drawn in the warning ink; the
   * others stay quiet. It states coverage as a count, not a verdict.
   */
  const covered = (['told', 'gated', 'watched'] as const).map((column) => ({
    column,
    count: evidence.areas.filter((area) => area.roles[column].declarations.length > 0).length,
  }));
  const weakest = covered.reduce((low, entry) => (entry.count < low.count ? entry : low), covered[0]!);
  const weakestColumn = evidence.areas.length > 0 && weakest.count < evidence.areas.length ? weakest.column : null;

  const evidenceContent = presented?.kind === 'domain' && presentedArea ? (
    <RoleEvidence
      area={presentedArea}
      column={presented.column}
      evidence={evidence}
      contentId={presentationMode === 'narrow' ? 'harness-role-evidence-dialog-content' : undefined}
      onClose={() => close('restore')}
    />
  ) : presentedCollection ? (
    <CollectionEvidence
      selection={presentedCollection}
      evidence={evidence}
      drift={drift}
      contentId={presentationMode === 'narrow' ? 'harness-role-evidence-dialog-content' : undefined}
      onClose={() => close('restore')}
    />
  ) : null;

  const selectionLabel = presented?.kind === 'domain' && presentedArea
    ? t('popupLabel', { domain: presentedArea.title, role: t(`role.${presented.column}`) })
    : presented ? t(`collection.${presented.kind}.title`, presented.kind === 'separate' ? { role: t(`role.${presented.column}`) } : {}) : t('popupFallbackLabel');

  return (
    <section data-testid="harness-coverage-overview" className="flex min-h-0 flex-1 flex-col">
      <div ref={fieldRef} className={styles.field} data-domain-count={evidence.areas.length} tabIndex={-1} aria-label={t('fieldLabel')}>
        <div data-guidance-overview-header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
          <div>
            <h3 className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('title', { count: evidence.areas.length })}
            </h3>
            <p data-guidance-coverage className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body text-[color:var(--color-text-tertiary)]">
              {covered.map(({ column, count }) => (
                <span
                  key={column}
                  data-coverage-role={column}
                  data-weakest={column === weakestColumn ? 'true' : undefined}
                  className={column === weakestColumn ? 'font-[var(--font-weight-emphasis)] text-[color:var(--color-status-warning)]' : undefined}
                >
                  {t('coverage', { role: t(`role.${column}`), covered: count, total: evidence.areas.length })}
                </span>
              ))}
            </p>
            <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
              <span>{t('inventoryCaption', { guides: guideFiles, checks })}</span> <span>{t('diagramCaption')}</span>
            </p>
          </div>
          <SegmentedControl
            ariaLabel={t('mode.label')}
            value={mode}
            onChange={selectMode}
            size="md"
            options={([
              { value: 'diagram', label: t('mode.diagram'), testId: 'guidance-mode-diagram' },
              { value: 'text', label: t('mode.text'), testId: 'guidance-mode-text' },
            ] as const)}
            testId="guidance-mode"
          />
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${styles.collectionStrip}`} data-testid="guidance-collection-actions">
          {(['told', 'gated', 'watched'] as const).map((column) => evidenceAction({ kind: 'separate', column }, t('collection.separate.action', { role: t(`role.${column}`) }), evidence.everywhere[column].length))}
          {evidenceAction({ kind: 'outside' }, t('collection.outside.action'), evidence.outsideAreas.length)}
          {evidenceAction({ kind: 'unreached' }, t('collection.unreached.action'), evidence.unreachedCapabilities.length)}
          {evidenceAction({ kind: 'findings' }, t('collection.findings.action'), drift.length)}
          <Link href="/architecture/?view=guides" className={controlClass({ shape: 'link', size: 'md', className: 'min-h-8 px-1 text-[color:var(--color-indigo-text-strong)]' })}>{t('findingSummary')}</Link>
        </div>
        {mode === 'diagram' ? (
          <div className={styles.domainGrid} data-guidance-domain-grid>
            {evidence.areas.map((area) => <DomainGroup key={area.slug} area={area} selected={selected} triggerRefs={triggerRefs} controlsId={narrow ? 'harness-role-evidence-dialog-content' : 'harness-role-evidence-popup'} weakestColumn={weakestColumn} onSelect={select} />)}
          </div>
        ) : (
          <div className={styles.textList} data-testid="guidance-text-list">
            {evidence.areas.map((area) => <TextDomainRow key={area.slug} area={area} selected={selected} triggerRefs={triggerRefs} controlsId={narrow ? 'harness-role-evidence-dialog-content' : 'harness-role-evidence-popup'} weakestColumn={weakestColumn} onSelect={select} />)}
          </div>
        )}
      </div>

      {typeof document !== 'undefined' && presentationMode === 'desktop' && evidenceContent !== null
        ? createPortal(
        <Surface
          open={desktopOpen && popupStyle !== null}
          onExited={handleDesktopExited}
          origin={popupStyle?.transformOrigin}
          role="dialog"
          aria-modal="false"
          aria-label={selectionLabel}
          id="harness-role-evidence-popup"
          tabIndex={-1}
          ref={popupRef}
          {...transientSurface('anchored')}
          data-testid="harness-role-popup"
          style={popupStyle ?? undefined}
          className="fixed z-30 flex max-h-[min(32rem,calc(100vh-2rem))] flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]"
        >
          {evidenceContent}
        </Surface>,
          document.body,
        )
        : null}
      {presentationMode === 'narrow' && evidenceContent !== null ? (
        <Dialog
          open={narrowOpen}
          onClose={() => close('restore')}
          size="md"
          aria-label={selectionLabel}
          testId="harness-role-dialog"
          className="max-h-[calc(100dvh-2rem)] overflow-hidden p-0"
        >
          {evidenceContent}
        </Dialog>
      ) : null}
    </section>
  );
}

interface RoleChipProps {
  area: Area;
  column: CoverageColumn;
  selected: Selection | null;
  triggerRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  controlsId: string;
  weakestColumn: CoverageColumn | null;
  onSelect: (selection: Selection, trigger: HTMLButtonElement) => void;
}

/*
 * One chip grammar for both reading modes: mark, role, count, at the chip's own width. An empty
 * role in the column that reaches the fewest domains wears the same warning ink as that column's
 * coverage line in the header, so the header's one highlighted gap points at the places it counts.
 */
function RoleChip({ area, column, selected, triggerRefs, controlsId, weakestColumn, onSelect }: RoleChipProps) {
  const t = useTranslations('ontologyPages.insights.harnessTab.visual');
  const selection: Selection = { kind: 'domain', areaSlug: area.slug, column };
  const key = selectionKey(selection);
  const count = area.roles[column].declarations.length;
  const isSelected = selected ? selectionKey(selected) === key : false;
  return (
    <button
      ref={(node) => { if (node) triggerRefs.current.set(key, node); else triggerRefs.current.delete(key); }}
      type="button"
      data-role={column}
      data-state={count === 0 ? 'empty' : 'filled'}
      data-weakest={count === 0 && column === weakestColumn ? 'true' : undefined}
      aria-expanded={isSelected}
      aria-haspopup="dialog"
      aria-controls={controlsId}
      aria-label={count === 0
        ? t('emptyRoleLabel', { domain: area.title, role: t(`role.${column}`) })
        : t('filledRoleLabel', { domain: area.title, role: t(`role.${column}`), count })}
      onClick={(event) => onSelect(selection, event.currentTarget)}
      className={controlClass({
        shape: 'chip',
        size: 'md',
        active: isSelected,
        hoverSurface: 'lift',
        className: styles.role,
      })}
    >
      <span className={styles.roleMark} aria-hidden />
      <span>{t(`role.${column}`)}</span>
      <span className={`font-mono tabular-nums ${styles.roleCount}`}>{count}</span>
    </button>
  );
}

type RowProps = Omit<RoleChipProps, 'column'>;

/*
 * The tree grows with its grid cell: the two stems take whatever height the row gives the domain,
 * up to a cap, so the domains fill the field instead of floating in it. The fork sits just above
 * the two lower chips, which keeps the drawing a tree however tall the stems get.
 *
 * The stem under the name is shared by both branches and is drawn exactly once. The stroke is
 * translucent, so two paths laid over one stem measured brighter (blue 142) than one path (89) and
 * a dashed "none" branch laid over a solid one showed dashes through it. Each branch therefore
 * keeps its full heading-to-chip geometry (the attachment checks walk it), but only one of them
 * paints the shared stem: a declared branch whose sibling already paints it skips that length
 * with its dash array, and an empty branch starts at the fork.
 */
function DomainGroup(props: RowProps) {
  const { area } = props;
  const domainRef = useRef<HTMLElement | null>(null);
  const topRef = useRef<SVGSVGElement | null>(null);
  const lowerRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 100, top: 12, lower: 14 });
  useLayoutEffect(() => {
    const domain = domainRef.current;
    if (!domain) return;
    const measure = () => {
      const next = {
        width: domain.getBoundingClientRect().width || 100,
        top: topRef.current?.getBoundingClientRect().height || 12,
        lower: lowerRef.current?.getBoundingClientRect().height || 14,
      };
      setSize((current) => current.width === next.width && current.top === next.top && current.lower === next.lower ? current : next);
    };
    measure();
    /* The stems can change height while the domain keeps its size (a web font swapping in rewraps
       the name), so each stem is observed on its own, not only the domain around them. */
    const observer = new ResizeObserver(measure);
    observer.observe(domain);
    if (topRef.current) observer.observe(topRef.current);
    if (lowerRef.current) observer.observe(lowerRef.current);
    return () => observer.disconnect();
  }, []);
  const told = area.roles.told.declarations.length > 0;
  const gated = area.roles.gated.declarations.length > 0;
  const watched = area.roles.watched.declarations.length > 0;
  const { width, top, lower } = size;
  const lowerGap = 10;
  const gatedX = (width - lowerGap) / 4;
  const watchedX = width - gatedX;
  const center = width / 2;
  const fork = Math.max(0, lower - 7);
  const topPath = `M ${center} 0 V ${top}`;
  const gatedPath = `M ${center} 0 V ${fork} H ${gatedX} V ${lower}`;
  const watchedPath = `M ${center} 0 V ${fork} H ${watchedX} V ${lower}`;
  const fromFork = (x: number) => `M ${center} ${fork} H ${x} V ${lower}`;
  // Gated paints the shared stem when it is declared, or when neither branch is (then dashed).
  const gatedPaintsStem = gated || !watched;
  return (
    <section ref={domainRef} className={styles.domain} aria-label={area.title} data-testid={`harness-domain-${area.slug}`}>
      <div className={styles.topRole}><RoleChip {...props} column="told" /></div>
      <svg ref={topRef} className={styles.topConnection} viewBox={`0 0 ${width} ${top}`} preserveAspectRatio="none" aria-hidden>
        {told ? <path data-role-connection="told" d={topPath} /> : <path data-role-connection-empty="told" data-empty d={topPath} />}
      </svg>
      <div className={styles.domainHeading} data-domain-heading>
        <h4 className={styles.domainName}>{area.title}</h4>
        {/* What the domain is for is what makes a zero readable: "this area does X and nothing
            checks it", not "a file is absent". It also gives each tree a body instead of a bare
            stretched stem. The full sentence stays in the text reading. */}
        {area.purpose ? <p className={styles.domainPurpose} title={area.purpose}>{area.purpose}</p> : null}
      </div>
      <svg ref={lowerRef} className={styles.lowerConnections} viewBox={`0 0 ${width} ${lower}`} preserveAspectRatio="none" aria-hidden>
        {gated
          ? <path data-role-connection="gated" d={gatedPath} />
          : <path data-role-connection-empty="gated" data-empty d={gatedPaintsStem ? gatedPath : fromFork(gatedX)} />}
        {watched
          ? <path data-role-connection="watched" d={watchedPath} style={gated ? { strokeDasharray: `0 ${fork} ${width + lower}` } : undefined} />
          : <path data-role-connection-empty="watched" data-empty d={fromFork(watchedX)} />}
      </svg>
      <div className={styles.lowerRoles}><RoleChip {...props} column="gated" /><RoleChip {...props} column="watched" /></div>
    </section>
  );
}

function TextDomainRow(props: RowProps) {
  const { area } = props;
  return (
    <section className={styles.textRow} data-testid={`harness-text-domain-${area.slug}`}>
      <div className="min-w-0">
        <h4 className="break-words text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{area.title}</h4>
        <p className="mt-1 break-words text-label text-[color:var(--color-text-tertiary)]">{area.purpose}</p>
      </div>
      {(['told', 'gated', 'watched'] as const).map((column) => <RoleChip key={column} {...props} column={column} />)}
    </section>
  );
}

function CollectionEvidence({ selection, evidence, drift, contentId, onClose }: {
  selection: Exclude<Selection, { kind: 'domain' }>;
  evidence: Evidence;
  drift: readonly { path: string; message: string }[];
  contentId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('ontologyPages.insights.harnessTab.visual');
  const [expanded, setExpanded] = useState<string | null>(null);
  const declarations = selection.kind === 'separate' ? evidence.everywhere[selection.column] : selection.kind === 'outside' ? evidence.outsideAreas : [];
  const title = t(`collection.${selection.kind}.title`, selection.kind === 'separate' ? { role: t(`role.${selection.column}`) } : {});
  const description = t(`collection.${selection.kind}.description`);
  const headingId = `harness-collection-heading-${selectionKey(selection).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <div id={contentId} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="harness-collection-evidence" data-collection-kind={selection.kind}>
      <div className="sticky top-0 z-10 flex flex-none items-start justify-between gap-4 border-b border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-4 py-3">
        <div className="min-w-0"><p className="text-label text-[color:var(--color-text-quaternary)]">{t('collection.eyebrow')}</p><h4 id={headingId} className="mt-1 break-words text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{title}</h4></div>
        <Button variant="ghost" size="sm" onClick={onClose}>{t('close')}</Button>
      </div>
      <div tabIndex={0} role="region" aria-labelledby={headingId} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]" data-testid="harness-collection-scroll-body">
        <p className="whitespace-normal text-body text-[color:var(--color-text-secondary)]">{description}</p>
        {selection.kind === 'findings' ? <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t('collection.findings.independence')}</p> : null}
        {declarations.length > 0 ? (
          <ul className="mt-3 divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]">
            {declarations.map((declaration) => <SourceEvidenceRow key={declaration.id} id={`${selection.kind}-${declaration.id}`} kind={selection.kind === 'outside' ? 'outside' : 'global'} declaration={declaration} open={expanded === declaration.id} onToggle={() => setExpanded((current) => current === declaration.id ? null : declaration.id)} detail={<>
              <EvidenceLine label={t('sourceId')}><code className="break-all">{declaration.id}</code></EvidenceLine>
              <EvidenceLine label={t('sourceLabel')}>{declaration.label}</EvidenceLine>
              <DeclarationScope declaration={declaration} />
              {declaration.tools.length > 0 ? <EvidenceLine label={t('tools')}>{declaration.tools.join(' · ')}</EvidenceLine> : null}
            </>} />)}
          </ul>
        ) : null}
        {selection.kind === 'unreached' ? (
          <ul className="mt-3 divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]" data-testid="harness-unreached-list">
            {evidence.unreachedCapabilities.map((capability) => <li key={capability.slug} className="py-3"><p className="break-words text-body text-[color:var(--color-text-primary)]">{capability.title}</p><code className="block break-all text-label text-[color:var(--color-text-tertiary)]">{capability.slug}</code><code className="block break-all text-label text-[color:var(--color-text-tertiary)]">{capability.path}</code></li>)}
          </ul>
        ) : null}
        {selection.kind === 'findings' ? (
          <ul className="mt-3 divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]" data-testid="harness-findings-list">
            {drift.map((finding, index) => <li key={`${finding.path}:${index}`} className="py-3"><code className="block break-all text-label text-[color:var(--color-text-primary)]">{finding.path}</code><p className="mt-1 whitespace-normal text-label text-[color:var(--color-text-tertiary)]">{finding.message}</p></li>)}
          </ul>
        ) : null}
        {(declarations.length === 0 && selection.kind !== 'unreached' && selection.kind !== 'findings') || (selection.kind === 'unreached' && evidence.unreachedCapabilities.length === 0) || (selection.kind === 'findings' && drift.length === 0)
          ? <p className="mt-3 text-label text-[color:var(--color-text-quaternary)]">{t('collection.none')}</p> : null}
      </div>
    </div>
  );
}

function RoleEvidence({ area, column, evidence, contentId, onClose }: { area: Area; column: CoverageColumn; evidence: Evidence; contentId?: string; onClose: () => void }) {
  const t = useTranslations('ontologyPages.insights.harnessTab.visual');
  const role = area.roles[column];
  const globals = evidence.everywhere[column];
  const [expandedScoped, setExpandedScoped] = useState<string | null>(null);
  const [expandedGlobal, setExpandedGlobal] = useState<string | null>(null);
  const headingId = `harness-role-heading-${area.slug}-${column}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  return (
    <div id={contentId} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="harness-role-evidence" data-domain={area.slug} data-role={column} data-scoped-count={role.declarations.length}>
      <div className="sticky top-0 z-10 flex flex-none items-start justify-between gap-4 border-b border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-label text-[color:var(--color-text-quaternary)]">{t(`role.${column}`)}</p>
          <h4 id={headingId} className="mt-1 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{area.title}</h4>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>{t('close')}</Button>
      </div>
      <div tabIndex={0} role="region" aria-labelledby={headingId} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]" data-testid="harness-role-scroll-body">
        <p className="break-keep text-body text-[color:var(--color-text-secondary)]">{area.purpose}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-title font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-primary)]">{role.declarations.length}</span>
          <p className="text-label text-[color:var(--color-text-tertiary)]">
            {role.declarations.length === 0 ? t('zeroScoped', { role: t(`role.${column}`) }) : t('exactCount', { count: role.declarations.length })}
          </p>
        </div>
        {role.declarations.length > 0 ? (
          <ul className="mt-3 divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]">
            {role.declarations.map(({ declaration, matchedCapabilities }) => (
              <SourceEvidenceRow
                key={declaration.id}
                id={`scoped-${declaration.id}`}
                kind="scoped"
                declaration={declaration}
                open={expandedScoped === declaration.id}
                onToggle={() => setExpandedScoped((current) => current === declaration.id ? null : declaration.id)}
                detail={<>
                  <DeclarationIdentity declaration={declaration} />
                  <DeclarationScope declaration={declaration} />
                  <EvidenceLine label={t('matchedEntrypoints')}>
                    {matchedCapabilities.map((capability) => <code key={capability.slug} className="block break-all">{capability.path}</code>)}
                  </EvidenceLine>
                  {declaration.tools.length > 0 ? <EvidenceLine label={t('tools')}>{declaration.tools.join(' · ')}</EvidenceLine> : null}
                </>}
              />
            ))}
          </ul>
        ) : null}
        <div data-global-count={globals.length}>
          <p className="mt-3 whitespace-normal text-label text-[color:var(--color-text-tertiary)]" data-testid="harness-global-evidence-explanation">
            {t('globalExplanation')}
          </p>
          <Disclosure
            animated
            summary={<span className="min-w-0 whitespace-normal text-left">{t('globalCount', { count: globals.length })}</span>}
            summaryTestId="harness-global-evidence-toggle"
            className="mt-3 border-t border-[color:var(--color-divider)] pt-3"
          >
            {globals.length > 0 ? (
              <ul className="divide-y divide-[color:var(--color-divider)]">
                {globals.map((declaration) => (
                  <SourceEvidenceRow
                    key={declaration.id}
                    id={`global-${declaration.id}`}
                    kind="global"
                    declaration={declaration}
                    open={expandedGlobal === declaration.id}
                    onToggle={() => setExpandedGlobal((current) => current === declaration.id ? null : declaration.id)}
                    detail={<><DeclarationIdentity declaration={declaration} /><DeclarationScope declaration={declaration} /></>}
                  />
                ))}
              </ul>
            ) : <p className="text-label text-[color:var(--color-text-quaternary)]">{t('globalNone')}</p>}
          </Disclosure>
        </div>
        {column === 'watched' ? <p className="mt-3 text-label text-[color:var(--color-text-tertiary)]">{t('discoveredTests', { count: area.discoveredTests })}</p> : null}
        <p className="mt-3 break-keep text-caption text-[color:var(--color-text-quaternary)]">{t('limit')}</p>
      </div>
    </div>
  );
}

function DeclarationScope({ declaration }: { declaration: Evidence['everywhere'][CoverageColumn][number] }) {
  const t = useTranslations('ontologyPages.insights.harnessTab.visual');
  const extracted = declaration.declaration.trim();
  return (
    <EvidenceLine label={t('extractedScope')}>
      {extracted
        ? <code className="break-all">{extracted}</code>
        : <span data-no-extracted-scope>{t('noExtractedScope')}</span>}
    </EvidenceLine>
  );
}

function DeclarationIdentity({ declaration }: { declaration: Evidence['everywhere'][CoverageColumn][number] }) {
  const t = useTranslations('ontologyPages.insights.harnessTab.visual');
  return <><EvidenceLine label={t('sourceId')}><code className="break-all">{declaration.id}</code></EvidenceLine><EvidenceLine label={t('sourceLabel')}>{declaration.label}</EvidenceLine></>;
}

function SourceEvidenceRow({ declaration, id, kind, open, onToggle, detail }: {
  declaration: Evidence['everywhere'][CoverageColumn][number];
  id: string;
  kind: 'scoped' | 'global' | 'outside';
  open: boolean;
  onToggle: () => void;
  detail: ReactNode;
}) {
  const controlId = `harness-evidence-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const repeatsId = declaration.label === declaration.id;
  return (
    <li data-evidence-source={declaration.id} data-evidence-kind={kind}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controlId}
        onClick={onToggle}
        className={controlClass({ shape: 'row', size: 'sm', active: open, hoverSurface: 'lift', className: 'min-h-9 w-full justify-between gap-3 px-2 text-left' })}
      >
        <span className="min-w-0">
          <code className="block truncate font-mono text-label text-[color:var(--color-text-primary)]">{declaration.id}</code>
          {!repeatsId ? <span className="block truncate text-caption text-[color:var(--color-text-tertiary)]">{declaration.label}</span> : null}
        </span>
        <span className="shrink-0 text-caption text-[color:var(--color-text-quaternary)]">{open ? '−' : '+'}</span>
      </button>
      <RowDisclosure open={open} id={controlId} className="px-2 pb-3">{detail}</RowDisclosure>
    </li>
  );
}

function EvidenceLine({ label, children }: { label: string; children: ReactNode }) {
  return <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]"><span className="block text-caption text-[color:var(--color-text-quaternary)]">{label}</span>{children}</p>;
}

/**
 * Where the evidence popup stands beside its port.
 *
 * ⚠️ **Vertical room is the field's, not the window's.** Measured against the viewport, a port in
 * the second row at 1040×720 flipped the popup upward to y=16, over the page title and the
 * Brief/Concepts/Wiki/Guidance switch (2026-09-25). `bounds` is the scroll field's own top and the
 * usable bottom; the popup opens on whichever side has more of that room and scrolls inside it.
 */
function popupPlacement(anchor: DOMRect, viewportWidth: number, viewportHeight: number, paneLeft = 0, popup?: DOMRect, bounds?: { top: number; bottom: number }): CSSProperties & { transformOrigin: string } {
  const leftFloor = Math.max(16, paneLeft + 16);
  const width = Math.min(popup?.width || 380, viewportWidth - leftFloor - 16);
  const measuredHeight = popup?.height || 480;
  const ceiling = Math.max(16, (bounds?.top ?? 0) + 8);
  const floor = Math.min(viewportHeight - 16, (bounds?.bottom ?? viewportHeight) - 8);
  const availableBelow = floor - anchor.bottom - 8;
  const availableAbove = anchor.top - 8 - ceiling;
  const placeAbove = availableBelow < Math.min(measuredHeight, 360) && availableAbove > availableBelow;
  const maxHeight = Math.max(160, placeAbove ? availableAbove : availableBelow);
  const left = Math.min(Math.max(leftFloor, anchor.left + anchor.width / 2 - width / 2), viewportWidth - width - 16);
  const top = placeAbove ? undefined : anchor.bottom + 8;
  const bottom = placeAbove ? viewportHeight - anchor.top + 8 : undefined;
  return {
    left,
    top,
    bottom,
    width,
    maxHeight,
    transformOrigin: `${Math.min(width - 16, Math.max(16, anchor.left + anchor.width / 2 - left))}px ${placeAbove ? 'bottom' : 'top'}`,
  };
}

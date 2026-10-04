'use client';

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MAP_CANVAS_SURFACE_ROLE } from '@/shared/lib/focus-map-canvas';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Chip, RowButton } from '@/shared/ui/controls';
import { OntologyMapKindGlyph } from '@/shared/ui/map-kind-glyph';
import { STAGGER } from '@/shared/motion/tokens';
import type { OntologyMapEdge, OntologyMapNode } from '../ui/OntologyMap';
import { readStructure, structurePath, trimStructurePath, type StructureNode } from './structure-index';
import { useStructureFrame } from './use-structure-frame';

const PAGE_SIZE = 40;
const KINDS = ['project', 'domain', 'capability', 'element'] as const;

export function DomainStructureMap({ nodes, edges, selectedId, missingIds, onRead, onDrawnCountChange, onReady, reducedMotion, indexExpanded, inspectorOpen, loading = false }: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  missingIds?: ReadonlySet<string>;
  onRead: (id: string) => void;
  onDrawnCountChange?: (count: number) => void;
  onReady?: () => void;
  reducedMotion: boolean;
  indexExpanded: boolean;
  inspectorOpen: boolean;
  loading?: boolean;
}) {
  const t = useTranslations('mapStructure');
  const kindName = useTranslations('kinds');
  const index = useMemo(() => readStructure(nodes, edges), [nodes, edges]);
  const [outside, setOutside] = useState(false);
  const [pages, setPages] = useState<Partial<Record<StructureNode['kind'], number>>>({});
  const [readingHere, setReadingHere] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>(() => selectedId ? structurePath(index, selectedId) : index.roots.length === 1 && index.nodes.get(index.roots[0]!)?.kind === 'project' ? [...index.roots] : []);
  const [seenSelection, setSeenSelection] = useState(selectedId);
  let valid = trimStructurePath(index, path);
  if (valid.length !== path.length) setPath(valid);
  if (selectedId !== seenSelection) {
    setSeenSelection(selectedId);
    if (selectedId && readingHere !== selectedId) {
      valid = structurePath(index, selectedId);
      setPath(valid);
      setOutside(false);
      setPages({});
    }
    setReadingHere(null);
  }
  const currentPath = valid;
  const current = index.nodes.get(currentPath.at(-1) ?? '');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestedFocus = useRef(false);
  const ids = useMemo(() => outside ? index.outside : current ? index.children.get(current.id) ?? [] : index.roots, [outside, index, current]);
  const grouped = useMemo(() => {
    const groups = new Map(KINDS.map(kind => [kind, [] as StructureNode[]]));
    for (const id of ids) {
      const node = index.nodes.get(id);
      if (node) groups.get(node.kind)!.push(node);
    }
    for (const rows of groups.values()) rows.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    return groups;
  }, [ids, index]);
  const shown = KINDS.flatMap(kind => {
    const rows = grouped.get(kind)!;
    const page = Math.min(pages[kind] ?? 0, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
    return rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  });
  const scopePath = currentPath.join('/');
  useLayoutEffect(() => {
    onReady?.();
    onDrawnCountChange?.(shown.length + (current ? 1 : 0));
    if (requestedFocus.current) {
      headingRef.current?.focus({ preventScroll: true });
      requestedFocus.current = false;
    }
  }, [onDrawnCountChange, onReady, current, shown.length, scopePath, outside]);

  const navigate = (next: string[], nextOutside = false) => {
    setPath(next);
    setOutside(nextOutside);
    setPages({});
    sectionRef.current?.scrollTo({ top: 0 });
    requestedFocus.current = true;
  };
  const scope = outside ? 'outside' : current?.id ?? 'root';
  const read = (id: string) => {
    setReadingHere(id);
    onRead(id);
  };
  const sectionRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { frame, links } = useStructureFrame(sectionRef, contentRef, scope, inspectorOpen, indexExpanded);
  const name = outside ? t('unassigned') : current?.label ?? t('overview');
  const header = (node: StructureNode) => (
    <span className="flex min-w-0 items-center gap-3">
      <OntologyMapKindGlyph kind={node.kind} className="shrink-0" />
      <span className="min-w-0 break-words text-body">{node.label}</span>
    </span>
  );

  return (
    <section
      ref={sectionRef}
      data-testid="domain-structure-map"
      data-reduced-motion={reducedMotion || undefined}
      data-surface-role={MAP_CANVAS_SURFACE_ROLE}
      tabIndex={-1}
      aria-label={t('title')}
      style={frame ?? undefined}
      className={cn('absolute inset-x-4 bottom-24 top-20 min-h-0 overflow-auto lg:bottom-[calc(var(--map-safe-inset-bottom)*1px)]',
        indexExpanded ? 'lg:left-[calc(var(--map-safe-inset-left)*1px)]' : 'lg:left-10',
        inspectorOpen ? 'lg:right-[calc(var(--map-panel-width)+1.5rem)]' : 'lg:right-20')}
      onKeyDown={event => {
        if (event.key === 'Escape' && currentPath.length > 1) {
          event.stopPropagation();
          navigate(currentPath.slice(0, -1));
        }
      }}
    >
      <div ref={contentRef} className="relative flex min-h-full flex-col gap-6 px-[var(--topology-index-tab-width)]">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" data-testid="structure-membership-links">
        {links.map(link => <path key={`${scope}:${link.kind}`} d={link.d} fill="none" stroke="var(--color-indigo-accent)" strokeWidth="1" strokeLinecap="round" pathLength="1" className="structure-link-in" />)}
      </svg>
      <header className="flex shrink-0 flex-col gap-3">
        <nav aria-label={t('breadcrumb')} className="flex flex-wrap items-center gap-1">
          <Chip onClick={() => navigate([], false)}>{t('overview')}</Chip>
          {currentPath.map((id, i) => {
            const node = index.nodes.get(id)!;
            return <span key={id} className="flex min-w-0 items-center gap-1">
              <ChevronRight aria-hidden className="size-3 shrink-0 text-[color:var(--color-text-secondary)]" />
              <Chip active={i === currentPath.length - 1 && !outside} aria-current={i === currentPath.length - 1 && !outside ? 'location' : undefined} onClick={() => navigate(currentPath.slice(0, i + 1))}>{node.label}</Chip>
            </span>;
          })}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h2 ref={headingRef} tabIndex={-1} data-testid="structure-scope-title" className="flex items-center gap-3 break-words text-hero font-[var(--font-weight-strong)] focus:outline-none">
              {current && !outside && <span data-structure-parent-anchor className="inline-flex shrink-0"><OntologyMapKindGlyph kind={current.kind} size={24} /></span>}
              <span className="min-w-0">{name}</span>
            </h2>
            <p className="text-label text-[color:var(--color-text-secondary)]">{outside ? t('unassignedDescription') : current ? t('childCount', { count: ids.length }) : t('description')}</p>
            {current && (index.parents.get(current.id)?.length ?? 0) > 1 && <p className="text-label text-[color:var(--color-text-secondary)]">{t('shared', { count: index.parents.get(current.id)!.length - 1 })}</p>}
            {current && missingIds?.has(current.id) && <p className="text-label text-[color:var(--color-status-warning)]">{t('missingDocument')}</p>}
          </div>
          {current && !outside && <Button variant="outline" onClick={() => read(current.id)}>{t('inspect', { name: current.label })}</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentPath.length > 1 && <Chip onClick={() => navigate(currentPath.slice(0, -1))}><ChevronLeft aria-hidden className="size-3" />{t('back', { name: index.nodes.get(currentPath.at(-2)!)!.label })}</Chip>}
          {index.outside.length > 0 && <Chip active={outside} onClick={() => navigate([], !outside)}>{t('unassigned')} · {index.outside.length}</Chip>}
          <span className="text-label text-[color:var(--color-text-secondary)]">{t('conceptCount', { count: index.nodes.size })}</span>
        </div>
      </header>
      <div key={scope} data-testid="structure-children" className="grid min-h-0 gap-6">
        {KINDS.map(kind => {
          const rows = grouped.get(kind)!;
          if (!rows.length) return null;
          const pageCount = Math.ceil(rows.length / PAGE_SIZE);
          const page = Math.min(pages[kind] ?? 0, pageCount - 1);
          return <section key={kind} aria-label={kindName(kind)} className="min-w-0 space-y-3">
            <h3 className="flex items-center gap-2 text-label font-[var(--font-weight-strong)]"><span data-structure-kind-anchor={kind} className="inline-flex"><OntologyMapKindGlyph kind={kind} /></span>{kindName(kind)} · {rows.length}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((node, order) => {
                const childCount = index.children.get(node.id)?.length ?? 0;
                const cyclic = currentPath.includes(node.id);
                const browse = childCount > 0 && !cyclic;
                const parents = index.parents.get(node.id)?.length ?? 0;
                return <div key={node.id} style={{ '--structure-item-delay': `${Math.min(order, 3) * STAGGER}s` } as CSSProperties} className={cn('min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]', 'structure-item-in')}><RowButton tone="secondary" data-structure-id={node.id} active={selectedId === node.id} aria-label={browse ? t('browse', { name: node.label }) : t('inspect', { name: node.label })} className="h-full w-full" onClick={() => browse ? navigate([...currentPath, node.id]) : read(node.id)}>
                  <span className="flex w-full min-w-0 flex-col gap-2 py-2 text-left">
                    <span className="flex min-w-0 items-center justify-between gap-3">{header(node)}{browse && <ChevronRight aria-hidden className="size-4 shrink-0" />}</span>
                    {(parents > 1 || childCount > 0 || cyclic) && <span className="flex flex-wrap gap-x-3 text-label text-[color:var(--color-text-secondary)]">
                      {childCount > 0 && <span>{t('childCount', { count: childCount })}</span>}
                      {parents > 1 && <span>{t('shared', { count: parents - 1 })}</span>}
                      {cyclic && <span>{t('cycle')}</span>}
                    </span>}
                    {missingIds?.has(node.id) && <span className="text-label text-[color:var(--color-status-warning)]">{t('missingDocument')}</span>}
                  </span>
                </RowButton></div>;
              })}
            </div>
            {pageCount > 1 && <div className="flex items-center justify-between gap-3 text-label">
              <Chip aria-label={t('previousPage')} disabled={page === 0} onClick={() => setPages(prev => ({ ...prev, [kind]: page - 1 }))}><ChevronLeft aria-hidden className="size-3" />{t('previousPage')}</Chip>
              <span>{t('page', { current: page + 1, total: pageCount })}</span>
              <Chip aria-label={t('nextPage')} disabled={page + 1 >= pageCount} onClick={() => setPages(prev => ({ ...prev, [kind]: page + 1 }))}>{t('nextPage')}<ChevronRight aria-hidden className="size-3" /></Chip>
            </div>}
          </section>;
        })}
      </div>
      {ids.length === 0 && <p role="status" className="text-body text-[color:var(--color-text-secondary)]">{loading ? t('loading') : nodes.length === 0 ? t('empty') : current ? t('emptyChildren', { name: current.label }) : t('empty')}</p>}
      </div>
    </section>
  );
}

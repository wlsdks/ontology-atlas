'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { Button, Chip, OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { EXIT_WINDOW_MS } from '@/shared/lib/render-timing/use-presence';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { AnalysisPair } from '../../lib/analysis-model';
import { DECLARATIONS_PER_PAGE as PAGE, arrowPoints, curvePath, declarationLines, declarationPages, labelPoints, type CardBox, type DeclarationLine, type DeclarationPage } from './declaration-layout';
import styles from './analysis.module.css';

type Hover = { side: 'from' | 'to' | 'edge'; id: string } | null;
interface Drawing { key: string; pairId: string; page: DeclarationPage; start: number; selectedId: string; lines: DeclarationLine[] }
const name = (node: KnowledgeGraphNode) => node.display ?? node.title;
const EMPTY_PAGE: DeclarationPage = { sources: [], targets: [], edges: [] };
const NO_LINES: DeclarationLine[] = [];
export const declarationNumeral = (index: number) => String(index + 1).padStart(2, '0');
/** Each line is one exact declaration. Ports follow measured DOM nodes, including wrapped labels. */
export function DependencyDiagram({ pair, selected, byId, onSelect }: {
  pair: AnalysisPair; selected: KnowledgeGraphEdge; byId: ReadonlyMap<string, KnowledgeGraphNode>; onSelect: (edge: KnowledgeGraphEdge) => void;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const kindLabel = useOntologyKindLabel();
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const focusPage = useRef(false);
  const pages = useMemo(() => declarationPages(pair.edges), [pair.edges]);
  const pageIndex = Math.max(0, pages.findIndex(page => page.edges.some(edge => edge.id === selected.id)));
  const pageStart = pageIndex * PAGE;
  const page = pages[pageIndex] ?? EMPTY_PAGE;
  const pageKey = `${pair.id}\0${pageIndex}`;
  const paged = pair.edges.length > PAGE;
  const [hover, setHover] = useState<Hover>(null);
  const [measured, setMeasured] = useState<{ key: string; lines: DeclarationLine[] }>({ key: pageKey, lines: NO_LINES });
  const lines = measured.key === pageKey ? measured.lines : NO_LINES;
  const drawing: Drawing = { key: pageKey, pairId: pair.id, page, start: pageStart, selectedId: selected.id, lines };
  const [shown, setShown] = useState<{ drawing: Drawing; leavingPage: Drawing | null; leavingLine: DeclarationLine | null }>({ drawing, leavingPage: null, leavingLine: null });
  if (shown.drawing.key !== pageKey) {
    setHover(null);
    setShown({ drawing, leavingPage: shown.drawing.pairId === pair.id ? { ...shown.drawing, lines: measured.key === shown.drawing.key ? measured.lines : NO_LINES } : null, leavingLine: null });
  } else if (shown.drawing.selectedId !== selected.id) setShown({ drawing: { ...shown.drawing, selectedId: selected.id }, leavingPage: shown.leavingPage, leavingLine: lines.find(line => line.id === shown.drawing.selectedId) ?? null });
  useEffect(() => {
    if (!shown.leavingPage && !shown.leavingLine) return;
    const id = setTimeout(() => setShown(value => ({ ...value, leavingPage: null, leavingLine: null })), EXIT_WINDOW_MS);
    return () => clearTimeout(id);
  }, [shown.leavingPage, shown.leavingLine]);
  useLayoutEffect(() => {
    if (focusPage.current) { controls.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }); focusPage.current = false; }
  }, [pageStart]);
  function pageTo(index: number) { focusPage.current = true; onSelect(pages[index]!.edges[0]!); }
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const boxes = new Map<string, CardBox>([...element.querySelectorAll<HTMLElement>('[data-dependency-node]')].map(node => { const box = node.getBoundingClientRect(); return [node.dataset.dependencyNode!, { top: box.top - origin.top, bottom: box.bottom - origin.top, left: box.left - origin.left, right: box.right - origin.left }]; }));
      const next = declarationLines(page.edges, boxes);
      setMeasured(previous => previous.key === pageKey && JSON.stringify(previous.lines) === JSON.stringify(next) ? previous : { key: pageKey, lines: next });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('[data-dependency-node]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [page, pageKey]);
  const labels = useMemo(() => labelPoints(lines), [lines]);
  const hot = (id: string) => {
    const edge = page.edges.find(candidate => candidate.id === id);
    return Boolean(edge && hover && id !== selected.id && (hover.side === 'edge' ? hover.id === id : edge[hover.side] === hover.id));
  };
  const active = lines.find(line => line.id === selected.id);
  const rows = Math.max(1, ...pages.map(entry => Math.max(entry.sources.length, entry.targets.length)));
  const hoverProps = (next: Hover) => ({ onPointerEnter: () => setHover(next), onPointerLeave: () => setHover(null), onFocus: () => setHover(next), onBlur: () => setHover(null) });
  function cards(drawing: Pick<Drawing, 'page' | 'selectedId'>, side: 'from' | 'to', live: boolean) {
    const chosen = drawing.page.edges.find(edge => edge.id === drawing.selectedId);
    return (side === 'from' ? drawing.page.sources : drawing.page.targets).map(id => {
      const node = byId.get(id)!;
      const pressed = chosen?.[side] === id;
      const declarations = drawing.page.edges.filter(edge => edge[side] === id);
      const tags = live ? { 'data-dependency-node': `${side}:${id}`, 'aria-pressed': pressed, 'aria-label': `${t('selectNodeDeclaration', { name: name(node) })} · ${t('nodeDeclarations', { count: declarations.length })}`, title: t('selectNodeDeclaration', { name: name(node) }), onClick: () => onSelect(declarations[0]!), ...hoverProps({ side, id }) } : { tabIndex: -1, 'data-pressed': pressed };
      return <button type="button" key={id} {...tags}
        className={controlClass({ hoverBorder: 'strong', shape: 'card', size: 'lg', tone: pressed ? 'accentOnTint' : 'default', active: pressed, className: `atlas-touch-floor w-full text-left${pressed && side === 'to' ? ' structure-link-arrival' : ''}` })}>
        <span className={styles.nodeContent}>
          <span className={styles.nodeKind}><span className="inline-flex items-center gap-1.5"><OntologyMapKindGlyph kind={node.kind} size={14} />{kindLabel(node.kind)}</span><span className="tabular-nums">{pressed ? `${t('selected')} · ` : null}{t('declarationsInView', { count: declarations.length })}</span></span>
          <span className="text-title font-[var(--font-weight-strong)]">{name(node)}</span>
        </span>
      </button>;
    });
  }
  function steps(source: Drawing, live: boolean) {
    return source.page.edges.map((edge, index) => {
      const on = edge.id === source.selectedId;
      const tags = live ? { 'data-testid': 'analysis-witness', 'data-edge': edge.id, 'aria-pressed': on, onClick: () => onSelect(edge), ...hoverProps({ side: 'edge', id: edge.id }) } : { tabIndex: -1 };
      return <Chip key={edge.id} {...tags} size="lg" tone={on ? 'accentOnTint' : 'default'} active={on} hoverSurface="lift" hoverInk="strong" className="atlas-touch-floor w-full justify-start gap-2 text-left">
        <span className={on ? styles.stepNumeralOn : styles.stepNumeral}>{declarationNumeral(source.start + index)}</span>
        <span className="min-w-0 font-[var(--font-weight-signature)]">{name(byId.get(edge.from)!)} → {name(byId.get(edge.to)!)}</span>
      </Chip>;
    });
  }
  const connection = (line: DeclarationLine, className: string, animate: boolean) => <g key={line.id} data-edge={line.id} className={className}>
    <path pathLength={1} className={animate ? 'structure-link-in' : undefined} d={curvePath(line)} />
    <polygon className={animate ? 'structure-link-land' : undefined} points={arrowPoints(line)} />
    <circle className={animate ? 'motion-swap-in' : undefined} cx={line.x1} cy={line.y1} r="2.5" />
  </g>;
  const leaving = shown.leavingPage;
  const stepRows = Math.ceil(pages[0]!.edges.length / 2);
  return <div className={styles.dependencyObject} data-testid="analysis-dependency-diagram">
    <div className={styles.objectHeading}><span>{name(pair.from)}</span><span>{t('dependencyDirection')}</span><span>{name(pair.to)}</span></div>
    <div className={styles.witnessBar}>
      <div className={`${styles.swapSlot} ${styles.stepsSlot}`}>
        {leaving ? <div key={`out:${leaving.key}`} inert aria-hidden="true" className={`motion-swap-out ${styles.witnessControls}`} data-rows={stepRows}>{steps(leaving, false)}</div> : null}
        <div key={pageKey} ref={controls} role="group" className={`motion-swap-in ${styles.witnessControls}`} data-rows={stepRows} aria-label={t('chooseDeclaration')}>{steps(drawing, true)}</div>
      </div>
      <div className={styles.pager}>
        {paged ? <div className={styles.pagerControls}>
          <span className="font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">{t('declarationPage', { from: pageStart + 1, to: pageStart + page.edges.length, total: pair.edges.length })}</span>
          <Button variant="ghost" size="sm" className="atlas-touch-floor" disabled={pageIndex === 0} onClick={() => pageTo(pageIndex - 1)}>{t('previousDeclarations')}</Button>
          <Button variant="ghost" size="sm" className="atlas-touch-floor" disabled={pageIndex + 1 >= pages.length} onClick={() => pageTo(pageIndex + 1)}>{t('nextDeclarations')}</Button>
        </div> : null}
        <p className="text-label text-[color:var(--color-text-tertiary)]">{t('lineLegend')}</p>
      </div>
    </div>
    <div ref={host} className={styles.nodeDiagram} style={{ '--declaration-rows': rows } as CSSProperties}>
      <svg className={styles.connections} aria-hidden="true">
        {leaving ? <g className="motion-swap-out">{leaving.lines.map(line => connection(line, line.id === leaving.selectedId ? styles.selectedConnection : styles.connection, false))}</g> : null}
        {lines.map(line => connection(line, hot(line.id) ? styles.hotConnection : styles.connection, true))}
        {shown.leavingLine ? <g key={`out:${shown.leavingLine.id}`} className={`structure-link-out ${styles.selectedConnection}`}>{connection(shown.leavingLine, '', false)}</g> : null}
        {active ? <g key={`on:${active.id}`} data-connection="selected" className={styles.selectedConnection}>{connection(active, '', true)}</g> : null}
      </svg>
      {leaving ? <>
        <div key={`out-from:${leaving.key}`} inert aria-hidden="true" className={`motion-swap-out ${styles.objectColumn} ${styles.sourceColumn}`}>{cards(leaving, 'from', false)}</div>
        <div key={`out-to:${leaving.key}`} inert aria-hidden="true" className={`motion-swap-out ${styles.objectColumn} ${styles.targetColumn}`}>{cards(leaving, 'to', false)}</div>
        {labelPoints(leaving.lines).map(label => <span key={`out:${label.id}`} aria-hidden="true" className={`motion-swap-out ${styles.curveLabel}`} data-state={label.id === leaving.selectedId ? 'selected' : 'rest'} style={{ left: label.x, top: label.y }}>{declarationNumeral(leaving.start + leaving.page.edges.findIndex(edge => edge.id === label.id))}</span>)}
      </> : null}
      <div key={`from:${pageKey}`} className={`motion-swap-in ${styles.objectColumn} ${styles.sourceColumn}`}>{cards({ page, selectedId: selected.id }, 'from', true)}</div>
      <div key={`to:${pageKey}`} className={`motion-swap-in ${styles.objectColumn} ${styles.targetColumn}`}>{cards({ page, selectedId: selected.id }, 'to', true)}</div>
      {labels.map(label => <span key={label.id} aria-hidden="true" data-testid="analysis-curve-label" data-edge={label.id} data-state={label.id === selected.id ? 'selected' : hot(label.id) ? 'hot' : 'rest'} className={`motion-swap-in ${styles.curveLabel}`} style={{ left: label.x, top: label.y }}>{declarationNumeral(pageStart + page.edges.findIndex(edge => edge.id === label.id))}</span>)}
    </div>
  </div>;
}

'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { Button, OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { AnalysisPair } from '../../lib/analysis-model';
import styles from './analysis.module.css';

interface Connection { id: string; x1: number; y1: number; x2: number; y2: number }
const name = (node: KnowledgeGraphNode) => node.display ?? node.title;
/** Each line is one exact declaration. Ports follow measured DOM nodes, including wrapped labels. */
export function DependencyDiagram({ pair, selected, byId, onSelect }: {
  pair: AnalysisPair; selected: KnowledgeGraphEdge; byId: ReadonlyMap<string, KnowledgeGraphNode>; onSelect: (edge: KnowledgeGraphEdge) => void;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const kindLabel = useOntologyKindLabel();
  const marker = useId().replaceAll(':', '');
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const focusPage = useRef(false);
  const selectedIndex = Math.max(0, pair.edges.findIndex(edge => edge.id === selected.id));
  const pageStart = Math.floor(selectedIndex / 4) * 4;
  const edges = useMemo(() => pair.edges.slice(pageStart, pageStart + 4), [pair.edges, pageStart]);
  useLayoutEffect(() => {
    if (focusPage.current) { controls.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true }); focusPage.current = false; }
  }, [pageStart]);
  function pageTo(index: number) { focusPage.current = true; onSelect(pair.edges[index]); }
  const sources = [...new Set(edges.map(edge => edge.from))];
  const targets = [...new Set(edges.map(edge => edge.to))];
  const [connections, setConnections] = useState<Connection[]>([]);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const boxes = new Map([...element.querySelectorAll<HTMLElement>('[data-dependency-node]')].map(node => [node.dataset.dependencyNode!, node.getBoundingClientRect()]));
      const next = edges.flatMap(edge => {
        const from = boxes.get(`from:${edge.from}`), to = boxes.get(`to:${edge.to}`);
        return from && to ? [{ id: edge.id, x1: from.right - origin.left, y1: from.top + from.height / 2 - origin.top, x2: to.left - origin.left, y2: to.top + to.height / 2 - origin.top }] : [];
      });
      setConnections(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('[data-dependency-node]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [edges]);
  function nodes(ids: string[], side: 'from' | 'to') {
    return ids.map(id => {
      const node = byId.get(id)!;
      const active = selected[side] === id;
      const declarations = edges.filter(edge => edge[side] === id);
      return <button type="button" key={id} data-dependency-node={`${side}:${id}`} aria-pressed={active}
        aria-label={`${t('selectNodeDeclaration', { name: name(node) })} · ${t('nodeDeclarations', { count: declarations.length })}`} title={t('selectNodeDeclaration', { name: name(node) })} onClick={() => onSelect(declarations[0])}
        className={controlClass({ hoverSurface: 'lift', shape: 'card', size: 'lg', tone: active ? 'accentOnTint' : 'default', active, className: 'atlas-touch-floor w-full text-left' })}>
        <span className={styles.nodeContent}>
          <span className={styles.nodeKind}><span className="inline-flex items-center gap-1.5"><OntologyMapKindGlyph kind={node.kind} size={14} />{kindLabel(node.kind)}</span><span className="font-mono" aria-label={t('nodeDeclarations', { count: declarations.length })}>{active ? <span className="font-sans">{t('selected')} · </span> : null}{t('declarationCompact', { count: declarations.length })}</span></span>
          <span className="text-title font-[var(--font-weight-strong)]">{name(node)}</span>
        </span>
      </button>;
    });
  }
  return <div className={styles.dependencyObject} data-testid="analysis-dependency-diagram">
    <div className={styles.objectHeading}><span>{name(pair.from)}</span><span>{t('dependencyDirection')}</span><span>{name(pair.to)}</span></div>
    <div ref={controls} className={styles.witnessControls} aria-label={t('chooseDeclaration')}>
      {edges.map((edge, index) => <Button key={edge.id} data-testid="analysis-witness" variant={edge.id === selected.id ? 'outline' : 'ghost'} size="sm" className="atlas-touch-floor" aria-pressed={edge.id === selected.id} aria-label={`${name(byId.get(edge.from)!)} → ${name(byId.get(edge.to)!)}`} onClick={() => onSelect(edge)}><span className="font-mono text-label">{String(pageStart + index + 1).padStart(2, '0')}</span>{name(byId.get(edge.from)!)}</Button>)}
    </div>
    <div ref={host} className={styles.nodeDiagram}>
      <svg className={styles.connections} aria-hidden="true">
        <defs><marker id={`${marker}-arrow`} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 8 4 L 0 8" fill="var(--color-text-tertiary)" /></marker><marker id={`${marker}-active`} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 8 4 L 0 8" fill="var(--color-indigo-brand)" /></marker></defs>
        {connections.map(line => {
          const active = line.id === selected.id, bend = (line.x2 - line.x1) * 0.5;
          return <g key={line.id}><path d={`M ${line.x1} ${line.y1} C ${line.x1 + bend} ${line.y1}, ${line.x2 - bend} ${line.y2}, ${line.x2 - 7} ${line.y2}`} className={active ? styles.selectedConnection : styles.connection} markerEnd={`url(#${marker}-${active ? 'active' : 'arrow'})`} /><circle cx={line.x1} cy={line.y1} r="3" className={active ? styles.activePort : styles.port} /><circle cx={line.x2} cy={line.y2} r="3" className={active ? styles.activePort : styles.port} /></g>;
        })}
      </svg>
      <div className={styles.objectColumn}>{nodes(sources, 'from')}</div><div /><div className={styles.objectColumn}>{nodes(targets, 'to')}</div>
    </div>
    <div className={styles.objectFoot}><span>{t('declarationRange', { from: pageStart + 1, to: pageStart + edges.length, total: pair.edges.length })}</span>{pair.edges.length > 4 ? <div className="flex gap-1"><Button variant="ghost" size="sm" className="atlas-touch-floor" disabled={pageStart === 0} onClick={() => pageTo(Math.max(0, pageStart - 4))}>{t('previousDeclarations')}</Button><Button variant="ghost" size="sm" className="atlas-touch-floor" disabled={pageStart + 4 >= pair.edges.length} onClick={() => pageTo(pageStart + 4)}>{t('nextDeclarations')}</Button></div> : null}</div>
  </div>;
}

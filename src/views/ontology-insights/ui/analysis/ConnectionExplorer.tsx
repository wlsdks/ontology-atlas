'use client';

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { useStaggerOnce } from '@/shared/motion/stagger';
import { declarationsThatFit, laneAnchor, type AnalysisBoard, type BoardLink, type PairGrouping } from '../../lib/analysis-board';
import { pairArrow, pairCurve, pairLines, type CardBox, type PairLine } from './pair-lines';
import { useSelectionRoving } from './selection-roving';
import styles from './analysis.module.css';

const name = (node: KnowledgeGraphNode) => node.display ?? node.title;
const firstSeen = (ids: readonly string[]) => [...new Set(ids)];
const CARDS_PER_SIDE = { roomy: 8, short: 5 };
const roomyViewport = () => typeof window.matchMedia === 'function' ? window.matchMedia('(min-height: 840px)') : null;
const watchRoomyViewport = (onChange: () => void) => { const query = roomyViewport(); query?.addEventListener('change', onChange); return () => query?.removeEventListener('change', onChange); };
const isRoomyViewport = () => roomyViewport()?.matches ?? false;
const assumeShortViewport = () => false;

const sameLines = (a: readonly PairLine[], b: readonly PairLine[]) => a.length === b.length && a.every((line, index) => {
  const other = b[index]!;
  return line.id === other.id && line.x1 === other.x1 && line.y1 === other.y1 && line.x2 === other.x2 && line.y2 === other.y2;
});

export function ConnectionExplorer({ board, selectedEdge, matches, vaultKey, onSelectEdge, search, detail, footer }: {
  board: AnalysisBoard; selectedEdge: string | null; matches: ReadonlySet<string> | null; vaultKey: string; onSelectEdge: (edgeId: string) => void;
  search: ReactNode; detail: ReactNode; footer: ReactNode;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const diagram = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [grouping, setGrouping] = useState<PairGrouping>('needs');
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [lines, setLines] = useState<PairLine[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [shown, setShown] = useState<{ pairId: string | null; edgeId: string | null; arriving: boolean }>({ pairId: null, edgeId: null, arriving: true });
  const cardsPerSide = useSyncExternalStore(watchRoomyViewport, isRoomyViewport, assumeShortViewport) ? CARDS_PER_SIDE.roomy : CARDS_PER_SIDE.short;
  const searched = (link: BoardLink) => Boolean(matches) && (matches!.has(link.from) || matches!.has(link.to));
  const groups = board.groups[grouping].flatMap(group => {
    const listed = matches ? group.pairs.filter(pair => pair.links.some(searched)) : group.pairs;
    return listed.length ? [{ anchor: group.anchor, pairs: listed, declarations: listed.reduce((sum, pair) => sum + pair.links.length, 0) }] : [];
  });
  const pairs = useMemo(() => board.groups.needs.flatMap(group => group.pairs), [board.groups]);
  const busiest = Math.max(1, ...pairs.map(pair => pair.links.length));
  const selected = board.links.find(link => link.edge.id === selectedEdge) ?? board.links[0]!;
  const current = pairs.find(pair => pair.pair.id === selected.pairId)!;
  if (shown.edgeId !== selected.edge.id) setShown({ pairId: current.pair.id, edgeId: selected.edge.id, arriving: shown.pairId !== current.pair.id });
  const { moveFocus, setRoving, stopOf } = useSelectionRoving('nav', '[data-testid="analysis-pair"]');
  const rowStop = stopOf(new Set(groups.flatMap(group => group.pairs.map(pair => pair.pair.id))), current.pair.id);
  const cards = useSelectionRoving('[data-pair-diagram]', '[data-pair-card]');
  const stagger = useStaggerOnce({ vaultKey, listKey: `analysis-pairs:${grouping}`, ids: groups.map(group => group.anchor.id) });
  const expanded = expandedPair === current.pair.id;
  const fitting = declarationsThatFit(current.links, cardsPerSide, selected.edge.id, searched);
  const drawn = expanded ? current.links : fitting;
  const hiddenDeclarations = current.links.length - fitting.length;
  const sources = firstSeen(drawn.map(link => link.from)), targets = firstSeen(drawn.map(link => link.to));
  const cardStop = cards.stopOf(new Set([...sources, ...targets]), selected.from);
  const linksOf = (id: string) => drawn.filter(link => link.from === id || link.to === id);
  const endsKey = drawn.map(link => `${link.edge.id}\0${link.from}\0${link.to}`).join('|');

  useLayoutEffect(() => {
    const host = diagram.current;
    if (!host) return;
    const ends = endsKey.split('|').filter(Boolean).map(row => { const [id, from, to] = row.split('\0'); return { id: id!, from: from!, to: to! }; });
    const measure = () => {
      const boxes = new Map([...host.querySelectorAll<HTMLElement>('[data-pair-card]')].map(card => {
        const box: CardBox = { top: card.offsetTop, bottom: card.offsetTop + card.offsetHeight, left: card.offsetLeft, right: card.offsetLeft + card.offsetWidth };
        return [card.dataset.pairCard!, box];
      }));
      const next = pairLines(ends, boxes);
      setLines(previous => sameLines(previous, next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [endsKey]);

  const hot = (link: BoardLink) => hover === link.edge.id || hover === link.from || hover === link.to;
  const hoverProps = (id: string) => ({ onPointerEnter: () => setHover(id), onPointerLeave: () => setHover(null), onFocus: () => setHover(id), onBlur: () => setHover(null) });
  const lineOf = new Map(lines.map(line => [line.id, line]));
  const active = lineOf.get(selected.edge.id);

  function selectPair(links: readonly BoardLink[]) {
    onSelectEdge((links.find(searched) ?? links[0]!).edge.id);
    const panel = stage.current;
    if (!panel?.scrollIntoView || !nav.current) return;
    const stacked = panel.offsetTop > nav.current.offsetTop;
    const underHeader = panel.getBoundingClientRect().top < parseFloat(getComputedStyle(panel).scrollMarginTop);
    if (stacked || underHeader) panel.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function selectFromCard(id: string) {
    const links = linksOf(id), at = links.findIndex(link => link.edge.id === selected.edge.id);
    onSelectEdge(links[(at + 1) % links.length]!.edge.id);
  }

  function card(id: string, domain: KnowledgeGraphNode, side: 'from' | 'to', index: number) {
    const concept = board.endpoints.get(id), whole = id === laneAnchor(domain.id), label = name(concept ?? domain);
    const pressed = selected[side] === id;
    const dimmed = Boolean(matches) && !linksOf(id).some(searched) && !pressed;
    return <li key={id} data-dimmed={dimmed || undefined} data-related={!pressed && hover !== null && linksOf(id).some(hot) || undefined}>
      <button type="button" data-pair-card={id} data-testid="analysis-claim" data-analysis-claim-id={id} data-endpoint={pressed ? side : undefined} aria-pressed={pressed}
        aria-label={`${label} · ${t('nodeDeclarations', { count: linksOf(id).length })}`} title={label} onClick={() => selectFromCard(id)} {...hoverProps(id)}
        tabIndex={id === cardStop ? 0 : -1} onFocus={() => { cards.setRoving(id); setHover(id); }} onKeyDown={cards.moveFocus}
        style={{ '--structure-item-delay': `calc(var(--motion-stagger) * ${Math.min(index, 6)})` } as CSSProperties}
        className={controlClass({ shape: 'card', size: 'md', tone: pressed ? 'accent' : 'secondary', active: pressed, hoverSurface: 'lift', hoverBorder: 'strong', className: `${styles.pairCard} structure-item-in` })}>
        {concept && concept.kind === 'capability' ? null : <OntologyMapKindGlyph kind={concept?.kind ?? 'domain'} size={14} />}
        <span className="min-w-0 truncate">{label}</span>
        {whole ? <span className={styles.pairCardNote}>{t('pairWholeDomain')}</span> : null}
      </button>
    </li>;
  }

  return <div className={styles.explorer} data-testid="analysis-board" data-mode="relationships">
    <div ref={nav} className={styles.pairNav}>
      {search}
      <SegmentedControl ariaLabel={t('pairGrouping')} fill value={grouping} onChange={value => setGrouping(value as PairGrouping)} options={[{ value: 'needs', label: t('pairGroupingNeeds') }, { value: 'provides', label: t('pairGroupingProvides') }]} />
      <nav key={grouping} className={styles.pairList} aria-label={t('pairList')} data-grouping={grouping}>
        {groups.map((group, groupIndex) => {
          const motion = stagger(group.anchor.id, groupIndex);
          return <section key={group.anchor.id} className={`${styles.pairGroup} ${motion.className ?? ''}`} style={motion.style}>
            <p className={styles.pairGroupTitle}><OntologyMapKindGlyph kind="domain" size={14} /><span className="min-w-0 flex-1 truncate">{name(group.anchor)}</span><span className={styles.pairRowCount}>{group.declarations}</span></p>
            <ul>
              {group.pairs.map(({ pair, links }) => {
                const pressed = pair.id === current.pair.id;
                return <li key={pair.id}>
                  <button type="button" data-testid="analysis-pair" data-pair={pair.id} data-declarations={links.length} aria-pressed={pressed} aria-label={t('pairLabel', { from: name(pair.from), to: name(pair.to), count: links.length })}
                    tabIndex={pair.id === rowStop ? 0 : -1} onFocus={() => setRoving(pair.id)} onKeyDown={moveFocus} onClick={() => selectPair(links)}
                    className={controlClass({ shape: 'row', size: 'md', tone: pressed ? 'strong' : 'secondary', active: pressed, hoverSurface: 'lift', hoverInk: 'strong', className: styles.pairRow })}>
                    <span className={styles.pairRowArrow} aria-hidden="true">{grouping === 'needs' ? '→' : '←'}</span>
                    <span className="min-w-0 flex-1 truncate">{name(grouping === 'needs' ? pair.to : pair.from)}</span>
                    <span className={styles.pairRowBar} aria-hidden="true"><span style={{ '--pair-share': links.length / busiest } as CSSProperties} /></span>
                    <span className={styles.pairRowCount}>{links.length}</span>
                  </button>
                </li>;
              })}
            </ul>
          </section>;
        })}
        {matches && matches.size > 0 && !groups.length ? <p className={styles.pairListEmpty}>{t('pairNoMatch')}</p> : null}
      </nav>
    </div>
    <div className={styles.pairMain}>
    <div ref={stage} className={styles.pairStage}>
    <section key={current.pair.id} aria-label={t('pairLabel', { from: name(current.pair.from), to: name(current.pair.to), count: current.links.length })}>
      <div ref={diagram} className={styles.pairDiagram} data-pair-diagram>
        <p className={styles.pairColumnTitle}><span className={styles.pairColumnRole}>{t('pairSource')}</span><span className={styles.pairTitleRow}><OntologyMapKindGlyph kind="domain" size={16} /><span className="min-w-0 truncate">{name(current.pair.from)}</span></span></p>
        <p className={`${styles.pairColumnTitle} ${styles.pairTargetTitle}`}><span className={styles.pairColumnRole}>{t('pairTarget')}</span><span className={styles.pairTitleRow}><OntologyMapKindGlyph kind="domain" size={16} /><span className="min-w-0 truncate">{name(current.pair.to)}</span>
          <span className={styles.pairCount} data-testid="analysis-pair-count">{drawn.length < current.links.length ? t('pairDeclarationsShown', { shown: drawn.length, count: current.links.length }) : t('pairDeclarations', { count: current.links.length })}</span></span></p>
        <ul className={styles.pairCards} data-side="from">{sources.map((id, index) => card(id, current.pair.from, 'from', index))}</ul>
        <ul className={styles.pairCards} data-side="to">{targets.map((id, index) => card(id, current.pair.to, 'to', index + sources.length))}</ul>
        <svg className={styles.pairLines} data-hovering={hover !== null && drawn.some(hot) || undefined} aria-hidden="true">
          <g className={styles.lineGroups}>
            {drawn.map(link => {
              const line = lineOf.get(link.edge.id);
              return line ? <g key={link.edge.id} data-edge={link.edge.id} data-tone={hot(link) ? 'hot' : 'pair'} data-dimmed={Boolean(matches) && !searched(link) || undefined} className={hot(link) ? styles.hotConnection : styles.connection}>
                <path pathLength={1} className={`structure-link-in ${styles.pairLineIn}`} d={pairCurve(line)} />
                <polygon className={`structure-link-land ${styles.pairArrowIn}`} points={pairArrow(line)} />
              </g> : null;
            })}
          </g>
          {lines.map(line => <path key={`hit:${line.id}`} data-testid="analysis-witness" data-edge={line.id} className={styles.lineHit} d={pairCurve(line)} onClick={() => onSelectEdge(line.id)} {...hoverProps(line.id)} />)}
          {active ? <g key={`on:${active.id}`} data-connection="selected" className={styles.selectedConnection}>
            <g data-edge={active.id}>
              <path pathLength={1} className={`structure-link-in ${shown.arriving ? styles.pairLineIn : ''}`} d={pairCurve(active)} />
              <polygon className={`structure-link-land ${shown.arriving ? styles.pairArrowIn : ''}`} points={pairArrow(active)} />
            </g>
          </g> : null}
        </svg>
      </div>
      {hiddenDeclarations > 0 ? <button type="button" data-testid="analysis-pair-more" aria-expanded={expanded}
        onClick={() => setExpandedPair(expanded ? null : current.pair.id)}
        className={controlClass({ shape: 'chip', size: 'md', tone: 'secondary', hoverSurface: 'lift', hoverInk: 'strong', className: `atlas-touch-floor ${styles.pairMore}` })}>
        {expanded ? t('showLessItems') : t('showMoreItems', { count: hiddenDeclarations })}
      </button> : null}
    </section>
    {detail}
    </div>
    {footer}
    </div>
  </div>;
}

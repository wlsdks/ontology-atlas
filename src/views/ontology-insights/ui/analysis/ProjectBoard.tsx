'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { Button, OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { EXIT_WINDOW_MS } from '@/shared/lib/render-timing/use-presence';
import { useStaggerOnce } from '@/shared/motion/stagger';
import type { AnalysisBoard, BoardLink } from '../../lib/analysis-board';
import type { AnalysisClaim } from '../../lib/analysis-model';
import { boardArrow, boardCurve, boardLines, type BoardLine, type CardBox } from './board-layout';
import styles from './analysis.module.css';

export type BoardMarker = 'moved' | 'missing';
type Question = 'relationships' | 'evidence';
type Tone = 'context' | 'pair' | 'hot';
const TONE_CLASS: Record<Tone, string> = { context: styles.connection, pair: styles.pairConnection, hot: styles.hotConnection };
const LANE_LIMIT = 12;
const ROW_HOVER = 'row:';
const name = (node: KnowledgeGraphNode) => node.display ?? node.title;

function useLeaving<T>(value: T) {
  const [state, setState] = useState({ value, leaving: null as T | null });
  if (state.value !== value) setState({ value, leaving: state.value });
  useEffect(() => {
    if (state.leaving === null) return;
    const timer = setTimeout(() => setState(current => ({ ...current, leaving: null })), EXIT_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [state.leaving]);
  return state.leaving;
}

export function ProjectBoard({ board, mode, selectedEdge, selectedClaim, markers, matches, onlyGaps, vaultKey, onSelectEdge, onSelectClaim }: {
  board: AnalysisBoard; mode: Question; selectedEdge: string | null; selectedClaim: string | null;
  markers: ReadonlyMap<string, BoardMarker>; matches: ReadonlySet<string> | null; onlyGaps: boolean; vaultKey: string;
  onSelectEdge: (edgeId: string) => void; onSelectClaim: (claimId: string) => void;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const host = useRef<HTMLDivElement>(null);
  const relationships = mode === 'relationships';
  const [lines, setLines] = useState<BoardLine[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [roving, setRoving] = useState<string | null>(null);
  const [openLanes, setOpenLanes] = useState<ReadonlySet<string>>(() => new Set());
  const leavingMode = useLeaving(mode);
  const leavingEdge = useLeaving(relationships ? selectedEdge : null);
  const stagger = useStaggerOnce({ vaultKey, listKey: 'analysis-board', ids: board.lanes.map(lane => lane.id) });
  const selected = relationships ? board.links.find(link => link.edge.id === selectedEdge) ?? null : null;
  const linksOf = useMemo(() => {
    const map = new Map<string, BoardLink[]>();
    for (const link of board.links) for (const id of new Set([link.from, link.to])) map.set(id, [...map.get(id) ?? [], link]);
    for (const [id, links] of map) map.set(id, [...links.filter(link => link.from === id), ...links.filter(link => link.from !== id)]);
    return map;
  }, [board.links]);
  const shown = board.lanes.map(lane => {
    const pinned = relationships ? lane.claims.find(claim => claim.node.id === selected?.from || claim.node.id === selected?.to)?.node.id ?? null : selectedClaim;
    if (matches || openLanes.has(lane.id) || lane.claims.length <= LANE_LIMIT) return lane.claims;
    const first = lane.claims.slice(0, LANE_LIMIT), kept = lane.claims.find(claim => claim.node.id === pinned);
    return !kept || first.includes(kept) ? first : [...first.slice(0, LANE_LIMIT - 1), kept];
  });
  const liveIds = new Set(shown.flat().flatMap(claim => !relationships || linksOf.has(claim.node.id) ? [claim.node.id] : []));
  const tabStop = [roving, relationships ? selected?.from : selectedClaim].find(id => id && liveIds.has(id)) ?? liveIds.values().next().value ?? null;
  const laneOf = new Map(board.lanes.flatMap(lane => lane.claims.map(claim => [claim.node.id, lane.id] as const)));
  const onBoard = new Set(shown.flat().map(claim => claim.node.id));
  const anchor = (id: string) => onBoard.has(id) || !laneOf.has(id) ? id : `more:${laneOf.get(id)}`;
  const folded = new Set<string>();
  const endsKey = JSON.stringify(board.links.flatMap(link => {
    const from = anchor(link.from), to = anchor(link.to), pair = `${from}\0${to}`;
    if (from === link.from && to === link.to) return [{ id: link.edge.id, from, to }];
    if (folded.has(pair)) return [];
    folded.add(pair);
    return [{ id: link.edge.id, from, to }];
  }));

  useLayoutEffect(() => {
    const element = host.current;
    if (!element || !relationships) return;
    const ends = JSON.parse(endsKey) as { id: string; from: string; to: string }[];
    const measure = () => {
      const boxes = new Map<string, CardBox>([...element.querySelectorAll<HTMLElement>('[data-board-node]')].map(node => {
        const lane = node.closest<HTMLElement>('[data-board-lane]')!, frame = lane.getBoundingClientRect(), box = node.getBoundingClientRect();
        const top = box.top - frame.top + lane.offsetTop, left = box.left - frame.left + lane.offsetLeft;
        return [node.dataset.boardNode!, { top, bottom: top + box.height, left, right: left + box.width }];
      }));
      const next = boardLines(ends, boxes);
      setLines(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('[data-board-lane], [data-board-node]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [endsKey, relationships]);

  const lineById = new Map(lines.map(line => [line.id, line]));
  const linkById = new Map(board.links.map(link => [link.edge.id, link]));
  const hoveredRow = hover?.startsWith(ROW_HOVER) ? Number(hover.slice(ROW_HOVER.length)) : null;
  const hovered = hoveredRow !== null ? board.links.filter(link => link.fromLane === hoveredRow || link.toLane === hoveredRow)
    : hover ? linkById.has(hover) ? [linkById.get(hover)!] : linksOf.get(hover) ?? [] : [];
  const related = new Set(hovered.flatMap(link => [link.from, link.to]));
  const activeLanes = new Set(selected ? [selected.fromLane, selected.toLane] : []);
  const hoverProps = (id: string) => ({ onPointerEnter: () => setHover(id), onPointerLeave: () => setHover(null), onFocus: () => setHover(id), onBlur: () => setHover(null) });
  const connection = (line: BoardLine, className: string, draw: boolean, tone?: Tone) => <g key={line.id} data-edge={line.id} data-tone={tone} className={className}>
    <path pathLength={1} className={draw ? 'structure-link-in' : undefined} d={boardCurve(line)} />
    <polygon className={draw ? 'structure-link-land' : undefined} points={boardArrow(line)} />
  </g>;
  const tone = (link: BoardLink): Tone => hovered.includes(link) ? 'hot' : link.pairId === selected?.pairId ? 'pair' : 'context';
  const active = selected ? lineById.get(selected.edge.id) : undefined;
  const leaving = leavingEdge ? lineById.get(leavingEdge) : undefined;

  function selectFromCard(id: string) {
    const links = linksOf.get(id) ?? [];
    const current = links.findIndex(link => link.edge.id === selectedEdge);
    const next = links[(current + 1) % links.length];
    if (next) onSelectEdge(next.edge.id);
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const from = event.currentTarget, cards = [...host.current?.querySelectorAll<HTMLElement>('[data-testid="analysis-claim"]:not([aria-disabled])') ?? []];
    const index = cards.indexOf(from), centre = (node: HTMLElement) => { const box = node.getBoundingClientRect(); return box.left + box.width / 2; };
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowRight') next = cards[index + 1];
    else if (event.key === 'ArrowLeft') next = cards[index - 1];
    else if (event.key === 'Home') next = cards[0];
    else if (event.key === 'End') next = cards.at(-1);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const lanes = [...host.current?.querySelectorAll<HTMLElement>('[data-board-lane]') ?? []], step = event.key === 'ArrowDown' ? 1 : -1, x = centre(from);
      for (let lane = lanes.indexOf(from.closest<HTMLElement>('[data-board-lane]')!) + step; !next && lane >= 0 && lane < lanes.length; lane += step) {
        next = cards.filter(node => lanes[lane]!.contains(node)).sort((a, b) => Math.abs(centre(a) - x) - Math.abs(centre(b) - x))[0];
      }
    } else return;
    event.preventDefault();
    next?.focus();
  }

  function card(claim: AnalysisClaim) {
    const id = claim.node.id, links = linksOf.get(id) ?? [];
    const endpoint = selected?.from === id ? 'from' : selected?.to === id ? 'to' : null;
    const live = !relationships || links.length > 0;
    const pressed = relationships ? endpoint !== null : selectedClaim === id;
    const marker = markers.get(id);
    const state = [marker ? t(`sourceShort.${marker}`) : null, claim.gaps.length ? t('cardGaps', { count: claim.gaps.length }) : null].filter(Boolean).join(' · ');
    const label = relationships ? links.length ? `${name(claim.node)} · ${t('nodeDeclarations', { count: links.length })}` : name(claim.node) : [name(claim.node), state].filter(Boolean).join(' · ');
    const dimmed = !relationships && onlyGaps && !claim.gaps.length || Boolean(matches && !matches.has(id));
    return <li key={id} className={styles.boardCardSlot} data-quiet={relationships && !links.length || undefined} data-related={!pressed && related.has(id) || undefined} data-dimmed={dimmed && !pressed || undefined}>
      <button type="button" data-board-node={id} data-testid="analysis-claim" data-analysis-claim-id={id} data-endpoint={endpoint ?? undefined}
        aria-pressed={live ? pressed : undefined} aria-disabled={live ? undefined : true} tabIndex={id === tabStop ? 0 : -1} aria-label={label} title={name(claim.node)}
        onClick={live ? relationships ? () => selectFromCard(id) : () => onSelectClaim(id) : undefined} {...(relationships && live ? hoverProps(id) : {})}
        onFocus={live ? () => { setRoving(id); if (relationships) setHover(id); } : undefined} onKeyDown={live ? moveFocus : undefined}
        className={controlClass({ shape: 'card', size: 'md', tone: pressed ? 'accentOnTint' : 'secondary', active: pressed, hoverSurface: live ? 'lift' : undefined, hoverBorder: live ? 'strong' : undefined, className: `${styles.boardCard}${endpoint === 'to' ? ' structure-link-arrival' : ''}` })}>
        <span className="min-w-0 truncate">{name(claim.node)}</span>
        {marker || claim.gaps.length ? <span className={styles.boardMarkers} aria-hidden="true">
          {marker ? <span className={styles.boardMarker} data-marker={marker} /> : null}
          {claim.gaps.length ? <span className={styles.boardGapCount}>{claim.gaps.length}</span> : null}
        </span> : null}
      </button>
    </li>;
  }

  return <div ref={host} className={styles.board} data-testid="analysis-board" data-mode={mode} role="group" aria-label={t('board')}>
    <svg className={styles.boardLines} data-hovering={hovered.length ? true : undefined} aria-hidden="true">
      {relationships ? board.links.map(link => { const line = lineById.get(link.edge.id); return line ? connection(line, TONE_CLASS[tone(link)], true, tone(link)) : null; }) : null}
      {!relationships && leavingMode === 'relationships' ? <g className="structure-link-out">{lines.map(line => connection(line, styles.connection, false))}</g> : null}
      {relationships ? lines.map(line => <path key={`hit:${line.id}`} data-testid="analysis-witness" data-edge={line.id} className={styles.lineHit} d={boardCurve(line)} onClick={() => onSelectEdge(line.id)} {...hoverProps(line.id)} />) : null}
    </svg>
    <svg className={styles.boardLight} aria-hidden="true">
      {leaving ? <g key={`out:${leaving.id}`} className={`structure-link-out ${styles.selectedConnection}`}>{connection(leaving, '', false)}</g> : null}
      {active ? <g key={`on:${active.id}`} data-connection="selected" className={styles.selectedConnection}>{connection(active, '', true)}</g> : null}
    </svg>
    {board.lanes.map((lane, index) => {
      const motion = stagger(lane.id, index), cards = shown[index]!, hidden = lane.claims.length - cards.length;
      return <section key={lane.id} data-board-lane={lane.id} data-active={activeLanes.has(index) || undefined} data-hot={hoveredRow === index || undefined} aria-labelledby={`board-lane-${index}`} className={`${styles.boardLane} ${motion.className ?? ''}`} style={motion.style}>
        <p id={`board-lane-${index}`} className={`${styles.boardLaneTitle} text-body font-[var(--font-weight-strong)]`}
          {...(relationships ? { onPointerEnter: () => setHover(`${ROW_HOVER}${index}`), onPointerLeave: () => setHover(null) } : {})}>
          <span data-board-node={lane.id} className="flex min-w-0 items-center gap-2">{lane.domain ? <OntologyMapKindGlyph kind="domain" size={14} /> : null}<span className="min-w-0 truncate">{lane.domain ? name(lane.domain) : t('laneUnassigned')}</span></span>
        </p>
        <ul className={styles.boardCards}>
          {cards.map(card)}
          {!cards.length ? <li className="self-center px-1 text-label text-[color:var(--color-text-tertiary)]">{t('laneEmpty')}</li> : null}
          {hidden > 0 || openLanes.has(lane.id) && lane.claims.length > LANE_LIMIT && !matches ? <li><Button variant="ghost" size="sm" data-board-node={`more:${lane.id}`} className="atlas-touch-floor"
            onClick={() => setOpenLanes(current => { const next = new Set(current); if (!next.delete(lane.id)) next.add(lane.id); return next; })}>
            {hidden > 0 ? t('showMoreItems', { count: hidden }) : t('showLessItems')}
          </Button></li> : null}
        </ul>
      </section>;
    })}
  </div>;
}

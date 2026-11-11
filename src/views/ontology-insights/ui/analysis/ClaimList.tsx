'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { OntologyMapKindGlyph } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { useStaggerOnce } from '@/shared/motion/stagger';
import type { AnalysisBoard } from '../../lib/analysis-board';
import type { AnalysisClaim } from '../../lib/analysis-model';
import { useSelectionRoving } from './selection-roving';
import styles from './analysis.module.css';

export type BoardMarker = 'moved' | 'missing';
const name = (node: KnowledgeGraphNode) => node.display ?? node.title;

export function ClaimList({ board, selectedClaim, markers, matches, onlyGaps, vaultKey, onSelectClaim, empty }: {
  board: AnalysisBoard; selectedClaim: string | null; markers: ReadonlyMap<string, BoardMarker>; matches: ReadonlySet<string> | null; onlyGaps: boolean; vaultKey: string;
  onSelectClaim: (claimId: string) => void; empty: ReactNode;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const { moveFocus, setRoving, stopOf } = useSelectionRoving('[data-testid="analysis-board"]', '[data-testid="analysis-claim"]');
  const stagger = useStaggerOnce({ vaultKey, listKey: 'analysis-claims', ids: board.lanes.map(lane => lane.id) });
  const listed = (claim: AnalysisClaim) => claim.node.id === selectedClaim || (!onlyGaps || claim.gaps.length > 0) && (!matches || matches.has(claim.node.id));
  const lanes = board.lanes.map(lane => ({ lane, claims: lane.claims.filter(listed) })).filter(row => row.claims.length || !matches && !onlyGaps);
  const shownIds = new Set(lanes.flatMap(row => row.claims.map(claim => claim.node.id)));
  const tabStop = stopOf(shownIds, selectedClaim);

  return <div className={styles.claimList} data-testid="analysis-board" data-mode="evidence" role="group" aria-label={t('board')}>
    {lanes.length ? null : empty}
    {lanes.map(({ lane, claims }, index) => {
      const motion = stagger(lane.id, index), laneName = lane.domain ? name(lane.domain) : t('laneUnassigned');
      return <section key={lane.id} data-board-lane={lane.id} aria-labelledby={`claim-lane-${index}`} className={`${styles.claimLane} ${motion.className ?? ''}`} style={motion.style}>
        <p id={`claim-lane-${index}`} className={styles.claimLaneTitle}>
          {lane.domain ? <OntologyMapKindGlyph kind="domain" size={14} /> : null}
          <span className="min-w-0 truncate" title={laneName}>{laneName}</span>
          <span className={styles.claimLaneCount}>{claims.length}</span>
        </p>
        {claims.length ? <ul>
          {claims.map(claim => {
            const id = claim.node.id, pressed = id === selectedClaim, marker = markers.get(id);
            const gaps = claim.gaps.map(gap => t(`gapShort.${gap}`));
            const state = [marker ? t(`sourceShort.${marker}`) : null, ...gaps].filter(Boolean).join(' · ');
            return <li key={id}>
              <button type="button" data-testid="analysis-claim" data-analysis-claim-id={id} aria-pressed={pressed} tabIndex={id === tabStop ? 0 : -1}
                aria-label={[name(claim.node), state].filter(Boolean).join(' · ')} onClick={() => onSelectClaim(id)} onFocus={() => setRoving(id)} onKeyDown={moveFocus}
                className={controlClass({ shape: 'row', size: 'md', tone: pressed ? 'strong' : 'secondary', active: pressed, hoverSurface: 'lift', hoverInk: 'strong', className: styles.claimRow })}>
                <span className={styles.claimName} title={name(claim.node)}>{name(claim.node)}</span>
                <span className={styles.claimGaps} data-clean={!gaps.length || undefined}>{gaps.length ? gaps.join(' · ') : [claim.roles.length ? t('recordedRoles', { count: claim.roles.length }) : null, claim.paths.length ? t('recordedPaths', { count: claim.paths.length }) : null].filter(Boolean).join(' · ')}</span>
                {marker ? <span className={styles.claimSource} data-marker={marker}><span className={styles.boardMarker} data-marker={marker} aria-hidden="true" />{t(`sourceShort.${marker}`)}</span> : null}
              </button>
            </li>;
          })}
        </ul> : <p className={styles.claimLaneEmpty}>{t('laneEmpty')}</p>}
      </section>;
    })}
  </div>;
}

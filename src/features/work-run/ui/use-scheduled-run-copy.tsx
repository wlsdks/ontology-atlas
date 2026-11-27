'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { checkedNothing, type ScheduledRun } from '../model/scheduled-run';
import type { MoruState } from './WorkRunMoru';
import { displayPageName, type WorkRunMarks } from './use-work-run-copy';

/** The light under Moru: indigo while it works, then how it ended before a word is read. */
export type SeatTint = 'running' | 'success' | 'amber';

export interface ScheduledRunCopy {
  title: string;
  /** While it runs, the document being checked or the step; once it ends, the result's sentence. */
  line: ReactNode;
  figures: ReactNode | null;
  tint: SeatTint;
  moru: MoruState;
}

/** The card's column holds the name alone, so a long path keeps its start and its ending. */
const DOCUMENT_NAME_MAX = 34;

function documentName(path: string): string {
  return displayPageName(path.replace(/\.md$/, ''), DOCUMENT_NAME_MAX);
}

export function scheduledTint(run: ScheduledRun): SeatTint {
  if (run.phase === 'running') return 'running';
  const outcome = run.result?.outcome;
  return outcome === 'failed' || outcome === 'refused' || run.phase === 'stopped' ? 'amber' : 'success';
}

export function scheduledMoru(run: ScheduledRun): MoruState {
  if (run.phase === 'running') {
    return { phase: 'running', line: { kind: run.document ? 'reading' : run.step === 'agent' ? 'tool' : 'connecting' } };
  }
  return { phase: scheduledTint(run) === 'amber' ? 'failed' : 'clean', line: { kind: 'writing' } };
}

/** What a scheduled run says on the card, in the dialog and on its Automations stage. */
export function useScheduledRunCopy(run: ScheduledRun, elapsed: string | null, marks: WorkRunMarks): ScheduledRunCopy {
  const t = useTranslations('workCard.scheduled');
  const name = run.name;
  const tint = scheduledTint(run);
  const moru = scheduledMoru(run);
  if (run.phase === 'running') {
    const count = run.checkedCount;
    return {
      title: t('title', { name }),
      line: run.document ? marks.page(documentName(run.document)) : t(run.step),
      figures: t.rich('figures', { checked: count, elapsed: elapsed ?? '', count: () => marks.count(count) }),
      tint,
      moru,
    };
  }
  const result = run.result;
  if (!result) return { title: t('title', { name }), line: t('stopped'), figures: null, tint, moru };
  if (checkedNothing(result)) return { title: t('nothingTitle'), line: t('nothingBody', { name }), figures: null, tint, moru };
  switch (result.outcome) {
    case 'held':
      return { title: t('heldTitle'), line: t('heldBody', { name, count: result.checked }), figures: null, tint, moru };
    case 'stale':
      return { title: t('staleTitle', { count: result.stale }), line: t('staleBody', { name }), figures: null, tint, moru };
    case 'redrafted':
      return { title: t('redraftedTitle', { count: result.written }), line: t('redraftedBody', { name }), figures: null, tint, moru };
    case 'rechecked':
      return { title: t('recheckedTitle', { name }), line: t('recheckedBody', { count: result.written }), figures: null, tint, moru };
    case 'reviewed':
      return { title: t('reviewedTitle', { name }), line: result.summary || t('reviewedBody'), figures: null, tint, moru };
    case 'refused':
      return { title: t('refusedTitle', { name }), line: t('refusedBody'), figures: null, tint, moru };
    case 'failed':
      return { title: t('failedTitle', { name }), line: t('failedBody'), figures: null, tint, moru };
  }
}

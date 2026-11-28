import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import type { WorkRun, WorkRunLine } from '../model/work-run';

/** Long names keep their start and their ending, where a file's name is told apart. */
const PAGE_NAME_MAX = 40;

/** The card's line holds the name alone, in a narrower column than the stage's. */
const CARD_PAGE_NAME_MAX = 34;

export function displayPageName(page: string, max = PAGE_NAME_MAX): string {
  const name = page.normalize('NFC');
  const chars = [...name];
  if (chars.length <= max) return name;
  const tail = Math.ceil((max - 1) * 0.6);
  return `${chars.slice(0, max - 1 - tail).join('')}…${chars.slice(chars.length - tail).join('')}`;
}

/** How a surface sets the two facts that lead its line: the page being read and the count. */
export interface WorkRunMarks {
  page: (name: ReactNode) => ReactNode;
  count: (value: number) => ReactNode;
}

const PLAIN: WorkRunMarks = { page: (name) => name, count: (value) => value };

export interface WorkRunCopy {
  title: string;
  /** What the agent is doing now while it runs; the result's sentence once it has ended. */
  detail: ReactNode;
  /** Pages read and elapsed time while it runs. */
  figures: ReactNode | null;
}

/**
 * The stage names the agent beside what it does; the card, a corner on another screen, says only
 * what it does, and its ended states use sentences short enough for its two lines.
 */
export type WorkRunPlace = 'stage' | 'card';

export function useWorkRunCopy(
  run: WorkRun,
  elapsed: string | null,
  marks: WorkRunMarks = PLAIN,
  place: WorkRunPlace = 'stage',
): WorkRunCopy {
  const t = useTranslations('library.check');
  const tChat = useTranslations('acpChat');
  const agent = run.agent;
  const read = run.readCount;
  const onCard = place === 'card';
  const working = (tool: string) => (onCard ? tool : t('working', { agent, tool }));
  const lineText = (line: WorkRunLine): ReactNode => {
    switch (line.kind) {
      case 'connecting':
        return working(tChat('status.starting'));
      case 'reading':
        return onCard
          ? marks.page(displayPageName(line.page, CARD_PAGE_NAME_MAX))
          : t.rich('reading', { agent, page: displayPageName(line.page), name: (chunks) => marks.page(chunks) });
      case 'writing':
        return onCard ? t('cardWriting') : t('writing', { agent });
      case 'tool': {
        const { kind, text } = line.label;
        const tool = kind === 'known'
          ? tChat(`tool.${text}` as Parameters<typeof tChat>[0])
          : kind === 'kind'
            ? tChat(`toolKind.${text}` as Parameters<typeof tChat>[0])
            : text;
        return working(tool);
      }
    }
  };
  const figures = t.rich('figures', { read, elapsed: elapsed ?? '', count: () => marks.count(read) });
  switch (run.phase) {
    case 'running':
      return { title: t('title'), detail: lineText(run.line), figures };
    case 'asking':
      return { title: t('title'), detail: t('asking', { agent }), figures };
    case 'found':
      return {
        title: t('foundTitle', { findings: run.report?.itemCount ?? 0, pages: run.report?.pageCount ?? 0 }),
        detail: t('foundBody'),
        figures: null,
      };
    case 'clean':
      return { title: t('doneTitle'), detail: t('doneClean'), figures: null };
    case 'unreadable':
      return onCard
        ? { title: t('unreadCardTitle'), detail: t('unreadCardBody'), figures: null }
        : { title: t('unreadTitle'), detail: t('unreadBody'), figures: null };
    case 'failed':
      return { title: t('failedTitle'), detail: t('failedBody', { agent }), figures: null };
    case 'stopped':
      return { title: t('title'), detail: t('stopped'), figures: null };
  }
}

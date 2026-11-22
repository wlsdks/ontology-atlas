'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { RowButton } from '@/shared/ui/controls/controls';
import type { BellResult } from '../../model/bell-inbox';
import {
  decisionKey,
  resultFacts,
  writeSentence,
  type BellFact,
} from '../../model/inbox-row-copy';
import { ResultFactLine } from './ResultFactLine';
import { ROW_HEADLINE_CLASS, RowMark } from './inbox-row-primitives';

/** One finished task or decision: its sentence and object on line one, its facts on line two. */
export function ResultRow({
  row,
  age,
  briefCounts,
  canOpenNode,
  canOpenConversation,
  onOpen,
}: {
  row: BellResult;
  age: string;
  briefCounts: readonly BellFact[] | null;
  canOpenNode: boolean;
  canOpenConversation: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('agentActivity');

  return (
    <li className="min-w-0">
      <RowButton
        size="sm"
        tone="secondary"
        hoverInk="strong"
        hoverSurface="lift"
        data-testid="agent-inbox-result-row"
        data-unread={row.unread ? 'true' : 'false'}
        onClick={onOpen}
        className="w-full gap-2 px-1 py-1.5"
      >
        <RowMark>
          {row.unread ? (
            <>
              <span
                aria-hidden
                data-testid="agent-inbox-unread-dot"
                className="size-1.5 rounded-full bg-[color:var(--color-indigo-accent)]"
              />
              <span className="sr-only">{t('unreadRow')}</span>
            </>
          ) : null}
        </RowMark>
        {/* Two lines, always: the sentence and its object share line one and the facts own line two, so a row with no object is as tall as one with. */}
        <span className="grid min-w-0 flex-1 gap-0.5 text-left">
          <span className={ROW_HEADLINE_CLASS}>
            <span
              className={cn(
                /* Not `shrink-0`: at large text sizes the sentence kept its width and erased the object it names; both halves truncate. */
                'min-w-0 truncate text-label',
                row.unread
                  ? 'text-[color:var(--color-text-primary)]'
                  : 'text-[color:var(--color-text-secondary)]',
              )}
            >
              {row.kind === 'task' ? writeSentence(t, row.counts) : t(decisionKey(row))}
            </span>
            {row.kind === 'task' && row.node ? (
              <>
                <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  —
                </span>
                <span
                  title={row.node.slug}
                  className="min-w-0 truncate text-label text-[color:var(--color-text-secondary)]"
                >
                  {row.node.name}
                </span>
              </>
            ) : row.kind === 'decision' ? (
              <>
                <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
                  —
                </span>
                <span className="min-w-0 truncate text-label text-[color:var(--color-text-secondary)]">
                  {row.request}
                </span>
              </>
            ) : null}
            {/* A count, not a state — so no badge box, which would also grow the line. */}
            {row.repeat > 1 ? (
              <span
                title={t('resultRepeatTitle', { count: row.repeat })}
                className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
              >
                {t('resultRepeat', { count: row.repeat })}
              </span>
            ) : null}
          </span>
          <ResultFactLine
            facts={resultFacts(t, row, age)}
            briefCounts={briefCounts}
            durationTitle={t('durationTitle')}
          />
          {/* Appended to the row's accessible name (not `aria-label`, which would replace its summary) so a press that navigates says so; omitted when neither door is wired, since then it only moves the read boundary. `sr-only` adds no grid row. */}
          {row.kind === 'task' && row.node && canOpenNode ? (
            <span className="sr-only">
              {t('openOnMap', { name: row.node.name })}
            </span>
          ) : canOpenConversation ? (
            <span className="sr-only">{t('openInConversation')}</span>
          ) : null}
        </span>
      </RowButton>
    </li>
  );
}

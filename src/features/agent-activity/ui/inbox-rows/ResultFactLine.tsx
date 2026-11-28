import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { cn } from '@/shared/lib/cn';
import type { BellFact, ResultFactLineModel } from '../../model/inbox-row-copy';

export function ResultFactLine({
  facts,
  briefCounts,
  durationTitle,
}: {
  facts: ResultFactLineModel;
  briefCounts: readonly BellFact[] | null;
  durationTitle: string;
}) {
  const t = useTranslations('agentActivity');
  const parts: ReactNode[] = [];
  for (const fact of briefCounts ?? []) {
    parts.push(
      <span
        key={`brief:${fact.label}`}
        className={cn(
          'shrink-0 tabular-nums',
          fact.tone === 'warning' ? 'text-[color:var(--color-status-warning)]' : undefined,
        )}
      >
        {fact.count === undefined ? fact.label : `${fact.label} ${fact.count}`}
      </span>,
    );
  }
  if (facts.agent) parts.push(<span key="agent" className="shrink-0">{facts.agent}</span>);
  if (facts.duration) {
    parts.push(
      <span key="duration" title={durationTitle} className="shrink-0 tabular-nums">
        {facts.duration}
      </span>,
    );
  }
  if (facts.age) parts.push(<span key="age" className="shrink-0">{facts.age}</span>);
  if (facts.allowed !== null && facts.denied !== null) {
    parts.push(
      <span key="allowed" className="shrink-0 tabular-nums">
        {t('decidedAllowed', { count: facts.allowed })}
      </span>,
      <span key="denied" className="shrink-0 tabular-nums">
        {t('decidedRejected', { count: facts.denied })}
      </span>,
    );
  }
  if (facts.autoApproved > 0) {
    parts.push(
      <span key="auto-approved" className="shrink-0 tabular-nums">
        {t('decidedAutoApproved', { count: facts.autoApproved })}
      </span>,
    );
  }
  for (const fact of facts.summaryFacts) {
    parts.push(
      <span
        key={`fact:${fact.label}`}
        className={cn(
          'min-w-0 truncate',
          fact.tone === 'warning' ? 'text-[color:var(--color-status-warning)]' : undefined,
        )}
      >
        {fact.count === undefined ? fact.label : `${fact.label} ${fact.count}`}
      </span>,
    );
  }
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-caption text-[color:var(--color-text-quaternary)]">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

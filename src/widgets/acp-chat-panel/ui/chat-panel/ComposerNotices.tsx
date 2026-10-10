import { Disclosure } from '@/shared/ui';

import type { ChatT, GrayT, SeatedDetail, SessionState } from './types';

export function SeatedDetailDisclosure({ t, detail }: { t: ChatT; detail: SeatedDetail }) {
  return (
    <Disclosure
      className="mb-2"
      summaryTestId="acp-chat-seated-detail"
      summary={t('seatedDetail', { lines: detail.detail.split('\n').filter((line) => line.trim()).length })}
    >
      <p
        data-testid="acp-chat-seated-detail-text"
        className="mt-1.5 whitespace-pre-wrap break-words font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]"
      >
        {detail.detail}
      </p>
    </Disclosure>
  );
}

export function TurnSilentNotice({ t, minutes }: { t: ChatT; minutes: number }) {
  return (
    <p
      data-testid="acp-chat-turn-silent"
      role="status"
      className="mt-2 text-label leading-prose text-[color:var(--color-text-tertiary)]"
    >
      <span className="text-[color:var(--color-text-secondary)]">
        {t('turnSilent', { minutes })}
      </span>{' '}
      {t('turnSilentHint')}
    </p>
  );
}

export function ReportedPlanNote({ tGray, plan }: { tGray: GrayT; plan: NonNullable<SessionState['reportedPlan']> }) {
  return (
    <p data-testid="acp-reported-plan" className="text-caption text-[color:var(--color-text-secondary)]">
      {tGray('continuation.reportedTasks', { done: plan.done, total: plan.total })}
      {plan.replanned ? ` ${tGray('continuation.replanned', { total: plan.total })}` : ''}
    </p>
  );
}

'use client';

import type { Ref } from 'react';
import { useTranslations } from 'next-intl';

import type { PendingPermission, permissionScope } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { FeedbackGlyph } from '@/shared/motion/feedback-glyph';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { meaningAuthority as readMeaningAuthority } from './permission-card-rules';
import type { usePermissionAnswer } from './use-permission-answer';

type PermissionOption = PendingPermission['request']['options'][number];

/**
 * Where a person answers: Reject and Allow once side by side, the rare task answers (correct, defer)
 * above them, and, for a plain tool request only, an always-allow grant. An ontology write offers no
 * grant: only Allow once and Reject are sent back for it.
 */
export function PermissionDecisions({
  taskBound,
  meaningAuthority,
  onRequestCorrection,
  onDefer,
  answer,
  answeredText,
  legendId,
  rejectButtonRef,
  allowDisabled,
  allowOnce,
  rejectOnce,
  allowAlways,
  ontologyWrite,
  scope,
  resolve,
}: {
  taskBound: boolean;
  meaningAuthority: ReturnType<typeof readMeaningAuthority>;
  onRequestCorrection?: () => void;
  onDefer?: () => void;
  answer: ReturnType<typeof usePermissionAnswer>;
  answeredText: string;
  legendId: string;
  rejectButtonRef: Ref<HTMLButtonElement>;
  allowDisabled: boolean;
  allowOnce: PermissionOption | undefined;
  rejectOnce: PermissionOption | undefined;
  allowAlways: PermissionOption | undefined;
  ontologyWrite: boolean;
  scope: ReturnType<typeof permissionScope>;
  resolve: PendingPermission['resolve'];
}) {
  const t = useTranslations('acpChat.permission');
  const { answered, outcome, failed, settled, receiptReady, answerWith, setAnswerInReach, showReceipt } = answer;
  const receipt = (
    <p
      key="answered"
      data-testid="acp-permission-answered"
      data-answer={answered ?? undefined}
      data-feedback={outcome ?? 'idle'}
      className="ai-row-swap flex min-h-10 items-center gap-2 text-body leading-body text-[color:var(--color-text-secondary)]"
    >
      <FeedbackGlyph state={outcome ?? 'idle'} icon={null} size={ICON_SIZE.md} />
      <span className="min-w-0">{answeredText}</span>
    </p>
  );
  return (
    <div
      data-testid="acp-permission-decisions"
      className={cn('grid shrink-0 gap-2', (taskBound || allowAlways) && 'border-t border-[color:var(--color-divider)] pt-3')}
    >
      {taskBound && meaningAuthority !== 'unknown' ? (
        <p data-testid="task-review-authority-meaning" className="flex items-center justify-between gap-2 text-label leading-label">
          <span className="text-[color:var(--color-text-tertiary)]">{t('taskReview.authority.meaning')}</span>
          <span className="text-[color:var(--color-text-secondary)]">{t(`taskReview.authority.${meaningAuthority}`)}</span>
        </p>
      ) : null}
      {taskBound && (onRequestCorrection || onDefer) ? (
        <div
          data-testid="task-review-rare-answers"
          aria-hidden={settled ? true : undefined}
          className={cn('flex flex-wrap gap-2', settled && 'map-overlay-out')}
        >
          {onRequestCorrection ? (
            <Button
              variant="outline"
              size="sm"
              className="atlas-touch-floor"
              data-testid="task-review-correct"
              aria-describedby={`${legendId}-correct`}
              onClick={() => answerWith('correct', onRequestCorrection)}
            >
              {t('taskReview.correct')}
            </Button>
          ) : null}
          {onDefer ? (
            <Button
              variant="outline"
              size="sm"
              className="atlas-touch-floor"
              data-testid="task-review-defer"
              aria-describedby={`${legendId}-defer`}
              onClick={onDefer}
            >
              {t('taskReview.defer')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {failed ? receipt : null}
      <div className="grid">
        <div
          aria-hidden={settled ? true : undefined}
          onAnimationEnd={(event) => {
            if (settled && event.target === event.currentTarget) showReceipt();
          }}
          className={cn('col-start-1 row-start-1 grid grid-cols-2 gap-2', settled && 'map-overlay-out')}
        >
          <Button
            ref={rejectButtonRef}
            variant="outline"
            className="atlas-touch-floor w-full"
            data-testid="acp-permission-reject"
            onPointerEnter={() => setAnswerInReach('reject')}
            onPointerLeave={() => setAnswerInReach(null)}
            onClick={() => answerWith('reject', () => resolve(rejectOnce?.optionId ?? null))}
          >
            {t('reject')}
          </Button>
          <Button
            variant="primary"
            className="atlas-touch-floor w-full"
            data-testid="acp-permission-allow"
            aria-describedby={taskBound ? `${legendId}-allow` : undefined}
            disabled={allowDisabled}
            onPointerEnter={() => setAnswerInReach('allow')}
            onPointerLeave={() => setAnswerInReach(null)}
            onFocus={() => setAnswerInReach('allow')}
            onBlur={() => setAnswerInReach(null)}
            onClick={() => answerWith('allow', () => resolve(allowOnce?.optionId ?? null))}
          >
            {t('allowOnce')}
          </Button>
        </div>
        {receiptReady ? <div className="col-start-1 row-start-1">{receipt}</div> : null}
      </div>
      {allowAlways && !ontologyWrite ? (
        <div className="grid gap-1">
          <button
            type="button"
            data-testid="acp-permission-allow-always"
            onClick={() => answerWith('always', () => resolve(allowAlways.optionId))}
            className={controlClass({
              shape: 'card',
              size: 'sm',
              tone: 'muted',
              hoverBorder: 'strong',
              hoverInk: 'secondary',
              className: 'justify-self-start',
            })}
          >
            {t(
              scope.kind === 'tool'
                ? 'allowAlwaysTool'
                : scope.kind === 'directory'
                  ? 'allowAlwaysDirectory'
                  : 'allowAlwaysUnknown',
            )}
          </button>
          <p
            data-testid="acp-permission-scope"
            data-scope={scope.kind}
            className="text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {scope.kind === 'unknown'
              ? t('scopeUnknownHint')
              : t('scopeHint', { names: scope.names.join(' · ') })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { Fragment } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import type { PendingPermission } from '@/features/acp-session';
import { OntologyChangeReview } from '@/features/ontology-change-review';
import type { OntologyChangeSet } from '@/entities/knowledge-graph';
import { Button, Checkbox, Textarea } from '@/shared/ui';

import type { TaskMeaningReviewController } from '../../../../model/use-task-meaning-review';
import { proposalGuards } from './proposal-guards';
import type { TaskOrigin } from './task-origin';
import type { useTaskReviewState } from './use-task-review-state';

/**
 * The deepest look: the complete change, then, once the review basis is ready, the canonical text it
 * would write, the acknowledgement of the full scope and the button that accepts the meaning. The
 * provenance list shows which request this is.
 */
export function TaskReviewDetails({
  changeSet,
  activeItemIndex,
  onActiveItemChange,
  taskReview,
  review,
  taskOrigin,
  request,
}: {
  changeSet: OntologyChangeSet;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
  taskReview?: TaskMeaningReviewController;
  review: ReturnType<typeof useTaskReviewState>;
  taskOrigin: TaskOrigin;
  request: PendingPermission['request'];
}) {
  const t = useTranslations('acpChat.permission');
  const format = useFormatter();
  const guards = proposalGuards(request.rawInput, (epoch) =>
    format.dateTime(new Date(epoch), { dateStyle: 'medium', timeStyle: 'short' }),
  );
  const { acknowledgeFullScope, fullDetailsAvailable, acceptingMeaning, rationale } = review;
  return (
    <div data-testid="task-review-details" className="grid gap-3">
      <OntologyChangeReview
        changeSet={changeSet}
        activeItemIndex={activeItemIndex}
        onActiveItemChange={onActiveItemChange}
        onFullScopeAvailableChange={review.handleFullScopeAvailable}
        valueBasis={taskReview?.status === 'ready' ? 'request-raw' : 'after-only'}
        addressed
      />
      {taskReview?.status === 'ready' ? (
        <div className="grid gap-2 border-t border-[color:var(--color-divider)] pt-2">
          {taskReview.canonicalPreview !== undefined ? taskReview.canonicalPreview !== null ? (
            <div className="space-y-2">
              <p className="text-label leading-label font-[var(--font-weight-emphasis)]">{t('taskReview.canonicalPreview')}</p>
              <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('taskReview.canonicalPreviewNote')}</p>
              <pre className="atlas-scroll-quiet max-h-64 overflow-auto whitespace-pre-wrap break-words text-label leading-label">{taskReview.canonicalPreview}</pre>
            </div>
          ) : <p role="status" className="text-label leading-label">{t(taskReview.previewUnavailableReason === 'no_semantic_delta' ? 'taskReview.noSemanticDelta' : 'taskReview.previewUnavailable')}</p> : null}
          {taskReview.canonicalPreview ? <Textarea label={t('taskReview.rationale')} rows={2}
            value={rationale}
            onChange={(event) => review.setRationale(event.target.value)} /> : null}
          <Checkbox
            label={t('taskReview.acknowledgeFullScope', { count: changeSet.itemCount })}
            checked={acknowledgeFullScope}
            disabled={!taskReview.coverage.complete || !fullDetailsAvailable || taskReview.executionBlocked}
            onChange={(event) => review.setFullScopeAcknowledged(event.target.checked)}
          />
          <Button
            variant="outline"
            size="sm"
            data-testid="task-review-accept-meaning"
            disabled={!acknowledgeFullScope || !fullDetailsAvailable || acceptingMeaning || taskReview.meaningStatus === 'accepted' || taskReview.executionBlocked || taskReview.canonicalPreview === null}
            onClick={async () => {
              review.setAcceptingMeaning(true);
              try {
                const typedRationale = rationale.trim();
                await taskReview.markMeaningAccepted({ acknowledgeFullScope: true, ...(typedRationale ? { rationale: typedRationale } : {}) });
              }
              finally { review.setAcceptingMeaning(false); }
            }}
          >
            {t(taskReview.meaningStatus === 'accepted' ? 'taskReview.meaningAccepted' : acceptingMeaning ? 'taskReview.checkingBasis' : 'taskReview.acceptMeaning')}
          </Button>
          {taskReview.decisionSaveStatus ? <p role="status" className="text-label leading-label text-[color:var(--color-text-secondary)]">{t(`taskReview.decisionSave.${taskReview.decisionSaveStatus}`)}</p> : null}
        </div>
      ) : null}
      <details className="border-t border-[color:var(--color-divider)] pt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">
        <summary>{t('taskReview.provenance')}</summary>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 font-mono">
          <dt>{t('taskReview.requestId')}</dt><dd data-request-id-type={typeof request.requestId}>{String(request.requestId ?? t('taskReview.unknown'))}</dd>
          <dt>{t('taskReview.userEvent')}</dt><dd>{taskOrigin.userEventId}</dd>
          <dt>{t('taskReview.toolCall')}</dt><dd>{request.toolCallId ?? t('taskReview.unknown')}</dd>
          <dt>{t('taskReview.generation')}</dt><dd>{taskOrigin.sessionGeneration}</dd>
          {taskReview ? <><dt>{t('taskReview.guardStatus')}</dt><dd>{t(`taskReview.guard.${taskReview.guardStatus}`)}</dd></> : null}
          {guards.map((guard) => (
            <Fragment key={guard.key}><dt>{guard.key}</dt><dd title={guard.exact}>{guard.shown}</dd></Fragment>
          ))}
        </dl>
      </details>
    </div>
  );
}

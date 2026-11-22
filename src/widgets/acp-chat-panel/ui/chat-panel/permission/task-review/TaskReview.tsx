'use client';

import { useTranslations } from 'next-intl';

import type { PendingPermission } from '@/features/acp-session';
import type { OntologyChangeSet } from '@/entities/knowledge-graph';

import type { TaskMeaningReviewController } from '../../../../model/use-task-meaning-review';
import { splitTask, type summarizeProposal } from './meaning-units';
import type { TaskOrigin } from './task-origin';
import { TaskReviewAnswerLegend } from './TaskReviewAnswerLegend';
import { TaskReviewCompare } from './TaskReviewCompare';
import { TaskReviewDetails } from './TaskReviewDetails';
import { TaskReviewSummary } from './TaskReviewSummary';
import { TaskReviewTask } from './TaskReviewTask';
import type { useTaskReviewState } from './use-task-review-state';

/**
 * A request that belongs to a task the person gave: what is proposed at the depth they chose, the
 * task itself, and what each answer will do.
 */
export function TaskReview({
  changeSet,
  taskOrigin,
  taskReview,
  request,
  vaultPath,
  review,
  summary,
  coverageLine,
  activeItemIndex,
  onActiveItemChange,
  legendId,
  canCorrect,
  canDefer,
  allowEffect,
}: {
  changeSet: OntologyChangeSet;
  taskOrigin: TaskOrigin;
  taskReview?: TaskMeaningReviewController;
  request: PendingPermission['request'];
  vaultPath?: string | null;
  review: ReturnType<typeof useTaskReviewState>;
  summary: ReturnType<typeof summarizeProposal>;
  coverageLine: string;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
  legendId: string;
  canCorrect: boolean;
  canDefer: boolean;
  allowEffect: string;
}) {
  const t = useTranslations('acpChat.permission');
  const task = splitTask(taskOrigin.outcome);
  return (
    <section data-testid="task-review" className="grid gap-4">
      {taskReview?.executionBlocked ? (
        <p data-testid="task-review-root-mismatch" className="break-words rounded-chip border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-2.5 py-2 text-label leading-prose text-[color:var(--color-danger-text)]">
          {t('taskReview.rootMismatch', {
            actual: taskReview.actualReportedRoot ?? t('taskReview.unknown'),
            expected: vaultPath ?? t('taskReview.unknown'),
          })}
        </p>
      ) : null}

      {review.depth === 'summary' ? (
        <TaskReviewSummary summary={summary} coverageLine={coverageLine} itemCount={changeSet.itemCount} />
      ) : review.depth === 'compare' ? (
        <TaskReviewCompare taskReview={taskReview} summary={summary} coverageLine={coverageLine} />
      ) : (
        <TaskReviewDetails
          changeSet={changeSet}
          activeItemIndex={activeItemIndex}
          onActiveItemChange={onActiveItemChange}
          taskReview={taskReview}
          review={review}
          taskOrigin={taskOrigin}
          request={request}
        />
      )}

      <TaskReviewTask task={task} />

      <TaskReviewAnswerLegend
        legendId={legendId}
        canCorrect={canCorrect}
        canDefer={canDefer}
        allowEffect={allowEffect}
      />
    </section>
  );
}

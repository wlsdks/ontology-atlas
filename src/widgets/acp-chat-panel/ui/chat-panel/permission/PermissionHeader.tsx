import type { Ref } from 'react';
import { Eye, GitCompareArrows, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { permissionLocality } from '@/features/acp-session';
import type { OntologyChangeSet } from '@/entities/knowledge-graph';
import { cn } from '@/shared/lib/cn';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import type { AskMotion } from '@/shared/ui/marks/moru/moru-rows';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { AskMoru } from './AskMoru';
import type { ReviewItem } from './task-review/meaning-units';
import type { ReviewDepth } from './task-review/use-task-review-state';

/**
 * What the request is, in one line, and for a task-bound change which change of the batch is open
 * and how deep to look. Focus lands on the title when the card is task-bound (`titleRef`).
 */
export function PermissionHeader({
  titleRef,
  titleText,
  bodyText,
  taskBound,
  ontologyWrite,
  locality,
  askMotion,
  changeSet,
  activeReviewItem,
  activeItemIndex,
  depth,
  onDepthChange,
  executionBlocked,
}: {
  titleRef: Ref<HTMLParagraphElement>;
  titleText: string;
  bodyText: string;
  taskBound: boolean;
  ontologyWrite: boolean;
  locality: ReturnType<typeof permissionLocality>;
  askMotion: AskMotion;
  changeSet: OntologyChangeSet | null;
  activeReviewItem: ReviewItem | null;
  activeItemIndex?: number;
  depth: ReviewDepth;
  onDepthChange: (depth: ReviewDepth) => void;
  executionBlocked: boolean | undefined;
}) {
  const t = useTranslations('acpChat.permission');
  const tChange = useTranslations('ontologyChangeReview');
  const titleIcon = ontologyWrite ? (
    <GitCompareArrows size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
  ) : locality !== 'elsewhere' ? (
    taskBound ? <Eye size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-text-tertiary)]" /> : null
  ) : (
    <ShieldAlert size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-status-warning)]" />
  );
  return (
    <header className={cn('grid shrink-0 gap-2', !taskBound && 'justify-items-center text-center')}>
      {taskBound ? null : (
        <AskMoru motion={askMotion} />
      )}
      <p
        id="acp-permission-title"
        ref={titleRef}
        tabIndex={-1}
        className="text-body-lg leading-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] focus-visible:outline-none"
      >
        {titleIcon ? <span className="mr-2 inline-flex h-[1lh] items-center align-top">{titleIcon}</span> : null}
        {titleText}
      </p>
      {taskBound && changeSet ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p
            data-testid="task-review-scope"
            className="min-w-0 break-words text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            <span className="font-mono">
              {activeReviewItem?.relation
                ? t('taskReview.scopeRelation', {
                    from: activeReviewItem.relation.from,
                    type: activeReviewItem.relation.type,
                    to: activeReviewItem.relation.to,
                  })
                : activeReviewItem?.target ?? tChange('unknownTarget')}
            </span>
            {changeSet.itemCount > 1
              ? ` · ${t('taskReview.scopeItem', {
                  selected: (activeItemIndex ?? 0) + 1,
                  items: changeSet.itemCount,
                })}`
              : null}
          </p>
          <SegmentedControl
            ariaLabel={t('taskReview.depthLabel')}
            value={depth}
            onChange={onDepthChange}
            size="md"
            testId="task-review-depth"
            className="shrink-0"
            options={([
              ['summary', 'taskReview.summary'],
              ['compare', 'taskReview.compare'],
              ['details', 'taskReview.details'],
            ] as const).map(([value, key]) => ({ value, label: t(key), testId: `task-review-depth-${value}` }))}
          />
        </div>
      ) : null}
      <p
        id="acp-permission-body"
        className={taskBound && !executionBlocked
          ? 'sr-only'
          : 'text-label leading-label text-[color:var(--color-text-secondary)]'}
      >
        {bodyText}
      </p>
    </header>
  );
}

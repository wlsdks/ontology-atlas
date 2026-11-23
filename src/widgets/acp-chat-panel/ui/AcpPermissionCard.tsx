'use client';

import { useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { permissionIntent, permissionScope, widestPermissionLocality } from '@/features/acp-session';
import {
  fieldNameKey,
  ontologyChangeHeadline,
  OntologyChangeReview,
} from '@/features/ontology-change-review';
import { buildOntologyChangeSet, type OntologyChangeSet } from '@/entities/knowledge-graph';

import { cn } from '@/shared/lib/cn';
import type { AskMotion } from '@/shared/ui/marks/moru/moru-rows';
import type { WikiTemplateProblem } from '@/features/library';
import type { PendingPermission } from '@/features/acp-session';
import type { TaskMeaningReviewController } from '../model/use-task-meaning-review';
import { PermissionDecisions } from './chat-panel/permission/PermissionDecisions';
import { PermissionHeader } from './chat-panel/permission/PermissionHeader';
import { PermissionWriteVerdict } from './chat-panel/permission/PermissionWriteVerdict';
import { isAllowOnceDisabled, meaningAuthority } from './chat-panel/permission/allow-once-gate';
import {
  allowEffect as allowEffectOf,
  answeredKey,
  permissionBodyKey,
  permissionTitleKey,
} from './chat-panel/permission/permission-wording';
import { summarizeProposal } from './chat-panel/permission/task-review/meaning-units';
import { TaskReview } from './chat-panel/permission/task-review/TaskReview';
import { useTaskReviewState } from './chat-panel/permission/task-review/use-task-review-state';
import { usePermissionAnswer } from './chat-panel/permission/use-permission-answer';
import { useScrollEdgeFade } from './chat-panel/permission/use-scroll-edge-fade';

export function AcpPermissionCard({
  pending,
  changeSet: providedChangeSet,
  activeItemIndex,
  onActiveItemChange,
  vaultPath,
  writeVerdict = null,
  taskReview,
  onRequestCorrection,
  onDefer,
}: {
  pending: PendingPermission;
  writeVerdict?: { ok: boolean; problems: ReadonlyArray<WikiTemplateProblem> } | null;
  taskReview?: TaskMeaningReviewController;
  onRequestCorrection?: () => void;
  onDefer?: () => void;
  vaultPath?: string | null;
  changeSet?: OntologyChangeSet | null;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
}) {
  const t = useTranslations('acpChat.permission');
  const tChange = useTranslations('ontologyChangeReview');
  const { request, resolve } = pending;
  const reviewStateKey = `${typeof request.requestId}:${String(request.requestId)}:${request.toolCallId ?? ''}`;
  const review = useTaskReviewState(reviewStateKey);
  const answer = usePermissionAnswer(reviewStateKey);
  const { answered, failed, settled, answerInReach } = answer;
  const legendId = useId();
  const taskOrigin = pending.origin?.turn && pending.origin.task
    ? { ...pending.origin.turn, ...pending.origin.task, sessionGeneration: pending.origin.sessionGeneration }
    : null;
  const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
  const changeSet = providedChangeSet === undefined
    ? ontologyWrite
      ? buildOntologyChangeSet(request.toolName!, request.rawInput)
      : null
    : providedChangeSet;
  const taskBound = Boolean(changeSet && taskOrigin);
  const headline = changeSet ? ontologyChangeHeadline(changeSet) : null;
  const headlineFieldKey = headline?.fieldKey ? fieldNameKey(headline.fieldKey) : null;
  const targetName = typeof headline?.values.name === 'string' ? headline.values.name : null;
  const intent = permissionIntent(request.toolKind);
  const serverConsent =
    typeof request.toolCallId === 'string' &&
    request.toolCallId.startsWith('elicitation-') &&
    typeof request.rawInput.serverName === 'string';
  const askedSentence = serverConsent ? request.title : null;
  const scope = permissionScope(request.options);
  const targetPaths = request.filePath ? [request.filePath] : request.statedPaths ?? [];
  const locality = widestPermissionLocality(vaultPath ?? null, targetPaths);
  const askMotion: AskMotion = answerInReach === 'allow'
    ? 'tail-wag'
    : answerInReach === 'reject'
      ? 'stop'
      : locality === 'elsewhere'
        ? 'uncertain'
        : 'await-permission';

  const allowOnce = request.options.find((o) => o.kind === 'allow_once');
  const rejectOnce = request.options.find((o) => o.kind === 'reject_once');
  const allowAlways = request.options.find((o) => o.kind === 'allow_always');
  const activeReviewItem = changeSet?.items[activeItemIndex ?? 0] ?? changeSet?.items[0] ?? null;
  const summary = summarizeProposal(activeReviewItem);
  const coverageLine = summary.coverage === 'incomplete'
    ? t('taskReview.incomplete', {
        inspected: summary.visibleMeaningUnits.length,
        total: summary.meaningUnitCount,
        omitted: summary.omittedMeaningUnits,
      })
    : t(`taskReview.${summary.coverage}`);

  const rejectRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const { scrollRef, contentRef, edge, measure, mask } = useScrollEdgeFade();
  const initiallyTaskBound = useRef(taskBound);
  useEffect(() => {
    if (initiallyTaskBound.current) titleRef.current?.focus({ preventScroll: true });
    else rejectRef.current?.focus();
  }, []);

  const allowDisabled = isAllowOnceDisabled({
    hasAllowOnceOption: Boolean(allowOnce),
    acceptingMeaning: review.acceptingMeaning,
    reviewStatus: taskReview?.status,
    executionBlocked: taskReview?.executionBlocked,
  });
  const answeredMessageKey = answeredKey({ answered, failed, targetName, ontologyWrite });
  const answeredText = answeredMessageKey === null ? '' : t(answeredMessageKey, { name: targetName ?? '' });

  const titleText = headline
    ? tChange(`headline.${headline.key}`, {
        ...headline.values,
        ...(headline.fieldKey
          ? { field: headlineFieldKey ? tChange(headlineFieldKey) : headline.fieldKey }
          : {}),
      })
    : t(permissionTitleKey({ ontologyWrite, serverConsent, locality }));
  const bodyText = t(
    permissionBodyKey({
      ontologyWrite,
      executionBlocked: taskReview?.executionBlocked,
      reviewReady: taskReview?.status === 'ready',
      serverConsent,
      locality,
    }),
  );
  const allowEffect = allowEffectOf(changeSet, targetName);
  const allowEffectText = allowEffect.kind === 'batch'
    ? t('taskReview.allowEffectBatch', { count: allowEffect.count })
    : allowEffect.kind === 'named'
      ? t('taskReview.allowEffectNamed', { name: allowEffect.name })
      : t('taskReview.allowEffect');

  return (
    <>
      <section
        role="alertdialog"
        aria-labelledby="acp-permission-title"
        aria-describedby="acp-permission-body"
        data-testid="acp-permission-card"
        data-answered={settled ? answered : undefined}
        inert={settled ? true : undefined}
        className={cn(
          'ai-row-swap flex max-h-full min-h-0 flex-col gap-3 rounded-panel border p-[var(--card-pad)]',
          ontologyWrite
            ? 'border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] [@media(max-width:480px)]:overflow-y-auto [@media(max-height:520px)]:overflow-y-auto'
            : locality !== 'elsewhere'
              ? 'border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]'
              : 'border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-elevated)] bg-[image:linear-gradient(var(--color-amber-source-a08),var(--color-amber-source-a08))] shadow-[var(--shadow-elevation-2)]',
        )}
      >
        <PermissionHeader
          titleRef={titleRef}
          titleText={titleText}
          bodyText={bodyText}
          taskBound={taskBound}
          ontologyWrite={ontologyWrite}
          locality={locality}
          askMotion={askMotion}
          changeSet={changeSet}
          activeReviewItem={activeReviewItem}
          activeItemIndex={activeItemIndex}
          depth={review.depth}
          onDepthChange={review.setDepth}
          executionBlocked={taskReview?.executionBlocked}
        />

        <div
          ref={scrollRef}
          data-testid="acp-permission-body-scroll"
          data-edge={edge.top || edge.bottom ? `${edge.top ? 'top' : ''}${edge.top && edge.bottom ? '-' : ''}${edge.bottom ? 'bottom' : ''}` : undefined}
          onScroll={measure}
          style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
          className="atlas-scroll-quiet flex min-h-0 shrink flex-col overflow-y-auto [@media(max-width:480px)]:flex-none [@media(max-width:480px)]:overflow-visible [@media(max-height:520px)]:flex-none [@media(max-height:520px)]:overflow-visible"
        >
          <div ref={contentRef} className="flex flex-col gap-3">
          {taskBound && changeSet && taskOrigin ? (
            <TaskReview
              changeSet={changeSet}
              taskOrigin={taskOrigin}
              taskReview={taskReview}
              request={request}
              vaultPath={vaultPath}
              review={review}
              summary={summary}
              coverageLine={coverageLine}
              activeItemIndex={activeItemIndex}
              onActiveItemChange={onActiveItemChange}
              legendId={legendId}
              canCorrect={Boolean(onRequestCorrection)}
              canDefer={Boolean(onDefer)}
              allowEffect={allowEffectText}
            />
          ) : changeSet ? (
            <OntologyChangeReview changeSet={changeSet} activeItemIndex={activeItemIndex} onActiveItemChange={onActiveItemChange} />
          ) : askedSentence ? (
            <p
              data-testid="acp-permission-ask"
              className="text-body leading-prose text-[color:var(--color-text-primary)]"
            >
              {askedSentence}
            </p>
          ) : (
            <div className="grid gap-1 rounded-chip bg-[color:var(--color-overlay-1)] px-3 py-2.5">
              <p
                data-testid="acp-permission-intent"
                data-intent={intent}
                className="text-label leading-label text-[color:var(--color-text-primary)]"
              >
                {t(`intent.${intent}`)}
              </p>
              {ontologyWrite ? null : targetPaths.length > 0 ? (
                targetPaths.map((path) => (
                  <p
                    key={path}
                    data-testid="acp-permission-path"
                    className="break-all font-mono text-label leading-label text-[color:var(--color-text-primary)]"
                  >
                    {path}
                  </p>
                ))
              ) : (
                <p className="text-body leading-body text-[color:var(--color-text-secondary)]">
                  {request.title ?? t('unknownTarget')}
                </p>
              )}
            </div>
          )}

          {(changeSet || askedSentence) && !ontologyWrite && request.filePath ? (
            <p
              data-testid="acp-permission-path"
              className="break-all rounded-chip bg-[color:var(--color-overlay-1)] px-3 py-2.5 font-mono text-label leading-label text-[color:var(--color-text-primary)]"
            >
              {request.filePath}
            </p>
          ) : null}

          {writeVerdict ? <PermissionWriteVerdict verdict={writeVerdict} /> : null}
          </div>
        </div>

        <PermissionDecisions
          taskBound={taskBound}
          meaningAuthority={meaningAuthority(taskReview)}
          onRequestCorrection={onRequestCorrection}
          onDefer={onDefer}
          answer={answer}
          answeredText={answeredText}
          legendId={legendId}
          rejectButtonRef={rejectRef}
          allowDisabled={allowDisabled}
          allowOnce={allowOnce}
          rejectOnce={rejectOnce}
          allowAlways={allowAlways}
          ontologyWrite={ontologyWrite}
          scope={scope}
          resolve={resolve}
        />
      </section>
      <span role="status" className="sr-only">
        {answeredText}
      </span>
    </>
  );
}

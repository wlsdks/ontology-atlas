'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Eye, GitCompareArrows, ShieldAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { permissionIntent, permissionScope, permissionLocality } from '@/features/acp-session';
import {
  fieldNameKey,
  formatValue,
  FormattedValueView,
  type FormattedValue,
  ontologyChangeHeadline,
  OntologyChangeReview,
} from '@/features/ontology-change-review';
import {
  buildOntologyChangeSet,
  type OntologyChangeSet,
} from '@/entities/knowledge-graph';

import { cn } from '@/shared/lib/cn';
import { EXIT_WINDOW_MS } from '@/shared/lib/use-presence';
import { FeedbackGlyph } from '@/shared/motion/feedback-glyph';
import { Button, Checkbox, Disclosure, Textarea } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { describeWikiProblem, type WikiTemplateProblem } from '@/features/library';
import type { PendingPermission } from '@/features/acp-session';
import type { TaskMeaningReviewController } from '../model/use-task-meaning-review';

function formatReviewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const MEANING_SECTIONS = new Set(['Definition', 'Includes', 'Excludes', 'Uncertainty']);
const MEANING_SUMMARY_LIMIT = 5;
const VALUE_SUMMARY_LIMIT = 8;
const VERDICT_ROWS = 4;

type ReviewItem = OntologyChangeSet['items'][number];
type MeaningUnit = { id: string; label: string; text: string; displayText: string; value?: FormattedValue };

function bodySections(body: string) {
  const lines = body.split('\n');
  const units: Array<{ id: string; label: string; text: string; displayText: string }> = [];
  const covered = new Set<number>();
  let open: { heading: string; start: number } | null = null;
  let fence: '`' | '~' | null = null;
  const close = (end: number) => {
    if (!open || !MEANING_SECTIONS.has(open.heading)) return;
    const text = lines.slice(open.start, end).join('\n').trim();
    const displayText = lines.slice(open.start + 1, end).join('\n').trim();
    for (let index = open.start; index < end; index += 1) covered.add(index);
    if (text && displayText) units.push({ id: `body:${open.heading}`, label: open.heading, text, displayText });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(lines[index]);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(lines[index]);
    if (!heading) continue;
    close(index);
    open = { heading: heading[1], start: index };
  }
  close(lines.length);
  const uncovered = lines.some((line, index) => !covered.has(index) && line.trim().length > 0);
  return { units, uncovered };
}

function proposedMeaningUnits(item: ReviewItem | null): { units: MeaningUnit[]; bodyUncovered: boolean } {
  if (!item) return { units: [], bodyUncovered: false };
  const relationUnits: MeaningUnit[] = item.relation ? [{
    id: `relation:${item.relation.from}:${item.relation.type}:${item.relation.to}`,
    label: `${item.relation.from} → ${item.relation.type} → ${item.relation.to}`,
    text: item.relation.why ?? '',
    displayText: item.relation.why ?? '',
  }].filter((unit) => unit.text.length > 0) : [];
  let bodyUncovered = false;
  const bodyUnits = item.fields.flatMap((field) => {
    if (field.key !== 'body' || typeof field.after !== 'string') return [];
    const sections = bodySections(field.after);
    bodyUncovered = sections.uncovered;
    return sections.units;
  });
  const relationNoteUnits = item.fields.flatMap((field): MeaningUnit[] => {
    if (field.key !== 'relation_notes' || !isPlainRecord(field.after)) return [];
    return Object.entries(field.after).map(([target, value]) => ({
      id: `relation_notes:${target}`,
      label: `relation_notes · ${target}`,
      text: typeof value === 'string' ? value : '',
      displayText: typeof value === 'string' ? value : '',
      ...(typeof value === 'string' && value.length > 0 ? {} : { value: formatValue(value) }),
    }));
  });
  return { units: [...relationUnits, ...bodyUnits, ...relationNoteUnits], bodyUncovered };
}

function requestedValueFields(item: ReviewItem | null) {
  if (!item) return [];
  return item.fields.filter((field) => !(
    (field.key === 'body' && typeof field.after === 'string')
    || (field.key === 'relation_notes' && isPlainRecord(field.after))
  ));
}

function splitTask(outcome: string) {
  const trimmed = outcome.trim();
  const breakAt = /\n\s*\n/.exec(trimmed);
  if (!breakAt) return { lead: trimmed, rest: '' };
  return { lead: trimmed.slice(0, breakAt.index).trim(), rest: trimmed.slice(breakAt.index).trim() };
}

type Answer = 'allow' | 'reject' | 'correct' | 'always';

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
  const libraryT = useTranslations('library');
  const format = useFormatter();
  const tChange = useTranslations('ontologyChangeReview');
  const { request, resolve } = pending;
  const reviewStateKey = `${typeof request.requestId}:${String(request.requestId)}:${request.toolCallId ?? ''}`;
  const [reviewState, setReviewState] = useState<{
    key: string;
    depth: 'summary' | 'compare' | 'details';
    acknowledgeFullScope: boolean;
  }>({ key: reviewStateKey, depth: 'summary', acknowledgeFullScope: false });
  const reviewDepth = reviewState.key === reviewStateKey ? reviewState.depth : 'summary';
  const acknowledgeFullScope = reviewState.key === reviewStateKey
    ? reviewState.acknowledgeFullScope
    : false;
  const setReviewDepth = (depth: 'summary' | 'compare' | 'details') => {
    setReviewState({ key: reviewStateKey, depth, acknowledgeFullScope: false });
  };
  const [acceptingMeaning, setAcceptingMeaning] = useState(false);
  const [meaningRationale, setMeaningRationale] = useState({ key: reviewStateKey, value: '' });
  const [detailsAvailability, setDetailsAvailability] = useState({ key: reviewStateKey, available: false });
  const fullDetailsAvailable = detailsAvailability.key === reviewStateKey && detailsAvailability.available;
  const handleFullScopeAvailable = useCallback((available: boolean) => {
    setDetailsAvailability({ key: reviewStateKey, available });
  }, [reviewStateKey]);
  const [answer, setAnswer] = useState<{ key: string; choice: Answer; outcome: 'done' | 'failed' } | null>(null);
  const answered = answer?.key === reviewStateKey ? answer.choice : null;
  const outcome = answer?.key === reviewStateKey ? answer.outcome : null;
  const failed = outcome === 'failed';
  const settled = outcome === 'done';
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const receiptReady = settled && receiptKey === reviewStateKey;
  useEffect(() => {
    if (!settled) return;
    const id = window.setTimeout(() => setReceiptKey(reviewStateKey), EXIT_WINDOW_MS * 2);
    return () => window.clearTimeout(id);
  }, [settled, reviewStateKey]);
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
  const locality = permissionLocality(vaultPath ?? null, request.filePath ?? null);

  const allowOnce = request.options.find((o) => o.kind === 'allow_once');
  const rejectOnce = request.options.find((o) => o.kind === 'reject_once');
  const allowAlways = request.options.find((o) => o.kind === 'allow_always');
  const activeReviewItem = changeSet?.items[activeItemIndex ?? 0] ?? changeSet?.items[0] ?? null;
  const { units: meaningUnits, bodyUncovered } = proposedMeaningUnits(activeReviewItem);
  const visibleMeaningUnits = meaningUnits.slice(0, MEANING_SUMMARY_LIMIT);
  const omittedMeaningUnits = Math.max(0, meaningUnits.length - visibleMeaningUnits.length);
  const valueFields = requestedValueFields(activeReviewItem);
  const visibleValueFields = valueFields.slice(0, VALUE_SUMMARY_LIMIT);
  const omittedValueFields = valueFields.length - visibleValueFields.length;
  const coverageLine = omittedMeaningUnits > 0
    ? t('taskReview.incomplete', {
        inspected: visibleMeaningUnits.length,
        total: meaningUnits.length,
        omitted: omittedMeaningUnits,
      })
    : bodyUncovered
      ? t('taskReview.bodyInDetails')
      : meaningUnits.length === 0 && valueFields.length === 0
        ? t('taskReview.coverageNone')
        : t('taskReview.detailsPointer');
  const proposalGuards = ['confirm', 'expected_mtime', 'expected_into_mtime']
    .filter((key) => request.rawInput[key] !== undefined)
    .map((key) => {
      const value = request.rawInput[key];
      const epoch = key.endsWith('_mtime') && typeof value === 'number' && Number.isFinite(value)
        ? value
        : null;
      return {
        key,
        value,
        shown: epoch === null
          ? formatReviewValue(value)
          : format.dateTime(new Date(epoch), { dateStyle: 'medium', timeStyle: 'short' }),
        exact: epoch === null ? undefined : String(epoch),
      };
    });
  const meaningAuthority = taskReview?.status === 'ready'
    ? taskReview.meaningStatus === 'accepted' ? 'accepted' : 'pending'
    : 'unknown';
  const task = taskOrigin ? splitTask(taskOrigin.outcome) : null;
  const restLines = task?.rest ? task.rest.split('\n').filter((line) => line.trim().length > 0).length : 0;

  const rejectRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyContentRef = useRef<HTMLDivElement | null>(null);
  const [bodyEdge, setBodyEdge] = useState({ top: false, bottom: false });
  const measureBodyEdges = useCallback(() => {
    const box = bodyScrollRef.current;
    if (!box) return;
    const top = box.scrollTop > 1;
    const bottom = box.scrollTop < box.scrollHeight - box.clientHeight - 1;
    setBodyEdge((previous) => (previous.top === top && previous.bottom === bottom ? previous : { top, bottom }));
  }, []);
  useEffect(() => {
    const box = bodyScrollRef.current;
    const content = bodyContentRef.current;
    if (!box || !content) return;
    measureBodyEdges();
    const observer = new ResizeObserver(measureBodyEdges);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [measureBodyEdges]);
  const bodyFade = 'var(--tabbar-edge-fade)';
  const bodyMask =
    bodyEdge.top && bodyEdge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${bodyFade}, black calc(100% - ${bodyFade}), transparent 100%)`
      : bodyEdge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${bodyFade}), transparent 100%)`
        : bodyEdge.top
          ? `linear-gradient(to bottom, transparent 0, black ${bodyFade})`
          : undefined;
  const initiallyTaskBound = useRef(taskBound);
  useEffect(() => {
    if (initiallyTaskBound.current) titleRef.current?.focus({ preventScroll: true });
    else rejectRef.current?.focus();
  }, []);

  const answerWith = (choice: Answer, action: () => void) => {
    if (settled) return;
    try {
      action();
    } catch {
      setAnswer({ key: reviewStateKey, choice, outcome: 'failed' });
      return;
    }
    setAnswer({ key: reviewStateKey, choice, outcome: 'done' });
  };
  const allowDisabled = !allowOnce || acceptingMeaning || taskReview?.status === 'loading' || taskReview?.executionBlocked;
  const answeredText = answered === null
    ? ''
    : failed
      ? t('answered.failed')
      : answered === 'allow'
        ? targetName && ontologyWrite ? t('answered.allowNamed', { name: targetName }) : t('answered.allow')
        : answered === 'reject'
          ? targetName && ontologyWrite ? t('answered.rejectNamed', { name: targetName }) : ontologyWrite ? t('answered.rejectWrite') : t('answered.reject')
          : answered === 'correct'
            ? t('answered.correct')
            : t('answered.always');

  const titleText = headline
    ? tChange(`headline.${headline.key}`, {
        ...headline.values,
        ...(headline.fieldKey
          ? { field: headlineFieldKey ? tChange(headlineFieldKey) : headline.fieldKey }
          : {}),
      })
    : t(
        ontologyWrite
          ? 'ontologyWriteTitle'
          : serverConsent
            ? 'consentTitle'
            : locality === 'inside-folder'
              ? 'insideFolderTitle'
              : locality === 'inside-project'
                ? 'insideProjectTitle'
                : 'title',
      );
  const bodyText = t(
    ontologyWrite
      ? taskReview?.executionBlocked
        ? 'taskReview.rootMismatchBody'
        : taskReview?.status === 'ready'
          ? 'ontologyWriteBody'
          : 'ontologyWriteUnverifiedBody'
      : serverConsent
        ? 'consentBody'
        : locality === 'inside-folder'
          ? 'insideFolderBody'
          : locality === 'inside-project'
            ? 'insideProjectBody'
            : 'body',
  );
  const allowEffect = changeSet && changeSet.itemCount > 1
    ? t('taskReview.allowEffectBatch', { count: changeSet.itemCount })
    : targetName
      ? t('taskReview.allowEffectNamed', { name: targetName })
      : t('taskReview.allowEffect');
  const titleIcon = ontologyWrite ? (
    <GitCompareArrows size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
  ) : locality !== 'elsewhere' ? (
    <Eye size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-text-tertiary)]" />
  ) : (
    <ShieldAlert size={ICON_SIZE.md} aria-hidden className="text-[color:var(--color-status-warning)]" />
  );
  const fieldLabel = (key: string) => {
    const nameKey = fieldNameKey(key);
    return nameKey
      ? <span className="text-[color:var(--color-text-tertiary)]">{tChange(nameKey)}</span>
      : <span className="font-mono text-[color:var(--color-text-tertiary)]">{key}</span>;
  };
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
              ? 'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]'
              : 'border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)]',
        )}
      >
        <header className="grid shrink-0 gap-2">
          <p
            id="acp-permission-title"
            ref={titleRef}
            tabIndex={-1}
            className="text-body-lg leading-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] focus-visible:outline-none"
          >
            <span className="mr-2 inline-flex h-[1lh] items-center align-top">{titleIcon}</span>
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
                value={reviewDepth}
                onChange={setReviewDepth}
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
            className={taskBound && !taskReview?.executionBlocked
              ? 'sr-only'
              : 'text-label leading-label text-[color:var(--color-text-secondary)]'}
          >
            {bodyText}
          </p>
        </header>

        <div
          ref={bodyScrollRef}
          data-testid="acp-permission-body-scroll"
          data-edge={bodyEdge.top || bodyEdge.bottom ? `${bodyEdge.top ? 'top' : ''}${bodyEdge.top && bodyEdge.bottom ? '-' : ''}${bodyEdge.bottom ? 'bottom' : ''}` : undefined}
          onScroll={measureBodyEdges}
          style={bodyMask ? { maskImage: bodyMask, WebkitMaskImage: bodyMask } : undefined}
          className="atlas-scroll-quiet flex min-h-0 shrink flex-col overflow-y-auto [@media(max-width:480px)]:flex-none [@media(max-width:480px)]:overflow-visible [@media(max-height:520px)]:flex-none [@media(max-height:520px)]:overflow-visible"
        >
          <div ref={bodyContentRef} className="flex flex-col gap-3">
          {taskBound && changeSet && taskOrigin ? (
            <section data-testid="task-review" className="grid gap-4">
              {taskReview?.executionBlocked ? (
                <p data-testid="task-review-root-mismatch" className="break-words rounded-chip border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-2.5 py-2 text-label leading-prose text-[color:var(--color-danger-text)]">
                  {t('taskReview.rootMismatch', {
                    actual: taskReview.actualReportedRoot ?? t('taskReview.unknown'),
                    expected: vaultPath ?? t('taskReview.unknown'),
                  })}
                </p>
              ) : null}

              {reviewDepth === 'summary' ? (
                <div data-testid="task-review-summary" className="grid gap-3">
                  {visibleValueFields.length > 0 ? (
                    <dl data-testid="task-review-values" className="grid gap-2">
                      {visibleValueFields.map((field) => (
                        <div key={field.key} data-testid="task-review-value" data-field-key={field.key} className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3">
                          <dt className="break-words text-label leading-label">{fieldLabel(field.key)}</dt>
                          <dd className="min-w-0 text-body leading-prose text-[color:var(--color-text-primary)]">
                            <FormattedValueView value={formatValue(field.after)} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {omittedValueFields > 0 ? (
                    <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {tChange('moreFields', { count: omittedValueFields })}
                    </p>
                  ) : null}
                  {visibleMeaningUnits.length > 0 ? (
                    <div className="grid gap-2">
                      {visibleMeaningUnits.map((unit, index) => (
                        <div key={unit.id} data-testid={`task-review-meaning-unit-${index}`} className="grid gap-0.5">
                          <span className="break-words font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">{unit.label}</span>
                          {unit.value ? (
                            <FormattedValueView value={unit.value} className="text-body leading-prose" />
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
                              {unit.displayText}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {coverageLine ? (
                    <p data-testid="task-review-coverage" className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {coverageLine}
                    </p>
                  ) : null}
                  {changeSet.itemCount > 1 ? (
                    <p data-testid="task-review-batch-remaining" className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {t('taskReview.batchRemaining', { count: changeSet.itemCount - 1 })}
                    </p>
                  ) : null}
                </div>
              ) : reviewDepth === 'compare' && taskReview?.status === 'ready' ? (
                <div data-testid="task-review-compare" className="grid gap-2">
                  <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {t('taskReview.comparisonCoverage', {
                      inspected: taskReview.coverage.inspected,
                      total: taskReview.coverage.total,
                      omitted: taskReview.coverage.omitted,
                    })}
                  </p>
                  {taskReview.items.map((item) => (
                    <div key={item.id} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2 text-label leading-label">
                        <span className="font-mono text-[color:var(--color-text-tertiary)]">{item.field}</span>
                        <span className="text-[color:var(--color-text-tertiary)]">{t(`taskReview.delta.${item.kind}`)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
                        <span className="mr-1.5 text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.before')}</span>
                        {item.before.present ? formatReviewValue(item.before.value) : t('taskReview.absent')}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
                        <span className="mr-1.5 text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.after')}</span>
                        {item.after.present ? formatReviewValue(item.after.value) : t('taskReview.absent')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : reviewDepth === 'compare' ? (
                <div data-testid="task-review-compare" className="grid gap-2">
                  <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {t('taskReview.beforeUnavailable')}
                  </p>
                  {taskReview?.status === 'unavailable' && taskReview.reasons.length > 0 ? (
                    <ul className="grid gap-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {taskReview.reasons.map((reason) => <li key={reason}>{t(`taskReview.reason.${reason}`)}</li>)}
                    </ul>
                  ) : null}
                  {visibleValueFields.map((field) => (
                    <div key={field.key} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2">
                      <span className="text-label leading-label">{fieldLabel(field.key)}</span>
                      <div className="text-body leading-prose text-[color:var(--color-text-primary)]">
                        <span className="text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.after')}</span>
                        <FormattedValueView value={formatValue(field.after)} />
                      </div>
                    </div>
                  ))}
                  {visibleMeaningUnits.map((unit) => (
                    <div key={unit.id} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2">
                      <span className="break-words font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">{unit.label}</span>
                      <div className="text-body leading-prose text-[color:var(--color-text-primary)]">
                        <span className="text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.after')}</span>
                        {unit.value ? <FormattedValueView value={unit.value} /> : <p className="whitespace-pre-wrap break-words">{unit.displayText}</p>}
                      </div>
                    </div>
                  ))}
                  {coverageLine ? (
                    <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {coverageLine}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div data-testid="task-review-details" className="grid gap-3">
                  <OntologyChangeReview
                    changeSet={changeSet}
                    activeItemIndex={activeItemIndex}
                    onActiveItemChange={onActiveItemChange}
                    onFullScopeAvailableChange={handleFullScopeAvailable}
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
                        value={meaningRationale.key === reviewStateKey ? meaningRationale.value : ''}
                        onChange={(event) => setMeaningRationale({ key: reviewStateKey, value: event.target.value })} /> : null}
                      <Checkbox
                        label={t('taskReview.acknowledgeFullScope', { count: changeSet.itemCount })}
                        checked={acknowledgeFullScope}
                        disabled={!taskReview.coverage.complete || !fullDetailsAvailable || taskReview.executionBlocked}
                        onChange={(event) => setReviewState({
                          key: reviewStateKey,
                          depth: 'details',
                          acknowledgeFullScope: event.target.checked,
                        })}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="task-review-accept-meaning"
                        disabled={!acknowledgeFullScope || !fullDetailsAvailable || acceptingMeaning || taskReview.meaningStatus === 'accepted' || taskReview.executionBlocked || taskReview.canonicalPreview === null}
                        onClick={async () => {
                          setAcceptingMeaning(true);
                          try {
                            const rationale = meaningRationale.key === reviewStateKey ? meaningRationale.value.trim() : '';
                            await taskReview.markMeaningAccepted({ acknowledgeFullScope: true, ...(rationale ? { rationale } : {}) });
                          }
                          finally { setAcceptingMeaning(false); }
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
                      {proposalGuards.map((guard) => (
                        <Fragment key={guard.key}><dt>{guard.key}</dt><dd title={guard.exact}>{guard.shown}</dd></Fragment>
                      ))}
                    </dl>
                  </details>
                </div>
              )}

              {task ? (
                <div data-testid="task-review-task" className="grid gap-1">
                  <p data-testid="task-review-heading" className="text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">
                    {t('taskReview.eyebrow')}
                  </p>
                  <p data-testid="task-review-outcome-compact" className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
                    {task.lead}
                  </p>
                  {task.rest ? (
                    <Disclosure summary={t('taskReview.taskRest', { count: restLines })} summaryTestId="task-review-task-toggle">
                      <div className="grid gap-1.5 pt-1">
                        <p data-testid="task-review-outcome" className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
                          {task.rest}
                        </p>
                        <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('taskReview.nonGoalsUnstructured')}</p>
                      </div>
                    </Disclosure>
                  ) : null}
                </div>
              ) : null}

              <dl data-testid="task-review-answer-legend" className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-[color:var(--color-divider)] pt-3 text-label leading-label">
                {onRequestCorrection ? (
                  <>
                    <dt className="text-[color:var(--color-text-tertiary)]">{t('taskReview.correct')}</dt>
                    <dd id={`${legendId}-correct`} className="min-w-0 text-[color:var(--color-text-secondary)]">{t('taskReview.correctEffect')}</dd>
                  </>
                ) : null}
                {onDefer ? (
                  <>
                    <dt className="text-[color:var(--color-text-tertiary)]">{t('taskReview.defer')}</dt>
                    <dd id={`${legendId}-defer`} className="min-w-0 text-[color:var(--color-text-secondary)]">{t('taskReview.deferEffect')}</dd>
                  </>
                ) : null}
                <dt className="text-[color:var(--color-text-tertiary)]">{t('allowOnce')}</dt>
                <dd id={`${legendId}-allow`} data-testid="task-review-allow-scope" className="min-w-0 text-[color:var(--color-text-secondary)]">{allowEffect}</dd>
              </dl>
            </section>
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
            <p
              data-testid="acp-permission-intent"
              data-intent={intent}
              className="text-label leading-label text-[color:var(--color-text-primary)]"
            >
              {t(`intent.${intent}`)}
            </p>
          )}

          {!ontologyWrite && request.filePath ? (
            <p
              data-testid="acp-permission-path"
              className="break-all rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
            >
              {request.filePath}
            </p>
          ) : ontologyWrite || askedSentence ? null : (
            <p className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
              {request.title ?? t('unknownTarget')}
            </p>
          )}

          {writeVerdict ? (
            <div
              data-testid="acp-permission-page-verdict"
              data-ok={writeVerdict.ok ? 'true' : 'false'}
              className={
                writeVerdict.ok
                  ? 'rounded-chip border border-[color:var(--color-border-soft)] px-2.5 py-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]'
                  : 'rounded-chip border border-[color:var(--color-border-strong)] px-2.5 py-1.5 text-label leading-label text-[color:var(--color-text-secondary)]'
              }
            >
              {writeVerdict.ok ? (
                t('pageFits')
              ) : (
                <>
                  <p>{t('pageFails', { count: writeVerdict.problems.length })}</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {writeVerdict.problems.slice(0, VERDICT_ROWS).map((problem, index) => (
                      <li key={`${problem.code}-${problem.line ?? index}`} className="flex min-w-0 flex-col">
                        <span className="min-w-0 text-[color:var(--color-text-primary)]">
                          {describeWikiProblem(problem, libraryT).sentence}
                        </span>
                        <code className="min-w-0 break-all font-mono text-[color:var(--color-text-tertiary)]">
                          {problem.code}
                          {problem.line ? `:${problem.line}` : ''}
                        </code>
                      </li>
                    ))}
                  </ul>
                  {writeVerdict.problems.length > VERDICT_ROWS ? (
                    <p className="mt-1 text-[color:var(--color-text-tertiary)]">
                      {t('pageFailsRest', { count: writeVerdict.problems.length - VERDICT_ROWS })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          </div>
        </div>

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
                if (settled && event.target === event.currentTarget) setReceiptKey(reviewStateKey);
              }}
              className={cn('col-start-1 row-start-1 grid grid-cols-2 gap-2', settled && 'map-overlay-out')}
            >
              <Button
                ref={rejectRef}
                variant="outline"
                className="atlas-touch-floor w-full"
                data-testid="acp-permission-reject"
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
      </section>
      <span role="status" className="sr-only">
        {answeredText}
      </span>
    </>
  );
}

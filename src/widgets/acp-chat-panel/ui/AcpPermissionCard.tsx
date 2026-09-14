'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, GitCompareArrows, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { permissionIntent, permissionScope, permissionLocality } from '@/features/acp-session';
import {
  fieldNameKey,
  ontologyChangeHeadline,
  OntologyChangeReview,
} from '@/features/ontology-change-review';
import {
  buildOntologyChangeSet,
  type OntologyChangeSet,
} from '@/entities/knowledge-graph';

import { Button, Checkbox, Textarea } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { PendingPermission } from '@/features/acp-session';
import type { TaskMeaningReviewController } from '../model/use-task-meaning-review';

function formatReviewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

const MEANING_SECTIONS = new Set(['Definition', 'Includes', 'Excludes', 'Uncertainty']);
const MEANING_SUMMARY_LIMIT = 5;

function proposedMeaningUnits(item: OntologyChangeSet['items'][number] | null) {
  if (!item) return [];
  const relationUnits = item.relation ? [{
    id: `relation:${item.relation.from}:${item.relation.type}:${item.relation.to}`,
    label: `${item.relation.from} → ${item.relation.type} → ${item.relation.to}`,
    text: item.relation.why ?? '',
    displayText: item.relation.why ?? '',
  }].filter((unit) => unit.text.length > 0) : [];
  const bodyUnits = item.fields.flatMap((field) => {
    if (field.key === 'body' && typeof field.after === 'string') {
      const lines = field.after.split('\n');
      const units: Array<{ id: string; label: string; text: string; displayText: string }> = [];
      let open: { heading: string; start: number } | null = null;
      let fence: '`' | '~' | null = null;
      const close = (end: number) => {
        if (!open || !MEANING_SECTIONS.has(open.heading)) return;
        const text = lines.slice(open.start, end).join('\n').trim();
        const displayText = lines.slice(open.start + 1, end).join('\n').trim();
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
      return units;
    }
    return [];
  });
  const relationNoteUnits = item.fields.flatMap((field) => {
    if (field.key === 'relation_notes' && field.after && typeof field.after === 'object' && !Array.isArray(field.after)) {
      return Object.entries(field.after as Record<string, unknown>).flatMap(([target, value]) => (
        typeof value === 'string' ? [{ id: `relation_notes:${target}`, label: `relation_notes · ${target}`, text: value, displayText: value }] : []
      ));
    }
    return [];
  });
  return [...relationUnits, ...bodyUnits, ...relationNoteUnits];
}

/**
 * The 「May I do this?」 card — it appears whenever policy requires an explicit
 * checkpoint: for every Atlas ontology write and for outside or unresolved requests.
 *
 * ## The agent is stopped while this card is up
 *
 * That is what a permission checkpoint is. So this card has **no close X** — if it
 * could be dismissed without answering it would be a notification, not a checkpoint.
 * There is an explicit 「Don't」 (don't) instead.
 *
 * ## What it shows
 *
 * **The full path.** 「It wants to edit a file」 alone is not
 * something you can judge — *where* it wants to edit is precisely the basis for this
 * decision. So the path is not truncated, and a long one wraps so all of it shows.
 *
 * ## 「Always allow」 (always allow) is not given prominence
 *
 * Measured, that option carries a rule allowing **that entire directory for the whole
 * session**. One click widening the boundary wholesale means that, at the same weight
 * as the other two, people pick the easiest one. So it drops to a text button and
 * says what it means.
 */
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
  /**
   * What the page would look like if this write were allowed, judged against the wiki page
   * contract by the screen that owns the folder (the Library). Null when the write is not a
   * wiki page or its text cannot be known; then nothing is drawn, rather than a guess.
   */
  writeVerdict?: { ok: boolean; problems: ReadonlyArray<{ code: string; message: string; line?: number }> } | null;
  taskReview?: TaskMeaningReviewController;
  onRequestCorrection?: () => void;
  onDefer?: () => void;
  /** The open vault, so the card can tell the person's own project from somewhere else entirely. */
  vaultPath?: string | null;
  /** The computed value comes along so the panel and the map read the same typed change. */
  changeSet?: OntologyChangeSet | null;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
}) {
  const t = useTranslations('acpChat.permission');
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
  const taskOrigin = pending.origin?.turn && pending.origin.task
    ? { ...pending.origin.turn, ...pending.origin.task, sessionGeneration: pending.origin.sessionGeneration }
    : null;
  const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
  const changeSet = providedChangeSet === undefined
    ? ontologyWrite
      ? buildOntologyChangeSet(request.toolName!, request.rawInput)
      : null
    : providedChangeSet;
  /**
   * ⚠️ **The title says the change, not that a change exists** (owner, installed app at 1512×982,
   * 2026-09-06: *"can this design be improved? … something is lacking"*).
   *
   * Every ontology write was headed 「Review the proposed change」 — a sentence that is equally true
   * of all of them and therefore answers nothing. Underneath it sat the request itself: a slug in
   * mono, a frontmatter key in mono, the argument beside it. To decide, a person had to compose the
   * sentence themselves out of a debugger's dump.
   *
   * The facts for that sentence were already typed and already on screen. `ontologyChangeHeadline`
   * composes them — operation, target, field, how many values it carries — and every branch of it
   * has a variant for the fact the request did not carry, so a missing name produces 「it updates
   * this document」 rather than a plausible one.
   */
  const headline = changeSet ? ontologyChangeHeadline(changeSet) : null;
  const headlineFieldKey = headline?.fieldKey ? fieldNameKey(headline.fieldKey) : null;
  /* Not only where but **what** — see the comment below. */
  const intent = permissionIntent(request.toolKind);
  /**
   * **A server asking the person's consent is not "something outside this folder"** (wire capture,
   * 2026-08-24).
   *
   * The vault's own MCP server pauses each write by asking the client through
   * `elicitation/create`; `codex-acp` forwards it as an ordinary
   * `session/request_permission`. With no way to tell the two apart the card headed a change to a
   * file **inside** the chosen folder with 「it is trying to touch something outside this folder」 —
   * false, and false in the direction that makes a correct decision look alarming.
   *
   * The signal is measured, not guessed: that request arrives with
   * `toolCallId: "elicitation-<server>"` and a `rawInput.serverName`. Both must be present, so an
   * ordinary tool call named something similar cannot borrow this heading.
   */
  const serverConsent =
    typeof request.toolCallId === 'string' &&
    request.toolCallId.startsWith('elicitation-') &&
    typeof request.rawInput.serverName === 'string';
  /**
   * The one sentence that makes this answerable. When the vault's server asked the question itself,
   * that question is the material — not our generic heading, and never a second line repeating that
   * we do not know.
   */
  const askedSentence = serverConsent ? request.title : null;
  /*
    What 「Keep allowing」 (keep allowing) actually allows (2026-08-17).

    The old copy **asserted** *"The whole folder containing the path above"* (the whole folder containing
    the path above), but the adapter decides that scope, not us — and measured, the
    value was not a folder but a **tool**. Writing that a folder is allowed while a
    tool is allowed leaves the user believing they granted a permission they never
    did, or the reverse.

    So **only what the adapter declared** is stated, and with nothing given, nothing
    is asserted.
  */
  const scope = permissionScope(request.options);
  const locality = permissionLocality(vaultPath ?? null, request.filePath ?? null);

  const allowOnce = request.options.find((o) => o.kind === 'allow_once');
  const rejectOnce = request.options.find((o) => o.kind === 'reject_once');
  const allowAlways = request.options.find((o) => o.kind === 'allow_always');
  const activeReviewItem = changeSet?.items[activeItemIndex ?? 0] ?? changeSet?.items[0] ?? null;
  const meaningUnits = proposedMeaningUnits(activeReviewItem);
  const visibleMeaningUnits = meaningUnits.slice(0, MEANING_SUMMARY_LIMIT);
  const omittedMeaningUnits = Math.max(0, meaningUnits.length - visibleMeaningUnits.length);
  const proposalGuards = ['confirm', 'expected_mtime', 'expected_into_mtime']
    .filter((key) => request.rawInput[key] !== undefined)
    .map((key) => ({ key, value: request.rawInput[key] }));
  const meaningAuthority = taskReview?.status === 'ready'
    ? taskReview.meaningStatus === 'accepted' ? 'accepted' : 'pending'
    : 'unknown';

  /**
   * **Bring focus here** (caught in the 2026-08-16 review).
   *
   * This card declares `role="alertdialog"`. That role promises 「it interrupts the
   * work, and focus moves inside」, and **it was doing neither** — there was no code
   * moving focus, so for someone who cannot see the screen the moment the agent
   * stopped was **complete silence**. They could have gone on typing in that state.
   *
   * Focus goes to the reject side: a hand pressing any key to move past must not land
   * on **allow**. What this card opens is an irreversible decision.
   */
  const rejectRef = useRef<HTMLButtonElement | null>(null);
  const taskReviewHeadingRef = useRef<HTMLParagraphElement | null>(null);
  const initiallyTaskBound = useRef(Boolean(taskOrigin));
  useEffect(() => {
    if (initiallyTaskBound.current) taskReviewHeadingRef.current?.focus({ preventScroll: true });
    else rejectRef.current?.focus();
  }, []);

  return (
    <section
      role="alertdialog"
      aria-labelledby="acp-permission-title"
      aria-describedby="acp-permission-body"
      data-testid="acp-permission-card"
      /*
       * The section box is `rounded-panel` plus `p-[var(--card-pad)]` — 16px is not
       * written again by hand (the adoption ratchet caught `rounded-card` plus
       * `px-4 py-3.5` at first). This is not one item but **one section**: title,
       * rationale and options stand together to form a single decision.
       */
      /*
       * ⚠️ **The colour has to agree with the words** (owner, 2026-08-25: *"the colours are bad and
       * the inside layout is poor"*).
       *
       * Every non-write request was painted warning amber, including the one that says *this is your
       * own project, nothing has happened yet*. A card whose frame shouts while its sentence
       * reassures teaches people that the amber means nothing — the same cry-wolf failure the copy
       * fix addressed, left standing in the paint.
       *
       * Amber is now reserved for what it means: the agent reaching somewhere that is genuinely not
       * the person's project. Inside the project the card is neutral, and an ontology write keeps its
       * indigo. Every one of the three still stops for an answer; only the alarm is spent where it
       * is earned.
       */
      /*
       * ⚠️ **The two answers never scroll away** (2026-09-06). This was a `grid` with no bound, so
       * a batch ontology write — one review row per item — grew the card until 「Don't」 and
       * 「Allow once」 sat below the bottom of a 1040×720 window. The panel caps the card's height;
       * the card puts the scroll **around its reading matter only**, so the decision row is always
       * the last thing in the frame. A checkpoint you cannot answer is a wall.
       */
      className={
        ontologyWrite
          ? 'flex max-h-full min-h-0 flex-col gap-3 rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] p-[var(--card-pad)] [@media(max-width:480px)]:overflow-y-auto [@media(max-height:520px)]:overflow-y-auto'
          : locality !== 'elsewhere'
            ? 'flex max-h-full min-h-0 flex-col gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]'
            : 'flex max-h-full min-h-0 flex-col gap-3 rounded-panel border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] p-[var(--card-pad)]'
      }
    >
      <div
        data-testid="acp-permission-body-scroll"
        className="atlas-scroll-quiet flex min-h-0 shrink flex-col gap-3 overflow-y-auto [@media(max-width:480px)]:flex-none [@media(max-width:480px)]:overflow-visible [@media(max-height:520px)]:flex-none [@media(max-height:520px)]:overflow-visible"
      >
      <div className="flex items-start gap-2.5">
        {ontologyWrite ? (
          <GitCompareArrows
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
          />
        ) : locality !== 'elsewhere' ? (
          // Inside the person's own folder or project the mark is a neutral eye, not an alarm shield.
          <Eye
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-text-tertiary)]"
          />
        ) : (
          <ShieldAlert
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]"
          />
        )}
        <div className="min-w-0">
          <p
            id="acp-permission-title"
            className="break-keep text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
          >
            {headline
              ? tChange(`headline.${headline.key}`, {
                  ...headline.values,
                  ...(headline.fieldKey
                    ? {
                        field: headlineFieldKey
                          ? tChange(headlineFieldKey)
                          : headline.fieldKey,
                      }
                    : {}),
                })
              : t(
              ontologyWrite
                ? 'ontologyWriteTitle'
                : serverConsent
                  ? 'consentTitle'
                  : /*
                     * ⚠️ Since maps live inside projects, reading the code is *by construction*
                     * outside the vault — so the generic "outside this folder" now fires on the
                     * exact thing the person just asked for. A warning that cries wolf on the
                     * intended path teaches people to click through it. Nothing is suppressed;
                     * the card still stops for an answer, it just says which situation this is.
                     */
                    locality === 'inside-folder'
                    ? 'insideFolderTitle'
                    : locality === 'inside-project'
                      ? 'insideProjectTitle'
                      : 'title',
            )}
          </p>
          <p
            id="acp-permission-body"
            className={changeSet && taskOrigin && !taskReview?.executionBlocked
              ? 'sr-only'
              : 'mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]'}
          >
            {t(
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
            )}
          </p>
        </div>
      </div>

      {/*
        **What it is trying to do** (2026-08-17). With only the path shown, 「read」 and
        「delete」 look identical on screen — and those are completely different
        decisions. The value was already arriving as `toolKind`, and that field's own
        comment already recorded it as «a typed fact for the screen to use», while the
        screen was not reading it.

        When it is unknown, it says so. Guessing 「read」 errs on the most dangerous side.
      */}
      {changeSet && taskOrigin ? (
        <section data-testid="task-review" className="grid gap-1">
          <p
            ref={taskReviewHeadingRef}
            tabIndex={-1}
            data-testid="task-review-heading"
            className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-quaternary)] focus-visible:outline-none"
          >
            {t('taskReview.eyebrow')}
          </p>
          <details data-testid="task-review-task" className="group">
            <summary className="list-none rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]">
              <span data-testid="task-review-outcome-compact" className="line-clamp-1 break-words text-body leading-prose text-[color:var(--color-text-primary)]">{taskOrigin.outcome}</span>
            </summary>
            <div className="mt-2 grid gap-1.5">
              <p data-testid="task-review-outcome" className="break-words text-body leading-prose text-[color:var(--color-text-primary)]">{taskOrigin.outcome}</p>
              <p className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">{t('taskReview.nonGoalsUnstructured')}</p>
            </div>
          </details>

          <SegmentedControl
            ariaLabel={t('taskReview.depthLabel')}
            value={reviewDepth}
            onChange={setReviewDepth}
            fill
            size="md"
            testId="task-review-depth"
            options={([
              ['summary', 'taskReview.summary'],
              ['compare', 'taskReview.compare'],
              ['details', 'taskReview.details'],
            ] as const).map(([value, key]) => ({ value, label: t(key), testId: `task-review-depth-${value}` }))}
          />

          {reviewDepth === 'summary' ? (
          <div data-testid="task-review-summary" className="grid gap-2">
              <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
                {activeReviewItem?.relation
                  ? t('taskReview.relationScope', {
                      from: activeReviewItem.relation.from,
                      type: activeReviewItem.relation.type,
                      to: activeReviewItem.relation.to,
                      selected: (activeItemIndex ?? 0) + 1,
                      items: changeSet.itemCount,
                    })
                  : t('taskReview.scope', {
                      operation: tChange(`operation.${changeSet.operation}`),
                      target: activeReviewItem?.target ?? t('unknownTarget'),
                      selected: (activeItemIndex ?? 0) + 1,
                      items: changeSet.itemCount,
                      fields: activeReviewItem?.fields.length ?? 0,
                    })}
              </p>
              {visibleMeaningUnits.length > 0 ? (
                <div className="grid gap-1.5">
                  {visibleMeaningUnits.map((unit, index) => (
                    <div key={unit.id} data-testid={`task-review-meaning-unit-${index}`} className="grid gap-0.5">
                      <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">{unit.label}</span>
                      <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
                        {unit.displayText}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <p data-testid="task-review-coverage" className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                {t('taskReview.incomplete', { inspected: visibleMeaningUnits.length, total: meaningUnits.length, omitted: omittedMeaningUnits })}
              </p>
              {changeSet.itemCount > 1 ? (
                <p data-testid="task-review-batch-remaining" className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {t('taskReview.batchRemaining', { count: changeSet.itemCount - 1 })}
                </p>
              ) : null}
            </div>
          ) : reviewDepth === 'compare' && taskReview?.status === 'ready' ? (
            <div data-testid="task-review-compare" className="grid gap-2">
              <p className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                {t('taskReview.comparisonCoverage', {
                  inspected: taskReview.coverage.inspected,
                  total: taskReview.coverage.total,
                  omitted: taskReview.coverage.omitted,
                })}
              </p>
              {taskReview.items.map((item) => (
                <div key={item.id} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">{item.field}</span>
                    <span className="text-caption text-[color:var(--color-text-quaternary)]">{t(`taskReview.delta.${item.kind}`)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
                    <span className="mr-1.5 text-caption text-[color:var(--color-text-quaternary)]">{t('taskReview.before')}</span>
                    {item.before.present ? formatReviewValue(item.before.value) : t('taskReview.absent')}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
                    <span className="mr-1.5 text-caption text-[color:var(--color-text-quaternary)]">{t('taskReview.after')}</span>
                    {item.after.present ? formatReviewValue(item.after.value) : t('taskReview.absent')}
                  </p>
                </div>
              ))}
            </div>
          ) : reviewDepth === 'compare' ? (
            <div data-testid="task-review-compare" className="grid gap-2">
              <p className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                {t('taskReview.beforeUnavailable')}
              </p>
              {taskReview?.status === 'unavailable' && taskReview.reasons.length > 0 ? (
                <ul className="grid gap-1 text-caption leading-caption text-[color:var(--color-text-tertiary)]">
                  {taskReview.reasons.map((reason) => <li key={reason}>{t(`taskReview.reason.${reason}`)}</li>)}
                </ul>
              ) : null}
              {visibleMeaningUnits.map((unit) => (
                <div key={unit.id} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2 first:border-t-0 first:pt-0">
                  <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">{unit.label}</span>
                  <p className="text-caption text-[color:var(--color-text-quaternary)]">{t('taskReview.beforeUnknown')}</p>
                  <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
                    <span className="mr-1.5 text-caption text-[color:var(--color-text-quaternary)]">{t('taskReview.after')}</span>
                    {unit.displayText}
                  </p>
                </div>
              ))}
              <p className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                {t('taskReview.incomplete', { inspected: visibleMeaningUnits.length, total: meaningUnits.length, omitted: omittedMeaningUnits })}
              </p>
            </div>
          ) : (
            <div data-testid="task-review-details" className="grid gap-3">
              <OntologyChangeReview
                changeSet={changeSet}
                activeItemIndex={activeItemIndex}
                onActiveItemChange={onActiveItemChange}
                onFullScopeAvailableChange={handleFullScopeAvailable}
                valueBasis={taskReview?.status === 'ready' ? 'request-raw' : 'after-only'}
              />
              {taskReview?.status === 'ready' ? (
                <div className="grid gap-2 border-t border-[color:var(--color-divider)] pt-2">
                  {taskReview.canonicalPreview !== undefined ? taskReview.canonicalPreview !== null ? (
                    <div className="space-y-2">
                      <p className="text-caption font-[var(--font-weight-emphasis)]">{t('taskReview.canonicalPreview')}</p>
                      <p className="text-caption text-[color:var(--color-text-secondary)]">{t('taskReview.canonicalPreviewNote')}</p>
                      <pre className="atlas-scroll-quiet max-h-64 overflow-auto whitespace-pre-wrap break-words text-caption">{taskReview.canonicalPreview}</pre>
                    </div>
                  ) : <p role="status" className="text-caption">{t(taskReview.previewUnavailableReason === 'no_semantic_delta' ? 'taskReview.noSemanticDelta' : 'taskReview.previewUnavailable')}</p> : null}
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
                  {taskReview.decisionSaveStatus ? <p role="status" className="text-caption text-[color:var(--color-text-secondary)]">{t(`taskReview.decisionSave.${taskReview.decisionSaveStatus}`)}</p> : null}
                </div>
              ) : null}
              <details className="border-t border-[color:var(--color-divider)] pt-2 text-caption text-[color:var(--color-text-quaternary)]">
                <summary>{t('taskReview.provenance')}</summary>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 font-mono">
                  <dt>{t('taskReview.requestId')}</dt><dd data-request-id-type={typeof request.requestId}>{String(request.requestId ?? t('taskReview.unknown'))}</dd>
                  <dt>{t('taskReview.userEvent')}</dt><dd>{taskOrigin.userEventId}</dd>
                  <dt>{t('taskReview.toolCall')}</dt><dd>{request.toolCallId ?? t('taskReview.unknown')}</dd>
                  <dt>{t('taskReview.generation')}</dt><dd>{taskOrigin.sessionGeneration}</dd>
                  {taskReview ? <><dt>{t('taskReview.guardStatus')}</dt><dd>{t(`taskReview.guard.${taskReview.guardStatus}`)}</dd></> : null}
                  {proposalGuards.map((guard) => (
                    <Fragment key={guard.key}><dt>{guard.key}</dt><dd>{formatReviewValue(guard.value)}</dd></Fragment>
                  ))}
                </dl>
              </details>
            </div>
          )}

          {taskReview?.executionBlocked ? (
            <p data-testid="task-review-root-mismatch" className="break-words rounded-chip border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-2.5 py-2 text-label leading-prose text-[color:var(--color-danger-text)]">
              {t('taskReview.rootMismatch', {
                actual: taskReview.actualReportedRoot ?? t('taskReview.unknown'),
                expected: vaultPath ?? t('taskReview.unknown'),
              })}
            </p>
          ) : null}
        </section>
      ) : changeSet ? (
        <OntologyChangeReview changeSet={changeSet} activeItemIndex={activeItemIndex} onActiveItemChange={onActiveItemChange} />
      ) : askedSentence ? (
        /*
         * ⚠️ **Never say "unknown" twice** (owner's screen, 2026-08-24). The card used to print
         * 「the tool did not say what it wants to do」 here **and** 「cannot tell what it wants to
         * do」 below it, because a server elicitation carries `kind: "other"` (→ unknown) and no
         * title. Two lines, two inks, no information — the shape that reads as generated filler.
         *
         * When the question itself arrived, it is the whole line, at reading size: this is the
         * decision material, not a caption under it.
         */
        <p
          data-testid="acp-permission-ask"
          className="break-keep text-body leading-prose text-[color:var(--color-text-primary)]"
        >
          {askedSentence}
        </p>
      ) : (
        <p
          data-testid="acp-permission-intent"
          data-intent={intent}
          className="break-keep text-label leading-label text-[color:var(--color-text-primary)]"
        >
          {t(`intent.${intent}`)}
        </p>
      )}

      {/* The path is the basis for the judgement, so it is not truncated. `break-all`
          keeps a long path from leaving the pane, and mono here is not decoration but
          the channel carrying «this is a file path». */}
      {!ontologyWrite && request.filePath ? (
        <p
          data-testid="acp-permission-path"
          className="break-all rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-secondary)]"
        >
          {request.filePath}
        </p>
      ) : ontologyWrite || askedSentence ? null : (
        /*
         * The question already stands above when the server asked one; repeating it here is the
         * duplicate line this card was criticised for. When there is neither a path nor a question,
         * this takes the path's own slot — same box, same weight — rather than floating between the
         * body and the buttons as a third unattached sentence.
         */
        <p className="break-keep rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
          {request.title ?? t('unknownTarget')}
        </p>
      )}

      {/*
       * The verdict before the decision. The brief once claimed a failing page "will be
       * rejected" and nothing rejected it; the codes showed up in the Wiki list after the
       * page had landed. Here they show before Allow, on the same card, so the person
       * decides with them in view. A fitting page says so in one quiet line; a failing one
       * lists its codes, first message included, and leaves both buttons where they are —
       * the gate is the person, not the validator.
       */}
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
              <p className="break-keep">{t('pageFails', { count: writeVerdict.problems.length })}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {writeVerdict.problems.slice(0, 4).map((problem, index) => (
                  <li key={`${problem.code}-${problem.line ?? index}`} className="flex min-w-0 gap-2">
                    <code className="flex-none font-mono text-[color:var(--color-text-primary)]">
                      {problem.code}
                      {problem.line ? `:${problem.line}` : ''}
                    </code>
                    {index === 0 ? <span className="min-w-0 break-keep">{problem.message}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
      {changeSet && taskOrigin ? (
        <details data-testid="task-review-action-scope" className="border-t border-[color:var(--color-divider)] pt-2 text-caption text-[color:var(--color-text-quaternary)]">
          <summary className="list-none rounded-chip font-[var(--font-weight-emphasis)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]">
            {t('taskReview.actionScope')}
          </summary>
          <div className="mt-1 grid gap-1 leading-caption">
            <p>{t(taskReview?.status === 'ready' ? 'ontologyWriteBody' : 'ontologyWriteUnverifiedBody')}</p>
            <p>{t('taskReview.interventionHint')}</p>
            <p>{t('taskReview.permissionSeparate')}</p>
          </div>
        </details>
      ) : null}
      </div>

      {changeSet && taskOrigin ? (
        <div data-testid="task-review-authority" className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 border-t border-[color:var(--color-divider)] pt-2">
            {(['meaning', 'code', 'merge', 'deployment'] as const).map((authority) => (
            <div key={authority} data-testid={`task-review-authority-${authority}`} className="flex items-center justify-between gap-2 text-caption">
              <span className="text-[color:var(--color-text-tertiary)]">{t(`taskReview.authority.${authority}`)}</span>
              <span className="text-[color:var(--color-text-quaternary)]">
                {t(`taskReview.authority.${authority === 'meaning' ? meaningAuthority : 'unknown'}`)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {changeSet && taskOrigin ? (
        <div className="grid shrink-0 gap-1 border-t border-[color:var(--color-divider)] pt-2">
          <p className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">{t('taskReview.allowScope')}</p>
          <div className="grid grid-cols-2 gap-2">
            {onRequestCorrection ? (
              <Button className="atlas-touch-floor" variant="outline" size="sm" data-testid="task-review-correct" onClick={onRequestCorrection}>
                {t('taskReview.correct')}
              </Button>
            ) : null}
            {onDefer ? (
              <Button className="atlas-touch-floor" variant="ghost" size="sm" data-testid="task-review-defer" onClick={onDefer}>
                {t('taskReview.defer')}
              </Button>
            ) : null}
            <Button ref={rejectRef} className="atlas-touch-floor" variant="ghost" size="sm" data-testid="acp-permission-reject" onClick={() => resolve(rejectOnce?.optionId ?? null)}>{t('reject')}</Button>
            <Button className="atlas-touch-floor" variant="outline" size="sm" data-testid="acp-permission-allow" disabled={!allowOnce || acceptingMeaning || taskReview?.status === 'loading' || taskReview?.executionBlocked} onClick={() => resolve(allowOnce?.optionId ?? null)}>{t('allowOnce')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button ref={rejectRef} className="atlas-touch-floor" variant="ghost" data-testid="acp-permission-reject" onClick={() => resolve(rejectOnce?.optionId ?? null)}>{t('reject')}</Button>
          <Button className="atlas-touch-floor" variant="primary" data-testid="acp-permission-allow" disabled={!allowOnce || acceptingMeaning || taskReview?.status === 'loading' || taskReview?.executionBlocked} onClick={() => resolve(allowOnce?.optionId ?? null)}>{t('allowOnce')}</Button>
        </div>
      )}

      {/*
        ⚠️ **One block, and the control looks like one** (owner, 2026-08-25). This used to be two
        right-aligned strips stacked under the buttons: a real action rendered as a caption, and a
        separate sentence about its scope. They read as trailing debris, and the action was easy to
        mistake for a label — which is exactly what happened while driving the app.
        The action keeps its quiet weight (it is the wider grant, not the recommended one) but sits
        with the sentence that qualifies it, separated from the primary row by a rule.
      */}
      {allowAlways && !ontologyWrite ? (
        <div className="grid shrink-0 gap-1 border-t border-[color:var(--color-border-soft)] pt-2.5">
          <button
            type="button"
            data-testid="acp-permission-allow-always"
            onClick={() => resolve(allowAlways.optionId)}
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
            className="break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]"
          >
            {scope.kind === 'unknown'
              ? t('scopeUnknownHint')
              : t('scopeHint', { names: scope.names.join(' · ') })}
          </p>
        </div>
      ) : null}
    </section>
  );
}

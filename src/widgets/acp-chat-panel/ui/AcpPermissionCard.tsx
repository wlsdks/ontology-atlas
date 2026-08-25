'use client';

import { useEffect, useRef } from 'react';
import { Eye, GitCompareArrows, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { permissionIntent } from '@/features/acp-session/model/permission-intent';
import { permissionScope } from '@/features/acp-session/model/permission-scope';
import { permissionLocality } from '@/features/acp-session/model/permission-locality';
import { OntologyChangeReview } from '@/features/ontology-change-review';
import {
  buildOntologyChangeSet,
  type OntologyChangeSet,
} from '@/entities/knowledge-graph';

import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { PendingPermission } from '@/features/acp-session/model/use-acp-session';

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
}: {
  pending: PendingPermission;
  /** The open vault, so the card can tell the person's own project from somewhere else entirely. */
  vaultPath?: string | null;
  /** The computed value comes along so the panel and the map read the same typed change. */
  changeSet?: OntologyChangeSet | null;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
}) {
  const t = useTranslations('acpChat.permission');
  const { request, resolve } = pending;
  const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
  const changeSet = providedChangeSet === undefined
    ? ontologyWrite
      ? buildOntologyChangeSet(request.toolName!, request.rawInput)
      : null
    : providedChangeSet;
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
  useEffect(() => {
    rejectRef.current?.focus();
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
      className={
        ontologyWrite
          ? 'grid gap-3 rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] p-[var(--card-pad)]'
          : locality === 'inside-project'
            ? 'grid gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]'
            : 'grid gap-3 rounded-panel border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] p-[var(--card-pad)]'
      }
    >
      <div className="flex items-start gap-2.5">
        {ontologyWrite ? (
          <GitCompareArrows
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
          />
        ) : locality === 'inside-project' ? (
          // Inside the person's own project the mark is a neutral eye, not an alarm shield.
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
            {t(
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
                    locality === 'inside-project'
                    ? 'insideProjectTitle'
                    : 'title',
            )}
          </p>
          <p
            id="acp-permission-body"
            className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            {t(
              ontologyWrite
                ? 'ontologyWriteBody'
                : serverConsent
                  ? 'consentBody'
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
      {changeSet ? (
        <OntologyChangeReview
          changeSet={changeSet}
          activeItemIndex={activeItemIndex}
          onActiveItemChange={onActiveItemChange}
        />
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          ref={rejectRef}
          variant="ghost"
          data-testid="acp-permission-reject"
          onClick={() => resolve(rejectOnce?.optionId ?? null)}
        >
          {t('reject')}
        </Button>
        <Button
          variant="primary"
          data-testid="acp-permission-allow"
          disabled={!allowOnce}
          onClick={() => resolve(allowOnce?.optionId ?? null)}
        >
          {t('allowOnce')}
        </Button>
      </div>

      {/*
        ⚠️ **One block, and the control looks like one** (owner, 2026-08-25). This used to be two
        right-aligned strips stacked under the buttons: a real action rendered as a caption, and a
        separate sentence about its scope. They read as trailing debris, and the action was easy to
        mistake for a label — which is exactly what happened while driving the app.
        The action keeps its quiet weight (it is the wider grant, not the recommended one) but sits
        with the sentence that qualifies it, separated from the primary row by a rule.
      */}
      {allowAlways && !ontologyWrite ? (
        <div className="grid gap-1 border-t border-[color:var(--color-border-soft)] pt-2.5">
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

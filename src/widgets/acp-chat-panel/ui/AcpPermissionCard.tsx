'use client';

import { useEffect, useRef } from 'react';
import { GitCompareArrows, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { permissionIntent } from '@/features/acp-session/model/permission-intent';
import { permissionScope } from '@/features/acp-session/model/permission-scope';
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
 * The 「이거 해도 될까요」 (may I do this?) card — it appears only when something
 * outside the vault is about to be touched.
 *
 * ## The agent is stopped while this card is up
 *
 * That is what a permission checkpoint is. So this card has **no close X** — if it
 * could be dismissed without answering it would be a notification, not a checkpoint.
 * There is an explicit 「안 할래요」 (don't) instead.
 *
 * ## What it shows
 *
 * **The full path.** 「파일을 고치려 합니다」 (it wants to edit a file) alone is not
 * something you can judge — *where* it wants to edit is precisely the basis for this
 * decision. So the path is not truncated, and a long one wraps so all of it shows.
 *
 * ## 「항상 허용」 (always allow) is not given prominence
 *
 * Measured, that option carries a rule allowing **that entire directory for the whole
 * session**. One click widening the boundary wholesale means that, at the same weight
 * as the other two, people pick the easiest one. So it drops to a text button and
 * says what it means.
 */
export function AcpPermissionCard({
  pending,
  changeSet: providedChangeSet,
}: {
  pending: PendingPermission;
  /** The computed value comes along so the panel and the map read the same typed change. */
  changeSet?: OntologyChangeSet | null;
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
  /*
    What 「계속 허용」 (keep allowing) actually allows (2026-08-17).

    The old copy **asserted** *"위 경로가 있는 폴더 전체"* (the whole folder containing
    the path above), but the adapter decides that scope, not us — and measured, the
    value was not a folder but a **tool**. Writing that a folder is allowed while a
    tool is allowed leaves the user believing they granted a permission they never
    did, or the reverse.

    So **only what the adapter declared** is stated, and with nothing given, nothing
    is asserted.
  */
  const scope = permissionScope(request.options);

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
      className={ontologyWrite
        ? 'grid gap-3 rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] p-[var(--card-pad)]'
        : 'grid gap-3 rounded-panel border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] p-[var(--card-pad)]'}
    >
      <div className="flex items-start gap-2.5">
        {ontologyWrite ? (
          <GitCompareArrows
            size={ICON_SIZE.md}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
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
            {t(ontologyWrite ? 'ontologyWriteTitle' : 'title')}
          </p>
          <p
            id="acp-permission-body"
            className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            {t(ontologyWrite ? 'ontologyWriteBody' : 'body')}
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
        <OntologyChangeReview changeSet={changeSet} />
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
      ) : !ontologyWrite ? (
        <p className="break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {request.title ?? t('unknownTarget')}
        </p>
      ) : null}

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

      {allowAlways && !ontologyWrite ? (
        <button
          type="button"
          data-testid="acp-permission-allow-always"
          onClick={() => resolve(allowAlways.optionId)}
          className={controlClass({
            shape: 'link',
            size: 'md',
            tone: 'muted',
            hoverInk: 'secondary',
            className: 'justify-self-end',
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
      ) : null}
      {allowAlways && !ontologyWrite ? (
        <p
          data-testid="acp-permission-scope"
          data-scope={scope.kind}
          className="justify-self-end break-all text-right text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {scope.kind === 'unknown'
            ? t('scopeUnknownHint')
            : t('scopeHint', { names: scope.names.join(' · ') })}
        </p>
      ) : null}
    </section>
  );
}

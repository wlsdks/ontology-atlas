'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';

import { Dialog } from '@/shared/ui/dialog';
import { controlClass } from '@/shared/ui/control-class';

import type { useBuildFromCode } from '../model/use-build-from-code';

/**
 * Where the person is shown the folder that is about to be created, and says yes.
 *
 * ⚠️ **Why this is a dialog and not a block in the INDEX panel** (owner, 2026-08-25: *"I don't like
 * this itself… the design too"*, and then *"delete that from the code"*).
 *
 * It first shipped inside the panel, under the button that opens it. That column is ~240px wide, and
 * the step needs a warning line, an explanation, an absolute path and two controls. Everything
 * fought for the width: the path wrapped mid-token, then hid its own beginning; the primary button's label broke
 * across two lines; and the bordered block under a bordered button inside the bordered panel made
 * three rectangles of equal weight — the "floating-box soup" the canonical Don'ts name outright.
 *
 * The content did not need shrinking; it needed room. A confirmation is a blocking moment by
 * definition — it must be answered before anything happens — and the design system already says a
 * blocking surface dims the rest rather than competing inside it. So it takes the same centred
 * modal the rest of the product uses, which owns focus, Escape and the scrim.
 *
 * The consent contract is unchanged: nothing is created until the button here is pressed, and the
 * exact path is on screen before it.
 */
export function BuildFromCodeConfirmDialog({
  build,
}: {
  build: ReturnType<typeof useBuildFromCode>;
}) {
  const t = useTranslations('firstRunStarter');
  const location = build.location;
  const creating = build.stage === 'creating';

  return (
    <Dialog
      open={location !== null}
      onClose={build.reset}
      labelledBy="build-from-code-confirm-title"
      testId="build-from-code-confirm"
      size="md"
    >
      <p
        id="build-from-code-confirm-title"
        className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {build.reusesExisting ? t('buildFromCodeReuse') : t('buildFromCodeWillCreate')}
      </p>
      {/*
        ⚠️ Title asks, body reassures (owner, 2026-08-25: *"the wording here is a bit odd"*). The
        title used to be two narrating sentences set in bold — a body paragraph doing a heading's
        job — and it repeated its own opening words in the button beneath it. A confirmation's title states the
        decision; what is safe about it belongs in the line below.
      */}
      <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {build.reusesExisting ? t('buildFromCodeSafetyReuse') : t('buildFromCodeSafety')}
      </p>

      {/*
        Naming the correction rather than silently applying it. Stepping up a level without saying so
        would show a path the person did not choose.
      */}
      {build.pickedMapFolder ? (
        <p
          data-testid="build-from-code-stepped-up"
          className="mt-1 text-label leading-label text-[color:var(--color-status-warning)]"
        >
          {t('buildFromCodeSteppedUp')}
        </p>
      ) : null}

      {/*
        ⚠️ A path wraps **only at its separators**. `break-all` split `…/atlas` mid-token and
        `dir="rtl"` hid the beginning — both made the one string the person is asked to check
        unreadable. `<wbr>` after each separator gives the only break opportunities true to the path.
        At this width it usually needs none at all.
      */}
      <code
        data-testid="build-from-code-path"
        className="mt-3 block rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
      >
        {(location?.displayPath ?? '').split('/').map((segment, index) => (
          <Fragment key={`${index}-${segment}`}>
            {index === 0 ? segment : `/${segment}`}
            <wbr />
          </Fragment>
        ))}
      </code>

      {build.errorText !== null ? (
        <p
          data-testid="build-from-code-error"
          className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]"
        >
          {build.errorText || t('buildFromCodeFailed')}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="build-from-code-cancel"
          disabled={creating}
          onClick={build.reset}
          /*
           * ⚠️ Height, padding and type come from the `size` axis, never from `className`. Writing
           * `h-8 px-3 text-body` by hand bypassed the axis system and then fought the compound
           * variant that already sets `min-h-9 px-3 py-1.5 text-body` for a card at this size —
           * which is what "composed it oddly" looked like on screen.
           */
          className={controlClass({
            shape: 'card',
            size: 'md',
            hoverBorder: 'strong',
            hoverInk: 'strong',
            className: 'justify-center whitespace-nowrap',
          })}
        >
          {t('buildFromCodeCancel')}
        </button>
        <button
          type="button"
          data-testid="build-from-code-go"
          disabled={creating}
          onClick={() => {
            void build.confirm();
          }}
          className={controlClass({
            shape: 'card',
            size: 'md',
            tone: 'accent',
            hoverBorder: 'strong',
            hoverInk: 'strong',
            className:
              'justify-center whitespace-nowrap border-[color:var(--color-indigo-line-a45)]',
          })}
        >
          {creating
            ? t('buildFromCodeCreating')
            : build.reusesExisting
              ? t('buildFromCodeReuseGo')
              : t('buildFromCodeCreateGo')}
        </button>
      </div>
    </Dialog>
  );
}

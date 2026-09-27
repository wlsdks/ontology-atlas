'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';

import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { Dialog } from '@/shared/ui/dialog';
import { controlClass } from '@/shared/ui/control-class';

import type { useBuildFromCode } from '../model/use-build-from-code';

/**
 * Shows the folder about to be created and asks for a yes. A centred modal, because the path,
 * warning and two controls do not fit the ~240px INDEX column and a confirmation blocks by
 * definition. Nothing is created until the button is pressed, with the exact path on screen.
 */
export function BuildFromCodeConfirmDialog({
  build,
}: {
  build: ReturnType<typeof useBuildFromCode>;
}) {
  const t = useTranslations('firstRunStarter');
  const failureSentence = useFailureSentence();
  const location = build.location;
  const creating = build.stage === 'creating';
  // The sentence is the reader's; the code stays on `data-failure-detail` for developers.
  const failure =
    build.errorText !== null ? failureSentence(build.errorText, t('buildFromCodeFailed')) : null;

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
       * The title states the decision; what is safe about it belongs in the line below.
       */}
      <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {build.reusesExisting ? t('buildFromCodeSafetyReuse') : t('buildFromCodeSafety')}
      </p>

      {/*
       * Names the correction, or the screen would show a path the person did not choose.
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
       * `<wbr>` after each separator: the path wraps only there, because `break-all` split
       * tokens and `dir="rtl"` hid its beginning.
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

      {failure !== null ? (
        <p
          data-testid="build-from-code-error"
          data-failure-detail={failure.detail ?? undefined}
          className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]"
        >
          {failure.sentence}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="build-from-code-cancel"
          disabled={creating}
          onClick={build.reset}
          /*
           * Height, padding and type come from the `size` axis; hand-written classes fight the
           * compound variant.
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

'use client';

import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { controlClass } from '@/shared/ui/control-class';

import { BuildFromCodeConfirmDialog } from './BuildFromCodeConfirmDialog';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { useBuildFromCode } from '../model/use-build-from-code';

/**
 * The 「make a map from my code」 door. It follows "has not built a map yet", not the first-run
 * card's "never opened a folder": repeated opening is struggling, not being finished. `card` is
 * the full-width first-run action; `row` is the quiet line above an INDEX that has a vault but
 * no map, smaller so it does not out-shout the person's data.
 */
export interface BuildFromCodeDoorProps {
  build: ReturnType<typeof useBuildFromCode>;
  variant: 'card' | 'row';
  disabled?: boolean;
}

export function BuildFromCodeDoor({ build, variant, disabled = false }: BuildFromCodeDoorProps) {
  const t = useTranslations('firstRunStarter');
  const failureSentence = useFailureSentence();
  const busy = build.stage === 'choosing' || build.stage === 'creating';
  /*
   * `build.errorText` is a failure code (`failureCodeOf(err) ?? ''`), never a sentence, so it is
   * looked up rather than rendered raw.
   */
  const failure =
    build.errorText !== null ? failureSentence(build.errorText, t('buildFromCodeFailed')) : null;

  return (
    <>
      <button
        type="button"
        data-testid={variant === 'card' ? 'first-run-build-from-code' : 'index-build-from-code'}
        disabled={disabled || busy}
        onClick={() => {
          void build.chooseProject();
        }}
        /*
         * Hover comes from the axes; the adoption ratchet counts hand-written `hover:` literals.
         */
        /*
         * The variants differ by the `size` axis; hand-written heights fight the compound variants.
         */
        className={controlClass({
          shape: 'card',
          scope: 'panel',
          size: variant === 'card' ? 'md' : 'sm',
          hoverBorder: 'strong',
          hoverInk: 'strong',
          className: `touch-hit-expand w-full justify-center border-[color:var(--color-indigo-line-a35)] text-[color:var(--map-panel-text-secondary)]${
            variant === 'card' ? ' mt-2' : ''
          }`,
        })}
      >
        <Bot size={ICON_SIZE.sm} aria-hidden />
        {build.stage === 'choosing' ? t('buildFromCodeBusy') : t('buildFromCodeLabel')}
      </button>

      {/*
       * The path is shown before anything is written into the person's source tree
       * (`local-first.md`), in a face they can compare against a shell.
       */}
      {/*
       * The path and the confirm live in `BuildFromCodeConfirmDialog`, not this narrow column.
       */}
      <BuildFromCodeConfirmDialog build={build} />

      {build.location === null && failure !== null ? (
        /*
         * A failure before a project is chosen has no dialog to live in, so it is said here.
         * `data-failure-detail` carries the machine half.
         */
        <p
          data-testid={variant === 'card' ? 'first-run-build-error' : 'index-build-error'}
          data-failure-detail={failure.detail ?? undefined}
          className="mt-1 break-keep text-caption leading-caption text-[color:var(--color-danger-text)]"
        >
          {failure.sentence}
        </p>
      ) : variant === 'card' ? (
        /* Says what will happen, including that it asks before writing. */
        <p className="mt-1 break-keep text-caption leading-caption text-[color:var(--map-panel-text-quaternary)]">
          {t('buildFromCodeHint')}
        </p>
      ) : null}
    </>
  );
}

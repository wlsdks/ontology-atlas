'use client';

import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { useBuildFromCode } from '../model/use-build-from-code';

/**
 * The 「make a map from my code」 door, and the step that shows where the folder will go.
 *
 * ⚠️ **Why this is a component and not markup inside the card** (owner correction, 2026-08-24).
 * The door first shipped inside the first-run card, whose visibility is `sampleModeSettled` — and
 * that is gated on `recentVaults.length === 0`, "this computer has never opened a folder". The owner
 * named the mistake exactly: *"shouldn't it be person B who has opened folders many times and still
 * hasn't made one?"* Someone who opened a folder, saw an empty map, and gave up has opened folders
 * **more** than a first-timer, and the old rule hid this door from precisely the person it was built
 * for. Repeated opening is evidence of struggling, not of being finished.
 *
 * "Never connected" is still the right rule for *browsing guidance* — the sample switch and the
 * tour teach someone who has not looked around yet, and pushing that at a returning person is
 * noise. It is the wrong rule for *unfinished work*. So the two conditions separate here: the card
 * keeps its rule, and this door follows "hasn't built one yet" wherever that person is.
 *
 * `variant` carries that split. `card` is the full-width action inside first run; `row` is the quiet
 * line above the INDEX for someone who already has a vault and no map in it — deliberately smaller,
 * because it sits beside their own data and must not out-shout it.
 */
export interface BuildFromCodeDoorProps {
  build: ReturnType<typeof useBuildFromCode>;
  variant: 'card' | 'row';
  disabled?: boolean;
}

export function BuildFromCodeDoor({ build, variant, disabled = false }: BuildFromCodeDoorProps) {
  const t = useTranslations('firstRunStarter');
  const busy = build.stage === 'choosing' || build.stage === 'creating';

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
         * Hover comes from the axes, not from hand-written `hover:` literals. The adoption ratchet
         * counts those and its whole point is that they may fall and never rise.
         */
        className={controlClass({
          shape: 'card',
          scope: 'panel',
          hoverBorder: 'strong',
          hoverInk: 'strong',
          className:
            variant === 'card'
              ? 'touch-hit-expand mt-2 inline-flex h-8 w-full justify-center gap-1.5 border-[color:var(--color-indigo-line-a35)] text-body text-[color:var(--topology-v2-panel-text-secondary)]'
              : 'touch-hit-expand inline-flex h-7 w-full justify-center gap-1.5 border-[color:var(--color-indigo-line-a35)] text-caption text-[color:var(--topology-v2-panel-text-secondary)]',
        })}
      >
        <Bot size={ICON_SIZE.sm} aria-hidden />
        {build.stage === 'choosing' ? t('buildFromCodeBusy') : t('buildFromCodeLabel')}
      </button>

      {/*
        ⚠️ **The path is shown before anything is written** (owner direction, 2026-08-24). The map
        now lands inside the chosen project, so this press ends in a folder written into somebody's
        source tree. `local-first.md` allows nothing about their disk to happen silently, and a path
        a person never saw is not a path they agreed to — so the exact location is on screen, in a
        face they can compare against a shell, before the button that creates it.
      */}
      {build.location ? (
        <div
          data-testid={variant === 'card' ? 'first-run-build-confirm' : 'index-build-confirm'}
          className="mt-2 rounded-[var(--radius-card)] border border-[color:var(--color-indigo-line-a35)] bg-[color:var(--topology-v2-panel-surface)] p-2"
        >
          <p className="break-keep text-caption leading-caption text-[color:var(--topology-v2-panel-text-secondary)]">
            {build.reusesExisting ? t('buildFromCodeReuse') : t('buildFromCodeWillCreate')}
          </p>
          <code
            data-testid={variant === 'card' ? 'first-run-build-path' : 'index-build-path'}
            className="mt-1 block break-all font-mono text-caption leading-caption text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {build.location.displayPath}
          </code>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              data-testid={
                variant === 'card' ? 'first-run-build-confirm-go' : 'index-build-confirm-go'
              }
              disabled={build.stage === 'creating'}
              onClick={() => {
                void build.confirm();
              }}
              className={controlClass({
                shape: 'card',
                scope: 'panel',
                tone: 'accent',
                hoverBorder: 'strong',
                hoverInk: 'strong',
                className:
                  'touch-hit-expand inline-flex h-7 flex-1 items-center justify-center text-caption',
              })}
            >
              {build.stage === 'creating'
                ? t('buildFromCodeCreating')
                : build.reusesExisting
                  ? t('buildFromCodeReuseGo')
                  : t('buildFromCodeCreateGo')}
            </button>
            <button
              type="button"
              data-testid={
                variant === 'card' ? 'first-run-build-confirm-cancel' : 'index-build-confirm-cancel'
              }
              disabled={build.stage === 'creating'}
              onClick={build.reset}
              className={controlClass({
                shape: 'card',
                scope: 'panel',
                hoverBorder: 'strong',
                hoverInk: 'strong',
                className:
                  'touch-hit-expand inline-flex h-7 items-center justify-center px-2 text-caption text-[color:var(--topology-v2-panel-text-tertiary)]',
              })}
            >
              {t('buildFromCodeCancel')}
            </button>
          </div>
          {build.errorText !== null ? (
            <p
              data-testid={variant === 'card' ? 'first-run-build-error' : 'index-build-error'}
              className="mt-1.5 break-keep text-caption leading-caption text-[color:var(--color-danger-text)]"
            >
              {build.errorText || t('buildFromCodeFailed')}
            </p>
          ) : null}
        </div>
      ) : build.errorText !== null ? (
        /*
         * ⚠️ A failure before a project is chosen has no confirm box to live in, and the error used
         * to be written into state that nothing rendered — so a picker that threw left the person
         * pressing a button that did nothing, twice. It gets its own line here.
         */
        <p
          data-testid={variant === 'card' ? 'first-run-build-error' : 'index-build-error'}
          className="mt-1 break-keep text-caption leading-caption text-[color:var(--color-danger-text)]"
        >
          {build.errorText || t('buildFromCodeFailed')}
        </p>
      ) : variant === 'card' ? (
        /* What will actually happen, before it happens — including that it asks before writing. */
        <p className="mt-1 break-keep text-caption leading-caption text-[color:var(--topology-v2-panel-text-quaternary)]">
          {t('buildFromCodeHint')}
        </p>
      ) : null}
    </>
  );
}

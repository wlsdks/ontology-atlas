'use client';

import { Fragment } from 'react';

import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';

import { BuildFromCodeConfirmDialog } from './BuildFromCodeConfirmDialog';
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
        /*
         * ⚠️ The two variants differ by the `size` **axis**, not by hand-written heights and type.
         * Writing `h-8 … text-body` / `h-7 … text-caption` in `className` bypassed the axis system
         * and fought the compound variants that already set height, padding, gap and type for a card
         * at each size — which is what composing it oddly looked like on screen.
         */
        className={controlClass({
          shape: 'card',
          scope: 'panel',
          size: variant === 'card' ? 'md' : 'sm',
          hoverBorder: 'strong',
          hoverInk: 'strong',
          className: `touch-hit-expand w-full justify-center border-[color:var(--color-indigo-line-a35)] text-[color:var(--topology-v2-panel-text-secondary)]${
            variant === 'card' ? ' mt-2' : ''
          }`,
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
      {/*
        The path and the confirm live in a centred dialog, not here. Cramming a warning, an
        explanation, an absolute path and two controls into a ~240px column produced mid-token path
        wraps and two-line buttons, and stacked a bordered block under a bordered button inside a
        bordered panel — three rectangles of equal weight. See `BuildFromCodeConfirmDialog`.
      */}
      <BuildFromCodeConfirmDialog build={build} />

      {build.location === null && build.errorText !== null ? (
        /*
         * A failure before a project is chosen has no dialog to live in — the dialog opens on a
         * location, and there is none. Without this the button simply did nothing and the person
         * pressed it again.
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

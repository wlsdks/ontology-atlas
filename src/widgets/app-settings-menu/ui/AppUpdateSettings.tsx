'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import { readUpdateMemory, useAppUpdateContext } from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * 「App」 (app) — the version in use and **an update check you press yourself.**
 *
 * ## Why it was missing (owner report, 2026-08-20)
 *
 * Automatic checking and the bottom-right toast have existed since 2026-07-27. But
 * **there was no way for the user to press it** — `useAppUpdate` exposes
 * `check(manual)` and **0 places** in the whole repository called it, while
 * 「It's up to date」 (the `current` stage) **could not even be drawn**, because the toast
 * returned `null` for it. The design was complete and the wiring was not.
 *
 * The hole that left open: automatic checks run **once a day** and a dismissal is
 * remembered for that version. So anyone who pressed 「Later」 once had **no way to
 * reach an update at all** until the next version shipped.
 *
 * ## Why installation does not happen here
 *
 * Download, install and restart are already handled by the toast. Building the same
 * flow twice draws progress in two places and nobody knows which is real. This
 * pane's one job is **starting the check**, and the result always continues in the
 * same place (the toast).
 *
 * ## Not drawn on the web
 *
 * A browser tab cannot replace itself. Talking about updates there **offers
 * something we cannot do**, so there is not even a degradation card — the section
 * simply does not exist.
 */
export function AppUpdateSettings() {
  const t = useTranslations('nav.settingsMenu.appUpdate');
  const update = useAppUpdateContext();
  /*
   * `undefined` while the read is in flight, `null` when it failed, a string once known. A
   * label standing with no value reads as unfinished (2026-09-25), so each state says something.
   */
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  const [readAttempt, setReadAttempt] = useState(0);

  /*
   * The running version comes from **what the bundle knows**. A build constant would
   * state "what this source was when it was built" rather than "what I am running".
   */
  useEffect(() => {
    if (!isDesktopShell()) return;
    let alive = true;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (alive) setVersion(value);
      })
      .catch(() => {
        // No value is invented: the row says the read failed and that checking reads again.
        if (alive) setVersion(null);
      });
    return () => {
      alive = false;
    };
  }, [readAttempt]);

  /*
   * What the automatic check remembers, stated as facts (2026-09-25). The pane held one row and
   * left most of the fixed sheet blank; these are the two things a person here can not see
   * anywhere else — when the app last asked, and which build they put off. Re-read whenever the
   * phase moves, because a finished manual check writes a new time.
   */
  const format = useFormatter();
  const phaseKind = update?.phase.kind;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phase is the re-read signal, not an input
  const memory = useMemo(() => readUpdateMemory(), [phaseKind]);

  if (!isDesktopShell() || !update) return null;

  const phase = update.phase;
  const checking = phase.kind === 'checking';
  /*
   * **What it says** — only what was measured. Before a press there is no result
   * line. After `available`, the toast takes over, so this only announces the fact.
   */
  const outcome = (() => {
    switch (phase.kind) {
      case 'current':
        return t('resultCurrent');
      case 'available':
        return t('resultAvailable', { version: phase.version });
      case 'downloading':
        return t('resultDownloading', { version: phase.version });
      case 'ready':
        return t('resultReady', { version: phase.version });
      case 'failed':
        return phase.operation === 'check' ? t('resultFailed') : t('resultInstallFailed');
      default:
        return undefined;
    }
  })();

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-update">
      <SettingsGroup>
        <SettingsRow
          label={t('versionLabel')}
          caption={
            version
              ? t('versionValue', { version })
              : version === null
                ? t('versionUnknown')
                : t('versionReading')
          }
          captionTone={version === null ? 'warning' : 'neutral'}
          testId="app-settings-update-version"
          control={
            <Chip
              size="lg"
              tone="secondary"
              data-testid="app-settings-update-check"
              /*
               * `aria-disabled`, not `disabled`, while checking. A `disabled` button drops the
               * focus it holds, so pressing this sent the keyboard to `<body>` (inspection,
               * 2026-09-25). The press is ignored instead, and the result is announced by the
               * status line below.
               */
              aria-disabled={checking || undefined}
              onClick={() => {
                if (checking) return;
                if (version === null) {
                  setVersion(undefined);
                  setReadAttempt((attempt) => attempt + 1);
                }
                update.checkNow();
              }}
              className={DETAIL_TOGGLE_CHIP}
            >
              <RefreshCw size={ICON_SIZE.md} aria-hidden />
              {checking ? t('checking') : t('check')}
            </Chip>
          }
        />
        <SettingsRow
          label={t('autoLabel')}
          caption={[
            memory?.lastCheckedAt
              ? t('autoLast', {
                  when: format.dateTime(new Date(memory.lastCheckedAt), {
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }),
                })
              : t('autoNever'),
            memory?.dismissedVersion ? t('autoDismissed', { version: memory.dismissedVersion }) : null,
          ]
            .filter(Boolean)
            .join(' ')}
          testId="app-settings-update-auto"
          control={null}
        />
      </SettingsGroup>
      {/*
        The result line starts on the rows' text line - the group's 1px border plus the row's
        `px-3` - rather than 16px left of it, and a failure reads in the warning tone the version
        row already uses for its own failure (inspection, 2026-09-25: grey at x=517 against the
        rows' 533). The live region is always present, so the first result is announced too.
      */}
      <p
        data-testid="app-settings-update-result"
        data-phase={phase.kind}
        role="status"
        aria-live="polite"
        className={cn(
          'ml-px min-w-0 break-keep px-3 text-label leading-label empty:hidden',
          phase.kind === 'failed'
            ? 'text-[color:var(--color-status-warning)]'
            : 'text-[color:var(--color-text-tertiary)]',
        )}
      >
        {outcome ?? ''}
      </p>
    </div>
  );
}

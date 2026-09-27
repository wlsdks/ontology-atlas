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
 * The version in use and a manual update check, the only way back to a version whose
 * daily-check toast was dismissed. It only starts the check; download, install and restart
 * stay in the toast so progress is drawn in one place. Not drawn on the web, where a tab
 * cannot replace itself.
 */
export function AppUpdateSettings() {
  const t = useTranslations('nav.settingsMenu.appUpdate');
  const update = useAppUpdateContext();
  // `undefined` while reading, `null` on failure, a string once known; each state says something.
  const [version, setVersion] = useState<string | null | undefined>(undefined);
  const [readAttempt, setReadAttempt] = useState(0);

  // Read from the running bundle; a build constant would describe the source, not the running app.
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

  // What the automatic check remembers: when it last asked and which build was put off.
  // Re-read when the phase moves, because a finished manual check writes a new time.
  const format = useFormatter();
  const phaseKind = update?.phase.kind;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phase is the re-read signal, not an input
  const memory = useMemo(() => readUpdateMemory(), [phaseKind]);

  if (!isDesktopShell() || !update) return null;

  const phase = update.phase;
  const checking = phase.kind === 'checking';
  // No result line before a press; after `available` the toast takes over.
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
                ? readAttempt > 0
                  ? t('versionUnknownRetried')
                  : t('versionUnknown')
                : t('versionReading')
          }
          // One failure, one warning line: once the re-read was tried, the row states the fact
          // and the warning tone stays with the result line.
          captionTone={version === null && phase.kind !== 'failed' ? 'warning' : 'neutral'}
          testId="app-settings-update-version"
          control={
            <Chip
              size="lg"
              tone="secondary"
              data-testid="app-settings-update-check"
              // `aria-disabled`, not `disabled`, while checking: `disabled` drops focus to `<body>`.
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
        Aligned to the rows' text line (group border plus row `px-3`); always mounted so the
        live region announces the first result too.
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

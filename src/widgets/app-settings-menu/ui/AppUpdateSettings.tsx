'use client';

import { useMemo } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import {
  readUpdateMemory,
  useAppUpdateContext,
  useUpdateAutoCheck,
  writeUpdateAutoCheck,
} from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { useRunningVersion } from '../model/use-running-version';
import { DETAIL_TOGGLE_CHIP, SegmentSwitch, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * The running version, a manual check (the only way back to a version whose toast was
 * dismissed) and the automatic-check switch. Download, install and restart stay in the toast.
 * Not drawn on the web, where a tab cannot replace itself.
 */
export function AppUpdateSettings() {
  const t = useTranslations('settingsAbout');
  const update = useAppUpdateContext();
  const { version, retried, reread } = useRunningVersion();
  const autoCheck = useUpdateAutoCheck();

  const format = useFormatter();
  const phaseKind = update?.phase.kind;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the phase is the re-read signal, not an input
  const memory = useMemo(() => readUpdateMemory(), [phaseKind]);

  if (!isDesktopShell() || !update) return null;

  const phase = update.phase;
  const checking = phase.kind === 'checking';
  const outcome = (() => {
    switch (phase.kind) {
      case 'current':
        return t('appUpdate.resultCurrent');
      case 'available':
        return t('appUpdate.resultAvailable', { version: phase.version });
      case 'downloading':
        return t('appUpdate.resultDownloading', { version: phase.version });
      case 'ready':
        return t('appUpdate.resultReady', { version: phase.version });
      case 'failed':
        return phase.operation === 'check'
          ? t('appUpdate.resultFailed')
          : t('appUpdate.resultInstallFailed');
      default:
        return undefined;
    }
  })();

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-update">
      <SettingsGroup label={t('groups.app')}>
      <SettingsRow
        label={t('rows.version')}
        settingId="version"
        caption={
          version
            ? t('appUpdate.versionValue', { version })
            : version === null
              ? retried
                ? t('appUpdate.versionUnknownRetried')
                : t('appUpdate.versionUnknown')
              : t('appUpdate.versionReading')
        }
        captionTone={version === null && phase.kind !== 'failed' ? 'warning' : 'neutral'}
        testId="app-settings-update-version"
        control={
          <Chip
            size="lg"
            tone="secondary"
            data-testid="app-settings-update-check"
            data-setting-id="update-check"
            aria-disabled={checking || undefined}
            onClick={() => {
              if (checking) return;
              if (version === null) reread();
              update.checkNow();
            }}
            className={DETAIL_TOGGLE_CHIP}
          >
            <RefreshCw size={ICON_SIZE.md} aria-hidden />
            {checking ? t('appUpdate.checking') : t('rows.updateCheck')}
          </Chip>
        }
      />
      <SettingsRow
        label={t('rows.updateAuto')}
        settingId="update-auto"
        caption={[
          autoCheck === 'on' ? t('appUpdate.autoOn') : t('appUpdate.autoOff'),
          memory?.lastCheckedAt
            ? t('appUpdate.autoLast', {
                when: format.dateTime(new Date(memory.lastCheckedAt), {
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }),
              })
            : t('appUpdate.autoNever'),
          memory?.dismissedVersion
            ? t('appUpdate.autoDismissed', { version: memory.dismissedVersion })
            : null,
        ]
          .filter(Boolean)
          .join(' ')}
        testId="app-settings-update-auto"
        control={
          <SegmentSwitch
            ariaLabel={t('rows.updateAuto')}
            value={autoCheck === 'on'}
            options={[
              { value: true, label: t('on') },
              { value: false, label: t('off') },
            ]}
            onChange={(next) => writeUpdateAutoCheck(next ? 'on' : 'off')}
            testId="app-settings-update-auto-switch"
          />
        }
      />
      </SettingsGroup>
      <p
        data-testid="app-settings-update-result"
        data-phase={phase.kind}
        role="status"
        aria-live="polite"
        className={cn(
          'min-w-0 text-label leading-label empty:hidden',
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

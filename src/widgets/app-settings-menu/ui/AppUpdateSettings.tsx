'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import {
  useAppUpdateContext,
  useUpdateAutoCheck,
  writeUpdateAutoCheck,
} from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { useRunningVersion } from '../model/use-running-version';
import { DETAIL_TOGGLE_CHIP, SegmentSwitch, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * The running version, a manual check and the automatic-check switch. Download, install and
 * restart live in the notice; while the notice is put away, the result line names the pending
 * version and carries its one action. Not drawn on the web, where a tab cannot replace itself.
 */
export function AppUpdateSettings() {
  const t = useTranslations('settingsAbout');
  const update = useAppUpdateContext();
  const { version, retried, reread } = useRunningVersion();
  const autoCheck = useUpdateAutoCheck();

  const format = useFormatter();

  if (!isDesktopShell() || !update) return null;

  const phase = update.phase;
  const checking = phase.kind === 'checking';
  const { pendingVersion, readyVersion } = update;
  // The notice is put away: the line states the fact and carries the action the card would.
  const awayAction: { text: string; label: string; onClick: () => void } | null =
    phase.kind === 'downloading' && update.noticeHidden
      ? {
          text: t('appUpdate.resultDownloadingHidden', { version: phase.version }),
          label: t('appUpdate.actionShowNotice'),
          onClick: update.showNotice,
        }
      : phase.kind === 'idle' && pendingVersion
        ? pendingVersion === readyVersion
          ? {
              text: t('appUpdate.resultReadyHidden', { version: pendingVersion }),
              label: t('appUpdate.actionRestart'),
              onClick: update.restart,
            }
          : {
              text: t('appUpdate.resultAvailableHidden', { version: pendingVersion }),
              label: t('appUpdate.actionInstall'),
              onClick: update.install,
            }
        : null;
  const outcome = (() => {
    if (awayAction) return awayAction.text;
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
          update.lastCheckedAt
            ? t('appUpdate.autoLast', {
                when: format.dateTime(new Date(update.lastCheckedAt), {
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }),
              })
            : t('appUpdate.autoNever'),
          update.dismissedVersion
            ? t('appUpdate.autoDismissed', { version: update.dismissedVersion })
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
      <div className="flex min-w-0 items-center gap-2">
        <p
          data-testid="app-settings-update-result"
          data-phase={phase.kind}
          role="status"
          aria-live="polite"
          className={cn(
            'min-w-0 flex-1 text-label leading-label empty:hidden',
            phase.kind === 'failed'
              ? 'text-[color:var(--color-status-warning)]'
              : 'text-[color:var(--color-text-tertiary)]',
          )}
        >
          {outcome ?? ''}
        </p>
        {awayAction ? (
          <Chip size="sm" tone="secondary" data-testid="app-settings-update-away-action" onClick={awayAction.onClick}>
            {awayAction.label}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

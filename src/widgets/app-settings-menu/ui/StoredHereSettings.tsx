'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import {
  clearVaultIndex,
  syncVaultIndex,
  vaultIndexPreference,
  vaultIndexStatus,
  type VaultIndexStatus,
} from '@/shared/lib/vault-folder/tauri-vault-index';
import { ArmedChip, SegmentSwitch, SettingsGroup, SettingsRow } from './settings-primitives';

const BUILDING_POLL_MS = 1000;
const BYTES_PER_KILOBYTE = 1024;

function formatBytes(bytes: number, locale: string): string {
  const megabytes = bytes / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE);
  const [value, unit] = megabytes >= 1 ? [megabytes, 'megabyte'] : [bytes / BYTES_PER_KILOBYTE, 'kilobyte'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}

/**
 * What the installed app keeps beside the folders: the search index's size, a Delete, and the
 * switch that turns it off. With a folder open, size and Delete are that folder's; with none, every
 * folder's. Off deletes every index file; the choice stays on this computer.
 */
export function StoredHereSettings() {
  const t = useTranslations('settingsPrivacy.storedHere');
  const locale = useLocale();
  const { handle } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const indexSwitch = vaultIndexPreference.use();
  const [status, setStatus] = useState<VaultIndexStatus | null>(null);
  const [outcome, setOutcome] = useState<'deleted' | 'failed' | null>(null);

  const refresh = useCallback(async () => {
    const next = await vaultIndexStatus(rootPath).catch(() => null);
    setStatus(next);
    return next;
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await refresh();
      if (!cancelled && next?.state === 'building') timer = setTimeout(() => void poll(), BUILDING_POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh, indexSwitch]);

  const on = indexSwitch === 'on';
  const setOn = async (next: boolean) => {
    vaultIndexPreference.write(next ? 'on' : 'off');
    setOutcome(null);
    if (rootPath !== null) await syncVaultIndex(rootPath, true).catch(() => null);
    else if (!next) await clearVaultIndex(null).catch(() => null);
    await refresh();
  };
  const remove = async () => {
    try {
      await clearVaultIndex(rootPath);
      setOutcome('deleted');
    } catch {
      setOutcome('failed');
    }
    await refresh();
  };

  const thisFolder = rootPath !== null;
  const shownBytes = (thisFolder ? status?.sizeBytes : status?.allBytes) ?? 0;
  const sizeCaption = !on
    ? t('offCaption')
    : outcome === 'deleted'
      ? t(thisFolder ? 'deletedThisFolder' : 'deletedAll')
      : outcome === 'failed'
        ? t('failed')
        : shownBytes === 0
          ? t('empty')
          : thisFolder
            ? t('sizeThisFolder', { size: formatBytes(shownBytes, locale) })
            : t('sizeAllFolders', { size: formatBytes(shownBytes, locale), count: status?.vaults ?? 0 });

  return (
    <SettingsGroup label={t('title')} testId="app-settings-privacy-stored-here">
      <SettingsRow
        settingId="stored-here"
        testId="app-settings-vault-index-switch-row"
        label={t('switchLabel')}
        caption={t('switchCaption')}
        control={
          <SegmentSwitch
            ariaLabel={t('switchLabel')}
            testId="app-settings-vault-index-switch"
            value={on}
            onChange={(next) => void setOn(next)}
            options={[
              { value: true, label: t('on') },
              { value: false, label: t('off') },
            ]}
          />
        }
      />
      <SettingsRow
        settingId="stored-here"
        testId="app-settings-vault-index-size"
        label={t('sizeLabel')}
        caption={sizeCaption}
        captionTone={outcome === 'failed' ? 'danger' : 'neutral'}
        control={
          on && shownBytes > 0 ? (
            <ArmedChip
              label={t('delete')}
              armedLabel={t('deleteArmed')}
              onConfirm={remove}
              testId="app-settings-vault-index-delete"
            />
          ) : null
        }
      />
    </SettingsGroup>
  );
}

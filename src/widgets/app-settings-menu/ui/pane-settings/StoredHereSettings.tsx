'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { forgetChoices, remove as removeVectors, removeModel, useVectorStatus } from '@/features/vault-vectors';
import { formatSize } from '@/shared/lib/format-size';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import {
  clearVaultIndex,
  syncVaultIndex,
  vaultIndexPreference,
  vaultIndexStatus,
  type VaultIndexStatus,
} from '@/shared/lib/vault-folder/vault-index/tauri-vault-index';
import { probeVectors } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { ArmedChip, SegmentSwitch, SettingsGroup, SettingsRow } from '../settings-primitives';

const BUILDING_POLL_MS = 1000;
const BYTES_PER_KILOBYTE = 1024;

function formatBytes(bytes: number, locale: string): string {
  const megabytes = bytes / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE);
  const [value, unit] = megabytes >= 1 ? [megabytes, 'megabyte'] : [bytes / BYTES_PER_KILOBYTE, 'kilobyte'];
  return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}

type Outcome = 'deleted' | 'failed' | null;

function MeaningRow({ rootPath }: { rootPath: string }) {
  const t = useTranslations('settingsPrivacy.storedHere');
  const locale = useLocale();
  const status = useVectorStatus(rootPath);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const vectorsBytes = status?.vectorsBytes ?? 0;
  const caption = outcome === 'failed'
    ? t('meaningFailed')
    : outcome === 'deleted'
      ? t('meaningDeleted')
      : vectorsBytes === 0
        ? t('empty')
        : t('meaningSize', { size: formatSize(vectorsBytes, locale) });
  const deleteMeaning = async () => {
    setOutcome((await removeVectors(rootPath)) ? 'deleted' : 'failed');
  };

  return (
    <SettingsRow
      settingId="stored-here"
      testId="app-settings-vector-size"
      label={t('meaningLabel')}
      caption={caption}
      captionTone={outcome === 'failed' ? 'danger' : 'neutral'}
      control={
        vectorsBytes > 0 ? (
          <ArmedChip label={t('delete')} armedLabel={t('deleteArmed')} onConfirm={deleteMeaning} testId="app-settings-vector-delete" />
        ) : null
      }
    />
  );
}

/**
 * The built-in model, whenever it holds anything on this computer: a finished model, or a
 * download that did not finish. It lives in the app's data folder, not beside any folder, so the
 * row stands with the index off and with no folder open.
 */
function ModelRow({ rootPath }: { rootPath: string | null }) {
  const t = useTranslations('settingsPrivacy.storedHere');
  const locale = useLocale();
  const [model, setModel] = useState<{ bytes: number; ready: boolean } | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [read, setRead] = useState(0);

  useEffect(() => {
    let current = true;
    probeVectors(rootPath, null)
      .catch(() => null)
      .then((probe) => {
        if (!current) return;
        const bytes = probe?.builtin.modelBytes ?? 0;
        setModel(probe && bytes > 0 ? { bytes, ready: probe.builtin.onDisk } : null);
      });
    return () => {
      current = false;
    };
  }, [rootPath, read]);

  const deleteModel = async () => {
    const removed = await removeModel();
    setOutcome(removed ? 'deleted' : 'failed');
    setRead((count) => count + 1);
  };
  if (model === null && outcome === null) return null;
  const caption = outcome === 'failed'
    ? t('modelFailed')
    : outcome === 'deleted' && model === null
      ? t('modelDeleted')
      : model?.ready
        ? t('modelSize', { size: formatSize(model.bytes, locale) })
        : t('modelPartial', { size: formatSize(model?.bytes ?? 0, locale) });

  return (
    <SettingsRow
      settingId="stored-here"
      testId="app-settings-vector-model"
      label={t('modelLabel')}
      caption={caption}
      captionTone={outcome === 'failed' ? 'danger' : 'neutral'}
      control={
        model !== null ? (
          <ArmedChip label={t('delete')} armedLabel={t('deleteArmed')} onConfirm={deleteModel} testId="app-settings-vector-model-delete" />
        ) : null
      }
    />
  );
}

/**
 * What the installed app keeps beside the folders: the search index's size, a Delete, and the
 * switch that turns it off, this folder's search by meaning while the index is on, and the model
 * whenever it holds anything. With a folder
 * open, size and Delete are that folder's; with none, every folder's. Off and Delete remove search
 * by meaning with the index, since its numbers live in the index's folder.
 */
export function StoredHereSettings() {
  const t = useTranslations('settingsPrivacy.storedHere');
  const locale = useLocale();
  const { handle } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const indexSwitch = vaultIndexPreference.use();
  const [status, setStatus] = useState<VaultIndexStatus | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

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
    try {
      if (rootPath !== null) await syncVaultIndex(rootPath, true);
      else if (!next) await clearVaultIndex(null);
      if (!next) await forgetChoices(null);
    } catch {
      // Turning search off deletes every index; one left in place must not read as gone.
      if (!next) setOutcome('failed');
    }
    await refresh();
  };
  const remove = async () => {
    try {
      await clearVaultIndex(rootPath);
      await forgetChoices(rootPath);
      setOutcome('deleted');
    } catch {
      setOutcome('failed');
    }
    await refresh();
  };

  const thisFolder = rootPath !== null;
  const shownBytes = (thisFolder ? status?.sizeBytes : status?.allBytes) ?? 0;
  const sizeCaption = outcome === 'failed'
    ? t('failed')
    : !on
      ? t('offCaption')
      : outcome === 'deleted'
        ? t(thisFolder ? 'deletedThisFolder' : 'deletedAll')
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
      {on && rootPath !== null ? <MeaningRow rootPath={rootPath} /> : null}
      <ModelRow rootPath={rootPath} />
    </SettingsGroup>
  );
}

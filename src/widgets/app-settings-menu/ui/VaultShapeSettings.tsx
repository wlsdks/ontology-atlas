"use client";

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { describeVaultShape, type VaultShape } from '@/shared/lib/vault-shape';
import { useLocalVault } from '@/entities/vault-session';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Chip } from '@/shared/ui/controls';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { useToast } from '@/shared/ui/toast';
import { DETAIL_TOGGLE_CHIP, SettingsRow } from './settings-primitives';

export function VaultShapeSettings() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const toast = useToast();
  const failureSentence = useFailureSentence();
  const localVault = useLocalVault();
  const [busy, setBusy] = useState<'map' | 'wiki' | null>(null);
  if (localVault.status !== 'loaded' || !localVault.manifest) return null;
  const shape = describeVaultShape(localVault.manifest.docs);
  const start = async (part: 'map' | 'wiki') => {
    const chosen: VaultShape = { map: part === 'map', wiki: part === 'wiki' };
    setBusy(part);
    try {
      await localVault.scaffoldOntology(locale, chosen);
      toast.show(t('workspaceShapeStarted'), 'success');
    } catch (err) {
      toast.show(failureSentence(err, t('workspaceFolderErrorFallback')).sentence, 'error');
    } finally {
      setBusy(null);
    }
  };
  const part = (id: 'map' | 'wiki', present: boolean, label: string, startLabel: string) =>
    present ? (
      <span
        data-testid={`app-settings-shape-${id}`}
        data-present="true"
        className="inline-flex items-center gap-1 text-body text-[color:var(--color-text-secondary)]"
      >
        <Check size={ICON_SIZE.sm} aria-hidden />
        {label}
      </span>
    ) : (
      <Chip
        data-testid={`app-settings-shape-start-${id}`}
        size="lg"
        tone="secondary"
        className={DETAIL_TOGGLE_CHIP}
        onClick={() => void start(id)}
        disabled={busy !== null}
      >
        {startLabel}
      </Chip>
    );
  return (
    <SettingsRow
      testId="app-settings-shape"
      settingId="folder-shape"
      label={t('workspaceShapeLabel')}
      caption={t('workspaceShapeCaption')}
      control={
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          {part('map', shape.map, t('workspaceShapeMap'), t('workspaceShapeStartMap'))}
          {part('wiki', shape.wiki, t('workspaceShapeWiki'), t('workspaceShapeStartWiki'))}
        </span>
      }
    />
  );
}

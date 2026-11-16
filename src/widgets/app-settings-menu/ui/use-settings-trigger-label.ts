'use client';

import { useTranslations } from 'next-intl';

import { usePendingUpdate } from '@/features/app-update';

/**
 * The settings trigger's accessible name, carrying a pending update after its notice was put
 * away: available, or installed and waiting for a restart. Reads only those two facts, so a
 * running download does not re-render the trigger.
 */
export function useSettingsTriggerLabel(): { label: string; pendingVersion: string | null } {
  const t = useTranslations('nav.settingsMenu');
  const tUpdate = useTranslations('appUpdate');
  const { pendingVersion, readyVersion } = usePendingUpdate();
  const label = t('triggerAria');
  if (!pendingVersion) return { label, pendingVersion };
  const key = pendingVersion === readyVersion ? 'settingsTriggerReady' : 'settingsTriggerPending';
  return { label: tUpdate(key, { label, version: pendingVersion }), pendingVersion };
}

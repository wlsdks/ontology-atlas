'use client';

import { useTranslations } from 'next-intl';
import { Bot, KeyRound, Plug } from 'lucide-react';
import { AGENTS_MODELS_HREF, DESTINATION_HREF } from '@/shared/config/destinations';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { useAiConnection } from '../../model/use-ai-connection';
import { WikiWriteModeSettings } from '../WikiWriteModeSettings';
import { SettingsDoorRow, SettingsGroup } from '../settings-primitives';

function ModelsDoor({ desktop, onLeave }: { desktop: boolean; onLeave: () => void }) {
  const t = useTranslations('settingsAgents');
  const { statuses, keysRead } = useAiConnection({ enabled: desktop, vaultHandle: null });
  const keyCount = Object.values(statuses).filter((status) => status?.stored).length;
  const caption = !desktop
    ? t('modelsCaptionWeb')
    : keysRead
      ? t('modelsCaptionKeys', { count: keyCount })
      : undefined;
  return (
    <SettingsDoorRow
      settingId="door-models"
      testId="app-settings-door-models"
      label={t('modelsLabel')}
      caption={caption}
      icon={KeyRound}
      href={AGENTS_MODELS_HREF}
      onLeave={onLeave}
    />
  );
}

export function AgentsPane({ onClose }: { onClose: () => void }) {
  const t = useTranslations('settingsAgents');
  const desktop = isDesktopShell();
  return (
    <div className="grid min-w-0 gap-4" data-testid="app-settings-agents-pane">
      {desktop ? (
        <SettingsGroup label={t('writesHeading')} testId="app-settings-agents-writes">
          <WikiWriteModeSettings />
        </SettingsGroup>
      ) : null}
      <SettingsGroup label={t('doorsHeading')} testId="app-settings-agents-doors">
        <SettingsDoorRow
          settingId="door-coding-tools"
          testId="app-settings-door-coding-tools"
          label={t('codingToolsLabel')}
          caption={t('codingToolsCaption')}
          icon={Bot}
          href={DESTINATION_HREF.agents}
          onLeave={onClose}
        />
        <ModelsDoor desktop={desktop} onLeave={onClose} />
        <SettingsDoorRow
          settingId="door-mcp"
          testId="app-settings-door-mcp"
          label={t('mcpLabel')}
          caption={t('mcpCaption')}
          icon={Plug}
          href={DESTINATION_HREF.mcp}
          onLeave={onClose}
        />
      </SettingsGroup>
    </div>
  );
}

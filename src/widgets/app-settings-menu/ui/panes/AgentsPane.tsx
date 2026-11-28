import { useTranslations } from 'use-intl';
import { Bot, KeyRound, Plug } from 'lucide-react';
import { AGENTS_MODELS_HREF, DESTINATION_HREF } from '@/shared/config/destinations';
import { useAiConnection } from '../../model/use-ai-connection';
import { WikiWriteModeSettings } from '../pane-settings/WikiWriteModeSettings';
import { SettingsDoorRow, SettingsGroup } from '../settings-primitives';

function ModelsDoor({ onLeave }: { onLeave: () => void }) {
  const t = useTranslations('settingsAgents');
  const { statuses, keysRead } = useAiConnection({ vaultHandle: null });
  const keyCount = Object.values(statuses).filter((status) => status?.stored).length;
  const caption = keysRead ? t('modelsCaptionKeys', { count: keyCount }) : undefined;
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
  return (
    <div className="grid min-w-0 gap-4" data-testid="app-settings-agents-pane">
      <SettingsGroup label={t('writesHeading')} testId="app-settings-agents-writes">
        <WikiWriteModeSettings />
      </SettingsGroup>
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
        <ModelsDoor onLeave={onClose} />
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

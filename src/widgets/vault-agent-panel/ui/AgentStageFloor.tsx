'use client';

import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { AGENTS_MODELS_HREF } from '@/shared/config/destinations';

import type { AgentPanelStage } from '../model/panel-stage';
import { AgentLockedComposer } from './AgentLockedState';

/**
 * The strip where the composer will stand while the conversation cannot start: it carries the one
 * door that fixes what is missing (open a folder, connect a model). Nothing in the
 * chat or scope stages.
 */
export function AgentStageFloor({
  stage,
  onOpenFolder,
}: {
  stage: AgentPanelStage;
  onOpenFolder?: () => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  const router = useRouter();
  return stage.kind === 'no-folder' ? (
    <AgentLockedComposer
      testId="vault-agent-open-folder"
      hint={t('placeholderFirst')}
      actionLabel={t('degraded.noVaultAction')}
      onAction={onOpenFolder}
    />
  ) : stage.kind === 'no-key' ? (
    <AgentLockedComposer
      testId="vault-agent-open-settings"
      hint={t('placeholderFirst')}
      actionLabel={t('degraded.noKeyAction')}
      onAction={() => router.push(AGENTS_MODELS_HREF)}
    />
  ) : null;
}

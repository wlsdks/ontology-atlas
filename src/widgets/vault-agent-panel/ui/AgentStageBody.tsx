'use client';

import { useTranslations } from 'next-intl';

import type { FirstWordsChip } from '@/features/vault-agent';
import { LLM_AUDIT_LOG_RELATIVE_PATH } from '@/shared/lib/llm-connection/llm-audit-log';

import type { AgentPanelStage } from '../model/panel-stage';
import type { useVaultAgent } from '../model/use-vault-agent';
import { AgentChatThread } from './AgentChatThread';
import { AgentLockedState } from './AgentLockedState';
import { AgentScopeSheet } from './AgentScopeSheet';

/**
 * What fills the panel body in each stage: a locked state that names what is missing, the consent
 * sheet before the first message, or the conversation.
 */
export function AgentStageBody({
  stage,
  agent,
  canWrite,
  vaultIsGit,
  providerHost,
  firstWordsChips,
  onFocusNode,
  onPrefill,
  onAcceptScope,
  onClose,
}: {
  stage: AgentPanelStage;
  agent: ReturnType<typeof useVaultAgent>;
  canWrite: boolean;
  vaultIsGit: boolean;
  providerHost: string;
  firstWordsChips: readonly FirstWordsChip[];
  onFocusNode: (slug: string) => void;
  onPrefill: (text: string) => void;
  onAcceptScope: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  const locked = {
    consent: t('locked.consentPromise'),
    examplesTitle: t('locked.examplesTitle'),
    chips: firstWordsChips,
  };

  switch (stage.kind) {
    case 'web':
      // A browser has nowhere to keep a key and no route to send — it sends you to
      // the app, not to settings (honest degradation).
      return <AgentLockedState title={t('degraded.webTitle')} body={t('degraded.webBody')} {...locked} />;
    case 'no-folder':
      return <AgentLockedState title={t('degraded.noVaultTitle')} body={t('degraded.noVaultBody')} {...locked} />;
    case 'no-key':
      return <AgentLockedState title={t('degraded.noKeyTitle')} body={t('degraded.noKeyBody')} {...locked} />;
    case 'scope':
      return (
        <>
          {/* The consent card stands at the floor where [Send] will stand, so the next control reads as "this opened". */}
          <div aria-hidden="true" className="min-h-0 shrink grow" />
          <AgentScopeSheet
            provider={t(`provider.${stage.provider}`)}
            host={providerHost}
            auditPath={LLM_AUDIT_LOG_RELATIVE_PATH}
            labels={{
              title: t('scope.title'),
              body: ({ provider: name, host }) => t('scope.body', { provider: name, host }),
              liveRows: t('scope.liveRows'),
              consent: t('scope.consent'),
              recorded: (path) => t('scope.recorded', { path }),
              accept: t('scope.accept'),
              cancel: t('scope.cancel'),
            }}
            onAccept={onAcceptScope}
            onCancel={onClose}
          />
        </>
      );
    case 'chat':
      return (
        <AgentChatThread
          agent={agent}
          provider={stage.provider}
          canWrite={canWrite}
          vaultIsGit={vaultIsGit}
          firstWordsChips={firstWordsChips}
          onFocusNode={onFocusNode}
          onPrefill={onPrefill}
        />
      );
  }
}

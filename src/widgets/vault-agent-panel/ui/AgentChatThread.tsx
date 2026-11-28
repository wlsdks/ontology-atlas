import { useTranslations } from 'use-intl';

import type { FirstWordsChip } from '@/features/vault-agent';
import { josa } from '@/shared/lib/locale-text/ko-josa';
import type { ConnectionProvider } from '@/shared/lib/llm-connection/tauri-secrets';

import type { useVaultAgent } from '../model/use-vault-agent';
import { AgentFirstWords } from './AgentFirstWords';
import { AgentProposalCard } from './AgentProposalCard';
import { AgentTranscript } from './AgentTranscript';

/**
 * The conversation itself: turns, the pending proposal, and the first-words chips while it is empty.
 * It grows from the bottom.
 */
export function AgentChatThread({
  agent,
  provider,
  canWrite,
  vaultIsGit,
  firstWordsChips,
  onFocusNode,
  onPrefill,
}: {
  agent: ReturnType<typeof useVaultAgent>;
  provider: ConnectionProvider;
  canWrite: boolean;
  vaultIsGit: boolean;
  firstWordsChips: readonly FirstWordsChip[];
  onFocusNode: (slug: string) => void;
  onPrefill: (text: string) => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  return (
    <>
      {/* The conversation grows from the bottom. A spacer, not `justify-end`, which on overflow eats the
          scroll container's top (the first turn disappears above the scroll). */}
      <div aria-hidden="true" className="min-h-0 shrink grow" />
      <AgentTranscript
        turns={agent.turns}
        providerLabel={t(`provider.${provider}`)}
        elapsedSeconds={agent.elapsedSeconds}
        onFocusNode={onFocusNode}
        onPrefill={onPrefill}
        labels={{
          nextStepTitle: t('nextStep.title'),
          retryTitle: t('retry.title'),
          regroundTitle: ({ round, cap }) => t('reground.title', { round, cap }),
          you: t('you'),
          lookingAt: (title) => t('screenContext.lookingAt', { title, josa: josa(title, 'object') }),
          wholeMap: t('screenContext.wholeMap'),
          unsupported: t('unsupported'),
          uncited: t('uncited'),
          charsLabel: (chars) => t('charsLabel', { chars }),
          thinking: t('thinking'),
          thinkingSeconds: (seconds) => t('thinkingSeconds', { seconds }),
          footer: ({ provider: name, rounds }) => t('footer', { provider: name, rounds }),
          footerDetail: ({ chars }) => t('footerDetail', { chars }),
        }}
        renderProposal={() => null}
      />
      {agent.proposal ? (
        <AgentProposalCard
          proposal={agent.proposal}
          canWrite={canWrite}
          vaultIsGit={vaultIsGit}
          expandedByDefault={!agent.hasAppliedOnce}
          onApply={() => void agent.apply()}
          onCancel={agent.cancelProposal}
          onCopy={agent.copyProposal}
          onToggleChange={agent.toggleChange}
          onToggleSnapshot={agent.toggleSnapshot}
          onFocusNode={onFocusNode}
          labels={{
            title: (count) => t('proposal.title', { count }),
            readOnlyTitle: t('proposal.readOnlyTitle'),
            volume: ({ files, added, removed }) =>
              t('proposal.volume', { files, added, removed }),
            apply: (count) => t('proposal.apply', { count }),
            applying: t('proposal.applying'),
            cancel: t('proposal.cancel'),
            copy: t('proposal.copy'),
            copied: t('proposal.copied'),
            copying: t('proposal.copying'),
            copyFailed: t('proposal.copyFailed'),
            selectionConflict: (path) => t('proposal.selectionConflict', { path }),
            snapshot: t('proposal.snapshot'),
            snapshotUnavailable: t('proposal.snapshotUnavailable'),
            applied: (sha) => t('proposal.applied', { sha }),
            appliedNoSnapshot: t('proposal.appliedNoSnapshot'),
            cancelled: t('proposal.cancelled'),
            conflict: t(agent.construction?.status === 'sourceChanged' ? 'construction.sourceChanged' : 'proposal.conflict'),
            failed: (message) => t('proposal.failed', { message }),
            partialWrites: (paths) => t('proposal.partialWrites', { paths }),
            refreshFailed: (message) => t('proposal.refreshFailed', { message }),
            unreadWarning: t('proposal.unreadWarning'),
            showOnMap: t('proposal.showOnMap'),
            expandHint: t('proposal.expandHint'),
          }}
        />
      ) : null}
      {/* An empty conversation seats three sentences from this folder's real state, computed locally, so
          they arrive in the same frame as the skeleton. */}
      {agent.turns.length === 0 ? (
        <AgentFirstWords
          chips={firstWordsChips}
          title={t('firstWords.title')}
          hint={t('firstWords.hint')}
          onPrefill={onPrefill}
        />
      ) : null}
    </>
  );
}

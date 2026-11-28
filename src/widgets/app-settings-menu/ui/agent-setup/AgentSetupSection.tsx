import { useTranslations } from 'use-intl';

import { useAgentServer, useLocalVault } from '@/entities/vault-session';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { vaultValidationCounts } from '../../model/vault-validation-counts';

import { McpProofPacket } from './McpProofPacket';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/**
 * The MCP connection pane, self-contained so the settings sheet and the Agents destination
 * share one derivation and state the same warning counts. It is drawn on the web too: MCP
 * attaches to the folder, and a browser only lacks the absolute path, so the config is
 * built on screen to paste.
 */
export function AgentSetupSection({ onBeforeNavigate }: { onBeforeNavigate?: () => void } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const localVault = useLocalVault();
  const serverAvailability = useAgentServer();
  const isLoaded = localVault.status === 'loaded';

  if (!isLoaded) {
    return (
      <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('agentStatusNoVault')}
        </p>
        <p className="mt-1 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {t('agentNoVaultHint')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OpenVaultCta
            testId="agents-open-vault"
            variant="outline"
          />
        </div>
      </div>
    );
  }

  return (
    <>
    {/*
      The `agent-setup-section` wrapper holds the config panel only: `agent-connect-panel-census`
      counts the copy buttons on the attach pane's first screen, which excludes the proof packet.
    */}
    <div data-testid="agent-setup-section" className="min-w-0">
    <VaultAgentSetupPanel
      canEditCurrent
      localVault={localVault}
      serverAvailability={serverAvailability}
      validationSummary={deriveValidationSummary(localVault)}
      // No sheet to close here; the prop stays required, so a no-op is explicit.
      onOpenWorkflowGuide={onBeforeNavigate ?? (() => undefined)}
    />
    </div>
    {/*
      Without a runnable server (`launch === null`) the panel draws no step 3, so the proof
      packet that otherwise lives there stands on its own.
    */}
    {serverAvailability.launch === null ? (
      <div className="mt-4">
        {/*
          `getTauriVaultRootPath` answers only inside the installed app; in a browser it is null
          and the packet prints the fill-in-the-path instruction, which is the true state here.
        */}
        <McpProofPacket
          vaultName={localVault.handle?.name ?? 'vault'}
          vaultPath={localVault.handle ? getTauriVaultRootPath(localVault.handle) : null}
        />
      </div>
    ) : null}
    </>
  );
}

function deriveValidationSummary(
  localVault: ReturnType<typeof useLocalVault>,
): { errorCount: number; warningCount: number } | null {
  if (localVault.status !== 'loaded' || !localVault.manifest) return null;
  return vaultValidationCounts(localVault.manifest);
}

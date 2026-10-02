'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

import { Button, buttonVariants } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { Check, Copy, Download } from 'lucide-react';

import { useAgentServer, useLocalVault } from '@/entities/vault-session';
import { OpenVaultCta } from '@/features/docs-vault-local';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';

import { TermHint } from '@/shared/ui/term-hint';
import { McpProofPacket } from './McpProofPacket';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/**
 * The terminal path, for someone who will not hand the browser a folder. Two lines copied as
 * one block so the order survives the paste: `init` makes the vault, `agent-setup --write`
 * points the coding tools at it.
 */
const CLI_TERMINAL_SETUP = [
  'node $ATLAS/cli/src/index.mjs init my-vault',
  'node $ATLAS/cli/src/index.mjs agent-setup my-vault --write',
].join('\n');

/**
 * The MCP connection pane, self-contained so the settings sheet and the Agents destination
 * share one derivation and state the same warning counts. It is drawn on the web too: MCP
 * attaches to the folder, and a browser only lacks the absolute path, so the config is
 * built on screen to paste.
 */
export function AgentSetupSection({ onBeforeNavigate }: { onBeforeNavigate?: () => void } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const localVault = useLocalVault();
  const { state: copyState, copy } = useCopyFeedback();
  const serverAvailability = useAgentServer();
  const isLoaded = localVault.status === 'loaded';

  if (!isLoaded) {
    return (
      <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('agentStatusNoVault')}
        </p>
        <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('agentNoVaultHint')}
        </p>
        <div className="mt-3">
          <OpenVaultCta
            testId="agents-open-vault"
            variant="outline"
          />
        </div>
        <div
          data-testid="agents-terminal-setup"
          className="mt-4 border-t border-[color:var(--color-divider)] pt-3"
        >
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            <TermHint term="cli">{t('agentTerminalTitle')}</TermHint>
          </p>
          <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('agentTerminalBody')}
          </p>
          <pre className="mt-2 overflow-x-auto rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 font-mono text-label leading-prose text-[color:var(--color-text-secondary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
            {CLI_TERMINAL_SETUP}
          </pre>
          <p className="mt-2 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {t('cliPlaceholderHint')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="agents-terminal-setup-copy"
              onClick={() => void copy(CLI_TERMINAL_SETUP)}
              className="atlas-touch-floor"
            >
              {copyState === 'copied' ? (
                <Check size={ICON_SIZE.md} aria-hidden />
              ) : (
                <Copy size={ICON_SIZE.md} aria-hidden />
              )}
              {copyState === 'copied' ? t('agentTerminalCopied') : t('agentTerminalCopy')}
            </Button>
            {/* Only without a bundled server: the installed app must never offer its own
                download (AGENTS.md), and `launch` is non-null exactly there. */}
            {serverAvailability.launch === null ? (
              <Link
                href="/download/"
                onClick={onBeforeNavigate}
                data-testid="agents-terminal-setup-download"
                className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor atlas-touch-floor-wide')}
              >
                <Download size={ICON_SIZE.md} aria-hidden />
                {t('agentTerminalAppLink')}
              </Link>
            ) : null}
          </div>
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

/**
 * Vault validation summary, with a value only when something is wrong; written once so both
 * consumers state the same number.
 */
function deriveValidationSummary(
  localVault: ReturnType<typeof useLocalVault>,
): { errorCount: number; warningCount: number } | null {
  if (localVault.status !== 'loaded' || !localVault.manifest) return null;
  const summary = summarizeVaultValidation(
    localVault.manifest.docs.map((doc) => ({ slug: doc.slug, frontmatter: doc.frontmatter })),
  );
  if (summary.errorCount === 0 && summary.warningCount === 0) return null;
  return { errorCount: summary.errorCount, warningCount: summary.warningCount };
}

'use client';

import { useTranslations } from 'next-intl';
import type {
  AgentConfigStatus,
  AgentSetupConnection,
} from '../../model/agent-setup/agent-setup-status';
import { AGENT_SETUP_FILES } from '../../model/agent-setup/agent-setup-status';
import { McpProofPacket } from './McpProofPacket';

interface Props {
  agentStatus: AgentConfigStatus;
  connections: readonly AgentSetupConnection[];
  agentSetupReady: boolean;
  readyCount: number;
  vaultName: string;
  vaultRootPath: string | null | undefined;
}

/** The check dialog's connection table: how many config files are ready, per tool, and the proof packet. */
export function AgentConnectionStatus({
  agentStatus,
  connections,
  agentSetupReady,
  readyCount,
  vaultName,
  vaultRootPath,
}: Props) {
  const t = useTranslations('docsVault');
  return (
    <>
      {/* Named for the table under it (`connectionStatusHeading`), not after the dialog it is in. */}
      <section data-testid="agent-setup-step-3" className="mt-4 flex flex-col gap-2">
        <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('agentSetup.connectionStatusHeading')}
        </h3>
          <div className="divide-y divide-[color:var(--color-divider)] rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)]">
            {/*
              The one statement of the count, naming whose files it counts (Atlas reads back
              only Claude Code's and Codex's). Each tool has its own setup and check.
            */}
            <div className="flex items-start gap-2 px-2.5 py-2">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: agentSetupReady
                    ? 'var(--color-status-success)'
                    : 'var(--color-text-quaternary)',
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  data-testid="agent-setup-status-summary"
                  className="break-keep text-body text-[color:var(--color-text-secondary)]"
                >
                  {t('agentSetup.statusSummary', {
                    ready: readyCount,
                    total: AGENT_SETUP_FILES.length,
                    tools: connections.map((connection) => connection.label).join(' · '),
                  })}
                </p>
                <p
                  data-testid="agent-setup-status-next"
                  className="mt-0.5 break-keep text-body leading-prose text-[color:var(--color-text-tertiary)]"
                >
                  {t('agentSetup.configChoice')}
                </p>
              </div>
            </div>
            <dl className="grid gap-1 px-2.5 py-2">
              {connections.map(({ key, file, label, check }) => {
                const ready = agentStatus[file.key] && agentStatus[file.validKey] !== false;
                return (
                  <div key={key} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-body text-[color:var(--color-text-secondary)]">
                      {label}
                    </dt>
                    <dd className="min-w-0 text-right text-label leading-label [overflow-wrap:anywhere] text-[color:var(--color-text-tertiary)]">
                      {ready ? <span className="font-mono">{check}</span>
                        : agentStatus[file.key]
                          ? t('agentSetup.nextInvalid', { path: file.path })
                          : t('agentSetup.nextMissing', { path: file.path })}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <McpProofPacket
            frame="inline"
            vaultName={vaultName}
            vaultPath={vaultRootPath}
          />
      </section>
    </>
  );
}

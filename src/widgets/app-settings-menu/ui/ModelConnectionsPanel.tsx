'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SECRET_PROVIDERS } from '@/shared/lib/llm-connection/tauri-secrets';
import {
  isLocalEndpointReady,
  readLocalEndpoint,
  type LocalEndpointSettings,
} from '@/shared/lib/llm-connection/local-endpoint';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { useLocalVault } from '@/entities/vault-session';
import { LOCAL_RUNNERS, runnerForBaseUrl, type LocalRunnerId } from '../model/local-runners';
import { useAiConnection, type AiConnectionState } from '../model/use-ai-connection';
import { AuditSection } from './model-connections/AuditSection';
import { JevRow } from './model-connections/JevRow';
import { KeyRow } from './model-connections/KeyRow';
import { LocalRunnerRow } from './model-connections/LocalRunnerRow';
import { ModelGroup } from './model-connections/ModelRow';
import { useAnnouncer, useOpenRow } from './model-connections/use-panel-state';

/**
 * The Agents destination's models tab: which model Atlas's own conversation calls, and with whose
 * key. No path redraws a full key (a draft lives only in `KeyDraftForm`; after a save only `last4`).
 * Nothing is probed on arrival: every request is a
 * sent-log line. Checking an address saves nothing unless it is the saved one; one row opens at a
 * time and every close returns focus to its opener; results are announced once, politely.
 */

export interface ModelConnectionsPanelProps {
  connection: AiConnectionState;
  /** Vault transfers log here; standalone local checks use fixed app data. */
  vaultRootPath: string | null;
}

export function ModelConnectionsPanel({
  connection,
  vaultRootPath,
}: ModelConnectionsPanelProps) {
  const t = useTranslations('agents.models');
  const {
    statuses,
    applyStatus,
    jevStatus,
    applyJevStatus,
    keyReads,
    jevRead,
    auditEntries,
    auditTotal,
    refreshAudit,
  } = connection;
  const { expanded, setExpanded, rootRef, collapse } = useOpenRow();
  const [local, setLocal] = useState<LocalEndpointSettings>(() => readLocalEndpoint());
  const { announcement, announce } = useAnnouncer();

  const activeRunner: LocalRunnerId | null = isLocalEndpointReady(local)
    ? runnerForBaseUrl(local.baseUrl)
    : null;

  return (
    <div
      ref={rootRef}
      className="grid min-w-0 content-start gap-6"
      data-testid="ai-connection-view"
      onKeyDown={(event) => {
        // Esc collapses the open row first and stops there. An Esc an inner control already
        // handled (the model list closing itself) is not a second request to close the row.
        if (event.key !== 'Escape' || expanded === null || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        collapse(expanded);
      }}
    >
      <div className="grid min-w-0 gap-6" data-testid="models-rows">
        <ModelGroup label={t('localTitle')} hint={t('localTitleHint')} testId="models-local">
          {LOCAL_RUNNERS.map((runner) => (
            <LocalRunnerRow
              key={runner.id}
              runner={runner}
              local={local}
              activeRunner={activeRunner}
              vaultRootPath={vaultRootPath}
              expanded={expanded === `local:${runner.id}`}
              onExpand={() => setExpanded(`local:${runner.id}`)}
              onCollapse={() => collapse(`local:${runner.id}`)}
              onSettings={setLocal}
              onVerified={refreshAudit}
              announce={announce}
            />
          ))}
        </ModelGroup>

        <ModelGroup label={t('keysTitle')} term="apiKey" hint={t('keysTitleHint')} testId="models-keys">
          {SECRET_PROVIDERS.map((provider) => (
            <KeyRow
              key={provider}
              provider={provider}
              status={statuses[provider]}
              read={keyReads[provider]}
              vaultRootPath={vaultRootPath}
              expanded={expanded === `key:${provider}`}
              onExpand={() => setExpanded(`key:${provider}`)}
              onCollapse={() => collapse(`key:${provider}`)}
              onStatus={(next) => {
                applyStatus(provider, next);
                collapse(`key:${provider}`);
              }}
              onVerified={refreshAudit}
              announce={announce}
            />
          ))}
        </ModelGroup>

        <ModelGroup label={t('externalTitle')} testId="models-external">
          <JevRow
            status={jevStatus}
            read={jevRead}
            vaultRootPath={vaultRootPath}
            mode={expanded === 'jev:key' ? 'key' : expanded === 'jev:check' ? 'check' : null}
            onMode={(mode) => setExpanded(mode === 'key' ? 'jev:key' : 'jev:check')}
            onCollapse={(mode) => collapse(mode === 'key' ? 'jev:key' : 'jev:check')}
            onStatus={(next) => {
              applyJevStatus(next);
              collapse('jev:key');
            }}
            onSent={refreshAudit}
            announce={announce}
          />
        </ModelGroup>
      </div>

      <AuditSection entries={auditEntries} total={auditTotal} vaultRootPath={vaultRootPath} error={connection.auditError} retry={connection.refreshAudit} />

      <p className="sr-only" aria-live="polite" data-testid="models-announcer">
        {announcement}
      </p>
    </div>
  );
}

/**
 * The models tab as the Agents page mounts it: the open folder (where every transfer is
 * recorded) and the Keychain state are read here, only while the tab is up, so nothing is
 * queried silently from another tab.
 */
export function ModelConnections() {
  const localVault = useLocalVault();
  const handle = localVault.status === 'loaded' ? (localVault.handle ?? null) : null;
  const vaultRootPath = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const connection = useAiConnection({ vaultHandle: handle });
  return (
    <ModelConnectionsPanel connection={connection} vaultRootPath={vaultRootPath} />
  );
}

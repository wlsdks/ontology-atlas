'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SECRET_PROVIDERS } from '@/shared/lib/llm-connection/tauri-secrets';
import {
  isLocalEndpointReady,
  readLocalEndpoint,
  type LocalEndpointSettings,
} from '@/shared/lib/llm-connection/local-endpoint';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { useLocalVault } from '@/entities/vault-session';
import { buildRouteFocusHref, rememberRouteFocusIntent } from '@/shared/ui/routing/route-focus-manager';
import { buttonVariants } from '@/shared/ui/controls/button';
import { Disclosure } from '@/shared/ui/controls/disclosure';
import { FeatureStage } from '@/shared/ui/status/feature-stage';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { Download } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { LOCAL_RUNNERS, runnerForBaseUrl, type LocalRunnerId } from '../model/local-runners';
import { useAiConnection, type AiConnectionState } from '../model/use-ai-connection';
import { ModelKeyArtwork } from './ModelKeyArtwork';
import { AuditSection } from './model-connections/AuditSection';
import { JevRow } from './model-connections/JevRow';
import { KeyRow } from './model-connections/KeyRow';
import { LocalRunnerRow } from './model-connections/LocalRunnerRow';
import { ModelGroup } from './model-connections/ModelRow';
import { useAnnouncer, useOpenRow } from './model-connections/use-panel-state';

/**
 * The Agents destination's models tab: which model Atlas's own conversation calls, and with
 * whose key (local runners, API keys, the external check, the sent log). The settings sheet
 * keeps only a pointer row, so no fact is stated twice. What this screen holds to:
 * - **There is no path that redraws a full key.** A draft lives only in `KeyDraftForm`, which
 *   unmounts when its row collapses; after a save the screen knows only `last4`.
 * - **Honest web degradation.** With no bridge it renders no input field at all, says why, and
 *   links to the app. It shows no example rows either: a sample key row would be fake data.
 * - **A status is a fact the screen checked, or it says so.** Nothing is probed on arrival: every
 *   request is a line in the sent log, and this screen sends nothing on its own. A runner nobody
 *   checked reads "not connected", never "off"; a saved runner or key reads "saved" in grey until
 *   a check turns it green.
 * - **Looking never breaks what works.** Checking an address saves nothing unless it is the saved
 *   address; a different runner becomes the conversation's only when a model is picked there.
 * - **One row open at a time, every opening reversible**, and every way a row closes (Cancel,
 *   Esc, save, remove, pick) hands focus back to the control that opened it.
 * - **One control grammar.** Every trailing control is a `Chip` at the row size (`lg`); the
 *   status beside it is a dot on the status tokens plus a word, never colour alone. Results are
 *   announced once through one polite live region, not by eight live statuses.
 */

export interface ModelConnectionsPanelProps {
  connection: AiConnectionState;
  /** Vault transfers log here; standalone local checks use fixed app data. */
  vaultRootPath: string | null;
  downloadHref: string;
  onDownloadNavigate?: () => void;
}

export function ModelConnectionsPanel({
  connection,
  vaultRootPath,
  downloadHref,
  onDownloadNavigate,
}: ModelConnectionsPanelProps) {
  const t = useTranslations('agents.models');
  const {
    bridgeAvailable,
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

  if (!bridgeAvailable) {
    /*
     * The same stage the Agents tab wears on the web, so the two tabs read as one destination. No
     * sample rows: a key or runner drawn here would be data this browser does not have.
     */
    return (
      <div className="my-auto flex min-w-0 flex-col items-center" data-testid="ai-connection-view">
        <FeatureStage
          data-testid="ai-connection-web-degraded"
          className="my-0"
          art={(motionState) => <ModelKeyArtwork {...motionState} />}
          title={t('webStageTitle')}
          body={t('webStageBody')}
          action={
            <Link
              href={downloadHref}
              onClick={onDownloadNavigate}
              data-testid="ai-connection-download-link"
              /* The standard primary button every web-only door wears; pills are for a state or a count. */
              className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor atlas-touch-floor-wide')}
            >
              <Download size={ICON_SIZE.md} aria-hidden />
              {t('webDegradedCta')}
            </Link>
          }
        />
        <Disclosure
          className="w-full max-w-[var(--measure-stage-column)] text-center"
          summaryClassName="atlas-touch-floor"
          summaryTestId="ai-connection-web-why"
          summary={t('webWhyToggle')}
        >
          <div className="mx-auto mt-3 grid max-w-prose gap-2 text-left text-body leading-body text-[color:var(--color-text-secondary)]">
            <p>{t('webDegradedBody')}</p>
            {/* Why key-less runners do not work here either: without it the answer reads as
                "if keys are the problem, then key-less Ollama must work". */}
            <p data-testid="ai-connection-web-degraded-local">{t('webDegradedLocalBody')}</p>
          </div>
        </Disclosure>
      </div>
    );
  }

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
  const connection = useAiConnection({ enabled: true, vaultHandle: handle });
  return (
    <ModelConnectionsPanel
      connection={connection}
      vaultRootPath={vaultRootPath}
      downloadHref={buildRouteFocusHref('/download/')}
      onDownloadNavigate={() => rememberRouteFocusIntent('/download/')}
    />
  );
}

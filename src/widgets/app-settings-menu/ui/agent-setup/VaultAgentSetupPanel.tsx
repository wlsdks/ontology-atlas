'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { useTranslations } from 'next-intl';
import {
  AGENT_CLIENTS,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
} from '@/entities/vault-session';
import { useAgentClientControls, buildCursorMcpDeeplink } from '@/features/docs-vault-local';
import { DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from '../settings-primitives';
import type { VaultManifest } from '@/entities/docs-vault';
import type { AgentClientId } from '@/entities/vault-session';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls/controls';
import { Dialog, InfoHint } from '@/shared/ui';
import { useRowDisclosure } from '@/shared/lib/list-rows/use-row-disclosure';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import type { AgentServerAvailability } from '@/shared/config';
import {
  AGENT_SETUP_FILES,
  configFileState,
  configFilesFor,
  isAgentSetupReady,
  summarizeAgentSetupFiles,
  type AgentConfigStatus,
  type AgentSetupConnection,
  type ValidationSummary,
} from '../../model/agent-setup/agent-setup-status';
import { useAgentSetupCopy } from '../../model/agent-setup/use-agent-setup-copy';
import { NEUTRAL_COPY_CHIP } from './agent-setup-chips';
import { AgentConnectionStatus } from './AgentConnectionStatus';
import { AgentSetupTroubleshooting } from './AgentSetupTroubleshooting';

interface VaultAgentSetupLocalVault {
  status:
    | 'idle'
    | 'opening'
    | 'loading'
    | 'loaded'
    | 'permission-needed'
    | 'unsupported'
    | 'error';
  handle: FileSystemDirectoryHandle | null;
  manifest: VaultManifest | null;
  agentConfigStatus: AgentConfigStatus | null;
  recentVaults: LocalFsHandleRecord[];
  ensureAgentConfigs: (
    client?: AgentClientId,
  ) => Promise<{ created: number; skipped: number }>;
}

interface Props {
  canEditCurrent: boolean;
  localVault: VaultAgentSetupLocalVault;
  serverAvailability: AgentServerAvailability;
  validationSummary: ValidationSummary | null;
  onOpenWorkflowGuide: () => void;
}

/**
 * The AI-agent connection panel: config file status, repair, copy packets and the validation
 * gate. Renders only for a loaded vault with `agentConfigStatus`; the copy packets fill in the
 * vault's absolute path. Strings live in the `docsVault` namespace.
 */
export function VaultAgentSetupPanel({
  canEditCurrent,
  localVault,
  serverAvailability,
  validationSummary,
  onOpenWorkflowGuide,
}: Props) {
  const t = useTranslations('docsVault');
  // The one-click button and the three-step copy reuse the same source as the map
  // sheet (`agentConnect`), so the two surfaces cannot diverge.
  const tc = useTranslations('agentConnect');
  const tMcp = useTranslations('mcp');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /**
   * The "Having trouble?" drawer collapses in flow, so it uses the list-row disclosure. It is
   * declared before `serverLaunchable`, so it reads the launch prop directly.
   */
  const advancedRevealOpen = serverAvailability.launch !== null && advancedOpen;
  const {
    mounted: advancedMounted,
    boxRef: advancedBoxRef,
    contentRef: advancedContentRef,
  } = useRowDisclosure(advancedRevealOpen);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [agentSetupBusy, setAgentSetupBusy] = useState(false);
  const [agentSetupError, setAgentSetupError] = useState<string | null>(null);
  const agentStatus = localVault.agentConfigStatus;
  const vaultRootPath = localVault.handle
    ? getTauriVaultRootPath(localVault.handle)
    : null;
  const vaultNameForConfig = localVault.handle?.name ?? 'vault';
  const copyActions = useAgentSetupCopy(vaultNameForConfig, vaultRootPath);
  // A deep link needs an absolute path (installed app). Web is null → degrade to copy.
  const cursorDeeplink = buildCursorMcpDeeplink(vaultRootPath, serverAvailability.launch);

  /**
   * Write one tool's file, or all of them when no tool is given. On failure the message names
   * the file and says the folder is unchanged, and the rejection is re-thrown, or the
   * awaiting `AgentClientButtons.writeAndConfirm` would show done for a write that never happened.
   */
  async function handleEnsureAgentConfigs(client?: AgentClientId) {
    setAgentSetupError(null);
    setAgentSetupBusy(true);
    try {
      await localVault.ensureAgentConfigs(client);
    } catch (error) {
      const files = configFilesFor(client);
      const detail = error instanceof Error ? error.message.trim() : '';
      // Never print empty brackets: with no cause to quote, the sentence stands without one.
      setAgentSetupError(
        detail
          ? t('agentSetup.writeFailed', { files, detail })
          : t('agentSetup.writeFailedNoDetail', { files }),
      );
      throw error;
    } finally {
      setAgentSetupBusy(false);
    }
  }

  const serverLaunchable = serverAvailability.launch !== null;
  const mcpJsonState = configFileState(agentStatus?.mcpJson, agentStatus?.mcpJsonValid);
  const codexConfigState = configFileState(
    agentStatus?.codexConfig,
    agentStatus?.codexConfigValid,
  );
  /*
   * The per-client controls, shared with the map sheet (`useAgentClientControls`). Called
   * before the early return below because it holds hooks.
   */
  const clientControls = useAgentClientControls({
    serverAvailability,
    onWriteConfigs:
      serverLaunchable && canEditCurrent ? (client) => handleEnsureAgentConfigs(client) : null,
    cursorDeeplink,
    mcpJsonSnippet: buildMcpConfigJson(vaultNameForConfig, vaultRootPath),
    replacementMcpJsonSnippet: buildMcpConfigJson(vaultNameForConfig, '.'),
    codexCommand: buildCodexMcpAddCommandTemplate(vaultNameForConfig, vaultRootPath),
    mcpJsonState,
    codexConfigState,
    codexConfigSnippet: buildCodexConfigTomlTemplate(vaultNameForConfig, '.'),
    needsManualPath: vaultRootPath === null,
  });

  if (localVault.status !== 'loaded' || !agentStatus) return null;
  /*
   * Nothing until the server lookup answers: `launch: null` alone cannot tell a browser from the
   * app still asking, and the browser card would tell an app user to download the app.
   */
  if (serverAvailability.pending) return null;

  const agentSetupReady = isAgentSetupReady(serverLaunchable, agentStatus);
  const agentSetupConnections: readonly AgentSetupConnection[] = [
    {
      /*
       * The `.mcp.json` file is Claude Code's only; Cursor's is `.cursor/mcp.json`, which Atlas
       * writes but never reads back, so this row must not claim to have checked it.
       */
      key: 'claudeCursor',
      file: AGENT_SETUP_FILES[0],
      label: t('agentSetup.connectionClaudeCursor'),
      check: t('agentSetup.connectionClaudeCursorCheck'),
    },
    {
      key: 'codex',
      file: AGENT_SETUP_FILES[1],
      label: t('agentSetup.connectionCodex'),
      check: t('agentSetup.connectionCodexCheck'),
    },
  ];
  const { readyCount: agentSetupReadyCount } = summarizeAgentSetupFiles(agentStatus);

  const clientRows = clientControls.controls;
  const closeVerify = () => {
    setVerifyOpen(false);
    setAdvancedOpen(false);
  };

  return (
    <section
      aria-label={t('agentSetup.ariaLabel')}
      className="min-w-0"
      data-testid="vault-agent-setup-panel"
    >
      {/*
        The verbatim diagnosis `agent_setup.rs` composes when it cannot find the bundled server;
        a web session sets no reason, so only the installed app draws this row.
      */}
      {!serverLaunchable && serverAvailability.reason ? (
        <p
          role="status"
          data-testid="agent-setup-server-reason"
          className="mb-3 break-keep text-body leading-prose text-[color:var(--color-amber-source-text-a95)]"
        >
          {t('agentSetup.serverMissingReason', { reason: serverAvailability.reason })}
        </p>
      ) : null}

      <SettingsGroup
        label={tMcp('shareHeading')}
        testId="agent-setup-steps"
        trailing={
          serverLaunchable ? (
            <>
              <InfoHint label={t('agentSetup.serverHintLabel')} align="right">
                <p
                  data-testid="agent-connect-server-line"
                  className="break-keep text-body leading-prose text-[color:var(--color-text-secondary)]"
                >
                  {tc('serverLine')}
                </p>
                <p className="mt-2 break-keep text-body leading-prose text-[color:var(--color-text-tertiary)]">
                  {agentSetupReady
                    ? t('agentSetup.rootSummaryReady')
                    : t('agentSetup.rootSummaryMissing')}
                </p>
              </InfoHint>
              <Chip
                size="lg"
                tone="secondary"
                data-testid="agent-setup-verify-open"
                onClick={(event) => {
                  // WebKit pointer activation need not focus a button; capture this exact opener.
                  event.currentTarget.focus({ preventScroll: true });
                  setVerifyOpen(true);
                }}
                className={`${DETAIL_TOGGLE_CHIP} shrink-0 whitespace-nowrap`}
              >
                <CheckCircle2 size={ICON_SIZE.md} aria-hidden />
                {tc('step3Title')}
              </Chip>
            </>
          ) : null
        }
      >
        {clientRows ? (
          AGENT_CLIENTS.map((client) => {
            /*
             * A row that offers a replacement says on the row what it replaces. Only Claude Code
             * and Codex reach this state: Atlas never reads back Cursor's or Antigravity's file.
             */
            const inspected =
              client.id === 'claude-code'
                ? { state: mcpJsonState, path: AGENT_SETUP_FILES[0].path }
                : client.id === 'codex'
                  ? { state: codexConfigState, path: AGENT_SETUP_FILES[1].path }
                  : null;
            const foreignConfig = inspected?.state === 'invalid';
            return (
            <SettingsRow
              key={client.id}
              testId={`agent-setup-row-${client.id}`}
              icon={client.icon}
              iconInk={client.brandInk}
              label={client.name}
              caption={foreignConfig ? t('agentSetup.nextInvalid', { path: inspected.path }) : undefined}
              captionTone={foreignConfig ? 'warning' : 'neutral'}
              /* The file it writes sits beside the control, as a model row's state does, so "ready" and "connect" name it. */
              control={
                foreignConfig ? (
                  clientRows[client.id]
                ) : (
                  <>
                    <span className="min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
                      {client.files.join(' · ')}
                    </span>
                    {clientRows[client.id]}
                  </>
                )
              }
            />
            );
          })
        ) : (
          /* No launchable server (a browser): the degradation card and the by-hand panel are
             the group's whole body — there is no per-tool button to put on a row. */
          <div className="flex flex-col gap-2 p-3">{clientControls.serverUnavailable}</div>
        )}
      </SettingsGroup>
      {clientControls.manualPathNote ? (
        <div className="mt-2 px-1">{clientControls.manualPathNote}</div>
      ) : null}

      {/*
        The check dialog: restart and verify steps Atlas cannot observe itself, ending in the
        proof packet, with the "not working?" fold under them.
      */}
      {serverLaunchable ? (
        <Dialog
          open={verifyOpen}
          onClose={closeVerify}
          size="md"
          labelledBy="agent-setup-verify-title"
          testId="agent-setup-verify-dialog"
          className="max-h-[min(80vh,var(--dialog-max-h))] overflow-y-auto"
        >
          <h2
            id="agent-setup-verify-title"
            className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
          >
            {tc('step3Title')}
          </h2>

          {agentSetupReadyCount > 0 ? (
          <section data-testid="agent-setup-step-2" className="mt-4">
            <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {tc('step2Title')}
            </h3>
            <p className="mt-1 break-keep text-body leading-prose text-[color:var(--color-text-tertiary)]">
              {tc('step2Desc')}
            </p>
          </section>
          ) : null}

          <AgentConnectionStatus
            agentStatus={agentStatus}
            connections={agentSetupConnections}
            agentSetupReady={agentSetupReady}
            readyCount={agentSetupReadyCount}
            vaultName={vaultNameForConfig}
            vaultRootPath={vaultRootPath}
          />

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-controls="agent-setup-advanced"
            data-testid="agent-setup-advanced-toggle"
            className={controlClass({
              shape: 'link',
              size: 'md',
              tone: 'muted',
              className: 'touch-hit-expand mt-4 hover:text-[color:var(--color-text-secondary)]',
            })}
          >
            <ChevronDown
              size={ICON_SIZE.sm}
              aria-hidden
              className="transition-transform"
              style={{ transform: advancedOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            />
            {t('agentSetup.troubleshootToggle')}
          </button>
      <section
        ref={advancedBoxRef}
        id="agent-setup-advanced"
        aria-label={t('agentSetup.troubleshootAriaLabel')}
        data-state={advancedRevealOpen ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!advancedRevealOpen}
      >
        {advancedMounted ? (
          <div
            ref={advancedContentRef}
            data-testid="agent-setup-advanced"
            className="ai-row-disclosure-body flex flex-col gap-4 pt-2"
          >
            <AgentSetupTroubleshooting
              agentStatus={agentStatus}
              connections={agentSetupConnections}
              agentSetupReady={agentSetupReady}
              vaultLoaded={localVault.status === 'loaded'}
              docCount={localVault.manifest?.docs.length ?? 0}
              validationSummary={validationSummary}
              canEditCurrent={canEditCurrent}
              repairBusy={agentSetupBusy}
              /* The message is already on screen; this catch only stops an unhandled rejection
                 from the re-throw that tells the per-tool buttons their write failed. */
              onRepair={() => void handleEnsureAgentConfigs().catch(() => undefined)}
              onOpenWorkflowGuide={onOpenWorkflowGuide}
              copyActions={copyActions}
            />
          </div>
        ) : null}
      </section>
          <div className="mt-4 flex justify-end">
            <Chip size="lg" tone="secondary" onClick={closeVerify} className={NEUTRAL_COPY_CHIP}>
              {tc('close')}
            </Chip>
          </div>
        </Dialog>
      ) : null}
      {agentSetupError ? (
        <p role="alert" className="mt-2 text-label text-[color:var(--color-status-danger)]">
          {agentSetupError}
        </p>
      ) : null}
    </section>
  );
}

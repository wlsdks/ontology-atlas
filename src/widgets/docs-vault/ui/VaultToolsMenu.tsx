'use client';

import { useState } from 'react';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  FilePlus,
  Layers,
  Terminal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  buildAgentSetupCliCommandTemplate,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
  LocalVaultPicker,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  OntologyStarterCta,
} from '@/features/docs-vault-local';
import type { VaultManifest } from '@/entities/docs-vault';
import { copyText } from '@/shared/lib/copy-text';

const AGENT_VERIFY_CLI_COMMAND = [
  'oh-my-ontology validate .',
  'oh-my-ontology workspace-brief .',
  'oh-my-ontology agent-brief . --prompt',
  'oh-my-ontology agent-brief . --graph-db-pack',
  'oh-my-ontology agent-brief . --verify-fallbacks',
  'oh-my-ontology hubs . --plan --limit 10 --types depends_on,relates',
  'oh-my-ontology hubs . --limit 10 --types depends_on,relates',
  'oh-my-ontology mcp-verify . --timeout-ms 15000',
].join('\n');

const AGENT_VERIFY_CLI_PREVIEW = [
  'validate .',
  'workspace-brief .',
  'agent-brief . --prompt',
  'agent-brief . --graph-db-pack',
  'agent-brief . --verify-fallbacks',
];

const AGENT_MODE_PACKET_LINES = [
  'Mode chooser:',
  '- CLI-only: use validate, workspace-brief, graph scans, paths, and graph DB packs without MCP.',
  '- MCP-connected: let Claude Code, Codex, or Cursor call 23 tools with structured repair fields and write guardrails.',
  '- Graph DB pack: use bounded query plans, node/edge scans, domain matrix, paths, and relation explanations without running a database server.',
  '- Setup gate: run the JSON fallback check before edits and treat ok separately from performanceOk.',
];

const AGENT_GATE_PACKET_LINES = [
  'JSON gate result rules:',
  '- ok=false: setup or fallback command execution is broken. Fix config before ontology edits.',
  '- ok=true and performanceOk=false: the local graph works, but fallback latency drift needs attention.',
  '- ok=true and performanceOk=true: setup and fallback performance are ready for read-first agent work.',
];

function buildAgentSetupPacket(vaultName: string): string {
  return [
    'oh-my-ontology agent setup packet',
    '',
    'Use this when Claude Code, Cursor, or Codex is opened at a separate codebase root.',
    'Replace every <absolute path...> placeholder before using the config.',
    '',
    ...AGENT_MODE_PACKET_LINES,
    '',
    ...AGENT_GATE_PACKET_LINES,
    '',
    'Preferred existing-vault repair command from a codebase root:',
    buildAgentSetupCliCommandTemplate(vaultName),
    '',
    'Feature guide:',
    'docs/AGENT-GRAPH-WORKFLOW.md',
    '',
    'Claude Code / Cursor .mcp.json:',
    buildMcpConfigJson(vaultName),
    '',
    'Codex .codex/config.toml:',
    buildCodexConfigTomlTemplate(vaultName),
    '',
    'Codex one-line registration:',
    buildCodexMcpAddCommandTemplate(vaultName),
    '',
    'After registering, restart the agent and paste this verification prompt:',
    ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
    '',
    'CLI fallback from the vault folder:',
    AGENT_VERIFY_CLI_COMMAND,
    '',
    'Machine-readable setup gate for automation:',
    ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  ].join('\n');
}

/**
 * R11 #16 step 1 — DocsVaultPage 의 advanced dropdown body 를 widget 으로 추출.
 * presentational only — open/close state, ref, outside-click 처리는 caller
 * (DocsVaultPage) 가 hold. 이 widget 은 dropdown 이 *열렸을 때* 렌더링되는
 * inner content + 그 안의 핸들러 wiring 만 담당.
 *
 * 추출 의의: 단일 view 1712 LOC 의 ~70 LOC 분리 (4% 감소). 점진적 분리의
 * 첫 step. 다음 step 들에서 trigger / state / outside-click 까지 widget 안으로
 * 흡수해 self-contained 화 가능.
 */

export type DocsVaultView = 'doc' | 'folder-topology';

export type FolderTopoStatus = 'idle' | 'rebuilding' | 'fresh';

interface LocalVaultLike {
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
  agentConfigStatus: {
    mcpJson: boolean;
    codexConfig: boolean;
    mcpExample: boolean;
    mcpJsonValid?: boolean;
    codexConfigValid?: boolean;
    mcpExampleValid?: boolean;
  } | null;
  errorMessage: string | null;
  lastLoadedAt: number | null;
  scaffoldOntology: () => Promise<{ created: number; skipped: number }>;
  ensureAgentConfigs: () => Promise<{ created: number; skipped: number }>;
  open: () => void;
  close: () => void;
  refresh: () => void;
  requestPermission: () => void;
}

interface Props {
  view: DocsVaultView;
  onViewChange: (view: DocsVaultView) => void;
  folderTopoStatus: FolderTopoStatus;
  canEditCurrent: boolean;
  localVault: LocalVaultLike;
  validationSummary: { errorCount: number; warningCount: number } | null;
  onCreateNewDoc: () => void;
  onOpenWorkflowGuide: () => void;
}

export function VaultToolsMenu({
  view,
  onViewChange,
  folderTopoStatus,
  canEditCurrent,
  localVault,
  validationSummary,
  onCreateNewDoc,
  onOpenWorkflowGuide,
}: Props) {
  const t = useTranslations('docsVault');
  const [agentSetupBusy, setAgentSetupBusy] = useState(false);
  const [agentSetupError, setAgentSetupError] = useState<string | null>(null);
  const [agentPromptCopyState, setAgentPromptCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentPacketCopyState, setAgentPacketCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentCliCopyState, setAgentCliCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentJsonGateCopyState, setAgentJsonGateCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentTemplateCopyState, setAgentTemplateCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentSetupCliCopyState, setAgentSetupCliCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentCodexTemplateCopyState, setAgentCodexTemplateCopyState] =
    useState<'idle' | 'copied' | 'failed'>('idle');
  const [agentCodexCliCopyState, setAgentCodexCliCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const agentStatus = localVault.agentConfigStatus;
  const agentSetupReady = Boolean(
    agentStatus?.mcpJson &&
      agentStatus.codexConfig &&
      agentStatus.mcpExample &&
      agentStatus.mcpJsonValid !== false &&
      agentStatus.codexConfigValid !== false &&
      agentStatus.mcpExampleValid !== false,
  );
  const agentSetupFiles = [
    {
      key: 'mcpJson',
      validKey: 'mcpJsonValid',
      path: '.mcp.json',
      label: t('agentSetup.mcpJson'),
    },
    {
      key: 'codexConfig',
      validKey: 'codexConfigValid',
      path: '.codex/config.toml',
      label: t('agentSetup.codexConfig'),
    },
    {
      key: 'mcpExample',
      validKey: 'mcpExampleValid',
      path: '.mcp.json.example',
      label: t('agentSetup.mcpExample'),
    },
  ] as const;
  const agentSetupReadyCount = agentStatus
    ? agentSetupFiles.filter(
        (file) =>
          agentStatus[file.key] && agentStatus[file.validKey] !== false,
      ).length
    : 0;
  const nextMissingAgentConfig = agentStatus
    ? agentSetupFiles.find(
        (file) => !agentStatus[file.key] || agentStatus[file.validKey] === false,
      )
    : null;
  const hasMissingAgentConfig = agentStatus
    ? agentSetupFiles.some((file) => !agentStatus[file.key])
    : false;
  const hasInvalidAgentConfig = agentStatus
    ? agentSetupFiles.some(
        (file) => agentStatus[file.key] && agentStatus[file.validKey] === false,
      )
    : false;
  const agentSetupSteps = [
    {
      key: 'configs',
      label: t('agentSetup.stepConfigs'),
      complete: agentSetupReadyCount === agentSetupFiles.length,
    },
    {
      key: 'restart',
      label: t('agentSetup.stepRestart'),
      complete: agentSetupReady,
    },
    {
      key: 'gate',
      label: t('agentSetup.stepGate'),
      complete: false,
    },
  ];

  async function handleEnsureAgentConfigs() {
    setAgentSetupError(null);
    setAgentSetupBusy(true);
    try {
      await localVault.ensureAgentConfigs();
    } catch (err) {
      setAgentSetupError(
        err instanceof Error ? err.message : t('agentSetup.errorFallback'),
      );
    } finally {
      setAgentSetupBusy(false);
    }
  }

  async function handleCopyAgentVerifyPrompt() {
    const copied = await copyText(ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT);
    setAgentPromptCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentSetupPacket() {
    const copied = await copyText(
      buildAgentSetupPacket(localVault.handle?.name ?? 'vault'),
    );
    setAgentPacketCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentVerifyCli() {
    const copied = await copyText(AGENT_VERIFY_CLI_COMMAND);
    setAgentCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentJsonGate() {
    const copied = await copyText(ONTOLOGY_STARTER_JSON_GATE_COMMAND);
    setAgentJsonGateCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentConfigTemplate() {
    const copied = await copyText(
      buildMcpConfigJson(localVault.handle?.name ?? 'vault'),
    );
    setAgentTemplateCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentSetupCliCommand() {
    const copied = await copyText(
      buildAgentSetupCliCommandTemplate(localVault.handle?.name ?? 'vault'),
    );
    setAgentSetupCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyCodexConfigTemplate() {
    const copied = await copyText(
      buildCodexConfigTomlTemplate(localVault.handle?.name ?? 'vault'),
    );
    setAgentCodexTemplateCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyCodexMcpAddCommand() {
    const copied = await copyText(
      buildCodexMcpAddCommandTemplate(localVault.handle?.name ?? 'vault'),
    );
    setAgentCodexCliCopyState(copied ? 'copied' : 'failed');
  }

  const copyPromptLabel =
    agentPromptCopyState === 'copied'
      ? t('agentSetup.copyPromptCopied')
      : agentPromptCopyState === 'failed'
        ? t('agentSetup.copyPromptFailed')
        : t('agentSetup.copyPrompt');

  const copyPacketLabel =
    agentPacketCopyState === 'copied'
      ? t('agentSetup.copyPacketCopied')
      : agentPacketCopyState === 'failed'
        ? t('agentSetup.copyPacketFailed')
        : t('agentSetup.copyPacket');

  const copyCliLabel =
    agentCliCopyState === 'copied'
      ? t('agentSetup.copyCliCopied')
      : agentCliCopyState === 'failed'
        ? t('agentSetup.copyCliFailed')
        : t('agentSetup.copyCli');

  const copyJsonGateLabel =
    agentJsonGateCopyState === 'copied'
      ? t('agentSetup.copyJsonGateCopied')
      : agentJsonGateCopyState === 'failed'
        ? t('agentSetup.copyJsonGateFailed')
        : t('agentSetup.copyJsonGate');

  const copyTemplateLabel =
    agentTemplateCopyState === 'copied'
      ? t('agentSetup.copyTemplateCopied')
      : agentTemplateCopyState === 'failed'
        ? t('agentSetup.copyTemplateFailed')
        : t('agentSetup.copyTemplate');

  const copySetupCliLabel =
    agentSetupCliCopyState === 'copied'
      ? t('agentSetup.copySetupCliCopied')
      : agentSetupCliCopyState === 'failed'
        ? t('agentSetup.copySetupCliFailed')
        : t('agentSetup.copySetupCli');

  const copyCodexTemplateLabel =
    agentCodexTemplateCopyState === 'copied'
      ? t('agentSetup.copyCodexTemplateCopied')
      : agentCodexTemplateCopyState === 'failed'
        ? t('agentSetup.copyCodexTemplateFailed')
        : t('agentSetup.copyCodexTemplate');

  const copyCodexCliLabel =
    agentCodexCliCopyState === 'copied'
      ? t('agentSetup.copyCodexCliCopied')
      : agentCodexCliCopyState === 'failed'
        ? t('agentSetup.copyCodexCliFailed')
        : t('agentSetup.copyCodexCli');

  return (
    <div
      role="menu"
      className="fixed inset-x-3 top-24 z-30 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(14,15,18,0.98)] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.38)] md:absolute md:inset-x-auto md:right-0 md:top-10 md:max-h-[calc(100dvh-5rem)] md:w-[300px]"
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={view === 'folder-topology'}
        onClick={() =>
          onViewChange(view === 'folder-topology' ? 'doc' : 'folder-topology')
        }
        className={`inline-flex w-full items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-[11px] transition-colors ${
          view === 'folder-topology'
            ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
            : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
        }`}
      >
        <Layers size={12} aria-hidden />
        {t('advanced.viewTopology')}
        {folderTopoStatus === 'rebuilding' ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)]"
          />
        ) : null}
      </button>
      <div className="my-2 h-px bg-[color:var(--color-border-soft)]" />
      <div className="space-y-2">
        <LocalVaultPicker
          status={localVault.status}
          handleName={localVault.handle?.name ?? null}
          docCount={localVault.manifest?.docs.length ?? 0}
          errorMessage={localVault.errorMessage}
          lastLoadedAt={localVault.lastLoadedAt}
          validationSummary={validationSummary}
          onOpen={localVault.open}
          onClose={localVault.close}
          onRefresh={localVault.refresh}
          onRequestPermission={localVault.requestPermission}
        />
        {localVault.status === 'loaded' && agentStatus ? (
          <section
            aria-label={t('agentSetup.ariaLabel')}
            className="rounded-md border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(94,106,210,0.06)] p-2.5"
          >
            <div className="flex items-start gap-2">
              <Bot
                size={14}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-indigo-accent)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11.5px] font-medium text-[color:var(--color-text-primary)]">
                    {t('agentSetup.title')}
                  </h3>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${
                      agentSetupReady
                        ? 'bg-[color:rgba(50,185,125,0.12)] text-[color:rgba(130,230,180,0.92)]'
                        : 'bg-[color:rgba(239,180,120,0.12)] text-[color:rgba(244,196,130,0.92)]'
                    }`}
                  >
                    {agentSetupReady
                      ? t('agentSetup.ready')
                      : t('agentSetup.missing')}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {t('agentSetup.statusSummary', {
                    ready: agentSetupReadyCount,
                    total: agentSetupFiles.length,
                  })}
                  {nextMissingAgentConfig ? (
                    <span className="block font-mono text-[10px] text-[color:rgba(244,196,130,0.92)]">
                      {agentStatus[nextMissingAgentConfig.key]
                        ? t('agentSetup.nextInvalid', {
                            path: nextMissingAgentConfig.path,
                          })
                        : t('agentSetup.nextMissing', {
                            path: nextMissingAgentConfig.path,
                      })}
                    </span>
                  ) : null}
                </p>
                <ol
                  aria-label={t('agentSetup.nextStepsAriaLabel')}
                  className="mt-2 grid gap-1.5"
                >
                  {agentSetupSteps.map((step, index) => (
                    <li
                      key={step.key}
                      className="grid grid-cols-[18px_1fr] items-start gap-1.5 rounded-sm border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(0,0,0,0.12)] px-1.5 py-1"
                    >
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-sm font-mono text-[9px] ${
                          step.complete
                            ? 'bg-[color:rgba(50,185,125,0.12)] text-[color:rgba(130,230,180,0.9)]'
                            : 'bg-[color:rgba(94,106,210,0.14)] text-[color:rgba(200,210,255,0.9)]'
                        }`}
                      >
                        {step.complete ? '✓' : index + 1}
                      </span>
                      <span className="break-keep text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 grid gap-1.5">
                  {agentSetupFiles.map(({ key, validKey, path, label }) => {
                    const present = Boolean(agentStatus[key]);
                    const valid = agentStatus[validKey] !== false;
                    return (
                      <div
                        key={key}
                        className="grid grid-cols-[14px_1fr] items-start gap-1.5 text-[11px] leading-4 text-[color:var(--color-text-secondary)]"
                      >
                        {present && valid ? (
                          <CheckCircle2
                            size={12}
                            aria-hidden
                            className="mt-0.5 text-[color:rgba(130,230,180,0.9)]"
                          />
                        ) : (
                          <CircleAlert
                            size={12}
                            aria-hidden
                            className="mt-0.5 text-[color:rgba(244,196,130,0.92)]"
                          />
                        )}
                        <span>
                          <code className="font-mono text-[10.5px] text-[color:var(--color-text-primary)]">
                            {path}
                          </code>{' '}
                          <span className="text-[color:var(--color-text-tertiary)]">
                            {label}
                          </span>
                          {present && !valid ? (
                            <span className="ml-1 text-[color:rgba(244,196,130,0.92)]">
                              {t('agentSetup.needsReview')}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {hasMissingAgentConfig && canEditCurrent ? (
                  <button
                    type="button"
                    onClick={() => void handleEnsureAgentConfigs()}
                    disabled={agentSetupBusy}
                    title={t('agentSetup.repairTitle')}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.94)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.16)] disabled:opacity-60"
                  >
                    <Bot size={12} aria-hidden />
                    {agentSetupBusy
                      ? t('agentSetup.repairing')
                      : t('agentSetup.repair')}
                  </button>
                ) : null}
                {hasInvalidAgentConfig ? (
                  <p className="mt-2 break-keep rounded-sm border border-[color:rgba(244,196,130,0.18)] bg-[color:rgba(239,180,120,0.08)] px-2 py-1.5 text-[10.5px] leading-4 text-[color:rgba(244,196,130,0.92)]">
                    {t('agentSetup.invalidRepairHint')}
                  </p>
                ) : null}
                <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                  {t('agentSetup.verifyGroup')}
                </div>
                <dl
                  aria-label={t('agentSetup.modeChooserAriaLabel')}
                  className="mt-1.5 grid gap-1"
                >
                  {[
                    {
                      term: t('agentSetup.modeCliTerm'),
                      desc: t('agentSetup.modeCliDesc'),
                    },
                    {
                      term: t('agentSetup.modeMcpTerm'),
                      desc: t('agentSetup.modeMcpDesc'),
                    },
                    {
                      term: t('agentSetup.modeGraphTerm'),
                      desc: t('agentSetup.modeGraphDesc'),
                    },
                  ].map((mode) => (
                    <div
                      key={mode.term}
                      className="rounded-sm border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1"
                    >
                      <dt className="text-[10.5px] font-medium text-[color:var(--color-text-secondary)]">
                        {mode.term}
                      </dt>
                      <dd className="mt-0.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {mode.desc}
                      </dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={onOpenWorkflowGuide}
                  title={t('agentSetup.openWorkflowGuideTitle')}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.09)] px-2 py-1.5 text-[11.5px] text-[color:rgba(210,216,255,0.94)] transition-colors hover:border-[color:rgba(139,151,255,0.52)] hover:bg-[color:rgba(94,106,210,0.14)]"
                >
                  <BookOpen size={12} aria-hidden />
                  {t('agentSetup.openWorkflowGuide')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentSetupPacket()}
                  title={t('agentSetup.copyPacketTitle')}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.42)] bg-[color:rgba(94,106,210,0.10)] px-2 py-1.5 text-[11.5px] text-[color:rgba(210,216,255,0.94)] transition-colors hover:border-[color:rgba(94,106,210,0.62)] hover:bg-[color:rgba(94,106,210,0.15)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyPacketLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentVerifyPrompt()}
                  title={t('agentSetup.copyPromptTitle')}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyPromptLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentVerifyCli()}
                  title={t('agentSetup.copyCliTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copyCliLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentJsonGate()}
                  title={t('agentSetup.copyJsonGateTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(130,230,180,0.28)] bg-[color:rgba(50,185,125,0.07)] px-2 py-1.5 text-[11.5px] text-[color:rgba(180,235,205,0.94)] transition-colors hover:border-[color:rgba(130,230,180,0.42)] hover:bg-[color:rgba(50,185,125,0.11)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copyJsonGateLabel}
                </button>
                <div className="mt-1.5 rounded-sm border border-[color:rgba(130,230,180,0.18)] bg-[color:rgba(0,0,0,0.16)] px-2 py-1.5">
                  <div className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[color:rgba(130,230,180,0.78)]">
                    {t('agentSetup.jsonGateLabel')}
                  </div>
                  <code className="mt-1 block truncate font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                    {ONTOLOGY_STARTER_JSON_GATE_COMMAND}
                  </code>
                </div>
                <dl
                  aria-label={t('agentSetup.gateRulesAriaLabel')}
                  className="mt-1.5 grid gap-1"
                >
                  {[
                    {
                      term: t('agentSetup.gateBrokenTerm'),
                      desc: t('agentSetup.gateBrokenDesc'),
                    },
                    {
                      term: t('agentSetup.gateSlowTerm'),
                      desc: t('agentSetup.gateSlowDesc'),
                    },
                    {
                      term: t('agentSetup.gateReadyTerm'),
                      desc: t('agentSetup.gateReadyDesc'),
                    },
                  ].map((rule) => (
                    <div
                      key={rule.term}
                      className="grid grid-cols-[92px_1fr] gap-2 rounded-sm border border-[color:rgba(130,230,180,0.12)] bg-[color:rgba(50,185,125,0.035)] px-2 py-1"
                    >
                      <dt className="truncate font-mono text-[9.5px] text-[color:rgba(180,235,205,0.94)]">
                        {rule.term}
                      </dt>
                      <dd className="break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {rule.desc}
                      </dd>
                    </div>
                  ))}
                </dl>
                <ol className="mt-1.5 grid gap-1" aria-label={t('agentSetup.cliPreviewAriaLabel')}>
                  {AGENT_VERIFY_CLI_PREVIEW.map((command, index) => (
                    <li
                      key={command}
                      className="grid grid-cols-[18px_1fr] items-center gap-1.5 rounded-sm border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(0,0,0,0.14)] px-1.5 py-1"
                    >
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[color:rgba(94,106,210,0.14)] font-mono text-[9px] text-[color:rgba(200,210,255,0.9)]">
                        {index + 1}
                      </span>
                      <code className="truncate font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                        oh-my-ontology {command}
                      </code>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
                  {t('agentSetup.connectGroup')}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentSetupCliCommand()}
                  title={t('agentSetup.copySetupCliTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(130,230,180,0.28)] bg-[color:rgba(50,185,125,0.07)] px-2 py-1.5 text-[11.5px] text-[color:rgba(180,235,205,0.94)] transition-colors hover:border-[color:rgba(130,230,180,0.42)] hover:bg-[color:rgba(50,185,125,0.11)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copySetupCliLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentConfigTemplate()}
                  title={t('agentSetup.copyTemplateTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyTemplateLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyCodexConfigTemplate()}
                  title={t('agentSetup.copyCodexTemplateTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copyCodexTemplateLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyCodexMcpAddCommand()}
                  title={t('agentSetup.copyCodexCliTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copyCodexCliLabel}
                </button>
                {agentSetupError ? (
                  <p
                    role="alert"
                    className="mt-2 text-[11px] leading-4 text-[color:var(--color-status-danger)]"
                  >
                    {agentSetupError}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
        {/* dogfood hint + ontology starter CTA — vault 가 *비어 있으면*
            scaffold 버튼 prominent 노출 (Option D), 기존 vault 면 작은
            보조 버튼. 사용자 비전 ("비개발자도 같이") 의 핵심 진입점 —
            터미널 / npm 없이 5 md + agent MCP 설정 시드 작성. */}
        {localVault.status === 'idle' ? (
          <p className="text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('advanced.ontologyHintPrefix')}
            <code className="rounded bg-[color:var(--color-overlay-1)] px-1 py-0.5 font-mono text-[10.5px] text-[color:var(--color-indigo-accent)]">
              docs/ontology/
            </code>
            {t('advanced.ontologyHintSuffix')}
          </p>
        ) : null}
        {localVault.status === 'loaded' && canEditCurrent ? (
          <OntologyStarterCta
            onScaffold={localVault.scaffoldOntology}
            docCount={localVault.manifest?.docs.length ?? 0}
          />
        ) : null}
        {canEditCurrent ? (
          <button
            type="button"
            onClick={onCreateNewDoc}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.08)] px-2.5 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.14)]"
          >
            <FilePlus size={12} aria-hidden />
            {t('advanced.newDoc')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

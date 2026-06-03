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
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
  buildOntologyStarterAgentVerifyPrompt,
  buildOntologyStarterJsonGateCommand,
  LocalVaultPicker,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
  OntologyStarterCta,
} from '@/features/docs-vault-local';
import { formatAgentPostChangeSyncPacket } from '@/shared/lib/ontology-tree';
import type { VaultManifest } from '@/entities/docs-vault';
import { copyText } from '@/shared/lib/copy-text';
import {
  getTauriVaultRootPath,
  openTauriVaultInFinder,
} from '@/shared/lib/tauri-vault-fs';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

function buildAgentVerifyCliCommand(vaultPath?: string | null): string {
  const target = vaultPath ? shellQuoteForPacket(vaultPath) : '.';
  return [
    `oh-my-ontology validate ${target}`,
    `oh-my-ontology workspace-brief ${target}`,
    `oh-my-ontology agent-brief ${target} --prompt`,
    `oh-my-ontology agent-brief ${target} --graph-db-pack`,
    `oh-my-ontology agent-brief ${target} --verify-fallbacks`,
    `oh-my-ontology agent-brief ${target} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    `oh-my-ontology hubs ${target} --plan --limit 10 --types depends_on,relates`,
    `oh-my-ontology hubs ${target} --limit 10 --types depends_on,relates`,
    `oh-my-ontology mcp-verify ${target} --timeout-ms 15000`,
  ].join('\n');
}

const AGENT_VERIFY_CLI_COMMAND = buildAgentVerifyCliCommand();

const AGENT_VERIFY_CLI_PREVIEW = [
  'validate .',
  'workspace-brief .',
  'agent-brief . --prompt',
  'agent-brief . --graph-db-pack',
  'agent-brief . --verify-fallbacks',
  'agent-brief . --verify-fallbacks --json',
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

const AGENT_FIRST_CONTACT_PROOF_CONTRACT_LINES = [
  'First-contact proof contract:',
  '- Config state: agent-setup --json reports root-specific Claude Code / Cursor and Codex config readiness before repair.',
  '- MCP verify: mcp-verify can boot the local MCP server, list the 23 tools, and read the target vault.',
  '- JSON setup gate: agent-brief --verify-fallbacks --json returns ok/performanceOk before the agent edits.',
  '- Graph briefs: workspace-brief and agent-brief --graph-db-pack describe the same local vault before writes.',
];

const AGENT_MCP_CONNECTED_PROOF_LINES = [
  'MCP-connected proof:',
  '1. query_ontology({"operation":"workspace_brief","limit":5})',
  '2. query_ontology({"operation":"agent_brief","limit":5})',
  '3. query_ontology({"operation":"health","limit":5})',
  '4. query_ontology({"operation":"query_plan","targetOperation":"match_nodes","kind":"capability","minDegree":2,"sort":"degree","limit":10})',
  '5. query_ontology({"operation":"match_nodes","kind":"capability","minDegree":2,"sort":"degree","limit":10})',
  'Use these MCP calls only after mcp-verify succeeds; if MCP is unavailable, use the CLI proof below.',
];

function vaultPathForPacket(vaultName: string, vaultPath?: string | null): string {
  return vaultPath ?? `<absolute path to your ${vaultName} folder>`;
}

function buildAgentSetupCliCommand(
  vaultName: string,
  mode: 'json' | 'write',
  vaultPath?: string | null,
): string {
  const command = [
    'oh-my-ontology',
    'agent-setup',
    shellQuoteForPacket(vaultPathForPacket(vaultName, vaultPath)),
    '--root',
    shellQuoteForPacket('<absolute path to your codebase root>'),
  ];
  command.push(mode === 'json' ? '--json' : '--write');
  return command.join(' ');
}

function buildAgentFirstContactProofPacket(
  vaultName: string,
  vaultPath?: string | null,
): string {
  const vaultPathLabel = vaultPathForPacket(vaultName, vaultPath);
  const vaultPathArg = shellQuoteForPacket(vaultPathLabel);
  const setupStateCommand = buildAgentSetupCliCommand(vaultName, 'json', vaultPath);

  return [
    'oh-my-ontology first-contact agent proof',
    '',
    'Run these before Claude Code, Codex, or Cursor edits the codebase with this ontology.',
    '',
    'Setup gate:',
    `1. ${setupStateCommand}`,
    `2. If setup state reports missing configs: ${buildAgentSetupCliCommand(vaultName, 'write', vaultPath)}`,
    `3. Restart Claude Code / Cursor / Codex from the codebase root after repair.`,
    `4. oh-my-ontology mcp-verify ${vaultPathArg} --timeout-ms 15000`,
    `5. oh-my-ontology agent-brief ${vaultPathArg} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    '',
    'Read-first graph proof:',
    ...AGENT_MCP_CONNECTED_PROOF_LINES,
    '',
    'CLI fallback proof:',
    `1. oh-my-ontology workspace-brief ${vaultPathArg}`,
    `2. oh-my-ontology agent-brief ${vaultPathArg} --prompt`,
    `3. oh-my-ontology agent-brief ${vaultPathArg} --graph-db-pack`,
    '',
    ...AGENT_FIRST_CONTACT_PROOF_CONTRACT_LINES,
    '',
    ...AGENT_GATE_PACKET_LINES,
    '',
    ...ONTOLOGY_POST_CHANGE_SYNC_LINES,
  ].join('\n');
}

function buildAgentSetupPacket(vaultName: string, vaultPath?: string | null): string {
  const vaultPathLabel = vaultPathForPacket(vaultName, vaultPath);
  const vaultPathArg = shellQuoteForPacket(vaultPathLabel);
  const codebaseRootPlaceholder = '<absolute path to your codebase root>';
  const setupStateCommand = buildAgentSetupCliCommand(vaultName, 'json', vaultPath);
  const setupRepairCommand = buildAgentSetupCliCommand(vaultName, 'write', vaultPath);

  return [
    'oh-my-ontology agent setup packet',
    '',
    'Use this when Claude Code, Cursor, or Codex is opened at a separate codebase root.',
    vaultPath
      ? 'The ontology vault path below came from the installed desktop app; replace only the agent root placeholder before using codebase-root commands.'
      : 'Replace every <absolute path...> placeholder before using the config.',
    '',
    'Root check:',
    `- Agent root: ${codebaseRootPlaceholder}`,
    `- Ontology vault: ${vaultPathLabel}`,
    '- Run the setup gate from the agent root; pass the ontology vault path explicitly when the vault is not the cwd.',
    '',
    ...AGENT_MODE_PACKET_LINES,
    '',
    ...AGENT_GATE_PACKET_LINES,
    '',
    ...AGENT_FIRST_CONTACT_PROOF_CONTRACT_LINES,
    '',
    ...ONTOLOGY_POST_CHANGE_SYNC_LINES,
    '',
    ...AGENT_MCP_CONNECTED_PROOF_LINES,
    '',
    'Read-first run order from a codebase root:',
    `1. Check config state: ${setupStateCommand}`,
    `2. Repair only if state reports missing configs: ${setupRepairCommand}`,
    '3. Restart Claude Code / Cursor / Codex from the agent root.',
    `4. Verify MCP tools: oh-my-ontology mcp-verify ${vaultPathArg} --timeout-ms 15000`,
    `5. Gate fallback performance: oh-my-ontology agent-brief ${vaultPathArg} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    `6. Read the graph: oh-my-ontology workspace-brief ${vaultPathArg} && oh-my-ontology agent-brief ${vaultPathArg} --prompt`,
    '',
    'Preferred existing-vault repair command from a codebase root:',
    setupRepairCommand,
    '',
    'Feature guide:',
    'docs/AGENT-GRAPH-WORKFLOW.md',
    '',
    'Claude Code / Cursor .mcp.json:',
    buildMcpConfigJson(vaultName, vaultPath),
    '',
    'Codex .codex/config.toml:',
    buildCodexConfigTomlTemplate(vaultName, vaultPath),
    '',
    'Codex one-line registration:',
    buildCodexMcpAddCommandTemplate(vaultName, vaultPath),
    '',
    'After registering, restart the agent and paste this verification prompt:',
    ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
    '',
    'CLI fallback from the vault folder:',
    AGENT_VERIFY_CLI_COMMAND,
    '',
    'Machine-readable setup gate for automation from the codebase root:',
    `oh-my-ontology agent-brief ${vaultPathArg} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    '',
    'Machine-readable setup gate when the vault folder is the current directory:',
    ONTOLOGY_STARTER_JSON_GATE_COMMAND,
    '',
    'Machine-readable config state check before repair:',
    setupStateCommand,
  ].join('\n');
}

function shellQuoteForPacket(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
  recentVaults: LocalFsHandleRecord[];
  open: () => void;
  openRecent: (record: LocalFsHandleRecord) => void;
  forgetRecent: (record: LocalFsHandleRecord) => void;
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
  const [agentPostChangeSyncCopyState, setAgentPostChangeSyncCopyState] =
    useState<'idle' | 'copied' | 'failed'>('idle');
  const [agentFirstContactProofCopyState, setAgentFirstContactProofCopyState] =
    useState<'idle' | 'copied' | 'failed'>('idle');
  const [agentTemplateCopyState, setAgentTemplateCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentSetupCheckCliCopyState, setAgentSetupCheckCliCopyState] =
    useState<'idle' | 'copied' | 'failed'>('idle');
  const [agentSetupCliCopyState, setAgentSetupCliCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [agentCodexTemplateCopyState, setAgentCodexTemplateCopyState] =
    useState<'idle' | 'copied' | 'failed'>('idle');
  const [agentCodexCliCopyState, setAgentCodexCliCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const [vaultRevealError, setVaultRevealError] = useState<string | null>(null);
  const agentStatus = localVault.agentConfigStatus;
  const vaultRootPath = localVault.handle
    ? getTauriVaultRootPath(localVault.handle)
    : null;
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
  const agentSetupConnections = [
    {
      key: 'claudeCursor',
      file: agentSetupFiles[0],
      label: t('agentSetup.connectionClaudeCursor'),
      check: t('agentSetup.connectionClaudeCursorCheck'),
    },
    {
      key: 'codex',
      file: agentSetupFiles[1],
      label: t('agentSetup.connectionCodex'),
      check: t('agentSetup.connectionCodexCheck'),
    },
    {
      key: 'codebaseRoot',
      file: agentSetupFiles[2],
      label: t('agentSetup.connectionCodebaseRoot'),
      check: t('agentSetup.connectionCodebaseRootCheck'),
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
      key: 'connectionCheck',
      label: t('agentSetup.stepConnectionCheck'),
      complete: false,
    },
    {
      key: 'gate',
      label: t('agentSetup.stepGate'),
      complete: false,
    },
    {
      key: 'mcpVerify',
      label: t('agentSetup.stepMcpVerify'),
      complete: false,
    },
    {
      key: 'graphProof',
      label: t('agentSetup.stepGraphProof'),
      complete: false,
    },
  ];
  const validationState = validationSummary
    ? validationSummary.errorCount > 0
      ? 'error'
      : validationSummary.warningCount > 0
        ? 'warning'
        : 'clean'
    : 'unknown';
  const agentSetupProofRows = [
    {
      key: 'vault',
      label: t('agentSetup.proofVault'),
      value: t('agentSetup.proofVaultLoaded', {
        count: localVault.manifest?.docs.length ?? 0,
      }),
      state: localVault.status === 'loaded' ? 'ready' : 'warning',
    },
    {
      key: 'health',
      label: t('agentSetup.proofHealth'),
      value:
        validationState === 'clean'
          ? t('agentSetup.proofHealthClean')
          : validationState === 'warning'
            ? t('agentSetup.proofHealthWarnings', {
                count: validationSummary?.warningCount ?? 0,
              })
            : validationState === 'error'
              ? t('agentSetup.proofHealthErrors', {
                  count: validationSummary?.errorCount ?? 0,
                })
              : t('agentSetup.proofHealthUnknown'),
      state:
        validationState === 'clean'
          ? 'ready'
          : validationState === 'error'
            ? 'blocked'
            : 'warning',
    },
    {
      key: 'configs',
      label: t('agentSetup.proofConfigs'),
      value: agentSetupReady
        ? t('agentSetup.proofConfigsReady')
        : t('agentSetup.proofConfigsMissing', {
            ready: agentSetupReadyCount,
            total: agentSetupFiles.length,
      }),
      state: agentSetupReady ? 'ready' : 'warning',
    },
    {
      key: 'agentRoot',
      label: t('agentSetup.proofAgentRoot'),
      value: agentSetupReady
        ? t('agentSetup.proofAgentRootReady')
        : t('agentSetup.proofAgentRootNeedsTemplate'),
      state: agentSetupReady ? 'manual' : 'warning',
    },
    {
      key: 'jsonGate',
      label: t('agentSetup.proofJsonGate'),
      value: t('agentSetup.proofJsonGateManual'),
      state: 'manual',
    },
  ] as const;
  const agentFirstContactProofRows = [
    {
      key: 'configState',
      label: t('agentSetup.proofContractConfigState'),
      value: t('agentSetup.proofContractConfigStateDesc'),
    },
    {
      key: 'mcpVerify',
      label: t('agentSetup.proofContractMcpVerify'),
      value: t('agentSetup.proofContractMcpVerifyDesc'),
    },
    {
      key: 'jsonGate',
      label: t('agentSetup.proofContractJsonGate'),
      value: t('agentSetup.proofContractJsonGateDesc'),
    },
    {
      key: 'graphBriefs',
      label: t('agentSetup.proofContractGraphBriefs'),
      value: t('agentSetup.proofContractGraphBriefsDesc'),
    },
  ] as const;

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
    const copied = await copyText(buildOntologyStarterAgentVerifyPrompt(vaultRootPath));
    setAgentPromptCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentSetupPacket() {
    const copied = await copyText(
      buildAgentSetupPacket(localVault.handle?.name ?? 'vault', vaultRootPath),
    );
    setAgentPacketCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentVerifyCli() {
    const copied = await copyText(buildAgentVerifyCliCommand(vaultRootPath));
    setAgentCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentJsonGate() {
    const copied = await copyText(buildOntologyStarterJsonGateCommand(vaultRootPath));
    setAgentJsonGateCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentPostChangeSyncGate() {
    const copied = await copyText(formatAgentPostChangeSyncPacket());
    setAgentPostChangeSyncCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentFirstContactProof() {
    const copied = await copyText(
      buildAgentFirstContactProofPacket(localVault.handle?.name ?? 'vault', vaultRootPath),
    );
    setAgentFirstContactProofCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentConfigTemplate() {
    const copied = await copyText(
      buildMcpConfigJson(localVault.handle?.name ?? 'vault'),
    );
    setAgentTemplateCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentSetupCheckCliCommand() {
    const copied = await copyText(
      buildAgentSetupCliCommand(localVault.handle?.name ?? 'vault', 'json', vaultRootPath),
    );
    setAgentSetupCheckCliCopyState(copied ? 'copied' : 'failed');
  }

  async function handleCopyAgentSetupCliCommand() {
    const copied = await copyText(
      buildAgentSetupCliCommand(localVault.handle?.name ?? 'vault', 'write', vaultRootPath),
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

  async function handleRevealVaultPath(rootPath: string) {
    setVaultRevealError(null);
    try {
      await openTauriVaultInFinder(rootPath);
    } catch (err) {
      setVaultRevealError(err instanceof Error ? err.message : t('vaultReveal.errorFallback'));
    }
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

  const copyPostChangeSyncLabel =
    agentPostChangeSyncCopyState === 'copied'
      ? t('agentSetup.copyPostChangeSyncCopied')
      : agentPostChangeSyncCopyState === 'failed'
        ? t('agentSetup.copyPostChangeSyncFailed')
        : t('agentSetup.copyPostChangeSync');

  const copyFirstContactProofLabel =
    agentFirstContactProofCopyState === 'copied'
      ? t('agentSetup.copyFirstContactProofCopied')
      : agentFirstContactProofCopyState === 'failed'
        ? t('agentSetup.copyFirstContactProofFailed')
        : t('agentSetup.copyFirstContactProof');

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

  const copySetupCheckCliLabel =
    agentSetupCheckCliCopyState === 'copied'
      ? t('agentSetup.copySetupCheckCliCopied')
      : agentSetupCheckCliCopyState === 'failed'
        ? t('agentSetup.copySetupCheckCliFailed')
        : t('agentSetup.copySetupCheckCli');

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
  const agentJsonGatePreview = buildOntologyStarterJsonGateCommand(vaultRootPath);

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
          rootPath={vaultRootPath}
          docCount={localVault.manifest?.docs.length ?? 0}
          errorMessage={localVault.errorMessage}
          lastLoadedAt={localVault.lastLoadedAt}
          validationSummary={validationSummary}
          recentVaults={localVault.recentVaults}
          onOpen={localVault.open}
          onOpenRecent={localVault.openRecent}
          onForgetRecent={localVault.forgetRecent}
          onClose={localVault.close}
          onRefresh={localVault.refresh}
          onRequestPermission={localVault.requestPermission}
          onReveal={handleRevealVaultPath}
        />
        {vaultRevealError ? (
          <p className="rounded-sm border border-[color:rgba(229,72,77,0.24)] bg-[color:rgba(229,72,77,0.08)] px-2 py-1 text-[10.5px] leading-4 text-[color:var(--color-status-danger)]">
            {t('vaultReveal.error', { message: vaultRevealError })}
          </p>
        ) : null}
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
                <p className="mt-1 text-[10.5px] leading-4 text-[color:rgba(200,210,255,0.82)]">
                  {agentSetupReady
                    ? t('agentSetup.rootSummaryReady')
                    : t('agentSetup.rootSummaryMissing')}
                </p>
                <ul
                  aria-label={t('agentSetup.connectionAriaLabel')}
                  className="mt-2 grid gap-1"
                >
                  {agentSetupConnections.map(({ key, file, label, check }) => {
                    const present = Boolean(agentStatus[file.key]);
                    const valid = agentStatus[file.validKey] !== false;
                    const ready = present && valid;
                    return (
                      <li
                        key={key}
                        className="grid grid-cols-[14px_1fr] gap-1.5 rounded-sm border border-[color:rgba(139,151,255,0.12)] bg-[color:rgba(0,0,0,0.12)] px-1.5 py-1"
                      >
                        {ready ? (
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
                        <span className="min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-[10.5px] font-medium text-[color:var(--color-text-secondary)]">
                              {label}
                            </span>
                            <span
                              className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[9.5px] ${
                                ready
                                  ? 'bg-[color:rgba(50,185,125,0.1)] text-[color:rgba(130,230,180,0.92)]'
                                  : 'bg-[color:rgba(239,180,120,0.1)] text-[color:rgba(244,196,130,0.92)]'
                              }`}
                            >
                              {ready
                                ? t('agentSetup.connectionReady')
                                : t('agentSetup.connectionNeedsReview')}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[9.5px] text-[color:var(--color-text-tertiary)]">
                            {check}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {t('agentSetup.connectionHint')}
                </p>
                <p className="mt-2 break-keep rounded-sm border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1.5 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  <span className="font-medium text-[color:var(--color-text-secondary)]">
                    {t('agentSetup.boundaryTitle')}
                  </span>{' '}
                  {t('agentSetup.boundaryDesc')}
                </p>
                <details className="mt-2 rounded-sm border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1.5">
                  <summary className="cursor-pointer select-none text-[10.5px] font-medium text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]">
                    {t('agentSetup.nextStepsSummary')}
                  </summary>
                  <ol
                    aria-label={t('agentSetup.nextStepsAriaLabel')}
                    className="mt-1.5 grid gap-1"
                  >
                    {agentSetupSteps.map((step, index) => (
                      <li
                        key={step.key}
                        className="grid grid-cols-[18px_1fr] items-start gap-1.5 rounded-sm border border-[color:rgba(255,255,255,0.045)] bg-[color:rgba(255,255,255,0.018)] px-1.5 py-1"
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
                </details>
                <dl
                  aria-label={t('agentSetup.proofAriaLabel')}
                  className="mt-2 grid gap-1"
                >
                  {agentSetupProofRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[14px_76px_1fr] items-start gap-1.5 rounded-sm border border-[color:rgba(255,255,255,0.055)] bg-[color:rgba(0,0,0,0.12)] px-1.5 py-1"
                    >
                      {row.state === 'ready' ? (
                        <CheckCircle2
                          size={12}
                          aria-hidden
                          className="mt-0.5 text-[color:rgba(130,230,180,0.9)]"
                        />
                      ) : row.state === 'blocked' ? (
                        <CircleAlert
                          size={12}
                          aria-hidden
                          className="mt-0.5 text-[color:var(--color-status-danger)]"
                        />
                      ) : row.state === 'manual' ? (
                        <Terminal
                          size={12}
                          aria-hidden
                          className="mt-0.5 text-[color:rgba(180,235,205,0.9)]"
                        />
                      ) : (
                        <CircleAlert
                          size={12}
                          aria-hidden
                          className="mt-0.5 text-[color:rgba(244,196,130,0.92)]"
                        />
                      )}
                      <dt className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                        {row.label}
                      </dt>
                      <dd className="break-keep text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <dl
                  aria-label={t('agentSetup.proofContractAriaLabel')}
                  className="mt-1.5 grid gap-1"
                >
                  {agentFirstContactProofRows.map((row, index) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[18px_88px_1fr] items-start gap-1.5 rounded-sm border border-[color:rgba(139,151,255,0.12)] bg-[color:rgba(94,106,210,0.045)] px-1.5 py-1"
                    >
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[color:rgba(94,106,210,0.14)] font-mono text-[9px] text-[color:rgba(200,210,255,0.9)]">
                        {index + 1}
                      </span>
                      <dt className="truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-[color:rgba(200,210,255,0.82)]">
                        {row.label}
                      </dt>
                      <dd className="break-keep text-[10.5px] leading-4 text-[color:var(--color-text-secondary)]">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
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
                    {
                      term: t('agentSetup.modeGateTerm'),
                      desc: t('agentSetup.modeGateDesc'),
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
                  onClick={() => void handleCopyAgentFirstContactProof()}
                  title={t('agentSetup.copyFirstContactProofTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(255,255,255,0.025)] px-2 py-1.5 text-[11.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:text-[color:var(--color-text-primary)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copyFirstContactProofLabel}
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
                    {agentJsonGatePreview}
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
                <div className="mt-1.5 rounded-sm border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(94,106,210,0.045)] px-2 py-1.5">
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-[color:rgba(200,210,255,0.82)]">
                    {t('agentSetup.syncAfterChangeTitle')}
                  </p>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('agentSetup.syncAfterChangeDesc')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyAgentPostChangeSyncGate()}
                    title={t('agentSetup.copyPostChangeSyncTitle')}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 py-1.5 text-[11px] text-[color:rgba(210,216,255,0.94)] transition-colors hover:border-[color:rgba(139,151,255,0.46)] hover:bg-[color:rgba(94,106,210,0.13)]"
                  >
                    <ClipboardCopy size={12} aria-hidden />
                    {copyPostChangeSyncLabel}
                  </button>
                </div>
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
                <dl
                  aria-label={t('agentSetup.rootContractAriaLabel')}
                  className="mt-1.5 grid gap-1"
                >
                  {[
                    {
                      term: t('agentSetup.rootVaultTerm'),
                      desc: t('agentSetup.rootVaultDesc'),
                    },
                    {
                      term: t('agentSetup.rootCodebaseTerm'),
                      desc: t('agentSetup.rootCodebaseDesc'),
                    },
                  ].map((rootMode) => (
                    <div
                      key={rootMode.term}
                      className="rounded-sm border border-[color:rgba(139,151,255,0.12)] bg-[color:rgba(94,106,210,0.045)] px-2 py-1"
                    >
                      <dt className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[color:rgba(200,210,255,0.82)]">
                        {rootMode.term}
                      </dt>
                      <dd className="mt-0.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {rootMode.desc}
                      </dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentSetupCheckCliCommand()}
                  title={t('agentSetup.copySetupCheckCliTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(130,230,180,0.28)] bg-[color:rgba(50,185,125,0.07)] px-2 py-1.5 text-[11.5px] text-[color:rgba(180,235,205,0.94)] transition-colors hover:border-[color:rgba(130,230,180,0.42)] hover:bg-[color:rgba(50,185,125,0.11)]"
                >
                  <Terminal size={12} aria-hidden />
                  {copySetupCheckCliLabel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAgentSetupCliCommand()}
                  title={t('agentSetup.copySetupCliTitle')}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[color:rgba(244,196,130,0.28)] bg-[color:rgba(239,180,120,0.07)] px-2 py-1.5 text-[11.5px] text-[color:rgba(244,196,130,0.94)] transition-colors hover:border-[color:rgba(244,196,130,0.42)] hover:bg-[color:rgba(239,180,120,0.11)]"
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
            vaultPath={vaultRootPath}
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

'use client';

import { useState, type ReactNode } from 'react';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCopy,
  Terminal,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  AGENT_CLIENTS,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
  filesForClient,
} from '@/entities/vault-session';
import {
  useAgentClientControls,
  buildCursorMcpDeeplink,
  buildOntologyStarterAgentVerifyPrompt,
  buildOntologyStarterJsonGateCommand,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
} from '@/features/docs-vault-local';
import { DETAIL_TOGGLE_CHIP, SETTINGS_SECTION_LABEL, SettingsGroup, SettingsRow } from './settings-primitives';
import { formatAgentPostChangeSyncPacket } from '@/entities/knowledge-graph';
import type { VaultManifest } from '@/entities/docs-vault';
import type { AgentClientId } from '@/entities/vault-session';
import { copyText } from '@/shared/lib/copy-text';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { Dialog, InfoHint } from '@/shared/ui';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import type { AgentServerAvailability } from '@/shared/config';
import {
  ATLAS_CLI,
  shellQuoteForPacket,
  vaultPathForPacket,
} from '@/shared/config/cli-invocation';

import { McpProofPacket } from './McpProofPacket';

/** One label/value row shape for every definition list in the fold, sized by the widest term. */
const DEFINITION_ROW = 'grid grid-cols-[92px_1fr] gap-2';

/**
 * Copy-chip ink for this panel: the hover, border and background layers `controlClass`
 * deliberately omits, defined once for every copy chip here.
 */
const NEUTRAL_COPY_CHIP =
  'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** Only this section's one primary action gets the indigo tint, so the screen says which to press. */
const ACCENT_ACTION_CHIP =
  'border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]';

function buildAgentVerifyCliCommand(vaultPath?: string | null): string {
  const target = vaultPath ? shellQuoteForPacket(vaultPath) : '.';
  return [
    // Pasted into a shell, an unset `$ATLAS` expands to empty and runs `node /cli/src/index.mjs`,
    // so the block's first line says to define it.
    `# export ATLAS=<path to your ontology-atlas source checkout>`,
    `${ATLAS_CLI} validate ${target}`,
    `${ATLAS_CLI} workspace-brief ${target}`,
    `${ATLAS_CLI} agent-brief ${target} --prompt`,
    `${ATLAS_CLI} agent-brief ${target} --graph-db-pack`,
    `${ATLAS_CLI} agent-brief ${target} --verify-fallbacks`,
    `${ATLAS_CLI} agent-brief ${target} --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    `${ATLAS_CLI} hubs ${target} --plan --limit 10 --types depends_on,relates`,
    `${ATLAS_CLI} hubs ${target} --limit 10 --types depends_on,relates`,
    `${ATLAS_CLI} mcp-verify ${target} --timeout-ms 15000`,
  ].join('\n');
}

const AGENT_VERIFY_CLI_COMMAND = buildAgentVerifyCliCommand();

const AGENT_VERIFY_CLI_PREVIEW = [
  'validate .',
  'workspace-brief .',
  'agent-brief . --prompt',
  'agent-brief . --graph-db-pack',
  'agent-brief . --verify-fallbacks',
  'agent-brief . --verify-fallbacks --json --exit-zero',
];

const AGENT_MODE_PACKET_LINES = [
  'Mode chooser:',
  '- CLI-only: use validate, workspace-brief, graph scans, paths, and graph DB packs without MCP.',
  '- MCP-connected: let Claude Code, Codex, or Cursor call the Atlas MCP tools (call connection_info for the current toolCount) with structured repair fields and write guardrails.',
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
  '- MCP verify: mcp-verify can boot the local MCP server, list the tools including finalize_project_meaning, and read the target vault.',
  '- JSON setup gate: agent-brief --verify-fallbacks --json --exit-zero returns ok/performanceOk before the agent edits.',
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

function buildAgentSetupCliCommand(
  vaultName: string,
  mode: 'json' | 'write',
  vaultPath?: string | null,
): string {
  const command = [
    ATLAS_CLI,
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
    'ontology-atlas first-contact agent proof',
    '',
    'Run these before Claude Code, Codex, or Cursor edits the codebase with this ontology.',
    '',
    'Setup gate:',
    `1. ${setupStateCommand}`,
    `2. If setup state reports missing configs: ${buildAgentSetupCliCommand(vaultName, 'write', vaultPath)}`,
    `3. Restart Claude Code / Cursor / Codex from the codebase root after repair.`,
    `4. ${ATLAS_CLI} mcp-verify ${vaultPathArg} --timeout-ms 15000`,
    `5. ${ATLAS_CLI} agent-brief ${vaultPathArg} --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    '',
    'Read-first graph proof:',
    ...AGENT_MCP_CONNECTED_PROOF_LINES,
    '',
    'CLI fallback proof:',
    `1. ${ATLAS_CLI} workspace-brief ${vaultPathArg}`,
    `2. ${ATLAS_CLI} agent-brief ${vaultPathArg} --prompt`,
    `3. ${ATLAS_CLI} agent-brief ${vaultPathArg} --graph-db-pack`,
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
    'ontology-atlas agent setup packet',
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
    `4. Verify MCP tools: ${ATLAS_CLI} mcp-verify ${vaultPathArg} --timeout-ms 15000`,
    `5. Gate fallback performance: ${ATLAS_CLI} agent-brief ${vaultPathArg} --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    `6. Read the graph: ${ATLAS_CLI} workspace-brief ${vaultPathArg} && ${ATLAS_CLI} agent-brief ${vaultPathArg} --prompt`,
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
    `${ATLAS_CLI} agent-brief ${vaultPathArg} --verify-fallbacks --json --exit-zero --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
    '',
    'Machine-readable setup gate when the vault folder is the current directory:',
    ONTOLOGY_STARTER_JSON_GATE_COMMAND,
    '',
    'Machine-readable config state check before repair:',
    setupStateCommand,
  ].join('\n');
}

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
  agentConfigStatus: {
    mcpJson: boolean;
    codexConfig: boolean;
    mcpExample: boolean;
    mcpJsonValid?: boolean;
    codexConfigValid?: boolean;
    mcpExampleValid?: boolean;
  } | null;
  recentVaults: LocalFsHandleRecord[];
  /** Writes the configs for one tool, or all of them when none is given. */
  ensureAgentConfigs: (
    client?: AgentClientId,
  ) => Promise<{ created: number; skipped: number }>;
}

interface Props {
  canEditCurrent: boolean;
  localVault: VaultAgentSetupLocalVault;
  serverAvailability: AgentServerAvailability;
  validationSummary: { errorCount: number; warningCount: number } | null;
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
  /** The verification dialog: restart, check, and "not working?" behind one press. */
  const [verifyOpen, setVerifyOpen] = useState(false);
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
  const agentStatus = localVault.agentConfigStatus;
  const vaultRootPath = localVault.handle
    ? getTauriVaultRootPath(localVault.handle)
    : null;
  const vaultNameForConfig = localVault.handle?.name ?? 'vault';
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
    } catch (err) {
      const files = (
        client ? filesForClient(client) : AGENT_CLIENTS.flatMap((entry) => entry.files)
      ).join(', ');
      const detail = err instanceof Error ? err.message.trim() : '';
      // Never print empty brackets: with no cause to quote, the sentence stands without one.
      setAgentSetupError(
        detail
          ? t('agentSetup.writeFailed', { files, detail })
          : t('agentSetup.writeFailedNoDetail', { files }),
      );
      throw err;
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

  const serverLaunchable = serverAvailability.launch !== null;
  const mcpJsonState = !agentStatus?.mcpJson
    ? 'missing'
    : agentStatus.mcpJsonValid === false
      ? 'invalid'
      : 'ready';
  const codexConfigState = !agentStatus?.codexConfig
    ? 'missing'
    : agentStatus.codexConfigValid === false
      ? 'invalid'
      : 'ready';
  /*
   * The per-client controls, shared with the map sheet (`useAgentClientControls`). Called
   * before the early return below because it holds hooks.
   */
  const clientControls = useAgentClientControls({
    serverAvailability,
    /* Passes the tool through and returns the promise: the button awaits it to show written or failed. */
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

  const agentSetupReady = Boolean(
    serverLaunchable &&
      agentStatus.mcpJson &&
      agentStatus.codexConfig &&
      agentStatus.mcpJsonValid !== false &&
      agentStatus.codexConfigValid !== false,
  );
  const agentSetupFiles = [
    {
      key: 'mcpJson',
      validKey: 'mcpJsonValid',
      path: '.mcp.json',
    },
    {
      key: 'codexConfig',
      validKey: 'codexConfigValid',
      path: '.codex/config.toml',
    },
  ] as const;
  const agentSetupConnections = [
    {
      /*
       * The `.mcp.json` file is Claude Code's only; Cursor's is `.cursor/mcp.json`, which Atlas
       * writes but never reads back, so this row must not claim to have checked it.
       */
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
  ] as const;
  const agentSetupReadyCount = agentSetupFiles.filter(
    (file) => agentStatus[file.key] && agentStatus[file.validKey] !== false,
  ).length;
  const nextMissingAgentConfig = agentSetupFiles.find(
    (file) => !agentStatus[file.key] || agentStatus[file.validKey] === false,
  );
  const hasMissingAgentConfig = agentSetupFiles.some(
    (file) => !agentStatus[file.key],
  );
  const hasInvalidAgentConfig = agentSetupFiles.some(
    (file) => agentStatus[file.key] && agentStatus[file.validKey] === false,
  );
  /** Further checks behind the fold: only what comes after step 3. */
  const agentDeeperChecks = [
    { key: 'gate', label: t('agentSetup.stepGate') },
    { key: 'mcpVerify', label: t('agentSetup.stepMcpVerify') },
    { key: 'graphProof', label: t('agentSetup.stepGraphProof') },
  ];
  const validationState = validationSummary
    ? validationSummary.errorCount > 0
      ? 'error'
      : validationSummary.warningCount > 0
        ? 'warning'
        : 'clean'
    : 'unknown';
  const validationGateTone =
    validationState === 'clean'
      ? 'ready'
      : validationState === 'error'
        ? 'blocked'
        : 'warning';
  const validationGateStatus =
    validationState === 'clean'
      ? t('agentSetup.validationGateReady')
      : validationState === 'error'
        ? t('agentSetup.validationGateBlocked')
        : validationState === 'warning'
          ? t('agentSetup.validationGateReview')
          : t('agentSetup.validationGateUnknown');
  const validationGateSummary =
    validationState === 'clean'
      ? t('agentSetup.validationGateSummaryClean')
      : validationState === 'error'
        ? t('agentSetup.validationGateSummaryIssues', {
            errors: validationSummary?.errorCount ?? 0,
            warnings: validationSummary?.warningCount ?? 0,
          })
        : validationState === 'warning'
          ? t('agentSetup.validationGateSummaryWarnings', {
              warnings: validationSummary?.warningCount ?? 0,
            })
          : t('agentSetup.validationGateSummaryUnknown');
  const validationGateDesc =
    validationState === 'clean'
      ? t('agentSetup.validationGateDescClean')
      : validationState === 'error'
        ? t('agentSetup.validationGateDescBlocked')
        : validationState === 'warning'
          ? t('agentSetup.validationGateDescReview')
          : t('agentSetup.validationGateDescUnknown');
  const agentSetupProofRows = [
    {
      key: 'vault',
      label: t('agentSetup.proofVault'),
      value: t('agentSetup.proofVaultLoaded', {
        count: localVault.manifest?.docs.length ?? 0,
      }),
      state: localVault.status === 'loaded' ? 'ready' : 'warning',
      href: null,
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
      // The To-Do readiness meter counts the same check results, so a blocking count links there.
      href:
        validationState === 'error' || validationState === 'warning'
          ? '/ontology/insights/?tab=do-next'
          : null,
    },
    {
      // No ready/total row: the always-visible header summary already states that count.
      key: 'agentRoot',
      label: t('agentSetup.proofAgentRoot'),
      value: agentSetupReady
        ? t('agentSetup.proofAgentRootReady')
        : t('agentSetup.proofAgentRootNeedsTemplate'),
      state: agentSetupReady ? 'manual' : 'warning',
      href: null,
    },
    {
      key: 'jsonGate',
      label: t('agentSetup.proofJsonGate'),
      value: t('agentSetup.proofJsonGateManual'),
      state: 'manual',
      href: null,
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
  const agentMcpVerifyPreview = `${ATLAS_CLI} mcp-verify ${
    vaultRootPath ? shellQuoteForPacket(vaultRootPath) : '.'
  } --timeout-ms 15000`;
  const agentJsonGatePreview = buildOntologyStarterJsonGateCommand(vaultRootPath);


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
          className="mb-3 break-keep text-label leading-prose text-[color:var(--color-amber-source-text-a95)]"
        >
          {t('agentSetup.serverMissingReason', { reason: serverAvailability.reason })}
        </p>
      ) : null}

      {/*
        One row per tool (mark, name, the file it writes) with the one control for its state.
        What Atlas cannot know itself (restart, attach) opens as a dialog from the heading.
      */}
      <SettingsGroup
        label={tMcp('shareHeading')}
        testId="agent-setup-steps"
        trailing={
          serverLaunchable ? (
            <>
              <InfoHint label={t('agentSetup.serverHintLabel')} align="right">
                <p
                  data-testid="agent-connect-server-line"
                  className="break-keep text-label leading-prose text-[color:var(--color-text-secondary)]"
                >
                  {tc('serverLine')}
                </p>
                <p className="mt-2 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
                  {agentSetupReady
                    ? t('agentSetup.rootSummaryReady')
                    : t('agentSetup.rootSummaryMissing')}
                </p>
              </InfoHint>
              {/* The same control, in the same slot, as the agents tab's Check again. */}
              <Chip
                size="lg"
                tone="secondary"
                data-testid="agent-setup-verify-open"
                onClick={() => setVerifyOpen(true)}
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
                ? { state: mcpJsonState, path: agentSetupFiles[0].path }
                : client.id === 'codex'
                  ? { state: codexConfigState, path: agentSetupFiles[1].path }
                  : null;
            const foreignConfig = inspected?.state === 'invalid';
            return (
            <SettingsRow
              key={client.id}
              testId={`agent-setup-row-${client.id}`}
              icon={client.icon}
              iconInk={client.brandInk}
              label={client.name}
              /* The file this row writes, so "ready" and "connect" both say which file they mean. */
              caption={
                foreignConfig
                  ? t('agentSetup.nextInvalid', { path: inspected.path })
                  : client.files.join(' · ')
              }
              captionTone={foreignConfig ? 'warning' : 'neutral'}
              /* Natural width, right-aligned like every runtime row on the agents tab. */
              control={clientRows[client.id]}
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

          {/* Restarting "the tool you just connected" means nothing until a file exists. */}
          {agentSetupReadyCount > 0 ? (
          <section data-testid="agent-setup-step-2" className="mt-4">
            <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {tc('step2Title')}
            </h3>
            <p className="mt-1 break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {tc('step2Desc')}
            </p>
          </section>
          ) : null}

          {/* Named for the table under it (`connectionStatusHeading`), not after the dialog it is in. */}
          <section data-testid="agent-setup-step-3" className="mt-4 flex flex-col gap-2">
            <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t('agentSetup.connectionStatusHeading')}
            </h3>
              <div className="divide-y divide-[color:var(--color-divider)] rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)]">
                {/*
                  The one statement of the count, naming whose files it counts (Atlas reads back
                  only Claude Code's and Codex's); the next step follows only when one is missing.
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
                        ready: agentSetupReadyCount,
                        total: agentSetupFiles.length,
                        tools: agentSetupConnections.map((connection) => connection.label).join(' · '),
                      })}
                    </p>
                    {nextMissingAgentConfig ? (
                      <p
                        data-testid="agent-setup-status-next"
                        className="mt-0.5 break-keep text-label leading-prose text-[color:var(--color-amber-source-text-a95)]"
                      >
                        {agentStatus[nextMissingAgentConfig.key]
                          ? t('agentSetup.nextInvalid', { path: nextMissingAgentConfig.path })
                          : t('agentSetup.nextMissing', { path: nextMissingAgentConfig.path })}
                      </p>
                    ) : null}
                  </div>
                </div>
                <dl className="grid gap-1 px-2.5 py-2">
                  {agentSetupConnections.map(({ key, label, check }) => (
                    <div key={key} className="flex items-baseline justify-between gap-2">
                      <dt className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                        {label}
                      </dt>
                      {/* Monospace, because the value really is the command you type into that
                          tool. It is the one place in this box where that face carries meaning. */}
                      <dd className="shrink-0 font-mono text-label text-[color:var(--color-text-tertiary)]">
                        {check}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {/* The proof packet ends the step whose job is proving the connection. */}
              <McpProofPacket
                frame="inline"
                vaultName={vaultNameForConfig}
                vaultPath={vaultRootPath}
              />
          </section>

          {/* Advanced, verification, CLI and other-folder setup: collapsed, and all still reachable. */}
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
        <div data-testid="agent-setup-inspection" className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.groupFiles')}</SectionLabel>
          <ul aria-label={t('agentSetup.connectionStatusHeading')} className="grid gap-1">
            {agentSetupConnections.map(({ key, file, label }) => {
              const present = Boolean(agentStatus[file.key]);
              const ready = present && agentStatus[file.validKey] !== false;
              return (
                <li
                  key={key}
                  className="grid grid-cols-[14px_1fr] gap-1.5 rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5"
                >
                  {ready ? (
                    <CheckCircle2
                      size={ICON_SIZE.sm}
                      aria-hidden
                      className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                    />
                  ) : (
                    <CircleAlert
                      size={ICON_SIZE.sm}
                      aria-hidden
                      className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
                    />
                  )}
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-body text-[color:var(--color-text-secondary)]">
                      {label}
                    </span>
                    <code className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-quaternary)]">
                      {file.path}
                    </code>
                    <span
                      className={`shrink-0 text-label ${
                        ready
                          ? 'text-[color:var(--color-success-text-a92)]'
                          : 'text-[color:var(--color-amber-source-text-a95)]'
                      }`}
                    >
                      {ready
                        ? t('agentSetup.connectionReady')
                        : present
                          ? t('agentSetup.needsReview')
                          : t('agentSetup.connectionNeedsReview')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {hasMissingAgentConfig && canEditCurrent ? (
            <Chip
              size="md"
              /* The message is already on screen; this catch only stops an unhandled rejection
                 from the re-throw that tells the per-tool buttons their write failed. */
              onClick={() => void handleEnsureAgentConfigs().catch(() => undefined)}
              disabled={agentSetupBusy}
              title={t('agentSetup.repairTitle')}
              tone="accentOnTint"
              className={`self-start ${ACCENT_ACTION_CHIP}`}
            >
              <Bot size={ICON_SIZE.sm} aria-hidden />
              {agentSetupBusy ? t('agentSetup.repairing') : t('agentSetup.repair')}
            </Chip>
          ) : null}
          {hasInvalidAgentConfig ? (
            <p className="break-keep rounded-micro border border-[color:var(--color-amber-source-a14)] bg-[color:var(--color-amber-source-a08)] px-2 py-1.5 text-label text-[color:var(--color-amber-source-text-a95)]">
              {t('agentSetup.invalidRepairHint')}
            </p>
          ) : null}
          <p className="break-keep text-label text-[color:var(--color-text-quaternary)]">
            {t('agentSetup.connectionHint')}
          </p>

          {/*
            Validation errors block nothing but `git_snapshot({confirm:true})`; MCP writes have no
            such gate, so this box must not claim the agent is blocked.
          */}
          <div
            role="status"
            aria-label={t('agentSetup.validationGateAriaLabel')}
            className={`grid grid-cols-[14px_1fr] gap-1.5 rounded-micro border px-2 py-1.5 ${
              validationGateTone === 'ready'
                ? 'border-[color:var(--color-success-a20)] bg-[color:var(--color-success-a055)]'
                : validationGateTone === 'blocked'
                  ? 'border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)]'
                  : 'border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a07)]'
            }`}
          >
            {validationGateTone === 'ready' ? (
              <CheckCircle2
                size={ICON_SIZE.sm}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-success-text-a90)]"
              />
            ) : (
              <CircleAlert
                size={ICON_SIZE.sm}
                aria-hidden
                className={`mt-0.5 ${
                  validationGateTone === 'blocked'
                    ? 'text-[color:var(--color-status-danger)]'
                    : 'text-[color:var(--color-amber-source-text-a95)]'
                }`}
              />
            )}
            <span className="min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                  {t('agentSetup.validationGateTitle')}
                </span>
                <span
                  className={`shrink-0 text-label ${
                    validationGateTone === 'ready'
                      ? 'text-[color:var(--color-success-text-a92)]'
                      : validationGateTone === 'blocked'
                        ? 'text-[color:var(--color-status-danger)]'
                        : 'text-[color:var(--color-amber-source-text-a95)]'
                  }`}
                >
                  {validationGateStatus}
                </span>
              </span>
              <span className="mt-0.5 block text-label text-[color:var(--color-text-secondary)]">
                {validationGateSummary}
              </span>
              <span className="mt-0.5 block break-keep text-label text-[color:var(--color-text-tertiary)]">
                {validationGateDesc}
              </span>
            </span>
          </div>
          <dl aria-label={t('agentSetup.proofAriaLabel')} className="grid gap-1">
            {agentSetupProofRows.map((row) => (
              <div
                key={row.key}
                data-testid={`agent-setup-proof-${row.key}`}
                className="grid grid-cols-[14px_72px_1fr] items-start gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-1.5 py-1"
              >
                {row.state === 'ready' ? (
                  <CheckCircle2
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                  />
                ) : row.state === 'blocked' ? (
                  <CircleAlert
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className="mt-0.5 text-[color:var(--color-status-danger)]"
                  />
                ) : row.state === 'manual' ? (
                  <Terminal
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                  />
                ) : (
                  <CircleAlert
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
                  />
                )}
                <dt className="truncate text-body text-[color:var(--color-text-quaternary)]">
                  {row.label}
                </dt>
                <dd className="break-keep text-label text-[color:var(--color-text-secondary)]">
                  {row.value}
                  {row.href ? (
                    <>
                      {' '}
                      <Link
                        href={row.href}
                        data-testid={`agent-setup-proof-${row.key}-link`}
                        className={controlClass({
                          shape: 'link',
                          className: 'hover:text-[color:var(--color-text-primary)]',
                        })}
                      >
                        {t('proofHealthOpenQueue')}
                      </Link>
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.groupHowAgentsUse')}</SectionLabel>
          <p className="break-keep rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
            <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t('agentSetup.boundaryTitle')}
            </span>{' '}
            {t('agentSetup.boundaryDesc')}
          </p>
          <dl aria-label={t('agentSetup.modeChooserAriaLabel')} className="grid gap-1">
            {[
              { term: t('agentSetup.modeCliTerm'), desc: t('agentSetup.modeCliDesc') },
              { term: t('agentSetup.modeMcpTerm'), desc: t('agentSetup.modeMcpDesc') },
              { term: t('agentSetup.modeGraphTerm'), desc: t('agentSetup.modeGraphDesc') },
              { term: t('agentSetup.modeGateTerm'), desc: t('agentSetup.modeGateDesc') },
            ].map((mode) => (
              <div key={mode.term} className={DEFINITION_ROW}>
                <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                  {mode.term}
                </dt>
                <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                  {mode.desc}
                </dd>
              </div>
            ))}
          </dl>
          <details className="rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
            <summary className=" select-none text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]">
              {t('agentSetup.nextStepsSummary')}
            </summary>
            <ul aria-label={t('agentSetup.nextStepsAriaLabel')} className="mt-1.5 grid gap-1">
              {agentDeeperChecks.map((step) => (
                <li
                  key={step.key}
                  className="break-keep text-label text-[color:var(--color-text-secondary)]"
                >
                  {step.label}
                </li>
              ))}
            </ul>
            <dl
              aria-label={t('agentSetup.proofContractAriaLabel')}
              className="mt-2 grid gap-1"
            >
              {agentFirstContactProofRows.map((row) => (
                <div key={row.key} className={DEFINITION_ROW}>
                  <dt className="text-body text-[color:var(--color-text-quaternary)]">
                    {row.label}
                  </dt>
                  <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              size="md"
              onClick={onOpenWorkflowGuide}
              title={t('agentSetup.openWorkflowGuideTitle')}
              tone="accentOnTint"
              className={ACCENT_ACTION_CHIP}
            >
              <BookOpen size={ICON_SIZE.sm} aria-hidden />
              {t('agentSetup.openWorkflowGuide')}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentSetupPacket()}
              title={t('agentSetup.copyPacketTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyPacketLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentVerifyPrompt()}
              title={t('agentSetup.copyPromptTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyPromptLabel}
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.verifyGroup')}</SectionLabel>
          <div
            aria-label={t('agentSetup.mcpVerifyPreviewAriaLabel')}
            className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5"
          >
            <div className="text-body text-[color:var(--color-text-quaternary)]">
              {t('agentSetup.mcpVerifyLabel')}
            </div>
            <code className="mt-1 block truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
              {agentMcpVerifyPreview}
            </code>
          </div>
          <div className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
            <div className="text-body text-[color:var(--color-text-quaternary)]">
              {t('agentSetup.jsonGateLabel')}
            </div>
            <code className="mt-1 block truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
              {agentJsonGatePreview}
            </code>
          </div>
          <dl aria-label={t('agentSetup.gateRulesAriaLabel')} className="grid gap-1">
            {[
              { term: t('agentSetup.gateBrokenTerm'), desc: t('agentSetup.gateBrokenDesc') },
              { term: t('agentSetup.gateSlowTerm'), desc: t('agentSetup.gateSlowDesc') },
              { term: t('agentSetup.gateReadyTerm'), desc: t('agentSetup.gateReadyDesc') },
            ].map((rule) => (
              <div key={rule.term} className={DEFINITION_ROW}>
                <dt className="text-body text-[color:var(--color-text-secondary)]">
                  {rule.term}
                </dt>
                <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                  {rule.desc}
                </dd>
              </div>
            ))}
          </dl>
          <ol
            className="grid gap-0.5 rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5"
            aria-label={t('agentSetup.cliPreviewAriaLabel')}
          >
            {AGENT_VERIFY_CLI_PREVIEW.map((command) => (
              <li key={command}>
                <code className="block truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
                  {ATLAS_CLI} {command}
                </code>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              size="md"
              onClick={() => void handleCopyAgentJsonGate()}
              title={t('agentSetup.copyJsonGateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copyJsonGateLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentVerifyCli()}
              title={t('agentSetup.copyCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copyCliLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentFirstContactProof()}
              title={t('agentSetup.copyFirstContactProofTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copyFirstContactProofLabel}
            </Chip>
          </div>
          <div className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
            <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t('agentSetup.syncAfterChangeTitle')}
            </p>
            <p className="mt-1 break-keep text-label text-[color:var(--color-text-tertiary)]">
              {t('agentSetup.syncAfterChangeDesc')}
            </p>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentPostChangeSyncGate()}
              title={t('agentSetup.copyPostChangeSyncTitle')}
              tone="secondary"
              className={`mt-2 ${NEUTRAL_COPY_CHIP}`}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyPostChangeSyncLabel}
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.connectGroup')}</SectionLabel>
          <dl aria-label={t('agentSetup.rootContractAriaLabel')} className="grid gap-1">
            {[
              { term: t('agentSetup.rootVaultTerm'), desc: t('agentSetup.rootVaultDesc') },
              { term: t('agentSetup.rootCodebaseTerm'), desc: t('agentSetup.rootCodebaseDesc') },
            ].map((rootMode) => (
              <div key={rootMode.term} className={DEFINITION_ROW}>
                <dt className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                  {rootMode.term}
                </dt>
                <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                  {rootMode.desc}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              size="md"
              onClick={() => void handleCopyAgentSetupCheckCliCommand()}
              title={t('agentSetup.copySetupCheckCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copySetupCheckCliLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentSetupCliCommand()}
              title={t('agentSetup.copySetupCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copySetupCliLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyAgentConfigTemplate()}
              title={t('agentSetup.copyTemplateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyTemplateLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyCodexConfigTemplate()}
              title={t('agentSetup.copyCodexTemplateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyCodexTemplateLabel}
            </Chip>
            <Chip
              size="md"
              onClick={() => void handleCopyCodexMcpAddCommand()}
              title={t('agentSetup.copyCodexCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copyCodexCliLabel}
            </Chip>
          </div>
        </div>
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

/** A group title inside the fold, in the root sheet's `SETTINGS_SECTION_LABEL` style. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <h4 className={SETTINGS_SECTION_LABEL}>{children}</h4>;
}

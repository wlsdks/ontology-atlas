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
  AgentClientButtons,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildCursorMcpDeeplink,
  buildMcpConfigJson,
  buildOntologyStarterAgentVerifyPrompt,
  buildOntologyStarterJsonGateCommand,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
} from '@/features/docs-vault-local';
import { SETTINGS_SECTION_LABEL } from './settings-primitives';
import { formatAgentPostChangeSyncPacket } from '@/shared/lib/ontology-tree';
import type { VaultManifest } from '@/entities/docs-vault';
import type { AgentClientId } from '@/features/docs-vault-local';
import { copyText } from '@/shared/lib/copy-text';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import type { AgentServerAvailability } from '@/shared/config';
import { ATLAS_CLI } from '@/shared/config/cli-invocation';

import { AgentSetupStep, type AgentSetupStepState } from './AgentSetupStep';

/**
 * The presentational panel that moved the AI-agent settings block out of the old
 * `VaultToolsMenu` (the docs-vault header dropdown) into `AppSettingsMenu`'s
 * mcpAgents tab (B2 merge, feat/settings-vault-merge). Config file status, repair,
 * copy packets, the checklist, the mode chooser and the validation gate were all
 * absorbed here. The docs-vault header no longer carries this tool (duplicate
 * surface removed) and the settings menu is its only home.
 *
 * It depends on the localVault context and renders only when the vault is loaded
 * and `agentConfigStatus` exists (otherwise null). The copy packets take the
 * current vault path and name as arguments to fill in absolute paths. The
 * translation namespace reuses the original `docsVault`, so no i18n was migrated.
 */

/**
 * Copy-chip ink for this panel — **only the layers the value layer deliberately
 * omits** live here.
 *
 * `controlClass` does not supply hover (frequency eats the motion budget, so the
 * consumer decides). Border and background tints are not in the ramp yet either —
 * tone supplies **text colour only**. So the same string was scattered across six
 * sites, and written by hand six times one copy eventually diverges. One constant
 * removes that divergence.
 */
const NEUTRAL_COPY_CHIP =
  'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/**
 * Only this section's **one primary action** gets the indigo tint.
 *
 * Before 2026-08-04 all 11 copy chips were stacked vertically at full width and
 * 32px tall — «the group's primary action» and «the secondary beside it» carried
 * the same weight, so the screen never said which to press. Width is left to the
 * content again too (`w-full` removed).
 */
const ACCENT_ACTION_CHIP =
  'border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]';

function buildAgentVerifyCliCommand(vaultPath?: string | null): string {
  const target = vaultPath ? shellQuoteForPacket(vaultPath) : '.';
  return [
    // **What gets copied is several command lines, so the first line has to define
    // `$ATLAS`.** This block is meant to be pasted straight into a terminal, yet all
    // nine lines began with `$ATLAS` and nobody filled that variable in. Pasted, the
    // shell expands it to empty and runs `node /cli/src/index.mjs` nine times
    // (dogfooding, 2026-07-29). One comment line ends it in a single paste.
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

function vaultPathForPacket(vaultName: string, vaultPath?: string | null): string {
  return vaultPath ?? `<absolute path to your ${vaultName} folder>`;
}

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

function shellQuoteForPacket(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface VaultAgentSetupLocalVault {
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
  /**
   * Writing configs — **it takes a tool.** This interface was re-declaring an
   * argument-less signature, so fixing the hook side was swallowed again here. A
   * duplicated signature is the classic place a contract gets reverted.
   */
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /**
   * The 「Having trouble?」 (having trouble?) drawer — in-flow collapsing, so it uses
   * the list-row disclosure grammar. The first version's `Surface` (chrome grammar)
   * belongs to a floating surface, so the siblings below jumped twice (frame
   * measurement in the installed app — numbers in the `AgentSetupStep.tsx` preamble).
   * This sits before `publicPackagesReady` (= can launch) is declared, so it counts
   * from the prop directly.
   */
  const advancedRevealOpen = serverAvailability.launch !== null && advancedOpen;
  const {
    mounted: advancedMounted,
    boxRef: advancedBoxRef,
    contentRef: advancedContentRef,
  } = useRowDisclosure(advancedRevealOpen);
  /**
   * The expanded step — `null` means **follow whatever is next to do.**
   *
   * As a pure derived value, opening step 3 and then pressing step 1's button
   * collapses the screen unpredictably. As pure state, step 1 stays open even after
   * the connection is finished. So «follow (null)» and «the user chose (a number)»
   * are distinguished — `0` means «all three collapsed».
   */
  const [openStepOverride, setOpenStepOverride] = useState<number | null>(null);
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

  /** Take a tool and write only its file — omit it and all of them go, as before (the scaffold position). */
  async function handleEnsureAgentConfigs(client?: AgentClientId) {
    setAgentSetupError(null);
    setAgentSetupBusy(true);
    try {
      await localVault.ensureAgentConfigs(client);
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

  if (localVault.status !== 'loaded' || !agentStatus) return null;

  // Do we know how to launch the server? This one thing decides whether one-click is possible.
  const publicPackagesReady = serverAvailability.launch !== null;
  const agentSetupReady = Boolean(
    publicPackagesReady &&
      agentStatus.mcpJson &&
      agentStatus.codexConfig &&
      agentStatus.mcpJsonValid !== false &&
      agentStatus.codexConfigValid !== false,
  );
  const mcpJsonState = !agentStatus.mcpJson
    ? 'missing'
    : agentStatus.mcpJsonValid === false
      ? 'invalid'
      : 'ready';
  const codexConfigState = !agentStatus.codexConfig
    ? 'missing'
    : agentStatus.codexConfigValid === false
      ? 'invalid'
      : 'ready';
  /**
   * The file set — **the role label was removed** (2026-08-04). 「Claude Code ·
   * Cursor Connection File」 was a fourth statement of what the tool name beside it, the
   * path, and the 「Connection File Status」 group title already say three times.
   */
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
  /**
   * **Further checks** behind the fold — only what comes after step 3.
   *
   * There used to be 6 rows here, and the first three (config files · restart ·
   * verify connection) repeated **the same things as the three steps above with
   * different numbers**. That left this screen with four numbering systems (3 steps ·
   * 6 flow · 4 evidence · 6 commands) and none of them pointing at "what to do now".
   * The first three were promoted into steps, so only the last three remain here —
   * they were **promoted, not deleted**, so reachability is unchanged.
   */
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
      // **「5 are blocking」 gets somewhere to go** (2026-08-04). This block previously
      // had **0** interactive elements and not one character saying which file was
      // wrong — after reading the number, all a person could do was close the window.
      // The readiness meter on the 「To-Do」 screen counts the same check results, so
      // this sends them there.
      href:
        validationState === 'error' || validationState === 'warning'
          ? '/ontology/insights/?tab=do-next'
          : null,
    },
    {
      /*
       * ⚠️ The 「Connection File {ready}/{total}」 row that stood here was removed
       * (2026-08-04). The screen was stating the same number **three times** — the
       * header summary, this row, and step 3's status line. It is exactly the reason
       * the 2026-08-02 design council removed the 「Missing」 badge (there the third
       * statement shouted in colour), and that ruling resurfaced here. The header
       * summary is **always visible**, so one of the two survivors is always on screen.
       */
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


  /**
   * There is one thing to do now — decided **only from what the app actually knows.**
   *
   * Step 1 (config files) is known by looking at disk. Steps 2 (restart) and 3
   * (verify connection) are unknowable in principle — Atlas does not connect to the
   * agent (`connectionHint` already says so). So those two **never complete
   * automatically**, and the user can open them directly instead. Rather than
   * pretending to know what it does not, it guides the order only.
   */
  const stepOneDone = agentSetupReadyCount === agentSetupFiles.length;
  const currentStep = stepOneDone ? 2 : 1;
  const openStep = openStepOverride ?? currentStep;
  const toggleStep = (n: number) => setOpenStepOverride(openStep === n ? 0 : n);
  const stepState = (n: number): AgentSetupStepState => {
    if (n === 1) return stepOneDone ? 'done' : 'now';
    return n === currentStep ? 'now' : 'todo';
  };

  return (
    <section aria-label={t('agentSetup.ariaLabel')} className="min-w-0">
      {/*
        **The head is two lines** (2026-08-04). There used to be another `<h3>` title
        here, while the left LNB was already naming this pane at the same eye level —
        the same name is written once instead of twice. The name survives as the
        region's accessible name, so it is not lost to assistive technology.

        ⚠️ That LNB name changed to 「MCP」 on 2026-08-16, and the accessible name moved
        with it — otherwise the name on screen and the name a screen reader speaks
        diverge, and that mismatch is invisible forever to anyone looking at the screen.
      */}
      <p className="break-keep text-body text-[color:var(--color-text-tertiary)]">
        {publicPackagesReady
          ? t('agentSetup.statusSummary', {
              ready: agentSetupReadyCount,
              total: agentSetupFiles.length,
            })
          : t('agentSetup.serverStatusSummary')}
        {publicPackagesReady && nextMissingAgentConfig ? (
          <span className="font-mono text-[color:var(--color-amber-source-text-a95)]">
            {' · '}
            {agentStatus[nextMissingAgentConfig.key]
              ? t('agentSetup.nextInvalid', { path: nextMissingAgentConfig.path })
              : t('agentSetup.nextMissing', { path: nextMissingAgentConfig.path })}
          </span>
        ) : null}
      </p>
      <p className="mt-1 break-keep text-label text-[color:var(--color-text-quaternary)]">
        {publicPackagesReady
          ? agentSetupReady
            ? t('agentSetup.rootSummaryReady')
            : t('agentSetup.rootSummaryMissing')
          : t('agentSetup.rootSummaryBlocked')}
      </p>

      {/*
        ── Three steps ─────────────────────────────────────────────────
        Only one expands at a time. On the web (where we do not know how to launch a
        server), step 1 *is* the degradation card, so steps 2 and 3 do not exist —
        showing a step that is not there, greyed out, is a dead end rather than guidance.
      */}
      <ol
        aria-label={t('agentSetup.stepListAriaLabel')}
        data-testid="agent-setup-steps"
        className="mt-3 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
      >
        <AgentSetupStep
          n={1}
          testId="agent-setup-step-1"
          title={tc('step1Title')}
          desc={publicPackagesReady ? tc('step1Desc') : undefined}
          state={publicPackagesReady ? stepState(1) : 'now'}
          trailing={
            publicPackagesReady && stepOneDone ? t('agentSetup.stepStateDone') : undefined
          }
          open={publicPackagesReady ? openStep === 1 : true}
          onToggle={() => toggleStep(1)}
        >
          <AgentClientButtons
            serverAvailability={serverAvailability}
            /* Pass the tool through — `() => void handleEnsureAgentConfigs()` swallows
               the argument, so whichever button was pressed, the same files went out. */
            onWriteConfigs={
              publicPackagesReady && canEditCurrent
                ? (client) => void handleEnsureAgentConfigs(client)
                : null
            }
            /* The four are **pick one**, not «one right answer» — four full-width rows
               each read as a large decision (owner report, 2026-08-04). Two columns
               read as one set and turn 152px of height into 76px. */
            layout="grid"
            cursorDeeplink={cursorDeeplink}
            mcpJsonSnippet={buildMcpConfigJson(vaultNameForConfig, vaultRootPath)}
            replacementMcpJsonSnippet={buildMcpConfigJson(vaultNameForConfig, '.')}
            codexCommand={buildCodexMcpAddCommandTemplate(vaultNameForConfig, vaultRootPath)}
            mcpJsonState={mcpJsonState}
            codexConfigState={codexConfigState}
            codexConfigSnippet={buildCodexConfigTomlTemplate(vaultNameForConfig, '.')}
            needsManualPath={vaultRootPath === null}
          />
        </AgentSetupStep>
        {publicPackagesReady ? (
          <>
            <AgentSetupStep
              n={2}
              testId="agent-setup-step-2"
              title={tc('step2Title')}
              desc={tc('step2Desc')}
              state={stepState(2)}
              open={openStep === 2}
              onToggle={() => toggleStep(2)}
            />
            {/*
              **`step3Desc` is not used here** (2026-08-02, design council). That
              sentence reads "Once an agent starts reading this map it will show here",
              but the
              heartbeat signal that keeps that promise belongs **only to the map
              sheet** (`use-agent-connect-model.ts`). What this screen knows stops at
              the config files' validity, so leaving the sentence would make it a
              promise we do not keep. It gives **what this screen actually knows**
              (file status) and a way for the person to verify directly (the per-tool
              check command) instead.
            */}
            <AgentSetupStep
              n={3}
              testId="agent-setup-step-3"
              title={tc('step3Title')}
              state={stepState(3)}
              open={openStep === 3}
              onToggle={() => toggleStep(3)}
            >
              {/*
                One step = one box. With the status line and the per-tool check method
                floating separately, "what is this step" reads as two lumps — the very
                flatness this screen set out to fix. They are bound into one and split
                inside by a hairline. (The check method used to live only inside the
                advanced fold. It *is* the content of the "Check Connection" step, so this is
                its home.)
              */}
              <div className="divide-y divide-[color:var(--color-divider)] rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)]">
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: agentSetupReady
                        ? 'var(--color-status-success)'
                        : 'var(--color-text-quaternary)',
                    }}
                  />
                  <span className="min-w-0 flex-1 break-keep text-body text-[color:var(--color-text-secondary)]">
                    {agentSetupReady
                      ? t('agentSetup.connectionCheckReady')
                      : t('agentSetup.connectionCheckPending', {
                          ready: agentSetupReadyCount,
                          total: agentSetupFiles.length,
                        })}
                  </span>
                </div>
                <dl className="grid gap-1 px-2.5 py-2">
                  {agentSetupConnections.map(({ key, label, check }) => (
                    <div key={key} className="flex items-baseline justify-between gap-2">
                      <dt className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                        {label}
                      </dt>
                      <dd className="shrink-0 font-mono text-label text-[color:var(--color-text-tertiary)]">
                        {check}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </AgentSetupStep>
          </>
        ) : null}
      </ol>

      {/*
        ── Having trouble? ──────────────────────────────────────────────
        Advanced, verification, CLI and connecting from another folder all sit behind
        this. It is **collapsed, not deleted**, so everything collapsed must remain
        reachable.
      */}
      {publicPackagesReady ? (
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
            className: 'touch-hit-expand mt-3 hover:text-[color:var(--color-text-secondary)]',
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
      ) : null}
      {/* The box is always drawn (the transition's starting height) — only the content
          drops out of the collapse. The `id` lives on the box so the toggle's
          `aria-controls` target exists even mid-collapse, and the testid lives on the
          content so the "absent when collapsed" contract holds. */}
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
        {/*
          ── Check group ────────────────────────────────────────────────
          ⚠️ **This whole lump is soon moving to the "To Fix" tab** (owner call,
          2026-08-04 — check, repair and delete go there). Rather than moving it this
          round, it is gathered under one node in **a shape that is easy to move**.
          Left scattered, someone would have to hunt down eight places again.
        */}
        <div data-testid="agent-setup-inspection" className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.groupFiles')}</SectionLabel>
          {/*
            **There is one list** (2026-08-04). The same three files used to be drawn
            twice — above as 「tool name + check method + badge」, below as 「path +
            role」. The two lists had the same row count and the same order, and the
            only difference was which one stated the path. Stating the same fact in two
            places leaves nobody knowing which is current. The check methods (`/mcp`
            and so on) were promoted into step 3, so what remains here is three things:
            **name · path · status**.
          */}
          <ul aria-label={t('agentSetup.connectionAriaLabel')} className="grid gap-1">
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
              size="sm"
              onClick={() => void handleEnsureAgentConfigs()}
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
            ── Folder status ──────────────────────────────────────────────
            ⚠️ **Correction, 2026-08-04 — this box was lying.**
            It carried a red "HANDOFF BLOCKED" badge and the sentence *"The agent
            must resolve vault validation errors before modifying the
            ontology"*
            (the agent must resolve vault validation errors before modifying the
            ontology) — but **nothing is blocked**. The MCP write paths
            (`add_concept` · `patch_concept` …) have no such gate. The only thing an
            error actually refuses is `git_snapshot({confirm:true})`
            (`mcp/src/index.js` — *"git_snapshot blocked: validate_vault found N
            file(s) with errors"*). When a screen asserts a fact with no basis, users
            give up on things that would have worked.
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

        {/* ── How agents use this folder ────────────────────────────────── */}
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
              <div key={mode.term} className="grid grid-cols-[84px_1fr] gap-2">
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
                <div key={row.key} className="grid grid-cols-[92px_1fr] gap-2">
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
              size="sm"
              onClick={onOpenWorkflowGuide}
              title={t('agentSetup.openWorkflowGuideTitle')}
              tone="accentOnTint"
              className={ACCENT_ACTION_CHIP}
            >
              <BookOpen size={ICON_SIZE.sm} aria-hidden />
              {t('agentSetup.openWorkflowGuide')}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentSetupPacket()}
              title={t('agentSetup.copyPacketTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyPacketLabel}
            </Chip>
            <Chip
              size="sm"
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

        {/* ── Verify from the command line ──────────────────────────────── */}
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
              <div key={rule.term} className="grid grid-cols-[52px_1fr] gap-2">
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
              size="sm"
              onClick={() => void handleCopyAgentJsonGate()}
              title={t('agentSetup.copyJsonGateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copyJsonGateLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentVerifyCli()}
              title={t('agentSetup.copyCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copyCliLabel}
            </Chip>
            <Chip
              size="sm"
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
              size="sm"
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

        {/* ── Opening from another code folder ──────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.connectGroup')}</SectionLabel>
          <dl aria-label={t('agentSetup.rootContractAriaLabel')} className="grid gap-1">
            {[
              { term: t('agentSetup.rootVaultTerm'), desc: t('agentSetup.rootVaultDesc') },
              { term: t('agentSetup.rootCodebaseTerm'), desc: t('agentSetup.rootCodebaseDesc') },
            ].map((rootMode) => (
              <div key={rootMode.term} className="grid grid-cols-[92px_1fr] gap-2">
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
              size="sm"
              onClick={() => void handleCopyAgentSetupCheckCliCommand()}
              title={t('agentSetup.copySetupCheckCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copySetupCheckCliLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentSetupCliCommand()}
              title={t('agentSetup.copySetupCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={ICON_SIZE.sm} aria-hidden />
              {copySetupCliLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentConfigTemplate()}
              title={t('agentSetup.copyTemplateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyTemplateLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyCodexConfigTemplate()}
              title={t('agentSetup.copyCodexTemplateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
              {copyCodexTemplateLabel}
            </Chip>
            <Chip
              size="sm"
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
      {agentSetupError ? (
        <p role="alert" className="mt-2 text-label text-[color:var(--color-status-danger)]">
          {agentSetupError}
        </p>
      ) : null}
    </section>
  );
}

/**
 * A group title inside the fold — it points at **the same specification** as the
 * root sheet's group headers.
 *
 * ⚠️ The comment that stood here said *"the `text-caption` (9.5px) in this position
 * is not the forbidden usage — it is the «micro label» the ramp's definition names"*,
 * and **that was wrong** (2026-08-09, the owner's second report). `uppercase` does
 * nothing to Hangul, so the "uppercase micro label" typographic device does not
 * exist and all that remains is 9.5px of dim text. And the root sheet already used
 * 11px for the same role. The value lives in one place,
 * `SETTINGS_SECTION_LABEL`.
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return <h4 className={SETTINGS_SECTION_LABEL}>{children}</h4>;
}

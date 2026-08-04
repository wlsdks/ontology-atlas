'use client';

import { useState } from 'react';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCopy,
  Terminal,
} from 'lucide-react';
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
  buildVsCodeMcpDeeplink,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  ONTOLOGY_STARTER_JSON_GATE_COMMAND,
  ONTOLOGY_POST_CHANGE_SYNC_LINES,
  StepRow,
} from '@/features/docs-vault-local';
import { formatAgentPostChangeSyncPacket } from '@/shared/lib/ontology-tree';
import type { VaultManifest } from '@/entities/docs-vault';
import type { AgentClientId } from '@/features/docs-vault-local';
import { copyText } from '@/shared/lib/copy-text';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import type { AgentServerAvailability } from '@/shared/config';
import { ATLAS_CLI } from '@/shared/config/cli-invocation';

/**
 * B2 병합 (feat/settings-vault-merge) — 이전 `VaultToolsMenu` (문서함 헤더
 * 드롭다운) 의 AI agent 설정 블록을 `AppSettingsMenu` 의 mcpAgents 탭으로
 * 옮긴 presentational 패널. 설정 파일 상태 · 수리 · 복사 패킷 · 체크리스트 ·
 * mode chooser · 검증 게이트가 모두 여기로 흡수됐다. 문서함 헤더에는 더
 * 이상 이 도구가 없고(중복 표면 제거), 설정 메뉴가 유일한 집이다.
 *
 * localVault 컨텍스트에 의존 — vault 가 loaded 이고 agentConfigStatus 가
 * 있을 때만 렌더(그 외 null). 복사 패킷은 현재 vault 경로/이름을 인자로
 * 받아 절대경로를 채운다. 번역 네임스페이스는 원본 그대로 `docsVault` 를
 * 재사용해 i18n 이관 0.
 */

/**
 * 이 패널의 복사 칩 잉크 — **값 층이 일부러 안 내는 층**만 여기 산다.
 *
 * `controlClass` 는 호버를 안 낸다(빈도가 모션 예산을 깎으므로 소비처가 정한다).
 * 테두리·배경 틴트도 아직 램프에 없다 — 톤은 **글자색만** 낸다. 그래서 같은
 * 문자열이 여섯 자리에 흩어져 있었고, 손으로 여섯 번 쓰면 언젠가 한 벌이
 * 갈린다. 상수 하나로 묶어 그 갈림을 없앤다.
 */
const NEUTRAL_COPY_CHIP =
  'w-full justify-center border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/** 게이트 명령(검증이 통과했음을 알리는 초록) 복사 칩의 잉크. */
const GATE_COPY_CHIP =
  'w-full justify-center border-[color:var(--color-success-a28)] bg-[color:var(--color-success-a07)] hover:border-[color:var(--color-success-a42)] hover:bg-[color:var(--color-success-a11)]';

function buildAgentVerifyCliCommand(vaultPath?: string | null): string {
  const target = vaultPath ? shellQuoteForPacket(vaultPath) : '.';
  return [
    // **복사되는 것은 명령 여러 줄이다 — 첫 줄이 `$ATLAS` 를 정의해야 한다.**
    // 이 블록은 그대로 터미널에 붙여넣으라고 만든 것인데, 아홉 줄 전부가
    // `$ATLAS` 로 시작하면서 그 변수를 아무도 채워 주지 않았다. 붙여넣으면
    // 셸이 빈 값으로 풀어 `node /cli/src/index.mjs` 를 아홉 번 돌린다
    // (2026-07-29 도그푸딩). 주석 한 줄이면 붙여넣기 한 번으로 끝난다.
    `# export ATLAS=<path to your ontology-atlas source checkout>`,
    `${ATLAS_CLI} validate ${target}`,
    `${ATLAS_CLI} workspace-brief ${target}`,
    `${ATLAS_CLI} agent-brief ${target} --prompt`,
    `${ATLAS_CLI} agent-brief ${target} --graph-db-pack`,
    `${ATLAS_CLI} agent-brief ${target} --verify-fallbacks`,
    `${ATLAS_CLI} agent-brief ${target} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
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
  'agent-brief . --verify-fallbacks --json',
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
    `5. ${ATLAS_CLI} agent-brief ${vaultPathArg} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
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
    `5. Gate fallback performance: ${ATLAS_CLI} agent-brief ${vaultPathArg} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
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
    `${ATLAS_CLI} agent-brief ${vaultPathArg} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
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
   * 설정 쓰기 — **도구를 받는다.** 이 인터페이스가 인자 없는 서명을 재선언하고
   * 있어서, 훅 쪽을 고쳐도 여기서 다시 삼켜졌다. 서명을 복제한 자리가 계약을
   * 되돌리는 전형이다.
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
  // 원클릭 버튼·3단계 카피는 지도 시트와 동일 출처(`agentConnect`)를 재사용해
  // 두 표면이 어긋나지 않게 한다.
  const tc = useTranslations('agentConnect');
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  // 딥링크는 절대 경로가 있어야 성립(설치 앱). 웹은 null → 복사 강등.
  const cursorDeeplink = buildCursorMcpDeeplink(vaultRootPath, serverAvailability.launch);

  /** 도구를 받아 그 파일만 쓴다 — 안 넘기면 종전대로 한 벌 전부(스캐폴드 자리). */
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

  // 서버를 띄울 방법을 아는가 — 이 하나가 원클릭 성립 여부를 가른다.
  const publicPackagesReady = serverAvailability.launch !== null;
  const agentSetupReady = Boolean(
    publicPackagesReady &&
      agentStatus.mcpJson &&
      agentStatus.codexConfig &&
      agentStatus.mcpExample &&
      agentStatus.mcpJsonValid !== false &&
      agentStatus.codexConfigValid !== false &&
      agentStatus.mcpExampleValid !== false,
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
      // **「5개가 막음」이 갈 곳을 갖는다** (2026-08-04). 종전 이 블록의
      // 인터랙티브 요소는 **0개**였고, 어느 파일이 잘못됐는지 한 글자도 없었다 —
      // 사람이 수치를 읽고 나서 할 수 있는 일이 창을 닫는 것뿐이었다. 「할 일」
      // 화면의 준비도 미터가 같은 검사 결과를 세므로 그리로 보낸다.
      href:
        validationState === 'error' || validationState === 'warning'
          ? '/ontology/insights/?tab=do-next'
          : null,
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
      href: null,
    },
    {
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

  return (
    <section
      aria-label={t('agentSetup.ariaLabel')}
      className="min-w-0 rounded-chip border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a06)] p-2.5"
    >
      <div className="flex items-start gap-2">
        <Bot
          size={14}
          aria-hidden
          className="mt-0.5 text-[color:var(--color-indigo-accent)]"
        />
        <div className="min-w-0 flex-1">
          {/*
            **배지가 없다 (2026-08-02, 디자인 카운슬 S2).** 「누락」 앰버 배지는
            같은 사실의 **세 번째 진술**이었다: y=195 「누락」 · y≈214 「설정
            파일 0/3개 준비됨」 · y=721 「연결 파일 0/3 준비됨…」. 셋 다 같은
            수를 말하는데 첫째만 색으로 소리쳤다. 바로 아래 줄이 그 수를 이미
            말하므로 배지는 잉크만 쓰고 정보를 안 나른다.
          */}
          <h3 className="text-label font-medium text-[color:var(--color-text-primary)]">
            {t('agentSetup.title')}
          </h3>
          <p className="mt-1 text-label leading-4 text-[color:var(--color-text-tertiary)]">
            {publicPackagesReady
              ? t('agentSetup.statusSummary', {
                  ready: agentSetupReadyCount,
                  total: agentSetupFiles.length,
                })
              : t('agentSetup.serverStatusSummary')}
            {publicPackagesReady && nextMissingAgentConfig ? (
              <span className="block font-mono text-caption text-[color:var(--color-amber-source-text-a95)]">
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
          <p className="mt-1 text-label leading-4 text-[color:var(--color-indigo-pale-a82)]">
            {publicPackagesReady
              ? agentSetupReady
                ? t('agentSetup.rootSummaryReady')
                : t('agentSetup.rootSummaryMissing')
              : t('agentSetup.rootSummaryBlocked')}
          </p>

          {/* 첫 화면 = 3단계만 (C13). 나머지 검증·스니펫·게이트는 아래 고급 접기. */}
          <div className="mt-3 grid gap-2">
            <StepRow
              n={1}
              testId="agent-setup-step-1"
              title={tc('step1Title')}
              desc={publicPackagesReady ? tc('step1Desc') : undefined}
            >
              <AgentClientButtons
                serverAvailability={serverAvailability}
                /* 도구를 그대로 넘긴다 — `() => void handleEnsureAgentConfigs()` 는
                   인자를 삼켜서, 어느 버튼을 눌러도 같은 파일들이 나갔다. */
                onWriteConfigs={
                  publicPackagesReady && canEditCurrent
                    ? (client) => void handleEnsureAgentConfigs(client)
                    : null
                }
                cursorDeeplink={cursorDeeplink}
                mcpJsonSnippet={buildMcpConfigJson(vaultNameForConfig, vaultRootPath)}
                replacementMcpJsonSnippet={buildMcpConfigJson(
                  vaultNameForConfig,
                  '.',
                )}
                codexCommand={buildCodexMcpAddCommandTemplate(
                  vaultNameForConfig,
                  vaultRootPath,
                )}
                mcpJsonState={mcpJsonState}
                codexConfigState={codexConfigState}
                codexConfigSnippet={buildCodexConfigTomlTemplate(
                  vaultNameForConfig,
                  '.',
                )}
                needsManualPath={vaultRootPath === null}
              />
            </StepRow>
            {publicPackagesReady ? (
              <>
                <StepRow
                  n={2}
                  testId="agent-setup-step-2"
                  title={tc('step2Title')}
                  desc={tc('step2Desc')}
                />
                {/*
                  **`step3Desc` 를 여기서는 안 쓴다** (2026-08-02, 디자인 카운슬).
                  그 문장은 「에이전트가 이 지도를 읽기 시작하면 여기에 표시돼요」
                  인데, 그 약속을 지키는 heartbeat 신호는 **지도 시트만** 갖고
                  있다(`use-agent-connect-model.ts`). 이 화면이 아래에 그리는 것은
                  1단계와 같은 값(설정 파일 유효성)을 라벨만 바꿔 다시 말한 것이라,
                  문장을 그대로 두면 지키지 않는 약속이 된다.
                  아래 줄이 이 화면이 실제로 아는 것을 말하므로 설명은 뺀다 —
                  배선(`agentActivityStatus`)은 카피 통합과 한 묶음이라 다음이다.
                */}
                <StepRow n={3} testId="agent-setup-step-3" title={tc('step3Title')}>
                  <div className="flex items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: agentSetupReady
                          ? 'var(--color-status-success)'
                          : 'var(--color-text-quaternary)',
                      }}
                    />
                    <span className="min-w-0 flex-1 break-keep text-caption leading-4 text-[color:var(--color-text-secondary)]">
                      {agentSetupReady
                        ? t('agentSetup.connectionCheckReady')
                        : t('agentSetup.connectionCheckPending', {
                            ready: agentSetupReadyCount,
                            total: agentSetupFiles.length,
                          })}
                    </span>
                  </div>
                </StepRow>
              </>
            ) : null}
          </div>

          {/* 고급 · 자세한 검증 — 연결 파일 상태·수리·모드·게이트·CLI·복사 패킷.
              토글은 글자만으로 눌리는 것 = `link`(실측 85). 서체·자간·자리잡기만
              이 한 자리의 것이라 className 에 남고, 크기·색은 램프가 낸다. */}
          {publicPackagesReady ? (
            <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            data-testid="agent-setup-advanced-toggle"
            className={controlClass({
              shape: 'link',
              size: 'sm',
              tone: 'muted',
              className:
                'touch-hit-expand mt-3 self-start font-mono uppercase tracking-[0.12em] hover:text-[color:var(--color-text-secondary)]',
            })}
          >
            <ChevronDown
              size={11}
              aria-hidden
              className="transition-transform"
              style={{ transform: advancedOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            />
            {tc('advancedToggle')}
            </button>
          ) : null}
          {publicPackagesReady && advancedOpen ? (
          <div className="mt-2" data-testid="agent-setup-advanced">
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
                  className="grid grid-cols-[14px_1fr] gap-1.5 rounded-micro border border-[color:var(--color-indigo-line-a13)] bg-[color:var(--color-overlay-recessed-a12)] px-1.5 py-1"
                >
                  {ready ? (
                    <CheckCircle2
                      size={12}
                      aria-hidden
                      className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                    />
                  ) : (
                    <CircleAlert
                      size={12}
                      aria-hidden
                      className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-label font-medium text-[color:var(--color-text-secondary)]">
                        {label}
                      </span>
                      <span
                        className={`shrink-0 rounded-micro px-1.5 py-0.5 text-caption ${
                          ready
                            ? 'bg-[color:var(--color-success-a10)] text-[color:var(--color-success-text-a92)]'
                            : 'bg-[color:var(--color-amber-source-a10)] text-[color:var(--color-amber-source-text-a95)]'
                        }`}
                      >
                        {ready
                          ? t('agentSetup.connectionReady')
                          : t('agentSetup.connectionNeedsReview')}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
                      {check}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
            {t('agentSetup.connectionHint')}
          </p>
          <p className="mt-2 break-keep rounded-micro border border-[color:var(--color-indigo-line-a14)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5 text-label leading-4 text-[color:var(--color-text-tertiary)]">
            <span className="font-medium text-[color:var(--color-text-secondary)]">
              {t('agentSetup.boundaryTitle')}
            </span>{' '}
            {t('agentSetup.boundaryDesc')}
          </p>
          <div
            role="status"
            aria-label={t('agentSetup.validationGateAriaLabel')}
            className={`mt-2 grid grid-cols-[14px_1fr] gap-1.5 rounded-micro border px-2 py-1.5 ${
              validationGateTone === 'ready'
                ? 'border-[color:var(--color-success-a20)] bg-[color:var(--color-success-a055)]'
                : validationGateTone === 'blocked'
                  ? 'border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)]'
                  : 'border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a07)]'
            }`}
          >
            {validationGateTone === 'ready' ? (
              <CheckCircle2
                size={12}
                aria-hidden
                className="mt-0.5 text-[color:var(--color-success-text-a90)]"
              />
            ) : (
              <CircleAlert
                size={12}
                aria-hidden
                className={`mt-0.5 ${
                  validationGateTone === 'blocked'
                    ? 'text-[color:var(--color-status-danger)]'
                    : 'text-[color:var(--color-amber-source-text-a95)]'
                }`}
              />
            )}
            <span className="min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="text-label font-medium text-[color:var(--color-text-secondary)]">
                  {t('agentSetup.validationGateTitle')}
                </span>
                <span
                  className={`shrink-0 rounded-micro px-1.5 py-0.5 font-mono text-caption uppercase ${
                    validationGateTone === 'ready'
                      ? 'bg-[color:var(--color-success-a10)] text-[color:var(--color-success-text-a92)]'
                      : validationGateTone === 'blocked'
                        ? 'bg-[color:var(--color-danger-a12)] text-[color:var(--color-status-danger)]'
                        : 'bg-[color:var(--color-amber-source-a10)] text-[color:var(--color-amber-source-text-a95)]'
                  }`}
                >
                  {validationGateStatus}
                </span>
              </span>
              <span className="mt-0.5 block text-label leading-4 text-[color:var(--color-text-secondary)]">
                {validationGateSummary}
              </span>
              <span className="mt-0.5 block break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                {validationGateDesc}
              </span>
            </span>
          </div>
          <details className="mt-2 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
            <summary className="cursor-pointer select-none text-label font-medium text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]">
              {t('agentSetup.nextStepsSummary')}
            </summary>
            <ol
              aria-label={t('agentSetup.nextStepsAriaLabel')}
              className="mt-1.5 grid gap-1"
            >
              {agentSetupSteps.map((step, index) => (
                <li
                  key={step.key}
                  className="grid grid-cols-[18px_1fr] items-start gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-1.5 py-1"
                >
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-micro font-mono text-caption ${
                      step.complete
                        ? 'bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]'
                        : 'bg-[color:var(--color-indigo-a14)] text-[color:var(--color-indigo-pale-a90)]'
                    }`}
                  >
                    {step.complete ? '✓' : index + 1}
                  </span>
                  <span className="break-keep text-label leading-4 text-[color:var(--color-text-secondary)]">
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
                data-testid={`agent-setup-proof-${row.key}`}
                className="grid grid-cols-[14px_76px_1fr] items-start gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-1.5 py-1"
              >
                {row.state === 'ready' ? (
                  <CheckCircle2
                    size={12}
                    aria-hidden
                    className="mt-0.5 text-[color:var(--color-success-text-a90)]"
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
                    className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                  />
                ) : (
                  <CircleAlert
                    size={12}
                    aria-hidden
                    className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
                  />
                )}
                <dt className="truncate font-mono text-caption uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                  {row.label}
                </dt>
                <dd className="break-keep text-label leading-4 text-[color:var(--color-text-secondary)]">
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
          <dl
            aria-label={t('agentSetup.proofContractAriaLabel')}
            className="mt-1.5 grid gap-1"
          >
            {agentFirstContactProofRows.map((row, index) => (
              <div
                key={row.key}
                className="grid grid-cols-[18px_88px_1fr] items-start gap-1.5 rounded-micro border border-[color:var(--color-indigo-line-a13)] bg-[color:var(--color-indigo-a06)] px-1.5 py-1"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-micro bg-[color:var(--color-indigo-a14)] font-mono text-caption text-[color:var(--color-indigo-pale-a90)]">
                  {index + 1}
                </span>
                <dt className="truncate font-mono text-caption uppercase tracking-[0.08em] text-[color:var(--color-indigo-pale-a82)]">
                  {row.label}
                </dt>
                <dd className="break-keep text-label leading-4 text-[color:var(--color-text-secondary)]">
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
                  className="grid grid-cols-[14px_1fr] items-start gap-1.5 text-label leading-4 text-[color:var(--color-text-secondary)]"
                >
                  {present && valid ? (
                    <CheckCircle2
                      size={12}
                      aria-hidden
                      className="mt-0.5 text-[color:var(--color-success-text-a90)]"
                    />
                  ) : (
                    <CircleAlert
                      size={12}
                      aria-hidden
                      className="mt-0.5 text-[color:var(--color-amber-source-text-a95)]"
                    />
                  )}
                  <span>
                    <code className="font-mono text-label text-[color:var(--color-text-primary)]">
                      {path}
                    </code>{' '}
                    <span className="text-[color:var(--color-text-tertiary)]">
                      {label}
                    </span>
                    {present && !valid ? (
                      <span className="ml-1 text-[color:var(--color-amber-source-text-a95)]">
                        {t('agentSetup.needsReview')}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          {hasMissingAgentConfig && canEditCurrent ? (
            <Chip
              onClick={() => void handleEnsureAgentConfigs()}
              disabled={agentSetupBusy}
              title={t('agentSetup.repairTitle')}
              tone="accentOnTint"
              className="mt-2 w-full justify-center border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
            >
              <Bot size={12} aria-hidden />
              {agentSetupBusy
                ? t('agentSetup.repairing')
                : t('agentSetup.repair')}
            </Chip>
          ) : null}
          {hasInvalidAgentConfig ? (
            <p className="mt-2 break-keep rounded-micro border border-[color:var(--color-amber-source-a14)] bg-[color:var(--color-amber-source-a08)] px-2 py-1.5 text-label leading-4 text-[color:var(--color-amber-source-text-a95)]">
              {t('agentSetup.invalidRepairHint')}
            </p>
          ) : null}
          <div className="mt-2 text-caption font-medium uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
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
                className="rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1"
              >
                <dt className="text-label font-medium text-[color:var(--color-text-secondary)]">
                  {mode.term}
                </dt>
                <dd className="mt-0.5 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                  {mode.desc}
                </dd>
              </div>
            ))}
          </dl>
          <Chip
            onClick={onOpenWorkflowGuide}
            title={t('agentSetup.openWorkflowGuideTitle')}
            tone="accentOnTint"
            className="mt-2 w-full justify-center border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a08)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a14)]"
          >
            <BookOpen size={12} aria-hidden />
            {t('agentSetup.openWorkflowGuide')}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentSetupPacket()}
            title={t('agentSetup.copyPacketTitle')}
            tone="accentOnTint"
            className="mt-2 w-full justify-center border-[color:var(--color-indigo-a42)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-a62)] hover:bg-[color:var(--color-indigo-a16)]"
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyPacketLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentVerifyPrompt()}
            title={t('agentSetup.copyPromptTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP + ' mt-2'}
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyPromptLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentVerifyCli()}
            title={t('agentSetup.copyCliTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP + ' mt-1.5'}
          >
            <Terminal size={12} aria-hidden />
            {copyCliLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentFirstContactProof()}
            title={t('agentSetup.copyFirstContactProofTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP + ' mt-1.5'}
          >
            <Terminal size={12} aria-hidden />
            {copyFirstContactProofLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentJsonGate()}
            title={t('agentSetup.copyJsonGateTitle')}
            tone="success"
            className={GATE_COPY_CHIP + ' mt-1.5'}
          >
            <Terminal size={12} aria-hidden />
            {copyJsonGateLabel}
          </Chip>
          <div
            aria-label={t('agentSetup.mcpVerifyPreviewAriaLabel')}
            className="mt-1.5 rounded-micro border border-[color:var(--color-indigo-a20)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5"
          >
            <div className="text-caption font-medium uppercase tracking-[0.12em] text-[color:var(--color-indigo-pale-a82)]">
              {t('agentSetup.mcpVerifyLabel')}
            </div>
            <code className="mt-1 block truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
              {agentMcpVerifyPreview}
            </code>
          </div>
          <div className="mt-1.5 rounded-micro border border-[color:var(--color-success-a18)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
            <div className="text-caption font-medium uppercase tracking-[0.12em] text-[color:var(--color-success-text-a78)]">
              {t('agentSetup.jsonGateLabel')}
            </div>
            <code className="mt-1 block truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
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
                className="grid grid-cols-[92px_1fr] gap-2 rounded-micro border border-[color:var(--color-success-a12)] bg-[color:var(--color-success-a035)] px-2 py-1"
              >
                <dt className="truncate font-mono text-caption text-[color:var(--color-success-text-a94)]">
                  {rule.term}
                </dt>
                <dd className="break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                  {rule.desc}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-1.5 rounded-micro border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] px-2 py-1.5">
            <p className="text-caption font-medium uppercase tracking-[0.12em] text-[color:var(--color-indigo-pale-a82)]">
              {t('agentSetup.syncAfterChangeTitle')}
            </p>
            <p className="mt-1 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
              {t('agentSetup.syncAfterChangeDesc')}
            </p>
            <Chip
              onClick={() => void handleCopyAgentPostChangeSyncGate()}
              title={t('agentSetup.copyPostChangeSyncTitle')}
              tone="accentOnTint"
              className="mt-2 w-full justify-center border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a08)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-a13)]"
            >
              <ClipboardCopy size={12} aria-hidden />
              {copyPostChangeSyncLabel}
            </Chip>
          </div>
          <ol className="mt-1.5 grid gap-1" aria-label={t('agentSetup.cliPreviewAriaLabel')}>
            {AGENT_VERIFY_CLI_PREVIEW.map((command, index) => (
              <li
                key={command}
                className="grid grid-cols-[18px_1fr] items-center gap-1.5 rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a14)] px-1.5 py-1"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-micro bg-[color:var(--color-indigo-a14)] font-mono text-caption text-[color:var(--color-indigo-pale-a90)]">
                  {index + 1}
                </span>
                <code className="truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
                  {ATLAS_CLI} {command}
                </code>
              </li>
            ))}
          </ol>
          <div className="mt-2 text-caption font-medium uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)]">
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
                className="rounded-micro border border-[color:var(--color-indigo-line-a13)] bg-[color:var(--color-indigo-a06)] px-2 py-1"
              >
                <dt className="font-mono text-caption uppercase tracking-[0.08em] text-[color:var(--color-indigo-pale-a82)]">
                  {rootMode.term}
                </dt>
                <dd className="mt-0.5 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
                  {rootMode.desc}
                </dd>
              </div>
            ))}
          </dl>
          <Chip
            onClick={() => void handleCopyAgentSetupCheckCliCommand()}
            title={t('agentSetup.copySetupCheckCliTitle')}
            tone="success"
            className={GATE_COPY_CHIP + ' mt-1.5'}
          >
            <Terminal size={12} aria-hidden />
            {copySetupCheckCliLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentSetupCliCommand()}
            title={t('agentSetup.copySetupCliTitle')}
            tone="warning"
            className="mt-1.5 w-full justify-center border-[color:var(--color-amber-source-a25)] bg-[color:var(--color-amber-source-a07)] hover:border-[color:var(--color-amber-source-a42)] hover:bg-[color:var(--color-amber-source-a11)]"
          >
            <Terminal size={12} aria-hidden />
            {copySetupCliLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyAgentConfigTemplate()}
            title={t('agentSetup.copyTemplateTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP + ' mt-1.5'}
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyTemplateLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyCodexConfigTemplate()}
            title={t('agentSetup.copyCodexTemplateTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP + ' mt-1.5'}
          >
            <ClipboardCopy size={12} aria-hidden />
            {copyCodexTemplateLabel}
          </Chip>
          <Chip
            onClick={() => void handleCopyCodexMcpAddCommand()}
            title={t('agentSetup.copyCodexCliTitle')}
            tone="secondary"
            className={NEUTRAL_COPY_CHIP + ' mt-1.5'}
          >
            <Terminal size={12} aria-hidden />
            {copyCodexCliLabel}
          </Chip>
          </div>
          ) : null}
          {agentSetupError ? (
            <p
              role="alert"
              className="mt-2 text-label leading-4 text-[color:var(--color-status-danger)]"
            >
              {agentSetupError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

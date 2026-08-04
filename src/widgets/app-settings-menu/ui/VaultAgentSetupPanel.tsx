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
  'border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]';

/**
 * 이 절의 **주 행동** 하나만 인디고 틴트를 받는다.
 *
 * 2026-08-04 이전엔 복사 칩 11개가 전부 전폭 32px 로 세로로 쌓여 있었다 —
 * 「그룹의 주 행동」과 「그 옆의 보조」가 같은 무게라, 어느 것을 눌러야 하는지를
 * 화면이 말해 주지 않았다. 폭도 다시 내용에 맡긴다(`w-full` 제거).
 */
const ACCENT_ACTION_CHIP =
  'border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]';

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
  /**
   * 「잘 안 되나요?」 서랍 — 흐름 안 접기라 목록 행 펼침 문법을 쓴다.
   * 첫 판의 `Surface`(chrome 문법)는 떠 있는 표면의 것이라 아래 형제가 두 번
   * 튀었다(설치 앱 프레임 실측 — `AgentSetupStep.tsx` 머리말에 수치).
   * `publicPackagesReady`(= launch 가능) 선언보다 앞이라 prop 에서 직접 센다.
   */
  const advancedRevealOpen = serverAvailability.launch !== null && advancedOpen;
  const {
    mounted: advancedMounted,
    boxRef: advancedBoxRef,
    contentRef: advancedContentRef,
  } = useRowDisclosure(advancedRevealOpen);
  /**
   * 펼친 단계 — `null` 이면 **지금 할 일을 따라간다.**
   *
   * 파생값 하나로 두면 사용자가 3단계를 열어 놓고 1단계 버튼을 눌렀을 때 화면이
   * 제멋대로 접힌다. 상태 하나로 두면 연결이 끝나도 1단계가 계속 열려 있다.
   * 그래서 「따라가기(null)」와 「사용자가 골랐다(숫자)」를 구분한다 — `0` 은
   * 「셋 다 접음」이다.
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
  /**
   * 파일 셋 — **역할 라벨을 뺐다** (2026-08-04). 「Claude Code · Cursor 연결 파일」
   * 은 바로 옆의 도구 이름 + 경로 + 「연결 파일 상태」 묶음 제목이 이미 세 번
   * 말하는 것이라, 넷째 진술이었다.
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
    {
      key: 'mcpExample',
      validKey: 'mcpExampleValid',
      path: '.mcp.json.example',
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
  /**
   * 접기 뒤의 **더 확인할 것** — 3단계 뒤에 오는 것만.
   *
   * 종전에는 여기가 6줄이었고 앞 셋(설정 파일 · 재시작 · 연결 확인)이 위
   * 3단계와 **같은 말을 번호만 바꿔** 다시 했다. 그래서 이 화면에는 번호 배지가
   * 네 벌(단계 3 · 흐름 6 · 증거 4 · 명령 6) 있었고 어느 것도 「지금 할 일」을
   * 못 가리켰다. 앞 셋은 단계로 승격됐으니 여기서는 뒤 셋만 남는다 —
   * 사라진 것이 아니라 **올라간 것**이라 도달 가능성은 그대로다.
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
      /*
       * ⚠️ 여기 있던 「연결 파일 {ready}/{total}」 행은 뺐다 (2026-08-04).
       * 같은 수를 화면이 **세 번** 말하고 있었다 — 머리 요약 · 이 행 · 3단계의
       * 상태 줄. 2026-08-02 디자인 카운슬이 「누락」 배지를 뺀 것과 정확히 같은
       * 사유이고(그때는 세 번째 진술이 색으로 소리쳤다), 그 판정이 여기서
       * 되살아난 것이다. 머리 요약은 **항상 보이므로** 남는 둘 중 하나는
       * 언제나 화면에 있다.
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
   * 지금 할 일은 하나다 — **앱이 실제로 아는 것만으로** 정한다.
   *
   * 1단계(연결 파일)는 디스크를 봐서 안다. 2단계(다시 켜기)와 3단계(연결 확인)는
   * 원리적으로 알 수 없다 — Atlas 는 에이전트에 접속하지 않는다(`connectionHint`
   * 가 이미 그렇게 말한다). 그래서 둘은 **자동으로 완료가 되지 않고**, 대신
   * 사용자가 직접 열 수 있다. 모르는 것을 아는 척하는 대신 순서만 안내한다.
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
        **머리는 두 줄이다** (2026-08-04). 종전에는 여기에 제목 `<h3>` 이 하나 더
        있었는데, 왼쪽 LNB 가 같은 눈높이에서 「내 에이전트 연결」을 이미 말하고
        있었다 — 같은 이름을 두 번 쓰는 대신 한 번만 쓴다. 이름은 region 의
        접근 이름으로 남으므로 보조기술에서도 잃지 않는다.
      */}
      <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
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
        ── 3단계 ────────────────────────────────────────────────────────
        한 번에 하나만 펼친다. 웹(서버를 띄울 방법을 모르는 자리)에서는 1단계가
        곧 강등 카드라서 2·3단계가 성립하지 않는다 — 없는 단계를 회색으로
        보여 주는 것은 안내가 아니라 막다른 길이다.
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
            /* 도구를 그대로 넘긴다 — `() => void handleEnsureAgentConfigs()` 는
               인자를 삼켜서, 어느 버튼을 눌러도 같은 파일들이 나갔다. */
            onWriteConfigs={
              publicPackagesReady && canEditCurrent
                ? (client) => void handleEnsureAgentConfigs(client)
                : null
            }
            /* 넷은 「정답 하나」가 아니라 **하나 고르는 것**이다 — 세로 전폭 넷은
               각각이 큰 결정처럼 읽혔다(소유자 지적 2026-08-04). 2열이면 한 벌로
               읽히고 세로 152px 이 76px 이 된다. */
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
              **`step3Desc` 를 여기서는 안 쓴다** (2026-08-02, 디자인 카운슬).
              그 문장은 「에이전트가 이 지도를 읽기 시작하면 여기에 표시돼요」
              인데, 그 약속을 지키는 heartbeat 신호는 **지도 시트만** 갖고
              있다(`use-agent-connect-model.ts`). 이 화면이 아는 것은 연결
              파일의 유효성까지라, 문장을 그대로 두면 지키지 않는 약속이 된다.
              대신 이 화면이 **실제로 아는 것**(파일 상태)과 사람이 직접 확인할
              방법(도구별 확인 명령)을 준다.
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
                단계 하나 = 상자 하나. 상태 줄과 도구별 확인 방법이 따로 떠 있으면
                「이 단계가 무엇인가」가 두 덩어리로 읽힌다 — 이 화면이 고치려던
                바로 그 평평함이다. 하나로 묶고 안에서 헤어라인으로 가른다.
                (확인 방법은 종전 고급 접기 안에만 있었다. 「연결 확인」 단계의
                내용이 곧 이것이라 여기가 제자리다.)
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
                  <span className="min-w-0 flex-1 break-keep text-label text-[color:var(--color-text-secondary)]">
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
                      <dt className="min-w-0 truncate text-label text-[color:var(--color-text-secondary)]">
                        {label}
                      </dt>
                      <dd className="shrink-0 font-mono text-caption text-[color:var(--color-text-tertiary)]">
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
        ── 잘 안 되나요? ────────────────────────────────────────────────
        고급·검증·CLI·다른 폴더 연결이 전부 이 뒤에 있다. **지운 것이 아니라
        접은 것**이라, 접힌 것에는 전부 도달할 수 있어야 한다.
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
            size={12}
            aria-hidden
            className="transition-transform"
            style={{ transform: advancedOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
          {t('agentSetup.troubleshootToggle')}
        </button>
      ) : null}
      {/* 상자는 늘 그려 둔다(전이의 출발 높이) — 내용만 접힘에서 빠진다.
          `id` 가 상자에 있어 위 토글의 `aria-controls` 대상이 접힘 중에도
          실재하고, testid 는 내용에 있어 「접히면 없다」 계약이 유지된다. */}
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
          ── 검사 묶음 ──────────────────────────────────────────────────
          ⚠️ **이 한 덩어리는 곧 「손볼 곳」 탭으로 옮겨간다** (소유자 확정
          2026-08-04 — 검사·수리·삭제가 그리로 간다). 이번 라운드에서 옮기지
          않는 대신 **옮기기 쉬운 형태**로 한 노드 아래 모아 둔다. 흩어 두면
          그때 다시 여덟 자리를 찾아다녀야 한다.
        */}
        <div data-testid="agent-setup-inspection" className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.groupFiles')}</SectionLabel>
          {/*
            **목록이 하나다** (2026-08-04). 종전에는 같은 세 파일을 두 번 그렸다 —
            위는 「도구 이름 + 확인 방법 + 배지」, 아래는 「경로 + 역할」. 두 목록의
            행 수도 순서도 같았고, 다른 것은 어느 쪽이 경로를 말하느냐뿐이었다.
            같은 사실을 두 자리에서 말하면 어느 쪽이 최신인지 아무도 모른다.
            확인 방법(`/mcp` 등)은 3단계로 올라갔으므로 여기 남는 것은
            **이름 · 경로 · 상태** 셋이다.
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
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-label text-[color:var(--color-text-secondary)]">
                      {label}
                    </span>
                    <code className="min-w-0 flex-1 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                      {file.path}
                    </code>
                    <span
                      className={`shrink-0 text-caption ${
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
              <Bot size={12} aria-hidden />
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
            ── 폴더 상태 ────────────────────────────────────────────────
            ⚠️ **2026-08-04 정정 — 이 상자는 거짓말을 하고 있었다.**
            빨간 「HANDOFF BLOCKED」 배지와 *"에이전트가 ontology를 수정하기 전에
            vault validation 오류를 먼저 해결해야 합니다"* 라는 문장을 달고
            있었는데, **막지 않는다**. MCP 쓰기 경로(`add_concept` ·
            `patch_concept` …)에 그 게이트가 없다. 오류가 실제로 거절하는 것은
            `git_snapshot({confirm:true})` 하나뿐이다(`mcp/src/index.js` —
            *"git_snapshot blocked: validate_vault found N file(s) with errors"*).
            화면이 근거 없는 사실을 주장하면 사용자는 되는 일을 포기한다.
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
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-label font-medium text-[color:var(--color-text-secondary)]">
                  {t('agentSetup.validationGateTitle')}
                </span>
                <span
                  className={`shrink-0 text-caption ${
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
                <dt className="truncate text-caption text-[color:var(--color-text-quaternary)]">
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

        {/* ── 에이전트가 이 폴더를 쓰는 방식 ──────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.groupHowAgentsUse')}</SectionLabel>
          <p className="break-keep rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5 text-label text-[color:var(--color-text-tertiary)]">
            <span className="font-medium text-[color:var(--color-text-secondary)]">
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
                <dt className="text-label font-medium text-[color:var(--color-text-secondary)]">
                  {mode.term}
                </dt>
                <dd className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                  {mode.desc}
                </dd>
              </div>
            ))}
          </dl>
          <details className="rounded-micro border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
            <summary className=" select-none text-label font-medium text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]">
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
                  <dt className="text-caption text-[color:var(--color-text-quaternary)]">
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
              <BookOpen size={12} aria-hidden />
              {t('agentSetup.openWorkflowGuide')}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentSetupPacket()}
              title={t('agentSetup.copyPacketTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={12} aria-hidden />
              {copyPacketLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentVerifyPrompt()}
              title={t('agentSetup.copyPromptTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={12} aria-hidden />
              {copyPromptLabel}
            </Chip>
          </div>
        </div>

        {/* ── 명령으로 확인하기 ──────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.verifyGroup')}</SectionLabel>
          <div
            aria-label={t('agentSetup.mcpVerifyPreviewAriaLabel')}
            className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5"
          >
            <div className="text-caption text-[color:var(--color-text-quaternary)]">
              {t('agentSetup.mcpVerifyLabel')}
            </div>
            <code className="mt-1 block truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
              {agentMcpVerifyPreview}
            </code>
          </div>
          <div className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed)] px-2 py-1.5">
            <div className="text-caption text-[color:var(--color-text-quaternary)]">
              {t('agentSetup.jsonGateLabel')}
            </div>
            <code className="mt-1 block truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
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
                <dt className="text-label text-[color:var(--color-text-secondary)]">
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
                <code className="block truncate font-mono text-caption text-[color:var(--color-text-tertiary)]">
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
              <Terminal size={12} aria-hidden />
              {copyJsonGateLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentVerifyCli()}
              title={t('agentSetup.copyCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={12} aria-hidden />
              {copyCliLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentFirstContactProof()}
              title={t('agentSetup.copyFirstContactProofTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={12} aria-hidden />
              {copyFirstContactProofLabel}
            </Chip>
          </div>
          <div className="rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-recessed-a12)] px-2 py-1.5">
            <p className="text-label font-medium text-[color:var(--color-text-secondary)]">
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
              <ClipboardCopy size={12} aria-hidden />
              {copyPostChangeSyncLabel}
            </Chip>
          </div>
        </div>

        {/* ── 다른 코드 폴더에서 열 때 ───────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('agentSetup.connectGroup')}</SectionLabel>
          <dl aria-label={t('agentSetup.rootContractAriaLabel')} className="grid gap-1">
            {[
              { term: t('agentSetup.rootVaultTerm'), desc: t('agentSetup.rootVaultDesc') },
              { term: t('agentSetup.rootCodebaseTerm'), desc: t('agentSetup.rootCodebaseDesc') },
            ].map((rootMode) => (
              <div key={rootMode.term} className="grid grid-cols-[92px_1fr] gap-2">
                <dt className="text-label font-medium text-[color:var(--color-text-secondary)]">
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
              <Terminal size={12} aria-hidden />
              {copySetupCheckCliLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentSetupCliCommand()}
              title={t('agentSetup.copySetupCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={12} aria-hidden />
              {copySetupCliLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyAgentConfigTemplate()}
              title={t('agentSetup.copyTemplateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={12} aria-hidden />
              {copyTemplateLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyCodexConfigTemplate()}
              title={t('agentSetup.copyCodexTemplateTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <ClipboardCopy size={12} aria-hidden />
              {copyCodexTemplateLabel}
            </Chip>
            <Chip
              size="sm"
              onClick={() => void handleCopyCodexMcpAddCommand()}
              title={t('agentSetup.copyCodexCliTitle')}
              tone="secondary"
              className={NEUTRAL_COPY_CHIP}
            >
              <Terminal size={12} aria-hidden />
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
 * 접기 안의 묶음 제목 — **아이브로우 한 단**.
 *
 * 이 자리의 `text-caption`(9.5px)은 설정 루트 시트에서 금지된 그 쓰임이 아니다.
 * 램프 정의가 말하는 「마이크로 라벨」이고, 누르는 글자도 설명도 아니다
 * (`settings-sheet-type-dialect` 계약이 이 파일을 사정거리 밖에 두는 이유와 같다).
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-caption font-medium uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
      {children}
    </h4>
  );
}

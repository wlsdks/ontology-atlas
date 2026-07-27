/**
 * 「에이전트 연결」 네이티브 브리지 — `src-tauri/src/agent_setup.rs` 의 짝.
 *
 * 웹에서는 전부 null 또는 실패를 돌려준다. 브라우저는 열린 폴더의 절대 경로를
 * 구조적으로 알 수 없고(File System Access API 의 설계), 절대 경로 없이는
 * 실행 가능한 에이전트 설정을 만들 수 없다. 이건 결함이 아니라 경계다 —
 * UI 는 여기서 정직하게 강등해야 한다.
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

export interface BundledMcpServer {
  path: string | null;
  available: boolean;
  reason: string | null;
}

export interface AgentConfigTarget {
  absolutePath: string;
  fileName: string;
  exists: boolean;
  currentContents: string | null;
}

export interface AgentConfigPlan {
  configRoot: string;
  /** `repo-root` 면 vault 를 담은 git 최상위, `vault-folder` 면 vault 자체. */
  rootKind: 'repo-root' | 'vault-folder';
  vaultPath: string;
  targets: AgentConfigTarget[];
}

export interface AgentConfigWrite {
  fileName: string;
  contents: string;
}

export interface AgentConfigWriteResult {
  configRoot: string;
  written: string[];
}

export interface McpVerifyResult {
  ok: boolean;
  serverVersion: string | null;
  toolCount: number | null;
  sampleSlug: string | null;
  sampleTitle: string | null;
  failure: string | null;
}

/** 앱 번들 안의 MCP 서버 경로. 웹이면 `available: false`. */
export async function readBundledMcpServer(): Promise<BundledMcpServer> {
  const invoke = getInvoke();
  if (!invoke) {
    return {
      path: null,
      available: false,
      reason: 'The bundled MCP server is only available in the installed app.',
    };
  }
  return invoke<BundledMcpServer>('mcp_bundled_server');
}

/** 무엇을 어디에 쓸지 계산만 한다 — 디스크는 건드리지 않는다. */
export async function planAgentConfig(vaultPath: string): Promise<AgentConfigPlan | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<AgentConfigPlan>('plan_agent_config', { vaultPath });
}

/** 사용자가 승인한 계획만 실행한다. */
export async function writeAgentConfig(
  vaultPath: string,
  writes: readonly AgentConfigWrite[],
): Promise<AgentConfigWriteResult> {
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error('Writing agent config requires the installed app.');
  }
  return invoke<AgentConfigWriteResult>('write_agent_config', { vaultPath, writes });
}

/** 번들 서버를 그 자리에서 스폰해 이 vault 가 실제로 읽히는지 확인한다. */
export async function verifyMcpServer(
  vaultPath: string,
  sampleSlug?: string | null,
): Promise<McpVerifyResult> {
  const invoke = getInvoke();
  if (!invoke) {
    return {
      ok: false,
      serverVersion: null,
      toolCount: null,
      sampleSlug: null,
      sampleTitle: null,
      failure: 'Connection checking requires the installed app.',
    };
  }
  return invoke<McpVerifyResult>('verify_mcp_server', {
    vaultPath,
    sampleSlug: sampleSlug ?? null,
  });
}

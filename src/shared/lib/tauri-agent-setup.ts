/**
 * The native bridge for connecting an agent — the counterpart of
 * `src-tauri/src/agent_setup.rs`.
 *
 * On the web everything returns null or fails. A browser structurally cannot
 * know the absolute path of the folder it opened (by the File System Access
 * API's design), and without an absolute path no runnable agent config can be
 * written. That is a boundary, not a defect — the UI has to degrade honestly
 * here.
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
  /** `repo-root` is the git top level containing the vault; `vault-folder` is the vault itself. */
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

/** Path to the MCP server inside the app bundle. `available: false` on the web. */
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

/** Only computes what would be written where — touches no disk. */
export async function planAgentConfig(vaultPath: string): Promise<AgentConfigPlan | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<AgentConfigPlan>('plan_agent_config', { vaultPath });
}

/** Runs only a plan the user has approved. */
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

/** Spawns the bundled server on the spot to verify this vault is actually readable. */
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

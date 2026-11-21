/**
 * Bridge over `src-tauri/src/connectors.rs`. Discovery returns names, transports, commands, URLs and
 * env/header key names, never values (a Rust source test pins it). Outside Tauri it returns `null`,
 * so the screen offers the paste path instead of an empty list reading as "nothing registered".
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * Measured against claude-agent-acp 0.74.0 and codex-acp 1.6.2. A discovered `sse` entry is
 * explained, not offered: attached, it would silently produce no tools.
 */
export const ATTACHABLE_TRANSPORTS = ['stdio', 'http'] as const;
export type AttachableTransport = (typeof ATTACHABLE_TRANSPORTS)[number];

export type DiscoveredTransport = AttachableTransport | 'sse' | 'unknown';

/** Rust `DiscoveredConnector` (serde camelCase). */
export interface DiscoveredConnector {
  /** Which file it came from — matches a `DiscoverySource.id`. */
  source: string;
  name: string;
  transport: DiscoveredTransport;
  command: string | null;
  args: string[];
  url: string | null;
  envKeys: string[];
  headerKeys: string[];
}

/** Rust `DiscoverySource` — one config file and how reading it went. */
export interface DiscoverySource {
  id: string;
  path: string;
  status: 'read' | 'missing' | 'malformed';
  /** Entries present in the file whose shape the reader did not understand. */
  unreadable: number;
}

export interface ConnectorDiscovery {
  connectors: DiscoveredConnector[];
  sources: DiscoverySource[];
}

/**
 * Three states, because a failed scan is not an empty list: `discover_mcp_connectors` reads config
 * files and can reject, and `[]` would claim nothing is registered.
 */
export type ConnectorDiscoveryState =
  | { status: 'scanning' }
  | { status: 'failed' }
  | { status: 'done'; connectors: DiscoveredConnector[] };

export function isConnectorDiscoveryAvailable(): boolean {
  return getInvoke() !== null;
}

export function isAttachableTransport(
  transport: DiscoveredTransport,
): transport is AttachableTransport {
  return (ATTACHABLE_TRANSPORTS as readonly string[]).includes(transport);
}

/**
 * Read-only. `vaultPath` narrows `~/.claude.json`'s per-project block to the open folder; without
 * it only user-level files are read, so unrelated projects never appear.
 */
export async function discoverMcpConnectors(
  vaultPath: string | null,
): Promise<ConnectorDiscovery | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<ConnectorDiscovery>('discover_mcp_connectors', {
    vaultPath: vaultPath ?? null,
  });
}

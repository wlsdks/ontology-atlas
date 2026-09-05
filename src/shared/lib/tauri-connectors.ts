/**
 * External MCP connectors — the Tauri IPC bridge over `src-tauri/src/connectors.rs`, following the
 * conventions in `tauri-secrets.ts`.
 *
 * ## What this reads, and what it never reads
 *
 * `discoverMcpConnectors()` reports the MCP servers the person already registered in
 * `~/.claude.json`, the open folder's `.mcp.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json`
 * — **names, transports, commands, URLs, and environment/header key names**. Rust never returns a
 * value from those `env`/`headers` blocks, and a source-level test there pins that. So nothing in
 * this file can hold a token either.
 *
 * ## Web degradation contract
 *
 * A browser cannot read `~/.claude.json`. Outside the Tauri runtime
 * `isConnectorDiscoveryAvailable()` is false and `discoverMcpConnectors()` returns `null` without
 * invoking, so the screen renders the paste-it-yourself path instead of an empty list that would
 * read as "you have nothing registered".
 */
import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * The transports an ACP session can actually carry.
 *
 * Measured against claude-agent-acp 0.74.0 and codex-acp 1.6.2: both accept stdio and HTTP.
 * **SSE is deprecated** and neither adapter takes it, so a discovered `sse` entry is shown and
 * explained rather than offered — presenting it as attachable would hand somebody a connector that
 * silently produces no tools.
 */
export const ATTACHABLE_TRANSPORTS = ['stdio', 'http'] as const;
export type AttachableTransport = (typeof ATTACHABLE_TRANSPORTS)[number];

/** Every transport discovery can report, attachable or not. */
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
  /** Environment variable **names**. Never values. */
  envKeys: string[];
  /** HTTP header **names**. Never values. */
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

/** Whether the discovery IPC exists here — false means the browser, where these files are unreadable. */
export function isConnectorDiscoveryAvailable(): boolean {
  return getInvoke() !== null;
}

export function isAttachableTransport(
  transport: DiscoveredTransport,
): transport is AttachableTransport {
  return (ATTACHABLE_TRANSPORTS as readonly string[]).includes(transport);
}

/**
 * Read what is already registered on this machine. **Read-only** — nothing is attached to a
 * session, and nothing is written, until the person turns a specific server on.
 *
 * `vaultPath` narrows `~/.claude.json`'s per-project block to the folder that is actually open;
 * without it only the user-level files are read. Passing nothing would otherwise mean walking every
 * project the person has ever opened, putting unrelated workplaces on this screen.
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

import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import {
  ATTACHABLE_TRANSPORTS,
  type DiscoveredConnector,
  type DiscoverySource,
  discoverMcpConnectors,
  isAttachableTransport,
  isConnectorDiscoveryAvailable,
} from './tauri-connectors';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('external MCP connector discovery bridge', () => {
  it('reports availability from the Tauri runtime at call time', () => {
    expect(isConnectorDiscoveryAvailable()).toBe(false);
    tauriApiMock.runtimeAvailable = true;
    expect(isConnectorDiscoveryAvailable()).toBe(true);
  });

  it('degrades honestly on the web: null, with zero invokes', async () => {
    // A browser cannot read `~/.claude.json`. Returning an empty list here would read on
    // screen as "you have nothing registered", which is a different and false statement.
    expect(await discoverMcpConnectors('/vault')).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('passes the open folder so only that project block is read', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ connectors: [], sources: [] });
    await discoverMcpConnectors('/work/atlas');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('discover_mcp_connectors', {
      vaultPath: '/work/atlas',
    });
  });

  it('sends null rather than undefined when no folder is open', async () => {
    // `undefined` disappears from the IPC payload and Rust would see a missing argument
    // instead of an explicit "user-level files only".
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ connectors: [], sources: [] });
    await discoverMcpConnectors(null);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('discover_mcp_connectors', {
      vaultPath: null,
    });
  });

  it('carries key names and never a value across the IPC boundary', async () => {
    // The Rust side pins this against its own serialization; this pins the shape the screen
    // is allowed to consume. There is no field here a token could arrive in.
    const notion: DiscoveredConnector = {
      source: 'claude-user',
      name: 'notion',
      transport: 'stdio',
      command: '/opt/homebrew/bin/npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      url: null,
      envKeys: ['NOTION_TOKEN'],
      headerKeys: [],
    };
    const source: DiscoverySource = {
      id: 'claude-user',
      path: '/home/me/.claude.json',
      status: 'read',
      unreadable: 0,
    };
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ connectors: [notion], sources: [source] });
    const discovery = await discoverMcpConnectors('/work/atlas');
    expect(discovery?.connectors[0]?.envKeys).toEqual(['NOTION_TOKEN']);
    expect(Object.keys(discovery?.connectors[0] ?? {})).not.toContain('env');
    expect(discovery?.sources[0]?.status).toBe('read');
  });

  it('treats sse as discovered but not attachable', () => {
    // Both ACP adapters measured (claude-agent-acp 0.74.0, codex-acp 1.6.2) accept stdio and
    // HTTP only. Offering an sse entry would attach a server that produces no tools at all.
    expect(ATTACHABLE_TRANSPORTS).toEqual(['stdio', 'http']);
    expect(isAttachableTransport('stdio')).toBe(true);
    expect(isAttachableTransport('http')).toBe(true);
    expect(isAttachableTransport('sse')).toBe(false);
    expect(isAttachableTransport('unknown')).toBe(false);
  });
});

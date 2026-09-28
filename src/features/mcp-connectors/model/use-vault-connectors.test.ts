import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { connectorAcpServers } from '@/features/acp-session/model/connector-servers';
import type { ConnectorRecord } from '@/shared/lib/connector-record';

import { useVaultConnectors, type VaultConnectorsState } from './use-vault-connectors';

beforeEach(() => {
  window.localStorage.clear();
});

function record(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return {
    id: 'c1',
    name: 'notion',
    transport: 'stdio',
    command: '/opt/homebrew/bin/npx',
    args: [],
    env: [],
    headers: [],
    enabled: false,
    ...overrides,
  };
}

/** A directory handle with one sidecar folder, enough for the store to read and write. */
function fakeVault(seed?: string, rootPath?: string) {
  const files = new Map<string, string>();
  if (seed !== undefined) files.set('.ontology-atlas/connectors.json', seed);
  const directories = new Set<string>(seed === undefined ? [] : ['.ontology-atlas']);
  const handle = {
    ...(rootPath ? { rootPath } : {}),
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      if (!directories.has(name)) {
        if (!options?.create) throw new DOMException('not found', 'NotFoundError');
        directories.add(name);
      }
      return {
        getFileHandle: async (fileName: string, fileOptions?: { create?: boolean }) => {
          const path = `${name}/${fileName}`;
          if (!files.has(path) && !fileOptions?.create) {
            throw new DOMException('not found', 'NotFoundError');
          }
          return {
            getFile: async () => ({ text: async () => files.get(path)! }),
            createWritable: async () => {
              let text = '';
              return {
                write: async (chunk: string) => {
                  text += chunk;
                },
                close: async () => {
                  files.set(path, text);
                },
              };
            },
          };
        },
      };
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, files };
}

describe('useVaultConnectors', () => {
  it('reports no folder rather than an empty list', async () => {
    // "No vault open" is not "nothing attached": an empty list would invite adding to a file with
    // no home.
    const { result } = renderHook(() => useVaultConnectors(null));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.connectors).toEqual([]);
  });

  it('reads what the vault already holds, and keeps a connector off until it is switched on', async () => {
    const vault = fakeVault(
      JSON.stringify({
        version: 1,
        connectors: [{ ...record(), enabled: false }],
      }),
    );
    const { result } = renderHook(() => useVaultConnectors(vault.handle));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.connectors.map((c) => [c.name, c.enabled])).toEqual([['notion', false]]);

    await act(async () => {
      await result.current.setEnabled('c1', true);
    });
    expect(result.current.connectors[0]?.enabled).toBe(true);
    // The folder is the source of truth, so the change is on disk before the screen shows it.
    expect(vault.files.get('.ontology-atlas/connectors.json')).toContain('"enabled": true');
  });

  it('says a file it cannot read is malformed, and does not overwrite it', async () => {
    const vault = fakeVault('{ not our file');
    const { result } = renderHook(() => useVaultConnectors(vault.handle));
    await waitFor(() => expect(result.current.status).toBe('malformed'));
    let write: Awaited<ReturnType<VaultConnectorsState['upsert']>> = null;
    await act(async () => {
      write = await result.current.upsert(record());
    });
    expect(write).toMatchObject({ status: 'blocked_malformed' });
    expect(vault.files.get('.ontology-atlas/connectors.json')).toBe('{ not our file');
  });

  it('refuses a save that would put a credential in the folder, and says which variable', async () => {
    const vault = fakeVault();
    const { result } = renderHook(() => useVaultConnectors(vault.handle));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let write: Awaited<ReturnType<VaultConnectorsState['upsert']>> = null;
    await act(async () => {
      write = await result.current.upsert(
        record({ env: [{ name: 'NOTION_TOKEN', value: 'ntn_live_value' }] }),
      );
    });
    expect(write).toMatchObject({ status: 'blocked_secret', keys: ['notion.NOTION_TOKEN'] });
    expect(vault.files.get('.ontology-atlas/connectors.json')).toBeUndefined();
  });

  it('names a plaintext token the file already held, without carrying its value', async () => {
    const vault = fakeVault(
      JSON.stringify({
        version: 1,
        connectors: [{ ...record(), env: [{ name: 'NOTION_TOKEN', value: 'ntn_live_value' }] }],
      }),
    );
    const { result } = renderHook(() => useVaultConnectors(vault.handle));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.secretLiteralKeys).toEqual(['notion.NOTION_TOKEN']);
    expect(JSON.stringify(result.current.connectors)).not.toContain('ntn_live_value');
  });

  it('attaches nothing a cloned folder switched on until this Mac allows it, and asks again when it changes', async () => {
    const shared = (command: string) =>
      JSON.stringify({ version: 1, connectors: [{ ...record({ command }), enabled: true }] });
    const vault = fakeVault(shared('/opt/homebrew/bin/npx'), '/Users/probe/cloned');
    const { result } = renderHook(() => useVaultConnectors(vault.handle));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.connectors[0]?.enabled).toBe(true);
    expect(connectorAcpServers(result.current.connectors, 'claude-acp', result.current.allowedHere)).toEqual([]);
    expect([...result.current.waitingHere]).toEqual(['c1']);

    act(() => {
      result.current.allowHere('c1');
    });
    expect(connectorAcpServers(result.current.connectors, 'claude-acp', result.current.allowedHere)).toEqual([
      expect.objectContaining({ name: 'notion', command: '/opt/homebrew/bin/npx' }),
    ]);
    expect(result.current.waitingHere.size).toBe(0);

    vault.files.set('.ontology-atlas/connectors.json', shared('/tmp/other-program'));
    await act(async () => {
      await result.current.reload();
    });
    expect(connectorAcpServers(result.current.connectors, 'claude-acp', result.current.allowedHere)).toEqual([]);
    expect([...result.current.waitingHere]).toEqual(['c1']);
  });

  it('removes a connector from the folder', async () => {
    const vault = fakeVault(JSON.stringify({ version: 1, connectors: [record()] }));
    const { result } = renderHook(() => useVaultConnectors(vault.handle));
    await waitFor(() => expect(result.current.connectors).toHaveLength(1));
    await act(async () => {
      await result.current.remove('c1');
    });
    expect(result.current.connectors).toHaveLength(0);
  });
});

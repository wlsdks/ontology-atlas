import { describe, expect, it } from 'vitest';

import type { ConnectorRecord } from './connector-record';
import type { ConnectorReadResult, ConnectorWriteResult } from './connector-store';
import {
  CONNECTORS_RELATIVE_PATH,
  CONNECTORS_VAULT_FILE,
  createConnectorStore,
  createMemoryConnectorStore,
  createVaultFileConnectorStore,
  enabledConnectors,
} from './connector-store';
import { VAULT_SIDECAR_DIR } from './vault-sidecar';

function record(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return {
    id: 'c1',
    name: 'notion',
    transport: 'stdio',
    command: '/opt/homebrew/bin/npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' }],
    headers: [],
    enabled: false,
    ...overrides,
  };
}

function createFakeVaultHandle(options: { readOnly?: boolean } = {}) {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const assertWritable = () => {
    if (options.readOnly) throw new DOMException('not allowed', 'NotAllowedError');
  };
  const fileHandle = (path: string) => ({
    getFile: async () => {
      if (!files.has(path)) throw new DOMException('not found', 'NotFoundError');
      return { text: async () => files.get(path)! };
    },
    createWritable: async () => {
      assertWritable();
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
  });
  const handle = {
    getDirectoryHandle: async (name: string, dirOptions?: { create?: boolean }) => {
      if (!directories.has(name)) {
        if (!dirOptions?.create) throw new DOMException('not found', 'NotFoundError');
        assertWritable();
        directories.add(name);
      }
      return {
        getFileHandle: async (fileName: string, fileOptions?: { create?: boolean }) => {
          const path = `${name}/${fileName}`;
          if (!files.has(path) && !fileOptions?.create) {
            throw new DOMException('not found', 'NotFoundError');
          }
          if (fileOptions?.create) assertWritable();
          return fileHandle(path);
        },
      };
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, files, directories };
}

describe('connector store', () => {
  it('starts empty when nothing has been attached yet', async () => {
    const store = createMemoryConnectorStore();
    const read: ConnectorReadResult = await store.read();
    expect(read).toEqual({ status: 'missing', connectors: [], secretLiteralKeys: [] });
  });

  it('saves and reads back a connector, still off', async () => {
    const store = createMemoryConnectorStore();
    const saved: ConnectorWriteResult = await store.save([record()]);
    expect(saved.status).toBe('saved');
    const read = await store.read();
    expect(read.connectors[0]?.name).toBe('notion');
    // Writing a connector down is not turning it on. Nothing reaches a session until somebody
    // flips the switch themselves.
    expect(read.connectors[0]?.enabled).toBe(false);
  });

  it('refuses to write a credential-shaped literal and names the variable', async () => {
    const store = createMemoryConnectorStore();
    const result = await store.save([
      record({ env: [{ name: 'NOTION_TOKEN', value: 'ntn_live_value' }] }),
    ]);
    expect(result).toMatchObject({
      status: 'blocked_secret',
      keys: ['notion.NOTION_TOKEN'],
    });
    // …and nothing landed: a refused save leaves the previous file untouched.
    expect((await store.read()).status).toBe('missing');
  });

  it('never overwrites a file it could not read', async () => {
    // The file may hold connectors somebody spent time on, or a newer format from a later
    // build. Replacing it with what this build has in memory turns "could not read" into
    // "deleted".
    const store = createMemoryConnectorStore('{ this is not our file');
    const result = await store.save([record()]);
    expect(result.status).toBe('blocked_malformed');
  });

  it('toggles one connector without disturbing its neighbour', async () => {
    const store = createMemoryConnectorStore();
    await store.save([record(), record({ id: 'c2', name: 'github' })]);
    await store.setEnabled('c2', true);
    const read = await store.read();
    expect(read.connectors.map((c) => [c.name, c.enabled])).toEqual([
      ['notion', false],
      ['github', true],
    ]);
    expect(enabledConnectors(read.connectors).map((c) => c.name)).toEqual(['github']);
  });

  it('upserts by id and removes by id', async () => {
    const store = createMemoryConnectorStore();
    await store.upsert(record());
    await store.upsert(record({ name: 'notion-renamed' }));
    expect((await store.read()).connectors).toHaveLength(1);
    expect((await store.read()).connectors[0]?.name).toBe('notion-renamed');
    await store.remove('c1');
    expect((await store.read()).connectors).toHaveLength(0);
  });

  it('serializes concurrent writes so neither disappears', async () => {
    const store = createMemoryConnectorStore();
    await store.save([record()]);
    await Promise.all([
      store.upsert(record({ id: 'c2', name: 'github' })),
      store.upsert(record({ id: 'c3', name: 'linear' })),
    ]);
    expect((await store.read()).connectors.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('reports an unreadable folder rather than pretending it is empty', async () => {
    const store = createConnectorStore({
      read: async () => {
        throw new Error('permission gone');
      },
      write: async () => undefined,
    });
    expect((await store.read()).status).toBe('unavailable');
    expect((await store.save([record()])).status).toBe('blocked_unavailable');
  });

  it('writes into the vault sidecar and gives that folder its own ignore rule', async () => {
    // Somebody's vault is their own Git repository and knows nothing about this repository's
    // root ignore rule. Without the sidecar carrying one, their first `git add .` commits the
    // shape of their tooling.
    const vault = createFakeVaultHandle();
    const store = createVaultFileConnectorStore(vault.handle);
    await store.save([record()]);
    expect(CONNECTORS_RELATIVE_PATH).toBe(`${VAULT_SIDECAR_DIR}/${CONNECTORS_VAULT_FILE}`);
    expect(vault.files.get(`${VAULT_SIDECAR_DIR}/.gitignore`)).toBe(
      '# Ontology Atlas local runtime state — not for commit.\n*\n',
    );
    expect(vault.files.get(CONNECTORS_RELATIVE_PATH)).toContain('notion');
    expect(vault.files.get(CONNECTORS_RELATIVE_PATH)).toContain('connector:c1:NOTION_TOKEN');
  });

  it('leaves an ignore file the person already wrote alone', async () => {
    const vault = createFakeVaultHandle();
    vault.directories.add(VAULT_SIDECAR_DIR);
    vault.files.set(`${VAULT_SIDECAR_DIR}/.gitignore`, 'keep-me\n');
    await createVaultFileConnectorStore(vault.handle).save([record()]);
    expect(vault.files.get(`${VAULT_SIDECAR_DIR}/.gitignore`)).toBe('keep-me\n');
  });

  it('reports a folder it cannot write to instead of claiming the save worked', async () => {
    const vault = createFakeVaultHandle({ readOnly: true });
    const result = await createVaultFileConnectorStore(vault.handle).save([record()]);
    expect(result.status).toBe('write_failed');
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';

const bridge = vi.hoisted(() => ({
  discoveryAvailable: true,
  secretsAvailable: true,
  discovered: null as unknown,
  secretSets: [] as Array<{ ref: string; secret: string }>,
  stored: new Map<string, string>(),
}));

vi.mock('@/shared/lib/tauri-connectors', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-connectors')>(
    '@/shared/lib/tauri-connectors',
  );
  return {
    ...actual,
    isConnectorDiscoveryAvailable: () => bridge.discoveryAvailable,
    discoverMcpConnectors: async () => bridge.discovered,
  };
});

vi.mock('@/shared/lib/tauri-connector-secrets', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-connector-secrets')>(
    '@/shared/lib/tauri-connector-secrets',
  );
  return {
    ...actual,
    isConnectorSecretBridgeAvailable: () => bridge.secretsAvailable,
    connectorSecretStatus: async (secretRef: string) => ({
      secretRef,
      stored: bridge.stored.has(secretRef),
      last4: bridge.stored.get(secretRef) ?? null,
    }),
    connectorSecretSet: async (secretRef: string, secret: string) => {
      bridge.secretSets.push({ ref: secretRef, secret });
      bridge.stored.set(secretRef, secret.slice(-4));
      return { secretRef, stored: true, last4: secret.slice(-4) };
    },
  };
});

import { ConnectorsPanel, connectorDestination, whatRuns } from './ConnectorsPanel';

/** A folder handle backed by a map, enough for the store to read and write. */
function fakeVault(seed?: string) {
  const files = new Map<string, string>();
  if (seed !== undefined) files.set('.ontology-atlas/connectors.json', seed);
  const directories = new Set<string>(seed === undefined ? [] : ['.ontology-atlas']);
  const handle = {
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

function draw(node: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      {node}
    </NextIntlClientProvider>,
  );
}

const stdioRecord = {
  id: 'c1',
  name: 'notion',
  transport: 'stdio' as const,
  command: '/opt/homebrew/bin/npx',
  args: ['-y', '@notionhq/notion-mcp-server'],
  env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' }],
  headers: [],
  enabled: false,
};

function seeded(...connectors: unknown[]) {
  return JSON.stringify({ version: 1, connectors });
}

beforeEach(() => {
  bridge.discoveryAvailable = true;
  bridge.secretsAvailable = true;
  bridge.discovered = null;
  bridge.secretSets = [];
  bridge.stored = new Map();
});

afterEach(cleanup);

describe('연결 도구 패널 — 켜기 전에 무엇이 도는지 말한다', () => {
  it('무엇이 실제로 실행되는지, 어디로 오가는지, 어떤 기록에 안 남는지 켜기 전에 말한다', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item')).toBeInTheDocument(),
    );
    // The command and its arguments, not the friendly name — a name says nothing about
    // what will execute.
    expect(screen.getByTestId('connectors-item-runs')).toHaveTextContent(
      '/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server',
    );
    // And the ledger sentence: a reader who has met `llm-audit.jsonl` elsewhere would
    // otherwise assume it covered this traffic.
    expect(screen.getByTestId('connectors-transfer')).toHaveTextContent('llm-audit.jsonl');
    // The switch is off before anybody touches it.
    expect(screen.getByTestId('connectors-item')).toHaveAttribute(
      'data-connector-enabled',
      'false',
    );
  });

  it('켜면 폴더에 적히고, 그 전까지는 아무것도 붙지 않는다', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('connectors-item-toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item')).toHaveAttribute(
        'data-connector-enabled',
        'true',
      ),
    );
    expect(vault.files.get('.ontology-atlas/connectors.json')).toContain('"enabled": true');
  });

  it('이름이 이미 등록되어 있으면, 켜기 전에 그 사실을 말한다', async () => {
    // codex-acp drops a same-named ACP server without a word. Learning that afterwards
    // looks exactly like Atlas failing to attach anything.
    bridge.discovered = {
      connectors: [
        {
          source: 'codex-user',
          name: 'notion',
          transport: 'stdio',
          command: '/usr/bin/npx',
          args: [],
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault(seeded(stdioRecord));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-collision')).toBeInTheDocument(),
    );
  });

  it('못 도는 연결 도구는 켜지 못하게 하고 이유를 적는다', async () => {
    // A bare command finds nothing in the agent's sanitized environment, so switching it
    // on would produce a session whose tools are silently absent.
    const vault = fakeVault(seeded({ ...stdioRecord, command: 'npx' }));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-problem')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-item-toggle')).toBeDisabled();
  });

  it('토큰은 키체인으로 보내고 입력란에서 지운다', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-secret-missing')).toBeInTheDocument(),
    );
    const input = screen.getByTestId('connectors-item-secret-input');
    fireEvent.change(input, { target: { value: 'ntn_live_value' } });
    fireEvent.click(screen.getByTestId('connectors-item-secret-save'));
    await waitFor(() =>
      expect(bridge.secretSets).toEqual([
        { ref: 'connector:c1:NOTION_TOKEN', secret: 'ntn_live_value' },
      ]),
    );
    // The field is cleared the moment it is stored — this component has no reason to keep
    // it, and there is no read path back.
    await waitFor(() => expect(input).toHaveValue(''));
    // …and the token never lands in the vault file.
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').not.toContain(
      'ntn_live_value',
    );
  });

  it('브라우저에서는 왜 못 보는지와 무엇은 되는지를 함께 말한다', async () => {
    bridge.discoveryAvailable = false;
    bridge.secretsAvailable = false;
    const vault = fakeVault(seeded(stdioRecord));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-discovery-unavailable')).toBeInTheDocument(),
    );
    // Why + where, and the list itself is still there and usable.
    expect(screen.getByTestId('connectors-web-get-app')).toHaveAttribute(
      'href',
      expect.stringContaining('/download'),
    );
    expect(screen.getByTestId('connectors-list')).toBeInTheDocument();
    expect(screen.getByTestId('connectors-item-secrets-unavailable')).toHaveTextContent(
      'NOTION_TOKEN',
    );
  });

  it('직접 추가한 연결 도구도 꺼진 채로 들어간다', async () => {
    const vault = fakeVault();
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('connectors-custom-name'), {
      target: { value: 'github' },
    });
    fireEvent.change(screen.getByTestId('connectors-custom-command'), {
      target: { value: '/usr/local/bin/github-mcp' },
    });
    fireEvent.change(screen.getByTestId('connectors-custom-keys'), {
      target: { value: 'GITHUB_TOKEN' },
    });
    fireEvent.click(screen.getByTestId('connectors-custom-add'));
    await waitFor(() => expect(screen.getByTestId('connectors-item')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-item')).toHaveAttribute(
      'data-connector-enabled',
      'false',
    );
    const written = vault.files.get('.ontology-atlas/connectors.json') ?? '';
    // The key's name is in the file and its value is not — the file holds a reference.
    expect(written).toContain('GITHUB_TOKEN');
    expect(written).toContain('secretRef');
  });

  it('설치된 앱에서는 이미 등록된 서버를 찾아 주고, 받을 수 없는 방식은 이유를 말한다', async () => {
    bridge.discovered = {
      connectors: [
        {
          source: 'claude-user',
          name: 'linear',
          transport: 'http',
          command: null,
          args: [],
          url: 'https://mcp.linear.app/mcp',
          envKeys: [],
          headerKeys: ['Authorization'],
        },
        {
          source: 'cursor-user',
          name: 'legacy',
          transport: 'sse',
          command: null,
          args: [],
          url: 'https://example.test/sse',
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault();
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(2));
    // The deprecated transport is shown and explained, never offered.
    const rows = screen.getAllByTestId('connectors-found-item');
    expect(rows[1]).toHaveAttribute('data-connector-transport', 'sse');
    expect(screen.getAllByTestId('connectors-found-add')).toHaveLength(1);
  });
});

describe('what runs, in one line', () => {
  it('joins a command with its arguments, and gives a URL back whole', () => {
    expect(whatRuns(stdioRecord)).toBe(
      '/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server',
    );
    expect(
      whatRuns({ ...stdioRecord, transport: 'http', url: 'https://mcp.linear.app/mcp' }),
    ).toBe('https://mcp.linear.app/mcp');
  });

  it('names the host an address connector talks to', () => {
    expect(
      connectorDestination({
        ...stdioRecord,
        transport: 'http',
        url: 'https://mcp.linear.app/mcp',
      }),
    ).toBe('mcp.linear.app');
    // A half-typed address is echoed rather than blanked: an empty destination in that
    // sentence would say the traffic goes nowhere.
    expect(connectorDestination({ ...stdioRecord, transport: 'http', url: 'not a url' })).toBe(
      'not a url',
    );
  });
});

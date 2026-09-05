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
  secretDeletes: [] as string[],
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
    connectorSecretDelete: async (secretRef: string) => {
      bridge.secretDeletes.push(secretRef);
      bridge.stored.delete(secretRef);
      window.dispatchEvent(new Event('ontology-atlas:connector-secret-change'));
      return { secretRef, stored: false, last4: null };
    },
    connectorSecretSet: async (secretRef: string, secret: string) => {
      bridge.secretSets.push({ ref: secretRef, secret });
      bridge.stored.set(secretRef, secret.slice(-4));
      // The real bridge announces this so a panel mounted elsewhere re-asks the keychain rather
      // than showing a stale "not stored". The stand-in has to announce it too, or the test
      // would be measuring a screen the product never renders.
      window.dispatchEvent(new Event('ontology-atlas:connector-secret-change'));
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
  bridge.secretDeletes = [];
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

  it('키체인에 값이 없는 동안에는 켜지 못한다 — 자격 증명 없이 붙어 멀쩡해 보이는 일이 없게', async () => {
    /*
     * The failure this whole per-variable choice exists to prevent: the connector attaches, the
     * agent lists its tools, and every call is refused by a service that has no idea why.
     */
    const vault = fakeVault(seeded(stdioRecord));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeDisabled());
    expect(screen.getByTestId('connectors-item-problem')).toBeInTheDocument();

    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    fireEvent.change(screen.getByTestId('connectors-item-secret-input'), {
      target: { value: 'ntn_live_value' },
    });
    fireEvent.click(screen.getByTestId('connectors-item-secret-save'));
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeEnabled());
  });

  it('이름이 자격 증명처럼 안 보여도 키체인을 고를 수 있다', async () => {
    /*
     * Measured 2026-09-05. `OPENAPI_MCP_HEADERS` is the variable Notion's own MCP server
     * documents and it carries `Bearer ntn_…`. A name-only rule offered no field for it at all,
     * so the connector attached with its credential absent.
     */
    const vault = fakeVault(
      seeded({ ...stdioRecord, env: [{ name: 'OPENAPI_MCP_HEADERS' }] }),
    );
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable')).toHaveAttribute(
        'data-variable-keychain',
        'false',
      ),
    );
    fireEvent.click(screen.getByTestId('connectors-item-variable-keychain'));
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable')).toHaveAttribute(
        'data-variable-keychain',
        'true',
      ),
    );
    // The file now holds a reference to the keychain, and a field to type the value appears.
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').toContain(
      'connector:c1:OPENAPI_MCP_HEADERS',
    );
    expect(screen.getByTestId('connectors-item-secret-input')).toBeInTheDocument();
  });

  it('자격 증명이 아닌 변수의 값은 폴더 안 파일에 그대로 적힌다', async () => {
    // Forcing a version pin into a keychain would make somebody re-enter it per machine, and a
    // rule people route around stops protecting anything.
    const vault = fakeVault(seeded({ ...stdioRecord, env: [{ name: 'NOTION_VERSION' }] }));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable-value')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId('connectors-item-variable-value'), {
      target: { value: '2022-06-28' },
    });
    await waitFor(() =>
      expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').toContain('2022-06-28'),
    );
  });

  it('키체인을 끈 자격 증명 이름에는 적을 칸을 주지 않고 이유를 말한다', async () => {
    // The writer refuses a literal under this name, so a box would be somewhere to type
    // something that is then thrown away.
    const vault = fakeVault(seeded({ ...stdioRecord, env: [{ name: 'NOTION_TOKEN' }] }));
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable-refused')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('connectors-item-variable-value')).toBeNull();
  });

  it('연결 도구를 지우면 그것이 가리키던 토큰도 이 컴퓨터에서 지운다', async () => {
    /*
     * Measured in the installed app on 2026-09-05: removing a connector took the row out of
     * connectors.json and left the keychain item behind, so `security find-generic-password`
     * still listed it. A token nobody can see any more, on a machine somebody hands on.
     */
    const vault = fakeVault(
      seeded({
        ...stdioRecord,
        env: [
          { name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' },
          { name: 'OPENAPI_MCP_HEADERS', secretRef: 'connector:c1:OPENAPI_MCP_HEADERS' },
          { name: 'NOTION_VERSION', value: '2022-06-28' },
        ],
      }),
    );
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    bridge.stored.set('connector:c1:OPENAPI_MCP_HEADERS', 'ders');
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-remove')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('connectors-item-remove'));

    // Every reference the record carried, and only those - the plain value has nothing to forget.
    await waitFor(() =>
      expect([...bridge.secretDeletes].sort()).toEqual([
        'connector:c1:NOTION_TOKEN',
        'connector:c1:OPENAPI_MCP_HEADERS',
      ]),
    );
    // …and a read afterwards says absent, which is what the person was promised.
    expect(bridge.stored.size).toBe(0);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    expect(vault.files.get('.ontology-atlas/connectors.json') ?? '').not.toContain('notion');
  });

  it('키체인 선택을 끄면 그 변수의 값도 이 컴퓨터에서 지운다', async () => {
    // Turning the choice off is the person saying this value should not be on this machine.
    // Dropping only the reference would leave the value with nothing on screen pointing at it.
    const vault = fakeVault(seeded(stdioRecord));
    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    draw(<ConnectorsPanel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable-keychain')).toBeChecked(),
    );
    fireEvent.click(screen.getByTestId('connectors-item-variable-keychain'));
    await waitFor(() => expect(bridge.secretDeletes).toEqual(['connector:c1:NOTION_TOKEN']));
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-variable')).toHaveAttribute(
        'data-variable-keychain',
        'false',
      ),
    );
    expect(bridge.stored.size).toBe(0);
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
    // …and the choice itself cannot be made where there is no keychain to make it about.
    expect(screen.getByTestId('connectors-item-variable-keychain')).toBeDisabled();
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

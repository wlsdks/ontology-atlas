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

import {
  ConnectorsPanel,
  connectorDestination,
  groupDiscovered,
  shortSourceKey,
  whatRuns,
} from './ConnectorsPanel';
import { useVaultConnectors } from '../model/use-vault-connectors';

/**
 * **The list state is owned by the caller** (2026-09-05). The `/mcp` tab strip states how many
 * connectors are switched on, and that number and the panel's rows have to come from one read —
 * a second `useVaultConnectors` would never hear about the first one's writes. So the panel
 * takes the state as a prop, and the harness plays the caller.
 */
function Panel({ handle }: { handle: FileSystemDirectoryHandle }) {
  const store = useVaultConnectors(handle);
  return <ConnectorsPanel handle={handle} store={store} />;
}

/**
 * **Two things left the row on 2026-09-05** and the tests follow them rather than dropping.
 *
 * A row now carries the service mark, the name, what runs, the switch, and one more-actions
 * button; a connector's variables, keychain fields and removal live in that button's dialog, and
 * everything about *adding* lives in the "Add a connector" dialog. The owner's report was that the
 * previous panel - list, machine scan, and a five-field form all open at once - was hard to look
 * at, and the assertions below say the same things they said before, one press further in.
 */
function openDetail() {
  fireEvent.click(screen.getByTestId('connectors-item-menu'));
}

function openAdd() {
  fireEvent.click(screen.getByTestId('connectors-add-open'));
}

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
    draw(<Panel handle={vault.handle} />);
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
    draw(<Panel handle={vault.handle} />);
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-collision')).toBeInTheDocument(),
    );
  });

  it('못 도는 연결 도구는 켜지 못하게 하고 이유를 적는다', async () => {
    // A bare command finds nothing in the agent's sanitized environment, so switching it
    // on would produce a session whose tools are silently absent.
    const vault = fakeVault(seeded({ ...stdioRecord, command: 'npx' }));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-problem')).toBeInTheDocument());
    expect(screen.getByTestId('connectors-item-toggle')).toBeDisabled();
  });

  it('토큰은 키체인으로 보내고 입력란에서 지운다', async () => {
    const vault = fakeVault(seeded(stdioRecord));
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-item-secret-missing')).toBeInTheDocument(),
    );
    openDetail();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-toggle')).toBeDisabled());
    // The reason the switch will not move stays in the row - a disabled control whose reason is
    // one press away is a control with no reason at all.
    expect(screen.getByTestId('connectors-item-problem')).toBeInTheDocument();

    bridge.stored.set('connector:c1:NOTION_TOKEN', 'alue');
    openDetail();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
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
     *
     * ⚠️ Removal moved into the row's own dialog on the same day, so the press is one step
     * further in. What is asserted is unchanged: every reference the record carried is forgotten,
     * and only those.
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-item-menu')).toBeInTheDocument());
    openDetail();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-list')).toBeInTheDocument());
    /*
     * ⚠️ **The card moved into the add dialog on 2026-09-05**, because finding what is already
     * registered is what happens there. The claim is unchanged and so is the check: a reason and a
     * place to go, beside a list that still works.
     */
    openAdd();
    await waitFor(() =>
      expect(screen.getByTestId('connectors-discovery-unavailable')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('connectors-web-get-app')).toHaveAttribute(
      'href',
      expect.stringContaining('/download'),
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    openDetail();
    expect(screen.getByTestId('connectors-item-secrets-unavailable')).toHaveTextContent(
      'NOTION_TOKEN',
    );
    // …and the choice itself cannot be made where there is no keychain to make it about.
    expect(screen.getByTestId('connectors-item-variable-keychain')).toBeDisabled();
  });

  it('직접 추가한 연결 도구도 꺼진 채로 들어간다', async () => {
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-empty')).toBeInTheDocument());
    openAdd();
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
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(2));
    // The deprecated transport is shown and explained, never offered.
    const rows = screen.getAllByTestId('connectors-found-item');
    expect(rows[1]).toHaveAttribute('data-connector-transport', 'sse');
    expect(screen.getAllByTestId('connectors-found-add')).toHaveLength(1);
  });

  it('같은 것이 여러 파일에 등록돼 있어도 줄은 하나다 — 어디서 찾았는지는 함께 적는다', async () => {
    /*
     * Anyone who set up two coding tools has byte-identical entries in both config files. Drawing
     * one row per file offers the same command twice, and choosing between identical rows teaches
     * nothing. Measured on this machine on 2026-09-05: three of the registered servers appeared in
     * two files each.
     */
    bridge.discovered = {
      connectors: [
        {
          source: 'claude-user',
          name: 'notion',
          transport: 'stdio',
          command: '/opt/homebrew/bin/npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          envKeys: [],
          headerKeys: [],
        },
        {
          source: 'codex-user',
          // A different spelling of the same registration. The name is the part a person was free
          // to invent, so it cannot be what decides whether two entries are the same server.
          name: 'notion-mcp',
          transport: 'stdio',
          command: '/opt/homebrew/bin/npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(1));
    expect(screen.getByTestId('connectors-found-item')).toHaveAttribute(
      'data-connector-sources',
      'claude-user codex-user',
    );
    // Both tools are named, once each.
    expect(screen.getAllByTestId('connectors-found-source').map((el) => el.textContent)).toEqual([
      'claude',
      'codex',
    ]);
  });

  it('찾기로 목록을 좁힌다 — 이름으로도, 명령으로도', async () => {
    bridge.discovered = {
      connectors: [
        {
          source: 'claude-user',
          name: 'notion',
          transport: 'stdio',
          command: '/opt/homebrew/bin/npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          envKeys: [],
          headerKeys: [],
        },
        {
          source: 'claude-user',
          name: 'linear',
          transport: 'http',
          command: null,
          args: [],
          url: 'https://mcp.linear.app/mcp',
          envKeys: [],
          headerKeys: [],
        },
      ],
      sources: [],
    };
    const vault = fakeVault();
    draw(<Panel handle={vault.handle} />);
    await waitFor(() => expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument());
    openAdd();
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(2));

    // By name.
    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'linear' } });
    await waitFor(() => expect(screen.getAllByTestId('connectors-found-item')).toHaveLength(1));

    // …and by what actually runs, which is what somebody remembers about a server they set up
    // months ago and renamed since.
    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'notionhq' } });
    await waitFor(() =>
      expect(screen.getByTestId('connectors-found-item')).toHaveTextContent('notion'),
    );

    fireEvent.change(screen.getByTestId('connectors-search'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByTestId('connectors-found-empty')).toBeInTheDocument());
  });
});

describe('one row per thing that actually runs', () => {
  const base = {
    transport: 'stdio' as const,
    command: '/usr/bin/npx',
    args: ['-y', 'pkg'],
    url: null,
    envKeys: [],
    headerKeys: [],
  };

  it('collapses identical transport, command and arguments across files', () => {
    const groups = groupDiscovered([
      { ...base, source: 'claude-user', name: 'a' },
      { ...base, source: 'codex-user', name: 'b' },
      { ...base, source: 'claude-user', name: 'c' },
    ]);
    expect(groups).toHaveLength(1);
    // The first spelling seen wins the row.
    expect(groups[0].server.name).toBe('a');
    // A file that reported it twice is still one chip.
    expect(groups[0].sources).toEqual(['claude-user', 'codex-user']);
  });

  it('keeps a different command apart, and never merges across transports', () => {
    const groups = groupDiscovered([
      { ...base, source: 'claude-user', name: 'a' },
      { ...base, source: 'claude-user', name: 'a', args: ['-y', 'other'] },
      {
        source: 'claude-user',
        name: 'a',
        transport: 'http' as const,
        command: null,
        args: [],
        url: 'https://example.test/mcp',
        envKeys: [],
        headerKeys: [],
      },
    ]);
    expect(groups).toHaveLength(3);
  });

  it('reduces a source id to the tool a person recognises', () => {
    expect(shortSourceKey('claude-user')).toBe('claude');
    expect(shortSourceKey('claude-project')).toBe('claude');
    expect(shortSourceKey('codex-user')).toBe('codex');
    expect(shortSourceKey('cursor-user')).toBe('cursor');
    expect(shortSourceKey('vault-mcp-json')).toBe('folder');
    expect(shortSourceKey('something-new')).toBe('other');
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

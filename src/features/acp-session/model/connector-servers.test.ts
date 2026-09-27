import { describe, expect, it } from 'vitest';

import { connectorProblems, type ConnectorRecord } from '@/shared/lib/connector-record';
import { ACP_SECRET_REF_KEY } from '@/shared/lib/tauri-connector-secrets';

import {
  connectorAcpServers,
  connectorSecretRefs,
  connectorsWithProblems,
} from './connector-servers';
import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';

function stdio(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return {
    id: 'c1',
    name: 'notion',
    transport: 'stdio',
    command: '/opt/homebrew/bin/npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' }],
    headers: [],
    enabled: true,
    ...overrides,
  };
}

function http(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return {
    id: 'c2',
    name: 'linear',
    transport: 'http',
    args: [],
    url: 'https://mcp.linear.app/mcp',
    env: [],
    headers: [{ name: 'Authorization', secretRef: 'connector:c2:Authorization' }],
    enabled: true,
    ...overrides,
  };
}

/** The one runtime measured to raise a permission request for an MCP child's every call. */
const CLAUDE = 'claude-acp';
const allowedEverywhere = () => true;
const allowing = (...ids: string[]) => (connector: ConnectorRecord) => ids.includes(connector.id);

describe('connector servers', () => {
  it('hands nothing to a runtime whose permission path was never measured', () => {
    // The screen promises every call stops at a permission card. That promise is only true on a
    // runtime measured to raise one, so an unmeasured one gets none of them rather than a
    // sentence it cannot keep. `connector-runtime-narrowing.contract.test.ts` pins the pair.
    expect(connectorAcpServers([stdio()], 'codex-acp', allowedEverywhere)).toEqual([]);
    expect(connectorAcpServers([stdio()], null, allowedEverywhere)).toEqual([]);
  });

  it('hands nothing the folder switched on that this Mac has not allowed', () => {
    expect(connectorAcpServers([stdio(), http()], CLAUDE, allowing())).toEqual([]);
    expect(connectorAcpServers([stdio(), http()], CLAUDE, allowing('c2'))).toEqual([
      expect.objectContaining({ name: 'linear' }),
    ]);
    expect(connectorsWithProblems([stdio()], allowing())).toEqual([
      { connector: stdio(), reason: 'not-allowed-here' },
    ]);
    expect(connectorSecretRefs([stdio()], allowing())).toEqual([]);
  });

  it('builds the stdio shape the ACP handshake takes, with a reference where the token goes', () => {
    expect(connectorAcpServers([stdio()], CLAUDE, allowedEverywhere)).toEqual([
      {
        name: 'notion',
        command: '/opt/homebrew/bin/npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: [{ name: 'NOTION_TOKEN', [ACP_SECRET_REF_KEY]: 'connector:c1:NOTION_TOKEN' }],
      },
    ]);
  });

  it('builds the http shape with its type field, which is what both adapters key off', () => {
    expect(connectorAcpServers([http()], CLAUDE, allowedEverywhere)).toEqual([
      {
        type: 'http',
        name: 'linear',
        url: 'https://mcp.linear.app/mcp',
        headers: [{ name: 'Authorization', [ACP_SECRET_REF_KEY]: 'connector:c2:Authorization' }],
      },
    ]);
  });

  it('sends nothing for a connector that is off', () => {
    // Default off is the promise; this is where it becomes true rather than merely stated.
    expect(connectorAcpServers([stdio({ enabled: false })], CLAUDE, allowedEverywhere)).toEqual([]);
  });

  it('refuses a connector that would shadow the vault server', () => {
    // claude-agent-acp lets an ACP-supplied server override a same-named caller one, so a
    // connector under this name would quietly replace the person's own map.
    const shadow = stdio({
      id: 'c9',
      name: VAULT_MCP_SERVER_NAME,
      env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c9:NOTION_TOKEN' }],
    });
    expect(connectorAcpServers([shadow], CLAUDE, allowedEverywhere)).toEqual([]);
    expect(connectorsWithProblems([shadow], allowedEverywhere)).toEqual([
      { connector: shadow, reason: 'name-taken' },
    ]);
  });

  it('sends neither of two connectors sharing a name, and names both', () => {
    // Picking one would be picking for the person: two entries called `notion` say nothing about
    // which one they meant, and the agent's tool list would hold the name once with no sign that
    // the other exists. Both are refused and both are reported.
    const first = stdio();
    const second = stdio({ id: 'c3', env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c3:NOTION_TOKEN' }] });
    expect(connectorAcpServers([first, second], CLAUDE, allowedEverywhere)).toEqual([]);
    expect(connectorsWithProblems([first, second], allowedEverywhere)).toEqual([
      { connector: first, reason: 'invalid' },
      { connector: second, reason: 'invalid' },
    ]);
  });

  it('leaves out a connector that cannot work, and names it rather than dropping it silently', () => {
    // A bare command resolves to nothing in the agent's sanitized environment, so the session
    // would come up with that server's tools absent — which reads exactly like Atlas failing.
    const bare = stdio({ command: 'npx' });
    expect(connectorAcpServers([bare], CLAUDE, allowedEverywhere)).toEqual([]);
    expect(connectorsWithProblems([bare], allowedEverywhere)).toEqual([
      { connector: bare, reason: 'invalid' },
    ]);
  });

  it('does not attach a connector still waiting on a token to move into the keychain', () => {
    // The file held a plaintext token, so the value was dropped on read and there is nothing to
    // send. Attaching it with the variable absent — or worse, set to an empty string — gives the
    // agent a tool that fails on every call for a reason nothing states.
    const pending = stdio({ env: [{ name: 'NOTION_TOKEN', secretLiteral: true }] });
    expect(connectorAcpServers([pending], CLAUDE, allowedEverywhere)).toEqual([]);
    expect(connectorsWithProblems([pending], allowedEverywhere)).toEqual([
      { connector: pending, reason: 'invalid' },
    ]);
  });

  it('lists the references a session will need, so presence is checked before it opens', () => {
    expect(connectorSecretRefs([stdio(), http()], allowedEverywhere)).toEqual([
      'connector:c1:NOTION_TOKEN',
      'connector:c2:Authorization',
    ]);
    // A connector that is not going to be attached is not asked about.
    expect(connectorSecretRefs([stdio({ enabled: false })], allowedEverywhere)).toEqual([]);
  });

  it('leaves out a connector that names another connector’s keychain entry, and says why', () => {
    const borrower = stdio({ env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c2:Authorization' }] });
    expect(connectorAcpServers([borrower, http()], CLAUDE, allowing('c1', 'c2'))).toEqual([
      expect.objectContaining({ name: 'linear' }),
    ]);
    expect(JSON.stringify(connectorAcpServers([borrower], CLAUDE, allowing('c1')))).not.toContain('connector:c2');
    expect(connectorProblems(borrower)).toContain('secret-ref-foreign');
  });

  it('passes a value that is not a credential straight through', () => {
    const servers = connectorAcpServers(
      [stdio({ env: [{ name: 'NOTION_VERSION', value: '2022-06-28' }] })],
      CLAUDE,
      allowedEverywhere,
    );
    expect(servers[0]).toMatchObject({ env: [{ name: 'NOTION_VERSION', value: '2022-06-28' }] });
  });
});

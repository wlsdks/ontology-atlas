import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_STORE_VERSION,
  CONNECTOR_TRANSPORTS,
  ConnectorSecretLiteralError,
  type ConnectorRecord,
  type ConnectorTransport,
  type ConnectorValueEntry,
  connectorProblems,
  deserializeConnectorState,
  looksLikeSecretKey,
  serializeConnectorState,
} from './connector-record';

function stdio(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return {
    id: 'c1',
    name: 'notion',
    transport: 'stdio',
    command: '/opt/homebrew/bin/npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: [],
    headers: [],
    enabled: false,
    ...overrides,
  };
}

describe('connector record', () => {
  it('can only store a transport an ACP session actually carries', () => {
    // SSE is deprecated and neither measured adapter accepts it. Storing one would let
    // somebody switch on a connector whose tools never appear.
    expect(CONNECTOR_TRANSPORTS).toEqual(['stdio', 'http']);
    const transports: ConnectorTransport[] = [...CONNECTOR_TRANSPORTS];
    expect(transports).not.toContain('sse');
  });

  it('lets an entry hold a reference, a plain value, or neither — never a secret value', () => {
    const entries: ConnectorValueEntry[] = [
      { name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' },
      { name: 'NOTION_VERSION', value: '2022-06-28' },
      { name: 'PLACEHOLDER' },
    ];
    expect(() => serializeConnectorState({ connectors: [stdio({ env: entries })] })).not.toThrow();
  });

  it('refuses to serialize a credential-shaped literal', () => {
    // The whole reason the file can live in the vault folder. The refusal sits in the
    // serializer because that is the only place records become bytes.
    const state = {
      connectors: [stdio({ env: [{ name: 'NOTION_TOKEN', value: 'ntn_live_value' }] })],
    };
    expect(() => serializeConnectorState(state)).toThrow(ConnectorSecretLiteralError);
    try {
      serializeConnectorState(state);
    } catch (error) {
      // The error names the variable, never the value — an error message is a string that
      // ends up in logs and screenshots.
      expect(String(error)).toContain('notion.NOTION_TOKEN');
      expect(String(error)).not.toContain('ntn_live_value');
    }
  });

  it('writes a keychain reference instead, and the reference is not the secret', () => {
    const text = serializeConnectorState({
      connectors: [
        stdio({ env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' }] }),
      ],
    });
    expect(JSON.parse(text).version).toBe(CONNECTOR_STORE_VERSION);
    expect(text).toContain('connector:c1:NOTION_TOKEN');
    expect(text).not.toContain('value');
  });

  it('still stores a value that is plainly not a credential', () => {
    // A rule people route around stops protecting anything. A version pin does not belong in
    // a keychain, and forcing it there would teach somebody to keep the whole file elsewhere.
    const text = serializeConnectorState({
      connectors: [stdio({ env: [{ name: 'NOTION_VERSION', value: '2022-06-28' }] })],
    });
    expect(text).toContain('2022-06-28');
  });

  it('names the credential shapes it refuses and the ones it lets through', () => {
    for (const name of [
      'NOTION_TOKEN',
      'GITHUB_API_KEY',
      'OPENAI_KEY',
      'Authorization',
      'MY_SECRET',
      'DB_PASSWORD',
      'x-api-key',
    ]) {
      expect(looksLikeSecretKey(name), name).toBe(true);
    }
    for (const name of ['NOTION_VERSION', 'Content-Type', 'LOG_LEVEL', 'HOME']) {
      expect(looksLikeSecretKey(name), name).toBe(false);
    }
  });

  it('does not carry a hand-written plaintext token into memory', () => {
    // Somebody pastes a token into the file. Reading it back must not put the value into the
    // program, and the screen still has to be able to say which variable it was.
    const parsed = deserializeConnectorState(
      JSON.stringify({
        version: 1,
        connectors: [
          {
            id: 'c1',
            name: 'notion',
            transport: 'stdio',
            command: '/usr/bin/npx',
            args: [],
            env: [{ name: 'NOTION_TOKEN', value: 'ntn_live_value' }],
            headers: [],
            enabled: true,
          },
        ],
      }),
    );
    expect(parsed.secretLiteralKeys).toEqual(['notion.NOTION_TOKEN']);
    expect(parsed.connectors[0]?.env[0]).toEqual({ name: 'NOTION_TOKEN', secretLiteral: true });
    expect(JSON.stringify(parsed)).not.toContain('ntn_live_value');
    // …and the next save writes the entry without the literal, so the file gets cleaner.
    expect(serializeConnectorState({ connectors: parsed.connectors })).not.toContain(
      'ntn_live_value',
    );
  });

  it('treats a missing enabled flag as off', () => {
    // Default off is a promise. A connector that switches itself on because a field went
    // missing is the one behaviour that promise cannot survive.
    const parsed = deserializeConnectorState(
      JSON.stringify({
        version: 1,
        connectors: [
          { id: 'c1', name: 'n', transport: 'http', url: 'https://x.test/mcp', env: [], headers: [] },
        ],
      }),
    );
    expect(parsed.connectors[0]?.enabled).toBe(false);
  });

  it('reports a file that is not ours as malformed rather than empty', () => {
    expect(deserializeConnectorState('nonsense').malformed).toBe(true);
    expect(deserializeConnectorState('[]').malformed).toBe(true);
    expect(deserializeConnectorState(JSON.stringify({ version: 99, connectors: [] })).malformed).toBe(
      true,
    );
  });

  it('flags a bare command, because the agent it is spawned from has no PATH', () => {
    // `SHARED_RUNTIME_ENV` in `src-tauri/src/acp.rs` hands the agent a sanitized environment
    // with no PATH, and the connector inherits it. A bare `npx` resolves to nothing and the
    // session comes up with that server's tools silently absent.
    expect(connectorProblems(stdio({ command: 'npx' }))).toContain('command-not-absolute');
    expect(connectorProblems(stdio())).toEqual([]);
  });

  it('names the other ways a record cannot work', () => {
    expect(connectorProblems(stdio({ name: '  ' }))).toContain('name-empty');
    expect(connectorProblems(stdio({ command: '' }))).toContain('command-missing');
    const http: ConnectorRecord = {
      id: 'c2',
      name: 'linear',
      transport: 'http',
      args: [],
      env: [],
      headers: [],
      enabled: false,
    };
    expect(connectorProblems(http)).toContain('url-missing');
    expect(connectorProblems({ ...http, url: 'ftp://x.test' })).toContain('url-not-http');
    expect(connectorProblems(stdio({ id: 'c3' }), [stdio()])).toContain('name-not-unique');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { connectorAcpServers } from '@/features/acp-session/model/runtime-wiring/connector-servers';
import { runtimeCarriesConnectors } from '@/features/acp-session/model/runtime-wiring/runtime-gate';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';
import { vaultMcpServers } from '@/features/acp-session/model/runtime-wiring/vault-mcp-server';

/**
 * A connector rides only a runtime measured to raise `session/request_permission` for an MCP
 * child. An unmeasured runtime gets the vault server only, decided by the set `runtime-gate.ts`
 * already keeps.
 */

const connector: ConnectorRecord = {
  id: 'c1',
  name: 'notion',
  transport: 'stdio',
  command: '/opt/homebrew/bin/npx',
  args: ['-y', '@notionhq/notion-mcp-server'],
  env: [],
  headers: [],
  enabled: true,
};

const launch = { kind: 'app-bundled' as const, command: '/app/ontology-atlas-mcp', args: [] };
const allowedEverywhere = () => true;

describe('connectors reach only a measured runtime', () => {
  it('gives a Codex session the vault server and nothing else', () => {
    expect(runtimeCarriesConnectors('codex-acp')).toBe(false);
    expect(connectorAcpServers([connector], 'codex-acp', allowedEverywhere)).toEqual([]);
    const servers = [
      ...vaultMcpServers(launch, '/vault'),
      ...connectorAcpServers([connector], 'codex-acp', allowedEverywhere),
    ];
    expect(servers.map((server) => (server as { name: string }).name)).toEqual(['atlas-vault']);
  });

  it('gives a Claude session the vault server and the connector', () => {
    expect(runtimeCarriesConnectors('claude-acp')).toBe(true);
    const servers = [
      ...vaultMcpServers(launch, '/vault'),
      ...connectorAcpServers([connector], 'claude-acp', allowedEverywhere),
    ];
    expect(servers.map((server) => (server as { name: string }).name)).toEqual([
      'atlas-vault',
      'notion',
    ]);
  });

  it('treats an unknown or absent runtime the same as an unmeasured one', () => {
    // A call site that forgets to pass a runtime attaches nothing rather than attaching blind.
    expect(connectorAcpServers([connector], undefined, allowedEverywhere)).toEqual([]);
    expect(connectorAcpServers([connector], null, allowedEverywhere)).toEqual([]);
    expect(connectorAcpServers([connector], 'some-future-adapter', allowedEverywhere)).toEqual([]);
  });

  it('decides from the table runtime-gate already keeps, not a second list', () => {
    // Two lists drift, and the one that drifts looser is the one a person meets.
    const source = readFileSync(
      join(process.cwd(), 'src/features/acp-session/model/runtime-wiring/runtime-gate.ts'),
      'utf-8',
    );
    const sets = source.match(/new Set\(\[/g) ?? [];
    expect(sets).toHaveLength(1);
    expect(source).toContain('CONFIG_ISOLATED_RUNTIMES.has(runtimeId)');
  });

  it('says on screen which runtime carries them', () => {
    // A narrowing nobody is told about reads as the feature being broken.
    for (const locale of ['en', 'ko']) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf-8'),
      ) as { connectors?: Record<string, unknown> };
      expect(typeof messages.connectors?.runtimeNarrowing).toBe('string');
      expect(String(messages.connectors?.runtimeNarrowing)).toMatch(/Claude/);
      expect(String(messages.connectors?.runtimeNarrowing)).toMatch(/Codex/);
    }
  });
});

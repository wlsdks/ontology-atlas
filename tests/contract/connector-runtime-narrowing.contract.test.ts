import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { connectorAcpServers } from '@/features/acp-session/model/connector-servers';
import { runtimeCarriesConnectors } from '@/features/acp-session/model/runtime-gate';
import type { ConnectorRecord } from '@/shared/lib/connector-record';
import { vaultMcpServers } from '@/features/acp-session/model/vault-mcp-server';

/**
 * **A connector rides only a runtime whose permission path was measured.**
 *
 * The promise this screen makes is that every call an external server makes stops at a
 * permission card first. That is true where the runtime's own configuration raises a
 * `session/request_permission` for an MCP child, and only Claude's isolated configuration has
 * been measured to do it. Codex was measured **not** to for our own server (installed app,
 * 2026-08-24: a self-registered `add_relation` changed the vault with no request and no card),
 * and nobody has measured what it does with somebody else's.
 *
 * So the sentence and the wiring have to agree, and they are written in different files by
 * different people. This pins them together: an unmeasured runtime receives the vault server and
 * nothing else, and the set that decides it is the one `runtime-gate.ts` already keeps rather
 * than a second hand-maintained list.
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

describe('connectors reach only a measured runtime', () => {
  it('gives a Codex session the vault server and nothing else', () => {
    expect(runtimeCarriesConnectors('codex-acp')).toBe(false);
    expect(connectorAcpServers([connector], 'codex-acp')).toEqual([]);
    const servers = [
      ...vaultMcpServers(launch, '/vault'),
      ...connectorAcpServers([connector], 'codex-acp'),
    ];
    expect(servers.map((server) => (server as { name: string }).name)).toEqual(['atlas-vault']);
  });

  it('gives a Claude session the vault server and the connector', () => {
    expect(runtimeCarriesConnectors('claude-acp')).toBe(true);
    const servers = [
      ...vaultMcpServers(launch, '/vault'),
      ...connectorAcpServers([connector], 'claude-acp'),
    ];
    expect(servers.map((server) => (server as { name: string }).name)).toEqual([
      'atlas-vault',
      'notion',
    ]);
  });

  it('treats an unknown or absent runtime the same as an unmeasured one', () => {
    // A call site that forgets to pass a runtime attaches nothing rather than attaching blind.
    expect(connectorAcpServers([connector])).toEqual([]);
    expect(connectorAcpServers([connector], null)).toEqual([]);
    expect(connectorAcpServers([connector], 'some-future-adapter')).toEqual([]);
  });

  it('decides from the table runtime-gate already keeps, not a second list', () => {
    // Two lists drift, and the one that drifts looser is the one a person meets.
    const source = readFileSync(
      join(process.cwd(), 'src/features/acp-session/model/runtime-gate.ts'),
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

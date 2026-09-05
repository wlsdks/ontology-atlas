import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ConnectorSecretLiteralError,
  type ConnectorRecord,
  serializeConnectorState,
} from '@/shared/lib/connector-record';
import {
  CONNECTORS_RELATIVE_PATH,
  createMemoryConnectorStore,
} from '@/shared/lib/connector-store';

/**
 * A connector's environment is where its API token goes, and `connectors.json` lives inside the
 * person's vault — a folder that syncs, backs up, and gets committed. Three separate things have to
 * agree for a token to stay off disk, and none of them can see the other two:
 *
 * 1. the serializer refuses to write a credential-shaped literal;
 * 2. the store surfaces that refusal instead of swallowing it;
 * 3. the file's folder is ignored by Git, in this repository and in the person's own vault.
 *
 * Any one of them alone is a rule somebody can walk around, so they are pinned together. `git
 * check-ignore` is used rather than a `.gitignore` string match, because what protects the file is
 * Git's own answer and not a line that looks like it should work.
 */

const repoRoot = process.cwd();

function gitIgnores(path: string): boolean {
  const result = spawnSync('git', ['check-ignore', '-q', path], { cwd: repoRoot });
  return result.status === 0;
}

function connector(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
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

describe('a connector secret never reaches the vault folder', () => {
  it('keeps the connectors file inside a folder Git ignores', () => {
    expect(gitIgnores(CONNECTORS_RELATIVE_PATH)).toBe(true);
    expect(gitIgnores('docs/ontology/.ontology-atlas/connectors.json')).toBe(true);
    // The rule is the folder, not this one filename — a later sidecar file inherits it.
    expect(gitIgnores('.ontology-atlas/anything-later.json')).toBe(true);
    // Sanity: the probe can say no, so a green result above means something.
    expect(gitIgnores('README.md')).toBe(false);
  });

  it('states the folder rule in the repository ignore file, for a human reading it', () => {
    const ignore = readFileSync(join(repoRoot, '.gitignore'), 'utf-8');
    expect(ignore).toContain('.ontology-atlas/');
  });

  it('refuses every credential-shaped variable, in env and in headers alike', () => {
    for (const name of ['NOTION_TOKEN', 'GITHUB_API_KEY', 'MY_SECRET', 'DB_PASSWORD']) {
      expect(() =>
        serializeConnectorState({
          connectors: [connector({ env: [{ name, value: 'live-value' }] })],
        }),
      ).toThrow(ConnectorSecretLiteralError);
    }
    expect(() =>
      serializeConnectorState({
        connectors: [
          connector({
            transport: 'http',
            url: 'https://mcp.linear.app/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer live-value' }],
          }),
        ],
      }),
    ).toThrow(ConnectorSecretLiteralError);
  });

  it('surfaces the refusal through the store rather than swallowing it', async () => {
    const store = createMemoryConnectorStore();
    const result = await store.save([
      connector({ env: [{ name: 'NOTION_TOKEN', value: 'ntn_live_value' }] }),
    ]);
    expect(result).toMatchObject({
      status: 'blocked_secret',
      keys: ['notion.NOTION_TOKEN'],
    });
  });

  it('lets a keychain reference through, because that is the path that must stay open', () => {
    // A refusal with no alternative is how somebody ends up keeping the whole file elsewhere.
    const text = serializeConnectorState({
      connectors: [
        connector({ env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:c1:NOTION_TOKEN' }] }),
      ],
    });
    expect(text).toContain('connector:c1:NOTION_TOKEN');
  });
});

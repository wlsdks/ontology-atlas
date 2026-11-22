import { describe, expect, it } from 'vitest';

import type { CatalogueEntry, CatalogueVariant } from '@/shared/config/mcp/mcp-catalogue';
import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import { pressOutcome, primaryVariant, secretsFromAnswers } from './catalogue-variant';

const remote: CatalogueVariant = {
  kind: 'remote',
  transport: 'http',
  url: 'https://mcp.example.com/mcp',
  auth: 'oauth',
  headers: [],
  source: 'curated',
};
const remoteToken: CatalogueVariant = {
  ...remote,
  url: 'https://mcp.example.com/token',
  auth: 'token',
  headers: [{ name: 'Authorization', secret: true, required: true }],
};
const local: CatalogueVariant = {
  kind: 'local',
  transport: 'stdio',
  runtime: 'npx',
  packageId: 'example-mcp',
  version: '1.0.0',
  args: ['-y', 'example-mcp'],
  env: [],
  source: 'registry',
};

function entry(...variants: CatalogueVariant[]): CatalogueEntry {
  return {
    id: 'example',
    name: 'example',
    title: 'Example',
    summary: '',
    docsUrl: 'https://example.com/docs',
    verifiedAt: '2026-01-01',
    registryName: null,
    registryChecked: false,
    variants,
  };
}

describe('primaryVariant and pressOutcome', () => {
  it('prefers the hosted address, and one press attaches it only when it asks for nothing', () => {
    const both = entry(local, remote);
    expect(primaryVariant(both)).toBe(remote);
    expect(pressOutcome(both, remote)).toBe('attaches');
    expect(pressOutcome(both, local)).toBe('asks');
  });

  it('asks when the primary needs a value, and falls back to the first variant', () => {
    const tokenFirst = entry(remoteToken, local);
    expect(pressOutcome(tokenFirst, remoteToken)).toBe('asks');
    expect(primaryVariant(entry(local))).toBe(local);
  });
});

describe('secretsFromAnswers', () => {
  const record: ConnectorRecord = {
    id: 'c1',
    name: 'example',
    transport: 'http',
    url: 'https://mcp.example.com/token',
    args: [],
    env: [{ name: 'IGNORED', secretRef: 'connector:c1:IGNORED' }],
    headers: [
      { name: 'Authorization', secretRef: 'connector:c1:Authorization' },
      { name: 'Blank', secretRef: 'connector:c1:Blank' },
      { name: 'X-Team', value: 'plain' },
    ],
    enabled: false,
  };

  it('stores only a typed value for a secret reference of the transport in use', () => {
    expect(
      secretsFromAnswers(record, {
        Authorization: ' Bearer abc ',
        Blank: '   ',
        'X-Team': 'plain',
        IGNORED: 'x',
      }),
    ).toEqual([{ ref: 'connector:c1:Authorization', value: 'Bearer abc' }]);
  });
});

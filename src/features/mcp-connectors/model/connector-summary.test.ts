import { describe, expect, it } from 'vitest';

import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import { connectorDestination, connectorPasses, whatRuns } from './connector-summary';

const stdio: ConnectorRecord = {
  id: 'a',
  name: 'notion',
  transport: 'stdio',
  command: '/opt/homebrew/bin/npx',
  args: ['-y', '@notionhq/notion-mcp-server'],
  env: [],
  headers: [],
  enabled: false,
};

const http: ConnectorRecord = {
  id: 'b',
  name: 'linear',
  transport: 'http',
  url: ' https://mcp.linear.app/mcp ',
  args: [],
  env: [],
  headers: [],
  enabled: false,
};

describe('whatRuns', () => {
  it('shows the command line for stdio and the address for http', () => {
    expect(whatRuns(stdio)).toBe('/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server');
    expect(whatRuns(http)).toBe('https://mcp.linear.app/mcp');
  });
});

describe('connectorDestination', () => {
  it('names only the host for http, so the warning says where traffic goes', () => {
    expect(connectorDestination(http)).toBe('mcp.linear.app');
  });

  it('falls back to the trimmed text when the address does not parse', () => {
    expect(connectorDestination({ ...http, url: ' not a url ' })).toBe('not a url');
  });

  it('is the command line for a local server, which reaches nothing by itself', () => {
    expect(connectorDestination(stdio)).toBe(whatRuns(stdio));
  });
});

describe('connectorPasses', () => {
  const label = (name: string) => `${name} from keychain`;

  it('names a keychain reference by label and never by anything it holds', () => {
    const passes = connectorPasses(
      { ...stdio, env: [{ name: 'NOTION_TOKEN', secretRef: 'connector:a:NOTION_TOKEN' }] },
      label,
    );
    expect(passes).toEqual(['NOTION_TOKEN from keychain']);
  });

  it('shows a literal as name=value and a bare name as itself, env before headers', () => {
    const passes = connectorPasses(
      {
        ...http,
        env: [{ name: 'REGION', value: 'eu' }],
        headers: [{ name: 'X-Team' }],
      },
      label,
    );
    expect(passes).toEqual(['REGION=eu', 'X-Team']);
  });
});

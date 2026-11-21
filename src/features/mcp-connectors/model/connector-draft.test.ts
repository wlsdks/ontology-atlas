import { describe, expect, it } from 'vitest';

import type { DiscoveredConnector } from '@/shared/lib/connectors/tauri-connectors';

import {
  buildDraftRecord,
  draftForWrite,
  prefillFromRecord,
  recordFromDiscovered,
} from './connector-draft';

const blank = {
  name: ' notion ',
  transport: 'stdio' as const,
  command: ' /opt/homebrew/bin/npx ',
  args: ' -y   @notionhq/notion-mcp-server ',
  url: 'https://ignored.example/mcp',
  variables: [],
};

describe('buildDraftRecord', () => {
  it('trims, splits arguments on whitespace and drops the other transport', () => {
    const draft = buildDraftRecord(blank);
    expect(draft).toMatchObject({
      name: 'notion',
      transport: 'stdio',
      command: '/opt/homebrew/bin/npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      headers: [],
      enabled: false,
    });
    expect(draft).not.toHaveProperty('url');
  });

  it('puts an http draft in headers with no command or arguments', () => {
    const draft = buildDraftRecord({
      ...blank,
      transport: 'http',
      url: ' https://mcp.notion.com/mcp ',
      variables: [{ name: 'X-Team', value: ' a ', secret: false }],
    });
    expect(draft).toMatchObject({
      url: 'https://mcp.notion.com/mcp',
      args: [],
      env: [],
      headers: [{ name: 'X-Team', value: 'a' }],
    });
    expect(draft).not.toHaveProperty('command');
  });

  it('keeps a typed value out of the record when the variable is a secret', () => {
    const draft = buildDraftRecord({
      ...blank,
      variables: [
        { name: 'PLAIN', value: 'visible', secret: false },
        { name: 'CHOSEN', value: 'hidden-1', secret: true },
        { name: 'NOTION_TOKEN', value: 'hidden-2', secret: false },
        { name: '  ', value: 'orphan', secret: false },
      ],
    });
    expect(draft.env).toEqual([
      { name: 'PLAIN', value: 'visible' },
      { name: 'CHOSEN', secretRef: 'connector:draft:CHOSEN' },
      { name: 'NOTION_TOKEN', secretRef: 'connector:draft:NOTION_TOKEN' },
    ]);
    expect(JSON.stringify(draft)).not.toMatch(/hidden|orphan/);
  });
});

describe('recordFromDiscovered', () => {
  const found: DiscoveredConnector = {
    name: 'notion',
    source: 'claude-code',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'notion-mcp'],
    url: null,
    envKeys: ['NOTION_TOKEN', 'REGION'],
    headerKeys: [],
  };

  it('gives a credential-shaped name a keychain reference and never a value', () => {
    const record = recordFromDiscovered(found, 'abc');
    expect(record.env).toEqual([
      { name: 'NOTION_TOKEN', secretRef: 'connector:abc:NOTION_TOKEN' },
      { name: 'REGION' },
    ]);
    expect(JSON.stringify(record)).not.toContain('"value"');
  });

  it('copies the server switched off, with where it came from', () => {
    const record = recordFromDiscovered(found, 'abc');
    expect(record.enabled).toBe(false);
    expect(record.origin).toBe('claude-code');
    expect(record.id).toBe('abc');
  });

  it('keeps the address for http, and treats any other transport as stdio', () => {
    const http = recordFromDiscovered(
      { ...found, transport: 'http', url: 'https://a.example/mcp', command: null },
      'h',
    );
    expect(http.transport).toBe('http');
    expect(http.url).toBe('https://a.example/mcp');
    expect(http.command).toBeUndefined();
    expect(recordFromDiscovered({ ...found, transport: 'sse' }, 's').transport).toBe('stdio');
  });
});

describe('draftForWrite', () => {
  it('re-keys secret references to the real id and pairs each typed value with one', () => {
    const variables = [
      { name: 'NOTION_TOKEN', value: ' ntn_x ', secret: true },
      { name: 'EMPTY_SECRET', value: '', secret: true },
      { name: 'PLAIN', value: 'v', secret: false },
    ];
    const { connector, secrets } = draftForWrite(
      buildDraftRecord({ ...blank, variables }),
      variables,
      'real-id',
    );
    expect(connector.id).toBe('real-id');
    expect(connector.env).toEqual([
      { name: 'NOTION_TOKEN', secretRef: 'connector:real-id:NOTION_TOKEN' },
      { name: 'EMPTY_SECRET', secretRef: 'connector:real-id:EMPTY_SECRET' },
      { name: 'PLAIN', value: 'v' },
    ]);
    expect(secrets).toEqual([{ ref: 'connector:real-id:NOTION_TOKEN', value: 'ntn_x' }]);
  });
});

describe('prefillFromRecord', () => {
  it('never carries a value into the form and marks references and credential names secret', () => {
    const prefill = prefillFromRecord({
      id: 'x',
      name: 'n',
      transport: 'http',
      url: 'https://a.example/mcp',
      args: [],
      env: [],
      headers: [
        { name: 'X-Ref', secretRef: 'connector:x:X-Ref' },
        { name: 'Authorization', value: 'Bearer abc' },
        { name: 'X-Team', value: 'a' },
      ],
      enabled: false,
    });
    expect(prefill.variables).toEqual([
      { name: 'X-Ref', value: '', secret: true },
      { name: 'Authorization', value: '', secret: true },
      { name: 'X-Team', value: '', secret: false },
    ]);
  });
});

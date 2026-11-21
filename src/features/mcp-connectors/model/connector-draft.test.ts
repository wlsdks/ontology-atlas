import { describe, expect, it } from 'vitest';

import { buildDraftRecord, draftForWrite, draftRuns, prefillFromRecord } from './connector-draft';

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

describe('draftRuns', () => {
  it('shows the command line for stdio and the address for http', () => {
    expect(draftRuns(buildDraftRecord(blank))).toBe(
      '/opt/homebrew/bin/npx -y @notionhq/notion-mcp-server',
    );
    expect(
      draftRuns(buildDraftRecord({ ...blank, transport: 'http', url: ' https://a.example/mcp ' })),
    ).toBe('https://a.example/mcp');
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

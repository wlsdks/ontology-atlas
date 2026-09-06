import { describe, expect, it } from 'vitest';

import { serializeConnectorState } from '@/shared/lib/connector-record';

import {
  DEFAULT_IMPORT_LIMIT,
  IMPORT_SERVICES,
  buildImportBrief,
  importConnector,
  importService,
  nextStep,
  serviceAsk,
  serviceEntry,
  serviceVariant,
} from './import-flow';

/**
 * This door's whole promise is that a person never meets the words MCP, stdio, npx or
 * environment variable, and that what happens on their computer is still exactly what the MCP
 * screen would have written. Both halves are checked here, because the second is the one that
 * would rot quietly: an easier door that writes a different kind of row is two products.
 */

const secretRef = (id: string, name: string) => `${id}:${name}`;

describe('the tiles', () => {
  it('offers a way out for a service the list does not know, and it is last', () => {
    // Without it the door is a wall for everybody whose service is not one of four.
    expect(IMPORT_SERVICES.at(-1)?.id).toBe('other');
    expect(importService('other').connect).toBe('manual');
    expect(serviceEntry(importService('other'))).toBeNull();
  });

  it('draws Confluence and Jira separately over one Atlassian connection', () => {
    /*
     * Nobody thinks "I want my Atlassian documents". One connector, two doors, and the folder
     * each lands in says which they meant.
     */
    expect(importService('confluence').catalogueId).toBe('atlassian');
    expect(importService('jira').catalogueId).toBe('atlassian');
    expect(importService('confluence').folder).not.toBe(importService('jira').folder);
  });

  it('prefers the address with nothing to type whenever the service has one', () => {
    // The hosted shape is the entire promise of this door; a local program is the fallback.
    const notion = serviceEntry(importService('notion'))!;
    const variant = serviceVariant(notion);
    expect(variant.kind).toBe('remote');
    expect(serviceAsk(importService('notion'))).toEqual({ kind: 'browser' });
  });

  it('names the one value and where it is issued when a service issues one', () => {
    /*
     * Not asserted against a particular service, because which of them is hosted may change with
     * the next capture. What must never change is that a token ask carries the page that issues
     * it — a credential with no link is the dead end this door exists to remove.
     */
    for (const service of IMPORT_SERVICES) {
      const ask = serviceAsk(service);
      if (ask.kind !== 'token') continue;
      expect(ask.name).toBeTruthy();
      expect(ask.issueUrl ?? '').toMatch(/^https:\/\//);
    }
  });
});

describe('what it writes into the folder', () => {
  it('writes the same descriptor the MCP screen would, switched on', () => {
    const record = importConnector(importService('notion'), { id: 'c1', secretRef })!;
    expect(record).toMatchObject({ transport: 'http', url: 'https://mcp.notion.com/mcp' });
    /*
     * ⚠️ **On, and this is the one path where that is right.** Everywhere else a connector
     * arrives off, because writing one down is not choosing to use it. Here the person pressed a
     * tile named after the service and a button that says bring my documents in; leaving it off
     * would mean the next step silently finds nothing.
     */
    expect(record.enabled).toBe(true);
    // And the row still says where it came from, so the folder can be read back later.
    expect(record.origin).toBe('library-import:notion');
  });

  it('never puts a credential in the folder, on any tile', () => {
    for (const service of IMPORT_SERVICES) {
      const record = importConnector(service, { id: 'c1', secretRef });
      if (!record) continue;
      // The writer is the last place a token can be stopped, and it throws rather than write one.
      const text = serializeConnectorState({ connectors: [record] });
      expect(text).not.toMatch(/ntn_|ghp_|github_pat_/);
      for (const entry of [...record.env, ...record.headers]) {
        if (entry.secretRef) expect(entry.value).toBeUndefined();
      }
    }
  });

  it('has nothing to write for the escape hatch', () => {
    expect(importConnector(importService('other'), { id: 'c1', secretRef })).toBeNull();
  });
});

describe('the brief handed to the agent turn', () => {
  const brief = buildImportBrief({
    serviceLabel: 'Notion',
    connectorName: 'notion',
    folder: 'sources/notion',
    request: { what: 'the API design pages', limit: DEFAULT_IMPORT_LIMIT },
  });

  it('names the connection, the bound, and the one folder anything may be written into', () => {
    /*
     * An unbounded "import my Notion" is a turn that reads a workspace and writes a thousand
     * files, each through a permission card nobody reads by the fiftieth. The bound is in the
     * brief rather than in a hope.
     */
    expect(brief).toContain('"notion"');
    expect(brief).toContain('at most 20');
    expect(brief).toContain('sources/notion/');
    expect(brief).toContain('the API design pages');
  });

  it('asks to be shown a list and to wait, rather than writing straight away', () => {
    expect(brief).toMatch(/ask me which to bring/i);
    expect(brief).toMatch(/Do not write anything before I answer/i);
  });

  it('forbids everything outside that folder, and the ontology by name', () => {
    expect(brief).toMatch(/Do not create, edit or delete anything outside sources\/notion\//);
    expect(brief).toMatch(/Do not modify the ontology/);
  });

  it('keeps provenance on every file it asks for', () => {
    // A source with no URL and no date is a file nobody can check against its original.
    expect(brief).toContain('source_url');
    expect(brief).toContain('fetched_at');
  });

  it('still bounds a turn when the person typed nothing', () => {
    const blank = buildImportBrief({
      serviceLabel: 'Notion',
      connectorName: 'notion',
      folder: 'sources/notion',
      request: { what: '   ', limit: 5 },
    });
    expect(blank).toContain('at most 5');
    expect(blank).toContain('the documents most worth keeping');
  });
});

describe('where the flow goes next', () => {
  it('walks pick → connect → choose → bring, and never skips the connection', () => {
    const service = importService('notion');
    expect(nextStep({ step: 'pick', service: null, connected: false, request: null })).toBe('pick');
    expect(nextStep({ step: 'pick', service, connected: false, request: null })).toBe('connect');
    expect(nextStep({ step: 'connect', service, connected: true, request: null })).toBe('choose');
    expect(
      nextStep({
        step: 'choose',
        service,
        connected: true,
        request: { what: 'x', limit: DEFAULT_IMPORT_LIMIT },
      }),
    ).toBe('bring');
  });
});

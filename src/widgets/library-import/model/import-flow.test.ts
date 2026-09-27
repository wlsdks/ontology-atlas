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
 * A person never meets the words MCP, stdio, npx or environment variable, and the row written is
 * exactly what the MCP screen would write.
 */

const secretRef = (id: string, name: string) => `${id}:${name}`;

describe('the tiles', () => {
  it('offers a way out for a service the list does not know, and it is last', () => {
    // Without it the door is a wall for everybody whose service is not one of four.
    expect(IMPORT_SERVICES.at(-1)?.id).toBe('other');
    expect(importService('other').connect).toBe('manual');
    expect(serviceEntry(importService('other'))).toBeNull();
  });

  it('offers no tile that leads to a connection the agent cannot use', () => {
    /* Every remaining tile resolves to a catalogue entry the in-app session can attach. */
    for (const service of IMPORT_SERVICES) {
      if (service.id === 'other') continue;
      expect(serviceEntry(service)).not.toBeNull();
    }
    expect(IMPORT_SERVICES.map((service) => service.id)).toEqual(['notion', 'github', 'other']);
  });

  it('asks the one token when a service is a program, and never offers a hosted sign-in', () => {
    /*
     * A tile offers a program with one token, typed once here; the in-app session cannot open a
     * sign-in window.
     */
    const notion = serviceEntry(importService('notion'))!;
    expect(serviceVariant(notion).kind).toBe('local');
    expect(serviceAsk(importService('notion'))).toMatchObject({ kind: 'token', name: 'NOTION_TOKEN' });
    for (const service of IMPORT_SERVICES) {
      expect(serviceAsk(service).kind).not.toBe('browser');
    }
  });

  it('names the one value and where it is issued when a service issues one', () => {
    /* A token ask must carry the page that issues it. */
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
    expect(record).toMatchObject({ transport: 'stdio' });
    expect(record.args.join(' ')).toContain('@notionhq/notion-mcp-server');
    expect(record.env).toEqual([{ name: 'NOTION_TOKEN', secretRef: 'c1:NOTION_TOKEN' }]);
    /*
     * Switched on, unlike other connector paths: the person asked to bring documents in, so off
     * would silently find nothing.
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
    /* The brief carries a bound so one turn cannot write a thousand files. */
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

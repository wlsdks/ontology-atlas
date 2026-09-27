import { describe, expect, it } from 'vitest';

import {
  MCP_CATALOGUE,
  MCP_CATALOGUE_CAPTURED_AT,
  catalogueDraft,
  searchCatalogue,
  variantRuns,
  variantSecrets,
  variantVariables,
  type CatalogueEntry,
} from './mcp-catalogue';
import { serializeConnectorState } from '@/shared/lib/connector-record';

/** The catalogue is hand-editable data feeding a folder write, so its shape is checked as hard as the code. */

const entryOf = (id: string): CatalogueEntry => {
  const entry = MCP_CATALOGUE.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no catalogue entry: ${id}`);
  return entry;
};

describe('the committed catalogue', () => {
  it('says how big it is and when it was captured', () => {
    // The screen states both, and a missing date would let a stale list pass as current.
    expect(MCP_CATALOGUE_CAPTURED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MCP_CATALOGUE.length).toBeGreaterThan(0);
  });

  it('carries provenance on every entry and every variant', () => {
    /*
     * A curated row is a person's transcription of a vendor page, a registry row the publisher's
     * own metadata; the screen can only draw them differently if the data tells them apart.
     */
    for (const entry of MCP_CATALOGUE) {
      expect(entry.docsUrl).toMatch(/^https:\/\//);
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.variants.length).toBeGreaterThan(0);
      for (const variant of entry.variants) {
        expect(['registry', 'curated']).toContain(variant.source);
      }
    }
  });

  it('holds no popularity, ranking or endorsement field', () => {
    // A count beside each row is a marketplace, which `.claude/rules/forbidden.md` refuses.
    const text = JSON.stringify(MCP_CATALOGUE).toLowerCase();
    for (const forbidden of ['downloads', 'stars', 'popularity', 'rating', 'recommended', 'rank']) {
      expect(text).not.toContain(`"${forbidden}"`);
    }
  });

  it('never carries a credential value, only a name and where it is issued', () => {
    for (const entry of MCP_CATALOGUE) {
      for (const variant of entry.variants) {
        for (const variable of variantVariables(variant)) {
          expect(variable).not.toHaveProperty('value');
          expect(variable).not.toHaveProperty('default');
          if (variable.issueUrl) expect(variable.issueUrl).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it('holds only what the in-app press can make work, and no hosted OAuth address', () => {
    /*
     * The in-app session cannot open an OAuth sign-in window (`scripts/build-mcp-catalogue.mjs`
     * records it), so every row is a local program with a token or an address that asks nothing.
     * The generator refuses the other shape; this pins the committed file to the same rule.
     */
    for (const entry of MCP_CATALOGUE) {
      for (const variant of entry.variants) {
        if (variant.kind === 'remote') expect(variant.auth).not.toBe('oauth');
      }
    }
    // Notion and GitHub are programs with one token each; Context7 is the address that asks
    // nothing, with a program beside it; Playwright is a program that asks nothing.
    expect(entryOf('notion').variants.map((variant) => variant.kind)).toEqual(['local']);
    expect(entryOf('github').variants.map((variant) => variant.kind)).toEqual(['local']);
    expect(entryOf('context7').variants.map((variant) => variant.kind).sort()).toEqual(['local', 'remote']);
    expect(entryOf('playwright').variants.map((variant) => variant.kind)).toEqual(['local']);
  });
});

describe('choosing an entry', () => {
  it('an address that asks nothing is the one-press case', () => {
    const context7 = entryOf('context7');
    const variant = context7.variants.find((candidate) => candidate.kind === 'remote')!;
    expect(variantSecrets(variant)).toHaveLength(0);
    const draft = catalogueDraft(context7, variant, {
      id: 'c1',
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft).toMatchObject({ transport: 'http', url: 'https://mcp.context7.com/mcp' });
    expect(draft.headers).toEqual([]);
    // Written down is not switched on.
    expect(draft.enabled).toBe(false);
  });

  it('a local entry asks for exactly one token, and it goes to the keychain, not the file', () => {
    const notion = entryOf('notion');
    const local = notion.variants.find((variant) => variant.kind === 'local')!;
    expect(variantSecrets(local).map((variable) => variable.name)).toEqual(['NOTION_TOKEN']);

    const draft = catalogueDraft(notion, local, {
      id: 'c1',
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: '/opt/homebrew/bin/npx',
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft.command).toBe('/opt/homebrew/bin/npx');
    expect(draft.env).toEqual([{ name: 'NOTION_TOKEN', secretRef: 'c1:NOTION_TOKEN' }]);
    // And the writer accepts it — a reference is exactly what may go into the folder's file.
    expect(serializeConnectorState({ connectors: [draft] })).toContain('secretRef');
    expect(serializeConnectorState({ connectors: [draft] })).not.toContain('ntn_');
  });

  it('records which entry and which capture produced the row', () => {
    // Without it, `connectors.json` cannot tell a catalogue suggestion from something typed.
    const notion = entryOf('notion');
    const draft = catalogueDraft(notion, notion.variants[0], {
      id: 'c1',
      capturedAt: '2026-09-07',
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft.origin).toBe('catalogue:notion@2026-09-07');
  });

  it('writes the bare runtime name when this machine could not resolve one, and does not guess', () => {
    // A guessed path defers the failure to the moment somebody asks a question, and
    // `connectorProblems` already has a sentence for a non-absolute command.
    const notion = entryOf('notion');
    const local = notion.variants.find((variant) => variant.kind === 'local')!;
    const draft = catalogueDraft(notion, local, {
      id: 'c1',
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: null,
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft.command).toBe('npx');
  });
});

describe('search', () => {
  it('finds a service by its name, by what it is for, and by the address itself', () => {
    expect(searchCatalogue(MCP_CATALOGUE, 'notion').map((entry) => entry.id)).toEqual(['notion']);
    expect(searchCatalogue(MCP_CATALOGUE, 'documentation').map((entry) => entry.id)).toEqual([
      'context7',
    ]);
    // Somebody who half-remembers the URL has to find it too.
    expect(searchCatalogue(MCP_CATALOGUE, 'context7.com').map((entry) => entry.id)).toEqual([
      'context7',
    ]);
    // And by the variable name, which is often the only thing written in a colleague's message.
    expect(searchCatalogue(MCP_CATALOGUE, 'GITHUB_PERSONAL').map((entry) => entry.id)).toEqual([
      'github',
    ]);
  });

  it('an empty query is every entry, in curation order', () => {
    expect(searchCatalogue(MCP_CATALOGUE, '  ').map((entry) => entry.id)).toEqual(
      MCP_CATALOGUE.map((entry) => entry.id),
    );
  });
});

describe('what one line says will run', () => {
  it('is the address for a hosted entry and the resolved command for a local one', () => {
    const remote = entryOf('context7').variants.find((variant) => variant.kind === 'remote')!;
    const local = entryOf('github').variants.find((variant) => variant.kind === 'local')!;
    expect(variantRuns(remote)).toBe('https://mcp.context7.com/mcp');
    expect(variantRuns(local, '/usr/local/bin/docker')).toContain('/usr/local/bin/docker run');
  });
});
